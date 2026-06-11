// Creates FarmStack masters (suppliers, customers, products, types) as
// TallyPrime ledgers / stock items / units, and records sync status.
import { query, queryOne, execute, nowIso } from '@/lib/db'
import { postXml } from './tallyClient'
import { parseTallyResponse } from './tallyResponseParser'
import { GST_LEDGERS } from './config'
import { gstRateLedgerName } from './tallyXmlBuilder'
import {
  ledgerMessage,
  gstLedgerMessage,
  unitMessage,
  stockItemMessage,
  stockGroupMessage,
  ledgerGroupForType,
  buildMastersEnvelope,
} from './tallyMasterBuilder'

// The GST tax ledgers the voucher builder references — CGST/SGST for local
// supply and IGST for interstate. Created idempotently so vouchers never fail
// because a tax ledger is missing.
export function gstLedgerMessages(): string[] {
  return [
    gstLedgerMessage(GST_LEDGERS.inputCgst, 'Central Tax'),
    gstLedgerMessage(GST_LEDGERS.inputSgst, 'State Tax'),
    gstLedgerMessage(GST_LEDGERS.inputIgst, 'Integrated Tax'),
    gstLedgerMessage(GST_LEDGERS.outputCgst, 'Central Tax'),
    gstLedgerMessage(GST_LEDGERS.outputSgst, 'State Tax'),
    gstLedgerMessage(GST_LEDGERS.outputIgst, 'Integrated Tax'),
  ]
}

// Rate-wise GST tax ledgers (e.g. "Input CGST @ 9%") for the given GST rates,
// so the voucher can post — and display — the rate on each tax line. Rate 0 is
// included on purpose: a 0%/exempt stock item that already exists in Tally with a
// "Based on Value" slab makes Tally reference an "Input CGST @ 0%" ledger when the
// voucher posts, so that ledger must exist or the whole voucher fails.
function gstRateLedgerMessages(
  kind: 'purchase' | 'sales',
  gstRates: number[],
): string[] {
  const messages: string[] = []
  for (const rate of gstRates) {
    if (rate < 0) continue
    const half = rate / 2
    if (kind === 'purchase') {
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.inputCgst, half), 'Central Tax'))
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.inputSgst, half), 'State Tax'))
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.inputIgst, rate), 'Integrated Tax'))
    } else {
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.outputCgst, half), 'Central Tax'))
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.outputSgst, half), 'State Tax'))
      messages.push(gstLedgerMessage(gstRateLedgerName(GST_LEDGERS.outputIgst, rate), 'Integrated Tax'))
    }
  }
  return messages
}

export type MasterKind = 'supplier' | 'customer' | 'product' | 'product_type'

const TABLE: Record<MasterKind, string> = {
  supplier: 'suppliers',
  customer: 'customers',
  product: 'products',
  product_type: 'product_types',
}

export interface MasterOutcome {
  status: 'synced' | 'failed'
  message: string
}

async function setMasterStatus(
  kind: MasterKind,
  id: string,
  o: MasterOutcome,
): Promise<void> {
  await execute(
    `UPDATE ${TABLE[kind]}
     SET tally_sync_status = ?, tally_response = ?, tally_synced_at = ?
     WHERE id = ?`,
    [o.status, o.message, o.status === 'synced' ? nowIso() : null, id],
  )
}

