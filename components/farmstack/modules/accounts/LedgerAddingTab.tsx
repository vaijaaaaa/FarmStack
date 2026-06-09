'use client'

import { useMemo, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useDatabase'
import type { LedgerRecord, Season } from '@/types/farmstack'
import SearchableSelect from './SearchableSelect'
import SeasonLedgerTable from './SeasonLedgerTable'

interface LedgerAddingTabProps {
  seasons: Season[]
  ledgers: LedgerRecord[]
  onAdd: (payload: Partial<LedgerRecord>) => Promise<unknown>
  onUpdate: (id: string, payload: Partial<LedgerRecord>) => Promise<unknown>
  onBulkAdd: (payload: {
    season_id: string
    customers: Partial<LedgerRecord>[]
  }) => Promise<{ created: number; skipped: number }>
}

const EMPTY = {
  seasonId: '',
  userId: '', // the "User" = a customer from the full master list
  description: '',
  acres: '',
  closureDate: '',
  creditLimit: '',
  displayNumber: '',
}

export default function LedgerAddingTab({ seasons, ledgers, onAdd, onUpdate, onBulkAdd }: LedgerAddingTabProps) {
  const { customers } = useCustomers()
  const [form, setForm] = useState(EMPTY)
  // The "Account" dropdown — the customer already added to the selected season.
  const [accountCustomerId, setAccountCustomerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showBulk, setShowBulk] = useState(false)

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // User = ALL customers (the master list to pick from).
  const userOptions = customers.map((c) => ({ value: c.id, label: c.name }))

  // Account = only the customers already attached to the selected season.
  const accountOptions = useMemo(
    () =>
      ledgers
        .filter((l) => l.season_id === form.seasonId)
        .map((l) => ({ value: l.customer_id, label: l.customer_name })),
    [ledgers, form.seasonId],
  )

  const changeSeason = (v: string) => {
    setForm((prev) => ({ ...EMPTY, seasonId: v }))
    setAccountCustomerId('')
    setMsg(null)
  }

  // Selecting an existing Account loads its details for editing (and clears User).
  const selectAccount = (cid: string) => {
    setAccountCustomerId(cid)
    setMsg(null)
    if (!cid) return
    const lg = ledgers.find((l) => l.season_id === form.seasonId && l.customer_id === cid)
    setForm((prev) => ({
      ...prev,
      userId: '',
      description: lg?.description ?? '',
      acres: lg ? String(lg.acres ?? 0) : '',
      closureDate: lg?.closure_date ?? '',
      creditLimit: lg ? String(lg.credit_limit ?? 0) : '',
      displayNumber: lg ? String(lg.display_number ?? 0) : '',
    }))
  }

  // Selecting a User (new customer) clears the Account selection.
  const selectUser = (v: string) => {
    set('userId', v)
    setAccountCustomerId('')
    setMsg(null)
  }

  const submit = async () => {
    setMsg(null)
    if (!form.seasonId) {
      setMsg({ kind: 'err', text: 'Please select a season.' })
      return
    }
    // The customer is whichever is chosen — a new User, or an existing Account.
    const customerId = form.userId || accountCustomerId
    if (!customerId) {
      setMsg({ kind: 'err', text: 'Please select a user (to add) or an account (to update).' })
      return
    }

    // A customer can only be added ONCE to a season. Adding a User who is already
    // in this season is blocked (editing via the Account dropdown is allowed).
    if (
      form.userId &&
      ledgers.some((l) => l.season_id === form.seasonId && l.customer_id === form.userId)
    ) {
      const name = customers.find((c) => c.id === form.userId)?.name ?? 'This customer'
      toast.error(`${name} is already in this season`)
      return
    }

    setSaving(true)
    try {
      const customer = customers.find((c) => c.id === customerId)
      const payload = {
        season_id: form.seasonId,
        customer_id: customerId,
        customer_name: customer?.name ?? '',
        description: form.description,
        acres: Number(form.acres) || 0,
        credit_limit: Number(form.creditLimit) || 0,
        display_number: Number(form.displayNumber) || 0,
        closure_date: form.closureDate,
      }
      if (editing) {
        const existing = ledgers.find(
          (l) => l.season_id === form.seasonId && l.customer_id === customerId,
        )
        if (existing) await onUpdate(existing.id, payload)
        else await onAdd(payload)
      } else {
        await onAdd(payload)
      }
      setAccountCustomerId(customerId)
      setForm((prev) => ({ ...EMPTY, seasonId: prev.seasonId }))
      setMsg({ kind: 'ok', text: `${customer?.name ?? 'Customer'} saved to the season.` })
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const editing = !!accountCustomerId && !form.userId

  return (
    <div className="flex h-full items-center justify-center pt-3">
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add Ledger</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Pick a season and a user (customer) to create their account.
            </p>
          </div>
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
          >
            <Users className="h-3.5 w-3.5" /> Add All
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          <Field label="Season">
            <SearchableSelect
              options={seasonOptions}
              value={form.seasonId}
              onChange={changeSeason}
              placeholder="— Select season —"
            />
          </Field>

          {/* Account = customers already in this season · User = all customers */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account (in this season)">
              <SearchableSelect
                options={accountOptions}
                value={accountCustomerId}
                onChange={selectAccount}
                placeholder={form.seasonId ? '— Accounts —' : '— Select season —'}
              />
            </Field>
            <Field label="User (customer)">
              <SearchableSelect
                options={userOptions}
                value={form.userId}
                onChange={selectUser}
                placeholder="— Select customer —"
              />
            </Field>
          </div>

          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputCls}
            />
          </Field>

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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Loyalty (Credit Limit)">
              <input
                type="number"
                value={form.creditLimit}
                onChange={(e) => set('creditLimit', e.target.value)}
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

          {msg && (
            <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </p>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
          </button>
        </div>
      </div>

      {showBulk && (
        <SeasonLedgerTable
          seasons={seasons}
          customers={customers}
          ledgers={ledgers}
          defaultSeasonId={form.seasonId}
          onClose={() => setShowBulk(false)}
          onBulkAdd={onBulkAdd}
        />
      )}
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
