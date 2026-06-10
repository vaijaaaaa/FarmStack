import { NextResponse } from 'next/server'
import { query, queryOne, transaction, newId, nowIso } from '@/lib/db'
import { ensureLedgerExists, activeSeasonForCustomer } from '@/lib/accounts'

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
      `SELECT id, season_id, customer_id, customer_name, type, date, amount, comments, location, is_ob, created_at
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
        is_ob: r.is_ob ? 1 : 0,
        created_at: createdAt,
      }))
      .filter((e: { customer_id: string; amount: number }) => e.customer_id && e.amount > 0)

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one row with a customer and an amount' },
        { status: 400 },
      )
    }

    // A customer's transactions go ONLY to their ACTIVE account — the OLDEST
    // still-open season. A customer may have several accounts, but if their active
    // (oldest-open) account is in a DIFFERENT season than the one picked here,
    // adding is blocked: that account must be closed (and carried) first.
    const activeCache = new Map<string, string>()
    const checkedActive = new Set<string>()
    for (const e of entries as { customer_id: string; customer_name: string; season_id: string }[]) {
      if (checkedActive.has(e.customer_id)) continue
      checkedActive.add(e.customer_id)
      if (!activeCache.has(e.customer_id)) {
        activeCache.set(e.customer_id, await activeSeasonForCustomer(e.customer_id))
      }
      const active = activeCache.get(e.customer_id) as string
      if (active && active !== seasonId) {
        const sn = await queryOne<{ name: string }>('SELECT name FROM seasons WHERE id = ?', [active])
        return NextResponse.json(
          {
            error: `${e.customer_name || 'This customer'} has an active account in ${sn?.name || 'another season'}. Close & move it before adding to a new season.`,
          },
          { status: 409 },
        )
      }
    }

    // Block adding to a CLOSED account in the picked season.
    const checkedClosed = new Set<string>()
    for (const e of entries as { customer_id: string; customer_name: string }[]) {
      if (checkedClosed.has(e.customer_id)) continue
      checkedClosed.add(e.customer_id)
      const closed = await queryOne<{ id: string }>(
        "SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ? AND status = 'closed'",
        [seasonId, e.customer_id],
      )
      if (closed) {
        return NextResponse.json(
          { error: `${e.customer_name || 'This customer'}'s account is closed — open a new season for them first.` },
          { status: 409 },
        )
      }
    }

    await transaction((run) => {
      for (const e of entries) {
        run(
          `INSERT INTO entries
            (id, season_id, customer_id, customer_name, type, date, amount, comments, location, is_ob, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            e.is_ob,
            e.created_at,
          ],
        )
      }
    })

    // Make sure each customer has a ledger in their routed season, so the entry
    // shows up in the Accounts ledger.
    const seen = new Set<string>()
    for (const e of entries as { customer_id: string; customer_name: string; season_id: string }[]) {
      if (seen.has(e.customer_id)) continue
      seen.add(e.customer_id)
      await ensureLedgerExists(e.season_id, e.customer_id, e.customer_name)
    }

    return NextResponse.json({ created: entries }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
