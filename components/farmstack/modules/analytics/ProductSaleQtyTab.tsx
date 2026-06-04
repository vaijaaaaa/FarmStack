'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { useProducts, useSalesInvoices } from '@/hooks/useDatabase'

function toYMD(raw: string): string {
  if (!raw?.trim()) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return raw.slice(0, 10)
}

export default function ProductSaleQtyTab() {
  const { products } = useProducts()
  const { invoices: salesInvoices, loading } = useSalesInvoices()

  // Product search dropdown state — mirrors the sales invoice filter pattern
  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [productOpen, setProductOpen] = useState(false)
  const productBoxRef = useRef<HTMLDivElement>(null)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Close dropdown on outside click
  useEffect(() => {
    if (!productOpen) return
    const handler = (e: MouseEvent) => {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [productOpen])

  const selectedProduct = products.find((p) => p.id === productId)

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()),
  )

  // All sales line items for the selected product within the date range
  const rows = useMemo(() => {
    if (!productId) return []
    const result: {
      invoiceId: string
      date: string
      customerName: string
      qty: number
      rate: number
      gst: number
      lineTotal: number
      unit: string
    }[] = []

    for (const inv of salesInvoices) {
      const invDate = toYMD(inv.date || new Date(inv.created_at).toISOString())
      if (fromDate && invDate < fromDate) continue
      if (toDate && invDate > toDate) continue

      for (const it of inv.items || []) {
        if (String(it.product_id) !== productId) continue
        const lineTotal = it.quantity * it.rate * (1 + (it.gst || 0) / 100)
        result.push({
          invoiceId: inv.invoice_number || inv.id,
          date: invDate,
          customerName: inv.customer_name || '',
          qty: Number(it.quantity || 0),
          rate: Number(it.rate || 0),
          gst: Number(it.gst || 0),
          lineTotal,
          unit: it.unit || selectedProduct?.unit || '',
        })
      }
    }

    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [productId, salesInvoices, fromDate, toDate, selectedProduct])

  // Summary totals
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.lineTotal, 0)
  const invoiceCount = new Set(rows.map((r) => r.invoiceId)).size

  const clearAll = () => {
    setProductId('')
    setProductSearch('')
    setFromDate('')
    setToDate('')
  }

  const hasFilters = productId || fromDate || toDate

  if (loading) {
    return <p className="mt-10 text-center text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="mt-4">
      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end gap-4">

        {/* Product searchable dropdown */}
        <div ref={productBoxRef} className="relative flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Product</label>
          <input
            type="text"
            value={productId ? (selectedProduct?.name ?? '') : productSearch}
            placeholder="Search product…"
            onChange={(e) => {
              setProductSearch(e.target.value)
              setProductId('')
              setProductOpen(true)
            }}
            onFocus={() => setProductOpen(true)}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
          {productOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 w-64 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white">
              {filteredProducts.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-500">No products found</p>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id)
                      setProductSearch('')
                      setProductOpen(false)
                    }}
                    className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-100 ${
                      p.id === productId ? 'bg-gray-100 font-medium' : ''
                    }`}
                  >
                    <span>{p.name}</span>
                    {p.product_type && (
                      <span className="ml-2 text-xs text-gray-400">{p.product_type}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* From date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* To date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="self-end rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── No product selected state ─────────────────────────────────── */}
      {!productId && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <BarChart2 className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">Select a product to see its sales data</p>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {productId && (
        <>
          {/* Summary cards */}
          <div className="mb-5 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs text-gray-400">Total Qty Sold</p>
              <p className="mt-1 text-2xl font-semibold text-gray-800">
                {totalQty} <span className="text-sm font-normal text-gray-400">{selectedProduct?.unit}</span>
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs text-gray-400">Total Revenue</p>
              <p className="mt-1 text-2xl font-semibold text-gray-800">
                ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs text-gray-400">No. of Invoices</p>
              <p className="mt-1 text-2xl font-semibold text-gray-800">{invoiceCount}</p>
            </div>
          </div>

          {/* Sales table */}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <p className="text-sm text-gray-400">
                No sales found for <span className="font-medium text-gray-600">{selectedProduct?.name}</span>
                {(fromDate || toDate) && ' in the selected period'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">{selectedProduct?.name}</span>
                {(fromDate || toDate) && (
                  <span className="ml-2 text-xs text-gray-400">
                    {fromDate && `from ${fromDate}`}{fromDate && toDate && ' · '}{toDate && `to ${toDate}`}
                  </span>
                )}
                <span className="ml-2 text-xs text-gray-400">· {rows.length} sale{rows.length !== 1 ? 's' : ''}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="w-10 px-4 py-3 font-medium text-gray-400">#</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Invoice</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Customer</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Qty</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Rate</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">GST</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-300">{i + 1}</td>
                      <td className="px-4 py-3 text-gray-600">{r.date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.invoiceId}</td>
                      <td className="px-4 py-3 text-gray-700">{r.customerName || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {r.qty} {r.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        ₹{r.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.gst}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        ₹{r.lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-4 py-3 text-sm font-medium text-gray-500">Total</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {totalQty} {selectedProduct?.unit}
                    </td>
                    <td colSpan={2} />
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
