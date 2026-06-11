'use client'

import { useMemo, useState } from 'react'
import { Plus, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { EntryType } from '@/types/farmstack'
import { useCustomers, useSeasons, useEntries, useLedgers } from '@/hooks/useDatabase'
import SearchableSelect from './accounts/SearchableSelect'

// One editable grid row (local state — strings while editing).
interface GridRow {
  key: string
  seasonId: string   // which season THIS row belongs to (captured when customer is picked)
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
  // When set, the Season is fixed (read-only) — e.g. adding to an open account.
  lockedSeasonId?: string
  // Seasons to hide from the dropdown (e.g. the customer's closed accounts).
  excludeSeasonIds?: string[]
  // Called after a successful save so the host can refresh.
  onAdded?: () => void
}

export default function EntriesGrid({
  lockedCustomer,
  defaultSeasonId = '',
  lockedSeasonId,
  excludeSeasonIds = [],
  onAdded,
}: EntriesGridProps) {
  const { customers } = useCustomers()
  const { seasons } = useSeasons()
  const { entries, createEntries } = useEntries()
  const { ledgers } = useLedgers()

  // blankRow captures the CURRENT seasonId each time it's called so that each
  // new auto-appended row inherits the season currently selected in the header.
  const blankRow = (): GridRow => ({
    key: uid(),
    seasonId: lockedSeasonId || seasonId,
    customer_id: lockedCustomer?.id ?? '',
    customer_name: lockedCustomer?.name ?? '',
    date: today(),
    amount: '',
    comments: '',
  })

  const [seasonId, setSeasonId] = useState(lockedSeasonId || defaultSeasonId)
  const [type, setType] = useState<EntryType>('cash')
  const [location, setLocation] = useState('')
  const [rows, setRows] = useState<GridRow[]>([blankRow()])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Set when a NEW (non-active) account customer is picked — confirm before applying.
  const [pickNew, setPickNew] = useState<
    { key: string; id: string; name: string; activeSeason: string } | null
  >(null)

  // A row counts as "started" once the user puts in an amount/comment (or, when
  // the customer isn't locked, a customer).
  const rowStarted = (r: GridRow) =>
    (!lockedCustomer && r.customer_id !== '') || r.amount.trim() !== '' || r.comments.trim() !== ''

  const seasonOptions = seasons
    .filter((s) => !excludeSeasonIds.includes(s.id))
    .map((s) => ({ value: s.id, label: s.name || s.description || '(untitled)' }))

  // Ledgers in the currently selected season.
  const seasonLedgers = useMemo(
    () => (seasonId ? ledgers.filter((l) => l.season_id === seasonId) : []),
    [ledgers, seasonId],
  )

  // Active ledger id per customer = their OLDEST open season by name — same rule
  // as the server and other account views.
  const activeLedgerIds = useMemo(() => {
    const seasonName = new Map(seasons.map((s) => [s.id, s.name || '']))
    const oldestOpen = new Map<string, string>() // customer_id → ledger id
    for (const l of ledgers) {
      if (l.status === 'closed') continue
      const cur = oldestOpen.get(l.customer_id)
      const curLedger = cur ? ledgers.find((x) => x.id === cur) : undefined
      if (
        !curLedger ||
        (seasonName.get(l.season_id) || '') < (seasonName.get(curLedger.season_id) || '')
      )
        oldestOpen.set(l.customer_id, l.id)
    }
    return new Set(oldestOpen.values())
  }, [ledgers, seasons])

  // Customer dropdown: when a season is chosen, restrict to customers enrolled
  // in that season — no point picking someone who has no ledger there. Also
  // apply the location filter on top.
  const customerOptions = useMemo(() => {
    const loc = location.trim().toLowerCase()
    const enrolledIds = seasonId ? new Set(seasonLedgers.map((l) => l.customer_id)) : null
    return customers
      .filter((c) => {
        if (enrolledIds && !enrolledIds.has(c.id)) return false
        if (loc && (c.address ?? '').trim().toLowerCase() !== loc) return false
        return true
      })
      .map((c) => ({ value: c.id, label: c.name }))
  }, [customers, location, seasonId, seasonLedgers])

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

  // The season name of a customer's ACTIVE (oldest-open) account, for the popup.
  const activeSeasonNameForCustomer = (cid: string) => {
    const al = ledgers.find((l) => activeLedgerIds.has(l.id) && l.customer_id === cid)
    return al ? seasons.find((s) => s.id === al.season_id)?.name ?? '' : ''
  }

  // Stamp the row's season at pick time so it survives a later season change.
  const applyPick = (key: string, id: string) => {
    updateRow(key, {
      seasonId: seasonId,
      customer_id: id,
      customer_name: customers.find((c) => c.id === id)?.name ?? '',
    })
  }

  const pickCustomer = (key: string, id: string) => {
    const ledger = seasonLedgers.find((l) => l.customer_id === id)
    // Block picking a customer whose account in this season is closed.
    if (ledger?.status === 'closed') {
      const name = customers.find((c) => c.id === id)?.name ?? 'This customer'
      toast.error(`${name}'s account is closed — entries can't be added to a closed account.`)
      return
    }
    // Posting to a NEW (open but non-active) account → confirm before applying.
    // (Closed already returned, so any ledger here is open.)
    if (ledger && !activeLedgerIds.has(ledger.id)) {
      setPickNew({
        key,
        id,
        name: customers.find((c) => c.id === id)?.name ?? 'This customer',
        activeSeason: activeSeasonNameForCustomer(id),
      })
      return
    }
    applyPick(key, id)
  }

  // Actually post the entries. `force` is true once the user has confirmed posting
  // to a non-active (new) season account via the popup.
  const doSubmit = async (force: boolean) => {
    const valid = rows.filter((r) => r.customer_id && Number(r.amount) > 0)

    // Group by each row's own season so we can submit one batch per season,
    // allowing a single save to land entries across multiple seasons at once.
    const bySeason = new Map<string, typeof valid>()
    for (const r of valid) {
      const sid = r.seasonId || seasonId
      if (!bySeason.has(sid)) bySeason.set(sid, [])
      bySeason.get(sid)!.push(r)
    }

    setSaving(true)
    try {
      for (const [sid, seasonRows] of bySeason) {
        await createEntries({
          season_id: sid,
          type,
          location,
          force,
          rows: seasonRows.map((r) => ({
            customer_id: r.customer_id,
            customer_name: r.customer_name,
            date: r.date,
            amount: Number(r.amount),
            comments: r.comments.trim(),
          })),
        })
      }
      setRows([blankRow()])
      setMsg({
        kind: 'ok',
        text: `${valid.length} ${valid.length === 1 ? 'entry' : 'entries'} added to the ledger.`,
      })
      onAdded?.()
    } catch (err) {
      const text = (err as Error).message
      setMsg({ kind: 'err', text })
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  const submit = () => {
    setMsg(null)
    const valid = rows.filter((r) => r.customer_id && Number(r.amount) > 0)
    if (valid.length === 0) {
      setMsg({ kind: 'err', text: 'Add at least one row with a customer and an amount.' })
      return
    }
    // Every row must have a season — rows get theirs stamped when the customer is
    // picked. Rows that somehow lost their season fall back to the header season.
    const untagged = valid.filter((r) => !r.seasonId && !seasonId)
    if (untagged.length > 0) {
      setMsg({ kind: 'err', text: 'Please select a season for all rows.' })
      return
    }

    // New-account posts were already confirmed at customer-pick time (the popup),
    // so force past the active-account gate when any row targets a non-active one.
    const hasNew = valid.some((r) => {
      const sid = r.seasonId || seasonId
      const ledger = ledgers.find((l) => l.customer_id === r.customer_id && l.season_id === sid)
      return ledger && ledger.status !== 'closed' && !activeLedgerIds.has(ledger.id)
    })
    doSubmit(hasNew)
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
            {lockedSeasonId ? (
              <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                {seasons.find((s) => s.id === lockedSeasonId)?.name || '—'}
              </div>
            ) : (
              <SearchableSelect
                options={seasonOptions}
                value={seasonId}
                onChange={setSeasonId}
                placeholder="— Select season —"
              />
            )}
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
                      <div className="flex flex-col gap-0.5">
                      <SearchableSelect
                        options={customerOptions}
                        value={r.customer_id}
                        onChange={(id) => pickCustomer(r.key, id)}
                        placeholder={seasonId ? '— Select customer —' : '— Select a season first —'}
                        renderOption={(o) => {
                          const l = seasonLedgers.find((x) => x.customer_id === o.value)
                          if (!l) return null
                          const closed = l.status === 'closed'
                          const active = !closed && activeLedgerIds.has(l.id)
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              closed
                                ? 'bg-red-100 text-red-600'
                                : active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-600'
                            }`}>
                              {closed ? 'Closed' : active ? 'Active' : 'New'}
                            </span>
                          )
                        }}
                      />
                      {/* Show which season this row belongs to when it differs from
                          the header season — helps the user see multi-season batches */}
                      {r.customer_id && r.seasonId && r.seasonId !== seasonId && (
                        <span className="px-2 text-[10px] text-blue-500">
                          {seasons.find((s) => s.id === r.seasonId)?.name ?? r.seasonId}
                        </span>
                      )}
                      </div>
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

      {/* "Adding to a new account" — shown when a New customer is picked */}
      {pickNew && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-red-200 bg-white">
            <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-4">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <h3 className="text-sm font-semibold text-red-700">Adding to a new account</h3>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              <p>
                <span className="font-medium text-gray-800">{pickNew.name}</span> has an active
                account in{' '}
                <span className="font-medium text-gray-800">
                  {pickNew.activeSeason || 'an earlier season'}
                </span>
                . This entry will post to{' '}
                <span className="font-medium text-gray-800">
                  {seasons.find((s) => s.id === seasonId)?.name || 'the selected season'}
                </span>{' '}
                — a new account.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => setPickNew(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  applyPick(pickNew.key, pickNew.id)
                  setPickNew(null)
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
