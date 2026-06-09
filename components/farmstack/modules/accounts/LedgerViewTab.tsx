'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Lock, X, Calculator, BookOpen } from 'lucide-react'
import { useSalesInvoices, useEntries, useProducts } from '@/hooks/useDatabase'
import type { LedgerRecord, Season, SalesInvoice } from '@/types/farmstack'
import EntriesGrid from '../EntriesGrid'
import {
  buildLedgerLines,
  totalsFor,
  inr,
  fmtDate,
  parseLedgerDate,
  dayCount,
  lineInterest,
  type LedgerLine,
  type LineKind,
} from './data'

interface LedgerViewTabProps {
  seasons: Season[]
  ledgers: LedgerRecord[]
  onClose?: (
    ledgerId: string,
    closureDate: string,
    closingBalance: number,
  ) => Promise<void> | void
  onReopen?: (ledgerId: string) => Promise<void> | void
  onDataChanged?: () => void
}

type OptionFilter = 'all' | 'debit' | 'credit'
type Basis = 360 | 365

const today = () => new Date().toISOString().slice(0, 10)

// Colored badge per line kind (sales = green, per the ledger spec).
const KIND_BADGE: Record<LineKind, { label: string; cls: string }> = {
  ob: { label: 'O.B', cls: 'bg-gray-100 text-gray-600' },
  sale: { label: 'Sales', cls: 'bg-green-100 text-green-700' },
  cash: { label: 'Cash', cls: 'bg-sky-100 text-sky-700' },
  credit: { label: 'Credit', cls: 'bg-amber-100 text-amber-700' },
}

