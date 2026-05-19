import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const defaultTypes = [
  { name: 'Sales of Grain', description: 'Default sales type', tax: 5 },
  { name: 'Sales of Fertilizer', description: 'Default sales type', tax: 5 },
  { name: 'Sales of Micronutrients', description: 'Default sales type', tax: 12 },
  { name: 'Sales of Pesticide', description: 'Default sales type', tax: 18 },
  { name: 'Sales of Seeds', description: 'Default sales type', tax: 0 },
  { name: 'Purchase of Fertilizer', description: 'Default purchase type', tax: 5 },
  { name: 'Purchase of Micronutrients', description: 'Default purchase type', tax: 12 },
  { name: 'Purchase of Pesticide', description: 'Default purchase type', tax: 18 },
  { name: 'Purchase of Seeds', description: 'Default purchase type', tax: 0 },
]

async function seedDefaultsIfNeeded() {
  const countRows = await query<{ c: number }>('SELECT COUNT(*) AS c FROM product_types')
  if ((countRows[0]?.c ?? 0) > 0) return

  for (const type of defaultTypes) {
    await execute(
      `INSERT INTO product_types (id, name, description, tax, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [newId(), type.name, type.description, type.tax, nowIso()],
    )
  }
}

export async function GET() {
  try {
    await seedDefaultsIfNeeded()
    const rows = await query(
      `SELECT id, name, description, tax, tally_sync_status, tally_response, tally_synced_at
       FROM product_types
       ORDER BY created_at`,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Type name is required' }, { status: 400 })
    }

    const productType = {
      id: newId(),
      name,
      description: String(body.description ?? ''),
      tax: Number(body.tax ?? 0),
    }

    await execute(
      `INSERT INTO product_types (id, name, description, tax, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [productType.id, productType.name, productType.description, productType.tax, nowIso()],
    )

    return NextResponse.json(productType, { status: 201 })
  } catch (err) {
    const message = (err as Error).message
    const status = /UNIQUE constraint/.test(message) ? 409 : 500
    return NextResponse.json(
      { error: status === 409 ? 'A type with this name already exists' : message },
      { status },
    )
  }
}
