'use client'

import { useEffect, useRef, useState } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

interface SupplierFormData {
  name: string
  phone: string
  address: string
  state: string
  country: string
  gstin: string
  place_of_supply: string
}

const emptySupplier: SupplierFormData = {
  name: '',
  phone: '',
  address: '',
  state: '',
  country: '',
  gstin: '',
  place_of_supply: '',
}

interface AddSupplierPageProps {
  language: Language
  editingSupplier?: Supplier | null
  onBack: () => void
  onSuccess: () => void
}

export default function AddSupplierPage({
  language,
  editingSupplier,
  onBack,
  onSuccess,
}: AddSupplierPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [suppliers, setSuppliers] = useState<SupplierFormData[]>(
    editingSupplier
      ? [
          {
            name: editingSupplier.name,
            phone: editingSupplier.phone || '',
            address: editingSupplier.address || '',
            state: editingSupplier.state || '',
            country: editingSupplier.country || '',
            gstin: editingSupplier.gstin || '',
            place_of_supply: editingSupplier.place_of_supply || '',
          },
        ]
      : [emptySupplier],
  )
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldScrollToNew = useRef(false)

  useEffect(() => {
    if (shouldScrollToNew.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      shouldScrollToNew.current = false
    }
  }, [suppliers.length])

  const validateSupplier = (supplier: SupplierFormData, index: number): string[] => {
    const errs: string[] = []
    if (!supplier.name.trim()) {
      errs.push('Supplier name is required')
    }
    if (!supplier.phone.trim()) {
      errs.push('Phone number is required')
    }
    if (supplier.phone && !/^[0-9]{10}$/.test(supplier.phone)) {
      errs.push('Phone number must be 10 digits')
    }
    if (!supplier.state.trim()) {
      errs.push('State is required')
    }
    if (!supplier.country.trim()) {
      errs.push('Country is required')
    }
    if (!supplier.place_of_supply.trim()) {
      errs.push('Place of supply is required')
    }
    if (supplier.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(supplier.gstin)) {
      errs.push('Invalid GSTIN format (should be like 27AABCT1234H1Z0)')
    }
    return errs
  }

  const validateAll = (): boolean => {
    const newErrors: Record<string, string[]> = {}
    let hasErrors = false

    suppliers.forEach((sup, idx) => {
      const errs = validateSupplier(sup, idx)
      if (errs.length > 0) {
        newErrors[idx.toString()] = errs
        hasErrors = true
      }
    })

    setErrors(newErrors)
    return !hasErrors
  }

  const handleSupplierChange = (index: number, field: keyof SupplierFormData, value: string) => {
    const updated = [...suppliers]
    updated[index] = { ...updated[index], [field]: value }
    setSuppliers(updated)
    
    // Clear errors for this field when user starts typing
    const fieldErrors = errors[index.toString()]?.filter(e => !e.toLowerCase().includes(field.toLowerCase())) || []
    setErrors({ ...errors, [index.toString()]: fieldErrors })
  }

  const handleAddRow = () => {
    shouldScrollToNew.current = true
    setSuppliers([...suppliers, { ...emptySupplier }])
  }

  const handleRemoveRow = (index: number) => {
    if (suppliers.length > 1) {
      const updated = suppliers.filter((_, i) => i !== index)
      setSuppliers(updated)
      
      const newErrors = { ...errors }
      delete newErrors[index.toString()]
      setErrors(newErrors)
    }
  }

  const handleSave = async () => {
    if (!validateAll()) {
      toast.error('Please fix all errors before saving')
      return
    }

    if (!editingSupplier) {
      // Catch duplicate names within this form; duplicates already in the
      // database are caught by the unique constraint (no extra fetch needed).
      const dupErrors: Record<string, string[]> = {}
      const seen = new Set<string>()
      suppliers.forEach((supplier, index) => {
        const key = supplier.name.trim().toLowerCase()
        if (seen.has(key)) {
          dupErrors[index.toString()] = ['Duplicate supplier name in this form']
        } else {
          seen.add(key)
        }
      })
      if (Object.keys(dupErrors).length > 0) {
        setErrors(dupErrors)
        toast.error('Duplicate supplier name(s) found')
        return
      }
    }

    const action: Promise<unknown> = editingSupplier
      ? supplierApi.update(editingSupplier.id, {
          ...suppliers[0],
          tally_ledger_name: suppliers[0].name,
        })
      : Promise.all(
          suppliers.map((supplier) =>
            supplierApi.create({ ...supplier, tally_ledger_name: supplier.name }),
          ),
        )

    setLoading(true)
    toast.promise(action, {
      loading: editingSupplier ? 'Updating supplier…' : 'Saving…',
      success: editingSupplier
        ? 'Supplier updated successfully'
        : `${suppliers.length} supplier(s) added successfully`,
      error: (err) => (err as Error).message,
    })
    try {
      await action
      onSuccess()
    } catch {
      // error toast already shown by toast.promise
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
        {!editingSupplier && (
          <Button
            onClick={handleAddRow}
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center justify-center border-black text-black hover:bg-black hover:text-white"
          >
            <Plus size={16} />
            Add Another Supplier
          </Button>
        )}
      </div>

      {/* Scrollable form body */}
      <div ref={scrollRef} className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {suppliers.map((supplier, index) => (
          <div key={index} className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-black">
                {editingSupplier ? 'Supplier Details' : `Supplier ${index + 1}`}
              </h3>
              {!editingSupplier && suppliers.length > 1 && (
                <button
                  onClick={() => handleRemoveRow(index)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>

            {/* Error Messages */}
            {errors[index.toString()]?.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                <ul className="text-sm text-red-700 space-y-1">
                  {errors[index.toString()].map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={supplier.name}
                  onChange={(e) => handleSupplierChange(index, 'name', e.target.value)}
                  disabled={editingSupplier !== null}
                  placeholder="Enter supplier name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={supplier.phone}
                  onChange={(e) => handleSupplierChange(index, 'phone', e.target.value)}
                  placeholder="1234567890"
                  maxLength={10}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={supplier.address}
                  onChange={(e) => handleSupplierChange(index, 'address', e.target.value)}
                  placeholder="Enter address"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State
                </label>
                <input
                  type="text"
                  value={supplier.state}
                  onChange={(e) => handleSupplierChange(index, 'state', e.target.value)}
                  placeholder="Enter state"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country
                </label>
                <input
                  type="text"
                  value={supplier.country}
                  onChange={(e) => handleSupplierChange(index, 'country', e.target.value)}
                  placeholder="Enter country"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GSTIN
                </label>
                <input
                  type="text"
                  value={supplier.gstin}
                  onChange={(e) => handleSupplierChange(index, 'gstin', e.target.value)}
                  placeholder="27AABCT1234H1Z0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Place of Supply
                </label>
                <input
                  type="text"
                  value={supplier.place_of_supply}
                  onChange={(e) => handleSupplierChange(index, 'place_of_supply', e.target.value)}
                  placeholder="Enter place of supply"
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
          {loading ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Add Supplier'}
        </Button>
      </div>
    </div>
  )
}
