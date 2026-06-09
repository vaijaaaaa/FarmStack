'use client'

import { useMemo, useState } from 'react'
import { X, Eye } from 'lucide-react'
import type { LedgerRecord, Season } from '@/types/farmstack'
import SearchableSelect from './SearchableSelect'
import { fmtDate, inr } from './data'

interface LedgerSeasonViewModalProps {
  seasons: Season[]
  ledgers: LedgerRecord[]
  defaultSeasonId?: string
  onClose: () => void
}

export default function LedgerSeasonViewModal({
  seasons,
  ledgers,
  defaultSeasonId = '',
  onClose,
}: LedgerSeasonViewModalProps) {
  const [seasonId, setSeasonId] = useState(defaultSeasonId)

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
                  <Th className="w-28">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const closed = l.status === 'closed'
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
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            closed
                              ? 'bg-red-100 text-red-600'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {closed ? 'Closed' : 'Open'}
                        </span>
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
