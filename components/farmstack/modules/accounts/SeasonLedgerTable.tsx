'use client'

import { useEffect, useMemo, useState } from 'react'
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
  selected: boolean
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

  // Sync when the parent changes the default season while the modal is open.
  useEffect(() => {
    setSeasonId(defaultSeasonId)
  }, [defaultSeasonId])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [rows, setRows] = useState<BulkRow[]>(() =>
    customers.map((c) => ({
      customer_id: c.id,
      customer_name: c.name,
      user_name: '',
      description: '',
      acres: '',
      closure_date: '',
      credit_limit: '',
      display_number: '', // blank — the user sets it
      selected: true,
    })),
  )

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // Customers already attached to the selected season (skip + no checkbox).
  const alreadyIn = useMemo(
    () => new Set(ledgers.filter((l) => l.season_id === seasonId).map((l) => l.customer_id)),
    [ledgers, seasonId],
  )

  // Un-added customers first; already-added ones sink to the bottom.
  const ordered = useMemo(
    () =>
      [...rows].sort(
        (a, b) => Number(alreadyIn.has(a.customer_id)) - Number(alreadyIn.has(b.customer_id)),
      ),
    [rows, alreadyIn],
  )

  const selectable = rows.filter((r) => !alreadyIn.has(r.customer_id))
  const selectedCount = selectable.filter((r) => r.selected).length
  const allSelected = selectable.length > 0 && selectable.every((r) => r.selected)

  const setRow = (cid: string, key: keyof BulkRow, value: string | boolean) =>
    setRows((prev) => prev.map((r) => (r.customer_id === cid ? { ...r, [key]: value } : r)))

  const toggleAll = () =>
    setRows((prev) =>
      prev.map((r) => (alreadyIn.has(r.customer_id) ? r : { ...r, selected: !allSelected })),
    )

  const submit = async () => {
    setMsg(null)
    if (!seasonId) {
      setMsg({ kind: 'err', text: 'Please select a season first.' })
      return
    }
    const payloadRows = rows
      .filter((r) => !alreadyIn.has(r.customer_id) && r.selected)
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
      setMsg({ kind: 'err', text: 'Select at least one customer to add.' })
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
            {customers.length} customers · {selectedCount} selected
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
                <th className="w-20 px-3 py-2.5 text-center font-medium text-gray-500">
                  <label className="flex items-center justify-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-black"
                      title="Select / unselect all"
                    />
                  </label>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => {
                const added = alreadyIn.has(r.customer_id)
                const dim = !added && !r.selected
                return (
                  <tr
                    key={r.customer_id}
                    className={`border-b border-gray-50 last:border-0 ${
                      added ? 'bg-gray-50/60' : dim ? 'opacity-50 hover:opacity-100' : 'hover:bg-gray-50/40'
                    }`}
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
                    <td className="px-2 py-1.5"><Cell value={r.user_name} onChange={(v) => setRow(r.customer_id, 'user_name', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell value={r.description} onChange={(v) => setRow(r.customer_id, 'description', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.acres} onChange={(v) => setRow(r.customer_id, 'acres', v)} disabled={added} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Cell type="date" value={r.closure_date} onChange={(v) => setRow(r.customer_id, 'closure_date', v)} disabled={added} /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.credit_limit} onChange={(v) => setRow(r.customer_id, 'credit_limit', v)} disabled={added} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Cell type="number" value={r.display_number} onChange={(v) => setRow(r.customer_id, 'display_number', v)} disabled={added} placeholder="—" /></td>
                    <td className="px-2 py-1.5 text-center">
                      {!added && (
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) => setRow(r.customer_id, 'selected', e.target.checked)}
                          className="h-4 w-4 accent-black"
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Sticky footer ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-100 px-5 py-4">
          <span className={`text-xs ${msg ? (msg.kind === 'ok' ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
            {msg ? msg.text : 'Tick the customers to add. Already-added customers are skipped.'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400">
              Close
            </button>
            <button
              onClick={submit}
              disabled={saving || !seasonId || selectedCount === 0}
              className="rounded-md bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-40"
            >
              {saving ? 'Adding…' : `Add All (${selectedCount})`}
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
