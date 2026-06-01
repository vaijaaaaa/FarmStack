// Orchestrates syncing a FarmStack invoice to TallyPrime and recording the result.
import { query, queryOne, execute, nowIso } from '@/lib/db'
import { postXml } from './tallyClient'
import {
  buildPurchaseVoucherXml,
  buildSalesVoucherXml,
  type VoucherInput,
  type VoucherItem,
} from './tallyXmlBuilder'
import { validateVoucher } from './tallyValidator'
import { parseTallyResponse } from './tallyResponseParser'
import { ensureMastersForVoucher } from './tallyMasterSync'
import { getStockMap } from '@/lib/stock'

export type TallyStatus = 'not_synced' | 'pending' | 'synced' | 'failed' | 'blocked'

export interface SyncOutcome {
  status: TallyStatus
  message: string
  voucherId?: string | null
}

async function setPurchaseStatus(id: string, o: SyncOutcome): Promise<void> {
  await execute(
    `UPDATE purchase_invoices
     SET tally_sync_status = ?, tally_response = ?, tally_synced_at = ?, tally_voucher_id = ?
     WHERE id = ?`,
    [
      o.status,
      o.message,
      o.status === 'synced' ? nowIso() : null,
      o.voucherId ?? null,
      id,
    ],
  )
}

async function setSalesStatus(id: string, o: SyncOutcome): Promise<void> {
  await execute(
    `UPDATE sales_invoices
     SET tally_sync_status = ?, tally_response = ?, tally_synced_at = ?, tally_voucher_id = ?
     WHERE id = ?`,
    [
      o.status,
      o.message,
      o.status === 'synced' ? nowIso() : null,
      o.voucherId ?? null,
      id,
    ],
  )
}

async function productUnit(productId: string): Promise<string> {
  if (!productId) return ''
  const row = await queryOne<{ unit: string }>(
    'SELECT unit FROM products WHERE id = ?',
    [productId],
  )
  return row?.unit || ''
}

async function productName(productId: string): Promise<string> {
  if (!productId) return ''
  const row = await queryOne<{ name: string }>(
    'SELECT name FROM products WHERE id = ?',
    [productId],
  )
  return row?.name || ''
}

async function productHsn(productId: string): Promise<string> {
  if (!productId) return ''
  const row = await queryOne<{ hsn_code: string }>(
    'SELECT hsn_code FROM products WHERE id = ?',
    [productId],
  )
  return row?.hsn_code || ''
}

// 'interstate' => IGST; anything else (incl. blank/exempted) => local CGST+SGST.
async function productGstSupplyType(
  productId: string,
): Promise<'local' | 'interstate'> {
  if (!productId) return 'local'
  const row = await queryOne<{ gst_supply_type: string }>(
    'SELECT gst_supply_type FROM products WHERE id = ?',
    [productId],
  )
  return String(row?.gst_supply_type || '').toLowerCase() === 'interstate'
    ? 'interstate'
    : 'local'
}

