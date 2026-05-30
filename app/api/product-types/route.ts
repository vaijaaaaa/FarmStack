import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const defaultTypes = [
  { name: 'Fertilizers', description: 'Default product type', tax: 5 },
  { name: 'Micronutrients', description: 'Default product type', tax: 12 },
  { name: 'Pesticide', description: 'Default product type', tax: 18 },
  { name: 'Seeds', description: 'Default product type', tax: 0 },
]

// Legacy default type names that should no longer appear in the list.
const legacyDefaultNames = [
  'Sales of Grain',
  'Sales of Fertilizer',
  'Sales of Micronutrients',
  'Sales of Pesticide',
  'Sales of Seeds',
  'Purchase of Fertilizer',
  'Purchase of Micronutrients',
  'Purchase of Pesticide',
  'Purchase of Seeds',
  'Purchase of Ammonium Sulphate',
  'Pucharse of Ammonium Sulphate',
]

async function seedDefaultsIfNeeded() {
  // Drop the old default types from already-seeded databases.
  for (const name of legacyDefaultNames) {
    await execute('DELETE FROM product_types WHERE name = ?', [name])
  }

  // Ensure each of the current default types exists (without removing any
  // custom types that were added later).
  for (const type of defaultTypes) {
    const existing = await query<{ id: string }>(
      'SELECT id FROM product_types WHERE name = ?',
      [type.name],
    )
    if (existing.length > 0) continue
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