export default function LedgerViewTab({ seasons, ledgers, onClose, onReopen, onDataChanged }: LedgerViewTabProps) {
  // Interest / closure controls are hidden until toggled with Ctrl+I.
  const [closureMode, setClosureMode] = useState(false)
  const closing = closureMode

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        setClosureMode((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const { invoices } = useSalesInvoices()
  const { entries, refresh: refreshEntries } = useEntries()
  const { products } = useProducts()

  const [seasonId, setSeasonId] = useState('')
  const [ledgerId, setLedgerId] = useState('')
  const [option, setOption] = useState<OptionFilter>('all')
  const [closureDate, setClosureDate] = useState(today())
  // Rates are user-entered (dynamic) — no hard-coded defaults.
  const [debitRate, setDebitRate] = useState('')
  const [creditRate, setCreditRate] = useState('')
  const [debitBasis, setDebitBasis] = useState<Basis>(365)
  const [creditBasis, setCreditBasis] = useState<Basis>(360)
  const [interest, setInterest] = useState<Record<string, { interest: number; days: number }>>({})
  const [interestSummary, setInterestSummary] = useState({ debit: 0, credit: 0 })
  const [calculated, setCalculated] = useState(false)
  const [closing_, setClosing_] = useState(false)
  const [showEntry, setShowEntry] = useState(false)
  const [saleDetail, setSaleDetail] = useState<SalesInvoice | null>(null)

  const seasonLedgers = useMemo(
    () => ledgers.filter((l) => l.season_id === seasonId),
    [ledgers, seasonId],
  )
  const ledger = ledgers.find((l) => l.id === ledgerId && l.season_id === seasonId) ?? null

  const lines = useMemo(
    () => (ledger ? buildLedgerLines(ledger, invoices, entries) : []),
    [ledger, invoices, entries],
  )

  const { debit, credit, grand } = totalsFor(lines)

  const visibleLines = useMemo(() => {
    if (option === 'all') return lines
    return lines.filter((l) => l.drcr === option)
  }, [lines, option])

  // Pure interest pass — used by Calculate (to fill the grid) and Close (fresh net).
  const computeAll = (closeStr: string) => {
    const close = parseLedgerDate(closeStr)
    const map: Record<string, { interest: number; days: number }> = {}
    let di = 0
    let ci = 0
    if (close) {
      const dr = Number(debitRate) || 0
      const cr = Number(creditRate) || 0
      for (const l of lines) {
        const from = parseLedgerDate(l.date)
        if (!from) continue // opening balance has no date → does not accrue
        const isDebit = l.drcr === 'debit'
        const basis = isDebit ? debitBasis : creditBasis
        const rate = isDebit ? dr : cr
        const days = Math.max(0, dayCount(from, close, basis))
        const intr = lineInterest(l.amount, rate, days)
        map[l.id] = { days, interest: intr }
        if (isDebit) di += intr
        else ci += intr
      }
    }
    return { map, debitInterest: di, creditInterest: ci }
  }

  const calculate = () => {
    const r = computeAll(closureDate)
    setInterest(r.map)
    setInterestSummary({ debit: r.debitInterest, credit: r.creditInterest })
    setCalculated(true)
  }

  const grandInterest = interestSummary.debit - interestSummary.credit
  const totalInterest = grandInterest
  // Net closing balance = (debit − credit) + (debit interest − credit interest).
  const netCarry = debit - credit + grandInterest

  // Close the account. Carrying the outstanding forward is done manually via the
  // Add Entry button (pick the next season + the outstanding as O.B).
  const doClose = async () => {
    if (!onClose || !ledger || !closureDate) return
    setClosing_(true)
    try {
      const r = computeAll(closureDate) // fresh — never trust stale state
      const net = debit - credit + (r.debitInterest - r.creditInterest)
      await onClose(ledger.id, closureDate, net)
    } finally {
      setClosing_(false)
    }
  }

  const resetCalc = () => {
    setInterest({})
    setInterestSummary({ debit: 0, credit: 0 })
    setCalculated(false)
  }

  const selectSeason = (id: string) => {
    setSeasonId(id)
    setLedgerId('')
    resetCalc()
  }

  return (
    <div className="mt-4">
      {/* ── Pickers ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Picker label="Season">
          <select
            value={seasonId}
            onChange={(e) => selectSeason(e.target.value)}
            className="w-52 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="">— Select season —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.description || '(untitled)'}</option>
            ))}
          </select>
        </Picker>

        <Picker label="Account">
          <select
            value={ledgerId}
            onChange={(e) => { setLedgerId(e.target.value); resetCalc() }}
            disabled={!seasonId}
            className="w-52 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="">— Select account —</option>
            {seasonLedgers.map((l) => (
              <option key={l.id} value={l.id}>{l.customer_name}</option>
            ))}
          </select>
        </Picker>

        {ledger && (
          <Picker label="Option">
            <select
              value={option}
              onChange={(e) => setOption(e.target.value as OptionFilter)}
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="all">All</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </Picker>
        )}

        {ledger && (
          <button
            onClick={() => setShowEntry(true)}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400"
          >
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        )}

        {ledger && (
          <button
            onClick={() => setClosureMode((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium ${
              closing ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
            }`}
            title="Toggle interest & closure (Ctrl+I)"
          >
            <Calculator className="h-3.5 w-3.5" /> Interest / Close
            <kbd className="ml-1 rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">Ctrl+I</kbd>
          </button>
        )}

        {ledger && closing && (
          <Picker label="Closure Date">
            <input
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
          </Picker>
        )}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!ledger ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">
            Select a season and account to {closing ? 'close' : 'view'} the ledger
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <Stat label="Debit" value={`₹${inr(debit)}`} />
            <Stat label="Credit" value={`₹${inr(credit)}`} />
            <Stat
              label="Grand Total"
              value={`₹${inr(Math.abs(grand))} ${grand < 0 ? 'Cr' : 'Dr'}`}
              accent={grand < 0 ? 'green' : 'default'}
            />
            {closing && calculated && (
              <>
                <Stat label="Debit Interest" value={`₹${inr(interestSummary.debit)}`} />
                <Stat label="Credit Interest" value={`₹${inr(interestSummary.credit)}`} />
                <Stat label="Grand Interest" value={`₹${inr(grandInterest)}`} />
                <Stat
                  label="Closing Balance"
                  value={`₹${inr(Math.abs(netCarry))} ${netCarry < 0 ? 'Cr' : 'Dr'}`}
                  accent={netCarry < 0 ? 'green' : 'default'}
                />
              </>
            )}
          </div>

          {/* Interest + closure panel (closure only) */}
          {closing && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex flex-wrap items-end gap-5">
                <span className="pb-2 text-sm font-semibold text-amber-800">Accrual Interest</span>
                <RateField
                  label="Debit % / month"
                  value={debitRate}
                  onChange={(v) => { setDebitRate(v); setCalculated(false) }}
                  basisValue={debitBasis}
                  onBasisChange={(b) => { setDebitBasis(b); setCalculated(false) }}
                />
                <RateField
                  label="Credit % / month"
                  value={creditRate}
                  onChange={(v) => { setCreditRate(v); setCalculated(false) }}
                  basisValue={creditBasis}
                  onBasisChange={(b) => { setCreditBasis(b); setCalculated(false) }}
                />
                <button
                  onClick={calculate}
                  className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <Calculator className="h-4 w-4" /> Calculate
                </button>

                {/* Account status — green Open / red Closed (beside Calculate) */}
                <span
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    ledger.status === 'closed' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {ledger.status === 'closed' ? 'Closed' : 'Open'}
                  {ledger.status === 'closed' && ledger.closure_date ? ` · ${fmtDate(ledger.closure_date)}` : ''}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-amber-200 pt-4">
                {calculated && (
                  <div className="text-sm text-amber-900">
                    Closing balance{' '}
                    <span className="font-semibold">
                      ₹{inr(Math.abs(netCarry))} {netCarry < 0 ? 'Cr' : 'Dr'}
                    </span>
                    <span className="text-amber-700">
                      {' '}— use Add Entry to carry it into the next season as O.B.
                    </span>
                  </div>
                )}

                {ledger.status === 'closed' ? (
                  <button
                    onClick={() => onReopen && onReopen(ledger.id)}
                    className="ml-auto flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400"
                  >
                    Re-open
                  </button>
                ) : (
                  <button
                    onClick={doClose}
                    disabled={!closureDate || closing_}
                    className="ml-auto flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
                  >
                    <Lock className="h-4 w-4" />
                    {closing_ ? 'Closing…' : 'Close A/C'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Lines table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="w-32 px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Bill Description</th>
                  <th className="w-40 px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  {closing && <th className="w-20 px-4 py-3 text-right font-medium text-gray-500">Days</th>}
                  {closing && <th className="w-28 px-4 py-3 text-right font-medium text-gray-500">Interest</th>}
                </tr>
              </thead>
              <tbody>
                {visibleLines.length === 0 ? (
                  <tr>
                    <td colSpan={closing ? 5 : 3} className="px-4 py-10 text-center text-sm text-gray-400">
                      No lines yet — make a sale or add an entry for this customer.
                    </td>
                  </tr>
                ) : (
                  visibleLines.map((l) => {
                    const badge = KIND_BADGE[l.kind]
                    const clickable = l.kind === 'sale' && l.sale
                    return (
                      <tr
                        key={l.id}
                        onClick={clickable ? () => setSaleDetail(l.sale!) : undefined}
                        className={`border-b border-gray-50 last:border-0 ${
                          clickable ? 'cursor-pointer hover:bg-green-50/40' : 'hover:bg-gray-50'
                        } ${l.kind === 'ob' ? 'bg-amber-50/40' : ''}`}
                      >
                        <td className="px-4 py-3 text-gray-600">{fmtDate(l.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <span className="text-gray-700">{l.description}</span>
                          {clickable && <span className="ml-2 text-[10px] text-green-600">view →</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-gray-900">₹{inr(l.amount)}</span>
                          <span className={`ml-1.5 text-[10px] font-semibold ${l.drcr === 'debit' ? 'text-gray-500' : 'text-green-600'}`}>
                            {l.drcr === 'debit' ? 'Dr' : 'Cr'}
                          </span>
                        </td>
                        {closing && <td className="px-4 py-3 text-right text-gray-500">{interest[l.id]?.days ?? '—'}</td>}
                        {closing && <td className="px-4 py-3 text-right text-gray-600">₹{inr(interest[l.id]?.interest ?? 0)}</td>}
                      </tr>
                    )
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={2} className="px-4 py-3 text-sm font-medium text-gray-500">
                    Debit ₹{inr(debit)} · Credit ₹{inr(credit)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₹{inr(Math.abs(grand))} {grand < 0 ? 'Cr' : 'Dr'}
                  </td>
                  {closing && <td />}
                  {closing && <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{inr(totalInterest)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Add Entry — the Entries-page grid in a modal, locked to this customer.
          Pick the season; closed seasons are excluded so you can carry the
          outstanding into the next season as O.B. */}
      {showEntry && ledger && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800">Add Entry · {ledger.customer_name}</h3>
              <button onClick={() => setShowEntry(false)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <EntriesGrid
                lockedCustomer={{ id: ledger.customer_id, name: ledger.customer_name }}
                defaultSeasonId={ledger.status === 'closed' ? '' : ledger.season_id}
                excludeSeasonIds={ledgers
                  .filter((l) => l.customer_id === ledger.customer_id && l.status === 'closed')
                  .map((l) => l.season_id)}
                onAdded={() => {
                  refreshEntries()
                  onDataChanged?.()
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sale details popup */}
      {saleDetail && (
        <SalesDetailModal
          sale={saleDetail}
          productName={(id) => products.find((p) => p.id === id)?.name ?? id}
          onClose={() => setSaleDetail(null)}
        />
      )}

    </div>
  )
}

// ── Sales detail popup ──────────────────────────────────────────────────────
function SalesDetailModal({
  sale,
  productName,
  onClose,
}: {
  sale: SalesInvoice
  productName: (id: string) => string
  onClose: () => void
}) {
  const items = sale.items ?? []
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              <span className="mr-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Sales</span>
              {sale.invoice_number || 'Sale'}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {fmtDate(sale.date || sale.created_at || '')} · {sale.customer_name || ''}
              {sale.sale_type ? ` · ${sale.sale_type}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-80 overflow-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">GST%</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">No items</td></tr>
              ) : (
                items.map((it) => {
                  const qty = Number(it.quantity) || 0
                  const rate = Number(it.rate) || 0
                  const gst = Number(it.gst) || 0
                  const total = qty * rate * (1 + gst / 100)
                  return (
                    <tr key={it.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-700">{productName(it.product_id)}</td>
                      <td className="py-2 text-right text-gray-600">{qty}{it.unit ? ` ${it.unit}` : ''}</td>
                      <td className="py-2 text-right text-gray-600">₹{inr(rate)}</td>
                      <td className="py-2 text-right text-gray-500">{gst}%</td>
                      <td className="py-2 text-right font-medium text-gray-800">₹{inr(total)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-xs text-gray-500">Invoice Total</span>
          <span className="text-base font-semibold text-gray-900">₹{inr(Number(sale.total) || 0)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Small presentational helpers ────────────────────────────────────────────
function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function Stat({ label, value, accent = 'default' }: { label: string; value: string; accent?: 'default' | 'green' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${accent === 'green' ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

function RateField({
  label,
  value,
  onChange,
  basisValue,
  onBasisChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  basisValue: Basis
  onBasisChange: (b: Basis) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-amber-800">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (v !== '' && Number(v) < 0) return // never allow a negative rate
            onChange(v)
          }}
          onKeyDown={(e) => {
            if (e.key === '-' || e.key === 'e') e.preventDefault()
          }}
          placeholder="—"
          className="w-20 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <select
          value={basisValue}
          onChange={(e) => onBasisChange(Number(e.target.value) as Basis)}
          className="rounded-md border border-amber-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
          title="Day-count basis"
        >
          <option value={365}>365 (actual days)</option>
          <option value={360}>360 (30/360)</option>
        </select>
      </div>
      <span className="text-[10px] text-amber-700">
        amount × days/30 × rate/100 · {basisValue === 365 ? 'actual day count' : '30/360 day count'}
      </span>
    </div>
  )
}