async function messagesForMaster(
  kind: MasterKind,
  id: string,
): Promise<{ messages: string[]; label: string } | null> {
  if (kind === 'supplier') {
    const r = await queryOne<any>('SELECT * FROM suppliers WHERE id = ?', [id])
    if (!r) return null
    const name = r.tally_ledger_name || r.name
    return {
      label: `Supplier: ${name}`,
      messages: [
        ledgerMessage(name, 'Sundry Creditors', {
          gstin: r.gstin,
          billwise: true,
          address: r.address,
          // Place of Supply is the GST state; fall back to the address state.
          state: r.place_of_supply || r.state,
          country: r.country,
          phone: r.phone,
        }),
      ],
    }
  }
  if (kind === 'customer') {
    const r = await queryOne<any>('SELECT * FROM customers WHERE id = ?', [id])
    if (!r) return null
    const name = r.tally_ledger_name || r.name
    return {
      label: `Customer: ${name}`,
      messages: [
        ledgerMessage(name, 'Sundry Debtors', {
          gstin: r.gstin,
          billwise: true,
          address: r.address,
          state: r.state,
          country: r.country,
          phone: r.phone,
        }),
      ],
    }
  }
  if (kind === 'product') {
    const r = await queryOne<any>('SELECT * FROM products WHERE id = ?', [id])
    if (!r) return null
    const unit = r.unit || 'Nos'
    const name = r.tally_stock_item_name || r.name
    // The product's category is its Tally Stock Group ("Under"). Create the
    // group first so the stock item can reference it.
    const group = String(r.product_type || '').trim()
    const messages: string[] = [unitMessage(unit)]
    if (group) messages.push(stockGroupMessage(group))
    messages.push(
      stockItemMessage(name, unit, { hsn: r.hsn_code, gstRate: Number(r.gst_rate), stockGroup: group }),
    )
    return { label: `Product: ${name}`, messages }
  }
  const r = await queryOne<any>('SELECT * FROM product_types WHERE id = ?', [id])
  if (!r) return null
  return {
    label: `Type: ${r.name}`,
    messages: [ledgerMessage(r.name, ledgerGroupForType(r.name))],
  }
}

export async function syncMasterById(
  kind: MasterKind,
  id: string,
): Promise<MasterOutcome> {
  const built = await messagesForMaster(kind, id)
  if (!built) return { status: 'failed', message: `${kind} not found` }
  try {
    const raw = await postXml(buildMastersEnvelope(built.messages))
    const parsed = parseTallyResponse(raw)
    const outcome: MasterOutcome = {
      status: parsed.success ? 'synced' : 'failed',
      message: parsed.success
        ? `${built.label} synced to Tally`
        : parsed.message,
    }
    await setMasterStatus(kind, id, outcome)
    return outcome
  } catch (err) {
    const outcome: MasterOutcome = { status: 'failed', message: (err as Error).message }
    await setMasterStatus(kind, id, outcome)
    return outcome
  }
}

export interface BulkEntry {
  kind: MasterKind | 'ledger' | 'gst'
  id?: string
  name?: string
  group?: string
  label?: string
}

export interface BulkResult {
  label: string
  status: 'synced' | 'failed'
  message: string
}

export async function syncMastersBulk(entries: BulkEntry[]): Promise<BulkResult[]> {
  const results: BulkResult[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.kind === 'gst') {
      if (seen.has('gst')) continue
      seen.add('gst')
      const label = e.label || 'GST ledgers (CGST/SGST)'
      try {
        const raw = await postXml(buildMastersEnvelope(gstLedgerMessages()))
        const parsed = parseTallyResponse(raw)
        results.push({
          label,
          status: parsed.success ? 'synced' : 'failed',
          message: parsed.success ? `${label} synced to Tally` : parsed.message,
        })
      } catch (err) {
        results.push({ label, status: 'failed', message: (err as Error).message })
      }
      continue
    }

    const key = `${e.kind}:${e.id || e.name}`
    if (seen.has(key) || (!e.id && !e.name)) continue
    seen.add(key)

    if (e.kind === 'ledger' && e.name) {
      const label = e.label || `Ledger: ${e.name}`
      try {
        const raw = await postXml(
          buildMastersEnvelope([
            ledgerMessage(e.name, e.group || ledgerGroupForType(e.name)),
          ]),
        )
        const parsed = parseTallyResponse(raw)
        results.push({
          label,
          status: parsed.success ? 'synced' : 'failed',
          message: parsed.success ? `${label} synced to Tally` : parsed.message,
        })
      } catch (err) {
        results.push({ label, status: 'failed', message: (err as Error).message })
      }
      continue
    }

    if (e.id) {
      const built = await messagesForMaster(e.kind as MasterKind, e.id)
      const outcome = await syncMasterById(e.kind as MasterKind, e.id)
      results.push({
        label: built?.label || e.label || `${e.kind}`,
        status: outcome.status,
        message: outcome.message,
      })
    }
  }
  return results
}

