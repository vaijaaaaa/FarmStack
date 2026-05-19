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
    const searchBy = searchParams.get('searchBy') ?? 'name' // name, phone, gstin, place_of_supply

    const offset = (page - 1) * limit

    let whereClause = ''
    const params: any[] = []

    if (search.trim()) {
      const searchValue = `%${search.trim()}%`
      if (searchBy === 'phone') {
        whereClause = 'WHERE phone LIKE ?'
        params.push(searchValue)
      } else if (searchBy === 'gstin') {
        whereClause = 'WHERE gstin LIKE ?'
        params.push(searchValue)
      } else if (searchBy === 'place_of_supply') {
        whereClause = 'WHERE place_of_supply LIKE ?'
        params.push(searchValue)
      } else {
        whereClause = 'WHERE name LIKE ?'
        params.push(searchValue)
      }
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM suppliers ${whereClause}`
    const countResult = await query<{ count: number }>(countSql, params)
    const total = countResult[0]?.count || 0

    // Get paginated data
    const sql = `
      SELECT 
        id, name, kannada_name, phone, address, kannada_address, state, country, gstin, place_of_supply,
        tally_ledger_name, tally_sync_status, tally_response, tally_synced_at, created_at
      FROM suppliers 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
    params.push(limit, offset)
    const rows = await query(sql, params)

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
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    // Validate phone if provided
    const phone = String(body.phone ?? '').trim()
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Phone number must be 10 digits' }, { status: 400 })
    }

    // Validate GSTIN if provided
    const gstin = String(body.gstin ?? '').trim()
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      // GSTIN validation - allowing empty or valid format
      if (gstin !== '') {
        return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 })
      }
    }

    const supplier = {
      id: newId(),
      name,
      kannada_name: String(body.kannada_name ?? ''),
      phone,
      address: String(body.address ?? ''),
      kannada_address: String(body.kannada_address ?? ''),
      state: String(body.state ?? ''),
      country: String(body.country ?? ''),
      gstin,
      place_of_supply: String(body.place_of_supply ?? ''),
      tally_ledger_name: String(body.tally_ledger_name ?? name),
    }

    await execute(
      `INSERT INTO suppliers (id, name, kannada_name, phone, address, kannada_address, state, country, gstin, place_of_supply, tally_ledger_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplier.id,
        supplier.name,
        supplier.kannada_name,
        supplier.phone,
        supplier.address,
        supplier.kannada_address,
        supplier.state,
        supplier.country,
        supplier.gstin,
        supplier.place_of_supply,
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

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    const name = String(body.name ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    // Validate phone if provided
    const phone = String(body.phone ?? '').trim()
    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Phone number must be 10 digits' }, { status: 400 })
    }

    const updateSql = `
      UPDATE suppliers SET 
        name = ?,
        kannada_name = ?,
        phone = ?,
        address = ?,
        kannada_address = ?,
        state = ?,
        country = ?,
        gstin = ?,
        place_of_supply = ?,
        tally_ledger_name = ?
      WHERE id = ?
    `

    await execute(updateSql, [
      name,
      String(body.kannada_name ?? ''),
      phone,
      String(body.address ?? ''),
      String(body.kannada_address ?? ''),
      String(body.state ?? ''),
      String(body.country ?? ''),
      String(body.gstin ?? ''),
      String(body.place_of_supply ?? ''),
      String(body.tally_ledger_name ?? name),
      id,
    ])

    const rows = await query('SELECT * FROM suppliers WHERE id = ?', [id])
    return NextResponse.json(rows[0], { status: 200 })
  } catch (err) {
    const message = (err as Error).message
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
