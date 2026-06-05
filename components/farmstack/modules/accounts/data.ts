// Types + helpers for the Accounts (season-based customer ledger) module.
// Ledger records live in the DB (LedgerRecord); the ledger *lines* shown on the
// Display/Closure screens are composed on the fly from sales (debits) + entries
// (cash = credit / credit = debit) + the carried opening balance.
import type { LedgerRecord, SalesInvoice, Entry } from '@/types/farmstack'

export type { Season, LedgerRecord } from '@/types/farmstack'

export type LineKind = 'ob' | 'sale' | 'cash' | 'credit'
export type DrCr = 'debit' | 'credit'

export interface LedgerLine {
  id: string
  date: string // ISO YYYY-MM-DD, or '' for the opening balance
  kind: LineKind
  drcr: DrCr
  description: string
  amount: number
  sale?: SalesInvoice // present on sale lines so the row can open a details popup
}

// ── Date helpers ────────────────────────────────────────────────────────────
// Sales/entry dates are stored as ISO (YYYY-MM-DD); be tolerant of dd-mm-yyyy too.
export function parseLedgerDate(s: string): Date | null {
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{2,4})$/)
  if (dmy) {
    const y = Number(dmy[3])
    return new Date(y < 100 ? 2000 + y : y, Number(dmy[2]) - 1, Number(dmy[1]))
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t)
}

export function fmtDate(s: string): string {
  const d = parseLedgerDate(s)
  if (!d) return s || '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

// Compose the ledger lines for one customer-in-a-season from sales + entries.
export function buildLedgerLines(
  ledger: LedgerRecord,
  sales: SalesInvoice[],
  entries: Entry[],
): LedgerLine[] {
  const lines: LedgerLine[] = []

  // Opening balance carried from a prior season's closure.
  if (ledger.opening_balance && ledger.opening_balance !== 0) {
    const isCredit = ledger.opening_balance < 0
    lines.push({
      id: `ob-${ledger.id}`,
      date: '',
      kind: 'ob',
      drcr: isCredit ? 'credit' : 'debit',
      description: 'Opening Balance',
      amount: Math.abs(ledger.opening_balance),
    })
  }

  // Sales for this customer → debits (customer owes for goods bought).
  for (const s of sales) {
    if (s.customer_id !== ledger.customer_id) continue
    lines.push({
      id: `sale-${s.id}`,
      date: s.date || s.created_at || '',
      kind: 'sale',
      drcr: 'debit',
      description: `Sales made${s.invoice_number ? ` · ${s.invoice_number}` : ''}`,
      amount: Number(s.total) || 0,
      sale: s,
    })
  }

  // Entries for this customer in this season → cash = credit, credit = debit.
  for (const e of entries) {
    if (e.customer_id !== ledger.customer_id || e.season_id !== ledger.season_id) continue
    const isCash = e.type === 'cash'
    lines.push({
      id: `entry-${e.id}`,
      date: e.date || '',
      kind: isCash ? 'cash' : 'credit',
      drcr: isCash ? 'credit' : 'debit',
      description: `${isCash ? 'Cash' : 'Credit'} entry${e.comments ? ` · ${e.comments}` : ''}`,
      amount: Number(e.amount) || 0,
    })
  }

  // Chronological; opening balance (no date) stays first.
  lines.sort((a, b) => {
    const da = parseLedgerDate(a.date)?.getTime() ?? -Infinity
    const db = parseLedgerDate(b.date)?.getTime() ?? -Infinity
    return da - db
  })

  return lines
}

export function totalsFor(lines: LedgerLine[]) {
  const debit = lines.filter((l) => l.drcr === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.drcr === 'credit').reduce((s, l) => s + l.amount, 0)
  return { debit, credit, grand: debit - credit }
}

export const inr = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
