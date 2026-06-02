import { NextResponse } from 'next/server'
import { query, queryOne, execute, transaction, newId, nowIso } from '@/lib/db'
import { syncSalesInvoice } from '@/lib/tally/tallySyncService'
import { setTallyUrlForRequest } from '@/lib/tally/tallyContext'
import { getStockMap } from '@/lib/stock'

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
    const invoices = await query<Record<string, unknown>>(
      'SELECT * FROM sales_invoices ORDER BY created_at DESC',
    )
    const items = await query<Record<string, unknown>>('SELECT * FROM sales_items')
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

    const countRow = await query<{ c: number }>('SELECT COUNT(*) AS c FROM sales_invoices')
    const seq = (countRow[0]?.c ?? 0) + 1
    const id = newId()
    const invoiceNumber = `INV-${String(seq).padStart(3, '0')}`
    const createdAt = nowIso()

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

    // Stock check — a product can only be sold if purchase stock exists and is
    // enough. requested quantity is summed per product across all items.
    const stock = await getStockMap()
    const requestedByProduct = new Map<string, number>()
    for (const it of builtItems) {
      requestedByProduct.set(
        it.product_id,
        (requestedByProduct.get(it.product_id) || 0) + it.quantity,
      )
    }
    for (const [productId, requested] of requestedByProduct) {
      const available = stock.get(productId)?.available ?? 0
      const prod = await queryOne<{ name: string; unit: string }>(
        'SELECT name, unit FROM products WHERE id = ?',
        [productId],
      )
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
          {
            error: `Insufficient stock for ${name}. Available: ${available} ${unit}, Requested: ${requested} ${unit}.`,
          },
          { status: 400 },
        )
      }
    }
    const total = builtItems.reduce(
      (sum, it) => sum + it.quantity * it.rate * (1 + it.gst / 100),
      0,
    )

    // Auto-decide Tally sync: a sale is sent to Tally only when EVERY product
    // in it was purchased through a Tally-synced purchase (so its stock already
    // exists in Tally). If any product was purchased with Tally sync off, that
    // stock never reached Tally, so this sale is not Tally-relevant.
    const productIds = [...new Set(builtItems.map((it) => it.product_id).filter(Boolean))]
    let tallySyncEnabled = productIds.length > 0
    for (const pid of productIds) {
      const r = await queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM purchase_items pit
         JOIN purchase_invoices pi ON pi.id = pit.invoice_id
         WHERE pit.product_id = ? AND pi.tally_sync_status = 'synced'`,
        [pid],
      )
      if (!r || r.c === 0) {
        tallySyncEnabled = false
        break
      }
    }
    const initialStatus = tallySyncEnabled ? 'pending' : 'not_synced'

    await transaction((run) => {
      run(
        `INSERT INTO sales_invoices
          (id, invoice_number, customer_id, customer_name, tally_name, date, sale_type, total, status,
           eway_bill_no, eway_bill_date, dispatch_from, ship_to, transporter_name, transporter_id,
           transport_mode, transport_doc_no, transport_doc_date, vehicle_number, vehicle_type,
           tally_sync_enabled, tally_sync_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          invoiceNumber,
          customerId,
          String(body.customer_name ?? ''),
          String(body.tally_name ?? ''),
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

    let tally: { status: string; message: string } | undefined
    if (tallySyncEnabled) {
      const outcome = await syncSalesInvoice(id)
      tally = { status: outcome.status, message: outcome.message }
    }

    return NextResponse.json(
      {
        id,
        invoice_number: invoiceNumber,
        customer_id: customerId,
        customer_name: body.customer_name ?? '',
        tally_name: body.tally_name ?? '',
        date: body.date ?? '',
        sale_type: saleType,
        items: builtItems,
        total,
        status: body.status ?? 'saved',
        tally_sync_status: initialStatus,
        created_at: createdAt,
        tally,
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
