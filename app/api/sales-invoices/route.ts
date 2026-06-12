import { NextResponse, after } from 'next/server'
import { query, execute, transaction, newId, nowIso } from '@/lib/db'
import { syncSalesInvoice } from '@/lib/tally/tallySyncService'
import { setTallyUrlForRequest, currentTallyUrl, runWithTallyUrl } from '@/lib/tally/tallyContext'
import { getStockMap } from '@/lib/stock'
import { activeSeasonForCustomer } from '@/lib/accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SalesItemInput {
  product_id: string
  batch?: string
  quantity?: number | string
  rate?: number | string
  tally_price?: number | string
  gst?: number | string
  type?: string
  unit?: string
}

export async function GET() {
  try {
    // Run both reads in parallel — one network round-trip instead of two.
    const [invoices, items] = await Promise.all([
      query<Record<string, unknown>>('SELECT * FROM sales_invoices ORDER BY created_at DESC'),
      query<Record<string, unknown>>('SELECT * FROM sales_items'),
    ])
    const byInvoice = new Map<string, unknown[]>()
    for (const it of items) {
      const key = String(it.invoice_id)
      if (!byInvoice.has(key)) byInvoice.set(key, [])
      byInvoice.get(key)!.push(it)
    }
    return NextResponse.json(
      invoices.map((inv) => ({ ...inv, items: byInvoice.get(String(inv.id)) ?? [] })),
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  setTallyUrlForRequest(request)
  try {
    const body = await request.json()
    const customerId = String(body.customer_id ?? '').trim()
    const items: SalesItemInput[] = Array.isArray(body.items) ? body.items : []
    const saleType = String(body.sale_type ?? 'cash').toLowerCase() === 'credit' ? 'credit' : 'cash'

    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const builtItems = items.map((it) => ({
      id: newId(),
      product_id: String(it.product_id ?? ''),
      batch: String(it.batch ?? ''),
      quantity: Number(it.quantity ?? 0),
      rate: Number(it.rate ?? 0),
      tally_price: Number(it.tally_price ?? it.rate ?? 0),
      gst: Number(it.gst ?? 0),
      type: String(it.type ?? ''),
      unit: String(it.unit ?? ''),
    }))
    for (let i = 0; i < builtItems.length; i++) {
      const it = builtItems[i]
      const label = `Item ${i + 1}`
      if (!it.product_id) {
        return NextResponse.json({ error: `${label}: a product is required.` }, { status: 400 })
      }
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        return NextResponse.json(
          { error: `${label}: Quantity is required and must be greater than 0.` },
          { status: 400 },
        )
      }
      if (!Number.isFinite(it.rate) || it.rate <= 0) {
        return NextResponse.json(
          { error: `${label}: Selling price must be greater than 0.` },
          { status: 400 },
        )
      }
    }

    const productIds = [...new Set(builtItems.map((it) => it.product_id).filter(Boolean))]
    const pidPh = productIds.map(() => '?').join(', ')

    // All pre-save reads run in ONE parallel batch (was a serial chain of N+3
    // round-trips): invoice count, stock map, product name/unit lookups, the
    // Tally-eligibility check, and the customer's active season.
    const [countRow, stock, productRows, syncedRows, seasonId] = await Promise.all([
      query<{ c: number }>('SELECT COUNT(*) AS c FROM sales_invoices'),
      getStockMap(),
      productIds.length
        ? query<{ id: string; name: string; unit: string }>(
            `SELECT id, name, unit FROM products WHERE id IN (${pidPh})`,
            productIds,
          )
        : Promise.resolve([] as { id: string; name: string; unit: string }[]),
      productIds.length
        ? query<{ product_id: string }>(
            `SELECT DISTINCT pit.product_id
             FROM purchase_items pit
             JOIN purchase_invoices pi ON pi.id = pit.invoice_id
             WHERE pit.product_id IN (${pidPh}) AND pi.tally_sync_status = 'synced'`,
            productIds,
          )
        : Promise.resolve([] as { product_id: string }[]),
      activeSeasonForCustomer(customerId),
    ])

    const seq = (countRow[0]?.c ?? 0) + 1
    const id = newId()
    const invoiceNumber = `INV-${String(seq).padStart(3, '0')}`
    const createdAt = nowIso()

    // Stock check — a product can only be sold if purchase stock exists and is
    // enough. Requested quantity is summed per product across all items.
    const productMap = new Map(productRows.map((p) => [p.id, p]))
    const requestedByProduct = new Map<string, number>()
    for (const it of builtItems) {
      requestedByProduct.set(it.product_id, (requestedByProduct.get(it.product_id) || 0) + it.quantity)
    }
    for (const [productId, requested] of requestedByProduct) {
      const available = stock.get(productId)?.available ?? 0
      const prod = productMap.get(productId)
      const name = prod?.name || 'this product'
      const unit = prod?.unit || ''
      if (available <= 0) {
        return NextResponse.json(
          { error: `No stock available for ${name}. Please add purchase stock first.` },
          { status: 400 },
        )
      }
      if (requested > available) {
        return NextResponse.json(
          { error: `Insufficient stock for ${name}. Available: ${available} ${unit}, Requested: ${requested} ${unit}.` },
          { status: 400 },
        )
      }
    }

    const total = builtItems.reduce(
      (sum, it) => sum + it.quantity * it.rate * (1 + it.gst / 100),
      0,
    )

    // Auto-decide Tally sync: a sale is Tally-relevant only when EVERY product in
    // it has a synced purchase (so its stock already exists in Tally).
    const syncedProductIds = new Set(syncedRows.map((r) => r.product_id))
    const tallySyncEnabled =
      productIds.length > 0 && productIds.every((pid) => syncedProductIds.has(pid))
    const initialStatus = tallySyncEnabled ? 'pending' : 'not_synced'

    await transaction((run) => {
      run(
        `INSERT INTO sales_invoices
          (id, invoice_number, customer_id, customer_name, tally_name, narration, season_id, date, sale_type, total, status,
           eway_bill_no, eway_bill_date, dispatch_from, ship_to, transporter_name, transporter_id,
           transport_mode, transport_doc_no, transport_doc_date, vehicle_number, vehicle_type,
           tally_sync_enabled, tally_sync_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          invoiceNumber,
          customerId,
          String(body.customer_name ?? ''),
          String(body.tally_name ?? ''),
          String(body.narration ?? ''),
          seasonId,
          String(body.date ?? ''),
          saleType,
          total,
          String(body.status ?? 'saved'),
          body.eway_bill_no ?? null,
          body.eway_bill_date ?? null,
          body.dispatch_from ?? null,
          body.ship_to ?? null,
          body.transporter_name ?? null,
          body.transporter_id ?? null,
          body.transport_mode ?? null,
          body.transport_doc_no ?? null,
          body.transport_doc_date ?? null,
          body.vehicle_number ?? null,
          body.vehicle_type ?? null,
          tallySyncEnabled ? 1 : 0,
          initialStatus,
          createdAt,
        ],
      )
      for (const it of builtItems) {
        run(
          `INSERT INTO sales_items
            (id, invoice_id, product_id, batch, quantity, rate, tally_price, gst, type, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [it.id, id, it.product_id, it.batch, it.quantity, it.rate, it.tally_price, it.gst, it.type, it.unit],
        )
      }
    })

    // Hand the Tally sync to the background queue so the save returns instantly.
    // The invoice is already stored as `pending`; the queue updates it to
    // Push to Tally AFTER the response is sent, so the save stays instant. `after`
    // is Vercel-safe: it uses waitUntil to keep the serverless function alive until
    // the sync finishes (the old in-memory queue silently never ran on Vercel).
    // Capture the per-request Tally URL now — the callback runs outside the request.
    if (tallySyncEnabled) {
      const tallyUrl = currentTallyUrl()
      after(() => runWithTallyUrl(tallyUrl, () => syncSalesInvoice(id)).catch(() => {}))
    }

    return NextResponse.json(
      {
        id,
        invoice_number: invoiceNumber,
        customer_id: customerId,
        customer_name: body.customer_name ?? '',
        tally_name: body.tally_name ?? '',
        narration: body.narration ?? '',
        season_id: seasonId,
        date: body.date ?? '',
        sale_type: saleType,
        items: builtItems,
        total,
        status: body.status ?? 'saved',
        tally_sync_status: initialStatus,
        created_at: createdAt,
      },
      { status: 201 },
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Update an invoice's date (used to fix a voucher date Tally rejected).
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    const date = String(body.date ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Invoice id is required' }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    await execute('UPDATE sales_invoices SET date = ? WHERE id = ?', [date, id])
    return NextResponse.json({ id, date })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
