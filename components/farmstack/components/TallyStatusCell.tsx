'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { tallyApi, invoiceApi, type TallyEntityType } from '@/src/services/api'

interface TallyStatusCellProps {
  type: TallyEntityType
  invoiceId: string
  status: string
  response?: string | null
  onSynced: () => void | Promise<void>
}

const STYLES: Record<string, string> = {
  synced: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-orange-100 text-orange-700',
  pending: 'bg-yellow-100 text-yellow-700',
  not_synced: 'bg-gray-100 text-gray-600',
}

const LABELS: Record<string, string> = {
  synced: 'Synced',
  failed: 'Failed',
  blocked: 'Blocked',
  pending: 'Pending',
  not_synced: 'Not Synced',
}

export default function TallyStatusCell({
  type,
  invoiceId,
  status,
  response,
  onSynced,
}: TallyStatusCellProps) {
  const [busy, setBusy] = useState(false)
  const [localStatus, setLocalStatus] = useState(status)
  const [localMsg, setLocalMsg] = useState(response || '')
  const [editing, setEditing] = useState(false)
  const [dateVal, setDateVal] = useState('')

  const isVoucher = type === 'purchase' || type === 'sales'
  const canRetry = localStatus !== 'synced' && localStatus !== 'pending'

  const showFullMessage = (st: string, msg: string) => {
    if (!msg) return
    const title = `Tally: ${LABELS[st] || st}`
    if (st === 'synced') toast.success(title, { description: msg, duration: 12000 })
    else if (st === 'blocked') toast.warning(title, { description: msg, duration: 12000 })
    else toast.error(title, { description: msg, duration: 12000 })
  }

  const runSync = async () => {
    const result = await tallyApi.sync(type, invoiceId)
    setLocalStatus(result.status)
    setLocalMsg(result.message)
    showFullMessage(result.status, result.message)
    if (result.status === 'synced') setEditing(false)
    await onSynced()
  }

  const handleRetry = async () => {
    setBusy(true)
    try {
      await runSync()
    } catch (err) {
      const msg = (err as Error).message
      setLocalStatus('failed')
      setLocalMsg(msg)
      showFullMessage('failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDateAndSync = async () => {
    if (!dateVal) {
      toast.error('Pick a date first')
      return
    }
    setBusy(true)
    try {
      await invoiceApi.updateDate(type as 'purchase' | 'sales', invoiceId, dateVal)
      await runSync()
    } catch (err) {
      const msg = (err as Error).message
      setLocalStatus('failed')
      setLocalMsg(msg)
      showFullMessage('failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const hasMsg = Boolean(localMsg)
  const isError = localStatus === 'failed' || localStatus === 'blocked'

  return (
    <div className="flex flex-col items-start gap-1.5 min-w-[120px]">
      <button
        type="button"
        onClick={() => hasMsg && showFullMessage(localStatus, localMsg)}
        disabled={!hasMsg}
        title={hasMsg ? 'Click to see full message' : undefined}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
          STYLES[localStatus] || STYLES.not_synced
        } ${hasMsg ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        {busy ? 'Syncing…' : LABELS[localStatus] || localStatus}
      </button>

      {canRetry && !busy && !editing && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 whitespace-nowrap"
          >
            {localStatus === 'not_synced' ? 'Sync to Tally' : 'Retry Sync'}
          </button>
          {isVoucher && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap"
            >
              Edit date &amp; sync
            </button>
          )}
        </div>
      )}

      {isVoucher && editing && (
        <div className="flex flex-col items-start gap-1">
          <input
            type="date"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            disabled={busy}
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-800"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSaveDateAndSync}
              disabled={busy}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
            >
              {busy ? 'Syncing…' : 'Save & Sync'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isError && hasMsg && !editing && (
        <button
          type="button"
          onClick={() => showFullMessage(localStatus, localMsg)}
          className="text-xs text-red-600 underline decoration-dotted underline-offset-2 hover:text-red-700 whitespace-nowrap"
        >
          View error
        </button>
      )}
    </div>
  )
}
