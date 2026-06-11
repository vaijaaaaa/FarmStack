import { NextResponse } from 'next/server'
import { query, queryOne, transaction, newId, nowIso } from '@/lib/db'
import { ensureLedgerExists, activeSeasonForCustomer } from '@/lib/accounts'
import { pattiNet } from '@/lib/cropPatti'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS =
  'id, season_id, customer_id, customer_name, is_walkin, bags, weight, price, vehicle_number, labour_per_bag, wt_adj_per_bag, less_percent, net_amount, date, created_at'

// GET /api/crop-purchases?season_id=...&customer_id=...
// Both filters optional. Without filters, returns every crop purchase (newest first).
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
      `SELECT ${COLS} FROM crop_purchases
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC`,
      params,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/crop-purchases
// Batch insert in ONE transaction (atomic — no partial commits). Body:
//   { labour_per_bag, wt_adj_per_bag, less_percent,
//     rows: [{ season_id, customer_id, customer_name, is_walkin, bags, weight, price, vehicle_number, net_amount, date }] }
// Each row carries its OWN season, so a single save can span seasons and still be
// all-or-nothing. DB-customer rows (customer_id set, is_walkin 0) post to that
// season's ledger as a credit and are gated like /api/entries. Walk-in rows
// (customer_id null, is_walkin 1) are recorded only — they bypass all ledger logic
// and never carry a season.
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const labourPerBag = Number(body.labour_per_bag) || 0
    const wtAdjPerBag = Number(body.wt_adj_per_bag) || 0
    const lessPercent = Number(body.less_percent) || 0
    const createdAt = nowIso()

    const rowsIn = Array.isArray(body.rows) ? body.rows : []
    const purchases = rowsIn
      .map((r: Record<string, unknown>) => {
        const isWalkin = r.is_walkin ? 1 : 0
        const cid = String(r.customer_id ?? '').trim()
        const rSeason = String(r.season_id ?? '').trim()
        const bags = Number(r.bags) || 0
        const weight = Number(r.weight) || 0
        const price = Number(r.price) || 0
        return {
          id: newId(),
          // Walk-ins never belong to a season (no ledger/account). DB rows use the
          // row's own season. Empty → NULL (FK to seasons; '' would violate it).
          season_id: isWalkin ? null : rSeason || null,
          // Walk-ins carry no customer FK.
          customer_id: isWalkin ? null : cid || null,
          customer_name: String(r.customer_name ?? '').trim(),
          is_walkin: isWalkin,
          bags,
          weight,
          price,
          vehicle_number: String(r.vehicle_number ?? '').trim(),
          labour_per_bag: labourPerBag,
          wt_adj_per_bag: wtAdjPerBag,
          less_percent: lessPercent,
          // AUTHORITATIVE: the server recomputes the net from the inputs with the
          // shared Patti formula and ignores any client-sent net_amount. This is the
          // value posted to the ledger, so the browser can never set it.
          net_amount: pattiNet(bags, weight, price, {
            labourPerBag,
            wtAdjPerBag,
            lessPercent,
          }),
          date: String(r.date ?? '').trim(),
          created_at: createdAt,
        }
      })
      .filter(
        (p: { customer_id: string | null; is_walkin: number; customer_name: string; net_amount: number }) =>
          // Keep rows that identify a seller (DB customer OR named walk-in) and
          // have a positive value.
          (p.customer_id || (p.is_walkin && p.customer_name)) && p.net_amount > 0,
      )

    if (purchases.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one row with a customer and a value' },
        { status: 400 },
      )
    }

    type CropRow = {
      customer_id: string | null
      customer_name: string
      is_walkin: number
      season_id: string | null
    }
    const ledgerRows = (purchases as CropRow[]).filter((p) => p.customer_id && !p.is_walkin)

    // Every DB-customer row must carry a season (its crop posts to that ledger).
    for (const p of ledgerRows) {
      if (!p.season_id) {
        return NextResponse.json(
          { error: `Please select a season for ${p.customer_name || 'the selected customer'}` },
          { status: 400 },
        )
      }
    }

    // ── Ledger gating (DB customers only) — mirrors /api/entries ──────────────
    // A customer's crop value goes ONLY to their ACTIVE (oldest-open) account, so
    // each DB row's season must equal that customer's active season.
    const activeCache = new Map<string, string>()
    for (const p of ledgerRows) {
      const cid = p.customer_id as string
      if (!activeCache.has(cid)) {
        activeCache.set(cid, await activeSeasonForCustomer(cid))
      }
      const active = activeCache.get(cid) as string
      if (active && active !== p.season_id) {
        const sn = await queryOne<{ name: string }>('SELECT name FROM seasons WHERE id = ?', [active])
        return NextResponse.json(
          {
            error: `${p.customer_name || 'This customer'} has an active account in ${sn?.name || 'another season'}. Close & move it before adding to a new season.`,
          },
          { status: 409 },
        )
      }
    }

    // Block posting to a CLOSED account in the row's season.
    const checkedClosed = new Set<string>()
    for (const p of ledgerRows) {
      const key = `${p.season_id}|${p.customer_id}`
      if (checkedClosed.has(key)) continue
      checkedClosed.add(key)
      const closed = await queryOne<{ id: string }>(
        "SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ? AND status = 'closed'",
        [p.season_id, p.customer_id],
      )
      if (closed) {
        return NextResponse.json(
          { error: `${p.customer_name || 'This customer'}'s account is closed — open a new season for them first.` },
          { status: 409 },
        )
      }
    }

    // Insert ALL rows (every season, DB customers + walk-ins) in ONE transaction —
    // all-or-nothing, so a failure never leaves a partially-saved batch behind.
    await transaction((run) => {
      for (const p of purchases) {
        run(
          `INSERT INTO crop_purchases
            (id, season_id, customer_id, customer_name, is_walkin, bags, weight, price, vehicle_number, labour_per_bag, wt_adj_per_bag, less_percent, net_amount, date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.season_id,
            p.customer_id,
            p.customer_name,
            p.is_walkin,
            p.bags,
            p.weight,
            p.price,
            p.vehicle_number,
            p.labour_per_bag,
            p.wt_adj_per_bag,
            p.less_percent,
            p.net_amount,
            p.date,
            p.created_at,
          ],
        )
      }
    })

    // Ensure each (season, DB customer) has a ledger so the crop line shows up in
    // the Accounts ledger. Walk-ins get no ledger.
    const seen = new Set<string>()
    for (const p of ledgerRows) {
      const key = `${p.season_id}|${p.customer_id}`
      if (seen.has(key)) continue
      seen.add(key)
      await ensureLedgerExists(p.season_id as string, p.customer_id as string, p.customer_name)
    }

    return NextResponse.json({ created: purchases }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
