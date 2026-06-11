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
const POLL_MS = 20_000
const RETRYABLE = new Set(['failed', 'blocked'])

export function useTallyAutoSync() {
  const { invoices: sales, refresh: refreshSales } = useSalesInvoices()
  const { invoices: purchases, refresh: refreshPurchases } = usePurchaseInvoices()

  // Keep the latest data/refreshers in a ref so the polling effect can stay
  // mounted once (empty deps) without restarting on every list change.
  const ref = useRef({ sales, purchases, refreshSales, refreshPurchases })
  ref.current = { sales, purchases, refreshSales, refreshPurchases }

  const runningRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const drain = async () => {
      if (runningRef.current || cancelled) return
      const { sales, purchases, refreshSales, refreshPurchases } = ref.current

      const failedSales = sales.filter((i) => RETRYABLE.has(String(i.tally_sync_status)))
      const failedPurch = purchases.filter((i) => RETRYABLE.has(String(i.tally_sync_status)))
      if (failedSales.length === 0 && failedPurch.length === 0) return

      // Only ping Tally when there's actually something to push.
      const status = await tallyApi.status()
      if (!status.connected || cancelled) return

      runningRef.current = true
      try {
        // Purchases first — a sale can only post once its products' purchases are
        // in Tally. Sequential, so we never hammer Tally with parallel posts.
        for (const inv of failedPurch) {
          if (cancelled) break
          try {
            await tallyApi.sync('purchase', inv.id)
          } catch {
            /* leave it failed; next pass retries */
          }
        }
        for (const inv of failedSales) {
          if (cancelled) break
          try {
            await tallyApi.sync('sales', inv.id)
          } catch {
            /* leave it failed; next pass retries */
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
