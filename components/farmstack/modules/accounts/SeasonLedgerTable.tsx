'use client'

import { useMemo, useState } from 'react'
import { X, Users } from 'lucide-react'
import type { Customer, LedgerRecord, Season } from '@/types/farmstack'
import SearchableSelect from './SearchableSelect'

interface BulkRow {
  customer_id: string
  customer_name: string
  user_name: string
  description: string
  acres: string
  closure_date: string
  credit_limit: string
  display_number: string
}

interface SeasonLedgerTableProps {
  seasons: Season[]
  customers: Customer[]
  ledgers: LedgerRecord[]
  defaultSeasonId?: string
  onClose: () => void
  onBulkAdd: (payload: {
    season_id: string
    customers: Partial<LedgerRecord>[]
  }) => Promise<{ created: number; skipped: number }>
}

export default function SeasonLedgerTable({
  seasons,
  customers,
  ledgers,
  defaultSeasonId = '',
  onClose,
  onBulkAdd,
}: SeasonLedgerTableProps) {
  const [seasonId, setSeasonId] = useState(defaultSeasonId)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [rows, setRows] = useState<BulkRow[]>(() =>
    customers.map((c, i) => ({
      customer_id: c.id,
      customer_name: c.name,
      user_name: '',
      description: '',
      acres: '',
      closure_date: '',
      credit_limit: '',
      display_number: String(i + 1),
    })),
  )

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // Customers already attached to the selected season (skip these).
  const alreadyIn = useMemo(
    () => new Set(ledgers.filter((l) => l.season_id === seasonId).map((l) => l.customer_id)),
    [ledgers, seasonId],
  )

  const toAddCount = rows.filter((r) => !alreadyIn.has(r.customer_id)).length

  const set = (idx: number, key: keyof BulkRow, value: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))

  const submit = async () => {
    setMsg(null)
    if (!seasonId) {
      setMsg({ kind: 'err', text: 'Please select a season first.' })
      return
    }
    const payloadRows = rows
      .filter((r) => !alreadyIn.has(r.customer_id))
      .map((r) => ({
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        user_name: r.user_name.trim(),
        description: r.description.trim(),
        acres: Number(r.acres) || 0,
        credit_limit: Number(r.credit_limit) || 0,
        display_number: Number(r.display_number) || 0,
        closure_date: r.closure_date,
      }))
    if (payloadRows.length === 0) {
      setMsg({ kind: 'err', text: 'All customers are already in this season.' })
      return
    }
    setSaving(true)
    try {
      const res = await onBulkAdd({ season_id: seasonId, customers: payloadRows })
      setMsg({
        kind: 'ok',
        text: `Added ${res.created} customer${res.created === 1 ? '' : 's'}${
          res.skipped ? ` · skipped ${res.skipped} already in season` : ''
        }.`,
      })
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* ── Sticky header ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Add All Customers to a Season</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Season picker + count */}
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Season</span>
            <div className="w-56">
              <SearchableSelect
                options={seasonOptions}
                value={seasonId}
                onChange={(v) => { setSeasonId(v); setMsg(null) }}
                placeholder="— Select season —"
              />
            </div>
          </div>
          <span className="text-xs text-gray-400">
            {customers.length} customers · {toAddCount} to add
            {alreadyIn.size > 0 ? ` · ${alreadyIn.size} already in season` : ''}
          </span>
        </div>

        {/* ── Scrollable table body (sticky head) ───────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-200 text-left">
                <Th className="w-48">Customer</Th>
                <Th className="w-32">User</Th>
                <Th>Description</Th>
                <Th className="w-24">Acres</Th>
                <Th className="w-40">Closure Date</Th>
                <Th className="w-32">Loyalty</Th>
                <Th className="w-28">Display No.</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const added = alreadyIn.has(r.customer_id)
                return (
                  <tr
                    key={r.customer_id}
                    className={`border-b border-gray-50 last:border-0 ${added ? 'bg-gray-50/60' : 'hover:bg-gray-50/40'}`}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">{r.customer_name}</span>
                        {added && (
                          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            Added
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5"><Cell value={r.user_name} onChange={(v) => set(i, 'user_name', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell value={r.description} onChange={(v) => set(i, 'description', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.acres} onChange={(v) => set(i, 'acres', v)} disabled={added} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Cell type="date" value={r.closure_date} onChange={(v) => set(i, 'closure_date', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.credit_limit} onChange={(v) => set(i, 'credit_limit', v)} disabled={added} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.display_number} onChange={(v) => set(i, 'display_number', v)} disabled={added} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Sticky footer ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-100 px-5 py-4">
          <span className={`text-xs ${msg ? (msg.kind === 'ok' ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
            {msg ? msg.text : 'Existing customers in this season are skipped.'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400">
              Close
            </button>
            <button
              onClick={submit}
              disabled={saving || !seasonId || toAddCount === 0}
              className="rounded-md bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
            >
              {saving ? 'Adding…' : `Add All (${toAddCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium text-gray-500 ${className}`}>{children}</th>
}

function Cell({
  value,
  onChange,
  type = 'text',
  disabled = false,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-800 placeholder-gray-300 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black disabled:text-gray-300"
    />
  )
}
