'use client'

import { useEffect, useRef, useState } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { productApi } from '@/src/services/api'
import { useProductTypes } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

interface ProductFormData {
  name: string
  hsn_code: string
  unit: string
  product_type: string
  gst_rate: string
  selling_price: string
  tally_price: string
  expiry_date: string
}

const emptyProduct: ProductFormData = {
  name: '',
  hsn_code: '',
  unit: '',
  product_type: '',
  gst_rate: '',
  selling_price: '',
  tally_price: '',
  expiry_date: '',
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
            unit: editingProduct.unit || '',
            product_type: editingProduct.product_type || '',
            gst_rate: editingProduct.gst_rate != null ? String(editingProduct.gst_rate) : '',
            selling_price:
              editingProduct.selling_price != null ? String(editingProduct.selling_price) : '',
            tally_price:
              editingProduct.tally_price != null ? String(editingProduct.tally_price) : '',
            expiry_date: editingProduct.expiry_date || '',
          },
        ]
      : [{ ...emptyProduct }],
  )
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const { productTypes, createProductType } = useProductTypes()
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
  const [addTypeIndex, setAddTypeIndex] = useState<number | null>(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeTax, setNewTypeTax] = useState('')
  const [addTypeError, setAddTypeError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldScrollToNew = useRef(false)

  useEffect(() => {
    if (shouldScrollToNew.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      shouldScrollToNew.current = false
    }
  }, [products.length])

  const validateProduct = (product: ProductFormData): string[] => {
    const errs: string[] = []
    if (!product.name.trim()) {
      errs.push('Product name is required')
    }
    if (product.gst_rate && isNaN(Number(product.gst_rate))) {
      errs.push('GST rate must be a number')
    }
    if (product.selling_price && isNaN(Number(product.selling_price))) {
      errs.push('Selling price must be a number')
    }
    if (product.tally_price && isNaN(Number(product.tally_price))) {
      errs.push('Tally price must be a number')
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
    value: string,
  ) => {
    const updated = [...products]
    updated[index] = { ...updated[index], [field]: value }
    setProducts(updated)

    const fieldErrors =
      errors[index.toString()]?.filter((e) => !e.toLowerCase().includes(field.toLowerCase())) || []
    setErrors({ ...errors, [index.toString()]: fieldErrors })
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
      setNewTypeTax('')
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
    setNewTypeTax('')
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
        tax: Number(newTypeTax || 0),
      })
      if (addTypeIndex !== null) {
        handleProductChange(addTypeIndex, 'product_type', created?.name ?? name)
      }
      closeAddTypeModal()
    } catch (err) {
      setAddTypeError((err as Error).message)
    }
  }

  const handleSave = async () => {
    if (!validateAll()) {
      toast.error('Please fix all errors before saving')
      return
    }

    try {
      setLoading(true)

      if (editingProduct) {
        await productApi.update(editingProduct.id, {
          name: products[0].name,
          hsn_code: products[0].hsn_code,
          unit: products[0].unit,
          product_type: products[0].product_type,
          gst_rate: Number(products[0].gst_rate || 0),
          selling_price: Number(products[0].selling_price || 0),
          tally_price: Number(products[0].tally_price || 0),
          expiry_date: products[0].expiry_date,
          tally_stock_item_name: products[0].name,
        })
        toast.success('Product updated successfully')
      } else {
        for (const product of products) {
          await productApi.create({
            name: product.name,
            hsn_code: product.hsn_code,
            unit: product.unit,
            product_type: product.product_type,
            gst_rate: Number(product.gst_rate || 0),
            selling_price: Number(product.selling_price || 0),
            tally_price: Number(product.tally_price || 0),
            expiry_date: product.expiry_date,
            tally_stock_item_name: product.name,
          })
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
          <div key={index} className="px-6 py-6">
            <div className="mb-4 flex items-center justify-between">
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
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="mb-1 text-sm font-medium text-red-800">Errors:</p>
                <ul className="space-y-1 text-sm text-red-700">
                  {errors[index.toString()].map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Product Name</label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                  disabled={editingProduct != null}
                  placeholder="Enter product name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">HSN Code</label>
                <input
                  type="text"
                  value={product.hsn_code}
                  onChange={(e) => handleProductChange(index, 'hsn_code', e.target.value)}
                  placeholder="Enter HSN code"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Product Type</label>
                <select
                  value={product.product_type}
                  onChange={(e) => handleTypeSelect(index, e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
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
                  <option value="__add_new__">+ Add New Type</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Unit</label>
                <input
                  type="text"
                  value={product.unit}
                  onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                  placeholder="kg, liter, etc."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">GST Rate (%)</label>
                <input
                  type="number"
                  value={product.gst_rate}
                  onChange={(e) => handleProductChange(index, 'gst_rate', e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Selling Price</label>
                <input
                  type="number"
                  value={product.selling_price}
                  onChange={(e) => handleProductChange(index, 'selling_price', e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Tally Price</label>
                <input
                  type="number"
                  value={product.tally_price}
                  onChange={(e) => handleProductChange(index, 'tally_price', e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Expiry Date</label>
                <input
                  type="date"
                  value={product.expiry_date}
                  onChange={(e) => handleProductChange(index, 'expiry_date', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
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
                <label className="mb-2 block text-sm font-medium text-gray-700">Type Name</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g., Fertilizer"
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">GST %</label>
                <input
                  type="number"
                  value={newTypeTax}
                  onChange={(e) => setNewTypeTax(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
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
    </div>
  )
}
