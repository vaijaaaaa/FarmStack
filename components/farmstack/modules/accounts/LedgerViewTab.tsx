'use client'

import { useMemo, useState } from 'react'
import { Plus, Lock, X, Calculator, BookOpen } from 'lucide-react'
import { useSalesInvoices, useEntries, useProducts } from '@/hooks/useDatabase'
import type { LedgerRecord, Season, SalesInvoice, EntryType } from '@/types/farmstack'
import {
  buildLedgerLines,
  totalsFor,
  inr,
  fmtDate,
  parseLedgerDate,
  type LedgerLine,
  type LineKind,
} from './data'

interface LedgerViewTabProps {
  mode: 'display' | 'closure'
  seasons: Season[]
  ledgers: LedgerRecord[]
  onClose?: (ledgerId: string, closureDate: string) => Promise<void> | void
}

type OptionFilter = 'all' | 'debit' | 'credit'

const today = () => new Date().toISOString().slice(0, 10)

// Colored badge per line kind (sales = green, per the ledger spec).
const KIND_BADGE: Record<LineKind, { label: string; cls: string }> = {
  ob: { label: 'O.B', cls: 'bg-gray-100 text-gray-600' },
  sale: { label: 'Sales', cls: 'bg-green-100 text-green-700' },
  cash: { label: 'Cash', cls: 'bg-sky-100 text-sky-700' },
  credit: { label: 'Credit', cls: 'bg-amber-100 text-amber-700' },
}

export default function LedgerViewTab({ mode, seasons, ledgers, onClose }: LedgerViewTabProps) {
  const closing = mode === 'closure'

  const { invoices } = useSalesInvoices()
  const { entries, createEntries } = useEntries()
  const { products } = useProducts()

  const [seasonId, setSeasonId] = useState('')
  const [ledgerId, setLedgerId] = useState('')
  const [option, setOption] = useState<OptionFilter>('all')
  const [closureDate, setClosureDate] = useState(today())
  const [debitRate, setDebitRate] = useState('2')
  const [creditRate, setCreditRate] = useState('1')
  const [interest, setInterest] = useState<Record<string, { interest: number; days: number }>>({})
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

  const totalInterest = Object.values(interest).reduce((s, v) => s + v.interest, 0)

  const calculate = () => {
    const close = parseLedgerDate(closureDate)
    if (!close) return
    const dr = Number(debitRate) || 0
    const cr = Number(creditRate) || 0
    const next: Record<string, { interest: number; days: number }> = {}
    for (const l of lines) {
      const d = parseLedgerDate(l.date)
      if (!d) continue
      const days = Math.max(0, Math.round((close.getTime() - d.getTime()) / 86400000))
      const rate = l.drcr === 'debit' ? dr : cr
      const basis = l.drcr === 'debit' ? 365 : 360
      next[l.id] = { days, interest: (l.amount * rate * days) / (100 * basis) }
    }
    setInterest(next)
  }

  const selectSeason = (id: string) => {
    setSeasonId(id)
    setLedgerId('')
    setInterest({})
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
            onChange={(e) => { setLedgerId(e.target.value); setInterest({}) }}
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

        {ledger && !closing && (
          <button
            onClick={() => setShowEntry(true)}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400"
          >
            <Plus className="h-4 w-4" /> Add Entry
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
            {closing && <Stat label="Grand Interest" value={`₹${inr(totalInterest)}`} />}
          </div>

          {/* Interest panel (closure only) */}
          {closing && (
            <div className="mb-4 flex flex-wrap items-end gap-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <span className="text-sm font-semibold text-amber-800">Accrual Interest</span>
              <RateField label="Debit %" value={debitRate} onChange={setDebitRate} basis="Days / 365" />
              <RateField label="Credit %" value={creditRate} onChange={setCreditRate} basis="Days / 360" />
              <button
                onClick={calculate}
                className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                <Calculator className="h-4 w-4" /> Calculate
              </button>
              <button
                onClick={() => onClose && closureDate && onClose(ledger.id, closureDate)}
                disabled={!closureDate || ledger.status === 'closed'}
                className="flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
              >
                <Lock className="h-4 w-4" /> {ledger.status === 'closed' ? 'Closed' : 'Close A/C'}
              </button>
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

      {/* Add Entry (cash/credit) — persists to this customer + season */}
      {showEntry && ledger && (
        <AddEntryModal
          account={ledger.customer_name}
          onClose={() => setShowEntry(false)}
          onSave={async ({ type, date, amount, comments }) => {
            await createEntries({
              season_id: ledger.season_id,
              type,
              location: '',
              rows: [
                {
                  customer_id: ledger.customer_id,
                  customer_name: ledger.customer_name,
                  date,
                  amount,
                  comments,
                },
              ],
            })
            setShowEntry(false)
          }}
        />
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

// ── Add Entry modal ────────────────────────────────────────────────────────
function AddEntryModal({
  account,
  onClose,
  onSave,
}: {
  account: string
  onClose: () => void
  onSave: (v: { type: EntryType; date: string; amount: number; comments: string }) => Promise<void>
}) {
  const [type, setType] = useState<EntryType>('cash')
  const [date, setDate] = useState(today())
  const [comments, setComments] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!amount) return
    setSaving(true)
    try {
      await onSave({ type, date, amount: Number(amount), comments: comments.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Add Entry · {account}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            {(['cash', 'credit'] as EntryType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize ${
                  type === t ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-600'
                }`}
              >
                {t === 'cash' ? 'Cash (received)' : 'Credit (given)'}
              </button>
            ))}
          </div>

          <FieldRow label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={modalInput} />
          </FieldRow>
          <FieldRow label="Amount">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={modalInput} />
          </FieldRow>
          <FieldRow label="Comments">
            <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional note" className={modalInput} />
          </FieldRow>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400">Cancel</button>
          <button
            onClick={save}
            disabled={!amount || saving}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
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
const modalInput =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black'

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
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

function RateField({ label, value, onChange, basis }: { label: string; value: string; onChange: (v: string) => void; basis: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-amber-800">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-20 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
      <span className="text-[10px] text-amber-700">{basis}</span>
    </div>
  )
}
