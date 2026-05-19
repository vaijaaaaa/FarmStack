import { NextResponse } from 'next/server'
import { query, execute, transaction, newId, nowIso } from '@/lib/db'
import { syncSalesInvoice } from '@/lib/tally/tallySyncService'

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
  try {
    const body = await request.json()
    const customerId = String(body.customer_id ?? '').trim()
    const items: SalesItemInput[] = Array.isArray(body.items) ? body.items : []
    const tallySyncEnabled = Boolean(body.tally_sync_enabled ?? body.tally_status)

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
    }))
    const invalidItem = builtItems.find(
      (it) => !it.product_id || it.quantity <= 0 || it.rate <= 0,
    )
    if (invalidItem) {
      return NextResponse.json(
        { error: 'Each sale item must have a product, quantity, and selling price greater than 0' },
        { status: 400 },
      )
    }
    const total = builtItems.reduce(
      (sum, it) => sum + it.quantity * it.rate * (1 + it.gst / 100),
      0,
    )
    const initialStatus = tallySyncEnabled ? 'pending' : 'not_synced'

    await transaction((run) => {
      run(
        `INSERT INTO sales_invoices
          (id, invoice_number, customer_id, customer_name, tally_name, date, total, status,
           eway_bill_no, eway_bill_date, dispatch_from, ship_to, transporter_name, transporter_id,
           transport_mode, transport_doc_no, transport_doc_date, vehicle_number, vehicle_type,
           tally_sync_enabled, tally_sync_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          invoiceNumber,
          customerId,
          String(body.customer_name ?? ''),
          String(body.tally_name ?? ''),
          String(body.date ?? ''),
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
          `INSERT INTO sales_items (id, invoice_id, product_id, batch, quantity, rate, tally_price, gst, type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [it.id, id, it.product_id, it.batch, it.quantity, it.rate, it.tally_price, it.gst, it.type],
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
