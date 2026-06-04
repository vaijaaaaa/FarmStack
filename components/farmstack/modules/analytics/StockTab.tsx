'use client'

import { useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { useProducts, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'

function stockBadge(available: number) {
  if (available <= 0) return { text: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
  if (available <= 10) return { text: 'Low Stock', cls: 'bg-yellow-100 text-yellow-700' }
  return { text: 'In Stock', cls: 'bg-green-100 text-green-700' }
}

// Normalise any date string to YYYY-MM-DD for comparison
function toYMD(raw: string): string {
  if (!raw?.trim()) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  // DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return raw.slice(0, 10)
}

export default function StockTab() {
  const { products, loading: pLoading } = useProducts()
  const { invoices: purchaseRows, loading: piLoading } = usePurchaseInvoices()
  const { invoices: salesInvoices, loading: siLoading } = useSalesInvoices()

  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const loading = pLoading || piLoading || siLoading

  const rows = useMemo(() => {
    const from = fromDate || ''
    const to = toDate || ''

    // Filter and sum purchased qty per product
    const purchased = new Map<string, number>()
    for (const r of purchaseRows) {
      const id = String(r.product_id || '')
      if (!id) continue
      if (from || to) {
        const d = toYMD(r.purchase_date || '')
        if (from && d < from) continue
        if (to && d > to) continue
      }
      purchased.set(id, (purchased.get(id) || 0) + Number(r.quantity || 0))
    }

    // Filter and sum sold qty per product
    const sold = new Map<string, number>()
    for (const inv of salesInvoices) {
      if (from || to) {
        const d = toYMD(inv.date || '')
        if (from && d < from) continue
        if (to && d > to) continue
      }
      for (const it of inv.items || []) {
        const id = String(it.product_id || '')
        if (!id) continue
        sold.set(id, (sold.get(id) || 0) + Number(it.quantity || 0))
      }
    }

    return products
      .map((p) => {
        const buy = purchased.get(p.id) || 0
        const sell = sold.get(p.id) || 0
        return {
          id: p.id,
          name: p.name,
          type: p.product_type || '',
          unit: p.unit || '',
          purchased: buy,
          sold: sell,
          available: buy - sell,
          price: p.selling_price || 0,
        }
      })
      .filter((r) => r.purchased > 0 || r.sold > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, purchaseRows, salesInvoices, fromDate, toDate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q),
    )
  }, [rows, search])

  if (loading) {
    return <p className="mt-10 text-center text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="mt-4">
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search product or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-400"
        />

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-400"
          />
        </div>

        {(fromDate || toDate) && (
          <button
            onClick={() => { setFromDate(''); setToDate('') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear dates
          </button>
        )}

        <span className="ml-auto text-sm text-gray-400">
          {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">
            {search || fromDate || toDate
              ? 'No products match the selected filters'
              : 'No stock data found'}
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
                <th className="px-4 py-3 text-right font-medium text-gray-500">Purchased</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Sold</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Available</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Selling Price</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const s = stockBadge(r.available)
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-300">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.type || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.purchased} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.sold} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {r.available} {r.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      ₹{r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
                        {s.text}
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
