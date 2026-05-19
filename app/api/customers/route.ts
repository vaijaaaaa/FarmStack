import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query(
      'SELECT id, name, kannada_name, phone, address, kannada_address, gstin, tally_ledger_name, tally_sync_status, tally_response, tally_synced_at FROM customers ORDER BY created_at',
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
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    const customer = {
      id: newId(),
      name,
      kannada_name: String(body.kannada_name ?? ''),
      phone: String(body.phone ?? ''),
      address: String(body.address ?? ''),
      kannada_address: String(body.kannada_address ?? ''),
      gstin: String(body.gstin ?? ''),
      tally_ledger_name: String(body.tally_ledger_name ?? name),
    }

    await execute(
      `INSERT INTO customers (id, name, kannada_name, phone, address, kannada_address, gstin, tally_ledger_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id,
        customer.name,
        customer.kannada_name,
        customer.phone,
        customer.address,
        customer.kannada_address,
        customer.gstin,
        customer.tally_ledger_name,
        nowIso(),
      ],
    )

    return NextResponse.json(customer, { status: 201 })
  } catch (err) {
    const message = (err as Error).message
    const status = /UNIQUE constraint/.test(message) ? 409 : 500
    return NextResponse.json(
      { error: status === 409 ? 'A customer with this name already exists' : message },
      { status },
    )
  }
}
