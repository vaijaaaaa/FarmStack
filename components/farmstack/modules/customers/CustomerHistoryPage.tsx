'use client'

import { Fragment, useEffect, useState } from 'react'
import { Language, Customer } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { customerApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Save, X } from 'lucide-react'
import { toast } from 'sonner'

// The customer's `address` field stores just the city name, so the city is
// simply the trimmed address. Used for grouping/filtering customers by city.
const extractCity = (address?: string | null): string => (address ?? '').trim()

interface CustomerHistoryPageProps {
  language: Language
  onAddCustomer: () => void
  onEditCustomer: (customer: Customer) => void
  onBulkUpload: () => void
}

interface EditRow {
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

const toEditRow = (customer: Customer): EditRow => ({
  name: customer.name ?? '',
  address: customer.address ?? '',
  phone: customer.phone ?? '',
  state: customer.state ?? '',
  country: customer.country ?? '',
  gstin: customer.gstin ?? '',
  acres: customer.acres ?? '',
  loyalty: customer.loyalty ?? '',
  referral: customer.referral ?? '',
  display_number: customer.display_number ?? '',
  aadhar_card: customer.aadhar_card ?? '',
})

export default function CustomerHistoryPage({
  language,
  onAddCustomer,
  onBulkUpload,
}: CustomerHistoryPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchBy, setSearchBy] = useState('name')
  const [cityFilter, setCityFilter] = useState('')
  const [allCities, setAllCities] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [savingAll, setSavingAll] = useState(false)

  const limit = 10

