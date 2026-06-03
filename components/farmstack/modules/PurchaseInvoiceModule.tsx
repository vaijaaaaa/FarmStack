import { Fragment, useState, useEffect, useRef } from 'react'
import type { Language, Product, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useSuppliers, useProducts, useProductTypes, usePurchaseInvoices } from '@/hooks/useDatabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Download, Filter, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import TallyStatusCell from '../components/TallyStatusCell'
import BulkUploadModal, { type ParsedPurchaseRow } from './purchase/BulkUploadModal'
import { printHtml } from '@/lib/printHtml'

// Today's date as YYYY-MM-DD (local time) for date inputs.
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A blank purchase row. unit / productType / gstRate are auto-filled (read-only)
// from the selected product master; batch and expiryDate are entered per purchase.
const emptyPurchaseItem = {
  selectedProduct: '',
  quantity: '',
  batch: '',
  buyingPrice: '',
  sellingPrice: '',
  tallyPrice: '',
  expiryDate: '',
  unit: '',
  productType: '',
  gstRate: '',
}
type PurchaseItem = typeof emptyPurchaseItem

// Option lists for the Add Product modal — mirror the Products module.
const DEFAULT_UNITS = ['Kg', 'Nos', 'Bags', 'Litre']
const DEFAULT_GST_RATES = [
  { value: '18', label: '18%' },
  { value: '5', label: '5%' },
  { value: '0', label: 'Exempted' },
]
const GST_SUPPLY_OPTIONS = [
  { value: 'local', label: 'Local (CGST + SGST)' },
  { value: 'interstate', label: 'Interstate (IGST)' },
]

// GST Rate "0" means Exempted — no tax split, so GST Supply Type is N/A.
const isExempted = (gstRate: string) => gstRate === '0'

// Field/label styling shared with the Products creation page so the inline
// "Add Product" modal looks identical to that form.
const PRODUCT_FIELD_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
const PRODUCT_LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700'

// Map a product's category (the product master "product_type") to its Tally
// purchase ledger — e.g. "Fertilizers" -> "Purchase of Fertilizers". This runs
// only in the background; the category/ledger is never shown on the Purchase page.
const CATEGORY_TO_PURCHASE_LEDGER: Record<string, string> = {
  fertilizer: 'Purchase of Fertilizers',
  fertilizers: 'Purchase of Fertilizers',
  micronutrient: 'Purchase of Micronutrients',
  micronutrients: 'Purchase of Micronutrients',
  pesticide: 'Purchase of Pesticides',
  pesticides: 'Purchase of Pesticides',
  seed: 'Purchase of Seeds',
  seeds: 'Purchase of Seeds',
  grain: 'Purchase of Grains',
  grains: 'Purchase of Grains',
}
const toPurchaseLedger = (category: string): string => {
  const key = (category || '').trim().toLowerCase()
  if (!key) return ''
  if (key.startsWith('purchase')) return category.trim()
  return CATEGORY_TO_PURCHASE_LEDGER[key] || `Purchase of ${category.trim()}`
}

interface PurchaseInvoiceModuleProps {
  language: Language
}

