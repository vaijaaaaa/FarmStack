import { Fragment, useEffect, useRef, useState } from 'react'
import { Language, SalesInvoice } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useCustomers, useProducts, usePurchaseInvoices, useSalesInvoices } from '@/hooks/useDatabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Download, Filter, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import TallyStatusCell from '../components/TallyStatusCell'
import SalesBulkUploadModal, { type ParsedSalesRow } from './sales/BulkUploadModal'

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
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
  // ----- Sales history filters -------------------------------------------
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterCustomerId, setFilterCustomerId] = useState('')
  const [filterProductId, setFilterProductId] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [filterCustomerSearch, setFilterCustomerSearch] = useState('')
  const [filterProductSearch, setFilterProductSearch] = useState('')
  const [filterCustomerOpen, setFilterCustomerOpen] = useState(false)
  const [filterProductOpen, setFilterProductOpen] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

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
  const [showBulkModal, setShowBulkModal] = useState(false)

  // Map bulk-uploaded CSV rows onto the new-sale form. Selling price falls back
  // to the product master; tally price / unit / GST are derived at save time.
  const applyBulkRows = (rows: ParsedSalesRow[]) => {
    const newLines: SaleLine[] = rows.map((r) => {
      const product = mockProducts.find(
        (p) => p.name.toLowerCase() === r.productName.trim().toLowerCase(),
      )
      const productPrice = product?.selling_price != null ? String(product.selling_price) : ''
      return {
        selectedProduct: product ? product.id : '',
        quantity: r.quantity || '',
        sellingPrice: r.sellingPrice || productPrice,
        expiryDate: r.expiryDate || (product?.expiry_date ? String(product.expiry_date) : ''),
      }
    })
    setSaleLines(newLines.length > 0 ? newLines : [createEmptyLine()])
  }

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

  // When the filter panel closes, collapse the inner search dropdowns so it
  // opens fresh next time (no stale open list).
  useEffect(() => {
    if (showFilterPanel) return
    setFilterCustomerOpen(false)
    setFilterProductOpen(false)
  }, [showFilterPanel])

  // Close the filter panel on outside click or ESC (returning focus to button).
  useEffect(() => {
    if (!showFilterPanel) return
    const onClick = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFilterPanel(false)
        filterButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showFilterPanel])

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
  // Sales history is invoice-level (each invoice already carries its items[]).
  // The Cash/Credit tabs filter by the derived sale_type; the filter panel adds
  // customer / product / date-range filters (all combine with AND).
  const visibleInvoices = invoices.filter((inv) => {
    if (historyTab !== 'all' && (inv.sale_type || 'cash') !== historyTab) return false
    if (filterCustomerId && String(inv.customer_id) !== filterCustomerId) return false
    if (filterProductId && !inv.items.some((it) => String(it.product_id) === filterProductId)) {
      return false
    }
    const d = inv.date || new Date(inv.created_at).toISOString().split('T')[0]
    if (filterFromDate && d < filterFromDate) return false
    if (filterToDate && d > filterToDate) return false
    return true
  })

  const activeFilterCount =
    (filterCustomerId ? 1 : 0) +
    (filterProductId ? 1 : 0) +
    (filterFromDate ? 1 : 0) +
    (filterToDate ? 1 : 0)

  const clearFilters = () => {
    setFilterCustomerId('')
    setFilterProductId('')
    setFilterFromDate('')
    setFilterToDate('')
    setFilterCustomerSearch('')
    setFilterProductSearch('')
  }

  const saleDate = (inv: SalesInvoice) =>
    inv.date || new Date(inv.created_at).toISOString().split('T')[0]

  // Export the (filtered) sales history to a formatted .xlsx file. One row per
  // product line, repeating the invoice-level fields, so no data is lost.
  const exportToExcel = () => {
    if (visibleInvoices.length === 0) {
      toast.error('No sales to export')
      return
    }
    const headers = [
      'Customer Name',
      'Tally Name',
      'Sale Type',
      'Sale Date',
      'Invoice Total',
      'Tally Sync Status',
      'Created Date',
      'Product Name',
      'Batch Number',
      'Quantity',
      'Unit',
      'Selling Price',
      'Tally Selling Price',
      'Expiry Date',
      'Ledger Type',
      'Tax %',
      'Row Total',
    ]
    const rows: (string | number)[][] = [headers]
    for (const inv of visibleInvoices) {
      const customer = mockCustomers.find((c) => c.id === inv.customer_id)
      for (const it of inv.items) {
        const product = mockProducts.find((p) => p.id === it.product_id)
        const rowTotal = it.quantity * it.rate * (1 + it.gst / 100)
        rows.push([
          String(inv.customer_name || customer?.name || ''),
          String(inv.tally_name ?? ''),
          (inv.sale_type || 'cash') === 'credit' ? 'Credit Sale' : 'Cash Sale',
          saleDate(inv),
          Number(inv.total || 0),
          String(inv.tally_sync_status || 'not_synced'),
          String(inv.created_at ?? ''),
          String(product?.name ?? ''),
          String(it.batch ?? ''),
          Number(it.quantity || 0),
          String(it.unit || product?.unit || ''),
          Number(it.rate || 0),
          Number(it.tally_price || 0),
          String(product?.expiry_date ?? ''),
          String(it.type ?? ''),
          Number(it.gst || 0),
          Number(rowTotal.toFixed(2)),
        ])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c })
      if (ws[ref]) ws[ref].s = { font: { bold: true } }
    }
    ws['!cols'] = headers.map((h, c) => {
      const maxLen = rows.reduce((m, row) => Math.max(m, String(row[c] ?? '').length), h.length)
      return { wch: Math.min(40, maxLen + 2) }
    })
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
    const stamp = todayISO()
    const name =
      activeFilterCount > 0 || historyTab !== 'all'
        ? `sales_invoices_filtered_${stamp}.xlsx`
        : `sales_invoices_${stamp}.xlsx`
    XLSX.writeFile(wb, name)
    toast.success('Sales invoices exported')
  }

  // Open a printable sale invoice in a new window (user can Save as PDF).
  const printSaleInvoice = (inv: SalesInvoice) => {
    const w = window.open('', '_blank', 'width=820,height=920')
    if (!w) {
      toast.error('Please allow pop-ups to print the invoice')
      return
    }
    const rows = inv.items
      .map((it) => {
        const product = mockProducts.find((p) => p.id === it.product_id)
        const lineTotal = it.quantity * it.rate * (1 + it.gst / 100)
        return `
        <tr>
          <td>${product?.name ?? 'N/A'}</td>
          <td style="text-align:center">${it.batch || '—'}</td>
          <td style="text-align:center">${it.quantity}${it.unit ? ' ' + it.unit : ''}</td>
          <td style="text-align:right">₹${Number(it.rate || 0).toFixed(2)}</td>
          <td style="text-align:center">${it.gst}%</td>
          <td style="text-align:right">₹${lineTotal.toFixed(2)}</td>
        </tr>`
      })
      .join('')
    w.document.write(`<!doctype html><html><head><title>Invoice ${inv.invoice_number ?? ''}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#555;font-size:13px}
        .meta{margin:16px 0;font-size:13px;line-height:1.6}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        th,td{border:1px solid #ccc;padding:6px 8px}
        th{background:#eee;text-align:left}
        tfoot td{font-weight:bold}
      </style></head><body>
      <h1>Sales Invoice</h1>
      <div class="muted">FarmStack</div>
      <div class="meta">
        <div><strong>Customer:</strong> ${inv.customer_name ?? ''}</div>
        <div><strong>Tally Name:</strong> ${inv.tally_name ?? ''}</div>
        <div><strong>Invoice #:</strong> ${inv.invoice_number ?? ''}</div>
        <div><strong>Date:</strong> ${saleDate(inv)}</div>
      </div>
      <table>
        <thead><tr>
          <th>Product</th><th>Batch</th><th>Qty</th><th>Selling Price</th><th>Tax%</th><th>Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" style="text-align:right">Grand Total</td>
        <td style="text-align:right">₹${Number(inv.total).toFixed(2)}</td></tr></tfoot>
      </table>
      </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

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
    const toastId = toast.loading('Saving sale…')
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
          toast.success('Sale saved and synced to Tally successfully!', { id: toastId })
        } else {
          toast.error(`Tally sync ${result.tally.status} — sale saved locally`, {
            id: toastId,
            description: result.tally.message,
          })
        }
      } else {
        toast.success('Sale Invoice saved successfully!', { id: toastId })
      }
    } catch (err) {
      toast.error(`Failed to save invoice: ${(err as Error).message}`, { id: toastId })
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
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowNewInvoice(!showNewInvoice)}
            className="bg-black text-white hover:bg-gray-900"
          >
            {showNewInvoice ? 'Cancel' : 'Create Sale'}
          </Button>
        </div>
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

            <div className="flex items-center justify-between gap-6 mt-8 pb-4">
              <div></div>
              <div className="flex gap-6">
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
              <button
                onClick={() => setShowBulkModal(true)}
                className="bg-[#e4dd5f] hover:bg-[#d4cd4f] text-gray-900 font-medium px-6 py-2 rounded-lg text-lg"
              >
                Bulk Upload
              </button>
            </div>
          </div>
        </div>
      )}

      <SalesBulkUploadModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onApply={applyBulkRows}
        products={mockProducts}
      />

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

      {!showNewInvoice && invoices.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-3">

              {/* Filter */}
              <div ref={filterPanelRef} className="relative">
                <Button
                  ref={filterButtonRef}
                  type="button"
                  variant="ghost"
                  onClick={() => setShowFilterPanel((o) => !o)}
                  className={`relative z-40 inline-flex items-center gap-2 border bg-white text-gray-700 shadow-none hover:bg-gray-100 hover:text-black ${
                    showFilterPanel ? 'border-black bg-gray-100 text-black' : 'border-gray-300'
                  }`}
                >
                  <Filter size={16} />
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="ml-1 rounded-full bg-black px-1.5 text-xs font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>

                {showFilterPanel && (
                  <div className="absolute right-0 top-full z-30 mt-2 max-h-[calc(100vh-12rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-gray-300 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold text-black">Filter Sales</h4>

                    {/* Customer Name — searchable dropdown */}
                    <div className="relative mb-3">
                      <label className="mb-1 block text-xs font-medium text-gray-700">Customer Name</label>
                      <input
                        type="text"
                        value={
                          filterCustomerId
                            ? mockCustomers.find((c) => c.id === filterCustomerId)?.name || ''
                            : filterCustomerSearch
                        }
                        placeholder="Search Customer..."
                        onChange={(e) => {
                          setFilterCustomerSearch(e.target.value)
                          setFilterCustomerId('')
                          setFilterCustomerOpen(true)
                          setFilterProductOpen(false)
                        }}
                        onFocus={() => {
                          setFilterCustomerOpen(true)
                          setFilterProductOpen(false)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                      />
                      {filterCustomerOpen && (
                        <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white">
                          {mockCustomers
                            .filter((c) =>
                              c.name.toLowerCase().includes(filterCustomerSearch.toLowerCase()),
                            )
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setFilterCustomerId(c.id)
                                  setFilterCustomerSearch('')
                                  setFilterCustomerOpen(false)
                                }}
                                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-100"
                              >
                                {c.name}
                              </button>
                            ))}
                          {mockCustomers.filter((c) =>
                            c.name.toLowerCase().includes(filterCustomerSearch.toLowerCase()),
                          ).length === 0 && (
                            <p className="px-3 py-2 text-xs text-gray-500">No customers found</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Product Name — searchable dropdown */}
                    <div className="relative mb-3">
                      <label className="mb-1 block text-xs font-medium text-gray-700">Product Name</label>
                      <input
                        type="text"
                        value={
                          filterProductId
                            ? mockProducts.find((p) => p.id === filterProductId)?.name || ''
                            : filterProductSearch
                        }
                        placeholder="Search Product..."
                        onChange={(e) => {
                          setFilterProductSearch(e.target.value)
                          setFilterProductId('')
                          setFilterProductOpen(true)
                          setFilterCustomerOpen(false)
                        }}
                        onFocus={() => {
                          setFilterProductOpen(true)
                          setFilterCustomerOpen(false)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                      />
                      {filterProductOpen && (
                        <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white">
                          {mockProducts
                            .filter((p) =>
                              p.name.toLowerCase().includes(filterProductSearch.toLowerCase()),
                            )
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setFilterProductId(p.id)
                                  setFilterProductSearch('')
                                  setFilterProductOpen(false)
                                }}
                                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-100"
                              >
                                {p.name}
                              </button>
                            ))}
                          {mockProducts.filter((p) =>
                            p.name.toLowerCase().includes(filterProductSearch.toLowerCase()),
                          ).length === 0 && (
                            <p className="px-3 py-2 text-xs text-gray-500">No products found</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Date range */}
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">From Date</label>
                        <input
                          type="date"
                          value={filterFromDate}
                          onChange={(e) => setFilterFromDate(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">To Date</label>
                        <input
                          type="date"
                          value={filterToDate}
                          onChange={(e) => setFilterToDate(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between gap-3">
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
                      >
                        Clear Filters
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilterPanel(false)}
                        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Export to Excel (respects active filters) */}
              <Button
                type="button"
                variant="ghost"
                onClick={exportToExcel}
                className="inline-flex items-center gap-2 border border-gray-300 bg-white text-gray-700 shadow-none hover:bg-gray-100 hover:text-black"
              >
                <Download size={16} />
                Export
              </Button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Tally Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((inv) => {
                const customer = mockCustomers.find((c) => c.id === inv.customer_id)
                const tallyEligible = Boolean(inv.tally_sync_enabled)
                return (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() =>
                        setExpandedSaleId(expandedSaleId === String(inv.id) ? null : String(inv.id))
                      }
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {inv.customer_name || customer?.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{inv.tally_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{saleDate(inv)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">₹{Number(inv.total).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {tallyEligible ? (
                          <TallyStatusCell
                            type="sales"
                            invoiceId={inv.id}
                            status={inv.tally_sync_status || 'not_synced'}
                            response={inv.tally_response}
                            onSynced={refresh}
                          />
                        ) : (
                          <span
                            className="text-xs text-gray-400"
                            title="Not synced to Tally at purchase — not applicable"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedSaleId(
                                expandedSaleId === String(inv.id) ? null : String(inv.id),
                              )
                            }}
                            className="rounded bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100"
                            title="Expand / collapse"
                          >
                            {expandedSaleId === String(inv.id) ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              printSaleInvoice(inv)
                            }}
                            className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200"
                            title="Print invoice (PDF)"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedSaleId === String(inv.id) && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50 px-4 py-4">
                          <p className="font-semibold text-black mb-2">Invoice Details</p>
                          <div className="grid grid-cols-4 gap-2 text-sm text-gray-700 mb-4">
                            <div>
                              <span className="text-gray-500">Customer</span>
                              <p className="font-medium text-black">
                                {inv.customer_name || customer?.name || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Tally Name</span>
                              <p className="font-medium text-black">{inv.tally_name || '—'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Date</span>
                              <p className="font-medium text-black">{saleDate(inv)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Sale Type</span>
                              <p className="font-medium text-black capitalize">
                                {(inv.sale_type || 'cash') === 'credit' ? 'Credit Sale' : 'Cash Sale'}
                              </p>
                            </div>
                          </div>
                          <table className="w-full border border-gray-300 text-sm">
                            <thead className="bg-[#e0e0e0] text-gray-700">
                              <tr>
                                <th className="border-r border-gray-200 px-2 py-1.5 text-left">Product</th>
                                <th className="border-r border-gray-200 px-2 py-1.5 text-center">Batch</th>
                                <th className="border-r border-gray-200 px-2 py-1.5 text-center">Qty</th>
                                <th className="border-r border-gray-200 px-2 py-1.5 text-right">Selling Price</th>
                                <th className="border-r border-gray-200 px-2 py-1.5 text-center">Tax%</th>
                                <th className="px-2 py-1.5 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inv.items.map((it, i) => {
                                const product = mockProducts.find((p) => p.id === it.product_id)
                                const lineTotal = it.quantity * it.rate * (1 + it.gst / 100)
                                return (
                                  <tr key={i} className="border-t border-gray-200">
                                    <td className="border-r border-gray-200 px-2 py-1.5">
                                      {product?.name || 'N/A'}
                                    </td>
                                    <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                                      {it.batch || '—'}
                                    </td>
                                    <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                                      {it.quantity} {it.unit || product?.unit || ''}
                                    </td>
                                    <td className="border-r border-gray-200 px-2 py-1.5 text-right">
                                      ₹{it.rate}
                                    </td>
                                    <td className="border-r border-gray-200 px-2 py-1.5 text-center">
                                      {it.gst}%
                                    </td>
                                    <td className="px-2 py-1.5 text-right">₹{lineTotal.toFixed(2)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-300 bg-[#e0e0e0] font-semibold">
                                <td className="border-r border-gray-200 px-2 py-2" colSpan={5}>
                                  Grand Total
                                </td>
                                <td className="px-2 py-2 text-right">
                                  ₹{Number(inv.total).toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {visibleInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No sales match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
