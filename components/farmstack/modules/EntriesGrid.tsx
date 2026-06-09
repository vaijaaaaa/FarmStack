'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { EntryType } from '@/types/farmstack'
import { useCustomers, useSeasons, useEntries } from '@/hooks/useDatabase'
import SearchableSelect from './accounts/SearchableSelect'

// One editable grid row (local state — strings while editing).
interface GridRow {
  key: string
  customer_id: string
  customer_name: string
  date: string
  amount: string
  comments: string
}

const today = () => new Date().toISOString().slice(0, 10)

let seq = 0
const uid = () => `row-${Date.now()}-${seq++}`

interface EntriesGridProps {
  // When set, the grid is for ONE customer (the Name column is locked).
  lockedCustomer?: { id: string; name: string }
  defaultSeasonId?: string
  // Seasons to hide from the dropdown (e.g. the customer's closed accounts).
  excludeSeasonIds?: string[]
  // Called after a successful save so the host can refresh.
  onAdded?: () => void
}

export default function EntriesGrid({
  lockedCustomer,
  defaultSeasonId = '',
  excludeSeasonIds = [],
  onAdded,
}: EntriesGridProps) {
  const { customers } = useCustomers()
  const { seasons } = useSeasons()
  const { entries, createEntries } = useEntries()

  const blankRow = (): GridRow => ({
    key: uid(),
    customer_id: lockedCustomer?.id ?? '',
    customer_name: lockedCustomer?.name ?? '',
    date: today(),
    amount: '',
    comments: '',
  })

  const [seasonId, setSeasonId] = useState(defaultSeasonId)
  const [type, setType] = useState<EntryType>('cash')
  const [location, setLocation] = useState('')
  const [rows, setRows] = useState<GridRow[]>([blankRow()])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // A row counts as "started" once the user puts in an amount/comment (or, when
  // the customer isn't locked, a customer).
  const rowStarted = (r: GridRow) =>
    (!lockedCustomer && r.customer_id !== '') || r.amount.trim() !== '' || r.comments.trim() !== ''

  const seasonOptions = seasons
    .filter((s) => !excludeSeasonIds.includes(s.id))
    .map((s) => ({ value: s.id, label: s.name || s.description || '(untitled)' }))

  const customerOptions = useMemo(() => {
    const loc = location.trim().toLowerCase()
    return customers
      .filter((c) => !loc || (c.address ?? '').trim().toLowerCase() === loc)
      .map((c) => ({ value: c.id, label: c.name }))
  }, [customers, location])

  const cityOptions = useMemo(() => {
    const cities = Array.from(
      new Set(customers.map((c) => (c.address ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))
    return cities.map((c) => ({ value: c, label: c }))
  }, [customers])

  const changeLocation = (city: string) => {
    setLocation(city)
    if (!lockedCustomer) setRows([blankRow()])
    setMsg(null)
  }

  const recordCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!seasonId || e.season_id === seasonId) &&
          (!lockedCustomer || e.customer_id === lockedCustomer.id),
      ).length,
    [entries, seasonId, lockedCustomer],
  )

  const updateRow = (key: string, patch: Partial<GridRow>) => {
    setRows((prev) => {
      let next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
      if (rowStarted(next[next.length - 1])) next = [...next, blankRow()]
      return next
    })
    setMsg(null)
  }

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      return next.length ? next : [blankRow()]
    })
  }

  const pickCustomer = (key: string, id: string) =>
    updateRow(key, {
      customer_id: id,
      customer_name: customers.find((c) => c.id === id)?.name ?? '',
    })

  const submit = async () => {
    setMsg(null)
    if (!seasonId) {
      setMsg({ kind: 'err', text: 'Please select a season first.' })
      return
    }
    const valid = rows.filter((r) => r.customer_id && Number(r.amount) > 0)
    if (valid.length === 0) {
      setMsg({ kind: 'err', text: 'Add at least one row with a customer and an amount.' })
      return
    }

    setSaving(true)
    try {
      await createEntries({
        season_id: seasonId,
        type,
        location,
        rows: valid.map((r) => ({
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          date: r.date,
          amount: Number(r.amount),
          comments: r.comments.trim(),
        })),
      })
      setRows([blankRow()])
      setMsg({
        kind: 'ok',
        text: `${valid.length} ${valid.length === 1 ? 'entry' : 'entries'} added to the ledger.`,
      })
      onAdded?.()
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Controls: type → season → location → records ───────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Type</span>
            <div className="flex h-9 items-center gap-4">
              {(['cash', 'credit'] as EntryType[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5 text-sm capitalize text-gray-700">
                  <input
                    type="radio"
                    name="entry-type"
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="h-3.5 w-3.5 accent-black"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div className="flex w-52 flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Season</span>
            <SearchableSelect
              options={seasonOptions}
              value={seasonId}
              onChange={setSeasonId}
              placeholder="— Select season —"
            />
          </div>

          <div className="flex w-52 flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Location</span>
            <SearchableSelect
              options={cityOptions}
              value={location}
              onChange={changeLocation}
              placeholder="— Select city —"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Records</span>
            <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
              Total <span className="ml-1 font-semibold text-gray-900">{recordCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="w-12 border-r border-gray-100 px-3 py-2.5 text-center font-medium text-gray-400">#</th>
              <th className="w-44 border-r border-gray-100 px-4 py-2.5 font-medium text-gray-500">Date</th>
              <th className="w-[28%] border-r border-gray-100 px-4 py-2.5 font-medium text-gray-500">Name</th>
              <th className="w-44 border-r border-gray-100 px-4 py-2.5 text-right font-medium text-gray-500">Amount</th>
              <th className="border-r border-gray-100 px-4 py-2.5 font-medium text-gray-500">Comments</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const filled = !!r.customer_id && Number(r.amount) > 0
              return (
                <tr key={r.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className="border-r border-gray-100 px-3 py-1.5 text-center text-xs text-gray-400">
                    {filled ? i + 1 : ''}
                  </td>
                  <td className="border-r border-gray-100 px-2 py-1.5">
                    <input
                      type="date"
                      value={r.date}
                      onChange={(e) => updateRow(r.key, { date: e.target.value })}
                      className="w-full rounded bg-transparent px-2 py-2 text-sm text-gray-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </td>
                  <td className="border-r border-gray-100 px-2 py-1.5">
                    {lockedCustomer ? (
                      <div className="px-2 py-2 text-sm font-medium text-gray-700">{lockedCustomer.name}</div>
                    ) : (
                      <SearchableSelect
                        options={customerOptions}
                        value={r.customer_id}
                        onChange={(id) => pickCustomer(r.key, id)}
                        placeholder="— Select customer —"
                      />
                    )}
                  </td>
                  <td className="border-r border-gray-100 px-2 py-1.5">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={r.amount}
                        onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                        placeholder="0"
                        className="w-full rounded bg-transparent py-2 pl-6 pr-2 text-right text-sm text-gray-900 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-1.5">
                    <input
                      value={r.comments}
                      onChange={(e) => updateRow(r.key, { comments: e.target.value })}
                      placeholder="Add a note…"
                      className="w-full rounded bg-transparent px-2 py-2 text-sm text-gray-700 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(r.key)}
                        className="text-gray-300 hover:text-red-500"
                        title="Remove row"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-gray-400">
        Fill a row to add the next one automatically. Empty rows are ignored on save.
      </p>

      {/* Add button — centered */}
      <div className="flex flex-col items-center gap-2 pb-2">
        {msg && (
          <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>
        )}
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-md bg-black px-12 py-2.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
