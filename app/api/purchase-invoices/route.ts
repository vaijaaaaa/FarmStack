import { NextResponse } from 'next/server'
import { query, execute, transaction, newId, nowIso } from '@/lib/db'
import { syncPurchaseInvoice } from '@/lib/tally/tallySyncService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PurchaseItemInput {
  product_id?: string
  product_name?: string
  quantity?: number | string
  buying_price?: number | string
  selling_price?: number | string
  tally_price?: number | string
  expiry_date?: string
  type?: string
  tax?: number | string
  total_price?: number | string
}

// History is rendered as one row per item, so GET returns a flattened list.
export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT pi.id            AS id,
              pi.supplier_id    AS supplier_id,
              pi.supplier_name  AS supplier_name,
              pi.supplier_invoice_number AS supplier_invoice_number,
              pi.purchase_date  AS purchase_date,
              pi.status         AS status,
              pi.created_at     AS created_at,
              pi.tally_sync_enabled AS tally_sync_enabled,
              pi.tally_sync_status  AS tally_sync_status,
              pi.tally_response     AS tally_response,
              pi.tally_synced_at    AS tally_synced_at,
              pi.tally_voucher_id   AS tally_voucher_id,
              it.product_name   AS product_name,
              it.product_id     AS product_id,
              it.quantity       AS quantity,
              it.buying_price   AS buying_price,
              it.selling_price  AS selling_price,
              it.tally_price    AS tally_price,
              it.expiry_date    AS expiry_date,
              it.type           AS type,
              it.tax            AS tax,
              it.total_price    AS total_price
       FROM purchase_items it
       JOIN purchase_invoices pi ON pi.id = it.invoice_id
       ORDER BY pi.created_at`,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supplierId = String(body.supplier_id ?? '').trim()
    const supplierInvoiceNumber = String(body.supplier_invoice_number ?? '').trim()
    const items: PurchaseItemInput[] = Array.isArray(body.items) ? body.items : []
    const tallySyncEnabled = Boolean(body.tally_status ?? body.tally_sync_enabled)

    if (!supplierId) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    }
    if (!supplierInvoiceNumber) {
      return NextResponse.json(
        { error: 'Supplier invoice number is required' },
        { status: 400 },
      )
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const id = newId()
    const createdAt = nowIso()
    const builtItems = items.map((it) => {
      const quantity = Number(it.quantity ?? 0)
      const buyingPrice = Number(it.buying_price ?? 0)
      const tax = Number(it.tax ?? 0)
      const totalPrice =
        it.total_price != null
          ? Number(it.total_price)
          : quantity * buyingPrice * (1 + tax / 100)
      return {
        id: newId(),
        product_id: String(it.product_id ?? ''),
        product_name: String(it.product_name ?? ''),
        quantity,
        buying_price: buyingPrice,
        selling_price: Number(it.selling_price ?? 0),
        tally_price: Number(it.tally_price ?? 0),
        expiry_date: String(it.expiry_date ?? ''),
        type: String(it.type ?? ''),
        tax,
        total_price: totalPrice,
      }
    })
    const invalidItem = builtItems.find(
      (it) => !it.product_id || it.quantity <= 0 || it.buying_price <= 0,
    )
    if (invalidItem) {
      return NextResponse.json(
        { error: 'Each purchase item must have a product, quantity, and buying price greater than 0' },
        { status: 400 },
      )
    }
    const total = builtItems.reduce((sum, it) => sum + it.total_price, 0)
    const initialStatus = tallySyncEnabled ? 'pending' : 'not_synced'

    await transaction((run) => {
      run(
        `INSERT INTO purchase_invoices
          (id, supplier_id, supplier_name, supplier_invoice_number, purchase_date,
           tally_status, total, status, tally_sync_enabled, tally_sync_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          supplierId,
          String(body.supplier_name ?? ''),
          supplierInvoiceNumber,
          String(body.purchase_date ?? ''),
          tallySyncEnabled ? 1 : 0,
          total,
          String(body.status ?? 'saved'),
          tallySyncEnabled ? 1 : 0,
          initialStatus,
          createdAt,
        ],
      )
      for (const it of builtItems) {
        run(
          `INSERT INTO purchase_items
            (id, invoice_id, product_id, product_name, quantity, buying_price,
             selling_price, tally_price, expiry_date, type, tax, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            it.id,
            id,
            it.product_id,
            it.product_name,
            it.quantity,
            it.buying_price,
            it.selling_price,
            it.tally_price,
            it.expiry_date,
            it.type,
            it.tax,
            it.total_price,
          ],
        )
      }
    })

    let tally: { status: string; message: string } | undefined
    if (tallySyncEnabled) {
      const outcome = await syncPurchaseInvoice(id)
      tally = { status: outcome.status, message: outcome.message }
    }

    return NextResponse.json({ id, total, items: builtItems, tally }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Update a purchase's date (used to fix a voucher date Tally rejected).
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    const date = String(body.date ?? body.purchase_date ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Invoice id is required' }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    await execute('UPDATE purchase_invoices SET purchase_date = ? WHERE id = ?', [date, id])
    return NextResponse.json({ id, date })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
