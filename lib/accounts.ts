// Shared Accounts-module helpers (server-only).
import { queryOne, transaction, newId, nowIso } from '@/lib/db'

// Ensure a (season, customer) ledger row exists so any sale/entry for that
// customer shows up in the Accounts ledger. If it's missing, create it —
// pulling the opening balance from the customer's most recent CLOSED,
// not-yet-carried ledger (the same auto carry-forward used by Ledger Adding).
export async function ensureLedgerExists(
  seasonId: string,
  customerId: string,
  customerName: string,
): Promise<void> {
  if (!seasonId || !customerId) return

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM ledgers WHERE season_id = ? AND customer_id = ?',
    [seasonId, customerId],
  )
  if (existing) return

  const prior = await queryOne<{ id: string; closing_balance: number }>(
    `SELECT id, closing_balance FROM ledgers
     WHERE customer_id = ? AND status = 'closed' AND carried = 0
     ORDER BY closure_date DESC, created_at DESC
     LIMIT 1`,
    [customerId],
  )
  const openingBalance = prior ? Number(prior.closing_balance) || 0 : 0
  const id = newId()

  await transaction((run) => {
    run(
      `INSERT INTO ledgers
        (id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, seasonId, customerId, customerName, '', '', 0, 0, 0, '', openingBalance, 0, 0, 'open', nowIso()],
    )
    if (prior) {
      run('UPDATE ledgers SET carried = 1 WHERE id = ?', [prior.id])
    }
  })
}
