'use client'

import { useMemo, useState } from 'react'
import { TrendingDown } from 'lucide-react'
import { useProducts, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'

// Window over which sales velocity is measured.
const RUN_RATE_WINDOW_DAYS = 30
// Selectable "run out within N days" cutoffs.
const THRESHOLDS = [10, 15, 30, 60]

function toYMD(raw: string): string {
  if (!raw?.trim()) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return raw.slice(0, 10)
}

// YYYY-MM-DD for `n` days before today (local time).
function ymdDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function riskBadge(daysLeft: number) {
  if (daysLeft <= 0) return { text: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
  if (daysLeft <= 5) return { text: `${daysLeft}d left`, cls: 'bg-red-100 text-red-700' }
  return { text: `${daysLeft}d left`, cls: 'bg-yellow-100 text-yellow-700' }
}

export default function RunRateTab() {
  const { products, loading: pLoading } = useProducts()
  const { invoices: purchaseRows, loading: piLoading } = usePurchaseInvoices()
  const { invoices: salesInvoices, loading: siLoading } = useSalesInvoices()
  const [search, setSearch] = useState('')
  const [threshold, setThreshold] = useState(10)

  const loading = pLoading || piLoading || siLoading

  const rows = useMemo(() => {
    const windowStart = ymdDaysAgo(RUN_RATE_WINDOW_DAYS)

    // Total purchased per product (all time)
    const purchased = new Map<string, number>()
    for (const r of purchaseRows) {
      const id = String(r.product_id || '')
      if (!id) continue
      purchased.set(id, (purchased.get(id) || 0) + Number(r.quantity || 0))
    }

    // Total sold per product (all time) + sold within the run-rate window
    const sold = new Map<string, number>()
    const soldInWindow = new Map<string, number>()
    for (const inv of salesInvoices) {
      const d = toYMD(inv.date || new Date(inv.created_at).toISOString())
      const inWindow = d >= windowStart
      for (const it of inv.items || []) {
        const id = String(it.product_id || '')
        if (!id) continue
        const qty = Number(it.quantity || 0)
        sold.set(id, (sold.get(id) || 0) + qty)
        if (inWindow) soldInWindow.set(id, (soldInWindow.get(id) || 0) + qty)
      }
    }

    return products
      .map((p) => {
        const available = (purchased.get(p.id) || 0) - (sold.get(p.id) || 0)
        const windowQty = soldInWindow.get(p.id) || 0
        const runRate = windowQty / RUN_RATE_WINDOW_DAYS // qty per day
        // Days until stock hits zero at the current rate.
        const daysLeft = runRate > 0 ? Math.floor(available / runRate) : Infinity
        return {
          id: p.id,
          name: p.name,
          type: p.product_type || '',
          unit: p.unit || '',
          available,
          runRate,
          daysLeft,
        }
      })
      // Only products that are actually moving (runRate > 0). Products with no
      // recent sales → daysLeft Infinity → not "going OOS", so they're dropped.
      .filter((r) => r.daysLeft !== Infinity)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [products, purchaseRows, salesInvoices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (r.daysLeft > threshold) return false
      if (q && !(r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))) {
        return false
      }
      return true
    })
  }, [rows, search, threshold])

  if (loading) {
    return <p className="mt-10 text-center text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="mt-4">
      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search product or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-400"
        />

        {/* Threshold chips — "running out within N days" */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Runs out within</span>
          {THRESHOLDS.map((days) => (
            <button
              key={days}
              onClick={() => setThreshold(days)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                threshold === days
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>

        <span className="ml-auto text-sm text-gray-400">
          {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        Run rate is based on sales in the last {RUN_RATE_WINDOW_DAYS} days.
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <TrendingDown className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">
            {search
              ? 'No products match your search'
              : `No products are projected to run out within ${threshold} days`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="w-10 px-4 py-3 font-medium text-gray-400">#</th>
                <th className="px-4 py-3 font-medium text-gray-500">Product</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Available</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Run Rate</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Days Left</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const b = riskBadge(r.daysLeft)
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-300">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.type || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.available} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.runRate.toFixed(1)} {r.unit}/day
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {r.daysLeft <= 0 ? '0' : r.daysLeft}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>
                        {b.text}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
