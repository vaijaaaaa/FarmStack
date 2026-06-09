'use client'

import { useState } from 'react'
import { Plus, Users, ArrowLeftRight, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useDatabase'
import type { LedgerRecord, Season } from '@/types/farmstack'
import SearchableSelect from './SearchableSelect'
import SeasonLedgerTable from './SeasonLedgerTable'
import LedgerSeasonViewModal from './LedgerSeasonViewModal'

interface LedgerAddingTabProps {
  seasons: Season[]
  ledgers: LedgerRecord[]
  onAdd: (payload: Partial<LedgerRecord>) => Promise<unknown>
  onBulkAdd: (payload: {
    season_id: string
    customers: Partial<LedgerRecord>[]
  }) => Promise<{ created: number; skipped: number }>
  onMove: (payload: {
    season_id: string
    from_customer_id: string
    to_customer_id: string
    to_customer_name: string
  }) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
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

export default function LedgerAddingTab({ seasons, ledgers, onAdd, onBulkAdd, onMove, onDelete }: LedgerAddingTabProps) {
  const { customers } = useCustomers()
  const [form, setForm] = useState(EMPTY)
  // The "Account" dropdown — the customer already added to the selected season.
  const [accountCustomerId, setAccountCustomerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [showView, setShowView] = useState(false)

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // Account = ALL customers — this is the customer you add to the season (or the
  // SOURCE when moving). User = ALL customers too, but optional: only the move target.
  const accountOptions = customers.map((c) => ({ value: c.id, label: c.name }))
  const userOptions = customers.map((c) => ({ value: c.id, label: c.name }))

  const changeSeason = (v: string) => {
    setForm((prev) => ({ ...EMPTY, seasonId: v }))
    setAccountCustomerId('')
    setMsg(null)
  }

  // Selecting an Account just picks the customer. Detail fields reset to blank —
  // there's no edit; an account is created once. The User pick is left untouched
  // (Account + User together means "move" — see submit).
  const selectAccount = (cid: string) => {
    setAccountCustomerId(cid)
    setMsg(null)
    setForm((prev) => ({
      ...prev,
      description: '',
      acres: '',
      closureDate: '',
      creditLimit: '',
      displayNumber: '',
    }))
  }

  // Selecting a User. With no Account picked → add a new ledger; with an Account
  // also picked → move that account's data into this user.
  const selectUser = (v: string) => {
    set('userId', v)
    setMsg(null)
  }

  // Runs the move after the user confirms via the toast action.
  const doMove = async (
    seasonId: string,
    fromId: string,
    toId: string,
    sourceName: string,
    targetName: string,
  ) => {
    setSaving(true)
    try {
      await onMove({
        season_id: seasonId,
        from_customer_id: fromId,
        to_customer_id: toId,
        to_customer_name: targetName,
      })
      setAccountCustomerId('')
      setForm((prev) => ({ ...EMPTY, seasonId: prev.seasonId }))
      toast.success(`Moved ${sourceName} → ${targetName}`)
      setMsg({ kind: 'ok', text: `Moved ${sourceName}'s account to ${targetName}.` })
    } catch (err) {
      const text = (err as Error).message
      setMsg({ kind: 'err', text })
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    setMsg(null)
    if (!form.seasonId) {
      setMsg({ kind: 'err', text: 'Please select a season.' })
      return
    }

    // MOVE — an Account (source) AND a User (target) are both selected: move that
    // account's whole ledger (sales + entries) into the target user.
    if (accountCustomerId && form.userId) {
      if (accountCustomerId === form.userId) {
        setMsg({ kind: 'err', text: 'Pick a different user to move this account into.' })
        return
      }
      // The source must already be an account in this season (else nothing to move).
      const sourceLedger = ledgers.find(
        (l) => l.season_id === form.seasonId && l.customer_id === accountCustomerId,
      )
      if (!sourceLedger) {
        const name = customers.find((c) => c.id === accountCustomerId)?.name ?? 'That account'
        toast.error(`${name} isn't in this season yet — add them first.`)
        return
      }
      if (ledgers.some((l) => l.season_id === form.seasonId && l.customer_id === form.userId)) {
        const name = customers.find((c) => c.id === form.userId)?.name ?? 'That customer'
        toast.error(`${name} already has an account in this season`)
        return
      }
      const sourceName = sourceLedger.customer_name || 'this account'
      const target = customers.find((c) => c.id === form.userId)
      const targetName = target?.name ?? 'the selected user'
      const seasonId = form.seasonId
      const fromId = accountCustomerId
      const toId = form.userId
      toast(`Move everything from "${sourceName}" to "${targetName}"?`, {
        description: "Their sales and entries in this season will be reassigned. This can't be undone automatically.",
        action: { label: 'Move', onClick: () => doMove(seasonId, fromId, toId, sourceName, targetName) },
        cancel: { label: 'Cancel', onClick: () => {} },
      })
      return
    }

    // ADD / UPDATE — the customer is the Account. (User is only for moving.)
    const customerId = accountCustomerId
    if (!customerId) {
      setMsg({ kind: 'err', text: 'Please select an account (customer).' })
      return
    }

    // An account is created ONCE per season — no editing. Re-adding the same
    // customer is blocked with a toast.
    if (ledgers.some((l) => l.season_id === form.seasonId && l.customer_id === customerId)) {
      const name = customers.find((c) => c.id === customerId)?.name ?? 'This customer'
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
      await onAdd(payload)
      setAccountCustomerId('')
      setForm((prev) => ({ ...EMPTY, seasonId: prev.seasonId }))
      setMsg({ kind: 'ok', text: `${customer?.name ?? 'Customer'} added to the season.` })
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // Account (source) + User (target) both chosen → move mode.
  const moving = !!accountCustomerId && !!form.userId
  const moveSourceName =
    customers.find((c) => c.id === accountCustomerId)?.name ?? ''
  const moveTargetName = customers.find((c) => c.id === form.userId)?.name ?? ''

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowView(true)}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            <button
              onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
            >
              <Users className="h-3.5 w-3.5" /> Add All
            </button>
          </div>
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

          {/* Account = the customer (all customers) · User = optional move target */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account (customer)">
              <SearchableSelect
                options={accountOptions}
                value={accountCustomerId}
                onChange={selectAccount}
                placeholder="— Select customer —"
              />
            </Field>
            <Field label="User (optional · move to)">
              <SearchableSelect
                options={userOptions}
                value={form.userId}
                onChange={selectUser}
                placeholder="— Only to move —"
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

          {moving && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
              <span>
                Move <b>{moveSourceName || 'this account'}</b>&rsquo;s sales &amp; entries
                {' → '}
                <b>{moveTargetName || 'the selected user'}</b> in this season.
              </span>
            </div>
          )}

          {msg && (
            <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </p>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className={`mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
              moving ? 'bg-amber-600 hover:bg-amber-700' : 'bg-black hover:bg-gray-900'
            }`}
          >
            {moving ? (
              <>
                <ArrowLeftRight className="h-4 w-4" /> {saving ? 'Moving…' : 'Move Account'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {saving ? 'Saving…' : 'Add'}
              </>
            )}
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

      {showView && (
        <LedgerSeasonViewModal
          seasons={seasons}
          ledgers={ledgers}
          defaultSeasonId={form.seasonId}
          onClose={() => setShowView(false)}
          onDelete={onDelete}
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
