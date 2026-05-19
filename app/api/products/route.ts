import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query<{ maintain_batches: number; [k: string]: unknown }>(
      `SELECT id, name, kannada_name, hsn_code, unit, product_type, gst_rate,
              location, selling_price, tally_price, expiry_date, maintain_batches, tally_stock_item_name,
              tally_sync_status, tally_response, tally_synced_at
       FROM products ORDER BY created_at`,
    )
    return NextResponse.json(
      rows.map((r) => ({ ...r, maintain_batches: r.maintain_batches === 1 })),
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const product = {
      id: newId(),
      name,
      kannada_name: String(body.kannada_name ?? ''),
      hsn_code: String(body.hsn_code ?? ''),
      unit: String(body.unit ?? ''),
      product_type: String(body.product_type ?? ''),
      location: String(body.location ?? body.state ?? ''),
      gst_rate: Number(body.gst_rate ?? 0),
      selling_price: Number(body.selling_price ?? 0),
      tally_price: Number(body.tally_price ?? 0),
      expiry_date: String(body.expiry_date ?? ''),
      maintain_batches: Boolean(body.maintain_batches),
      tally_stock_item_name: String(body.tally_stock_item_name ?? name),
    }

    await execute(
      `INSERT INTO products (id, name, kannada_name, hsn_code, unit, product_type, location, gst_rate,
                             selling_price, tally_price, expiry_date, maintain_batches,
                             tally_stock_item_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.id,
        product.name,
        product.kannada_name,
        product.hsn_code,
        product.unit,
        product.product_type,
        product.location,
        product.gst_rate,
        product.selling_price,
        product.tally_price,
        product.expiry_date,
        product.maintain_batches ? 1 : 0,
        product.tally_stock_item_name,
        nowIso(),
      ],
    )

    return NextResponse.json(product, { status: 201 })
  } catch (err) {
    const message = (err as Error).message
    const status = /UNIQUE constraint/.test(message) ? 409 : 500
    return NextResponse.json(
      { error: status === 409 ? 'A product with this name already exists' : message },
      { status },
    )
  }
}
