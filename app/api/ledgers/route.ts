import { NextResponse } from 'next/server'
import { query, queryOne, execute, newId, nowIso } from '@/lib/db'

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

    // Bulk: attach many customers to a season at once (Season Ledger Creation).
    if (Array.isArray(body.customers)) {
      if (!seasonId) {
        return NextResponse.json({ error: 'Please select a season' }, { status: 400 })
      }
      let created = 0
      let skipped = 0
      for (const row of body.customers) {
        const cid = String(row.customer_id ?? '').trim()
        if (!cid) {
          skipped++
          continue
        }
        const dup = await queryOne<{ id: string }>(
          'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
          [seasonId, cid],
        )
        if (dup) {
          skipped++
          continue
        }
        // One active account per customer — skip if they already have an open one.
        const otherOpen = await queryOne<{ id: string }>(
          "SELECT id FROM ledgers WHERE customer_id = ? AND status = 'open' LIMIT 1",
          [cid],
        )
        if (otherOpen) {
          skipped++
          continue
        }
        await execute(
          `INSERT INTO ledgers
            (id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            seasonId,
            cid,
            String(row.customer_name ?? '').trim(),
            String(row.user_name ?? '').trim(),
            String(row.description ?? '').trim(),
            Number(row.acres) || 0,
            Number(row.credit_limit) || 0,
            Number(row.display_number) || 0,
            String(row.closure_date ?? '').trim(),
            0,
            0,
            0,
            'open',
            nowIso(),
          ],
        )
        created++
      }
      return NextResponse.json({ created, skipped }, { status: 201 })
    }

    const customerId = String(body.customer_id ?? '').trim()
    if (!seasonId) {
      return NextResponse.json({ error: 'Please select a season' }, { status: 400 })
    }
    if (!customerId) {
      return NextResponse.json({ error: 'Please select a user or account (customer)' }, { status: 400 })
    }

    // Editable detail fields (shared by insert + update).
    const customerName = String(body.customer_name ?? '').trim()
    const userName = String(body.user_name ?? '').trim()
    const description = String(body.description ?? '').trim()
    const acres = Number(body.acres) || 0
    const creditLimit = Number(body.credit_limit) || 0
    const displayNumber = Number(body.display_number) || 0
    const closureDate = String(body.closure_date ?? '').trim()

    // Upsert: one ledger per (season, customer). If it already exists, update its
    // details (acres / loyalty / display number / etc.); otherwise create it.
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
      [seasonId, customerId],
    )
    if (existing) {
      await execute(
        `UPDATE ledgers SET customer_name = ?, user_name = ?, description = ?, acres = ?,
           credit_limit = ?, display_number = ?, closure_date = ? WHERE id = ?`,
        [customerName, userName, description, acres, creditLimit, displayNumber, closureDate, existing.id],
      )
      const updated = await queryOne(`SELECT ${COLS} FROM ledgers WHERE id = ?`, [existing.id])
      return NextResponse.json(updated, { status: 200 })
    }

    // One ACTIVE (open) account per customer at a time — the current one must be
    // closed before a new season's account can be opened.
    const otherOpen = await queryOne<{ name: string }>(
      `SELECT s.name FROM ledgers l JOIN seasons s ON s.id = l.season_id
       WHERE l.customer_id = ? AND l.status = 'open' LIMIT 1`,
      [customerId],
    )
    if (otherOpen) {
      return NextResponse.json(
        {
          error: `${customerName || 'This customer'} already has an active account in ${otherOpen.name}. Please close it first.`,
        },
        { status: 409 },
      )
    }

    // New ledgers always open at ₹0 — carry-forward is manual.
    const ledger = {
      id: newId(),
      season_id: seasonId,
      customer_id: customerId,
      customer_name: customerName,
      user_name: userName,
      description,
      acres,
      credit_limit: creditLimit,
      display_number: displayNumber,
      closure_date: closureDate,
      opening_balance: 0,
      closing_balance: 0,
      carried: 0,
      status: 'open',
      created_at: nowIso(),
    }

    await execute(
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

    return NextResponse.json(ledger, { status: 201 })
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
