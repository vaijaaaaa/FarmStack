import { NextResponse } from 'next/server'
import { query, queryOne, execute, transaction, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS =
  'id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at'

// GET /api/ledgers?season_id=...&customer_id=...
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
      `SELECT ${COLS} FROM ledgers
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY display_number, customer_name`,
      params,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/ledgers — attach a customer to a season.
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const seasonId = String(body.season_id ?? '').trim()
    const customerId = String(body.customer_id ?? '').trim()
    if (!seasonId) {
      return NextResponse.json({ error: 'Please select a season' }, { status: 400 })
    }
    if (!customerId) {
      return NextResponse.json({ error: 'Please select an account (customer)' }, { status: 400 })
    }

    // One ledger per (season, customer).
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
      [seasonId, customerId],
    )
    if (existing) {
      return NextResponse.json(
        { error: 'This customer is already added to the selected season' },
        { status: 409 },
      )
    }

    // Auto carry-forward: if this customer has a CLOSED ledger whose balance
    // hasn't been carried yet, its closing balance becomes this ledger's
    // opening balance (and that prior ledger is marked carried so it's used once).
    const prior = await queryOne<{ id: string; closing_balance: number }>(
      `SELECT id, closing_balance FROM ledgers
       WHERE customer_id = ? AND status = 'closed' AND carried = 0
       ORDER BY closure_date DESC, created_at DESC
       LIMIT 1`,
      [customerId],
    )
    const openingBalance = prior ? Number(prior.closing_balance) || 0 : Number(body.opening_balance) || 0

    const ledger = {
      id: newId(),
      season_id: seasonId,
      customer_id: customerId,
      customer_name: String(body.customer_name ?? '').trim(),
      user_name: String(body.user_name ?? '').trim(),
      description: String(body.description ?? '').trim(),
      acres: Number(body.acres) || 0,
      credit_limit: Number(body.credit_limit) || 0,
      display_number: Number(body.display_number) || 0,
      closure_date: String(body.closure_date ?? '').trim(),
      opening_balance: openingBalance,
      closing_balance: 0,
      carried: 0,
      status: 'open',
      created_at: nowIso(),
    }

    await transaction((run) => {
      run(
        `INSERT INTO ledgers
          (id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ledger.id,
          ledger.season_id,
          ledger.customer_id,
          ledger.customer_name,
          ledger.user_name,
          ledger.description,
          ledger.acres,
          ledger.credit_limit,
          ledger.display_number,
          ledger.closure_date,
          ledger.opening_balance,
          ledger.closing_balance,
          ledger.carried,
          ledger.status,
          ledger.created_at,
        ],
      )
      if (prior) {
        run('UPDATE ledgers SET carried = 1 WHERE id = ?', [prior.id])
      }
    })

    return NextResponse.json({ ...ledger, carried_from: prior?.id ?? null }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// PATCH /api/ledgers — close a ledger and (optionally) carry its net balance
// forward as the opening balance of the same customer in another season.
// Body: { id, closure_date, carry_to_season_id?, opening_balance? }
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Ledger id is required' }, { status: 400 })
    }
    // Re-open a previously closed ledger.
    if (String(body.action ?? '') === 'reopen') {
      await execute('UPDATE ledgers SET status = ?, closure_date = ? WHERE id = ?', [
        'open',
        '',
        id,
      ])
      return NextResponse.json({ id, status: 'open' })
    }

    // Close: record the net outstanding (closing_balance). It does NOT push into
    // another season here — the carry-forward happens automatically when the
    // customer is later added to a new season (see POST).
    const closureDate = String(body.closure_date ?? '').trim()
    const closingBalance = Number(body.closing_balance) || 0

    await execute(
      'UPDATE ledgers SET status = ?, closure_date = ?, closing_balance = ?, carried = 0 WHERE id = ?',
      ['closed', closureDate, closingBalance, id],
    )

    return NextResponse.json({
      id,
      status: 'closed',
      closure_date: closureDate,
      closing_balance: closingBalance,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
