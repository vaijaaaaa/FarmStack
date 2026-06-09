// Shared Accounts-module helpers (server-only).
import { queryOne, execute, newId, nowIso } from '@/lib/db'

// The customer's currently ACTIVE (open) season — the ledger their new
// transactions bind to. The EARLIEST still-open ledger is the active account:
// everything accumulates there until it's closed, even if the customer has been
// added to a newer season too. '' if they have no open account.
export async function activeSeasonForCustomer(customerId: string): Promise<string> {
  if (!customerId) return ''
  // Active = the OLDEST open season by season CHRONOLOGY (name, e.g. "2027 Dalwa"
  // < "2028 Dalwa"), NOT by ledger-row creation order. Otherwise adding accounts
  // out of order would make a newer season "active" and misroute transactions.
  const row = await queryOne<{ season_id: string }>(
    `SELECT l.season_id FROM ledgers l
     JOIN seasons s ON s.id = l.season_id
     WHERE l.customer_id = ? AND l.status = 'open'
     ORDER BY s.name ASC, l.created_at ASC LIMIT 1`,
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
  // A fresh ledger may become the customer's active account → adopt any untagged
  // (orphan) sales/entries made before they had any account.
  await claimOrphanTransactions(customerId)
}

// Bind a customer's untagged transactions to their ACTIVE (oldest-open) season.
// Sales/entries made before the customer had any open account carry season_id = ''
// and are invisible in the Accounts ledgers; they belong to the active account.
// Always routes to the active season (never the just-created one), so creating a
// newer account never steals orphans from the rightful oldest season. Only ever
// touches still-untagged rows, so it's safe to call repeatedly.
export async function claimOrphanTransactions(customerId: string): Promise<void> {
  if (!customerId) return
  const active = await activeSeasonForCustomer(customerId)
  if (!active) return
  await execute(
    "UPDATE sales_invoices SET season_id = ? WHERE customer_id = ? AND (season_id IS NULL OR season_id = '')",
    [active, customerId],
  )
  await execute(
    "UPDATE entries SET season_id = ? WHERE customer_id = ? AND (season_id IS NULL OR season_id = '')",
    [active, customerId],
  )
}