export async function syncPurchaseInvoice(id: string): Promise<SyncOutcome> {
  const inv = await queryOne<Record<string, any>>(
    'SELECT * FROM purchase_invoices WHERE id = ?',
    [id],
  )
  if (!inv) return { status: 'failed', message: 'Purchase invoice not found' }

  const items = await query<Record<string, any>>(
    'SELECT * FROM purchase_items WHERE invoice_id = ?',
    [id],
  )

  const voucherItems: VoucherItem[] = []
  for (const it of items) {
    const pid = String(it.product_id)
    // Taxable amount for a purchase line is quantity * buying price.
    const unit = (await productUnit(pid)) || ''
    voucherItems.push({
      productName: String(it.product_name || ''),
      unit,
      quantity: Number(it.quantity || 0),
      rate: Number(it.buying_price || 0),
      baseAmount: Number(it.quantity || 0) * Number(it.buying_price || 0),
      ledgerName: String(it.type || ''),
      taxPercent: Number(it.tax || 0),
      gstSupplyType: await productGstSupplyType(pid),
      batch: it.batch ? String(it.batch) : undefined,
      expiryDate: it.expiry_date ? String(it.expiry_date) : undefined,
    })
  }

  const input: VoucherInput = {
    // The Purchase Date on the form IS the Tally voucher date. No fallback —
    // an empty/served-as-today date is rejected by Tally with a confusing error.
    date: String(inv.purchase_date || ''),
    partyLedger: String(inv.supplier_name || ''),
    reference: String(inv.supplier_invoice_number || ''),
    narration: `FarmStack purchase from ${inv.supplier_name || ''}`,
    items: voucherItems,
  }

  const errors = validateVoucher('purchase', input)
  if (errors.length > 0) {
    const outcome: SyncOutcome = { status: 'failed', message: errors.join('; ') }
    await setPurchaseStatus(id, outcome)
    return outcome
  }

  try {
    const sup = await queryOne<{
      gstin: string
      address: string
      state: string
      country: string
      place_of_supply: string
      phone: string
    }>(
      'SELECT gstin, address, state, country, place_of_supply, phone FROM suppliers WHERE id = ?',
      [String(inv.supplier_id || '')],
    )
    await ensureMastersForVoucher({
      kind: 'purchase',
      partyName: input.partyLedger,
      partyGstin: sup?.gstin,
      partyAddress: sup?.address,
      // Place of Supply is the GST state; fall back to the address state.
      partyState: sup?.place_of_supply || sup?.state,
      partyCountry: sup?.country,
      partyPhone: sup?.phone,
      items: await Promise.all(
        voucherItems.map(async (it, i) => ({
          productName: it.productName,
          unit: it.unit,
          ledgerName: it.ledgerName,
          hsn: await productHsn(String(items[i]?.product_id || '')),
          gstRate: it.taxPercent,
        })),
      ),
    })
    const xml = buildPurchaseVoucherXml(input)
    console.log('[FarmStack→Tally] Purchase voucher XML sent:\n' + xml)
    const raw = await postXml(xml)
    console.log('[Tally] Purchase voucher response:\n' + raw)
    const parsed = parseTallyResponse(raw)
    const outcome: SyncOutcome = {
      status: parsed.success ? 'synced' : 'failed',
      message: parsed.message,
      voucherId: parsed.voucherId,
    }
    await setPurchaseStatus(id, outcome)
    return outcome
  } catch (err) {
    const outcome: SyncOutcome = { status: 'failed', message: (err as Error).message }
    await setPurchaseStatus(id, outcome)
    return outcome
  }
}

