import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BulkSupplierData {
  name: string
  address?: string
  phone?: string
  state?: string
  country?: string
  gstin?: string
  place_of_supply?: string
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
    const suppliers = body.suppliers as BulkSupplierData[]

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return NextResponse.json({ error: 'No suppliers provided' }, { status: 400 })
    }

    const result: BulkResult = {
      success: 0,
      failed: 0,
      errors: [],
      created: [],
    }

    // Get existing supplier names for duplicate check
    const existingSuppliers = await query<{ name: string }>(
      'SELECT name FROM suppliers',
    )
    const existingNames = new Set(existingSuppliers.map((s) => s.name.toLowerCase()))

    for (let i = 0; i < suppliers.length; i++) {
      const sup = suppliers[i]
      const rowNum = i + 2 // Row numbering starts from 2 (after header)

      try {
        // Validation
        const name = String(sup.name ?? '').trim()
        if (!name) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name: name || 'Unknown',
            error: 'Supplier name is required',
          })
          continue
        }

        if (existingNames.has(name.toLowerCase())) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name,
            error: 'Supplier name already exists',
          })
          continue
        }

        const phone = String(sup.phone ?? '').trim()
        if (phone && !/^[0-9]{10}$/.test(phone)) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name,
            error: 'Phone number must be 10 digits',
          })
          continue
        }

        const gstin = String(sup.gstin ?? '').trim()
        if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
          result.failed++
          result.errors.push({
            row: rowNum,
            name,
            error: 'Invalid GSTIN format',
          })
          continue
        }

        const id = newId()
        await execute(
          `INSERT INTO suppliers (id, name, kannada_name, phone, address, kannada_address, state, country, gstin, place_of_supply, tally_ledger_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            name,
            String(sup.name ?? ''),
            phone,
            String(sup.address ?? ''),
            '',
            String(sup.state ?? ''),
            String(sup.country ?? ''),
            gstin,
            String(sup.place_of_supply ?? ''),
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
          name: String(sup.name ?? '').trim() || 'Unknown',
          error: (err as Error).message,
        })
      }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
