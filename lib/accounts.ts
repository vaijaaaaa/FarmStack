// Shared Accounts-module helpers (server-only).
import { queryOne, execute, newId, nowIso } from '@/lib/db'

// The customer's currently ACTIVE (open) season — the ledger their new
// transactions bind to. Latest open ledger wins; '' if they have none.
export async function activeSeasonForCustomer(customerId: string): Promise<string> {
  if (!customerId) return ''
  const row = await queryOne<{ season_id: string }>(
    `SELECT season_id FROM ledgers
     WHERE customer_id = ? AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    [customerId],
  )
  return row?.season_id ?? ''
}

// Ensure a (season, customer) ledger row exists so any entry/sale for that
// customer shows up in the Accounts ledger. A new ledger always opens at ₹0 —
// carry-forward is now manual (done from the close flow), never automatic.
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

  await execute(
    `INSERT INTO ledgers
      (id, season_id, customer_id, customer_name, user_name, description, acres, credit_limit, display_number, closure_date, opening_balance, closing_balance, carried, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), seasonId, customerId, customerName, '', '', 0, 0, 0, '', 0, 0, 0, 'open', nowIso()],
  )
}
