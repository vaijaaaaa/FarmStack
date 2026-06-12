'use client'

import { Fragment, useEffect, useState } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Save, X } from 'lucide-react'
import { toast } from 'sonner'

interface SupplierHistoryPageProps {
  language: Language
  onAddSupplier: () => void
  onEditSupplier: (supplier: Supplier) => void
  onBulkUpload: () => void
}

interface EditRow {
  name: string
  phone: string
  address: string
  state: string
  country: string
  gstin: string
  place_of_supply: string
}

const toEditRow = (supplier: Supplier): EditRow => ({
  name: supplier.name ?? '',
  phone: supplier.phone ?? '',
  address: supplier.address ?? '',
  state: supplier.state ?? '',
  country: supplier.country ?? '',
  gstin: supplier.gstin ?? '',
  place_of_supply: supplier.place_of_supply ?? '',
})

export default function SupplierHistoryPage({
  language,
  onAddSupplier,
  onBulkUpload,
}: SupplierHistoryPageProps) {
  const t = (key: string) => getTranslation(language, key)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchBy, setSearchBy] = useState('name')
  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [savingAll, setSavingAll] = useState(false)

  const limit = 10

  const fetchSuppliers = async (page: number, query: string = '', field: string = 'name') => {
    try {
      setLoading(true)
      const result = await supplierApi.listPaginated(page, limit, query, field)
      setSuppliers(result.data)
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
    fetchSuppliers(1, search, searchBy)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuppliers(1, search, searchBy)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchBy])

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      fetchSuppliers(currentPage + 1, search, searchBy)
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      fetchSuppliers(currentPage - 1, search, searchBy)
    }
  }

  const isEditing = (id: string) => id in edits

  const isDirty = (supplier: Supplier) => {
    const edit = edits[supplier.id]
    if (!edit) return false
    const original = toEditRow(supplier)
    return (Object.keys(edit) as (keyof EditRow)[]).some((key) => edit[key] !== original[key])
  }

  const startEdit = (supplier: Supplier) => {
    setEdits((prev) => ({ ...prev, [supplier.id]: toEditRow(supplier) }))
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
    if (!edit.name.trim()) return 'Supplier name is required'
    if (!edit.phone.trim()) return 'Phone number is required'
    if (edit.phone && !/^[0-9]{10}$/.test(edit.phone)) return 'Phone number must be 10 digits'
    if (!edit.state.trim()) return 'State is required'
    if (!edit.country.trim()) return 'Country is required'
    if (!edit.place_of_supply.trim()) return 'Place of supply is required'
    if (
      edit.gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(edit.gstin)
    ) {
      return 'Invalid GSTIN format (should be like 27AABCT1234H1Z0)'
    }
    return ''
  }

  const buildPayload = (supplier: Supplier, edit: EditRow): Partial<Supplier> => ({
    ...supplier,
    name: edit.name.trim(),
    phone: edit.phone.trim(),
    address: edit.address.trim(),
    state: edit.state.trim(),
    country: edit.country.trim(),
    gstin: edit.gstin.trim(),
    place_of_supply: edit.place_of_supply.trim(),
    tally_ledger_name: edit.name.trim(),
  })

  const saveRow = async (supplier: Supplier) => {
    const edit = edits[supplier.id]
    if (!edit) return
    const error = validateRow(edit)
    if (error) {
      toast.error(error)
      return
    }
    try {
      await supplierApi.update(supplier.id, buildPayload(supplier, edit))
      cancelEdit(supplier.id)
      toast.success('Supplier updated')
      fetchSuppliers(currentPage, search, searchBy)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const dirtySuppliers = suppliers.filter((supplier) => isDirty(supplier))

  const saveAll = async () => {
    if (dirtySuppliers.length === 0) return
    for (const supplier of dirtySuppliers) {
      const error = validateRow(edits[supplier.id])
      if (error) {
        toast.error(`${supplier.name}: ${error}`)
        return
      }
    }
    try {
      setSavingAll(true)
      for (const supplier of dirtySuppliers) {
        await supplierApi.update(supplier.id, buildPayload(supplier, edits[supplier.id]))
      }
      setEdits({})
      toast.success(`${dirtySuppliers.length} supplier(s) updated`)
      fetchSuppliers(currentPage, search, searchBy)
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

  const renderEditForm = (supplier: Supplier) => {
    const edit = edits[supplier.id]
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelClass}>Supplier Name</label>
          <input type="text" value={edit.name} disabled className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Phone Number</label>
          <input
            type="tel"
            value={edit.phone}
            maxLength={10}
            onChange={(e) => changeField(supplier.id, 'phone', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input
            type="text"
            value={edit.address}
            onChange={(e) => changeField(supplier.id, 'address', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input
            type="text"
            value={edit.state}
            onChange={(e) => changeField(supplier.id, 'state', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Country</label>
          <input
            type="text"
            value={edit.country}
            onChange={(e) => changeField(supplier.id, 'country', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>GSTIN</label>
          <input
            type="text"
            value={edit.gstin}
            onChange={(e) => changeField(supplier.id, 'gstin', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Place of Supply</label>
          <input
            type="text"
            value={edit.place_of_supply}
            onChange={(e) => changeField(supplier.id, 'place_of_supply', e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">Supplier History</h2>
        <div className="flex gap-3">
          {dirtySuppliers.length > 0 && (
            <Button
              onClick={saveAll}
              disabled={savingAll}
              className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {savingAll ? 'Saving...' : `Save All Changes (${dirtySuppliers.length})`}
            </Button>
          )}
          <Button onClick={onBulkUpload} className="bg-green-600 text-white hover:bg-green-700">
            Bulk Upload
          </Button>
          <Button onClick={onAddSupplier} className="bg-black text-white hover:bg-gray-900">
            Add Supplier
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Search By</label>
              <select
                value={searchBy}
                onChange={(e) => setSearchBy(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="name">Supplier Name</option>
                <option value="phone">Phone Number</option>
                <option value="gstin">GSTIN</option>
                <option value="place_of_supply">Place of Supply</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Search Value</label>
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
              Showing results for: <span className="font-medium">{search}</span> in{' '}
              <span className="font-medium">{searchBy}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading suppliers...</div>
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">
              {search ? 'No suppliers found matching your search.' : 'No suppliers available.'}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className={thClass}>Supplier Name</th>
                    <th className={thClass}>Phone</th>
                    <th className={thClass}>GSTIN</th>
                    <th className={thClass}>State</th>
                    <th className={thClass}>Country</th>
                    <th className={thClass}>Place of Supply</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => {
                    const editing = isEditing(supplier.id)
                    const dirty = isDirty(supplier)
                    return (
                      <Fragment key={supplier.id}>
                        <tr
                          className={`border-b border-gray-100 ${
                            dirty ? 'bg-amber-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className={tdClass}>{supplier.name}</td>
                          <td className={tdClass}>{supplier.phone || 'N/A'}</td>
                          <td className={tdClass}>{supplier.gstin || 'N/A'}</td>
                          <td className={tdClass}>{supplier.state || 'N/A'}</td>
                          <td className={tdClass}>{supplier.country || 'N/A'}</td>
                          <td className={tdClass}>{supplier.place_of_supply || 'N/A'}</td>
                          <td className={tdClass}>
                            <button
                              onClick={() =>
                                editing ? cancelEdit(supplier.id) : startEdit(supplier)
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
                            <td colSpan={7} className="px-4 py-4">
                              {renderEditForm(supplier)}
                              <div className="mt-4 flex justify-end gap-2">
                                <button
                                  onClick={() => cancelEdit(supplier.id)}
                                  className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
                                >
                                  <X size={14} />
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveRow(supplier)}
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
                <span className="font-medium">{totalPages}</span> ({total} total suppliers)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1 || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  onClick={handleNextPage}
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
