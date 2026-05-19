import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BulkCustomerData {
  name: string
  address?: string
  phone?: string
  state?: string
  country?: string
  gstin?: string
  acres?: string
  loyalty?: string
  referral?: string
  display_number?: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const customers = body.customers as BulkCustomerData[]

    if (!Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json({ error: 'No customers provided' }, { status: 400 })
    }

    const result = { success: 0, failed: 0, errors: [] as Array<{ row: number; name: string; error: string }>, created: [] as any[] }
    const existingCustomers = await query<{ name: string }>('SELECT name FROM customers')
    const existingNames = new Set(existingCustomers.map((customer) => customer.name.toLowerCase()))

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i]
      const rowNum = i + 2
      const name = String(customer.name ?? '').trim()

      if (!name) {
        result.failed += 1
        result.errors.push({ row: rowNum, name: 'Unknown', error: 'Customer name is required' })
        continue
      }
      if (existingNames.has(name.toLowerCase())) {
        result.failed += 1
        result.errors.push({ row: rowNum, name, error: 'Customer name already exists' })
        continue
      }

      const phone = String(customer.phone ?? '').trim()
      if (phone && !/^[0-9]{10}$/.test(phone)) {
        result.failed += 1
        result.errors.push({ row: rowNum, name, error: 'Phone number must be 10 digits' })
        continue
      }

      const gstin = String(customer.gstin ?? '').trim()
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
        result.failed += 1
        result.errors.push({ row: rowNum, name, error: 'Invalid GSTIN format' })
        continue
      }

      const id = newId()
      await execute(
        `INSERT INTO customers (id, name, kannada_name, phone, address, kannada_address, state, country, gstin, acres, loyalty, referral, display_number, tally_ledger_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          name,
          phone,
          String(customer.address ?? ''),
          '',
          String(customer.state ?? ''),
          String(customer.country ?? ''),
          gstin,
          String(customer.acres ?? ''),
          String(customer.loyalty ?? ''),
          String(customer.referral ?? ''),
          String(customer.display_number ?? ''),
          name,
          nowIso(),
        ],
      )

      result.success += 1
      result.created.push({ id, name })
      existingNames.add(name.toLowerCase())
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}