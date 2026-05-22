'use client'

import { useEffect, useRef, useState } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { productApi } from '@/src/services/api'
import { useProductTypes } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

const DEFAULT_UNITS = ['Kg', 'Nos', 'Bags', 'Liter']
const DEFAULT_GST_RATES = [
  { value: '18', label: '18%' },
  { value: '5', label: '5%' },
  { value: '0', label: 'Exempted' },
]
const GST_SUPPLY_OPTIONS = [
  { value: 'local', label: 'Local (CGST + SGST)' },
  { value: 'interstate', label: 'Interstate (IGST)' },
]

// Capitalises the first letter of each word; leaves existing capitals intact
// (so acronyms like "NPK" survive). "urea fertilizer" -> "Urea Fertilizer".
const toTitleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

// GST Rate "0" means Exempted — no tax is split, so GST Supply Type is N/A.
const isExempted = (gstRate: string) => gstRate === '0'

interface ProductFormData {
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

const emptyProduct: ProductFormData = {
  name: '',
  hsn_code: '',
  product_type: '',
  unit: '',
  gst_rate: '',
  gst_supply_type: 'local',
  selling_price: '',
  tally_price: '',
  expiry_date: '',
  is_seed: false,
}

interface AddProductPageProps {
  language: Language
  editingProduct?: Product | null
  onBack: () => void
  onSuccess: () => void
}

export default function AddProductPage({
  language,
  editingProduct,
  onBack,
  onSuccess,
}: AddProductPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [products, setProducts] = useState<ProductFormData[]>(
    editingProduct
      ? [
          {
            name: editingProduct.name,
            hsn_code: editingProduct.hsn_code || '',
            product_type: editingProduct.product_type || '',
            unit: editingProduct.unit || '',
            gst_rate: editingProduct.gst_rate != null ? String(editingProduct.gst_rate) : '',
            gst_supply_type: editingProduct.gst_supply_type || 'local',
            selling_price:
              editingProduct.selling_price != null ? String(editingProduct.selling_price) : '',
            tally_price:
              editingProduct.tally_price != null ? String(editingProduct.tally_price) : '',
            expiry_date: editingProduct.expiry_date || '',
            is_seed: Boolean(editingProduct.is_seed),
          },
        ]
      : [{ ...emptyProduct }],
  )
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const { productTypes, createProductType } = useProductTypes()

  // Unit / GST-rate option lists — can be extended from this page. Seeded with
  // the defaults plus any non-standard value the edited product already has.
  const [unitOptions, setUnitOptions] = useState<string[]>(() => {
    const u = editingProduct?.unit
    return u && !DEFAULT_UNITS.includes(u) ? [...DEFAULT_UNITS, u] : DEFAULT_UNITS
  })
  const [gstRateOptions, setGstRateOptions] = useState(() => {
    const r = editingProduct?.gst_rate
    if (r != null && !DEFAULT_GST_RATES.some((o) => o.value === String(r))) {
      return [...DEFAULT_GST_RATES, { value: String(r), label: `${r}%` }]
    }
    return DEFAULT_GST_RATES
  })

  // Add-Product-Type modal
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
  const [addTypeIndex, setAddTypeIndex] = useState<number | null>(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [addTypeError, setAddTypeError] = useState('')

  // Add-Unit / Add-GST-Rate modal
  const [addValue, setAddValue] = useState<{ kind: 'unit' | 'gst'; index: number } | null>(null)
  const [addValueInput, setAddValueInput] = useState('')
  const [addValueError, setAddValueError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldScrollToNew = useRef(false)

  useEffect(() => {
    if (shouldScrollToNew.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      shouldScrollToNew.current = false
    }
  }, [products.length])

  const validateProduct = (p: ProductFormData): string[] => {
    const errs: string[] = []
    if (!p.name.trim()) errs.push('Product Name is required')
    if (!p.hsn_code.trim()) errs.push('HSN Code is required')
    if (!p.product_type.trim()) errs.push('Product Type is required')
    if (!p.unit.trim()) errs.push('Unit is required')
    if (p.gst_rate === '') errs.push('GST Rate is required')
    if (!isExempted(p.gst_rate) && !p.gst_supply_type.trim()) {
      errs.push('GST Supply Type is required')
    }
    const sp = Number(p.selling_price)
    if (p.selling_price.trim() === '' || !Number.isFinite(sp) || sp < 0) {
      errs.push('Selling Price is required and must be 0 or more')
    }
    const tp = Number(p.tally_price)
    if (p.tally_price.trim() === '' || !Number.isFinite(tp) || tp < 0) {
      errs.push('Tally Price is required and must be 0 or more')
    }
    if (p.is_seed && !p.expiry_date.trim()) {
      errs.push('Expiry Date is required for seed products')
    }
    return errs
  }

  const validateAll = (): boolean => {
    const newErrors: Record<string, string[]> = {}
    let hasErrors = false
    products.forEach((product, idx) => {
      const errs = validateProduct(product)
      if (errs.length > 0) {
        newErrors[idx.toString()] = errs
        hasErrors = true
      }
    })
    setErrors(newErrors)
    return !hasErrors
  }

  const handleProductChange = (
    index: number,
    field: keyof ProductFormData,
    value: string | boolean,
  ) => {
    const updated = [...products]
    updated[index] = { ...updated[index], [field]: value }
    setProducts(updated)
  }

  const handleNameBlur = (index: number) => {
    const formatted = toTitleCase(products[index].name.trim())
    if (formatted !== products[index].name) handleProductChange(index, 'name', formatted)
  }

  const handleAddRow = () => {
    shouldScrollToNew.current = true
    setProducts([...products, { ...emptyProduct }])
  }

  const handleRemoveRow = (index: number) => {
    if (products.length > 1) {
      setProducts(products.filter((_, i) => i !== index))
      const newErrors = { ...errors }
      delete newErrors[index.toString()]
      setErrors(newErrors)
    }
  }

  const handleTypeSelect = (index: number, value: string) => {
    if (value === '__add_new__') {
      setAddTypeIndex(index)
      setNewTypeName('')
      setAddTypeError('')
      setShowAddTypeModal(true)
      return
    }
    handleProductChange(index, 'product_type', value)
  }

  const closeAddTypeModal = () => {
    setShowAddTypeModal(false)
    setAddTypeIndex(null)
    setNewTypeName('')
    setAddTypeError('')
  }

  const handleSaveNewType = async () => {
    const name = newTypeName.trim()
    if (!name) {
      setAddTypeError('Type name is required')
      return
    }
    try {
      setAddTypeError('')
      const created = await createProductType({
        name,
        description: 'Added from Product page',
        tax: 0,
      })
      if (addTypeIndex !== null) {
        handleProductChange(addTypeIndex, 'product_type', created?.name ?? name)
      }
      closeAddTypeModal()
    } catch (err) {
      setAddTypeError((err as Error).message)
    }
  }

  // --- Add Unit / Add GST Rate ---
  const openAddValue = (kind: 'unit' | 'gst', index: number) => {
    setAddValue({ kind, index })
    setAddValueInput('')
    setAddValueError('')
  }

  const closeAddValue = () => {
    setAddValue(null)
    setAddValueInput('')
    setAddValueError('')
  }

  const handleSaveAddValue = () => {
    if (!addValue) return
    const raw = addValueInput.trim()
    if (!raw) {
      setAddValueError(addValue.kind === 'unit' ? 'Unit name is required' : 'GST rate is required')
      return
    }
    if (addValue.kind === 'unit') {
      if (!unitOptions.includes(raw)) setUnitOptions([...unitOptions, raw])
      handleProductChange(addValue.index, 'unit', raw)
    } else {
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0) {
        setAddValueError('Enter a valid GST rate number, e.g. 12')
        return
      }
      const value = String(num)
      if (!gstRateOptions.some((o) => o.value === value)) {
        setGstRateOptions([...gstRateOptions, { value, label: `${num}%` }])
      }
      handleProductChange(addValue.index, 'gst_rate', value)
    }
    closeAddValue()
  }

  const handleSave = async () => {
    if (!validateAll()) {
      toast.error('Please fix all errors before saving')
      return
    }
    try {
      setLoading(true)
      const payloadFor = (p: ProductFormData) => {
        const name = toTitleCase(p.name.trim())
        return {
          name,
          hsn_code: p.hsn_code.trim(),
          product_type: p.product_type.trim(),
          unit: p.unit,
          gst_rate: Number(p.gst_rate || 0),
          gst_supply_type: isExempted(p.gst_rate) ? '' : p.gst_supply_type,
          selling_price: Number(p.selling_price || 0),
          tally_price: Number(p.tally_price || 0),
          expiry_date: p.expiry_date,
          is_seed: p.is_seed,
          tally_stock_item_name: name,
        }
      }
      if (editingProduct) {
        await productApi.update(editingProduct.id, payloadFor(products[0]))
        toast.success('Product updated successfully')
      } else {
        for (const product of products) {
          await productApi.create(payloadFor(product))
        }
        toast.success(`${products.length} product(s) added successfully`)
      }
      onSuccess()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
  const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

  return (
    <div data-kbd-scope className="flex h-[calc(100vh-8.5rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Sticky header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <button
          onClick={onBack}
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-900"
        >
          ← Back to List
        </button>
        {!editingProduct && (
          <Button
            onClick={handleAddRow}
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center justify-center border-black text-black hover:bg-black hover:text-white"
          >
            <Plus size={16} />
            Add Another Product
          </Button>
        )}
      </div>

      {/* Scrollable form body */}
      <div ref={scrollRef} className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {products.map((product, index) => (
          <div key={index} className="px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-black">
                {editingProduct ? 'Product Details' : `Product ${index + 1}`}
              </h3>
              {!editingProduct && products.length > 1 && (
                <button
                  onClick={() => handleRemoveRow(index)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>

            {errors[index.toString()]?.length > 0 && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="mb-1 text-sm font-medium text-red-800">Please fix:</p>
                <ul className="space-y-1 text-sm text-red-700">
                  {errors[index.toString()].map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Product Name */}
              <div>
                <label className={labelClass}>
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                  onBlur={() => !editingProduct && handleNameBlur(index)}
                  disabled={editingProduct != null}
                  placeholder="e.g. Urea Fertilizer"
                  className={`${fieldClass} disabled:bg-gray-100`}
                />
              </div>

              {/* HSN Code */}
              <div>
                <label className={labelClass}>
                  HSN Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={product.hsn_code}
                  onChange={(e) => handleProductChange(index, 'hsn_code', e.target.value)}
                  placeholder="Enter HSN code"
                  className={fieldClass}
                />
              </div>

              {/* Product Type */}
              <div>
                <label className={labelClass}>
                  Product Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={product.product_type}
                  onChange={(e) => handleTypeSelect(index, e.target.value)}
                  className={`${fieldClass} bg-white`}
                >
                  <option value="">Select a type</option>
                  {product.product_type &&
                    !productTypes.some((pt) => pt.name === product.product_type) && (
                      <option value={product.product_type}>{product.product_type}</option>
                    )}
                  {productTypes.map((pt) => (
                    <option key={pt.id} value={pt.name}>
                      {pt.name}
                    </option>
                  ))}
                  <option value="__add_new__">+ Add Product Type</option>
                </select>
              </div>

              {/* Unit */}
              <div>
                <label className={labelClass}>
                  Unit <span className="text-red-500">*</span>
                </label>
                <select
                  value={product.unit}
                  onChange={(e) =>
                    e.target.value === '__add_unit__'
                      ? openAddValue('unit', index)
                      : handleProductChange(index, 'unit', e.target.value)
                  }
                  className={`${fieldClass} bg-white`}
                >
                  <option value="">Select a unit</option>
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__add_unit__">+ Add Unit</option>
                </select>
              </div>

              {/* GST Rate */}
              <div>
                <label className={labelClass}>
                  GST Rate <span className="text-red-500">*</span>
                </label>
                <select
                  value={product.gst_rate}
                  onChange={(e) =>
                    e.target.value === '__add_gst__'
                      ? openAddValue('gst', index)
                      : handleProductChange(index, 'gst_rate', e.target.value)
                  }
                  className={`${fieldClass} bg-white`}
                >
                  <option value="">Select GST rate</option>
                  {gstRateOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value="__add_gst__">+ Add GST Rate</option>
                </select>
              </div>

              {/* GST Supply Type — not applicable for Exempted products */}
              <div>
                <label className={labelClass}>
                  GST Supply Type{' '}
                  {!isExempted(product.gst_rate) && <span className="text-red-500">*</span>}
                </label>
                {isExempted(product.gst_rate) ? (
                  <input
                    type="text"
                    value="Not Applicable (Exempted)"
                    disabled
                    className={`${fieldClass} bg-gray-100 text-gray-500`}
                  />
                ) : (
                  <select
                    value={product.gst_supply_type}
                    onChange={(e) => handleProductChange(index, 'gst_supply_type', e.target.value)}
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

              {/* Selling Price */}
              <div>
                <label className={labelClass}>
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={product.selling_price}
                  onChange={(e) => handleProductChange(index, 'selling_price', e.target.value)}
                  placeholder="0"
                  min="0"
                  className={fieldClass}
                />
              </div>

              {/* Tally Price */}
              <div>
                <label className={labelClass}>
                  Tally Price <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={product.tally_price}
                  onChange={(e) => handleProductChange(index, 'tally_price', e.target.value)}
                  placeholder="0"
                  min="0"
                  className={fieldClass}
                />
              </div>

              {/* Expiry Date */}
              <div>
                <label className={labelClass}>
                  Expiry Date
                  {product.is_seed && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type="date"
                  value={product.expiry_date}
                  onChange={(e) => handleProductChange(index, 'expiry_date', e.target.value)}
                  className={fieldClass}
                />
              </div>

              {/* Seed */}
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={product.is_seed}
                    onChange={(e) => handleProductChange(index, 'is_seed', e.target.checked)}
                    className="h-4 w-4 accent-black"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    This is a Seed 
                  </span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky footer */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <Button
          onClick={onBack}
          variant="ghost"
          className="text-gray-600 hover:bg-gray-100 hover:text-black"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading}
          data-kbd-submit
          className="bg-black text-white hover:bg-gray-900 disabled:opacity-50"
        >
          {loading ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
        </Button>
      </div>

      {/* Add Product Type modal */}
      {showAddTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div data-kbd-scope className="w-full max-w-md rounded-lg bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-bold text-black">Add Product Type</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className={labelClass}>Type Name</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g., Fertilizer"
                  autoFocus
                  className={fieldClass}
                />
              </div>
              {addTypeError && <p className="text-sm text-red-600">{addTypeError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                onClick={closeAddTypeModal}
                variant="ghost"
                className="text-gray-600 hover:bg-gray-100 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveNewType}
                data-kbd-submit
                className="bg-black text-white hover:bg-gray-900"
              >
                Add Type
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Unit / Add GST Rate modal */}
      {addValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div data-kbd-scope className="w-full max-w-sm rounded-lg bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-bold text-black">
                {addValue.kind === 'unit' ? 'Add Unit' : 'Add GST Rate'}
              </h2>
            </div>
            <div className="space-y-3 px-6 py-5">
              <div>
                <label className={labelClass}>
                  {addValue.kind === 'unit' ? 'Unit name' : 'GST rate (%)'}
                </label>
                <input
                  type={addValue.kind === 'unit' ? 'text' : 'number'}
                  value={addValueInput}
                  onChange={(e) => setAddValueInput(e.target.value)}
                  placeholder={addValue.kind === 'unit' ? 'e.g. Tonne' : 'e.g. 12'}
                  autoFocus
                  className={fieldClass}
                />
              </div>
              {addValueError && <p className="text-sm text-red-600">{addValueError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                onClick={closeAddValue}
                variant="ghost"
                className="text-gray-600 hover:bg-gray-100 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAddValue}
                data-kbd-submit
                className="bg-black text-white hover:bg-gray-900"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
