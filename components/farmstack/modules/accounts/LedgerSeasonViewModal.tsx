'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Eye, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LedgerRecord, Season } from '@/types/farmstack'
import { useSalesInvoices, useEntries } from '@/hooks/useDatabase'
import SearchableSelect from './SearchableSelect'
import { fmtDate, inr } from './data'

interface LedgerSeasonViewModalProps {
  seasons: Season[]
  ledgers: LedgerRecord[]
  defaultSeasonId?: string
  onClose: () => void
  onDelete: (id: string) => Promise<unknown>
}

export default function LedgerSeasonViewModal({
  seasons,
  ledgers,
  defaultSeasonId = '',
  onClose,
  onDelete,
}: LedgerSeasonViewModalProps) {
  const { invoices, refresh: refreshInvoices } = useSalesInvoices()
  const { entries, refresh: refreshEntries } = useEntries()
  const [seasonId, setSeasonId] = useState(defaultSeasonId)

  // Fetch fresh data when the modal opens so isEmpty() isn't based on stale
  // data from when the parent component last polled. The server-side guard in
  // DELETE is the hard safety net; this keeps the UI in sync with it.
  useEffect(() => {
    refreshInvoices()
    refreshEntries()
  }, [refreshInvoices, refreshEntries])
  const [deletingId, setDeletingId] = useState('')

  // The ACTIVE account for each customer = their OLDEST still-open season by
  // chronology (season name), matching activeSeasonForCustomer on the server.
  // Those get the orange badge and can't be deleted.
  const activeLedgerIds = useMemo(() => {
    const seasonName = new Map(seasons.map((s) => [s.id, s.name || '']))
    const oldestOpen = new Map<string, LedgerRecord>()
    for (const l of ledgers) {
      if (l.status === 'closed') continue
      const cur = oldestOpen.get(l.customer_id)
      if (
        !cur ||
        (seasonName.get(l.season_id) || '') < (seasonName.get(cur.season_id) || '')
      )
        oldestOpen.set(l.customer_id, l)
    }
    return new Set([...oldestOpen.values()].map((l) => l.id))
  }, [ledgers, seasons])

  // An account is "empty" when it has no sales and no entries in its season.
  const isEmpty = (l: LedgerRecord) =>
    !invoices.some(
      (s) => s.customer_id === l.customer_id && (s.season_id || '') === l.season_id,
    ) && !entries.some((e) => e.customer_id === l.customer_id && e.season_id === l.season_id)

  const doRemove = async (l: LedgerRecord) => {
    setDeletingId(l.id)
    try {
      await onDelete(l.id)
      toast.success(`${l.customer_name || 'Account'} removed from the season`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeletingId('')
    }
  }

  const remove = (l: LedgerRecord) => {
    toast(`Remove ${l.customer_name || 'this account'} from this season?`, {
      description: 'This empty account will be deleted.',
      action: { label: 'Remove', onClick: () => doRemove(l) },
      cancel: { label: 'Cancel', onClick: () => {} },
    })
  }

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  const rows = useMemo(
    () =>
      ledgers
        .filter((l) => l.season_id === seasonId)
        .sort(
          (a, b) =>
            (a.display_number || 0) - (b.display_number || 0) ||
            (a.customer_name || '').localeCompare(b.customer_name || ''),
        ),
    [ledgers, seasonId],
  )

  const openCount = rows.filter((l) => l.status !== 'closed').length
  const closedCount = rows.length - openCount

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* ── Sticky header ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">View Season Accounts</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Season picker + counts */}
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Season</span>
            <div className="w-56">
              <SearchableSelect
                options={seasonOptions}
                value={seasonId}
                onChange={setSeasonId}
                placeholder="— Select season —"
              />
            </div>
          </div>
          {seasonId && (
            <span className="text-xs text-gray-400">
              {rows.length} account{rows.length === 1 ? '' : 's'} · {openCount} open · {closedCount} closed
            </span>
          )}
        </div>

        {/* ── Scrollable table body (sticky head) ───────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto">
          {!seasonId ? (
            <p className="p-12 text-center text-sm text-gray-400">
              Select a season to view its customer accounts.
            </p>
          ) : rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-gray-400">
              No accounts in this season yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="border-b border-gray-200 text-left">
                  <Th className="w-48">Customer</Th>
                  <Th>Description</Th>
                  <Th className="w-24">Acres</Th>
                  <Th className="w-32">Closure Date</Th>
                  <Th className="w-32">Loyalty</Th>
                  <Th className="w-28">Display No.</Th>
                  <Th className="w-32">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const closed = l.status === 'closed'
                  const active = !closed && activeLedgerIds.has(l.id)
                  // Delete is offered ONLY for empty, non-active accounts.
                  const deletable = !active && isEmpty(l)
                  return (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                      <td className="px-3 py-2 font-medium text-gray-800">{l.customer_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{l.description || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{l.acres || 0}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.closure_date ? fmtDate(l.closure_date) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">₹{inr(l.credit_limit || 0)}</td>
                      <td className="px-3 py-2 text-gray-600">{l.display_number || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              closed
                                ? 'bg-red-100 text-red-600'
                                : active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-600'
                            }`}
                          >
                            {closed ? 'Closed' : active ? 'Active' : 'New'}
                          </span>
                          {deletable && (
                            <button
                              onClick={() => remove(l)}
                              disabled={deletingId === l.id}
                              title="Remove this empty account from the season"
                              className="text-gray-300 hover:text-red-500 disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Sticky footer ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-end border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium text-gray-500 ${className}`}>{children}</th>
}
