import { useState } from 'react'
import { Language, SalesInvoice } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useCustomers, useProducts, useProductTypes, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

interface SalesInvoiceModuleProps {
  language: Language
}

interface SaleItemRow {
  selectedProduct: string
  quantity: string
  sellingPrice: string
  tallyPrice: string
  unit: string
  batch: string
  tax: number
  productType: string
  selectedSaleType: string
}

const createEmptySaleItem = (): SaleItemRow => ({
  selectedProduct: '',
  quantity: '',
  sellingPrice: '',
  tallyPrice: '',
  unit: '',
  batch: '',
  tax: 5,
  productType: '',
  selectedSaleType: '',
})

export default function SalesInvoiceModule({ language }: SalesInvoiceModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { customers: mockCustomers } = useCustomers()
  const { products: mockProducts } = useProducts()
  const { invoices, createInvoice, refresh } = useSalesInvoices()
  const { invoices: purchaseInvoices } = usePurchaseInvoices()
  const { productTypes, createProductType } = useProductTypes()
  const saleTypes = productTypes.filter((type) => type.name.toLowerCase().startsWith('sales'))
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedTallyName, setSelectedTallyName] = useState('')
  const [date, setDate] = useState('')
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([createEmptySaleItem()])
  const [showAddSaleTypeModal, setShowAddSaleTypeModal] = useState(false)
  const [newSaleTypeName, setNewSaleTypeName] = useState('')
  const [newSaleTypeGST, setNewSaleTypeGST] = useState('')
  const [currentTypeIndex, setCurrentTypeIndex] = useState<number | null>(null)
  
  // Additional details modal states (for invoices > 50k - Tally "Additional Details: Local Sales - Taxable")
  const [showAdditionalDetailsModal, setShowAdditionalDetailsModal] = useState(false)
  const [pendingInvoice, setPendingInvoice] = useState<SalesInvoice | null>(null)
  const [ewayBillNo, setEwayBillNo] = useState('')
  const [ewayBillDate, setEwayBillDate] = useState('')
  const [dispatchFrom, setDispatchFrom] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [transporterName, setTransporterName] = useState('')
  const [transporterId, setTransporterId] = useState('')
  const [transportMode, setTransportMode] = useState('')
  const [transportDocNo, setTransportDocNo] = useState('')
  const [transportDocDate, setTransportDocDate] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehicleType, setVehicleType] = useState('')

  const columns = [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'tally_name', label: 'Tally Name' },
    { key: 'date', label: 'Date' },
    { key: 'product_name', label: 'Product Name' },
    { key: 'product_type', label: 'Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'selling_price', label: 'Selling Price' },
    { key: 'tally_price', label: 'Tally Price' },
    { key: 'tax', label: 'Tax%' },
    { key: 'total', label: 'Total' },
    { key: 'tally', label: 'Tally Status' },
  ]

  // A product only belongs in Tally if it was purchased with Tally sync on.
  // Sales of products that were intentionally NOT synced at purchase are not
  // Tally-relevant, so they show no Tally status/retry at all.
  const tallySyncedProductIds = new Set(
    purchaseInvoices
      .filter((p) => p.tally_sync_status === 'synced')
      .map((p) => p.product_id),
  )

  const tableData = invoices.flatMap((invoice) => {
    const customer = mockCustomers.find((c) => c.id === invoice.customer_id)
    const invoiceDate = invoice.date || new Date(invoice.created_at).toISOString().split('T')[0]
    const tallyEligible =
      invoice.items.length > 0 &&
      invoice.items.every((it) => tallySyncedProductIds.has(it.product_id))

    return invoice.items.map((item) => {
      const product = mockProducts.find((p) => p.id === item.product_id)
      const itemTotal = (item.quantity * item.rate) * (1 + item.gst / 100)

      return {
        customer_name: invoice.customer_name || customer?.name || 'N/A',
        tally_name: invoice.tally_name || customer?.tally_ledger_name || 'N/A',
        date: invoiceDate,
        product_name: product?.name || invoice.product_name || 'N/A',
        product_type: product?.product_type || 'N/A',
        quantity: item.quantity,
        selling_price: `Rs.${item.rate}`,
        tally_price: `Rs.${item.tally_price}`,
        tax: `${item.gst}%`,
        total: `Rs.${itemTotal.toFixed(2)}`,
        tally: tallyEligible ? (
          <TallyStatusCell
            type="sales"
            invoiceId={invoice.id}
            status={invoice.tally_sync_status || 'not_synced'}
            response={invoice.tally_response}
            onSynced={refresh}
          />
        ) : (
          <span className="text-xs text-gray-400" title="Not synced to Tally at purchase — not applicable">
            —
          </span>
        ),
      }
    })
  })

  const handleUpdateItem = (index: number, field: keyof SaleItemRow, value: string | number) => {
    const updated = [...saleItems]
    updated[index] = { ...updated[index], [field]: value }
    setSaleItems(updated)
  }

  const handleProductSelectChange = (index: number, productId: string) => {
    const product = mockProducts.find((p) => p.id === productId)
    const latestPurchase = [...purchaseInvoices]
      .reverse()
      .find((invoice) => invoice.product_id === productId)
    const sellingPrice = latestPurchase?.selling_price ? String(latestPurchase.selling_price) : ''
    const tallyPrice = latestPurchase?.tally_price ? String(latestPurchase.tally_price) : ''
    const existingBatch = invoices
      .flatMap((invoice) => invoice.items)
      .find((item) => item.product_id === productId)?.batch
    const batch = existingBatch || (product ? `BATCH-${product.id.padStart(3, '0')}` : '')

    const productType = product?.product_type?.toLowerCase()
    const matchedSaleType = saleTypes.find((type) => {
      const typeName = type.name.toLowerCase()
      return typeName === productType || (!!productType && typeName.includes(productType))
    })
    const saleType = matchedSaleType || saleTypes[0]
    const gstRate = product?.gst_rate ?? saleType?.tax ?? 5

    const updated = [...saleItems]
    updated[index] = {
      ...updated[index],
      selectedProduct: productId,
      sellingPrice,
      tallyPrice,
      unit: product?.unit || '',
      batch,
      tax: gstRate,
      productType: product?.product_type || '',
      selectedSaleType: saleType?.id || '',
    }
    setSaleItems(updated)
  }

  const handleSaleTypeChange = (index: number, saleTypeId: string) => {
    if (saleTypeId === 'add-type') {
      setCurrentTypeIndex(index)
      setNewSaleTypeName('')
      setNewSaleTypeGST('')
      setShowAddSaleTypeModal(true)
      return
    }

    const saleType = saleTypes.find(st => st.id === saleTypeId)
    const updated = [...saleItems]
    updated[index] = {
      ...updated[index],
      selectedSaleType: saleTypeId,
      tax: saleType?.tax ?? 5,
    }
    setSaleItems(updated)
  }

  const handleSaveNewSaleType = async () => {
    const typeName = newSaleTypeName.trim()
    const typeGST = parseInt(newSaleTypeGST) || 0
    if (!typeName || isNaN(typeGST)) {
      toast.error('Please enter type name and GST percentage')
      return
    }

    try {
      const normalizedTypeName = typeName.toLowerCase().startsWith('sales')
        ? typeName
        : `Sales of ${typeName}`
      const newType = await createProductType({
        name: normalizedTypeName,
        description: 'Added from Sales Invoice',
        tax: typeGST,
      })

      if (currentTypeIndex !== null) {
        const updated = [...saleItems]
        updated[currentTypeIndex] = {
          ...updated[currentTypeIndex],
          selectedSaleType: newType.id,
          tax: typeGST,
        }
        setSaleItems(updated)
      }

      setShowAddSaleTypeModal(false)
      setCurrentTypeIndex(null)
      setNewSaleTypeName('')
      setNewSaleTypeGST('')
    } catch (err) {
      toast.error(`Failed to add type: ${(err as Error).message}`)
    }
  }

  const handleAddRow = () => {
    setSaleItems([...saleItems, createEmptySaleItem()])
  }

  const handleRemoveRow = (indexToRemove: number) => {
    setSaleItems(saleItems.filter((_, index) => index !== indexToRemove))
  }

  const getRowTotal = (item: SaleItemRow) => {
    const quantity = parseFloat(item.quantity || '0')
    const sellingPrice = parseFloat(item.sellingPrice || '0')
    const subtotal = quantity * sellingPrice
    const taxAmount = (subtotal * item.tax) / 100
    return subtotal + taxAmount
  }

  const handleCustomerNameChange = (customerId: string) => {
    setSelectedCustomerId(customerId)
    const customer = mockCustomers.find((c) => c.id === customerId)
    if (customer) {
      setSelectedTallyName(customer.tally_ledger_name || customer.name)
    }
  }

  const handleTallyNameChange = (tallyName: string) => {
    setSelectedTallyName(tallyName)
  }

  const handleSaveInvoice = async () => {
    const validItems = saleItems.filter((item) => {
      const quantity = parseFloat(item.quantity || '0')
      const sellingPrice = parseFloat(item.sellingPrice || '0')
      return item.selectedProduct && quantity > 0 && sellingPrice > 0
    })
    
    // Validation with debugging
    if (!selectedCustomerId) {
      toast.error('Please select a customer name')
      return
    }
    if (!selectedTallyName) {
      toast.error('Please select a Tally name')
      return
    }
    if (!date) {
      toast.error('Please select a sale date')
      return
    }
    if (validItems.length === 0) {
      toast.error('Please add at least one product with quantity and selling price greater than 0')
      return
    }

    const total = validItems.reduce((sum, item) => sum + getRowTotal(item), 0)
    const firstProduct = mockProducts.find((p) => p.id === validItems[0].selectedProduct)
    const selectedCustomer = mockCustomers.find((c) => c.id === selectedCustomerId)

    const newInvoice: SalesInvoice = {
      id: String(invoices.length + 1),
      invoice_number: `INV-${String(invoices.length + 1).padStart(3, '0')}`,
      customer_id: selectedCustomerId,
      customer_name: selectedCustomer?.name || '',
      tally_name: selectedTallyName,
      date,
      product_name: firstProduct?.name || '',
      items: validItems.map((item, index) => ({
        id: String(index + 1),
        product_id: item.selectedProduct,
        batch: item.batch,
        quantity: parseFloat(item.quantity || '0'),
        rate: parseFloat(item.sellingPrice || '0'),
        tally_price: parseFloat(item.tallyPrice || item.sellingPrice || '0'),
        gst: item.tax,
        type: saleTypes.find((st) => st.id === item.selectedSaleType)?.name || '',
      })),
      quantity: parseFloat(validItems[0].quantity || '0'),
      selling_price: parseFloat(validItems[0].sellingPrice || '0'),
      total,
      status: 'saved',
      created_at: new Date().toISOString(),
    }

    // Check if total > 50000 and show additional details modal
    if (total > 50000) {
      setPendingInvoice(newInvoice)
      setShowAdditionalDetailsModal(true)
      setEwayBillNo('')
      setEwayBillDate('')
      setDispatchFrom('')
      setShipTo('')
      setTransportMode('')
      setTransporterName('')
      setTransporterId('')
      setTransportDocNo('')
      setTransportDocDate('')
      setVehicleNumber('')
      setVehicleType('')
      return
    }

    // If total <= 50000, save directly
    try {
      await createInvoice(newInvoice)
      setShowNewInvoice(false)
      setSaleItems([createEmptySaleItem()])
      setSelectedCustomerId('')
      setSelectedTallyName('')
      setDate('')
      toast.success('Sale Invoice saved successfully!')
    } catch (err) {
      toast.error(`Failed to save invoice: ${(err as Error).message}`)
    }
  }

  const handleSaveWithAdditionalDetails = async () => {
    if (!pendingInvoice) return

    // Validate conditional required fields
    if (ewayBillNo && !ewayBillDate) {
      toast.error('e-Way Bill Date is required when e-Way Bill No is provided')
      return
    }
    if (transportDocNo && !transportDocDate) {
      toast.error('Transport Document Date is required when Doc/Lading RR/AirWay No. is provided')
      return
    }
    if (transportMode === 'road' && !vehicleNumber) {
      toast.error('Vehicle Number is required for road transport')
      return
    }
    if (transportMode === 'road' && !vehicleType) {
      toast.error('Vehicle Type is required for road transport')
      return
    }

    // Add additional details to the invoice with defaults
    const invoiceWithDetails: SalesInvoice = {
      ...pendingInvoice,
      eway_bill_no: ewayBillNo || undefined,
      eway_bill_date: ewayBillDate || undefined,
      dispatch_from: dispatchFrom || undefined,
      ship_to: shipTo || undefined,
      transporter_name: transporterName || 'None',
      transporter_id: transporterId || undefined,
      transport_mode: transportMode || 'Not Applicable',
      transport_doc_no: transportDocNo || undefined,
      transport_doc_date: transportDocDate || undefined,
      vehicle_number: vehicleNumber || undefined,
      vehicle_type: vehicleType || 'Not Applicable',
    }

    try {
      await createInvoice(invoiceWithDetails)
      setShowNewInvoice(false)
      setSaleItems([createEmptySaleItem()])
      setSelectedCustomerId('')
      setSelectedTallyName('')
      setDate('')
      setShowAdditionalDetailsModal(false)
      setPendingInvoice(null)
      resetAdditionalDetailsForm()
      toast.success('Sale Invoice saved successfully!')
    } catch (err) {
      toast.error(`Failed to save invoice: ${(err as Error).message}`)
    }
  }

  const resetAdditionalDetailsForm = () => {
    setEwayBillNo('')
    setEwayBillDate('')
    setDispatchFrom('')
    setShipTo('')
    setTransportMode('')
    setTransporterName('')
    setTransporterId('')
    setTransportDocNo('')
    setTransportDocDate('')
    setVehicleNumber('')
    setVehicleType('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('sales_invoice')}</h2>
        <Button
          onClick={() => setShowNewInvoice(!showNewInvoice)}
          className="bg-black text-white hover:bg-gray-900"
        >
          {showNewInvoice ? 'Cancel' : 'Create Sale'}
        </Button>
      </div>

      {showNewInvoice && (
        <div data-kbd-scope className="rounded-lg bg-white p-2 shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-black">New Sale</h3>
              <div className="flex flex-col items-end gap-3">
                <Button onClick={handleAddRow} className="bg-blue-500 hover:bg-blue-600 text-white text-sm h-8 rounded-md px-4">
                  Add new Sale
                </Button>
                <div className="flex flex-col items-end gap-1">
                  <label className="text-gray-700 font-medium text-xs">Sale Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-40 rounded-md border border-gray-400 px-3 py-1 text-center text-gray-700 bg-gray-50 focus:outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-12 mb-8">
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
                className="w-72 rounded-md border border-gray-400 px-4 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none"
              >
                <option value="">Select Customer Name</option>
                {mockCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedTallyName}
                onChange={(e) => handleTallyNameChange(e.target.value)}
                className="w-72 rounded-md border border-gray-400 px-4 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none"
              >
                <option value="">Select Tally Name</option>
                {mockCustomers.map((customer) => (
                  <option key={customer.id} value={customer.tally_ledger_name || customer.name}>
                    {customer.tally_ledger_name || customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full overflow-x-auto border border-gray-300 rounded-lg">
              <table className="w-full text-sm text-center">
                <thead className="bg-[#e0e0e0] text-gray-800 border-b border-gray-300">
                  <tr>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Product Name</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Type</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Quantity</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Selling Price</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Tally Price</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Unit</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Batch</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Tax%</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Total</th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((item, index) => {
                    const itemTotal = getRowTotal(item)

                    return (
                      <tr key={index} className="border-b border-gray-300 bg-[#ebebeb]">
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <select
                            value={item.selectedProduct}
                            onChange={(e) => handleProductSelectChange(index, e.target.value)}
                            className="w-full border border-gray-400 rounded p-1 bg-white text-xs"
                          >
                            <option value="">Select a Product</option>
                            {mockProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <select 
                            value={item.selectedSaleType}
                            onChange={(e) => handleSaleTypeChange(index, e.target.value)}
                            className="w-full bg-white border border-gray-400 rounded p-1 text-xs focus:outline-none"
                          >
                            {saleTypes.map((saleType) => (
                              <option key={saleType.id} value={saleType.id}>
                                {saleType.name} ({saleType.tax}%)
                              </option>
                            ))}
                            <option value="add-type" className="text-green-600 font-semibold">+ Add New Type</option>
                          </select>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(index, 'quantity', e.target.value)}
                            placeholder="0"
                            className="w-16 text-center border border-gray-400 rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none p-1"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="number"
                            value={item.sellingPrice}
                            onChange={(e) => handleUpdateItem(index, 'sellingPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-20 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="number"
                            value={item.tallyPrice}
                            onChange={(e) => handleUpdateItem(index, 'tallyPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-20 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleUpdateItem(index, 'unit', e.target.value)}
                            placeholder="Unit"
                            className="w-20 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="text"
                            value={item.batch}
                            onChange={(e) => handleUpdateItem(index, 'batch', e.target.value)}
                            placeholder="Batch"
                            className="w-24 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <span className="font-medium text-gray-800">{item.tax}%</span>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <span className="text-black font-medium">{itemTotal > 0 ? itemTotal.toFixed(2) : '0.00'}</span>
                        </td>
                        <td className="p-2 align-middle">
                          {saleItems.length > 1 && (
                            <button
                              onClick={() => handleRemoveRow(index)}
                              className="text-red-500 hover:text-red-700 font-bold text-lg px-2"
                              title="Remove item"
                            >
                              &times;
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-center gap-6 mt-8 pb-4">
              <button
                onClick={() => setShowNewInvoice(false)}
                className="bg-[#d4d4d4] hover:bg-[#c4c4c4] text-gray-800 font-medium px-8 py-2 rounded-lg text-lg min-w-30"
              >
                cancel
              </button>
              <button
                onClick={handleSaveInvoice}
                data-kbd-submit
                className="bg-[#6b66fc] hover:bg-[#5b56dc] text-white font-medium px-8 py-2 rounded-lg text-lg min-w-30"
              >
                Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Sale Type Modal */}
      {showAddSaleTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-6 rounded-lg min-w-96 border border-gray-300">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-black">Add Sales Type</h3>
              <button
                onClick={() => {
                  setShowAddSaleTypeModal(false)
                  setCurrentTypeIndex(null)
                  setNewSaleTypeName('')
                  setNewSaleTypeGST('')
                }}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Type Name</label>
                <input
                  type="text"
                  value={newSaleTypeName}
                  onChange={(e) => setNewSaleTypeName(e.target.value)}
                  placeholder="e.g., Sales of Spices"
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">GST Percentage (%)</label>
                <input
                  type="number"
                  value={newSaleTypeGST}
                  onChange={(e) => setNewSaleTypeGST(e.target.value)}
                  placeholder="e.g., 5, 12, 18"
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  min="0"
                  max="100"
                />
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <button
                  onClick={() => {
                    setShowAddSaleTypeModal(false)
                    setCurrentTypeIndex(null)
                    setNewSaleTypeName('')
                    setNewSaleTypeGST('')
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewSaleType}
                  className="bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Add Type
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Additional Details Modal for Sales > 50k (Tally "Additional Details: Local Sales - Taxable") */}
      {showAdditionalDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-6 rounded-lg border border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-black">Additional Details: Local Sales - Taxable</h3>
              <button
                onClick={() => {
                  setShowAdditionalDetailsModal(false)
                  setPendingInvoice(null)
                  resetAdditionalDetailsForm()
                }}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <p className="text-gray-600 italic">All fields below are optional. Required only for Tally compatibility on invoices above ₹50,000.</p>
              
              {/* e-Way Bill Details */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">e-Way Bill Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">e-Way Bill No</label>
                    <input
                      type="text"
                      value={ewayBillNo}
                      onChange={(e) => setEwayBillNo(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Date</label>
                    <input
                      type="date"
                      value={ewayBillDate}
                      onChange={(e) => setEwayBillDate(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>
              
              {/* Place of Party */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">Place of Party</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Dispatch From</label>
                    <input
                      type="text"
                      value={dispatchFrom}
                      onChange={(e) => setDispatchFrom(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Ship To</label>
                    <input
                      type="text"
                      value={shipTo}
                      onChange={(e) => setShipTo(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>
              
              {/* Transport Details */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">Transport Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Transporter Name</label>
                    <input
                      type="text"
                      value={transporterName}
                      onChange={(e) => setTransporterName(e.target.value)}
                      placeholder="Default: None"
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Transporter ID</label>
                    <input
                      type="text"
                      value={transporterId}
                      onChange={(e) => setTransporterId(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>
              
              {/* Part B Details */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">Part B Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Mode</label>
                    <select
                      value={transportMode}
                      onChange={(e) => setTransportMode(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    >
                      <option value="">Not Applicable</option>
                      <option value="road">Road</option>
                      <option value="rail">Rail</option>
                      <option value="air">Air</option>
                      <option value="ship">Ship</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Doc/Lading RR/AirWay No.</label>
                    <input
                      type="text"
                      value={transportDocNo}
                      onChange={(e) => setTransportDocNo(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Date</label>
                    <input
                      type="date"
                      value={transportDocDate}
                      onChange={(e) => setTransportDocDate(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      placeholder=""
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Vehicle Type</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    >
                      <option value="">Not Applicable</option>
                      <option value="Regular">Regular</option>
                      <option value="ODC">ODC</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center gap-4 mt-6 pt-4 border-t">
              <button
                onClick={() => {
                  setShowAdditionalDetailsModal(false)
                  setPendingInvoice(null)
                  resetAdditionalDetailsForm()
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWithAdditionalDetails}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
      
      {invoices.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-bold text-black mb-4">Sales History</h3>
          <DataTable columns={columns} data={tableData} />
        </div>
      )}
    </div>
  )
}
