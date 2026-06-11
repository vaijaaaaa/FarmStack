'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@/types/farmstack'

// Advanced product search popup — filter by name (starts/contains/ends) and by
// selling-price / tally-price (CPrice) ranges. Results are hidden until the user
// types a filter or presses Get. Shared by the Purchase and Sales invoice screens
// so both behave identically.
interface Props {
  open: boolean
  onClose: () => void
  products: Product[]
  onSelect: (product: Product) => void
}

const EMPTY = {
  startsWith: '',
  contains: '',
  endsWith: '',
  priceFrom: '',
  priceTo: '',
  cPriceFrom: '',
  cPriceTo: '',
}

export default function ProductSearchModal({ open, onClose, products, onSelect }: Props) {
  const [filters, setFilters] = useState(EMPTY)
  const [showResults, setShowResults] = useState(false)

  // Reset filters + hide the grid every time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setFilters(EMPTY)
      setShowResults(false)
    }
  }, [open])

  if (!open) return null

  const set = (patch: Partial<typeof EMPTY>) => setFilters((f) => ({ ...f, ...patch }))

  const results = products.filter((product) => {
    const name = product.name.toLowerCase()
    const sellingPrice = Number(product.selling_price ?? 0)
    const tallyPrice = Number(product.tally_price ?? 0)
    const priceFrom = Number(filters.priceFrom || 0)
    const priceTo = Number(filters.priceTo || 0)
    const cPriceFrom = Number(filters.cPriceFrom || 0)
    const cPriceTo = Number(filters.cPriceTo || 0)
    return (
      (!filters.startsWith || name.startsWith(filters.startsWith.toLowerCase())) &&
      (!filters.contains || name.includes(filters.contains.toLowerCase())) &&
      (!filters.endsWith || name.endsWith(filters.endsWith.toLowerCase())) &&
      (!priceFrom || sellingPrice >= priceFrom) &&
      (!priceTo || sellingPrice <= priceTo) &&
      (!cPriceFrom || tallyPrice >= cPriceFrom) &&
      (!cPriceTo || tallyPrice <= cPriceTo)
    )
  })

  const hasFilters = Object.values(filters).some((v) => v.trim() !== '')
  const choose = (p: Product) => {
    onSelect(p)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-lg border border-gray-300 w-[520px] max-w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-300 bg-gray-50">
          <h3 className="text-lg font-bold text-black">ProductSearch</h3>
          <button
            data-kbd-cancel
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 font-bold text-xl"
          >
            &times;
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 border-b border-gray-300">
          {/* Name — Starts With / Contains / Ends With, all inline */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-800 w-28 shrink-0">Name :</label>
            <span className="text-xs text-gray-600 shrink-0">Starts With</span>
            <input
              type="text"
              autoFocus
              value={filters.startsWith}
              onChange={(e) => set({ startsWith: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 min-w-0 flex-1 focus:outline-none text-sm bg-white"
            />
            <span className="text-xs text-gray-600 shrink-0">Contains</span>
            <input
              type="text"
              value={filters.contains}
              onChange={(e) => set({ contains: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 min-w-0 flex-1 focus:outline-none text-sm bg-white"
            />
            <span className="text-xs text-gray-600 shrink-0">Ends With</span>
            <input
              type="text"
              value={filters.endsWith}
              onChange={(e) => set({ endsWith: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 min-w-0 flex-1 focus:outline-none text-sm bg-white"
            />
          </div>

          {/* Price Range + Get */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28 shrink-0">Price Range :</label>
            <span className="text-xs text-gray-700 shrink-0">From</span>
            <input
              type="number"
              value={filters.priceFrom}
              onChange={(e) => set({ priceFrom: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 w-24 bg-white focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-700 shrink-0">To</span>
            <input
              type="number"
              value={filters.priceTo}
              onChange={(e) => set({ priceTo: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 w-24 bg-white focus:outline-none text-sm"
            />
            <button
              onClick={() => setShowResults(true)}
              className="ml-auto bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-1.5 rounded text-sm"
            >
              Get
            </button>
          </div>

          {/* CPrice Range + Clear */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28 shrink-0">CPrice Range :</label>
            <span className="text-xs text-gray-700 shrink-0">From</span>
            <input
              type="number"
              value={filters.cPriceFrom}
              onChange={(e) => set({ cPriceFrom: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 w-24 bg-white focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-700 shrink-0">To</span>
            <input
              type="number"
              value={filters.cPriceTo}
              onChange={(e) => set({ cPriceTo: e.target.value })}
              className="border border-gray-400 rounded px-2 py-1 w-24 bg-white focus:outline-none text-sm"
            />
            <button
              onClick={() => setFilters(EMPTY)}
              className="ml-auto bg-gray-400 hover:bg-gray-500 text-white font-medium px-6 py-1.5 rounded text-sm"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Results grid — shown only after the user searches (Get or a filter). */}
        {(showResults || hasFilters) && (
          <div className="flex flex-col min-h-0 flex-1 px-4 pb-4 pt-1">
            <p className="mb-2 text-xs font-medium text-gray-600">
              {results.length} result(s) found
            </p>
            <div className="min-h-0 flex-1 overflow-auto border border-gray-200 rounded-md">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-100 sticky top-0">
                  <tr className="border-b border-gray-300">
                    <th className="px-3 py-2 font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Product</th>
                    <th className="px-3 py-2 font-semibold text-gray-700 border-r border-gray-300 text-right whitespace-nowrap">Price</th>
                    <th className="px-3 py-2 font-semibold text-gray-700 text-right whitespace-nowrap">CPrice</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                        No products found
                      </td>
                    </tr>
                  ) : (
                    results.map((product) => (
                      <tr
                        key={product.id}
                        tabIndex={0}
                        onClick={() => choose(product)}
                        className="border-b border-gray-200 hover:bg-blue-100 focus:bg-blue-100 focus:outline-none cursor-pointer"
                      >
                        <td className="px-3 py-1.5 border-r border-gray-200 text-gray-800">{product.name}</td>
                        <td className="px-3 py-1.5 border-r border-gray-200 text-right text-gray-700">{Number(product.selling_price ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{Number(product.tally_price ?? 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
