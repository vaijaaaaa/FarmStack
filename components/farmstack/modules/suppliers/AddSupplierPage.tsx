'use client'

import { useState } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

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

  const validateSupplier = (supplier: SupplierFormData, index: number): string[] => {
    const errs: string[] = []
    if (!supplier.name.trim()) {
      errs.push('Supplier name is required')
    }
    if (supplier.phone && !/^[0-9]{10}$/.test(supplier.phone)) {
      errs.push('Phone number must be 10 digits')
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
    setSuppliers([...suppliers, emptySupplier])
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

    try {
      setLoading(true)

      if (editingSupplier) {
        // Update existing supplier
        await supplierApi.update(editingSupplier.id, {
          ...suppliers[0],
          tally_ledger_name: suppliers[0].name,
        })
        toast.success('Supplier updated successfully')
      } else {
        // Create multiple suppliers
        for (const supplier of suppliers) {
          await supplierApi.create({
            ...supplier,
            tally_ledger_name: supplier.name,
          })
        }
        toast.success(`${suppliers.length} supplier(s) added successfully`)
      }

      onSuccess()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">
          {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        </h2>
        <button
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to List
        </button>
      </div>

      {/* Supplier Forms */}
      <div className="space-y-6">
        {suppliers.map((supplier, index) => (
          <div
            key={index}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {editingSupplier ? 'Supplier Details' : `Supplier ${index + 1}`}
              </h3>
              {!editingSupplier && suppliers.length > 1 && (
                <button
                  onClick={() => handleRemoveRow(index)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded transition-colors"
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Supplier Name <span className="text-red-600">*</span>
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
                  Phone Number <span className="text-gray-400">(10 digits)</span>
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

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <textarea
                  value={supplier.address}
                  onChange={(e) => handleSupplierChange(index, 'address', e.target.value)}
                  placeholder="Enter supplier address"
                  rows={3}
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
                  GSTIN <span className="text-gray-400">(optional)</span>
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

      {/* Action Buttons */}
      <div className="space-y-3">
        {!editingSupplier && (
          <button
            onClick={handleAddRow}
            className="w-full border-2 border-dashed border-gray-300 px-4 py-3 text-center text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 rounded-md transition-colors"
          >
            + Add Another Supplier
          </button>
        )}

        <div className="flex gap-3 justify-end">
          <Button
            onClick={onBack}
            className="bg-gray-300 text-gray-800 hover:bg-gray-400"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-black text-white hover:bg-gray-900 disabled:opacity-50"
          >
            {loading ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Add Supplier(s)'}
          </Button>
        </div>
      </div>
    </div>
  )
}
