import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BulkProductData {
  name: string
  hsn_code?: string
  unit?: string
  product_type?: string
  gst_rate?: number | string
  selling_price?: number | string
  tally_price?: number | string
  expiry_date?: string
}

interface BulkResult {
  success: number
  failed: number
  errors: Array<{ row: number; name: string; error: string }>
  created: any[]
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const products = body.products as BulkProductData[]

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 })
    }

    const result: BulkResult = {
      success: 0,
      failed: 0,
      errors: [],
      created: [],
    }

    const existingProducts = await query<{ name: string }>('SELECT name FROM products')
    const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()))

    for (let i = 0; i < products.length; i++) {
      const prod = products[i]
      const rowNum = i + 2 // Row numbering starts from 2 (after header)

      try {
        const name = String(prod.name ?? '').trim()
        if (!name) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name: name || 'Unknown',
            error: 'Product name is required',
          })
          continue
        }

        if (existingNames.has(name.toLowerCase())) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name,
            error: 'Product name already exists',
          })
          continue
        }

        const id = newId()
        await execute(
          `INSERT INTO products (id, name, kannada_name, hsn_code, unit, product_type, location, gst_rate,
                                 selling_price, tally_price, expiry_date, maintain_batches,
                                 tally_stock_item_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            name,
            '',
            String(prod.hsn_code ?? ''),
            String(prod.unit ?? ''),
            String(prod.product_type ?? ''),
            '',
            Number(prod.gst_rate ?? 0),
            Number(prod.selling_price ?? 0),
            Number(prod.tally_price ?? 0),
            String(prod.expiry_date ?? ''),
            0,
            name,
            nowIso(),
          ],
        )

        result.success++
        result.created.push({ id, name })
        existingNames.add(name.toLowerCase())
      } catch (err) {
        result.failed++
        result.errors.push({
          row: rowNum,
          name: String(prod.name ?? '').trim() || 'Unknown',
          error: (err as Error).message,
        })
      }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
