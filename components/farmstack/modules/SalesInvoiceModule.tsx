import { useEffect, useRef, useState } from 'react'
import { Language, SalesInvoice } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useCustomers, useProducts, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'
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
  sellingPrice: string
  expiryDate: string
}

const createEmptyLine = (): SaleLine => ({
  selectedProduct: '',
  quantity: '',
  sellingPrice: '',
  expiryDate: '',
})

// Map a product's category (the product master "product_type") to its Tally
// sales ledger — e.g. "Fertilizers" -> "Sales of Fertilizers". Mirrors the
// purchase module's toPurchaseLedger; runs only in the background.
const CATEGORY_TO_SALES_LEDGER: Record<string, string> = {
  fertilizer: 'Sales of Fertilizers',
  fertilizers: 'Sales of Fertilizers',
  micronutrient: 'Sales of Micronutrients',
  micronutrients: 'Sales of Micronutrients',
  pesticide: 'Sales of Pesticides',
  pesticides: 'Sales of Pesticides',
  seed: 'Sales of Seeds',
  seeds: 'Sales of Seeds',
  grain: 'Sales of Grains',
  grains: 'Sales of Grains',
}
const toSalesLedger = (category: string): string => {
  // Normalize: drop any legacy "Purchase of " / "Sales of " prefix so a product
  // category stored as "Purchase of Fertilizer" still resolves to the base
  // category ("fertilizer") instead of "Sales of Purchase of Fertilizer".
  const base = (category || '')
    .trim()
    .replace(/^(purchase|sales)\s+of\s+/i, '')
    .trim()
  const key = base.toLowerCase()
  if (!key) return ''
  return CATEGORY_TO_SALES_LEDGER[key] || `Sales of ${base}`
}

// New-customer form shown inline from the sales invoice — mirrors the fields of
// the Customers module so a customer can be created without leaving the sale.
interface NewCustomerForm {
  name: string
  phone: string
  aadhar_card: string
  address: string
  state: string
  country: string
  gstin: string
  acres: string
  loyalty: string
  referral: string
  display_number: string
}

const emptyNewCustomer: NewCustomerForm = {
  name: '',
  phone: '',
  aadhar_card: '',
  address: '',
  state: '',
  country: '',
  gstin: '',
  acres: '',
  loyalty: '',
  referral: '',
  display_number: '',
}

