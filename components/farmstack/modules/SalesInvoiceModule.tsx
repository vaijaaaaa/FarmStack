import { useState } from 'react'
import { Language, SaleType, SalesInvoice } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useCustomers, useProducts, useProductTypes, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

// Today's date as YYYY-MM-DD (local time) for date inputs.
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SalesInvoiceModuleProps {
  language: Language
}

// One editable line = a product + total quantity the customer wants. The line
// is automatically expanded batch-wise (FEFO) into the allocation rows below.
interface SaleLine {
  selectedProduct: string
  quantity: string
  selectedSaleType: string
}

const createEmptyLine = (): SaleLine => ({
  selectedProduct: '',
  quantity: '',
  selectedSaleType: '',
})

// A stock batch available for a product (derived from purchase history).
interface StockBatch {
  batchName: string
  available: number
  sellingPrice: number
  tallyPrice: number
  unit: string
  expiry: string
}

// One batch allocation produced from a line.
interface AllocChunk {
  batchName: string
  qty: number
  sellingPrice: number
  tallyPrice: number
  unit: string
}

export default function SalesInvoiceModule({ language }: SalesInvoiceModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { customers: mockCustomers } = useCustomers()
  const { products: mockProducts } = useProducts()
  const { invoices, createInvoice, refresh } = useSalesInvoices()
  const { invoices: purchaseInvoices } = usePurchaseInvoices()
  const { productTypes, createProductType } = useProductTypes()
  const saleTypes = productTypes.filter((type) => type.name.toLowerCase().startsWith('sales'))

  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [showSaleTypePopup, setShowSaleTypePopup] = useState(false)
  const [saleType, setSaleType] = useState<SaleType>('cash')
  const [historyTab, setHistoryTab] = useState<'all' | 'cash' | 'credit'>('all')
  const [detailSale, setDetailSale] = useState<SalesInvoice | null>(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedTallyName, setSelectedTallyName] = useState('')
  const [date, setDate] = useState(todayISO)
  const [saleLines, setSaleLines] = useState<SaleLine[]>([createEmptyLine()])

  const [showAddSaleTypeModal, setShowAddSaleTypeModal] = useState(false)
  const [newSaleTypeName, setNewSaleTypeName] = useState('')
  const [newSaleTypeGST, setNewSaleTypeGST] = useState('')
  const [currentTypeIndex, setCurrentTypeIndex] = useState<number | null>(null)

  // Additional details modal states (for invoices > 50k)
  const [showAdditionalDetailsModal, setShowAdditionalDetailsModal] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)
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

  // ----- Stock / batch derivation (FEFO) ---------------------------------
  // Batches available for a product, oldest-expiry first (empty expiry last).
  const getBatchesForProduct = (productId: string): StockBatch[] => {
    if (!productId) return []
    const byBatch = new Map<string, StockBatch>()
    for (const p of purchaseInvoices) {
      if (String(p.product_id || '') !== productId) continue
      const name = String(p.batch || '')
      const cur =
        byBatch.get(name) ||
        {
          batchName: name,
          available: 0,
          sellingPrice: Number(p.selling_price || 0),
          tallyPrice: Number(p.tally_price || 0),
          unit: String(p.unit || ''),
          expiry: String(p.expiry_date || ''),
        }
      cur.available += Number(p.quantity || 0)
      // Keep the most informative price/expiry seen for the batch.
      if (p.selling_price) cur.sellingPrice = Number(p.selling_price)
      if (p.tally_price) cur.tallyPrice = Number(p.tally_price)
      if (p.unit) cur.unit = String(p.unit)
      if (p.expiry_date) cur.expiry = String(p.expiry_date)
      byBatch.set(name, cur)
    }
    // Subtract quantities already sold from each batch.
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        if (String(it.product_id || '') !== productId) continue
        const name = String(it.batch || '')
        const b = byBatch.get(name)
        if (b) b.available -= Number(it.quantity || 0)
      }
    }
    return [...byBatch.values()]
      .filter((b) => b.available > 0.0001)
      .sort((a, b) => {
        if (!a.expiry && !b.expiry) return 0
        if (!a.expiry) return 1 // empty expiry last
        if (!b.expiry) return -1
        return a.expiry.localeCompare(b.expiry)
      })
  }

  const availableStock = (productId: string) =>
    getBatchesForProduct(productId).reduce((s, b) => s + b.available, 0)

  // Allocate a requested quantity across FEFO batches.
  const allocate = (productId: string, qty: number): { chunks: AllocChunk[]; shortfall: number } => {
    const batches = getBatchesForProduct(productId)
    const chunks: AllocChunk[] = []
    let remaining = qty
    for (const b of batches) {
      if (remaining <= 0.0001) break
      const take = Math.min(remaining, b.available)
      chunks.push({
        batchName: b.batchName,
        qty: take,
        sellingPrice: b.sellingPrice,
        tallyPrice: b.tallyPrice,
        unit: b.unit,
      })
      remaining -= take
    }
    return { chunks, shortfall: Math.max(0, remaining) }
  }

  const productGst = (productId: string) =>
    Number(mockProducts.find((p) => p.id === productId)?.gst_rate ?? 0)

  // ----- Sales history ----------------------------------------------------
  const tallySyncedProductIds = new Set(
    purchaseInvoices.filter((p) => p.tally_sync_status === 'synced').map((p) => p.product_id),
  )

  const columns = [
    { key: 'customer_name', label: 'Customer' },
    { key: 'sale_type', label: 'Sale Type' },
    { key: 'date', label: 'Date' },
    { key: 'product_name', label: 'Product' },
    { key: 'batch', label: 'Batch' },
    { key: 'quantity', label: 'Qty' },
    { key: 'selling_price', label: 'Selling' },
    { key: 'tax', label: 'Tax%' },
    { key: 'total', label: 'Total' },
    { key: 'tally', label: 'Status' },
    { key: 'actions', label: 'Details' },
  ]

  const visibleInvoices = invoices.filter(
    (inv) => historyTab === 'all' || (inv.sale_type || 'cash') === historyTab,
  )

  const tableData = visibleInvoices.flatMap((invoice) => {
    const customer = mockCustomers.find((c) => c.id === invoice.customer_id)
    const invoiceDate = invoice.date || new Date(invoice.created_at).toISOString().split('T')[0]
    const tallyEligible =
      invoice.items.length > 0 &&
      invoice.items.every((it) => tallySyncedProductIds.has(it.product_id))

    // A sale split across multiple batches must show as ONE history row per
    // product — group the per-batch items back together for display.
    const byProduct = new Map<string, typeof invoice.items>()
    for (const it of invoice.items) {
      const key = String(it.product_id)
      if (!byProduct.has(key)) byProduct.set(key, [])
      byProduct.get(key)!.push(it)
    }

    return [...byProduct.values()].map((items) => {
      const product = mockProducts.find((p) => p.id === items[0].product_id)
      const totalQty = items.reduce((s, i) => s + i.quantity, 0)
      const totalAmt = items.reduce((s, i) => s + i.quantity * i.rate * (1 + i.gst / 100), 0)
      const batches = [...new Set(items.map((i) => i.batch).filter(Boolean))]
      const prices = [...new Set(items.map((i) => i.rate))]
      const unit = items[0].unit || product?.unit || ''
      return {
        customer_name: invoice.customer_name || customer?.name || 'N/A',
        sale_type: (invoice.sale_type || 'cash') === 'credit' ? 'Credit Sale' : 'Cash Sale',
        date: invoiceDate,
        product_name: product?.name || invoice.product_name || 'N/A',
        batch: batches.length ? batches.join(', ') : '—',
        quantity: unit ? `${totalQty} ${unit}` : totalQty,
        selling_price: prices.length === 1 ? `Rs.${prices[0]}` : 'Multiple',
        tax: `${items[0].gst}%`,
        total: `Rs.${totalAmt.toFixed(2)}`,
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
        actions: (
          <button
            onClick={() => setDetailSale(invoice)}
            data-kbd-row-action
            className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            View Details
          </button>
        ),
      }
    })
  })

  // ----- Form handlers ----------------------------------------------------
  const openCreateSale = () => {
    if (showNewInvoice) {
      setShowNewInvoice(false)
      return
    }
    setShowSaleTypePopup(true)
  }

  const startSale = (type: SaleType) => {
    setSaleType(type)
    setShowSaleTypePopup(false)
    setShowNewInvoice(true)
    setSaleLines([createEmptyLine()])
    setSelectedCustomerId('')
    setSelectedTallyName('')
    setDate(todayISO())
  }

  const updateLine = (index: number, field: keyof SaleLine, value: string) => {
    const updated = [...saleLines]
    updated[index] = { ...updated[index], [field]: value }
    setSaleLines(updated)
  }

  const handleProductSelect = (index: number, productId: string) => {
    if (productId && availableStock(productId) <= 0) {
      toast.error('No stock available for this product. Please add purchase stock first.')
      return
    }
    const product = mockProducts.find((p) => p.id === productId)
    const productType = product?.product_type?.toLowerCase()
    const matched = saleTypes.find((s) => {
      const n = s.name.toLowerCase()
      return n === productType || (!!productType && n.includes(productType))
    })
    const updated = [...saleLines]
    updated[index] = {
      ...updated[index],
      selectedProduct: productId,
      selectedSaleType: matched?.id || saleTypes[0]?.id || '',
    }
    setSaleLines(updated)
  }

  const handleSaleTypeChange = (index: number, saleTypeId: string) => {
    if (saleTypeId === 'add-type') {
      setCurrentTypeIndex(index)
      setNewSaleTypeName('')
      setNewSaleTypeGST('')
      setShowAddSaleTypeModal(true)
      return
    }
    updateLine(index, 'selectedSaleType', saleTypeId)
  }

  const handleSaveNewSaleType = async () => {
    const typeName = newSaleTypeName.trim()
    if (!typeName) {
      toast.error('Please enter a type name')
      return
    }
    try {
      const normalized = typeName.toLowerCase().startsWith('sales')
        ? typeName
        : `Sales of ${typeName}`
      const newType = await createProductType({
        name: normalized,
        description: 'Added from Sales Invoice',
        tax: parseInt(newSaleTypeGST) || 0,
      })
      if (currentTypeIndex !== null) {
        updateLine(currentTypeIndex, 'selectedSaleType', newType.id)
      }
      setShowAddSaleTypeModal(false)
      setCurrentTypeIndex(null)
      setNewSaleTypeName('')
      setNewSaleTypeGST('')
    } catch (err) {
      toast.error(`Failed to add type: ${(err as Error).message}`)
    }
  }

  const handleAddRow = () => setSaleLines([...saleLines, createEmptyLine()])
  const handleRemoveRow = (i: number) => setSaleLines(saleLines.filter((_, idx) => idx !== i))

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

  const buildPayload = (): Record<string, unknown> | null => {
    if (!selectedCustomerId) {
      toast.error('Please select a customer name')
      return null
    }
    if (!selectedTallyName) {
      toast.error('Please select a Tally name')
      return null
    }
    if (!date) {
      toast.error('Please select a sale date')
      return null
    }
    if (saleLines.length === 0) {
      toast.error('Please add at least one product')
      return null
    }

    const items: Array<Record<string, unknown>> = []
    let total = 0
    for (let i = 0; i < saleLines.length; i++) {
      const line = saleLines[i]
      const label = `Item ${i + 1}`
      if (!line.selectedProduct) {
        toast.error(`${label}: Please select a product.`)
        return null
      }
      const qty = Number(String(line.quantity ?? '').trim())
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`${label}: Quantity is required and must be greater than 0.`)
        return null
      }
      const { chunks, shortfall } = allocate(line.selectedProduct, qty)
      const product = mockProducts.find((p) => p.id === line.selectedProduct)
      const name = product?.name || 'this product'
      const unit = product?.unit || ''
      if (shortfall > 0.0001) {
        const avail = availableStock(line.selectedProduct)
        toast.error(`Only ${avail} ${unit} available for ${name}.`)
        return null
      }
      const gst = productGst(line.selectedProduct)
      const ledgerName = saleTypes.find((s) => s.id === line.selectedSaleType)?.name || ''
      for (const c of chunks) {
        const lineTotal = c.qty * c.sellingPrice * (1 + gst / 100)
        total += lineTotal
        items.push({
          product_id: line.selectedProduct,
          batch: c.batchName,
          quantity: c.qty,
          rate: c.sellingPrice,
          tally_price: c.tallyPrice,
          gst,
          type: ledgerName,
          unit: c.unit || unit,
        })
      }
    }

    const customer = mockCustomers.find((c) => c.id === selectedCustomerId)
    return {
      customer_id: selectedCustomerId,
      customer_name: customer?.name || '',
      tally_name: selectedTallyName,
      date,
      sale_type: saleType,
      status: 'saved',
      items,
      total,
    }
  }

  const submit = async (payload: Record<string, unknown>) => {
    try {
      const result: any = await createInvoice(payload as never)
      setShowNewInvoice(false)
      setSaleLines([createEmptyLine()])
      setSelectedCustomerId('')
      setSelectedTallyName('')
      setDate(todayISO())
      // Tally sync happens automatically for products that were purchased with
      // Tally sync on; result.tally is present only when a sync was attempted.
      if (result?.tally) {
        if (result.tally.status === 'synced') {
          toast.success('Sale saved and synced to Tally successfully!')
        } else {
          toast.error(`Tally sync ${result.tally.status} — sale saved locally`, {
            description: result.tally.message,
          })
        }
      } else {
        toast.success('Sale Invoice saved successfully!')
      }
    } catch (err) {
      toast.error(`Failed to save invoice: ${(err as Error).message}`)
    }
  }

  const handleSaveInvoice = async () => {
    const payload = buildPayload()
    if (!payload) return
    if (Number(payload.total) > 50000) {
      setPendingPayload(payload)
      resetAdditionalDetailsForm()
      setShowAdditionalDetailsModal(true)
      return
    }
    await submit(payload)
  }

  const handleSaveWithAdditionalDetails = async () => {
    if (!pendingPayload) return
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
    await submit({
      ...pendingPayload,
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
    })
    setShowAdditionalDetailsModal(false)
    setPendingPayload(null)
    resetAdditionalDetailsForm()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('sales_invoice')}</h2>
        <Button onClick={openCreateSale} className="bg-black text-white hover:bg-gray-900">
          {showNewInvoice ? 'Cancel' : 'Create Sale'}
        </Button>
      </div>

      {/* Cash / Credit sale-type popup */}
      {showSaleTypePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-black">Select Sale Type</h3>
            <p className="mb-5 text-sm text-gray-600">
              Choose how this sale was settled. Both open the same sales form.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => startSale('cash')}
                className="flex-1 rounded-lg border-2 border-green-500 bg-green-50 px-4 py-4 font-semibold text-green-700 hover:bg-green-100"
              >
                Cash Sale
              </button>
              <button
                onClick={() => startSale('credit')}
                className="flex-1 rounded-lg border-2 border-blue-500 bg-blue-50 px-4 py-4 font-semibold text-blue-700 hover:bg-blue-100"
              >
                Credit Sale
              </button>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={() => setShowSaleTypePopup(false)}
                className="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewInvoice && (
        <div data-kbd-scope className="rounded-lg bg-white p-2 shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-black">New Sale</h3>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
                    saleType === 'credit'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {saleType === 'credit' ? 'Credit Sale' : 'Cash Sale'}
                </span>
              </div>
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

            <div className="space-y-4">
              {saleLines.map((line, index) => {
                const productId = line.selectedProduct
                const qtyNum = Number(line.quantity || 0)
                const { chunks, shortfall } = productId
                  ? allocate(productId, qtyNum)
                  : { chunks: [] as AllocChunk[], shortfall: 0 }
                const gst = productGst(productId)
                const unit = mockProducts.find((p) => p.id === productId)?.unit || ''
                const avail = productId ? availableStock(productId) : 0

                return (
                  <div key={index} className="rounded-lg border border-gray-300 bg-[#f6f6f6] p-4">
                    <div className="flex flex-wrap items-end gap-4">
                      {index === 0 && (
                        <>
                          <div className="flex flex-col flex-1 min-w-[160px]">
                            <label className="mb-1 text-xs font-medium text-gray-600">
                              Customer Name
                            </label>
                            <select
                              value={selectedCustomerId}
                              onChange={(e) => {
                                setSelectedCustomerId(e.target.value)
                                const c = mockCustomers.find((x) => x.id === e.target.value)
                                if (c) setSelectedTallyName(c.tally_ledger_name || c.name)
                              }}
                              className="w-full rounded border border-gray-400 p-2 text-sm bg-white focus:outline-none"
                            >
                              <option value="">Select Customer Name</option>
                              {mockCustomers.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                  {customer.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col flex-1 min-w-[160px]">
                            <label className="mb-1 text-xs font-medium text-gray-600">
                              Tally Name
                            </label>
                            <select
                              value={selectedTallyName}
                              onChange={(e) => setSelectedTallyName(e.target.value)}
                              className="w-full rounded border border-gray-400 p-2 text-sm bg-white focus:outline-none"
                            >
                              <option value="">Select Tally Name</option>
                              {mockCustomers.map((customer) => (
                                <option
                                  key={customer.id}
                                  value={customer.tally_ledger_name || customer.name}
                                >
                                  {customer.tally_ledger_name || customer.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      <div className="flex flex-col flex-1 min-w-[160px]">
                        <label className="mb-1 text-xs font-medium text-gray-600">Product</label>
                        <select
                          value={line.selectedProduct}
                          onChange={(e) => handleProductSelect(index, e.target.value)}
                          className="w-full border border-gray-400 rounded p-2 bg-white text-sm"
                        >
                          <option value="">Select a Product</option>
                          {mockProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col w-28">
                        <label className="mb-1 text-xs font-medium text-gray-600">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                            placeholder="0"
                            className="w-full text-center border border-gray-400 rounded bg-white p-2 text-sm focus:outline-none"
                          />
                          {unit && (
                            <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                              {unit}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col flex-1 min-w-[150px]">
                        <label className="mb-1 text-xs font-medium text-gray-600">
                          Sales Ledger / Type
                        </label>
                        <select
                          value={line.selectedSaleType}
                          onChange={(e) => handleSaleTypeChange(index, e.target.value)}
                          className="w-full bg-white border border-gray-400 rounded p-2 text-sm focus:outline-none"
                        >
                          <option value="">Select type</option>
                          {saleTypes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value="add-type" className="text-green-600 font-semibold">
                            + Add New Type
                          </option>
                        </select>
                      </div>

                      {saleLines.length > 1 && (
                        <button
                          onClick={() => handleRemoveRow(index)}
                          className="mb-2 text-red-500 hover:text-red-700 font-bold text-xl"
                          title="Remove product"
                        >
                          &times;
                        </button>
                      )}
                    </div>

                    {productId && (
                      <div
                        className={`mt-1 text-xs font-medium ${
                          avail > 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        Available Stock: {avail} {unit}
                      </div>
                    )}

                    {/* Batch-wise allocation breakdown */}
                    {productId && qtyNum > 0 && (
                      <div className="mt-3 overflow-hidden rounded border border-gray-300">
                        <table className="w-full text-xs text-center">
                          <thead className="bg-[#e0e0e0] text-gray-700">
                            <tr>
                              <th className="py-1.5 px-2 border-r border-gray-300">Batch</th>
                              <th className="py-1.5 px-2 border-r border-gray-300">Quantity</th>
                              <th className="py-1.5 px-2 border-r border-gray-300">Selling Price</th>
                              <th className="py-1.5 px-2 border-r border-gray-300">Tax%</th>
                              <th className="py-1.5 px-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chunks.map((c, ci) => {
                              const rowTotal = c.qty * c.sellingPrice * (1 + gst / 100)
                              return (
                                <tr key={ci} className="border-t border-gray-200 bg-white">
                                  <td className="py-1.5 px-2 border-r border-gray-200">
                                    {c.batchName || 'Primary Batch'}
                                  </td>
                                  <td className="py-1.5 px-2 border-r border-gray-200">
                                    {c.qty} {c.unit || unit}
                                  </td>
                                  <td className="py-1.5 px-2 border-r border-gray-200">
                                    ₹{c.sellingPrice}
                                  </td>
                                  <td className="py-1.5 px-2 border-r border-gray-200">{gst}%</td>
                                  <td className="py-1.5 px-2">₹{rowTotal.toFixed(2)}</td>
                                </tr>
                              )
                            })}
                            {shortfall > 0.0001 && (
                              <tr className="border-t border-gray-200 bg-red-50">
                                <td colSpan={5} className="py-1.5 px-2 text-red-600 font-medium">
                                  Only {avail} {unit} available — reduce the quantity.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const totalQty = chunks.reduce((s, c) => s + c.qty, 0)
                              const grandTotal = chunks.reduce(
                                (s, c) => s + c.qty * c.sellingPrice * (1 + gst / 100),
                                0,
                              )
                              return (
                                <tr className="border-t-2 border-gray-300 bg-[#e0e0e0] font-semibold text-gray-800">
                                  <td className="py-2 px-2 border-r border-gray-300">Total</td>
                                  <td className="py-2 px-2 border-r border-gray-300">
                                    {totalQty} {unit}
                                  </td>
                                  <td className="py-2 px-2 border-r border-gray-300" />
                                  <td className="py-2 px-2 border-r border-gray-300" />
                                  <td className="py-2 px-2">₹{grandTotal.toFixed(2)}</td>
                                </tr>
                              )
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
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

      {/* Additional Details Modal for Sales > 50k */}
      {showAdditionalDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-6 rounded-lg border border-gray-300 max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-black">Additional Details: Local Sales - Taxable</h3>
              <button
                onClick={() => {
                  setShowAdditionalDetailsModal(false)
                  setPendingPayload(null)
                  resetAdditionalDetailsForm()
                }}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-gray-600 italic">
                All fields below are optional. Required only for Tally compatibility on invoices
                above ₹50,000.
              </p>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">e-Way Bill Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">e-Way Bill No</label>
                    <input
                      type="text"
                      value={ewayBillNo}
                      onChange={(e) => setEwayBillNo(e.target.value)}
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

              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">Place of Party</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Dispatch From</label>
                    <input
                      type="text"
                      value={dispatchFrom}
                      onChange={(e) => setDispatchFrom(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-700 font-medium mb-1">Ship To</label>
                    <input
                      type="text"
                      value={shipTo}
                      onChange={(e) => setShipTo(e.target.value)}
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>

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
                      className="border border-gray-400 rounded p-2 bg-white focus:outline-none text-xs"
                    />
                  </div>
                </div>
              </div>

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
                  setPendingPayload(null)
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

      {/* Sale details modal */}
      {detailSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-gray-300 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-black">
                Sale Details — {detailSale.invoice_number}
              </h3>
              <button
                onClick={() => setDetailSale(null)}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Customer:</span>{' '}
                  <span className="font-medium">{detailSale.customer_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tally Name:</span>{' '}
                  <span className="font-medium">{detailSale.tally_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>{' '}
                  <span className="font-medium">{detailSale.date || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Sale Type:</span>{' '}
                  <span className="font-medium capitalize">
                    {(detailSale.sale_type || 'cash') === 'credit' ? 'Credit Sale' : 'Cash Sale'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span className="font-medium capitalize">{detailSale.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tally Sync:</span>{' '}
                  <span className="font-medium capitalize">
                    {(detailSale.tally_sync_status || 'not_synced').replace('_', ' ')}
                  </span>
                </div>
              </div>

              <table className="w-full border border-gray-300 text-sm">
                <thead className="bg-[#e0e0e0] text-gray-700">
                  <tr>
                    <th className="border-r border-gray-300 px-2 py-1.5 text-left">Product</th>
                    <th className="border-r border-gray-300 px-2 py-1.5">Batch</th>
                    <th className="border-r border-gray-300 px-2 py-1.5">Quantity</th>
                    <th className="border-r border-gray-300 px-2 py-1.5">Selling Price</th>
                    <th className="border-r border-gray-300 px-2 py-1.5">Tax%</th>
                    <th className="px-2 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSale.items.map((it, i) => {
                    const product = mockProducts.find((p) => p.id === it.product_id)
                    const lineTotal = it.quantity * it.rate * (1 + it.gst / 100)
                    return (
                      <tr key={i} className="border-t border-gray-200">
                        <td className="border-r border-gray-200 px-2 py-1.5">
                          {product?.name || 'N/A'}
                        </td>
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                          {it.batch || 'Primary Batch'}
                        </td>
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                          {it.quantity} {it.unit || product?.unit || ''}
                        </td>
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                          ₹{it.rate}
                        </td>
                        <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                          {it.gst}%
                        </td>
                        <td className="px-2 py-1.5 text-center">₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-[#e0e0e0] font-semibold">
                    <td className="border-r border-gray-300 px-2 py-2" colSpan={5}>
                      Grand Total
                    </td>
                    <td className="px-2 py-2 text-center">₹{Number(detailSale.total).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end border-t border-gray-200 px-6 py-3">
              <button
                onClick={() => setDetailSale(null)}
                className="rounded-md bg-gray-200 px-5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!showNewInvoice && invoices.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-black">Sales History</h3>
            <div className="flex gap-1 rounded-md border border-gray-300 p-0.5">
              {(['all', 'cash', 'credit'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setHistoryTab(tab)}
                  className={`rounded px-3 py-1 text-sm font-medium capitalize transition-colors ${
                    historyTab === tab ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab === 'all' ? 'All' : `${tab} Sales`}
                </button>
              ))}
            </div>
          </div>
          <DataTable columns={columns} data={tableData} dense />
        </div>
      )}
    </div>
  )
}