// Best-effort: create the masters a voucher needs before posting it.
export async function ensureMastersForVoucher(opts: {
  kind: 'purchase' | 'sales'
  partyName: string
  partyGstin?: string
  partyAddress?: string
  partyState?: string
  partyCountry?: string
  partyPhone?: string
  items: Array<{
    productName: string
    unit: string
    ledgerName: string
    hsn?: string
    gstRate?: number
    productCategory?: string
  }>
}): Promise<void> {
  const messages: string[] = []
  if (opts.partyName) {
    messages.push(
      ledgerMessage(
        opts.partyName,
        opts.kind === 'purchase' ? 'Sundry Creditors' : 'Sundry Debtors',
        {
          gstin: opts.partyGstin,
          billwise: true,
          address: opts.partyAddress,
          state: opts.partyState,
          country: opts.partyCountry,
          phone: opts.partyPhone,
        },
      ),
    )
  }
  const units = new Set<string>()
  const stock = new Set<string>()
  const ledgers = new Set<string>()
  const groups = new Set<string>()
  for (const it of opts.items) {
    const unit = it.unit || 'Nos'
    if (!units.has(unit)) {
      units.add(unit)
      messages.push(unitMessage(unit))
    }
    // Create the product's category as a Stock Group before its stock item so
    // the item is placed under it (not Primary).
    const group = String(it.productCategory || '').trim()
    if (group && !groups.has(group)) {
      groups.add(group)
      messages.push(stockGroupMessage(group))
    }
    if (it.productName && !stock.has(it.productName)) {
      stock.add(it.productName)
      messages.push(
        stockItemMessage(it.productName, unit, { hsn: it.hsn, gstRate: it.gstRate, stockGroup: group }),
      )
    }
    if (it.ledgerName && !ledgers.has(it.ledgerName)) {
      ledgers.add(it.ledgerName)
      messages.push(ledgerMessage(it.ledgerName, ledgerGroupForType(it.ledgerName)))
    }
  }
  // Always ensure GST ledgers exist (idempotent) so GST vouchers never fail.
  //
  // We ALWAYS include rate 0, so the "@ 0%" tax ledgers (Input/Output CGST/SGST/
  // IGST @ 0%) exist on every sync — not just when an item is 0%. This voucher is
  // posted in Tally "Item Invoice" mode, where Tally ALSO auto-computes GST from
  // each stock item's OWN rate configured inside Tally. If a stock item in Tally
  // is stale at 0% (e.g. created before its rate was set, since master Create
  // doesn't overwrite an existing item), Tally references "Input CGST @ 0%" and
  // the whole voucher fails with "Ledger 'Input CGST @ 0%' does not exist!". With
  // the 0% ledgers always present, that reference resolves (₹0), the voucher
  // posts, and the real tax is still carried by the explicit rate-wise entries the
  // app sends — so the error can't recur regardless of stock-item config drift.
  messages.push(...gstLedgerMessages())
  const distinctRates = [
    0,
    ...new Set(opts.items.map((it) => Number(it.gstRate || 0)).filter((r) => r > 0)),
  ]
  messages.push(...gstRateLedgerMessages(opts.kind, distinctRates))
  if (messages.length === 0) return
  try {
    const mastersXml = buildMastersEnvelope(messages)
    console.log('[FarmStack→Tally] Masters XML sent:\n' + mastersXml)
    const mastersResp = await postXml(mastersXml)
    console.log('[Tally] Masters response:\n' + mastersResp)
  } catch (err) {
    // best effort — the voucher post will surface the real problem
    console.log('[Tally] Masters sync error:', (err as Error).message)
  }
}