export default function SalesInvoiceModule({ language }: SalesInvoiceModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { customers: mockCustomers, createCustomer } = useCustomers()
  const { products: mockProducts } = useProducts()
  const { invoices, createInvoice, refresh } = useSalesInvoices()
  const { invoices: purchaseInvoices } = usePurchaseInvoices()
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [historyTab, setHistoryTab] = useState<'all' | 'cash' | 'credit'>('all')
  const [detailSale, setDetailSale] = useState<SalesInvoice | null>(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedTallyName, setSelectedTallyName] = useState('Cash')
  // Searchable customer dropdown — search by Name or City (address field).
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchBy, setCustomerSearchBy] = useState<'name' | 'city'>('name')
  const customerBoxRef = useRef<HTMLDivElement>(null)
  // Inline "add new customer" modal launched from the customer dropdown.
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({ ...emptyNewCustomer })
  const [customerErrors, setCustomerErrors] = useState<string[]>([])
  const [date, setDate] = useState(todayISO)
  const [saleLines, setSaleLines] = useState<SaleLine[]>([createEmptyLine()])

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

  // ----- Stock / pricing (batch-free) ------------------------------------
  // The most recent purchase of a product — drives the latest selling price,
  // tally price and expiry. The latest purchase always overrides older ones.
  const latestPurchaseForProduct = (productId: string) => {
    let latest: (typeof purchaseInvoices)[number] | null = null
    for (const p of purchaseInvoices) {
      if (String(p.product_id || '') !== productId) continue
      if (!latest || String(p.created_at || '') >= String(latest.created_at || '')) {
        latest = p
      }
    }
    return latest
  }

  // Available stock = total quantity purchased − total quantity already sold,
  // ignoring batches entirely.
  const availableStock = (productId: string) => {
    if (!productId) return 0
    let purchased = 0
    for (const p of purchaseInvoices) {
      if (String(p.product_id || '') === productId) purchased += Number(p.quantity || 0)
    }
    let sold = 0
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        if (String(it.product_id || '') === productId) sold += Number(it.quantity || 0)
      }
    }
    return purchased - sold
  }

  const productGst = (productId: string) =>
    Number(mockProducts.find((p) => p.id === productId)?.gst_rate ?? 0)

  // Close the customer dropdown when clicking outside of it.
  useEffect(() => {
    if (!customerOpen) return
    const onClick = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setCustomerOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [customerOpen])

  const filteredCustomers = mockCustomers.filter((c) => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return true
    if (customerSearchBy === 'city') {
      return (c.address || '').toLowerCase().includes(q)
    }
    return c.name.toLowerCase().includes(q)
  })

  const selectedCustomerLabel =
    mockCustomers.find((c) => c.id === selectedCustomerId)?.name || ''

  // ----- Inline add-customer ---------------------------------------------
  const openAddCustomer = () => {
    setNewCustomer({ ...emptyNewCustomer, name: customerSearch.trim() })
    setCustomerErrors([])
    setCustomerOpen(false)
    setShowAddCustomerModal(true)
  }

  const updateNewCustomer = (field: keyof NewCustomerForm, value: string) => {
    setNewCustomer((prev) => ({ ...prev, [field]: value }))
  }

  const validateNewCustomer = (c: NewCustomerForm): string[] => {
    const errs: string[] = []
    if (!c.name.trim()) errs.push('Customer name is required')
    if (!c.address.trim()) errs.push('Address is required')
    if (!c.phone.trim()) errs.push('Phone number is required')
    if (c.phone && !/^[0-9]{10}$/.test(c.phone)) errs.push('Phone number must be 10 digits')
    if (!c.state.trim()) errs.push('State is required')
    if (!c.country.trim()) errs.push('Country is required')
    if (c.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(c.gstin)) {
      errs.push('Invalid GSTIN format')
    }
    if (c.aadhar_card && !/^[0-9]{12}$/.test(c.aadhar_card)) errs.push('Aadhar card must be 12 digits')
    return errs
  }

  const handleSaveNewCustomer = async () => {
    const errs = validateNewCustomer(newCustomer)
    if (
      errs.length === 0 &&
      mockCustomers.some((c) => c.name.trim().toLowerCase() === newCustomer.name.trim().toLowerCase())
    ) {
      errs.push('A customer with this name already exists')
    }
    if (errs.length > 0) {
      setCustomerErrors(errs)
      return
    }

    try {
      setSavingCustomer(true)
      const created = await createCustomer({
        ...newCustomer,
        tally_ledger_name: newCustomer.name,
      })
      setSelectedCustomerId(created.id)
      setShowAddCustomerModal(false)
      setNewCustomer({ ...emptyNewCustomer })
      setCustomerErrors([])
      setCustomerSearch('')
      toast.success('Customer added successfully')
    } catch (err) {
      setCustomerErrors([(err as Error).message])
    } finally {
      setSavingCustomer(false)
    }
  }

  // ----- Sales history ----------------------------------------------------
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
    // Tally status/retry is shown ONLY for sales that were Tally-eligible when
    // created — i.e. every product came from a Tally-synced purchase. This is
    // frozen at sale time via the stored tally_sync_enabled flag; a sale of a
    // non-synced-purchase product never gets sync/resync options.
    const tallyEligible = Boolean(invoice.tally_sync_enabled)

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
    // Auto-fill selling price & expiry from the LATEST purchase of this product
    // — the most recent purchase price always overrides older ones.
    const latest = latestPurchaseForProduct(productId)
    const updated = [...saleLines]
    updated[index] = {
      ...updated[index],
      selectedProduct: productId,
      sellingPrice: latest?.selling_price != null ? String(latest.selling_price) : '',
      expiryDate: latest?.expiry_date ? String(latest.expiry_date) : '',
    }
    setSaleLines(updated)
  }

  // A line is "complete" when its required fields are filled. Expiry is only
  // required for seed products. Drives the Excel-like auto-row creation.
  const isLineComplete = (line: SaleLine): boolean => {
    if (!line.selectedProduct) return false
    if (!(Number(line.quantity) > 0)) return false
    if (line.sellingPrice.trim() === '') return false
    const product = mockProducts.find((p) => p.id === line.selectedProduct)
    if (product?.is_seed && line.expiryDate.trim() === '') return false
    return true
  }

  // A line is "empty" when nothing has been entered. Trailing empty lines are
  // auto-created placeholders and are skipped when saving.
  const isLineEmpty = (line: SaleLine): boolean =>
    !line.selectedProduct &&
    !line.quantity.trim() &&
    !line.sellingPrice.trim() &&
    !line.expiryDate.trim()

  // Once the last line is fully filled, append a fresh empty line automatically.
  useEffect(() => {
    const last = saleLines[saleLines.length - 1]
    if (last && isLineComplete(last)) {
      setSaleLines((prev) => [...prev, createEmptyLine()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleLines])

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
    if (!selectedTallyName) {
      toast.error('Please select a Tally name')
      return null
    }
    if (!date) {
      toast.error('Please select a sale date')
      return null
    }
    // Trailing empty lines (auto-created placeholders) are ignored on save.
    const activeLines = saleLines.filter((l) => !isLineEmpty(l))
    if (activeLines.length === 0) {
      toast.error('Please add at least one product')
      return null
    }

    const items: Array<Record<string, unknown>> = []
    let total = 0
    for (let i = 0; i < activeLines.length; i++) {
      const line = activeLines[i]
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
      if (line.sellingPrice.trim() === '') {
        toast.error(`${label}: Selling Price is required.`)
        return null
      }
      const product = mockProducts.find((p) => p.id === line.selectedProduct)
      const name = product?.name || 'this product'
      const unit = product?.unit || ''
      if (product?.is_seed && line.expiryDate.trim() === '') {
        toast.error(`${label}: Expiry Date is required for seed products.`)
        return null
      }
      // Stock check (batch-free): can't sell more than what's available.
      const avail = availableStock(line.selectedProduct)
      if (qty > avail + 0.0001) {
        toast.error(`Only ${avail} ${unit} available for ${name}.`)
        return null
      }
      const gst = productGst(line.selectedProduct)
      const price = Number(line.sellingPrice || '0')
      const latest = latestPurchaseForProduct(line.selectedProduct)
      // One product = one item line. No batch splitting; the latest purchase's
      // tally price is carried, and the row's selling price is used as the rate.
      items.push({
        product_id: line.selectedProduct,
        quantity: qty,
        rate: price,
        tally_price: latest?.tally_price != null ? Number(latest.tally_price) : 0,
        gst,
        // Category from the product master → Tally sales ledger, e.g.
        // "Fertilizers" → "Sales of Fertilizers". Mapped automatically.
        type: toSalesLedger(product?.product_type || ''),
        unit,
        expiry_date: line.expiryDate || '',
      })
      // Header Total = qty × entered selling price (no GST), matches header.
      total += qty * price
    }

    // Cash vs customer party ledger: when Tally Name is "Cash" the sale posts
    // under Cash (cash sale); any customer name posts under that customer
    // (credit sale). The Tally party ledger always follows tally_name.
    const isCash = selectedTallyName.trim().toLowerCase() === 'cash'
    const customer = mockCustomers.find((c) => c.id === selectedCustomerId)
    return {
      customer_id: selectedCustomerId,
      customer_name: customer?.name || '',
      tally_name: selectedTallyName,
      date,
      sale_type: isCash ? 'cash' : 'credit',
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
      setSelectedTallyName('Cash')
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

  // Header Total Amount = sum of (quantity × selling price) across all rows.
  const salesTotal = saleLines.reduce(
    (sum, l) => sum + Number(l.quantity || '0') * Number(l.sellingPrice || '0'),
    0,
  )

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
            <h3 className="text-xl font-bold text-black mb-6">New Sale</h3>

            {/* Header fields: Customer Name | Tally Name | Sale Date | Total */}
            <div className="mb-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                {/* Customer Name — searchable dropdown */}
                <div ref={customerBoxRef} className="relative flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Customer Name</label>
                  <button
                    type="button"
                    onClick={() => setCustomerOpen((o) => !o)}
                    className="w-full rounded-md border border-gray-400 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 focus:outline-none"
                  >
                    {selectedCustomerLabel || (
                      <span className="text-gray-400">Select Customer Name</span>
                    )}
                  </button>
                  {customerOpen && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded border border-gray-300 bg-white">
                      <div className="border-b border-gray-200 p-2">
                        <div className="mb-2 flex gap-1 rounded-md bg-gray-100 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setCustomerSearchBy('name')}
                            className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                              customerSearchBy === 'name'
                                ? 'bg-white text-black'
                                : 'text-gray-600 hover:text-black'
                            }`}
                          >
                            By Name
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerSearchBy('city')}
                            className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                              customerSearchBy === 'city'
                                ? 'bg-white text-black'
                                : 'text-gray-600 hover:text-black'
                            }`}
                          >
                            By City
                          </button>
                        </div>
                        <input
                          autoFocus
                          type="text"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder={
                            customerSearchBy === 'city'
                              ? 'Search city...'
                              : 'Search customer name...'
                          }
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <div className="px-3 py-3 text-center text-xs text-gray-500">
                            No customers found
                          </div>
                        ) : (
                          filteredCustomers.map((customer) => (
                            <button
                              type="button"
                              key={customer.id}
                              onClick={() => {
                                setSelectedCustomerId(customer.id)
                                setCustomerOpen(false)
                                setCustomerSearch('')
                              }}
                              className={`flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50 ${
                                customer.id === selectedCustomerId
                                  ? 'bg-blue-50 font-medium'
                                  : ''
                              }`}
                            >
                              <span>{customer.name}</span>
                              {customer.address && (
                                <span className="text-xs text-gray-500">
                                  {customer.address}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={openAddCustomer}
                        className="flex w-full items-center gap-1 border-t border-gray-200 px-3 py-2 text-left text-sm font-semibold text-green-600 hover:bg-green-50"
                      >
                        + Add New Customer
                      </button>
                    </div>
                  )}
                </div>

                {/* Tally Name — defaults to Cash */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Tally Name</label>
                  <select
                    value={selectedTallyName}
                    onChange={(e) => setSelectedTallyName(e.target.value)}
                    className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm text-gray-700 bg-gray-50 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    {mockCustomers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sale Date */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Sale Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-md border border-gray-400 px-3 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none text-sm"
                  />
                </div>

                {/* Total Amount — auto-calculated, read-only */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Total Amount</label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${salesTotal.toFixed(2)}`}
                    className="w-full rounded-md border border-gray-400 px-3 py-2 text-center text-gray-800 bg-gray-100 font-semibold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="w-full overflow-x-auto border border-gray-300 rounded-lg">
              <table className="w-full text-sm text-center">
                <thead className="bg-[#e0e0e0] text-gray-800 border-b border-gray-300">
                  <tr>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Product Name</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Quantity <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Selling Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">
                      Expiry Date
                      {saleLines.some(
                        (l) => mockProducts.find((p) => p.id === l.selectedProduct)?.is_seed,
                      ) && <span className="text-red-500"> *</span>}
                    </th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {saleLines.map((line, index) => {
                    const unit = mockProducts.find((p) => p.id === line.selectedProduct)?.unit || ''
                    return (
                      <tr key={index} className="border-b border-gray-300 bg-[#ebebeb]">
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <select
                            value={line.selectedProduct}
                            onChange={(e) => handleProductSelect(index, e.target.value)}
                            className="w-full border border-gray-400 rounded p-1 bg-white text-xs"
                          >
                            <option value="">Select a Product</option>
                            {mockProducts.map((product) => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                              placeholder="0"
                              className="w-16 text-center border border-gray-400 rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none p-1"
                            />
                            {unit && (
                              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                {unit}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="number"
                            value={line.sellingPrice}
                            onChange={(e) => updateLine(index, 'sellingPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-20 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
                          />
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) => updateLine(index, 'expiryDate', e.target.value)}
                            className="w-28 bg-white border border-gray-400 rounded text-center focus:outline-none p-1 text-gray-800 text-xs"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          {saleLines.length > 1 && (
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

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-gray-300 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-black">Add New Customer</h3>
              <button
                onClick={() => {
                  setShowAddCustomerModal(false)
                  setCustomerErrors([])
                }}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-5">
              {customerErrors.length > 0 && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="mb-1 text-sm font-medium text-red-800">Errors:</p>
                  <ul className="space-y-1 text-sm text-red-700">
                    {customerErrors.map((err, i) => (
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
                    value={newCustomer.name}
                    onChange={(e) => updateNewCustomer('name', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(e) => updateNewCustomer('phone', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter phone number"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Aadhar Card</label>
                  <input
                    type="text"
                    value={newCustomer.aadhar_card}
                    onChange={(e) => updateNewCustomer('aadhar_card', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter aadhar card number"
                    maxLength={12}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={newCustomer.address}
                    onChange={(e) => updateNewCustomer('address', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter city name (e.g., Bangalore)"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">State</label>
                  <input
                    type="text"
                    value={newCustomer.state}
                    onChange={(e) => updateNewCustomer('state', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter state"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Country</label>
                  <input
                    type="text"
                    value={newCustomer.country}
                    onChange={(e) => updateNewCustomer('country', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter country"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">GSTIN</label>
                  <input
                    type="text"
                    value={newCustomer.gstin}
                    onChange={(e) => updateNewCustomer('gstin', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter GSTIN"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Acres</label>
                  <input
                    type="text"
                    value={newCustomer.acres}
                    onChange={(e) => updateNewCustomer('acres', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter acres"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Loyalty</label>
                  <input
                    type="text"
                    value={newCustomer.loyalty}
                    onChange={(e) => updateNewCustomer('loyalty', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter loyalty"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Referral</label>
                  <input
                    type="text"
                    value={newCustomer.referral}
                    onChange={(e) => updateNewCustomer('referral', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter referral"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Display Number</label>
                  <input
                    type="text"
                    value={newCustomer.display_number}
                    onChange={(e) => updateNewCustomer('display_number', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter display number"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => {
                  setShowAddCustomerModal(false)
                  setCustomerErrors([])
                }}
                className="rounded-md bg-gray-200 px-5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewCustomer}
                disabled={savingCustomer}
                className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {savingCustomer ? 'Saving...' : 'Add Customer'}
              </button>
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
          <DataTable columns={columns} data={tableData} dense pageSize={10} />
        </div>
      )}
    </div>
  )
}
