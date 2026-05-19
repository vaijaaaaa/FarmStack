'use client'

import { useState, useEffect } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import DataTable from '../../components/DataTable'
import { ChevronLeft, ChevronRight, Edit2 } from 'lucide-react'
import { toast } from 'sonner'

interface SupplierHistoryPageProps {
  language: Language
  onAddSupplier: () => void
  onEditSupplier: (supplier: Supplier) => void
  onBulkUpload: () => void
}

export default function SupplierHistoryPage({
  language,
  onAddSupplier,
  onEditSupplier,
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

  // Auto-search when search or searchBy changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuppliers(1, search, searchBy)
    }, 300) // Debounce for 300ms
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

  const columns = [
    { key: 'name', label: 'Supplier Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'place_of_supply', label: 'Place of Supply' },
    { key: 'actions', label: 'Actions' },
  ]

  const tableData = suppliers.map((supplier) => ({
    name: supplier.name,
    phone: supplier.phone || 'N/A',
    gstin: supplier.gstin || 'N/A',
    state: supplier.state || 'N/A',
    country: supplier.country || 'N/A',
    place_of_supply: supplier.place_of_supply || 'N/A',
    actions: (
      <div className="flex gap-2">
        <button
          onClick={() => onEditSupplier(supplier)}
          data-kbd-row-action
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors"
          title="Edit"
        >
          <Edit2 size={14} />
          Edit
        </button>
      </div>
    ),
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">Supplier History</h2>
        <div className="flex gap-3">
          <Button
            onClick={onBulkUpload}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Bulk Upload
          </Button>
          <Button
            onClick={onAddSupplier}
            className="bg-black text-white hover:bg-gray-900"
          >
            Add Supplier
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
                <option value="name">Supplier Name</option>
                <option value="phone">Phone Number</option>
                <option value="gstin">GSTIN</option>
                <option value="place_of_supply">Place of Supply</option>
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
            <DataTable columns={columns} data={tableData} />

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600">
                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span> ({total} total suppliers)
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
