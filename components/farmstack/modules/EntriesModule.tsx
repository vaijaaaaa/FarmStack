'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Language, EntryType } from '@/types/farmstack'
import { useCustomers, useSeasons, useEntries } from '@/hooks/useDatabase'
import SearchableSelect from './accounts/SearchableSelect'

interface EntriesModuleProps {
  language: Language
}

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

const blankRow = (): GridRow => ({
  key: uid(),
  customer_id: '',
  customer_name: '',
  date: today(),
  amount: '',
  comments: '',
})

// A row counts as "started" once the user has put anything meaningful in it.
const rowStarted = (r: GridRow) =>
  r.customer_id !== '' || r.amount.trim() !== '' || r.comments.trim() !== ''

export default function EntriesModule({ language }: EntriesModuleProps) {
  const { customers } = useCustomers()
  const { seasons } = useSeasons()
  const { entries, createEntries } = useEntries()

  const [seasonId, setSeasonId] = useState('')
  const [type, setType] = useState<EntryType>('cash')
  const [location, setLocation] = useState('')
  const [rows, setRows] = useState<GridRow[]>([blankRow()])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // Customer options for the grid, narrowed to the selected Location (city).
  // City lives on the customer "address" field (captured as city on the Add
  // Customer form). No location selected → all customers.
  const customerOptions = useMemo(() => {
    const loc = location.trim().toLowerCase()
    return customers
      .filter((c) => !loc || (c.address ?? '').trim().toLowerCase() === loc)
      .map((c) => ({ value: c.id, label: c.name }))
  }, [customers, location])

  // Location options = distinct customer cities (the customer "address" field,
  // which is captured as the city name on the Add Customer form).
  const cityOptions = useMemo(() => {
    const cities = Array.from(
      new Set(customers.map((c) => (c.address ?? '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))
    return cities.map((c) => ({ value: c, label: c }))
  }, [customers])

  // Changing the location invalidates already-picked customers (a batch shares
  // one city), so reset the grid to a single fresh row.
  const changeLocation = (city: string) => {
    setLocation(city)
    setRows([blankRow()])
    setMsg(null)
  }

  // Count of saved entries for the selected season (mirrors the old "No. of Rec : Total N").
  const recordCount = useMemo(
    () => entries.filter((e) => !seasonId || e.season_id === seasonId).length,
    [entries, seasonId],
  )

  // Update a row; if the last row just became "started", append a fresh blank
  // row so the grid always has an empty line ready underneath.
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
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    // Reclaim AppLayout's p-8 so the page owns its full viewport height.
    <div className="-m-8 flex h-[calc(100vh-56px)] flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-8 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-black">Entries</h1>
      </div>

      {/* ── Controls: type → season → location → records (one row) ─────── */}
      <div className="px-8">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-end gap-5">
            {/* Type */}
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

            {/* Season */}
            <div className="flex w-52 flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-500">Season</span>
              <SearchableSelect
                options={seasonOptions}
                value={seasonId}
                onChange={setSeasonId}
                placeholder="— Select season —"
              />
            </div>

            {/* Location (customer cities) */}
            <div className="flex w-52 flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-500">Location</span>
              <SearchableSelect
                options={cityOptions}
                value={location}
                onChange={changeLocation}
                placeholder="— Select city —"
              />
            </div>

            {/* Records */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-500">Records</span>
              <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                Total <span className="ml-1 font-semibold text-gray-900">{recordCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid (scrolls) + centered Add button ───────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto px-8 pt-4">
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
                      <SearchableSelect
                        options={customerOptions}
                        value={r.customer_id}
                        onChange={(id) => pickCustomer(r.key, id)}
                        placeholder="— Select customer —"
                      />
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

        <p className="mt-2 px-1 text-xs text-gray-400">
          Fill a row to add the next one automatically. Empty rows are ignored on save.
        </p>

        {/* Add button — centered below the grid */}
        <div className="mt-5 flex flex-col items-center gap-2 pb-6">
          {msg && (
            <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </p>
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
    </div>
  )
}
