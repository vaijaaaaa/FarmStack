'use client'

import { Fragment, useState, useEffect } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { productApi } from '@/src/services/api'
import { useProductTypes } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Save, X } from 'lucide-react'
import { toast } from 'sonner'

const DEFAULT_UNITS = ['Kg', 'Nos', 'Bags', 'Litre']
const DEFAULT_GST_RATES = [
  { value: '18', label: '18%' },
  { value: '5', label: '5%' },
  { value: '0', label: 'Exempted' },
]
const GST_SUPPLY_OPTIONS = [
  { value: 'local', label: 'Local (CGST + SGST)' },
  { value: 'interstate', label: 'Interstate (IGST)' },
]
const isExempted = (gstRate: string) => gstRate === '0'

interface ProductHistoryPageProps {
  language: Language
  onAddProduct: () => void
  onEditProduct: (product: Product) => void
  onBulkUpload: () => void
}

// All editable product fields (kept as strings for input binding).
interface EditRow {
  name: string
  hsn_code: string
  product_type: string
  unit: string
  gst_rate: string
  gst_supply_type: string
  selling_price: string
  tally_price: string
  expiry_date: string
  is_seed: boolean
}

const toEditRow = (p: Product): EditRow => ({
  name: p.name ?? '',
  hsn_code: p.hsn_code ?? '',
  product_type: p.product_type ?? '',
  unit: p.unit ?? '',
  gst_rate: p.gst_rate != null ? String(p.gst_rate) : '',
  gst_supply_type: p.gst_supply_type || 'local',
  selling_price: p.selling_price != null ? String(p.selling_price) : '',
  tally_price: p.tally_price != null ? String(p.tally_price) : '',
  expiry_date: p.expiry_date ?? '',
  is_seed: Boolean(p.is_seed),
})

