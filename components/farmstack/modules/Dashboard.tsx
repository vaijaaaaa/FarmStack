'use client'

import { useState } from 'react'
import { Language, UserRole } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import StatCard from '../components/StatCard'
import DataTable from '../components/DataTable'
import {
  useCustomers,
  useProducts,
  usePurchaseInvoices,
  useSalesInvoices,
  useSuppliers,
} from '@/hooks/useDatabase'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DashboardProps {
  language: Language
  role: UserRole
  onRoleChange: (role: UserRole) => void
}

export default function Dashboard({ language, role, onRoleChange }: DashboardProps) {
  const t = (key: string) => getTranslation(language, key)
  const [selectedView, setSelectedView] = useState<string>('sales')

  // Real inventory from purchases vs sales. Each purchase brings stock in;
  // each sale takes it out. Available = purchased - sold per product.
  const { customers } = useCustomers()
  const { suppliers } = useSuppliers()
  const { products } = useProducts()
  const { invoices: purchaseRows } = usePurchaseInvoices()
  const { invoices: salesInvoices } = useSalesInvoices()

  const purchasedByProduct = new Map<string, number>()
  for (const r of purchaseRows) {
    const id = String(r.product_id || '')
    if (!id) continue
    purchasedByProduct.set(id, (purchasedByProduct.get(id) || 0) + Number(r.quantity || 0))
  }
  const soldByProduct = new Map<string, number>()
  for (const inv of salesInvoices) {
    for (const it of inv.items || []) {
      const id = String(it.product_id || '')
      if (!id) continue
      soldByProduct.set(id, (soldByProduct.get(id) || 0) + Number(it.quantity || 0))
    }
  }

  const inventory = products
    .map((p) => {
      const purchased = purchasedByProduct.get(p.id) || 0
      const sold = soldByProduct.get(p.id) || 0
      return {
        id: p.id,
        name: p.name,
        unit: p.unit || '',
        purchased,
        sold,
        available: purchased - sold,
      }
    })
    .filter((r) => r.purchased > 0 || r.sold > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  const LOW_STOCK_THRESHOLD = 10
  const totalPurchasedQty = inventory.reduce((s, r) => s + r.purchased, 0)
  const totalSoldQty = inventory.reduce((s, r) => s + r.sold, 0)
  const totalAvailableQty = inventory.reduce((s, r) => s + Math.max(0, r.available), 0)
  const lowStockItems = inventory
    .filter((r) => r.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available)

  const stockStatus = (available: number) => {
    if (available <= 0)
      return { label: 'Out', className: 'bg-red-100 text-red-700' }
    if (available <= LOW_STOCK_THRESHOLD)
      return { label: 'Low', className: 'bg-yellow-100 text-yellow-700' }
    return { label: 'OK', className: 'bg-green-100 text-green-700' }
  }

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const totalSalesAmount = salesInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
  const totalPurchaseAmount = purchaseRows.reduce(
    (sum, row) => sum + Number(row.total_price || 0),
    0,
  )
  const pendingSyncCount =
    salesInvoices.filter((inv) => inv.tally_sync_status === 'pending').length +
    purchaseRows.filter((row) => row.tally_sync_status === 'pending').length

  const stats = [
    { label: t('total_sales'), value: formatCurrency(totalSalesAmount), trend: 'Total' },
    { label: t('total_purchases'), value: formatCurrency(totalPurchaseAmount), trend: 'Total' },
    { label: t('total_customers'), value: customers.length.toString(), trend: 'Active' },
    { label: t('low_stock'), value: String(lowStockItems.length), trend: 'Items' },
    { label: t('pending_sync'), value: String(pendingSyncCount), trend: 'Invoices' },
  ]

  // Sales columns and data
  const salesColumns = [
    { key: 'invoice_number', label: 'Invoice No.' },
    { key: 'customer_id', label: 'Customer' },
    { key: 'total', label: 'Amount' },
    { key: 'status', label: 'Status' },
  ]

  const salesTableData = salesInvoices.map((invoice) => ({
    invoice_number: invoice.invoice_number,
    customer_id:
      customers.find((c) => c.id === invoice.customer_id)?.name ||
      invoice.customer_name ||
      '—',
    total: formatCurrency(Number(invoice.total || 0)),
    status: invoice.status,
  }))

  // Purchase columns and data
  const purchaseColumns = [
    { key: 'invoice_number', label: 'Purchase No.' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'items', label: 'Items' },
    { key: 'total', label: 'Amount' },
    { key: 'status', label: 'Status' },
  ]

  const purchaseTableData = purchaseRows.map((row) => ({
    invoice_number: row.supplier_invoice_number || '—',
    supplier_name: row.supplier_name || '—',
    items: row.product_name || '—',
    total: formatCurrency(Number(row.total_price || 0)),
    status: row.status || '—',
  }))

  // Product Stock columns and data — real inventory from purchases vs sales.
  const stockColumns = [
    { key: 'product_name', label: 'Product' },
    { key: 'unit', label: 'Unit' },
    { key: 'purchased', label: 'Purchased' },
    { key: 'sold', label: 'Sold' },
    { key: 'available', label: 'Available' },
    { key: 'status', label: 'Status' },
  ]

  const stockTableData = inventory.map((r) => {
    const s = stockStatus(r.available)
    return {
      product_name: r.name,
      unit: r.unit || '—',
      purchased: r.purchased,
      sold: r.sold,
      available: Math.max(0, r.available),
      status: (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
          {s.label}
        </span>
      ),
    }
  })

  // Supplier columns and data
  const supplierColumns = [
    { key: 'name', label: 'Supplier Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'gstin', label: 'GSTIN' },
  ]

  const supplierTableData = suppliers.map((supplier) => ({
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address,
    gstin: supplier.gstin,
  }))

  // Customer columns and data
  const customerColumns = [
    { key: 'name', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'gstin', label: 'GSTIN' },
  ]

  const customerTableData = customers.map((customer) => ({
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    gstin: customer.gstin,
  }))

  // Get the appropriate table data and columns based on selected view
  const getTableConfig = () => {
    switch (selectedView) {
      case 'sales':
        return {
          columns: salesColumns,
          data: salesTableData,
          title: 'Sales Invoices',
        }
      case 'purchase':
        return {
          columns: purchaseColumns,
          data: purchaseTableData,
          title: 'Purchase Invoices',
        }
      case 'productstock':
        return {
          columns: stockColumns,
          data: stockTableData,
          title: 'Product Stock',
        }
      case 'supplier':
        return {
          columns: supplierColumns,
          data: supplierTableData,
          title: 'Suppliers',
        }
      case 'customer':
        return {
          columns: customerColumns,
          data: customerTableData,
          title: 'Customers',
        }
      default:
        return {
          columns: salesColumns,
          data: salesTableData,
          title: 'Sales Invoices',
        }
    }
  }

  const tableConfig = getTableConfig()

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">{t('dashboard')}</h2>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            <button
              type="button"
              onClick={() => onRoleChange('user')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                role === 'user' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              User
            </button>
            <button
              type="button"
              onClick={() => onRoleChange('admin')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                role === 'admin' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Admin
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat, idx) => (
            <StatCard key={idx} label={stat.label} value={stat.value} trend={stat.trend} />
          ))}
        </div>
      </div>

      {/* ----- Inventory ------------------------------------------------- */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Inventory</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Products Tracked</p>
            <p className="mt-1 text-2xl font-bold text-black">{inventory.length}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Total Purchased</p>
            <p className="mt-1 text-2xl font-bold text-black">{totalPurchasedQty}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Total Sold</p>
            <p className="mt-1 text-2xl font-bold text-black">{totalSoldQty}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase text-gray-500">Available</p>
            <p className="mt-1 text-2xl font-bold text-black">{totalAvailableQty}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-gray-700">Product</th>
                <th className="px-4 py-2.5 font-semibold text-gray-700">Unit</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Purchased</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Sold</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Available</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No inventory yet — add purchases to see stock here.
                  </td>
                </tr>
              ) : (
                inventory.map((r) => {
                  const s = stockStatus(r.available)
                  return (
                    <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-2.5 text-gray-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.unit || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{r.purchased}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{r.sold}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-black">
                        {Math.max(0, r.available)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
                        >
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-black">{tableConfig.title}</h3>
          <div className="w-48">
            <Select value={selectedView} onValueChange={setSelectedView}>
              <SelectTrigger>
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="productstock">Product Stock</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable columns={tableConfig.columns} data={tableConfig.data} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-black">{t('stock_alerts')}</h3>
          {lowStockItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              All products are well stocked.
            </p>
          ) : (
            <div className="space-y-3">
              {lowStockItems.slice(0, 5).map((r) => {
                const s = stockStatus(r.available)
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-black">{r.name}</p>
                      <p className="text-sm text-gray-500">
                        Stock: {Math.max(0, r.available)} {r.unit}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${s.className}`}
                    >
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-black">Sync Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-black">Tally Connection</p>
                <p className="text-xs text-gray-500">Last synced 2 hours ago</p>
              </div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Connected</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-black">Pending Invoices</p>
                <p className="text-xs text-gray-500">2 invoices waiting</p>
              </div>
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
