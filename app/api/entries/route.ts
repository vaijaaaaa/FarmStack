import { NextResponse } from 'next/server'
import { query, transaction, newId, nowIso } from '@/lib/db'
import { ensureLedgerExists } from '@/lib/accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/entries?season_id=...&customer_id=...
// Both filters optional. Without filters, returns every entry (newest first).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const seasonId = searchParams.get('season_id')
    const customerId = searchParams.get('customer_id')

    const where: string[] = []
    const params: string[] = []
    if (seasonId) {
      where.push('season_id = ?')
      params.push(seasonId)
    }
    if (customerId) {
      where.push('customer_id = ?')
      params.push(customerId)
    }

    const rows = await query(
      `SELECT id, season_id, customer_id, customer_name, type, date, amount, comments, location, created_at
       FROM entries
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC`,
      params,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/entries
// Batch insert. Body: { season_id, type, location, rows: [{ customer_id, customer_name, date, amount, comments }] }
// Rows without a customer or with amount <= 0 are skipped.
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const seasonId = String(body.season_id ?? '').trim()
    if (!seasonId) {
      return NextResponse.json({ error: 'Please select a season' }, { status: 400 })
    }

    const type = body.type === 'credit' ? 'credit' : 'cash'
    const location = String(body.location ?? '').trim()
    const createdAt = nowIso()

    const rowsIn = Array.isArray(body.rows) ? body.rows : []
    const entries = rowsIn
      .map((r: Record<string, unknown>) => ({
        id: newId(),
        season_id: seasonId,
        customer_id: String(r.customer_id ?? '').trim(),
        customer_name: String(r.customer_name ?? '').trim(),
        type,
        date: String(r.date ?? '').trim(),
        amount: Number(r.amount) || 0,
        comments: String(r.comments ?? '').trim(),
        location,
        created_at: createdAt,
      }))
      .filter((e: { customer_id: string; amount: number }) => e.customer_id && e.amount > 0)

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one row with a customer and an amount' },
        { status: 400 },
      )
    }

    await transaction((run) => {
      for (const e of entries) {
        run(
          `INSERT INTO entries
            (id, season_id, customer_id, customer_name, type, date, amount, comments, location, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id,
            e.season_id,
            e.customer_id,
            e.customer_name,
            e.type,
            e.date,
            e.amount,
            e.comments,
            e.location,
            e.created_at,
          ],
        )
      }
    })

    // Make sure each customer has a ledger in this season, so the entry shows up
    // in the Accounts ledger (auto-create with carried-forward opening balance).
    const seen = new Set<string>()
    for (const e of entries) {
      if (seen.has(e.customer_id)) continue
      seen.add(e.customer_id)
      await ensureLedgerExists(seasonId, e.customer_id, e.customer_name)
    }

    return NextResponse.json({ created: entries }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
