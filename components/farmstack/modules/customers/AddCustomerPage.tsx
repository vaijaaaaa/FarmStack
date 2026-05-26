'use client'

import { useEffect, useRef, useState } from 'react'
import { Language, Customer } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { customerApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface CustomerFormData {
  name: string
  address: string
  phone: string
  state: string
  country: string
  gstin: string
  acres: string
  loyalty: string
  referral: string
  display_number: string
  aadhar_card: string
}

const emptyCustomer: CustomerFormData = {
  name: '',
  address: '',
  phone: '',
  state: '',
  country: '',
  gstin: '',
  acres: '',
  loyalty: '',
  referral: '',
  display_number: '',
  aadhar_card: '',
}

interface AddCustomerPageProps {
  language: Language
  editingCustomer?: Customer | null
  onBack: () => void
  onSuccess: () => void
}

export default function AddCustomerPage({
  language,
  editingCustomer,
  onBack,
  onSuccess,
}: AddCustomerPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [customers, setCustomers] = useState<CustomerFormData[]>(
    editingCustomer
      ? [
          {
            name: editingCustomer.name,
            address: editingCustomer.address || '',
            phone: editingCustomer.phone || '',
            state: editingCustomer.state || '',
            country: editingCustomer.country || '',
            gstin: editingCustomer.gstin || '',
            acres: editingCustomer.acres || '',
            loyalty: editingCustomer.loyalty || '',
            referral: editingCustomer.referral || '',
            display_number: editingCustomer.display_number || '',
            aadhar_card: editingCustomer.aadhar_card || '',
          },
        ]
      : [emptyCustomer],
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
  }, [customers.length])

  const validateCustomer = (customer: CustomerFormData) => {
    const errs: string[] = []
    if (!customer.name.trim()) errs.push('Customer name is required')
    if (!customer.address.trim()) errs.push('Address is required')
    if (!customer.phone.trim()) errs.push('Phone number is required')
    if (customer.phone && !/^[0-9]{10}$/.test(customer.phone)) errs.push('Phone number must be 10 digits')
    if (!customer.state.trim()) errs.push('State is required')
    if (!customer.country.trim()) errs.push('Country is required')
    if (customer.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(customer.gstin)) {
      errs.push('Invalid GSTIN format')
    }
    if (customer.aadhar_card && !/^[0-9]{12}$/.test(customer.aadhar_card)) {
      errs.push('Aadhar card must be 12 digits')
    }
    return errs
  }

  const validateAll = () => {
    const nextErrors: Record<string, string[]> = {}
    let hasErrors = false

    customers.forEach((customer, index) => {
      const errs = validateCustomer(customer)
      if (errs.length > 0) {
        nextErrors[index.toString()] = errs
        hasErrors = true
      }
    })

    setErrors(nextErrors)
    return !hasErrors
  }

  const handleChange = (index: number, field: keyof CustomerFormData, value: string) => {
    const updated = [...customers]
    updated[index] = { ...updated[index], [field]: value }
    setCustomers(updated)

    const fieldErrors = errors[index.toString()]?.filter((err) => !err.toLowerCase().includes(field.toLowerCase())) || []
    setErrors({ ...errors, [index.toString()]: fieldErrors })
  }

  const handleAddRow = () => {
    shouldScrollToNew.current = true
    setCustomers([...customers, { ...emptyCustomer }])
  }

  const handleRemoveRow = (index: number) => {
    if (customers.length > 1) {
      const updated = customers.filter((_, i) => i !== index)
      setCustomers(updated)
      const nextErrors = { ...errors }
      delete nextErrors[index.toString()]
      setErrors(nextErrors)
    }
  }

  const handleSave = async () => {
    if (!validateAll()) {
      toast.error('Please fix the errors before saving')
      return
    }

    try {
      setLoading(true)
      if (editingCustomer) {
        await customerApi.update(editingCustomer.id, {
          ...customers[0],
          tally_ledger_name: customers[0].name,
        })
        toast.success('Customer updated successfully')
      } else {
        for (const customer of customers) {
          await customerApi.create({
            ...customer,
            tally_ledger_name: customer.name,
          })
        }
        toast.success(`${customers.length} customer(s) added successfully`)
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
        {!editingCustomer && (
          <Button
            onClick={handleAddRow}
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center justify-center border-black text-black hover:bg-black hover:text-white"
          >
            <Plus size={16} />
            Add Another Customer
          </Button>
        )}
      </div>

      {/* Scrollable form body */}
      <div ref={scrollRef} className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {customers.map((customer, index) => (
          <div key={index} className="px-6 py-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-black">
                {editingCustomer ? 'Customer Details' : `Customer ${index + 1}`}
              </h3>
              {!editingCustomer && customers.length > 1 && (
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Customer Name</label>
                <input
                  type="text"
                  value={customer.name}
                  onChange={(e) => handleChange(index, 'name', e.target.value)}
                  disabled={editingCustomer != null}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={customer.phone}
                  onChange={(e) => handleChange(index, 'phone', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter phone number"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Aadhar Card</label>
                <input
                  type="text"
                  value={customer.aadhar_card}
                  onChange={(e) => handleChange(index, 'aadhar_card', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter aadhar card number"
                  maxLength={12}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Address <span className="font-normal text-gray-500"></span>
                </label>
                <input
                  type="text"
                  value={customer.address}
                  onChange={(e) => handleChange(index, 'address', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter city name (e.g., Bangalore)"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">State</label>
                <input
                  type="text"
                  value={customer.state}
                  onChange={(e) => handleChange(index, 'state', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter state"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Country</label>
                <input
                  type="text"
                  value={customer.country}
                  onChange={(e) => handleChange(index, 'country', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter country"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">GSTIN</label>
                <input
                  type="text"
                  value={customer.gstin}
                  onChange={(e) => handleChange(index, 'gstin', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Acres</label>
                <input
                  type="text"
                  value={customer.acres}
                  onChange={(e) => handleChange(index, 'acres', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter acres"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Loyalty</label>
                <input
                  type="text"
                  value={customer.loyalty}
                  onChange={(e) => handleChange(index, 'loyalty', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter loyalty"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Referral</label>
                <input
                  type="text"
                  value={customer.referral}
                  onChange={(e) => handleChange(index, 'referral', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter referral"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Display Number</label>
                <input
                  type="text"
                  value={customer.display_number}
                  onChange={(e) => handleChange(index, 'display_number', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Enter display number"
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
          {loading ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Add Customer'}
        </Button>
      </div>
    </div>
  )
}
