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
// A transaction belongs to the season it was created under (its season_id), so
// a sale/entry shows in exactly one season's ledger — the active one at the time.
export function buildLedgerLines(
  ledger: LedgerRecord,
  sales: SalesInvoice[],
  entries: Entry[],
): LedgerLine[] {
  const lines: LedgerLine[] = []

  // Carry-forward is fully manual: a carried balance is entered as an "O.B" cash/
  // credit entry (handled below), NOT via ledger.opening_balance. The stored
  // opening_balance is no longer rendered here, so a carried balance is counted
  // exactly once (single source of truth = the O.B entry).

  // Sales made under THIS season for this customer → debits (he owes).
  for (const s of sales) {
    if (s.customer_id !== ledger.customer_id) continue
    if ((s.season_id || '') !== ledger.season_id) continue
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

  // Entries: cash = he paid = credit; credit = given on credit = debit.
  // O.B-marked entries get the grey badge + top pin.
  for (const e of entries) {
    if (e.customer_id !== ledger.customer_id || e.season_id !== ledger.season_id) continue
    const isCash = e.type === 'cash'
    const isOB = /\bo\.?\s*b\b|opening|outstanding/i.test(e.comments || '')
    lines.push({
      id: `entry-${e.id}`,
      date: e.date || '',
      kind: isOB ? 'ob' : isCash ? 'cash' : 'credit',
      // An O.B is an outstanding amount the customer owes → always the owed side
      // (shop debit → shown as Credit in the customer view), whatever type it was.
      drcr: isOB ? 'debit' : isCash ? 'credit' : 'debit',
      description: isOB
        ? e.comments || 'Opening Balance'
        : `${isCash ? 'Cash' : 'Credit'} entry${e.comments ? ` · ${e.comments}` : ''}`,
      amount: Number(e.amount) || 0,
    })
  }

  // O.B lines always come first; everything else chronological.
  lines.sort((a, b) => {
    const aOb = a.kind === 'ob' ? 0 : 1
    const bOb = b.kind === 'ob' ? 0 : 1
    if (aOb !== bOb) return aOb - bOb
    const da = parseLedgerDate(a.date)?.getTime() ?? -Infinity
    const db = parseLedgerDate(b.date)?.getTime() ?? -Infinity
    return da - db
  })

  return lines
}

// ── Interest math (faithful to the legacy Accountant app) ───────────────────
// Day count, 30/360 convention. Mirrors the legacy `Days360`.
export function days360(from: Date, to: Date): number {
  let d1 = from.getDate()
  if (d1 === 31) d1 = 30
  let d2 = to.getDate()
  if (d2 === 31 && d1 === 30) d2 = 30
  return (
    360 * (to.getFullYear() - from.getFullYear()) +
    30 * (to.getMonth() - from.getMonth()) +
    (d2 - d1)
  )
}

// Day count for one side. basis 360 → 30/360 convention; 365 → actual calendar days.
export function dayCount(from: Date, to: Date, basis: 360 | 365): number {
  if (basis === 365) {
    return Math.round((to.getTime() - from.getTime()) / 86400000)
  }
  return days360(from, to)
}

// Legacy custom paise rounding (`RoundOff`): <30p → floor, 30–59p → .50, ≥60p → round up.
export function roundOff(x: number): number {
  const paise = ((Math.round(x * 100) % 100) + 100) % 100
  if (paise === 0) return x
  if (paise < 30) return Math.trunc(x)
  if (paise < 60) return Math.trunc(x) + 0.5
  return Math.round(x)
}

// One line's interest = amount × (days / 30) × (ratePerMonth / 100), then RoundOff.
// `rate` is a PER-MONTH percentage (the /30 turns days into months) — this is the
// legacy convention, not an annual rate.
export function lineInterest(amount: number, ratePerMonth: number, days: number): number {
  if (days <= 0 || ratePerMonth <= 0 || amount <= 0) return 0
  return roundOff(amount * (days / 30) * (ratePerMonth / 100))
}

export function totalsFor(lines: LedgerLine[]) {
  const debit = lines.filter((l) => l.drcr === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.drcr === 'credit').reduce((s, l) => s + l.amount, 0)
  return { debit, credit, grand: debit - credit }
}

export const inr = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
