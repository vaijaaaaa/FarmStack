// Local types + seed data for the Accounts (season-based customer ledger) UI.
// This is a front-end design pass — data lives in component state for now and will
// be replaced by real API/DB calls later. Full spec: /accounts.md
// NOTE: the "User" field is a placeholder pending the Account-vs-User clarification.

export type { Season } from '@/types/farmstack'

export type LineKind = 'ob' | 'bill' | 'entry'
export type DrCr = 'debit' | 'credit'

export interface LedgerLine {
  id: string
  date: string // dd-mm-yy as shown in the old software
  kind: LineKind
  drcr: DrCr
  description: string
  amount: number
}

export interface Ledger {
  id: string
  seasonId: string
  account: string // the party / customer (e.g. "M S R")
  user: string // placeholder — meaning TBD
  description: string
  acres: number
  creditLimit: number // the "Loyality" field
  displayNumber: number
  closureDate: string // '' until closed
  status: 'open' | 'closed'
  lines: LedgerLine[]
}

// Customers available to attach to a season (mirrors the names in the screenshots).
export const SEED_CUSTOMERS = ['M S R', 'm prasad', 'HALESH', 'Rajesh', 'Suresh K']

// One fully-populated ledger mirroring the Display/Closure screenshots
// (MSR in 2026 Dalwa: O.B credit 1,92,900 + four bills).
export const SEED_LEDGERS: Ledger[] = [
  {
    id: 'l-msr-2026-dalwa',
    seasonId: 's-2026-dalwa',
    account: 'M S R',
    user: '',
    description: 'M S R',
    acres: 12,
    creditLimit: 50000,
    displayNumber: 1,
    closureDate: '',
    status: 'open',
    lines: [
      { id: 'ln1', date: '06-12-25', kind: 'ob', drcr: 'credit', description: 'CREDIT : BNKL : O.B', amount: 192900 },
      { id: 'ln2', date: '13-12-25', kind: 'bill', drcr: 'debit', description: 'BILL : BNKL : m prasad', amount: 1930 },
      { id: 'ln3', date: '16-12-25', kind: 'bill', drcr: 'debit', description: 'BILL : BNKL : m prasad', amount: 3770 },
      { id: 'ln4', date: '21-12-25', kind: 'bill', drcr: 'debit', description: 'BILL : BNKL : HALESH', amount: 4650 },
      { id: 'ln5', date: '22-12-25', kind: 'bill', drcr: 'debit', description: 'BILL : BNKL : m prasad', amount: 5920 },
    ],
  },
  {
    id: 'l-prasad-2026-dalwa',
    seasonId: 's-2026-dalwa',
    account: 'm prasad',
    user: '',
    description: 'm prasad',
    acres: 6,
    creditLimit: 25000,
    displayNumber: 2,
    closureDate: '',
    status: 'open',
    lines: [
      { id: 'lp1', date: '10-12-25', kind: 'bill', drcr: 'debit', description: 'BILL : BNKL : self', amount: 8200 },
    ],
  },
]

export function totalsFor(lines: LedgerLine[]) {
  const debit = lines.filter((l) => l.drcr === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter((l) => l.drcr === 'credit').reduce((s, l) => s + l.amount, 0)
  return { debit, credit, grand: debit - credit }
}

export const inr = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
