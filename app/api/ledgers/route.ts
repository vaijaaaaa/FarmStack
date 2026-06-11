import { NextResponse } from 'next/server'
import { query, queryOne, execute, transaction, newId, nowIso } from '@/lib/db'
import { claimOrphanTransactions, activeSeasonForCustomer } from '@/lib/accounts'

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

      // Pre-fetch all customer_ids already in this season — replaces N per-row dup queries.
      const existingRows = await query<{ customer_id: string }>(
        'SELECT customer_id FROM ledgers WHERE season_id = ?',
        [seasonId],
      )
      const inSeason = new Set(existingRows.map((r) => r.customer_id))

      const toInsert: Array<{
        id: string; cid: string; customer_name: string; user_name: string;
        description: string; acres: number; credit_limit: number; display_number: number;
        closure_date: string;
      }> = []
      let skipped = 0

      for (const row of body.customers) {
        const cid = String(row.customer_id ?? '').trim()
        if (!cid || inSeason.has(cid)) { skipped++; continue }
        toInsert.push({
          id: newId(),
          cid,
          customer_name: String(row.customer_name ?? '').trim(),
          user_name: String(row.user_name ?? '').trim(),
          description: String(row.description ?? '').trim(),
          acres: Number(row.acres) || 0,
          credit_limit: Number(row.credit_limit) || 0,
          display_number: Number(row.display_number) || 0,
          closure_date: String(row.closure_date ?? '').trim(),
        })
      }

      if (toInsert.length > 0) {
        // A customer may be attached to several seasons. Only the OLDEST still-open
        // account is "active" (receives transactions) — enforced at entry/sale time.
        const ts = nowIso()
        await transaction((run) => {
          for (const r of toInsert) {
            run(
              `INSERT INTO ledgers
                (id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [r.id, seasonId, r.cid, r.customer_name, r.user_name, r.description, r.acres, r.credit_limit, r.display_number, r.closure_date, 0, 0, 0, 'open', ts],
            )
          }
        })

        // Claim orphan transactions in batch: one query to get all active seasons,
        // then two UPDATEs per active-season group instead of 3 queries per customer.
        const cidList = toInsert.map((r) => r.cid)
        const ph = cidList.map(() => '?').join(', ')
        const activeRows = await query<{ customer_id: string; season_id: string }>(
          `SELECT l.customer_id, l.season_id
           FROM ledgers l
           JOIN seasons s ON s.id = l.season_id
           WHERE l.customer_id IN (${ph}) AND l.status = 'open'
           ORDER BY l.customer_id, s.name ASC, l.created_at ASC`,
          cidList,
        )
        // First row per customer (lowest season name) = their active season.
        const activeSeason = new Map<string, string>()
        for (const r of activeRows) {
          if (!activeSeason.has(r.customer_id)) activeSeason.set(r.customer_id, r.season_id)
        }
        // Group customers by active season, then UPDATE in two queries per group.
        const byActiveSeason = new Map<string, string[]>()
        for (const [cid, sid] of activeSeason) {
          const grp = byActiveSeason.get(sid) ?? []
          grp.push(cid)
          byActiveSeason.set(sid, grp)
        }
        for (const [activeSid, cids] of byActiveSeason) {
          const cidPh = cids.map(() => '?').join(', ')
          await execute(
            `UPDATE sales_invoices SET season_id = ? WHERE customer_id IN (${cidPh}) AND (season_id IS NULL OR season_id = '')`,
            [activeSid, ...cids],
          )
          await execute(
            `UPDATE entries SET season_id = ? WHERE customer_id IN (${cidPh}) AND (season_id IS NULL OR season_id = '')`,
            [activeSid, ...cids],
          )
        }
      }

      return NextResponse.json({ created: toInsert.length, skipped }, { status: 201 })
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

    // One ledger per (season, customer), created ONCE — there is no update path.
    // Re-adding the same customer to a season is rejected.
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
      [seasonId, customerId],
    )
    if (existing) {
      return NextResponse.json(
        { error: `${customerName || 'This customer'} already has an account in this season.` },
        { status: 409 },
      )
    }

    // A customer may be attached to several seasons (multiple accounts). Only the
    // OLDEST still-open account is "active" and receives transactions — that rule
    // is enforced when entries/sales are posted, not here.

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

    // Adopt this customer's untagged sales/entries into their active season.
    await claimOrphanTransactions(customerId)

    return NextResponse.json(ledger, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// PUT /api/ledgers — update a ledger's detail fields by id.
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Ledger id is required' }, { status: 400 })
    }

    const customerName = String(body.customer_name ?? '').trim()
    const userName = String(body.user_name ?? '').trim()
    const description = String(body.description ?? '').trim()
    const acres = Number(body.acres) || 0
    const creditLimit = Number(body.credit_limit) || 0
    const displayNumber = Number(body.display_number) || 0
    const closureDate = String(body.closure_date ?? '').trim()

    await execute(
      `UPDATE ledgers SET customer_name = ?, user_name = ?, description = ?, acres = ?,
         credit_limit = ?, display_number = ?, closure_date = ? WHERE id = ?`,
      [customerName, userName, description, acres, creditLimit, displayNumber, closureDate, id],
    )
    const updated = await queryOne(`SELECT ${COLS} FROM ledgers WHERE id = ?`, [id])
    return NextResponse.json(updated, { status: 200 })
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
    // Move an entire account from one customer to another within a season.
    // Re-points the ledger row plus all of that season's sales & entries from the
    // source customer to the target. Body:
    //   { action: 'move', season_id, from_customer_id, to_customer_id, to_customer_name }
    if (String(body.action ?? '') === 'move') {
      const seasonId = String(body.season_id ?? '').trim()
      const fromId = String(body.from_customer_id ?? '').trim()
      const toId = String(body.to_customer_id ?? '').trim()
      const toName = String(body.to_customer_name ?? '').trim()

      if (!seasonId || !fromId || !toId) {
        return NextResponse.json(
          { error: 'Season, source account and target user are all required.' },
          { status: 400 },
        )
      }
      if (fromId === toId) {
        return NextResponse.json(
          { error: 'Source and target must be different customers.' },
          { status: 400 },
        )
      }

      // The source must actually be an account in this season.
      const source = await queryOne<{ id: string; customer_name: string; status: string }>(
        'SELECT id, customer_name, status FROM ledgers WHERE season_id = ? AND customer_id = ?',
        [seasonId, fromId],
      )
      if (!source) {
        return NextResponse.json(
          { error: 'The source account does not exist in this season.' },
          { status: 404 },
        )
      }
      if (source.status === 'closed') {
        return NextResponse.json(
          { error: `${source.customer_name || 'The source account'} is closed and cannot be moved. Reopen it first if a correction is needed.` },
          { status: 409 },
        )
      }

      // The target must NOT already have an account in this season (no merging).
      const targetInSeason = await queryOne<{ id: string }>(
        'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
        [seasonId, toId],
      )
      if (targetInSeason) {
        return NextResponse.json(
          {
            error: `${toName || 'The target customer'} already has an account in this season. Pick someone who isn't in this season.`,
          },
          { status: 409 },
        )
      }

      await transaction((run) => {
        run('UPDATE ledgers SET customer_id = ?, customer_name = ? WHERE id = ?', [
          toId,
          toName,
          source.id,
        ])
        run(
          'UPDATE entries SET customer_id = ?, customer_name = ? WHERE season_id = ? AND customer_id = ?',
          [toId, toName, seasonId, fromId],
        )
        run(
          'UPDATE sales_invoices SET customer_id = ?, customer_name = ? WHERE season_id = ? AND customer_id = ?',
          [toId, toName, seasonId, fromId],
        )
      })

      return NextResponse.json({
        moved: true,
        season_id: seasonId,
        from_customer_id: fromId,
        to_customer_id: toId,
      })
    }

    // Close / reopen both act on a ledger id.
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

// DELETE /api/ledgers?id=... — remove a customer's account from a season.
// Deletes the ledger row and its cash/credit entries, and untags its sales
// invoices (season_id → '') so the invoices survive and can be re-adopted if the
// customer is added to a season again.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = (searchParams.get('id') ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Ledger id is required' }, { status: 400 })
    }

    const ledger = await queryOne<{ season_id: string; customer_id: string; customer_name: string }>(
      'SELECT season_id, customer_id, customer_name FROM ledgers WHERE id = ?',
      [id],
    )
    if (!ledger) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Guard: refuse to delete an account that has entries.
    const hasEntries = await queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM entries WHERE season_id = ? AND customer_id = ?',
      [ledger.season_id, ledger.customer_id],
    )
    if ((hasEntries?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: `${ledger.customer_name || 'This account'} has cash/credit entries — close it instead of deleting.` },
        { status: 409 },
      )
    }

    // Guard: refuse to delete an account that has sales invoices.
    const hasSales = await queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sales_invoices WHERE season_id = ? AND customer_id = ?',
      [ledger.season_id, ledger.customer_id],
    )
    if ((hasSales?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: `${ledger.customer_name || 'This account'} has sales invoices — close it instead of deleting.` },
        { status: 409 },
      )
    }

    // Guard: refuse to delete the customer's active (oldest-open) account.
    const activeSeason = await activeSeasonForCustomer(ledger.customer_id)
    if (activeSeason === ledger.season_id) {
      return NextResponse.json(
        { error: `${ledger.customer_name || 'This account'} is the active account and cannot be deleted.` },
        { status: 409 },
      )
    }

    await transaction((run) => {
      run('DELETE FROM ledgers WHERE id = ?', [id])
      // entries and sales are already confirmed empty above — these are no-ops but
      // kept for safety so any race-condition remnant is also cleaned up.
      run('DELETE FROM entries WHERE season_id = ? AND customer_id = ?', [
        ledger.season_id,
        ledger.customer_id,
      ])
      run("UPDATE sales_invoices SET season_id = '' WHERE season_id = ? AND customer_id = ?", [
        ledger.season_id,
        ledger.customer_id,
      ])
    })

    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
