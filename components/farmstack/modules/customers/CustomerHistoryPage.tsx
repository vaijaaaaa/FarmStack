'use client'

import { useEffect, useState } from 'react'
import { Language, Customer } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { customerApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import DataTable from '../../components/DataTable'
import { ChevronLeft, ChevronRight, Edit2 } from 'lucide-react'
import { toast } from 'sonner'

interface CustomerHistoryPageProps {
  language: Language
  onAddCustomer: () => void
  onEditCustomer: (customer: Customer) => void
  onBulkUpload: () => void
}

export default function CustomerHistoryPage({
  language,
  onAddCustomer,
  onEditCustomer,
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
    fetchCustomers(1, '', 'name')
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(1, search, searchBy)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchBy])

  const columns = [
    { key: 'name', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'display_number', label: 'Display Number' },
    { key: 'actions', label: 'Actions' },
  ]

  const tableData = customers.map((customer) => ({
    name: customer.name,
    phone: customer.phone || 'N/A',
    gstin: customer.gstin || 'N/A',
    state: customer.state || 'N/A',
    country: customer.country || 'N/A',
    display_number: customer.display_number || 'N/A',
    actions: (
      <div className="flex gap-2">
        <button
          onClick={() => onEditCustomer(customer)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-100"
        >
          <Edit2 size={14} />
          Edit
        </button>
      </div>
    ),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">Customers</h2>
        <div className="flex gap-3">
          <Button onClick={onBulkUpload} className="bg-green-600 text-white hover:bg-green-700">
            Bulk Upload
          </Button>
          <Button onClick={onAddCustomer} className="bg-black text-white hover:bg-gray-900">
            Add Customer
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Search By</label>
            <select
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
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
              placeholder="Type to search..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
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
            <DataTable columns={columns} data={tableData} />
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600">
                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span> ({total} total customers)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchCustomers(currentPage - 1, search, searchBy)}
                  disabled={currentPage === 1 || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <button
                  onClick={() => fetchCustomers(currentPage + 1, search, searchBy)}
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
