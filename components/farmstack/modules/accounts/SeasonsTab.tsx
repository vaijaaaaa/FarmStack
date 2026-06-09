'use client'

import { useState } from 'react'
import { Plus, CalendarDays } from 'lucide-react'
import type { Season } from '@/types/farmstack'

interface SeasonsTabProps {
  seasons: Season[]
  loading: boolean
  onAdd: (payload: Partial<Season>) => Promise<unknown> | void
}

export default function SeasonsTab({ seasons, loading, onAdd }: SeasonsTabProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Season name is required.')
      return
    }
    setSaving(true)
    try {
      await onAdd({ name: trimmed })
      setName('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Show oldest → newest by name: 2025 = 1, 2026 = 2, 2027 = 3, new years appended.
  const ordered = [...seasons].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }),
  )

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* ── Create season ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">Create Season</h2>
        <p className="mt-1 text-xs text-gray-400">A season is just a named period.</p>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Season Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 Dalwa"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add Season'}
          </button>
        </div>
      </div>

      {/* ── Existing seasons ──────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">All Seasons</span>
          <span className="ml-2 text-xs text-gray-400">· {seasons.length}</span>
        </div>
        {loading ? (
          <p className="p-12 text-center text-sm text-gray-400">Loading…</p>
        ) : seasons.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400">No seasons yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="w-16 px-4 py-3 font-medium text-gray-400">#</th>
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s, i) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
