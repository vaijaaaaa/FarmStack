'use client'

import { useMemo, useState } from 'react'
import { Plus, Lock, X, Calculator, BookOpen } from 'lucide-react'
import { totalsFor, inr, type Season, type Ledger, type LedgerLine, type DrCr } from './data'

interface LedgerViewTabProps {
  mode: 'display' | 'closure'
  seasons: Season[]
  ledgers: Ledger[]
  onAddEntry: (ledgerId: string, line: Omit<LedgerLine, 'id' | 'kind'>) => void
  onClose: (ledgerId: string, closureDate: string) => void
}

type OptionFilter = 'all' | 'debit' | 'credit'

// dd-mm-yy → Date
function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

export default function LedgerViewTab({ mode, seasons, ledgers, onAddEntry, onClose }: LedgerViewTabProps) {
  const closing = mode === 'closure'

  const [seasonId, setSeasonId] = useState('')
  const [ledgerId, setLedgerId] = useState('')
  const [option, setOption] = useState<OptionFilter>('all')
  const [closureDate, setClosureDate] = useState('')
  const [debitRate, setDebitRate] = useState('2')
  const [creditRate, setCreditRate] = useState('1')
  const [interest, setInterest] = useState<Record<string, { interest: number; days: number }>>({})
  const [showEntry, setShowEntry] = useState(false)

  const seasonLedgers = useMemo(() => ledgers.filter((l) => l.seasonId === seasonId), [ledgers, seasonId])
  const ledger = ledgers.find((l) => l.id === ledgerId && l.seasonId === seasonId) ?? null

  const { debit, credit, grand } = ledger ? totalsFor(ledger.lines) : { debit: 0, credit: 0, grand: 0 }

  const visibleLines = useMemo(() => {
    if (!ledger) return []
    if (option === 'all') return ledger.lines
    return ledger.lines.filter((l) => l.drcr === option)
  }, [ledger, option])

  const totalInterest = Object.values(interest).reduce((s, v) => s + v.interest, 0)

  const calculate = () => {
    if (!ledger) return
    const close = parseDate(closureDate)
    if (!close) return
    const dr = Number(debitRate) || 0
    const cr = Number(creditRate) || 0
    const next: Record<string, { interest: number; days: number }> = {}
    for (const l of ledger.lines) {
      const d = parseDate(l.date)
      if (!d) continue
      const days = Math.max(0, Math.round((close.getTime() - d.getTime()) / 86400000))
      const rate = l.drcr === 'debit' ? dr : cr
      const basis = l.drcr === 'debit' ? 365 : 360
      next[l.id] = { days, interest: (l.amount * rate * days) / (100 * basis) }
    }
    setInterest(next)
  }

  return (
    <div className="mt-4">
      {/* ── Pickers ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Season</label>
          <select
            value={seasonId}
            onChange={(e) => { setSeasonId(e.target.value); setLedgerId(''); setInterest({}) }}
            className="w-52 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="">— Select season —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.description || '(untitled)'}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Account</label>
          <select
            value={ledgerId}
            onChange={(e) => { setLedgerId(e.target.value); setInterest({}) }}
            disabled={!seasonId}
            className="w-52 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="">— Select account —</option>
            {seasonLedgers.map((l) => (
              <option key={l.id} value={l.id}>{l.account}</option>
            ))}
          </select>
        </div>

        {ledger && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Option</label>
            <select value={option} onChange={(e) => setOption(e.target.value as OptionFilter)} className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black">
              <option value="all">All</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </div>
        )}

        {ledger && !closing && (
          <button onClick={() => setShowEntry(true)} className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400">
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        )}

        {ledger && closing && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Closure Date</label>
            <input
              type="text"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
              placeholder="dd-mm-yy"
              className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
        )}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!ledger ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">Select a season and account to {closing ? 'close' : 'view'} the ledger</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <Stat label="Debit" value={`₹${inr(debit)}`} />
            <Stat label="Credit" value={`₹${inr(credit)}`} />
            <Stat label="Grand Total" value={`₹${inr(Math.abs(grand))} ${grand < 0 ? 'Cr' : 'Dr'}`} accent={grand < 0 ? 'green' : 'default'} />
            {closing && <Stat label="Grand Interest" value={`₹${inr(totalInterest)}`} />}
          </div>

          {/* Interest panel (closure only) */}
          {closing && (
            <div className="mb-4 flex flex-wrap items-end gap-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <span className="text-sm font-semibold text-amber-800">Accrual Interest</span>
              <RateField label="Debit %" value={debitRate} onChange={setDebitRate} basis="Days / 365" />
              <RateField label="Credit %" value={creditRate} onChange={setCreditRate} basis="Days / 360" />
              <button onClick={calculate} className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                <Calculator className="h-4 w-4" /> Calculate
              </button>
              <button
                onClick={() => closureDate && onClose(ledger.id, closureDate)}
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
                  <th className="px-4 py-3 font-medium text-gray-500">Bill Date</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Bill Description</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  {closing && <th className="px-4 py-3 text-right font-medium text-gray-500">Days</th>}
                  {closing && <th className="px-4 py-3 text-right font-medium text-gray-500">Interest</th>}
                </tr>
              </thead>
              <tbody>
                {visibleLines.length === 0 ? (
                  <tr><td colSpan={closing ? 5 : 3} className="px-4 py-8 text-center text-sm text-gray-400">No lines</td></tr>
                ) : (
                  visibleLines.map((l) => (
                    <tr key={l.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${l.kind === 'ob' ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-600">{l.date}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {l.description}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${l.drcr === 'debit' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {l.drcr === 'debit' ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">₹{inr(l.amount)}</td>
                      {closing && <td className="px-4 py-3 text-right text-gray-500">{interest[l.id]?.days ?? '—'}</td>}
                      {closing && <td className="px-4 py-3 text-right text-gray-600">₹{inr(interest[l.id]?.interest ?? 0)}</td>}
                    </tr>
                  ))
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

      {showEntry && ledger && (
        <AddEntryModal
          account={ledger.account}
          onClose={() => setShowEntry(false)}
          onSave={(line) => {
            onAddEntry(ledger.id, line)
            setShowEntry(false)
          }}
        />
      )}
    </div>
  )
}

// ── Add Entry modal (the Entries-page credit/debit money) ──────────────
function AddEntryModal({
  account,
  onClose,
  onSave,
}: {
  account: string
  onClose: () => void
  onSave: (line: Omit<LedgerLine, 'id' | 'kind'>) => void
}) {
  const [drcr, setDrcr] = useState<DrCr>('credit')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Add Entry · {account}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            {(['credit', 'debit'] as DrCr[]).map((v) => (
              <button
                key={v}
                onClick={() => setDrcr(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize ${drcr === v ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-600'}`}
              >
                {v === 'credit' ? 'Credit (received)' : 'Debit (given)'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Date</label>
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="dd-mm-yy" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cash received" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400">Cancel</button>
          <button
            onClick={() => amount && onSave({ date: date || '—', drcr, description: description || (drcr === 'credit' ? 'Payment received' : 'Amount given'), amount: Number(amount) })}
            disabled={!amount}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
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
