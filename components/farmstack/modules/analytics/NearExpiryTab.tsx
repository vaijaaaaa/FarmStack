'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useProducts } from '@/hooks/useDatabase'

function parseExpiry(raw: string): Date | null {
  if (!raw?.trim()) return null
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function daysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000)
}

function expiryBadge(days: number) {
  if (days < 0) return { text: 'Expired', cls: 'bg-red-100 text-red-700' }
  if (days <= 7) return { text: `${days}d left`, cls: 'bg-red-100 text-red-700' }
  if (days <= 30) return { text: `${days}d left`, cls: 'bg-yellow-100 text-yellow-700' }
  return { text: `${days}d left`, cls: 'bg-gray-100 text-gray-500' }
}

export default function NearExpiryTab() {
  const { products, loading } = useProducts()
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    return products
      .map((p) => {
        const date = parseExpiry(p.expiry_date || '')
        if (!date) return null
        return { ...p, expiryDate: date, daysLeft: daysUntil(date) }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.product_type || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  if (loading) {
    return <p className="mt-10 text-center text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search product or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-400"
        />
        <span className="text-sm text-gray-400">
          {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">
            {search ? 'No products match your search' : 'No products with an expiry date found'}
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
                <th className="px-4 py-3 font-medium text-gray-500">Unit</th>
                <th className="px-4 py-3 font-medium text-gray-500">Expiry Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const b = expiryBadge(r.daysLeft)
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-300">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.product_type || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.unit || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.expiryDate.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
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
