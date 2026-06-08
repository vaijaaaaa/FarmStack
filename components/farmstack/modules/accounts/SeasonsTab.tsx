'use client'

import { useState } from 'react'
import { Plus, CalendarDays, Pencil, Check, X } from 'lucide-react'
import type { Season } from '@/types/farmstack'
import { fmtDate } from './data'

interface SeasonsTabProps {
  seasons: Season[]
  loading: boolean
  onAdd: (payload: Partial<Season>) => Promise<unknown> | void
  onUpdate: (id: string, payload: Partial<Season>) => Promise<unknown> | void
}

export default function SeasonsTab({ seasons, loading, onAdd, onUpdate }: SeasonsTabProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Inline date editing for an existing season.
  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const submit = async () => {
    setSaving(true)
    try {
      await onAdd({
        name: name.trim(),
        description: description.trim(),
        start_date: startDate,
        end_date: endDate,
      })
      setName('')
      setDescription('')
      setStartDate('')
      setEndDate('')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (s: Season) => {
    setEditId(s.id)
    setEditStart(s.start_date ?? '')
    setEditEnd(s.end_date ?? '')
  }

  const saveEdit = async (s: Season) => {
    await onUpdate(s.id, {
      name: s.name,
      description: s.description,
      start_date: editStart,
      end_date: editEnd,
    })
    setEditId(null)
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* ── Create season ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">Create Season</h2>
        <p className="mt-1 text-xs text-gray-400">
          A season is a named period. Sales &amp; entries belong to the season their date falls in.
        </p>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Season Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 Dalwa"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Season Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>

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
                <th className="w-10 px-4 py-3 font-medium text-gray-400">#</th>
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Period</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {seasons.map((s, i) => {
                const editing = editId === s.id
                const hasRange = s.start_date && s.end_date
                return (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-300">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
                          <span className="text-gray-400">→</span>
                          <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black" />
                        </div>
                      ) : hasRange ? (
                        <span>{fmtDate(s.start_date!)} → {fmtDate(s.end_date!)}</span>
                      ) : (
                        <span className="text-amber-600">No dates — set a range</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEdit(s)} className="rounded p-1 text-green-600 hover:bg-green-50" title="Save">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditId(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Cancel">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(s)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit dates">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black'
