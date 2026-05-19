'use client'

import { useState } from 'react'
import { Language, UserRole } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import StatCard from '../components/StatCard'
import DataTable from '../components/DataTable'
import { 
  mockSalesInvoices, 
  mockCustomers, 
  mockPurchaseInvoices,
  mockProductStock,
  mockLedgers,
  mockCropPurchase,
  mockSuppliers,
} from '@/lib/mock-data'
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

  const stats = [
    { label: t('total_sales'), value: '₹45,000', trend: '+12%' },
    { label: t('total_purchases'), value: '₹28,000', trend: '+5%' },
    { label: t('total_customers'), value: mockCustomers.length.toString(), trend: 'Active' },
    { label: t('low_stock'), value: '3', trend: 'Items' },
    { label: t('pending_sync'), value: '2', trend: 'Invoices' },
  ]

  // Sales columns and data
  const salesColumns = [
    { key: 'invoice_number', label: 'Invoice No.' },
    { key: 'customer_id', label: 'Customer' },
    { key: 'total', label: 'Amount' },
    { key: 'status', label: 'Status' },
  ]

  const salesTableData = mockSalesInvoices.map((invoice) => ({
    invoice_number: invoice.invoice_number,
    customer_id: mockCustomers.find((c) => c.id === invoice.customer_id)?.name || 'N/A',
    total: `₹${invoice.total}`,
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

  const purchaseTableData = mockPurchaseInvoices.map((invoice) => ({
    invoice_number: invoice.invoice_number,
    supplier_name: invoice.supplier_name,
    items: invoice.items,
    total: `₹${invoice.total}`,
    status: invoice.status,
  }))

  // Product Stock columns and data
  const stockColumns = [
    { key: 'product_name', label: 'Product' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'reorder_level', label: 'Reorder Level' },
    { key: 'status', label: 'Status' },
  ]

  const stockTableData = mockProductStock.map((stock) => ({
    product_name: stock.product_name,
    quantity: stock.quantity,
    unit: stock.unit,
    reorder_level: stock.reorder_level,
    status: stock.status,
  }))

  // Supplier columns and data
  const supplierColumns = [
    { key: 'name', label: 'Supplier Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'gstin', label: 'GSTIN' },
  ]

  const supplierTableData = mockSuppliers.map((supplier) => ({
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

  const customerTableData = mockCustomers.map((customer) => ({
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    gstin: customer.gstin,
  }))

  // Ledger columns and data
  const ledgerColumns = [
    { key: 'name', label: 'Ledger Name' },
    { key: 'type', label: 'Type' },
    { key: 'opening_balance', label: 'Opening Balance' },
    { key: 'balance', label: 'Current Balance' },
  ]

  const ledgerTableData = mockLedgers.map((ledger) => ({
    name: ledger.name,
    type: ledger.type,
    opening_balance: `₹${ledger.opening_balance}`,
    balance: `₹${ledger.balance}`,
  }))

  // Crop Purchase columns and data
  const cropColumns = [
    { key: 'crop_name', label: 'Crop Name' },
    { key: 'farmer_name', label: 'Farmer' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'price_per_unit', label: 'Price/Unit' },
    { key: 'total_price', label: 'Total' },
  ]

  const cropTableData = mockCropPurchase.map((crop) => ({
    crop_name: crop.crop_name,
    farmer_name: crop.farmer_name,
    quantity: `${crop.quantity} ${crop.unit}`,
    price_per_unit: `₹${crop.price_per_unit}`,
    total_price: `₹${crop.total_price}`,
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
      case 'ledgers':
        return {
          columns: ledgerColumns,
          data: ledgerTableData,
          title: 'Ledgers',
        }
      case 'crop_purchase':
        return {
          columns: cropColumns,
          data: cropTableData,
          title: 'Crop Purchase',
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
                <SelectItem value="ledgers">Ledgers</SelectItem>
                <SelectItem value="crop_purchase">Crop Purchase</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable columns={tableConfig.columns} data={tableConfig.data} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-black">{t('stock_alerts')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <p className="font-medium text-black">Organic Rice</p>
                <p className="text-sm text-gray-500">Stock: 50 Kg</p>
              </div>
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Low</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <p className="font-medium text-black">Wheat Flour</p>
                <p className="text-sm text-gray-500">Stock: 75 Kg</p>
              </div>
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">Medium</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-black">Fertilizer NPK</p>
                <p className="text-sm text-gray-500">Stock: 120 Bag</p>
              </div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Good</span>
            </div>
          </div>
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
