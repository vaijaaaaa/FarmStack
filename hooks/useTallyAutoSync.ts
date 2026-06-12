'use client'

import { useEffect, useRef } from 'react'
import { useSalesInvoices, usePurchaseInvoices } from './useDatabase'
import { tallyApi } from '@/src/services/api'

// Client-driven Tally drain queue.
//
// When Tally is closed, a saved invoice's background sync fails and its status
// becomes `failed` (the durable "queue" lives in the DB status column). This hook
// — mounted once app-wide — periodically checks whether Tally is reachable and,
// when it is, re-pushes every failed/blocked sale and purchase automatically, in
// order, so the user never has to click Retry. It runs entirely in the browser
// (the only place that knows the Tally tunnel URL and can reach local Tally), so
// it works the same in dev and on Vercel — for as long as a tab is open.
//
// Only `failed`/`blocked` are retried — never `pending` (still in-flight in the
// background queue) or `synced`/`not_synced` — matching the manual Retry button,
// so an invoice is never double-posted.
//
// CAP: each invoice is auto-retried at most MAX_ATTEMPTS times *while Tally is
// reachable*. This is the safety guard. Two distinct failure modes:
//   • Tally was closed  → no attempts are counted (we only try when reachable),
//     so when it's back the first attempt usually succeeds. Transient, recovers.
//   • Tally REJECTS it  (bad data, validation, a rejected voucher) → it will fail
//     every time. Without a cap this loops forever every 20s, hammering Tally and
//     — in the rare case Tally created the voucher but we read it as failed —
//     posting a DUPLICATE voucher each pass. The cap bounds that to MAX_ATTEMPTS
//     and then leaves the invoice `failed` for the user's manual Retry button.
// The per-invoice counter resets once an invoice stops failing, so a later genuine
// failure gets a fresh budget. (In-memory; resets on full page reload too.)
const POLL_MS = 20_000
const MAX_ATTEMPTS = 3
const RETRYABLE = new Set(['failed', 'blocked'])

export function useTallyAutoSync() {
  const { invoices: sales, refresh: refreshSales } = useSalesInvoices()
  const { invoices: purchases, refresh: refreshPurchases } = usePurchaseInvoices()

  // Keep the latest data/refreshers in a ref so the polling effect can stay
  // mounted once (empty deps) without restarting on every list change.
  const ref = useRef({ sales, purchases, refreshSales, refreshPurchases })
  ref.current = { sales, purchases, refreshSales, refreshPurchases }

  const runningRef = useRef(false)
  // Per-invoice auto-retry attempt counter, keyed by `${kind}:${id}`.
  const attemptsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false

    const drain = async () => {
      if (runningRef.current || cancelled) return
      const { sales, purchases, refreshSales, refreshPurchases } = ref.current
      const attempts = attemptsRef.current

      // Purchases first — a sale can only post once its products' purchases are in
      // Tally — then sales. Each as { kind, id }.
      const failed = [
        ...purchases
          .filter((i) => RETRYABLE.has(String(i.tally_sync_status)))
          .map((i) => ({ kind: 'purchase' as const, id: String(i.id) })),
        ...sales
          .filter((i) => RETRYABLE.has(String(i.tally_sync_status)))
          .map((i) => ({ kind: 'sales' as const, id: String(i.id) })),
      ]

      // Forget invoices that are no longer failing, so a fresh failure later gets
      // a fresh retry budget.
      const failedKeys = new Set(failed.map((f) => `${f.kind}:${f.id}`))
      for (const k of [...attempts.keys()]) if (!failedKeys.has(k)) attempts.delete(k)

      // Only those still under the attempt cap. The rest stay `failed` and wait
      // for the user's manual Retry button (unbounded, user-initiated).
      const todo = failed.filter((f) => (attempts.get(`${f.kind}:${f.id}`) ?? 0) < MAX_ATTEMPTS)
      if (todo.length === 0) return

      // Only ping Tally when there's actually something to push.
      const status = await tallyApi.status()
      if (!status.connected || cancelled) return

      runningRef.current = true
      try {
        for (const f of todo) {
          if (cancelled) break
          const key = `${f.kind}:${f.id}`
          // Count the attempt BEFORE trying, so a hang/throw still consumes budget.
          attempts.set(key, (attempts.get(key) ?? 0) + 1)
          try {
            await tallyApi.sync(f.kind, f.id)
          } catch {
            /* leave it failed; capped retries above prevent an endless loop */
          }
        }
        if (!cancelled) {
          await Promise.all([refreshPurchases(), refreshSales()])
        }
      } finally {
        runningRef.current = false
      }
    }

    const interval = setInterval(drain, POLL_MS)
    const initial = setTimeout(drain, 3_000) // shortly after load
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(initial)
    }
  }, [])
}
