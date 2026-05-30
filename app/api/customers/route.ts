import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const searchBy = searchParams.get('searchBy') ?? 'name'
    const offset = (page - 1) * limit

    let whereClause = ''
    const params: string[] = []

    if (search.trim()) {
      if (searchBy === 'city') {
        // The customer's address field holds the city name only — match it
        // exactly (case- and whitespace-insensitive) so the filter is precise.
        whereClause = 'WHERE LOWER(TRIM(address)) = LOWER(TRIM(?))'
        params.push(search.trim())
      } else {
        const searchValue = `%${search.trim()}%`
        if (searchBy === 'phone') {
          whereClause = 'WHERE phone LIKE ?'
        } else if (searchBy === 'gstin') {
          whereClause = 'WHERE gstin LIKE ?'
        } else if (searchBy === 'display_number') {
          whereClause = 'WHERE display_number LIKE ?'
        } else {
          whereClause = 'WHERE name LIKE ?'
        }
        params.push(searchValue)
      }
    }

    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM customers ${whereClause}`,
      params,
    )
    const total = countResult[0]?.count || 0

    const rows = await query(
      `SELECT id, name, kannada_name, phone, address, kannada_address, state, country, gstin, acres, loyalty, referral, display_number, aadhar_card, tally_ledger_name, tally_sync_status, tally_response, tally_synced_at, created_at FROM customers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )

    if (useLegacyArray) {
      return NextResponse.json(rows)
    }

    return NextResponse.json({
      data: rows,
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
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    const customer = {
      id: newId(),
      name,
      kannada_name: String(body.kannada_name ?? ''),
      phone: String(body.phone ?? ''),
      address: String(body.address ?? ''),
      kannada_address: String(body.kannada_address ?? ''),
      state: String(body.state ?? ''),
      country: String(body.country ?? ''),
      gstin: String(body.gstin ?? ''),
      acres: String(body.acres ?? ''),
      loyalty: String(body.loyalty ?? ''),
      referral: String(body.referral ?? ''),
      display_number: String(body.display_number ?? ''),
      aadhar_card: String(body.aadhar_card ?? ''),
      tally_ledger_name: String(body.tally_ledger_name ?? name),
    }

    await execute(
      `INSERT INTO customers (id, name, kannada_name, phone, address, kannada_address, state, country, gstin, acres, loyalty, referral, display_number, aadhar_card, tally_ledger_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id,
        customer.name,
        customer.kannada_name,
        customer.phone,
        customer.address,
        customer.kannada_address,
        customer.state,
        customer.country,
        customer.gstin,
        customer.acres,
        customer.loyalty,
        customer.referral,
        customer.display_number,
        customer.aadhar_card,
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

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    const name = String(body.name ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    await execute(
      `UPDATE customers SET
        name = ?,
        kannada_name = ?,
        phone = ?,
        address = ?,
        kannada_address = ?,
        state = ?,
        country = ?,
        gstin = ?,
        acres = ?,
        loyalty = ?,
        referral = ?,
        display_number = ?,
        aadhar_card = ?,
        tally_ledger_name = ?
      WHERE id = ?`,
      [
        name,
        String(body.kannada_name ?? ''),
        String(body.phone ?? ''),
        String(body.address ?? ''),
        String(body.kannada_address ?? ''),
        String(body.state ?? ''),
        String(body.country ?? ''),
        String(body.gstin ?? ''),
        String(body.acres ?? ''),
        String(body.loyalty ?? ''),
        String(body.referral ?? ''),
        String(body.display_number ?? ''),
        String(body.aadhar_card ?? ''),
        String(body.tally_ledger_name ?? name),
        id,
      ],
    )

    const rows = await query('SELECT * FROM customers WHERE id = ?', [id])
    return NextResponse.json(rows[0], { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