// Business rule: a product can only be sold to Tally if it was purchased with a
// Tally-synced purchase. Otherwise the stock never reached Tally => block.
async function findBlockedProduct(productIds: string[]): Promise<string | null> {
  for (const pid of productIds) {
    if (!pid) continue
    const synced = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM purchase_items pit
       JOIN purchase_invoices pi ON pi.id = pit.invoice_id
       WHERE pit.product_id = ? AND pi.tally_sync_status = 'synced'`,
      [pid],
    )
    if (!synced || synced.c === 0) return pid
  }
  return null
}

export async function syncSalesInvoice(id: string): Promise<SyncOutcome> {
  const inv = await queryOne<Record<string, any>>(
    'SELECT * FROM sales_invoices WHERE id = ?',
    [id],
  )
  if (!inv) return { status: 'failed', message: 'Sales invoice not found' }

  const items = await query<Record<string, any>>(
    'SELECT * FROM sales_items WHERE invoice_id = ?',
    [id],
  )

  const blockedPid = await findBlockedProduct(items.map((it) => String(it.product_id)))
  if (blockedPid) {
    const name = (await productName(blockedPid)) || 'a product'
    const outcome: SyncOutcome = {
      status: 'blocked',
      message: `Sale cannot be synced because "${name}" was purchased without Tally sync, so its stock/batch does not exist in Tally.`,
    }
    await setSalesStatus(id, outcome)
    return outcome
  }

  // Never sync a sale that exceeds available stock. Exclude this invoice's own
  // sold quantity so re-syncing a saved sale validates against everything else.
  const stock = await getStockMap(id)
  const requestedByProduct = new Map<string, number>()
  for (const it of items) {
    const pid = String(it.product_id || '')
    requestedByProduct.set(pid, (requestedByProduct.get(pid) || 0) + Number(it.quantity || 0))
  }
  for (const [pid, requested] of requestedByProduct) {
    const available = stock.get(pid)?.available ?? 0
    if (requested > available) {
      const name = (await productName(pid)) || 'a product'
      const outcome: SyncOutcome = {
        status: 'failed',
        message: `Insufficient stock for ${name}. Available: ${available}, Requested: ${requested}. Sale not sent to Tally.`,
      }
      await setSalesStatus(id, outcome)
      return outcome
    }
  }

  const voucherItems: VoucherItem[] = []
  for (const it of items) {
    const pid = String(it.product_id)
    const name = (await productName(pid)) || ''
    const unit = String(it.unit || '') || (await productUnit(pid)) || ''
    // Tally receives the TALLY PRICE (set on the purchase), NOT the customer
    // selling price. The app keeps showing selling-price figures to the user;
    // only the amount sent to Tally uses tally_price * quantity (+ GST).
    const tallyRate = Number(it.tally_price || 0)
    voucherItems.push({
      productName: name,
      unit,
      quantity: Number(it.quantity || 0),
      rate: tallyRate,
      baseAmount: Number(it.quantity || 0) * tallyRate,
      ledgerName: String(it.type || ''),
      taxPercent: Number(it.gst || 0),
      gstSupplyType: await productGstSupplyType(pid),
      batch: it.batch ? String(it.batch) : undefined,
    })
  }

  const input: VoucherInput = {
    // The Sale Date on the form IS the Tally voucher date (no fallback).
    date: String(inv.date || ''),
    partyLedger: String(inv.tally_name || inv.customer_name || ''),
    voucherNumber: String(inv.invoice_number || ''),
    reference: String(inv.invoice_number || ''),
    narration: `FarmStack sale to ${inv.customer_name || ''}`,
    items: voucherItems,
    ewayBillNo: inv.eway_bill_no || undefined,
    ewayBillDate: inv.eway_bill_date || undefined,
    dispatchFrom: inv.dispatch_from || undefined,
    shipTo: inv.ship_to || undefined,
    transporterName: inv.transporter_name || undefined,
    vehicleNumber: inv.vehicle_number || undefined,
  }

  const errors = validateVoucher('sales', input)
  if (errors.length > 0) {
    const outcome: SyncOutcome = { status: 'failed', message: errors.join('; ') }
    await setSalesStatus(id, outcome)
    return outcome
  }

  try {
    const cust = await queryOne<{
      name: string
      gstin: string
      address: string
      state: string
      country: string
      phone: string
    }>(
      'SELECT name, gstin, address, state, country, phone FROM customers WHERE id = ?',
      [String(inv.customer_id || '')],
    )
    // Only attach customer mailing/GST details when the Tally party ledger is
    // actually this customer (not a Cash sale posted under the Cash ledger).
    const partyIsCustomer =
      !!cust && input.partyLedger.trim().toLowerCase() === String(cust.name || '').trim().toLowerCase()
    await ensureMastersForVoucher({
      kind: 'sales',
      partyName: input.partyLedger,
      partyGstin: partyIsCustomer ? cust?.gstin : undefined,
      partyAddress: partyIsCustomer ? cust?.address : undefined,
      partyState: partyIsCustomer ? cust?.state : undefined,
      partyCountry: partyIsCustomer ? cust?.country : undefined,
      partyPhone: partyIsCustomer ? cust?.phone : undefined,
      items: await Promise.all(
        voucherItems.map(async (it, i) => ({
          productName: it.productName,
          unit: it.unit,
          ledgerName: it.ledgerName,
          hsn: await productHsn(String(items[i]?.product_id || '')),
          gstRate: it.taxPercent,
        })),
      ),
    })
    const xml = buildSalesVoucherXml(input)
    console.log('[FarmStack→Tally] Sales voucher XML sent:\n' + xml)
    const raw = await postXml(xml)
    console.log('[Tally] Sales voucher response:\n' + raw)
    const parsed = parseTallyResponse(raw)
    const outcome: SyncOutcome = {
      status: parsed.success ? 'synced' : 'failed',
      message: parsed.message,
      voucherId: parsed.voucherId,
    }
    await setSalesStatus(id, outcome)
    return outcome
  } catch (err) {
    const outcome: SyncOutcome = { status: 'failed', message: (err as Error).message }
    await setSalesStatus(id, outcome)
    return outcome
  }
}
