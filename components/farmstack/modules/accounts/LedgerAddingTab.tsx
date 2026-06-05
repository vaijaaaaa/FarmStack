'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCustomers } from '@/hooks/useDatabase'
import SearchableSelect from './SearchableSelect'
import type { Season, Ledger } from './data'

interface LedgerAddingTabProps {
  seasons: Season[]
  onAddLedger: (l: Omit<Ledger, 'id' | 'lines' | 'status'>) => void
}

const EMPTY = {
  seasonId: '',
  account: '',
  user: '',
  description: '',
  acres: '',
  closureDate: '',
  loyalty: '',
  displayNumber: '',
}

export default function LedgerAddingTab({ seasons, onAddLedger }: LedgerAddingTabProps) {
  const { customers } = useCustomers()
  const [form, setForm] = useState(EMPTY)

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    onAddLedger({
      seasonId: form.seasonId,
      account: form.account,
      user: form.user,
      description: form.description,
      acres: Number(form.acres) || 0,
      creditLimit: Number(form.loyalty) || 0,
      displayNumber: Number(form.displayNumber) || 0,
      closureDate: form.closureDate,
    })
    setForm((prev) => ({ ...EMPTY, seasonId: prev.seasonId }))
  }

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  const customerOptions = customers.map((c) => ({
    value: c.name,
    label: c.name,
  }))

  return (
    <div className="flex h-full items-center justify-center pt-3">
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Add Ledger</h2>

        <div className="mt-3 space-y-2.5">
          {/* Season */}
          <Field label="Season">
            <SearchableSelect
              options={seasonOptions}
              value={form.seasonId}
              onChange={(v) => set('seasonId', v)}
              placeholder="— Select season —"
            />
          </Field>

          {/* Account + User */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account">
              <SearchableSelect
                options={customerOptions}
                value={form.account}
                onChange={(v) => set('account', v)}
                placeholder="— Select —"
              />
            </Field>
            <Field label="User">
              <SearchableSelect
                options={customerOptions}
                value={form.user}
                onChange={(v) => set('user', v)}
                placeholder="— Select —"
              />
            </Field>
          </div>

          {/* Description */}
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Acres + Closure Date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Acres">
              <input
                type="number"
                value={form.acres}
                onChange={(e) => set('acres', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </Field>
            <Field label="Closure Date">
              <input
                type="date"
                value={form.closureDate}
                onChange={(e) => set('closureDate', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Loyalty + Display Number */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loyalty (Credit Limit)">
              <input
                type="number"
                value={form.loyalty}
                onChange={(e) => set('loyalty', e.target.value)}
                placeholder="50000"
                className={inputCls}
              />
            </Field>
            <Field label="Display Number">
              <input
                type="number"
                value={form.displayNumber}
                onChange={(e) => set('displayNumber', e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </Field>
          </div>

          <button
            onClick={submit}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-900"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}
