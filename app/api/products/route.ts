import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLUMNS = `id, name, kannada_name, hsn_code, unit, product_type, gst_rate,
        location, selling_price, tally_price, expiry_date, maintain_batches, tally_stock_item_name,
        tally_sync_status, tally_response, tally_synced_at`

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const useLegacyArray =
      !searchParams.has('page') &&
      !searchParams.has('limit') &&
      !searchParams.has('search') &&
      !searchParams.has('searchBy')

    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const limit = parseInt(searchParams.get('limit') ?? '10', 10)
    const search = searchParams.get('search') ?? ''
    const searchBy = searchParams.get('searchBy') ?? 'name' // name, hsn_code, product_type

    const offset = (page - 1) * limit

    let whereClause = ''
    const params: any[] = []

    if (search.trim()) {
      const searchValue = `%${search.trim()}%`
      if (searchBy === 'hsn_code') {
        whereClause = 'WHERE hsn_code LIKE ?'
        params.push(searchValue)
      } else if (searchBy === 'product_type') {
        whereClause = 'WHERE product_type LIKE ?'
        params.push(searchValue)
      } else {
        whereClause = 'WHERE name LIKE ?'
        params.push(searchValue)
      }
    }

    if (useLegacyArray) {
      const rows = await query<{ maintain_batches: number; [k: string]: unknown }>(
        `SELECT ${SELECT_COLUMNS} FROM products ORDER BY created_at`,
      )
      return NextResponse.json(
        rows.map((r) => ({ ...r, maintain_batches: r.maintain_batches === 1 })),
      )
    }

    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM products ${whereClause}`,
      params,
    )
    const total = countResult[0]?.count || 0

    params.push(limit, offset)
    const rows = await query<{ maintain_batches: number; [k: string]: unknown }>(
      `SELECT ${SELECT_COLUMNS} FROM products ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params,
    )

    return NextResponse.json({
      data: rows.map((r) => ({ ...r, maintain_batches: r.maintain_batches === 1 })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
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

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    const name = String(body.name ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    await execute(
      `UPDATE products SET
         name = ?,
         kannada_name = ?,
         hsn_code = ?,
         unit = ?,
         product_type = ?,
         location = ?,
         gst_rate = ?,
         selling_price = ?,
         tally_price = ?,
         expiry_date = ?,
         maintain_batches = ?,
         tally_stock_item_name = ?
       WHERE id = ?`,
      [
        name,
        String(body.kannada_name ?? ''),
        String(body.hsn_code ?? ''),
        String(body.unit ?? ''),
        String(body.product_type ?? ''),
        String(body.location ?? body.state ?? ''),
        Number(body.gst_rate ?? 0),
        Number(body.selling_price ?? 0),
        Number(body.tally_price ?? 0),
        String(body.expiry_date ?? ''),
        Boolean(body.maintain_batches) ? 1 : 0,
        String(body.tally_stock_item_name ?? name),
        id,
      ],
    )

    const rows = await query('SELECT * FROM products WHERE id = ?', [id])
    return NextResponse.json(rows[0], { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
