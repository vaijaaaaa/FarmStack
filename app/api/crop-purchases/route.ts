import { NextResponse } from 'next/server'
import { query, queryOne, transaction, newId, nowIso } from '@/lib/db'
import { ensureLedgerExists, activeSeasonForCustomer } from '@/lib/accounts'

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
// Batch insert. Body:
//   { season_id, labour_per_bag, wt_adj_per_bag, less_percent,
//     rows: [{ customer_id, customer_name, is_walkin, bags, weight, price, vehicle_number, net_amount, date }] }
// DB-customer rows (customer_id set, is_walkin 0) post to the customer's active
// season ledger as a credit and are gated exactly like /api/entries. Walk-in rows
// (customer_id null, is_walkin 1) are recorded only — they bypass all ledger logic.
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const seasonId = String(body.season_id ?? '').trim()
    if (!seasonId) {
      return NextResponse.json({ error: 'Please select a season' }, { status: 400 })
    }

    const labourPerBag = Number(body.labour_per_bag) || 0
    const wtAdjPerBag = Number(body.wt_adj_per_bag) || 0
    const lessPercent = Number(body.less_percent) || 0
    const createdAt = nowIso()

    const rowsIn = Array.isArray(body.rows) ? body.rows : []
    const purchases = rowsIn
      .map((r: Record<string, unknown>) => {
        const isWalkin = r.is_walkin ? 1 : 0
        const cid = String(r.customer_id ?? '').trim()
        return {
          id: newId(),
          season_id: seasonId,
          // Walk-ins carry no customer FK.
          customer_id: isWalkin ? null : cid || null,
          customer_name: String(r.customer_name ?? '').trim(),
          is_walkin: isWalkin,
          bags: Number(r.bags) || 0,
          weight: Number(r.weight) || 0,
          price: Number(r.price) || 0,
          vehicle_number: String(r.vehicle_number ?? '').trim(),
          labour_per_bag: labourPerBag,
          wt_adj_per_bag: wtAdjPerBag,
          less_percent: lessPercent,
          net_amount: Number(r.net_amount) || 0,
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
      season_id: string
    }
    const ledgerRows = (purchases as CropRow[]).filter((p) => p.customer_id && !p.is_walkin)

    // ── Ledger gating (DB customers only) — mirrors /api/entries ──────────────
    // A customer's crop value goes ONLY to their ACTIVE (oldest-open) account. If
    // their active account is in a different season than the one picked, block it.
    const activeCache = new Map<string, string>()
    const checkedActive = new Set<string>()
    for (const p of ledgerRows) {
      const cid = p.customer_id as string
      if (checkedActive.has(cid)) continue
      checkedActive.add(cid)
      if (!activeCache.has(cid)) {
        activeCache.set(cid, await activeSeasonForCustomer(cid))
      }
      const active = activeCache.get(cid) as string
      if (active && active !== seasonId) {
        const sn = await queryOne<{ name: string }>('SELECT name FROM seasons WHERE id = ?', [active])
        return NextResponse.json(
          {
            error: `${p.customer_name || 'This customer'} has an active account in ${sn?.name || 'another season'}. Close & move it before adding to a new season.`,
          },
          { status: 409 },
        )
      }
    }

    // Block posting to a CLOSED account in the picked season.
    const checkedClosed = new Set<string>()
    for (const p of ledgerRows) {
      const cid = p.customer_id as string
      if (checkedClosed.has(cid)) continue
      checkedClosed.add(cid)
      const closed = await queryOne<{ id: string }>(
        "SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ? AND status = 'closed'",
        [seasonId, cid],
      )
      if (closed) {
        return NextResponse.json(
          { error: `${p.customer_name || 'This customer'}'s account is closed — open a new season for them first.` },
          { status: 409 },
        )
      }
    }

    // Insert ALL rows (DB customers + walk-ins) in one transaction.
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

    // Ensure each DB customer has a ledger in the picked season so the crop line
    // shows up in the Accounts ledger. Walk-ins get no ledger.
    const seen = new Set<string>()
    for (const p of ledgerRows) {
      const cid = p.customer_id as string
      if (seen.has(cid)) continue
      seen.add(cid)
      await ensureLedgerExists(seasonId, cid, p.customer_name)
    }

    return NextResponse.json({ created: purchases }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