export default function ProductHistoryPage({
  language,
  onAddProduct,
  onEditProduct,
  onBulkUpload,
}: ProductHistoryPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchBy, setSearchBy] = useState('name')

  const { productTypes } = useProductTypes()

  // Inline-edit state: edits keyed by product id. A key present here means the
  // row's edit form is open.
  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [savingAll, setSavingAll] = useState(false)

  const limit = 10

  const fetchProducts = async (page: number, query: string = '', field: string = 'name') => {
    try {
      setLoading(true)
      const result = await productApi.listPaginated(page, limit, query, field)
      setProducts(result.data)
      setCurrentPage(result.page)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts(1, search, searchBy)
  }, [])

  // Auto-search when search or searchBy changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1, search, searchBy)
    }, 300) // Debounce for 300ms
    return () => clearTimeout(timer)
  }, [search, searchBy])

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      fetchProducts(currentPage + 1, search, searchBy)
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      fetchProducts(currentPage - 1, search, searchBy)
    }
  }

  // ----- Inline editing ---------------------------------------------------
  const isEditing = (id: string) => id in edits

  const isDirty = (product: Product) => {
    const e = edits[product.id]
    if (!e) return false
    const orig = toEditRow(product)
    return (Object.keys(e) as (keyof EditRow)[]).some((k) => e[k] !== orig[k])
  }

  const startEdit = (product: Product) => {
    setEdits((prev) => ({ ...prev, [product.id]: toEditRow(product) }))
  }

  const cancelEdit = (id: string) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const changeField = (id: string, field: keyof EditRow, value: string | boolean) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // Validate an edited row. Returns an error message, or '' when valid.
  const validateRow = (e: EditRow): string => {
    if (!e.name.trim()) return 'Product Name is required'
    if (!e.hsn_code.trim()) return 'HSN Code is required'
    if (!e.product_type.trim()) return 'Product Type is required'
    if (!e.unit.trim()) return 'Unit is required'
    if (e.gst_rate === '') return 'GST Rate is required'
    const sp = Number(e.selling_price)
    if (e.selling_price.trim() === '' || !Number.isFinite(sp) || sp < 0) {
      return 'Selling Price must be a number 0 or more'
    }
    const tp = Number(e.tally_price)
    if (e.tally_price.trim() === '' || !Number.isFinite(tp) || tp < 0) {
      return 'Tally Price must be a number 0 or more'
    }
    if (e.is_seed && !e.expiry_date.trim()) return 'Expiry Date is required for seed products'
    return ''
  }

  // Build the full product payload (merge edits onto the original so untouched
  // fields like kannada_name / location / batch are preserved).
  const buildPayload = (product: Product, e: EditRow): Partial<Product> => ({
    ...product,
    name: e.name.trim(),
    hsn_code: e.hsn_code.trim(),
    product_type: e.product_type.trim(),
    unit: e.unit.trim(),
    gst_rate: Number(e.gst_rate || 0),
    gst_supply_type: isExempted(e.gst_rate) ? '' : e.gst_supply_type,
    selling_price: Number(e.selling_price || 0),
    tally_price: Number(e.tally_price || 0),
    expiry_date: e.expiry_date.trim(),
    is_seed: e.is_seed,
    tally_stock_item_name: e.name.trim(),
  })

  const saveRow = async (product: Product) => {
    const e = edits[product.id]
    if (!e) return
    const err = validateRow(e)
    if (err) {
      toast.error(err)
      return
    }
    try {
      await productApi.update(product.id, buildPayload(product, e))
      cancelEdit(product.id)
      toast.success('Product updated')
      fetchProducts(currentPage, search, searchBy)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const dirtyProducts = products.filter((p) => isDirty(p))

  const saveAll = async () => {
    if (dirtyProducts.length === 0) return
    for (const p of dirtyProducts) {
      const err = validateRow(edits[p.id])
      if (err) {
        toast.error(`${p.name}: ${err}`)
        return
      }
    }
    try {
      setSavingAll(true)
      for (const p of dirtyProducts) {
        await productApi.update(p.id, buildPayload(p, edits[p.id]))
      }
      setEdits({})
      toast.success(`${dirtyProducts.length} product(s) updated`)
      fetchProducts(currentPage, search, searchBy)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingAll(false)
    }
  }

  // Unit / GST-rate option lists for an edited row — defaults plus any
  // non-standard value the product already has.
  const unitOptionsFor = (e: EditRow) =>
    e.unit && !DEFAULT_UNITS.includes(e.unit) ? [...DEFAULT_UNITS, e.unit] : DEFAULT_UNITS
  const gstOptionsFor = (e: EditRow) =>
    e.gst_rate && !DEFAULT_GST_RATES.some((o) => o.value === e.gst_rate)
      ? [...DEFAULT_GST_RATES, { value: e.gst_rate, label: `${e.gst_rate}%` }]
      : DEFAULT_GST_RATES

  const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700'
  const tdClass = 'px-3 py-2 align-middle text-sm text-gray-900'
  const fieldClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
  const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

  // The editable form shown when a row is expanded.
  const renderEditForm = (product: Product) => {
    const e = edits[product.id]
    const units = unitOptionsFor(e)
    const gstRates = gstOptionsFor(e)
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelClass}>
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={e.name}
            onChange={(ev) => changeField(product.id, 'name', ev.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            HSN Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={e.hsn_code}
            onChange={(ev) => changeField(product.id, 'hsn_code', ev.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Product Type <span className="text-red-500">*</span>
          </label>
          <select
            value={e.product_type}
            onChange={(ev) => changeField(product.id, 'product_type', ev.target.value)}
            className={`${fieldClass} bg-white`}
          >
            <option value="">Select a type</option>
            {e.product_type && !productTypes.some((pt) => pt.name === e.product_type) && (
              <option value={e.product_type}>{e.product_type}</option>
            )}
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.name}>
                {pt.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>
            Unit <span className="text-red-500">*</span>
          </label>
          <select
            value={e.unit}
            onChange={(ev) => changeField(product.id, 'unit', ev.target.value)}
            className={`${fieldClass} bg-white`}
          >
            <option value="">Select a unit</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>
            GST Rate <span className="text-red-500">*</span>
          </label>
          <select
            value={e.gst_rate}
            onChange={(ev) => changeField(product.id, 'gst_rate', ev.target.value)}
            className={`${fieldClass} bg-white`}
          >
            <option value="">Select GST rate</option>
            {gstRates.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>
            GST Supply Type {!isExempted(e.gst_rate) && <span className="text-red-500">*</span>}
          </label>
          {isExempted(e.gst_rate) ? (
            <input
              type="text"
              value="Not Applicable (Exempted)"
              disabled
              className={`${fieldClass} bg-gray-100 text-gray-500`}
            />
          ) : (
            <select
              value={e.gst_supply_type}
              onChange={(ev) => changeField(product.id, 'gst_supply_type', ev.target.value)}
              className={`${fieldClass} bg-white`}
            >
              {GST_SUPPLY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className={labelClass}>
            Selling Price <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            value={e.selling_price}
            onChange={(ev) => changeField(product.id, 'selling_price', ev.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Tally Price <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            value={e.tally_price}
            onChange={(ev) => changeField(product.id, 'tally_price', ev.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Expiry Date {e.is_seed && <span className="text-red-500">*</span>}
          </label>
          <input
            type="date"
            value={e.expiry_date}
            onChange={(ev) => changeField(product.id, 'expiry_date', ev.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
            <input
              type="checkbox"
              checked={e.is_seed}
              onChange={(ev) => changeField(product.id, 'is_seed', ev.target.checked)}
              className="h-4 w-4 accent-black"
            />
            <span className="text-sm font-medium text-gray-700">This is a Seed</span>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">Product History</h2>
        <div className="flex gap-3">
          {dirtyProducts.length > 0 && (
            <Button
              onClick={saveAll}
              disabled={savingAll}
              className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {savingAll ? 'Saving...' : `Save All Changes (${dirtyProducts.length})`}
            </Button>
          )}
          <Button
            onClick={onBulkUpload}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Bulk Upload
          </Button>
          <Button
            onClick={onAddProduct}
            className="bg-black text-white hover:bg-gray-900"
          >
            Add Product
          </Button>
        </div>
      </div>

      {/* Search Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search By</label>
              <select
                value={searchBy}
                onChange={(e) => setSearchBy(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="name">Product Name</option>
                <option value="hsn_code">HSN Code</option>
                <option value="product_type">Product Type</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Value</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Enter search term..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
          {search && (
            <p className="text-sm text-gray-600">
              Showing results for: <span className="font-medium">{search}</span> in <span className="font-medium">{searchBy}</span>
            </p>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading products...</div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">
              {search ? 'No products found matching your search.' : 'No products available.'}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className={thClass}>Product Name</th>
                    <th className={thClass}>HSN Code</th>
                    <th className={thClass}>Type</th>
                    <th className={thClass}>GST Rate</th>
                    <th className={thClass}>Selling Price</th>
                    <th className={thClass}>Tally Price</th>
                    <th className={thClass}>Expiry Date</th>
                    <th className={thClass}>Unit</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const editing = isEditing(product.id)
                    const dirty = isDirty(product)
                    return (
                      <Fragment key={product.id}>
                        <tr
                          className={`border-b border-gray-100 ${dirty ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className={tdClass}>{product.name}</td>
                          <td className={tdClass}>{product.hsn_code || 'N/A'}</td>
                          <td className={tdClass}>{product.product_type || 'N/A'}</td>
                          <td className={tdClass}>
                            {Number(product.gst_rate) > 0 ? `${product.gst_rate}%` : 'Exempted'}
                          </td>
                          <td className={tdClass}>₹{product.selling_price || 0}</td>
                          <td className={tdClass}>₹{product.tally_price || 0}</td>
                          <td className={tdClass}>{product.expiry_date || 'N/A'}</td>
                          <td className={tdClass}>{product.unit || 'N/A'}</td>
                          <td className={tdClass}>
                            <button
                              onClick={() =>
                                editing ? cancelEdit(product.id) : startEdit(product)
                              }
                              className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                              title={editing ? 'Collapse' : 'Edit'}
                            >
                              {editing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              Edit
                            </button>
                          </td>
                        </tr>
                        {editing && (
                          <tr className={dirty ? 'bg-amber-50' : 'bg-gray-50'}>
                            <td colSpan={9} className="px-4 py-4">
                              {renderEditForm(product)}
                              <div className="mt-4 flex justify-end gap-2">
                                <button
                                  onClick={() => cancelEdit(product.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
                                >
                                  <X size={14} />
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveRow(product)}
                                  className="inline-flex items-center gap-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                                >
                                  <Save size={14} />
                                  Save
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600">
                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span> ({total} total products)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