  const fetchCustomers = async (page: number, query: string = '', field: string = 'name') => {
    try {
      setLoading(true)
      const result = await customerApi.listPaginated(page, limit, query, field)
      setCustomers(result.data)
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
    let cancelled = false
    customerApi
      .list()
      .then((rows) => {
        if (cancelled) return
        const seen = new Map<string, string>()
        for (const row of rows) {
          const city = extractCity(row.address)
          if (!city) continue
          const key = city.toLowerCase()
          if (!seen.has(key)) seen.set(key, city)
        }
        setAllCities([...seen.values()].sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => {
        /* non-fatal: city filter just stays empty */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (cityFilter) {
        fetchCustomers(1, cityFilter, 'city')
      } else {
        fetchCustomers(1, search, searchBy)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchBy, cityFilter])

  const goToPage = (page: number) => {
    if (cityFilter) fetchCustomers(page, cityFilter, 'city')
    else fetchCustomers(page, search, searchBy)
  }

  const refreshCurrentPage = () => {
    if (cityFilter) fetchCustomers(currentPage, cityFilter, 'city')
    else fetchCustomers(currentPage, search, searchBy)
  }

  const isEditing = (id: string) => id in edits

  const isDirty = (customer: Customer) => {
    const edit = edits[customer.id]
    if (!edit) return false
    const original = toEditRow(customer)
    return (Object.keys(edit) as (keyof EditRow)[]).some((key) => edit[key] !== original[key])
  }

  const startEdit = (customer: Customer) => {
    setEdits((prev) => ({ ...prev, [customer.id]: toEditRow(customer) }))
  }

  const cancelEdit = (id: string) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const changeField = (id: string, field: keyof EditRow, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const validateRow = (edit: EditRow): string => {
    if (!edit.name.trim()) return 'Customer name is required'
    if (!edit.address.trim()) return 'Address is required'
    if (!edit.phone.trim()) return 'Phone number is required'
    if (edit.phone && !/^[0-9]{10}$/.test(edit.phone)) return 'Phone number must be 10 digits'
    if (!edit.state.trim()) return 'State is required'
    if (!edit.country.trim()) return 'Country is required'
    if (
      edit.gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(edit.gstin)
    ) {
      return 'Invalid GSTIN format'
    }
    if (edit.aadhar_card && !/^[0-9]{12}$/.test(edit.aadhar_card)) {
      return 'Aadhar card must be 12 digits'
    }
    return ''
  }

  const buildPayload = (customer: Customer, edit: EditRow): Partial<Customer> => ({
    ...customer,
    name: edit.name.trim(),
    address: edit.address.trim(),
    phone: edit.phone.trim(),
    state: edit.state.trim(),
    country: edit.country.trim(),
    gstin: edit.gstin.trim(),
    acres: edit.acres.trim(),
    loyalty: edit.loyalty.trim(),
    referral: edit.referral.trim(),
    display_number: edit.display_number.trim(),
    aadhar_card: edit.aadhar_card.trim(),
    tally_ledger_name: edit.name.trim(),
  })

  const saveRow = async (customer: Customer) => {
    const edit = edits[customer.id]
    if (!edit) return
    const error = validateRow(edit)
    if (error) {
      toast.error(error)
      return
    }
    try {
      await customerApi.update(customer.id, buildPayload(customer, edit))
      cancelEdit(customer.id)
      toast.success('Customer updated')
      refreshCurrentPage()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const dirtyCustomers = customers.filter((customer) => isDirty(customer))

  const saveAll = async () => {
    if (dirtyCustomers.length === 0) return
    for (const customer of dirtyCustomers) {
      const error = validateRow(edits[customer.id])
      if (error) {
        toast.error(`${customer.name}: ${error}`)
        return
      }
    }
    try {
      setSavingAll(true)
      for (const customer of dirtyCustomers) {
        await customerApi.update(customer.id, buildPayload(customer, edits[customer.id]))
      }
      setEdits({})
      toast.success(`${dirtyCustomers.length} customer(s) updated`)
      refreshCurrentPage()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingAll(false)
    }
  }

  const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700'
  const tdClass = 'px-3 py-2 align-middle text-sm text-gray-900'
  const fieldClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100'
  const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

  const renderEditForm = (customer: Customer) => {
    const edit = edits[customer.id]
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelClass}>Customer Name</label>
          <input type="text" value={edit.name} disabled className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            value={edit.phone}
            maxLength={10}
            onChange={(e) => changeField(customer.id, 'phone', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Aadhar Card</label>
          <input
            type="text"
            value={edit.aadhar_card}
            maxLength={12}
            onChange={(e) => changeField(customer.id, 'aadhar_card', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input
            type="text"
            value={edit.address}
            onChange={(e) => changeField(customer.id, 'address', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input
            type="text"
            value={edit.state}
            onChange={(e) => changeField(customer.id, 'state', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Country</label>
          <input
            type="text"
            value={edit.country}
            onChange={(e) => changeField(customer.id, 'country', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>GSTIN</label>
          <input
            type="text"
            value={edit.gstin}
            onChange={(e) => changeField(customer.id, 'gstin', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Acres</label>
          <input
            type="text"
            value={edit.acres}
            onChange={(e) => changeField(customer.id, 'acres', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Loyalty</label>
          <input
            type="text"
            value={edit.loyalty}
            onChange={(e) => changeField(customer.id, 'loyalty', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Referral</label>
          <input
            type="text"
            value={edit.referral}
            onChange={(e) => changeField(customer.id, 'referral', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Display Number</label>
          <input
            type="text"
            value={edit.display_number}
            onChange={(e) => changeField(customer.id, 'display_number', e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">Customers</h2>
        <div className="flex gap-3">
          {dirtyCustomers.length > 0 && (
            <Button
              onClick={saveAll}
              disabled={savingAll}
              className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {savingAll ? 'Saving...' : `Save All Changes (${dirtyCustomers.length})`}
            </Button>
          )}
          <Button onClick={onBulkUpload} className="bg-green-600 text-white hover:bg-green-700">
            Bulk Upload
          </Button>
          <Button onClick={onAddCustomer} className="bg-black text-white hover:bg-gray-900">
            Add Customer
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">City</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">All Cities</option>
              {allCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Search By</label>
            <select
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value)}
              disabled={!!cityFilter}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="name">Customer Name</option>
              <option value="phone">Phone Number</option>
              <option value="gstin">GSTIN</option>
              <option value="display_number">Display Number</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Search Value</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!!cityFilter}
              placeholder={cityFilter ? `Filtering by city: ${cityFilter}` : 'Type to search...'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No customers found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className={thClass}>Customer Name</th>
                    <th className={thClass}>City</th>
                    <th className={thClass}>Phone</th>
                    <th className={thClass}>GSTIN</th>
                    <th className={thClass}>State</th>
                    <th className={thClass}>Country</th>
                    <th className={thClass}>Display Number</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const editing = isEditing(customer.id)
                    const dirty = isDirty(customer)
                    return (
                      <Fragment key={customer.id}>
                        <tr
                          className={`border-b border-gray-100 ${
                            dirty ? 'bg-amber-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className={tdClass}>{customer.name}</td>
                          <td className={tdClass}>{extractCity(customer.address) || '-'}</td>
                          <td className={tdClass}>{customer.phone || 'N/A'}</td>
                          <td className={tdClass}>{customer.gstin || 'N/A'}</td>
                          <td className={tdClass}>{customer.state || 'N/A'}</td>
                          <td className={tdClass}>{customer.country || 'N/A'}</td>
                          <td className={tdClass}>{customer.display_number || 'N/A'}</td>
                          <td className={tdClass}>
                            <button
                              onClick={() =>
                                editing ? cancelEdit(customer.id) : startEdit(customer)
                              }
                              data-kbd-row-action
                              className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
                              title={editing ? 'Collapse' : 'Edit'}
                            >
                              {editing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              Edit
                            </button>
                          </td>
                        </tr>
                        {editing && (
                          <tr className={dirty ? 'bg-amber-50' : 'bg-gray-50'}>
                            <td colSpan={8} className="px-4 py-4">
                              {renderEditForm(customer)}
                              <div className="mt-4 flex justify-end gap-2">
                                <button
                                  onClick={() => cancelEdit(customer.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
                                >
                                  <X size={14} />
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveRow(customer)}
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
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600">
                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span> ({total} total customers
                {cityFilter ? ` in ${cityFilter}` : ''})
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
