import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query(
      'SELECT id, name, kannada_name, phone, address, kannada_address, state, gstin, tally_ledger_name, tally_sync_status, tally_response, tally_synced_at FROM suppliers ORDER BY created_at',
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
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const supplier = {
      id: newId(),
      name,
      kannada_name: String(body.kannada_name ?? ''),
      phone: String(body.phone ?? ''),
      address: String(body.address ?? ''),
      kannada_address: String(body.kannada_address ?? ''),
      state: String(body.state ?? ''),
      gstin: String(body.gstin ?? ''),
      tally_ledger_name: String(body.tally_ledger_name ?? name),
    }

    await execute(
      `INSERT INTO suppliers (id, name, kannada_name, phone, address, kannada_address, state, gstin, tally_ledger_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplier.id,
        supplier.name,
        supplier.kannada_name,
        supplier.phone,
        supplier.address,
        supplier.kannada_address,
        supplier.state,
        supplier.gstin,
        supplier.tally_ledger_name,
        nowIso(),
      ],
    )

    return NextResponse.json(supplier, { status: 201 })
  } catch (err) {
    const message = (err as Error).message
    const status = /UNIQUE constraint/.test(message) ? 409 : 500
    return NextResponse.json(
      { error: status === 409 ? 'A supplier with this name already exists' : message },
      { status },
    )
  }
}