export default function PurchaseInvoiceModule({ language }: PurchaseInvoiceModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { suppliers: mockSuppliers, createSupplier } = useSuppliers()
  const { products: mockProducts, createProduct } = useProducts()
  const { invoices, createInvoice, refresh } = usePurchaseInvoices()
  const { productTypes: adminProductTypes, createProductType } = useProductTypes()
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '', state: '', country: '', gstin: '', place_of_supply: '' })
  const [newProduct, setNewProduct] = useState({
    name: '',
    hsn_code: '',
    unit: '',
    product_type: 'Fertilizers',
    gst_rate: '',
    gst_supply_type: 'local',
    selling_price: '',
    tally_price: '',
    expiry_date: '',
    is_seed: false,
  })
  // Unit / GST-rate option lists for the Add Product modal — extendable inline.
  const [unitOptions, setUnitOptions] = useState<string[]>(DEFAULT_UNITS)
  const [gstRateOptions, setGstRateOptions] = useState(DEFAULT_GST_RATES)
  const [addValue, setAddValue] = useState<{ kind: 'unit' | 'gst' } | null>(null)
  const [addValueInput, setAddValueInput] = useState('')
  const [addValueError, setAddValueError] = useState('')
  const [addSupplierError, setAddSupplierError] = useState('')
  const [addProductError, setAddProductError] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayISO)
  const [tallyStatus, setTallyStatus] = useState(false)
  const [isSavingPurchase, setIsSavingPurchase] = useState(false)

  // Multi-item rows State
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([{ ...emptyPurchaseItem }])

  // Modal States
  const [showSupplierDetailsModal, setShowSupplierDetailsModal] = useState(false)
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)
  const [showSearchSupplierDialog, setShowSearchSupplierDialog] = useState(false)
  const [showSearchProductDialog, setShowSearchProductDialog] = useState(false)
  const [showProductSearchResults, setShowProductSearchResults] = useState(false)
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number | null>(null)
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierSearchForm, setSupplierSearchForm] = useState({ startsWith: '', contains: '', endsWith: '', state: '', gstin: '' })
  const [supplierSearchResults, setSupplierSearchResults] = useState<Supplier[]>([])
  const [supplierSearchPerformed, setSupplierSearchPerformed] = useState(false)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  // ----- Purchase history filters ----------------------------------------
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterSupplierId, setFilterSupplierId] = useState('')
  const [filterProductId, setFilterProductId] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [filterSupplierSearch, setFilterSupplierSearch] = useState('')
  const [filterProductSearch, setFilterProductSearch] = useState('')
  const [filterSupplierOpen, setFilterSupplierOpen] = useState(false)
  const [filterProductOpen, setFilterProductOpen] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [currentTypeIndex, setCurrentTypeIndex] = useState<number | null>(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeGST, setNewTypeGST] = useState('')
  const [productSearch, setProductSearch] = useState({
    location: '',
    startsWith: '',
    contains: '',
    endsWith: '',
    priceFrom: '',
    priceTo: '',
    cPriceFrom: '',
    cPriceTo: '',
  })
  
  // Product types for the inline "Add Product" modal — the SAME plain list the
  // Products page uses (e.g. "Fertilizers"). "Purchase of ..." is only the Tally
  // ledger, derived at sync time via toPurchaseLedger() — never the product_type,
  // so master data stays consistent across modules.
  const availableProductTypes = adminProductTypes

  const productLocations = Array.from(
    new Set(mockProducts.map((product) => product.location?.trim()).filter(Boolean) as string[]),
  )

  const productSearchResults = mockProducts.filter((product) => {
    const name = product.name.toLowerCase()
    const location = product.location?.trim() || ''
    const sellingPrice = Number(product.selling_price ?? 0)
    const tallyPrice = Number(product.tally_price ?? 0)
    const priceFrom = Number(productSearch.priceFrom || 0)
    const priceTo = Number(productSearch.priceTo || 0)
    const cPriceFrom = Number(productSearch.cPriceFrom || 0)
    const cPriceTo = Number(productSearch.cPriceTo || 0)

    return (
      (!productSearch.location || location === productSearch.location) &&
      (!productSearch.startsWith || name.startsWith(productSearch.startsWith.toLowerCase())) &&
      (!productSearch.contains || name.includes(productSearch.contains.toLowerCase())) &&
      (!productSearch.endsWith || name.endsWith(productSearch.endsWith.toLowerCase())) &&
      (!priceFrom || sellingPrice >= priceFrom) &&
      (!priceTo || sellingPrice <= priceTo) &&
      (!cPriceFrom || tallyPrice >= cPriceFrom) &&
      (!cPriceTo || tallyPrice <= cPriceTo)
    )
  })

  const hasProductSearchFilters = Object.values(productSearch).some((value) => value.trim() !== '')

  const handleUpdateItem = (index: number, field: keyof PurchaseItem, value: string) => {
    const updated = [...purchaseItems]
    updated[index] = { ...updated[index], [field]: value }
    setPurchaseItems(updated)
  }

  const handleAddRow = () => {
    // Quantity is mandatory — don't let a new item be added while an existing
    // one is still missing a valid quantity.
    const missing = purchaseItems.findIndex((it) => {
      const qty = Number(String(it.quantity ?? '').trim())
      return !Number.isFinite(qty) || qty <= 0
    })
    if (missing !== -1) {
      toast.error(`Item ${missing + 1}: Quantity is required before adding another item.`)
      return
    }
    setPurchaseItems([...purchaseItems, { ...emptyPurchaseItem }])
  }

  const handleRemoveRow = (indexToRemove: number) => {
    setPurchaseItems(purchaseItems.filter((_, index) => index !== indexToRemove))
  }

  // A row is "complete" when every required field is filled. Expiry is only
  // required for seed products. Drives the Excel-like auto-row creation.
  const isRowComplete = (it: PurchaseItem): boolean => {
    if (!it.selectedProduct) return false
    if (!(Number(it.quantity) > 0)) return false
    if (it.buyingPrice.trim() === '') return false
    if (it.sellingPrice.trim() === '') return false
    if (it.tallyPrice.trim() === '') return false
    const product = mockProducts.find((p) => p.id === it.selectedProduct)
    if (product?.is_seed && !it.expiryDate.trim()) return false
    return true
  }

  // A row is "empty" when nothing has been entered. Trailing empty rows are
  // auto-created placeholders and are skipped when saving.
  const isRowEmpty = (it: PurchaseItem): boolean =>
    !it.selectedProduct &&
    !it.quantity.trim() &&
    !it.batch.trim() &&
    !it.buyingPrice.trim() &&
    !it.sellingPrice.trim() &&
    !it.tallyPrice.trim() &&
    !it.expiryDate.trim()

  // Once the last row is fully filled, append a fresh empty row automatically
  // (no "Add" button needed — behaves like Excel/Google Sheets).
  useEffect(() => {
    const last = purchaseItems[purchaseItems.length - 1]
    if (last && isRowComplete(last)) {
      setPurchaseItems((prev) => [...prev, { ...emptyPurchaseItem }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseItems])

  // Auto-fill unit, product type, GST rate and price defaults from the selected
  // product master. The product's price becomes the Buying Price here; Tally
  // Price comes from the master too. Selling Price, Batch and Expiry Date stay
  // blank for manual entry. Product Type is auto-filled but stays changeable.
  const applyProductToItem = (index: number, product: Product) => {
    const updated = [...purchaseItems]
    updated[index] = {
      ...updated[index],
      selectedProduct: product.id,
      unit: product.unit || '',
      productType: product.product_type || '',
      gstRate: product.gst_rate != null ? String(product.gst_rate) : '0',
      buyingPrice: product.selling_price != null ? String(product.selling_price) : '',
      sellingPrice: '',
      tallyPrice: product.tally_price != null ? String(product.tally_price) : '',
      // Auto-fill the expiry date from the product master when it has one.
      expiryDate: product.expiry_date || updated[index].expiryDate,
    }
    setPurchaseItems(updated)
  }

  const handleProductSelectChange = (index: number, value: string) => {
    if (value === 'search') {
      setCurrentSearchIndex(index)
      setShowSearchProductDialog(true)
    } else if (value === 'add') {
      setCurrentSearchIndex(index)
      setShowAddProductModal(true)
    } else {
      const product = mockProducts.find((p) => p.id === value)
      if (product) {
        applyProductToItem(index, product)
      } else {
        handleUpdateItem(index, 'selectedProduct', value)
      }
    }
  }

  const closeAddProductModal = () => {
    setShowAddProductModal(false)
    setNewProduct({
      name: '',
      hsn_code: '',
      unit: '',
      product_type: 'Fertilizers',
      gst_rate: '',
      gst_supply_type: 'local',
      selling_price: '',
      tally_price: '',
      expiry_date: '',
      is_seed: false,
    })
    setAddProductError('')
  }

  const openAddValue = (kind: 'unit' | 'gst') => {
    setAddValue({ kind })
    setAddValueInput('')
    setAddValueError('')
  }

  const closeAddValue = () => {
    setAddValue(null)
    setAddValueInput('')
    setAddValueError('')
  }

  const handleSaveAddValue = () => {
    if (!addValue) return
    const raw = addValueInput.trim()
    if (!raw) {
      setAddValueError(addValue.kind === 'unit' ? 'Unit name is required' : 'GST rate is required')
      return
    }
    if (addValue.kind === 'unit') {
      if (!unitOptions.includes(raw)) setUnitOptions([...unitOptions, raw])
      setNewProduct((p) => ({ ...p, unit: raw }))
    } else {
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0) {
        setAddValueError('Enter a valid GST rate number, e.g. 12')
        return
      }
      const value = String(num)
      if (!gstRateOptions.some((o) => o.value === value)) {
        setGstRateOptions([...gstRateOptions, { value, label: `${num}%` }])
      }
      setNewProduct((p) => ({ ...p, gst_rate: value }))
    }
    closeAddValue()
  }

  const handleAddProduct = async () => {
    const productName = newProduct.name.trim()
    if (!productName) {
      setAddProductError('Product name is required')
      return
    }

    try {
      setAddProductError('')
      const created = await createProduct({
        name: productName,
        hsn_code: newProduct.hsn_code,
        unit: newProduct.unit,
        product_type: newProduct.product_type,
        gst_rate: Number(newProduct.gst_rate || 0),
        gst_supply_type: isExempted(newProduct.gst_rate) ? '' : newProduct.gst_supply_type,
        selling_price: Number(newProduct.selling_price || 0),
        tally_price: Number(newProduct.tally_price || 0),
        expiry_date: newProduct.expiry_date,
        is_seed: newProduct.is_seed,
        tally_stock_item_name: productName,
      })

      if (currentSearchIndex !== null) {
        applyProductToItem(currentSearchIndex, created)
      }

      closeAddProductModal()
    } catch (err) {
      setAddProductError((err as Error).message)
    }
  }

  const handleSearchProductSelect = (product: Product) => {
    if (currentSearchIndex !== null) {
      applyProductToItem(currentSearchIndex, product)
    }
    setShowSearchProductDialog(false)
    setShowProductSearchResults(false)
  }

  const clearProductSearch = () => {
    setProductSearch({
      location: '',
      startsWith: '',
      contains: '',
      endsWith: '',
      priceFrom: '',
      priceTo: '',
      cPriceFrom: '',
      cPriceTo: '',
    })
    setShowProductSearchResults(false)
  }

  // Product Type is auto-filled from the product master but stays changeable.
  const handleTypeSelectChange = (index: number, value: string) => {
    if (value === 'add-type') {
      setCurrentTypeIndex(index)
      setNewTypeName('')
      setNewTypeGST('')
      setShowAddTypeModal(true)
      return
    }
    handleUpdateItem(index, 'productType', value)
  }

  const closeAddTypeModal = () => {
    setShowAddTypeModal(false)
    setCurrentTypeIndex(null)
    setNewTypeName('')
    setNewTypeGST('')
  }

  const handleSaveType = async () => {
    const typeName = newTypeName.trim()
    if (!typeName) {
      toast.error('Please enter a type name')
      return
    }
    try {
      // Store the plain category (e.g. "Fertilizer"), consistent with the
      // Products page. The "Purchase of ..." ledger is derived later, not here.
      const existingType = availableProductTypes.find(
        (type) => type.name.toLowerCase() === typeName.toLowerCase(),
      )
      const typeToSelect =
        existingType ||
        (await createProductType({
          name: typeName,
          description: 'Added from Purchase Invoice',
          tax: Number(newTypeGST) || 0,
        }))
      if (currentTypeIndex === -1) {
        setNewProduct((p) => ({ ...p, product_type: typeToSelect.name }))
      } else if (currentTypeIndex !== null) {
        handleUpdateItem(currentTypeIndex, 'productType', typeToSelect.name)
      }
      closeAddTypeModal()
    } catch (err) {
      toast.error(`Failed to add type: ${(err as Error).message}`)
    }
  }

  useEffect(() => {
    if (!showSupplierDropdown) return
    const onScroll = (e: Event) => {
      if (supplierDropdownRef.current?.contains(e.target as Node)) return
      setShowSupplierDropdown(false)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [showSupplierDropdown])

  // When the filter panel closes, collapse the inner search dropdowns so it
  // opens fresh next time (no stale open list).
  useEffect(() => {
    if (showFilterPanel) return
    setFilterSupplierOpen(false)
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

  const handleSupplierSelect = (supplierId: string) => {
    if (supplierId === 'details') {
      setShowSupplierDetailsModal(true)
    } else if (supplierId === 'add') {
      setShowAddSupplierModal(true)
    } else if (supplierId === 'search') {
      setShowSearchSupplierDialog(true)
    } else {
      setSelectedSupplier(supplierId)
      setSupplierSearch(mockSuppliers.find((s) => s.id === supplierId)?.name || '')
      setShowSupplierDropdown(false)
    }
  }

  const handleSupplierSearch = () => {
    const startsWith = supplierSearchForm.startsWith.trim().toLowerCase()
    const contains = supplierSearchForm.contains.trim().toLowerCase()
    const endsWith = supplierSearchForm.endsWith.trim().toLowerCase()
    const stateTerm = supplierSearchForm.state.trim().toLowerCase()
    const gstinTerm = supplierSearchForm.gstin.trim().toLowerCase()
    const results = mockSuppliers.filter((s) => {
      const name = (s.name || '').toLowerCase()
      return (
        (!startsWith || name.startsWith(startsWith)) &&
        (!contains || name.includes(contains)) &&
        (!endsWith || name.endsWith(endsWith)) &&
        (!stateTerm || (s.state || '').toLowerCase().includes(stateTerm)) &&
        (!gstinTerm || (s.gstin || '').toLowerCase().includes(gstinTerm))
      )
    })
    setSupplierSearchResults(results)
    setSupplierSearchPerformed(true)
  }

  // Auto-search: whenever any filter field changes, run the search automatically
  // after a short debounce — no need to click the Search button. The button and
  // Enter key still work as before. A ref keeps the effect on the latest handler.
  const supplierSearchRef = useRef(handleSupplierSearch)
  supplierSearchRef.current = handleSupplierSearch
  useEffect(() => {
    if (!showSearchSupplierDialog) return
    const hasInput = Object.values(supplierSearchForm).some((v) => v.trim() !== '')
    if (!hasInput) {
      setSupplierSearchResults([])
      setSupplierSearchPerformed(false)
      return
    }
    const timer = setTimeout(() => supplierSearchRef.current(), 350)
    return () => clearTimeout(timer)
  }, [supplierSearchForm, showSearchSupplierDialog])

  const clearSupplierSearch = () => {
    setSupplierSearchForm({ startsWith: '', contains: '', endsWith: '', state: '', gstin: '' })
    setSupplierSearchResults([])
    setSupplierSearchPerformed(false)
  }

  const closeSupplierSearch = () => {
    setShowSearchSupplierDialog(false)
    clearSupplierSearch()
  }

  const selectSupplierFromSearch = (supplier: Supplier) => {
    setSelectedSupplier(supplier.id)
    setSupplierSearch(supplier.name)
    setShowSupplierDropdown(false)
    closeSupplierSearch()
  }

  const closeAddSupplierModal = () => {
    setShowAddSupplierModal(false)
    setNewSupplier({ name: '', phone: '', address: '', state: '', country: '', gstin: '', place_of_supply: '' })
    setAddSupplierError('')
  }

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) {
      setAddSupplierError('Supplier name is required')
      return
    }
    try {
      setAddSupplierError('')
      const created = await createSupplier({
        name: newSupplier.name.trim(),
        phone: newSupplier.phone,
        address: newSupplier.address,
        state: newSupplier.state,
        country: newSupplier.country,
        gstin: newSupplier.gstin,
        place_of_supply: newSupplier.place_of_supply,
        tally_ledger_name: newSupplier.name.trim(),
      })
      setSelectedSupplier(created.id)
      setSupplierSearch(created.name)
      setShowSupplierDropdown(false)
      closeAddSupplierModal()
    } catch (err) {
      setAddSupplierError((err as Error).message)
    }
  }

  // Map the bulk-upload modal's parsed rows onto new-purchase form rows. Unit /
  // Type / GST / Tally price come from the product master; the Buying Price
  // falls back to the product's price when the row omits it.
  const applyBulkRows = (rows: ParsedPurchaseRow[]) => {
    const newItems: PurchaseItem[] = rows.map((r) => {
      const product = mockProducts.find(
        (p) => p.name.toLowerCase() === r.productName.trim().toLowerCase(),
      )
      const productPrice = product?.selling_price != null ? String(product.selling_price) : ''
      return {
        ...emptyPurchaseItem,
        selectedProduct: product ? product.id : '',
        quantity: r.quantity || '',
        batch: r.batch || '',
        buyingPrice: r.buyingPrice || productPrice,
        sellingPrice: r.sellingPrice || productPrice,
        tallyPrice: r.tallyPrice || (product?.tally_price != null ? String(product.tally_price) : ''),
        expiryDate: r.expiryDate || product?.expiry_date || '',
        unit: product?.unit || '',
        productType: product?.product_type || '',
        gstRate: product?.gst_rate != null ? String(product.gst_rate) : '0',
      }
    })

    setPurchaseItems(newItems)
  }

  // Purchase history is invoice-level: group the flattened item rows by
  // invoice id so each invoice appears once. items[] holds its product lines.
  type PRow = (typeof invoices)[number]
  const groupedInvoices = (() => {
    const map = new Map<string, { header: PRow; items: PRow[]; total: number }>()
    for (const row of invoices) {
      const key = String(row.id)
      if (!map.has(key)) map.set(key, { header: row, items: [], total: 0 })
      const g = map.get(key)!
      g.items.push(row)
      g.total += Number(row.total_price || 0)
    }
    return [...map.values()]
  })()

  // Apply the active history filters (supplier / product / date range). Filters
  // combine with AND; product matches across the invoice's line items.
  const filteredInvoices = groupedInvoices.filter((g) => {
    if (filterSupplierId && String(g.header.supplier_id) !== filterSupplierId) return false
    if (filterProductId && !g.items.some((it) => String(it.product_id) === filterProductId)) {
      return false
    }
    const invDate = String(g.header.purchase_date || '')
    if (filterFromDate && invDate && invDate < filterFromDate) return false
    if (filterToDate && invDate && invDate > filterToDate) return false
    if (filterFromDate && !invDate) return false
    if (filterToDate && !invDate) return false
    return true
  })

  const activeFilterCount =
    (filterSupplierId ? 1 : 0) +
    (filterProductId ? 1 : 0) +
    (filterFromDate ? 1 : 0) +
    (filterToDate ? 1 : 0)

  const clearFilters = () => {
    setFilterSupplierId('')
    setFilterProductId('')
    setFilterFromDate('')
    setFilterToDate('')
    setFilterSupplierSearch('')
    setFilterProductSearch('')
  }

  // Export the (filtered) purchase history to a formatted .xlsx file. One row
  // per product line, repeating the invoice-level fields, so no data is lost.
  const exportToExcel = () => {
    if (filteredInvoices.length === 0) {
      toast.error('No purchases to export')
      return
    }
    const headers = [
      'Supplier Name',
      'Invoice Number',
      'Purchase Date',
      'Invoice Total',
      'Tally Sync Status',
      'Created Date',
      'Product Name',
      'Batch Number',
      'Quantity',
      'Unit',
      'Buying Price',
      'Selling Price',
      'Tally Selling Price',
      'Expiry Date',
      'Ledger Type',
      'Tax %',
      'Row Total',
    ]
    const rows: (string | number)[][] = [headers]
    for (const g of filteredInvoices) {
      for (const it of g.items) {
        rows.push([
          String(g.header.supplier_name ?? ''),
          String(g.header.supplier_invoice_number ?? ''),
          String(g.header.purchase_date ?? ''),
          Number(g.total || 0),
          String(g.header.tally_sync_status || 'not_synced'),
          String(g.header.created_at ?? ''),
          String(it.product_name ?? ''),
          String(it.batch ?? ''),
          Number(it.quantity || 0),
          String(it.unit ?? ''),
          Number(it.buying_price || 0),
          Number(it.selling_price || 0),
          Number(it.tally_price || 0),
          String(it.expiry_date ?? ''),
          String(it.type ?? ''),
          Number(it.tax || 0),
          Number(it.total_price || 0),
        ])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Bold header row.
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c })
      if (ws[ref]) ws[ref].s = { font: { bold: true } }
    }
    // Auto-ish column widths from the longest cell in each column.
    ws['!cols'] = headers.map((h, c) => {
      const maxLen = rows.reduce((m, row) => Math.max(m, String(row[c] ?? '').length), h.length)
      return { wch: Math.min(40, maxLen + 2) }
    })
    // Freeze the header row.
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Purchases')
    const stamp = todayISO()
    const name = activeFilterCount > 0
      ? `purchase_invoices_filtered_${stamp}.xlsx`
      : `purchase_invoices_${stamp}.xlsx`
    XLSX.writeFile(wb, name)
    toast.success('Purchase invoices exported')
  }

  const printInvoice = (group: { header: PRow; items: PRow[]; total: number }) => {
    const h = group.header
    const rows = group.items.map((it) => `
      <tr>
        <td>${it.product_name ?? ''}</td>
        <td style="text-align:center">${it.batch || '—'}</td>
        <td style="text-align:center">${it.quantity}${it.unit ? ' ' + it.unit : ''}</td>
        <td style="text-align:right">₹${Number(it.buying_price || 0).toFixed(2)}</td>
        <td style="text-align:center">${Number(it.tax || 0)}%</td>
        <td style="text-align:center">${it.expiry_date || '—'}</td>
        <td style="text-align:right">₹${Number(it.total_price || 0).toFixed(2)}</td>
      </tr>`).join('')
    printHtml(`<!doctype html><html><head><title>Invoice ${h.supplier_invoice_number ?? ''}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#555;font-size:13px}
        .meta{margin:16px 0;font-size:13px;line-height:1.6}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        th,td{border:1px solid #ccc;padding:6px 8px}
        th{background:#eee;text-align:left}
        tfoot td{font-weight:bold}
      </style></head><body>
      <h1>Purchase Invoice</h1>
      <div class="muted">FarmStack</div>
      <div class="meta">
        <div><strong>Supplier:</strong> ${h.supplier_name ?? ''}</div>
        <div><strong>Invoice #:</strong> ${h.supplier_invoice_number ?? ''}</div>
        <div><strong>Date:</strong> ${h.purchase_date ?? ''}</div>
      </div>
      <table>
        <thead><tr>
          <th>Product</th><th>Batch</th><th>Qty</th><th>Buying Price</th>
          <th>Tax</th><th>Expiry</th><th>Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="6" style="text-align:right">Grand Total</td>
        <td style="text-align:right">₹${group.total.toFixed(2)}</td></tr></tfoot>
      </table>
      </body></html>`)
  }

  // ----- Uniqueness checks ------------------------------------------------
  // A supplier invoice number must not already exist in the purchase history.
  const invoiceNumberTaken =
    supplierInvoiceNumber.trim() !== '' &&
    invoices.some(
      (r) =>
        String(r.supplier_invoice_number || '').trim().toLowerCase() ===
        supplierInvoiceNumber.trim().toLowerCase(),
    )

  // A batch number must be unique for a product — not used in another form row
  // and not already recorded in the purchase history.
  const batchDuplicate = (index: number): boolean => {
    const item = purchaseItems[index]
    const batch = item.batch.trim().toLowerCase()
    if (!batch || !item.selectedProduct) return false
    const inForm = purchaseItems.some(
      (other, i) =>
        i !== index &&
        other.selectedProduct === item.selectedProduct &&
        other.batch.trim().toLowerCase() === batch,
    )
    const inHistory = invoices.some(
      (r) =>
        String(r.product_id) === item.selectedProduct &&
        String(r.batch || '').trim().toLowerCase() === batch,
    )
    return inForm || inHistory
  }

  const handleSavePurchase = async () => {
    if (isSavingPurchase) return
    if (!selectedSupplier) {
      toast.error('Please select a supplier')
      return
    }
    if (!supplierInvoiceNumber.trim()) {
      toast.error('Please enter supplier invoice number')
      return
    }
    if (invoiceNumberTaken) {
      toast.error('This supplier invoice number already exists. Enter a unique invoice number.')
      return
    }
    // Trailing empty rows (auto-created placeholders) are ignored on save.
    const activeItems = purchaseItems.filter((it) => !isRowEmpty(it))
    if (activeItems.length === 0) {
      toast.error('Please add at least one product')
      return
    }

    // Every item must be valid before saving.
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i]
      const label = `Item ${i + 1}`
      if (!item.selectedProduct) {
        toast.error(`${label}: Please select a product.`)
        return
      }
      const qty = Number(String(item.quantity ?? '').trim())
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`${label}: Quantity is required and must be greater than 0.`)
        return
      }
      const batchKey = item.batch.trim().toLowerCase()
      const dupInForm = activeItems.some(
        (other, j) =>
          j !== i &&
          other.selectedProduct === item.selectedProduct &&
          other.batch.trim().toLowerCase() === batchKey,
      )
      const dupInHistory = invoices.some(
        (r) =>
          String(r.product_id) === item.selectedProduct &&
          String(r.batch || '').trim().toLowerCase() === batchKey,
      )
      if (batchKey && (dupInForm || dupInHistory)) {
        toast.error(`${label}: Batch "${item.batch.trim()}" already exists for this product.`)
        return
      }
      const buying = Number(String(item.buyingPrice ?? '').trim())
      if (item.buyingPrice.trim() === '' || !Number.isFinite(buying) || buying < 0) {
        toast.error(`${label}: Buying Price is required and must be 0 or more.`)
        return
      }
      const selling = Number(String(item.sellingPrice ?? '').trim())
      if (item.sellingPrice.trim() === '' || !Number.isFinite(selling) || selling < 0) {
        toast.error(`${label}: Selling Price is required and must be 0 or more.`)
        return
      }
      const tally = Number(String(item.tallyPrice ?? '').trim())
      if (item.tallyPrice.trim() === '' || !Number.isFinite(tally) || tally < 0) {
        toast.error(`${label}: Tally Selling Price is required and must be 0 or more.`)
        return
      }
      // Seed products must carry an expiry date — it flows into the stock batch.
      const itemProduct = mockProducts.find((p) => p.id === item.selectedProduct)
      if (itemProduct?.is_seed && !item.expiryDate.trim()) {
        toast.error(`${label}: Expiry Date is required for seed products.`)
        return
      }
    }
    const supplier = mockSuppliers.find((s) => s.id === selectedSupplier)

    const items = activeItems.map((item) => {
      const product = mockProducts.find((p) => p.id === item.selectedProduct)
      const qty = Number(item.quantity || '0')
      const buying = Number(item.buyingPrice || '0')
      const taxRate = Number(item.gstRate || '0')
      // Line total = taxable amount (qty * buying price) + GST on it.
      const taxable = qty * buying
      const lineTotal = taxable + (taxable * taxRate) / 100

      return {
        product_id: item.selectedProduct,
        product_name: product?.name || 'Unknown Product',
        quantity: qty,
        buying_price: buying,
        selling_price: Number(item.sellingPrice || '0'),
        tally_price: Number(item.tallyPrice || '0'),
        expiry_date: item.expiryDate || '',
        // Category from the product master → Tally purchase ledger, e.g.
        // "Fertilizers" → "Purchase of Fertilizers". Mapped automatically.
        type: toPurchaseLedger(item.productType),
        tax: taxRate,
        total_price: lineTotal,
        batch: item.batch.trim(),
        unit: item.unit,
      }
    })

    const toastId = toast.loading('Saving purchase…')
    setIsSavingPurchase(true)
    try {
      const result: any = await createInvoice({
        supplier_id: selectedSupplier,
        supplier_name: supplier ? supplier.name : 'New Supplier',
        supplier_invoice_number: supplierInvoiceNumber,
        purchase_date: purchaseDate,
        tally_status: tallyStatus,
        items,
      })
      setShowNewInvoice(false)
      setSelectedSupplier('')
      setSupplierSearch('')
      setSupplierInvoiceNumber('')
      setPurchaseDate(todayISO())
      setTallyStatus(false)
      setPurchaseItems([{ ...emptyPurchaseItem }])
      if (tallyStatus && result?.tally) {
        if (result.tally.status === 'synced') {
          toast.success('Purchase saved and synced to Tally successfully!', { id: toastId })
        } else {
          toast.error(`Tally sync ${result.tally.status} — purchase saved locally`, {
            id: toastId,
            description: result.tally.message,
          })
        }
      } else {
        toast.success('Purchase Invoice saved successfully!', { id: toastId })
      }
    } catch (err) {
      toast.error(`Failed to save purchase: ${(err as Error).message}`, { id: toastId })
    } finally {
      setIsSavingPurchase(false)
    }
  }

  // Header Total Amount = sum of (quantity × buying price) across all rows.
  const purchaseTotal = purchaseItems.reduce(
    (sum, it) => sum + Number(it.quantity || '0') * Number(it.buyingPrice || '0'),
    0,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('purchase_invoice')}</h2>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              // Opening a fresh form — clear any leftover state from the last purchase.
              if (!showNewInvoice) {
                setSelectedSupplier('')
                setSupplierSearch('')
                setSupplierInvoiceNumber('')
                setPurchaseDate(todayISO())
                setTallyStatus(false)
                setPurchaseItems([{ ...emptyPurchaseItem }])
              }
              setShowNewInvoice(!showNewInvoice)
            }}
            className="bg-black text-white hover:bg-gray-900"
          >
            {showNewInvoice ? 'Cancel' : 'Create Purchase'}
          </Button>
        </div>
      </div>

      {showNewInvoice && (
        <div data-kbd-scope className="rounded-lg bg-white p-2 shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-xl font-bold text-black mb-6">New Purchase</h3>
            
            {/* Header fields: Supplier Name | Invoice No | Date | Total — one row */}
            <div className="mb-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                {/* Supplier Name */}
                <div className="relative flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Supplier Name</label>
                  <input
                    type="text"
                    value={supplierSearch}
                    placeholder="Supplier Name"
                    onChange={(e) => {
                      setSupplierSearch(e.target.value)
                      setSelectedSupplier('')
                      setShowSupplierDropdown(true)
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className="w-full rounded-md border-2 border-blue-500 px-4 py-2 text-left text-gray-700 bg-blue-50 focus:outline-none font-medium placeholder:font-normal placeholder:text-gray-400"
                  />
                  {showSupplierDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowSupplierDropdown(false)}
                      />
                      <div ref={supplierDropdownRef} className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-md z-20 overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                          {mockSuppliers
                            .filter((s) =>
                              s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
                            )
                            .map((supplier) => (
                              <button
                                key={supplier.id}
                                onClick={() => handleSupplierSelect(supplier.id)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                              >
                                {supplier.name}
                              </button>
                            ))}
                          {mockSuppliers.filter((s) =>
                            s.name.toLowerCase().includes(supplierSearch.toLowerCase()),
                          ).length === 0 && (
                            <p className="px-4 py-3 text-sm text-gray-500">No suppliers found</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleSupplierSelect('add')}
                          className="w-full text-left px-4 py-2 hover:bg-green-50 font-semibold text-green-600 border-t border-gray-300"
                        >
                          + Add Supplier
                        </button>
                        <button
                          onClick={() => handleSupplierSelect('search')}
                          className="w-full text-left px-4 py-2 hover:bg-blue-50 font-semibold text-blue-600 border-t border-gray-300"
                        >
                          🔍 Search Supplier
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Supplier Invoice Number */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Supplier Invoice Number</label>
                  <input
                    type="text"
                    placeholder="Supplier Invoice Number"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className={`w-full rounded-md border px-4 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none ${
                      invoiceNumberTaken ? 'border-red-500' : 'border-gray-400'
                    }`}
                  />
                  {invoiceNumberTaken && (
                    <p className="text-xs font-medium text-red-600">
                      This invoice number already exists.
                    </p>
                  )}
                </div>

                {/* Purchase Date */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Purchase Date</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-md border border-gray-400 px-3 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none text-sm"
                  />
                </div>

                {/* Total Amount — auto-calculated, read-only */}
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 font-medium text-xs">Total Amount</label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${purchaseTotal.toFixed(2)}`}
                    className="w-full rounded-md border border-gray-400 px-3 py-2 text-center text-gray-800 bg-gray-100 font-semibold focus:outline-none"
                  />
                </div>
              </div>

              {/* Sync with Tally — stays below the fields */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tally-status"
                  checked={tallyStatus}
                  onChange={(e) => setTallyStatus(e.target.checked)}
                  className="w-4 h-4 accent-green-500 cursor-pointer"
                />
                <label htmlFor="tally-status" className="text-sm text-gray-700 font-medium cursor-pointer">
                  Sync with Tally
                </label>
              </div>
            </div>

            <div className="w-full overflow-x-auto border border-gray-300 rounded-lg">
              <table className="w-full text-sm text-center">
                <thead className="bg-[#e0e0e0] text-gray-800 border-b border-gray-300">
                  <tr>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Product Name</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Batch</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Quantity <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Buying Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Selling Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Tally Selling Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">
                      Expiry Date
                      {purchaseItems.some(
                        (it) => mockProducts.find((p) => p.id === it.selectedProduct)?.is_seed,
                      ) && <span className="text-red-500"> *</span>}
                    </th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map((item, index) => {
                    return (
                      <tr key={index} className="border-b border-gray-300 bg-[#ebebeb]">
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <select
                            value={item.selectedProduct}
                            onChange={(e) => handleProductSelectChange(index, e.target.value)}
                            className="w-full border border-gray-400 rounded p-1 bg-white text-xs"
                          >
                            <option value="">Select a Product</option>
                            <option value="add" className="text-green-600 font-semibold">+ Add Product</option>
                            <option value="search" className="text-blue-600 font-semibold">Search Product</option>
                            {mockProducts.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="text"
                            value={item.batch}
                            onChange={(e) => handleUpdateItem(index, 'batch', e.target.value)}
                            placeholder="Batch no."
                            className={`w-24 text-center border rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none p-1 text-xs ${
                              batchDuplicate(index) ? 'border-red-500' : 'border-gray-400'
                            }`}
                          />
                          {batchDuplicate(index) && (
                            <div className="mt-1 text-[10px] font-medium text-red-600">
                              Batch already exists
                            </div>
                          )}
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(index, 'quantity', e.target.value)}
                              placeholder="0"
                              className="w-16 text-center border border-gray-400 rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none p-1"
                            />
                            {item.unit && (
                              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                {item.unit}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <input
                            type="number"
                            value={item.buyingPrice}
                            onChange={(e) => handleUpdateItem(index, 'buyingPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-20 text-center border border-gray-400 rounded bg-white text-gray-800 focus:outline-none p-1 placeholder-gray-500"
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
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => handleUpdateItem(index, 'expiryDate', e.target.value)}
                            className="w-28 bg-white border border-gray-400 rounded text-center focus:outline-none p-1 text-gray-800 text-xs"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          {purchaseItems.length > 1 && (
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
                  onClick={handleSavePurchase}
                  data-kbd-submit
                  disabled={isSavingPurchase}
                  className={`bg-[#6b66fc] text-white font-medium px-8 py-2 rounded-lg text-lg min-w-30 transition-colors ${
                    isSavingPurchase ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#5b56dc]'
                  }`}
                >
                  {isSavingPurchase ? 'Saving...' : 'Purchase'}
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

      <BulkUploadModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onApply={applyBulkRows}
        products={mockProducts}
      />

      {/* Add Type Modal */}
      {showAddTypeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-lg bg-white border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-black">Add Product Type</h3>
              <button
                onClick={closeAddTypeModal}
                className="text-gray-400 hover:text-gray-700 font-bold text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-5">
              <label className={PRODUCT_LABEL_CLASS}>Type Name</label>
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g., Fertilizer"
                className={PRODUCT_FIELD_CLASS}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                onClick={closeAddTypeModal}
                variant="ghost"
                className="text-gray-600 hover:bg-gray-100 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveType}
                className="bg-black text-white hover:bg-gray-900"
              >
                Add Type
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Details Modal */}
      {showSupplierDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg min-w-96 border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Supplier Details</h3>
              <button 
                onClick={() => setShowSupplierDetailsModal(false)}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Supplier Name</label>
                <input type="text" placeholder="Supplier Name" className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none" />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Phone</label>
                <input type="text" placeholder="Phone Number" className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none" />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Address</label>
                <textarea placeholder="Address" className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none" rows={3}></textarea>
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">GSTIN</label>
                <input type="text" placeholder="GSTIN" className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none" />
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={() => setShowSupplierDetailsModal(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Close
                </button>
                <button
                  onClick={() => setShowSupplierDetailsModal(false)}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-8 rounded-lg w-full max-w-2xl border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Add Supplier</h3>
              <button
                onClick={closeAddSupplierModal}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Supplier Name</label>
                <input
                  type="text"
                  placeholder="Supplier Name"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Phone</label>
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Address</label>
                <input
                  type="text"
                  placeholder="Address"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">State</label>
                <input
                  type="text"
                  placeholder="State"
                  value={newSupplier.state}
                  onChange={(e) => setNewSupplier({ ...newSupplier, state: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Country</label>
                <input
                  type="text"
                  placeholder="Country"
                  value={newSupplier.country}
                  onChange={(e) => setNewSupplier({ ...newSupplier, country: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">GSTIN</label>
                <input
                  type="text"
                  placeholder="GSTIN"
                  value={newSupplier.gstin}
                  onChange={(e) => setNewSupplier({ ...newSupplier, gstin: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Place of Supply</label>
                <input
                  type="text"
                  placeholder="Place of Supply"
                  value={newSupplier.place_of_supply}
                  onChange={(e) => setNewSupplier({ ...newSupplier, place_of_supply: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
            </div>
            {addSupplierError && (
              <p className="text-sm text-red-600 mt-4">{addSupplierError}</p>
            )}
            <div className="flex justify-center gap-4 mt-6">
              <button
                onClick={closeAddSupplierModal}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={handleAddSupplier}
                className="bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-2 rounded-lg"
              >
                Add Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Supplier Modal */}
      {showSearchSupplierDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-8 rounded-lg w-full max-w-lg border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Search Supplier</h3>
              <button
                onClick={closeSupplierSearch}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-gray-700 font-medium text-sm">Name :</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Starts With</span>
                    <input
                      type="text"
                      value={supplierSearchForm.startsWith}
                      onChange={(e) => setSupplierSearchForm({ ...supplierSearchForm, startsWith: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleSupplierSearch()}
                      placeholder="Starts with..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Contains</span>
                    <input
                      type="text"
                      value={supplierSearchForm.contains}
                      onChange={(e) => setSupplierSearchForm({ ...supplierSearchForm, contains: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleSupplierSearch()}
                      placeholder="Contains..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Ends With</span>
                    <input
                      type="text"
                      value={supplierSearchForm.endsWith}
                      onChange={(e) => setSupplierSearchForm({ ...supplierSearchForm, endsWith: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleSupplierSearch()}
                      placeholder="Ends with..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium text-sm">State</label>
                <input
                  type="text"
                  placeholder="State"
                  value={supplierSearchForm.state}
                  onChange={(e) => setSupplierSearchForm({ ...supplierSearchForm, state: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSupplierSearch()}
                  className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium text-sm">GSTIN</label>
                <input
                  type="text"
                  placeholder="GSTIN"
                  value={supplierSearchForm.gstin}
                  onChange={(e) => setSupplierSearchForm({ ...supplierSearchForm, gstin: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSupplierSearch()}
                  className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1"
                />
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <button
                  onClick={clearSupplierSearch}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={handleSupplierSearch}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Search
                </button>
              </div>

              {supplierSearchPerformed && (
                <div className="mt-2 border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {supplierSearchResults.length} result(s) found
                  </p>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                    {supplierSearchResults.map((supplier) => (
                      <button
                        key={supplier.id}
                        onClick={() => selectSupplierFromSearch(supplier)}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:outline-none"
                      >
                        <span className="block font-medium text-gray-800">{supplier.name}</span>
                        <span className="block text-xs text-gray-500">
                          {[supplier.state, supplier.gstin].filter(Boolean).join(' • ') || 'No state / GSTIN'}
                        </span>
                      </button>
                    ))}
                    {supplierSearchResults.length === 0 && (
                      <p className="px-4 py-3 text-sm text-gray-500">No suppliers match your search</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto border border-gray-200">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-black">Add Product</h3>
              <button
                onClick={closeAddProductModal}
                className="text-gray-400 hover:text-gray-700 font-bold text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Body — horizontal form matching the Products creation page */}
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Product Name */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Urea Fertilizer"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className={PRODUCT_FIELD_CLASS}
                    autoFocus
                  />
                </div>

                {/* HSN Code */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    HSN Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter HSN code"
                    value={newProduct.hsn_code}
                    onChange={(e) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                    className={PRODUCT_FIELD_CLASS}
                  />
                </div>

                {/* Product Type */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Product Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newProduct.product_type}
                    onChange={(e) =>
                      e.target.value === 'add-type'
                        ? (setCurrentTypeIndex(-1), setNewTypeName(''), setNewTypeGST(''), setShowAddTypeModal(true))
                        : setNewProduct({ ...newProduct, product_type: e.target.value })
                    }
                    className={`${PRODUCT_FIELD_CLASS} bg-white`}
                  >
                    {availableProductTypes.map((type) => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                    <option value="add-type" className="text-green-600 font-semibold">+ Add Product Type</option>
                  </select>
                </div>

                {/* Unit */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newProduct.unit}
                    onChange={(e) =>
                      e.target.value === '__add_unit__'
                        ? openAddValue('unit')
                        : setNewProduct({ ...newProduct, unit: e.target.value })
                    }
                    className={`${PRODUCT_FIELD_CLASS} bg-white`}
                  >
                    <option value="">Select a unit</option>
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="__add_unit__" className="text-green-600 font-semibold">+ Add Unit</option>
                  </select>
                </div>

                {/* GST Rate */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    GST Rate <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newProduct.gst_rate}
                    onChange={(e) =>
                      e.target.value === '__add_gst__'
                        ? openAddValue('gst')
                        : setNewProduct({ ...newProduct, gst_rate: e.target.value })
                    }
                    className={`${PRODUCT_FIELD_CLASS} bg-white`}
                  >
                    <option value="">Select GST rate</option>
                    {gstRateOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    <option value="__add_gst__" className="text-green-600 font-semibold">+ Add GST Rate</option>
                  </select>
                </div>

                {/* GST Supply Type */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    GST Supply Type{' '}
                    {!isExempted(newProduct.gst_rate) && <span className="text-red-500">*</span>}
                  </label>
                  {isExempted(newProduct.gst_rate) ? (
                    <input
                      type="text"
                      value="Not Applicable (Exempted)"
                      disabled
                      className={`${PRODUCT_FIELD_CLASS} bg-gray-100 text-gray-500`}
                    />
                  ) : (
                    <select
                      value={newProduct.gst_supply_type}
                      onChange={(e) => setNewProduct({ ...newProduct, gst_supply_type: e.target.value })}
                      className={`${PRODUCT_FIELD_CLASS} bg-white`}
                    >
                      {GST_SUPPLY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Selling Price */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Selling Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    value={newProduct.selling_price}
                    onChange={(e) => setNewProduct({ ...newProduct, selling_price: e.target.value })}
                    className={PRODUCT_FIELD_CLASS}
                  />
                </div>

                {/* Tally Price */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Tally Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    value={newProduct.tally_price}
                    onChange={(e) => setNewProduct({ ...newProduct, tally_price: e.target.value })}
                    className={PRODUCT_FIELD_CLASS}
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label className={PRODUCT_LABEL_CLASS}>
                    Expiry Date{newProduct.is_seed && <span className="text-red-500"> *</span>}
                  </label>
                  <input
                    type="date"
                    value={newProduct.expiry_date}
                    onChange={(e) => setNewProduct({ ...newProduct, expiry_date: e.target.value })}
                    className={PRODUCT_FIELD_CLASS}
                  />
                </div>

                {/* Seed */}
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={newProduct.is_seed}
                      onChange={(e) => setNewProduct({ ...newProduct, is_seed: e.target.checked })}
                      className="h-4 w-4 accent-black"
                    />
                    <span className="text-sm font-medium text-gray-700">This is a Seed</span>
                  </label>
                </div>
              </div>

              {addProductError && <p className="mt-3 text-sm text-red-600">{addProductError}</p>}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                onClick={closeAddProductModal}
                variant="ghost"
                className="text-gray-600 hover:bg-gray-100 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddProduct}
                className="bg-black text-white hover:bg-gray-900"
              >
                Add Product
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Unit / Add GST Rate Modal */}
      {addValue && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-lg bg-white border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-black">
                {addValue.kind === 'unit' ? 'Add Unit' : 'Add GST Rate'}
              </h3>
              <button
                onClick={closeAddValue}
                className="text-gray-400 hover:text-gray-700 font-bold text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-5">
              <label className={PRODUCT_LABEL_CLASS}>
                {addValue.kind === 'unit' ? 'Unit Name' : 'GST Rate (%)'}
              </label>
              <input
                type={addValue.kind === 'unit' ? 'text' : 'number'}
                value={addValueInput}
                onChange={(e) => setAddValueInput(e.target.value)}
                placeholder={addValue.kind === 'unit' ? 'e.g. Tonne' : 'e.g. 12'}
                autoFocus
                className={PRODUCT_FIELD_CLASS}
              />
              {addValueError && <p className="mt-2 text-sm text-red-600">{addValueError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                onClick={closeAddValue}
                variant="ghost"
                className="text-gray-600 hover:bg-gray-100 hover:text-black"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAddValue}
                className="bg-black text-white hover:bg-gray-900"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSearchProductDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-lg border border-gray-300 w-[520px] max-w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-300 bg-gray-50">
              <h3 className="text-lg font-bold text-black">ProductSearch</h3>
              <button 
                onClick={() => {
                  setShowSearchProductDialog(false)
                  setShowProductSearchResults(false)
                }}
                className="text-gray-500 hover:text-gray-800 font-bold text-xl"
              >
                &times;
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-2 border-b border-gray-300 overflow-y-auto">
              {/* Location */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 font-medium text-sm">Location</label>
                <select
                  value={productSearch.location}
                  onChange={(e) => setProductSearch({ ...productSearch, location: e.target.value })}
                  className="border border-gray-400 rounded px-3 py-1.5 bg-white focus:outline-none w-full text-sm"
                >
                  <option value="">All Locations</option>
                  {productLocations.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              </div>

              {/* Name fields - Three inputs */}
              <div className="flex flex-col gap-2">
                <label className="text-gray-700 font-medium text-sm">Name :</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Starts With</span>
                    <input
                      type="text"
                      value={productSearch.startsWith}
                      onChange={(e) => setProductSearch({ ...productSearch, startsWith: e.target.value })}
                      placeholder="Starts with..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Contains</span>
                    <input
                      type="text"
                      value={productSearch.contains}
                      onChange={(e) => setProductSearch({ ...productSearch, contains: e.target.value })}
                      placeholder="Contains..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Ends With</span>
                    <input
                      type="text"
                      value={productSearch.endsWith}
                      onChange={(e) => setProductSearch({ ...productSearch, endsWith: e.target.value })}
                      placeholder="Ends with..."
                      className="border border-gray-400 rounded px-2 py-1 w-full focus:outline-none text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Price Range */}
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 font-medium text-sm">Price Range :</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">From</span>
                      <input
                        type="number"
                        value={productSearch.priceFrom}
                        onChange={(e) => setProductSearch({ ...productSearch, priceFrom: e.target.value })}
                        placeholder="0"
                        className="border border-gray-400 rounded px-2 py-1 w-16 bg-white focus:outline-none text-xs"
                      />
                      <span className="text-xs text-gray-700">To</span>
                      <input
                        type="number"
                        value={productSearch.priceTo}
                        onChange={(e) => setProductSearch({ ...productSearch, priceTo: e.target.value })}
                        placeholder="0"
                        className="border border-gray-400 rounded px-2 py-1 w-16 bg-white focus:outline-none text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 font-medium text-sm">CPrice Range :</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">From</span>
                      <input
                        type="number"
                        value={productSearch.cPriceFrom}
                        onChange={(e) => setProductSearch({ ...productSearch, cPriceFrom: e.target.value })}
                        placeholder="0"
                        className="border border-gray-400 rounded px-2 py-1 w-16 bg-white focus:outline-none text-xs"
                      />
                      <span className="text-xs text-gray-700">To</span>
                      <input
                        type="number"
                        value={productSearch.cPriceTo}
                        onChange={(e) => setProductSearch({ ...productSearch, cPriceTo: e.target.value })}
                        placeholder="0"
                        className="border border-gray-400 rounded px-2 py-1 w-16 bg-white focus:outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowProductSearchResults(true)}
                    className="bg-green-500 hover:bg-green-600 text-white font-medium px-3 py-1 rounded text-xs"
                  >
                    Get
                  </button>
                  <button
                    onClick={clearProductSearch}
                    className="bg-gray-400 hover:bg-gray-500 text-white font-medium px-3 py-1 rounded text-xs"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Results Table - Shows when Get is clicked */}
            {(showProductSearchResults || hasProductSearchFilters) && (
              <div className="min-h-[220px] flex-1 overflow-auto p-0">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr className="border-b border-gray-300">
                      <th className="px-2 py-2 font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Product</th>
                      <th className="px-2 py-2 font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Price</th>
                      <th className="px-2 py-2 font-semibold text-gray-700 whitespace-nowrap">CPrice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSearchResults.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                          No products found
                        </td>
                      </tr>
                    ) : (
                      productSearchResults.map((product) => (
                        <tr
                          key={product.id}
                          onClick={() => handleSearchProductSelect(product)}
                          className="border-b border-gray-200 hover:bg-blue-100 cursor-pointer"
                        >
                          <td className="px-2 py-2 border-r border-gray-300">{product.name}</td>
                          <td className="px-2 py-2 border-r border-gray-300 text-right">{Number(product.selling_price ?? 0)}</td>
                          <td className="px-2 py-2 text-right">{Number(product.tally_price ?? 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {invoices.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-black">Purchase History</h3>
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
                    <h4 className="mb-3 text-sm font-semibold text-black">Filter Purchases</h4>

                    {/* Supplier Name — searchable dropdown */}
                    <div className="relative mb-3">
                      <label className="mb-1 block text-xs font-medium text-gray-700">Supplier Name</label>
                      <input
                        type="text"
                        value={
                          filterSupplierId
                            ? mockSuppliers.find((s) => s.id === filterSupplierId)?.name || ''
                            : filterSupplierSearch
                        }
                        placeholder="Search Supplier..."
                        onChange={(e) => {
                          setFilterSupplierSearch(e.target.value)
                          setFilterSupplierId('')
                          setFilterSupplierOpen(true)
                          setFilterProductOpen(false)
                        }}
                        onFocus={() => {
                          setFilterSupplierOpen(true)
                          setFilterProductOpen(false)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                      />
                      {filterSupplierOpen && (
                        <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white">
                          {mockSuppliers
                            .filter((s) =>
                              s.name.toLowerCase().includes(filterSupplierSearch.toLowerCase()),
                            )
                            .map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setFilterSupplierId(s.id)
                                  setFilterSupplierSearch('')
                                  setFilterSupplierOpen(false)
                                }}
                                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-100"
                              >
                                {s.name}
                              </button>
                            ))}
                          {mockSuppliers.filter((s) =>
                            s.name.toLowerCase().includes(filterSupplierSearch.toLowerCase()),
                          ).length === 0 && (
                            <p className="px-3 py-2 text-xs text-gray-500">No suppliers found</p>
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
                          setFilterSupplierOpen(false)
                        }}
                        onFocus={() => {
                          setFilterProductOpen(true)
                          setFilterSupplierOpen(false)
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Supplier Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((g) => (
                <Fragment key={g.header.id}>
                  <tr
                    onClick={() =>
                      setExpandedInvoiceId(
                        expandedInvoiceId === String(g.header.id) ? null : String(g.header.id),
                      )
                    }
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">{g.header.supplier_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.header.supplier_invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{g.header.purchase_date || ''}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">₹{g.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {/* Always show the Tally status cell so a purchase created
                          with sync off can still be synced later via its button. */}
                      <TallyStatusCell
                        type="purchase"
                        invoiceId={g.header.id}
                        status={g.header.tally_sync_status || 'not_synced'}
                        response={g.header.tally_response}
                        onSynced={refresh}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedInvoiceId(
                              expandedInvoiceId === String(g.header.id) ? null : String(g.header.id),
                            )
                          }}
                          className="rounded bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100"
                          title="Expand / collapse"
                        >
                          {expandedInvoiceId === String(g.header.id) ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            printInvoice(g)
                          }}
                          className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200"
                          title="Print invoice (PDF)"
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedInvoiceId === String(g.header.id) && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-4 py-4">
                        <p className="font-semibold text-black mb-2">Invoice Details</p>
                        <div className="grid grid-cols-3 gap-2 text-sm text-gray-700 mb-4">
                          <div>
                            <span className="text-gray-500">Supplier Name</span>
                            <p className="font-medium text-black">{g.header.supplier_name}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Invoice Number</span>
                            <p className="font-medium text-black">{g.header.supplier_invoice_number}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Purchase Date</span>
                            <p className="font-medium text-black">{g.header.purchase_date || '—'}</p>
                          </div>
                        </div>
                        <table className="w-full border border-gray-300 text-sm">
                          <thead className="bg-[#e0e0e0] text-gray-700">
                            <tr>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-left">Product</th>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-center">Batch</th>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-center">Qty</th>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-right">Buying Price</th>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-right">Selling Price</th>
                              <th className="border-r border-gray-200 px-2 py-1.5 text-right">Tally Selling Price</th>
                              <th className="px-2 py-1.5 text-center">Expiry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.items.map((it, i) => (
                              <tr key={i} className="border-t border-gray-200">
                                <td className="border-r border-gray-200 px-2 py-1.5">{it.product_name}</td>
                                <td className="border-r border-gray-200 px-2 py-1.5 text-center">{it.batch || '—'}</td>
                                <td className="border-r border-gray-200 px-2 py-1.5 text-center">{it.unit ? `${it.quantity} ${it.unit}` : it.quantity}</td>
                                <td className="border-r border-gray-200 px-2 py-1.5 text-right">₹{it.buying_price}</td>
                                <td className="border-r border-gray-200 px-2 py-1.5 text-right">Rs.{it.selling_price}</td>
                                <td className="border-r border-gray-200 px-2 py-1.5 text-right">Rs.{it.tally_price}</td>
                                <td className="px-2 py-1.5 text-center">{it.expiry_date || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No purchases match the selected filters.
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
