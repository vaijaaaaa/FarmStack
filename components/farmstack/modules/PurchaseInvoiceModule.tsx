import { useState } from 'react'
import type { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useSuppliers, useProducts, useProductTypes, usePurchaseInvoices } from '@/hooks/useDatabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

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
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '', gstin: '', state: '' })
  const [newProduct, setNewProduct] = useState({
    name: '',
    hsn_code: '',
    unit: '',
    product_type: 'Purchase of Fertilizer',
    gst_rate: '',
    selling_price: '',
    tally_price: '',
    expiry_date: '',
  })
  const [addSupplierError, setAddSupplierError] = useState('')
  const [addProductError, setAddProductError] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayISO)
  const [tallyStatus, setTallyStatus] = useState(false)

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
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
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
  
  // Fallback product-type list for the "Add Product" modal dropdown.
  const productTypes = [
    { id: 'fertilizer', name: 'Purchase of Fertilizer', tax: 5 },
    { id: 'micronutrients', name: 'Purchase of Micronutrients', tax: 12 },
    { id: 'pesticide', name: 'Purchase of Pesticide', tax: 18 },
    { id: 'seeds', name: 'Purchase of Seeds', tax: 0 },
  ]
  const adminPurchaseTypes = adminProductTypes.filter((type) => type.name.toLowerCase().startsWith('purchase'))
  const availableProductTypes = [
    ...adminPurchaseTypes,
    ...productTypes.filter(
      (type) => !adminPurchaseTypes.some((adminType) => adminType.name.toLowerCase() === type.name.toLowerCase()),
    ),
  ]

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
      product_type: 'Purchase of Fertilizer',
      gst_rate: '',
      selling_price: '',
      tally_price: '',
      expiry_date: '',
    })
    setAddProductError('')
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
        selling_price: Number(newProduct.selling_price || 0),
        tally_price: Number(newProduct.tally_price || 0),
        expiry_date: newProduct.expiry_date,
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
      const normalizedTypeName = typeName.toLowerCase().startsWith('purchase')
        ? typeName
        : `Purchase of ${typeName}`
      const existingType = availableProductTypes.find(
        (type) => type.name.toLowerCase() === normalizedTypeName.toLowerCase(),
      )
      const typeToSelect =
        existingType ||
        (await createProductType({
          name: normalizedTypeName,
          description: 'Added from Purchase Invoice',
          tax: Number(newTypeGST) || 0,
        }))
      if (currentTypeIndex !== null) {
        handleUpdateItem(currentTypeIndex, 'productType', typeToSelect.name)
      }
      closeAddTypeModal()
    } catch (err) {
      toast.error(`Failed to add type: ${(err as Error).message}`)
    }
  }

  const handleSupplierSelect = (supplierId: string) => {
    if (supplierId === 'details') {
      setShowSupplierDetailsModal(true)
    } else if (supplierId === 'add') {
      setShowAddSupplierModal(true)
    } else if (supplierId === 'search') {
      setShowSearchSupplierDialog(true)
    } else {
      setSelectedSupplier(supplierId)
      setShowSupplierDropdown(false)
    }
  }

  const closeAddSupplierModal = () => {
    setShowAddSupplierModal(false)
    setNewSupplier({ name: '', phone: '', address: '', gstin: '', state: '' })
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
        gstin: newSupplier.gstin,
        state: newSupplier.state,
        tally_ledger_name: newSupplier.name.trim(),
      })
      setSelectedSupplier(created.id)
      setShowSupplierDropdown(false)
      closeAddSupplierModal()
    } catch (err) {
      setAddSupplierError((err as Error).message)
    }
  }

  const handleBulkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const csvStr = e.target?.result as string
      const lines = csvStr.split(/\r\n|\n/).filter(line => line.trim() !== '')
      if (lines.length <= 1) return
      
      // CSV columns: Product Name, Quantity, Buying Price, Batch, Expiry Date.
      // Unit / Type / GST / Tally price come from the product master; the
      // Buying Price falls back to the product's price when the CSV omits it.
      const newItems: PurchaseItem[] = lines.slice(1).map((line) => {
        const [productName, qty, price, batch, expDate] = line.split(',').map((s) => s?.trim())
        const product = mockProducts.find(
          (p) => p.name.toLowerCase() === productName?.toLowerCase(),
        )
        const productPrice = product?.selling_price != null ? String(product.selling_price) : ''
        return {
          ...emptyPurchaseItem,
          selectedProduct: product ? product.id : '',
          quantity: qty || '',
          batch: batch || '',
          buyingPrice: price || productPrice,
          sellingPrice: '',
          tallyPrice: product?.tally_price != null ? String(product.tally_price) : '',
          expiryDate: expDate || '',
          unit: product?.unit || '',
          productType: product?.product_type || '',
          gstRate: product?.gst_rate != null ? String(product.gst_rate) : '0',
        }
      })

      setPurchaseItems(newItems)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const columns = [
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'supplier_invoice_number', label: 'Invoice #' },
    { key: 'product_name', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'batch', label: 'Batch' },
    { key: 'buying_price', label: 'Buying' },
    { key: 'selling_price', label: 'Selling' },
    { key: 'tally_price', label: 'Tally' },
    { key: 'expiry_date', label: 'Expiry' },
    { key: 'type', label: 'Type' },
    { key: 'tax', label: 'Tax%' },
    { key: 'total_price', label: 'Total' },
    { key: 'tally', label: 'Status' },
  ]

  const tableData = invoices.map((invoice) => ({
    supplier_name: invoice.supplier_name,
    supplier_invoice_number: invoice.supplier_invoice_number,
    product_name: invoice.product_name,
    quantity: invoice.unit ? `${invoice.quantity} ${invoice.unit}` : invoice.quantity,
    batch: invoice.batch || '—',
    buying_price: `₹${invoice.buying_price}`,
    selling_price: `Rs.${invoice.selling_price}`,
    tally_price: `Rs.${invoice.tally_price}`,
    expiry_date: invoice.expiry_date,
    type: invoice.type,
    tax: `${invoice.tax}%`,
    total_price: `₹${invoice.total_price.toFixed(2)}`,
    tally: (
      <TallyStatusCell
        type="purchase"
        invoiceId={invoice.id}
        status={invoice.tally_sync_status || 'not_synced'}
        response={invoice.tally_response}
        onSynced={refresh}
      />
    ),
  }))

  const handleSavePurchase = async () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier')
      return
    }
    if (!supplierInvoiceNumber.trim()) {
      toast.error('Please enter supplier invoice number')
      return
    }
    if (purchaseItems.length === 0) {
      toast.error('Please add at least one product')
      return
    }

    // Every item must be valid before saving.
    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i]
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
      if (!item.batch.trim()) {
        toast.error(`${label}: Batch is required.`)
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
        toast.error(`${label}: Tally Price is required and must be 0 or more.`)
        return
      }
    }
    const supplier = mockSuppliers.find((s) => s.id === selectedSupplier)

    const items = purchaseItems.map((item) => {
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
        type: item.productType,
        tax: taxRate,
        total_price: lineTotal,
        batch: item.batch.trim(),
        unit: item.unit,
      }
    })

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
      setSupplierInvoiceNumber('')
      setPurchaseDate(todayISO())
      setTallyStatus(false)
      setPurchaseItems([{ ...emptyPurchaseItem }])
      if (tallyStatus && result?.tally) {
        if (result.tally.status === 'synced') {
          toast.success('Purchase saved and synced to Tally successfully!')
        } else {
          toast.error(`Tally sync ${result.tally.status} — purchase saved locally`, {
            description: result.tally.message,
          })
        }
      } else {
        toast.success('Purchase Invoice saved successfully!')
      }
    } catch (err) {
      toast.error(`Failed to save purchase: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('purchase_invoice')}</h2>
        <Button
          onClick={() => setShowNewInvoice(!showNewInvoice)}
          className="bg-black text-white hover:bg-gray-900"
        >
          {showNewInvoice ? 'Cancel' : 'Create Purchase'}
        </Button>
      </div>

      {showNewInvoice && (
        <div data-kbd-scope className="rounded-lg bg-white p-2 shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-black">New Purchase</h3>
              <div className="flex flex-col items-end gap-3">
                <Button onClick={handleAddRow} className="bg-blue-500 hover:bg-blue-600 text-white text-sm h-8 rounded-md px-4">
                  Add new Purchase
                </Button>
                <div className="flex flex-col items-end gap-1">
                  <label className="text-gray-700 font-medium text-xs">Purchase Date</label>
                  <input 
                    type="date" 
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-40 rounded-md border border-gray-400 px-3 py-1 text-center text-gray-700 bg-gray-50 focus:outline-none text-sm" 
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-center gap-12 mb-8">
              {/* Supplier Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                  className="w-64 rounded-md border-2 border-blue-500 px-4 py-2 text-left text-gray-700 bg-blue-50 hover:bg-blue-100 focus:outline-none font-medium"
                >
                  {selectedSupplier ? mockSuppliers.find(s => s.id === selectedSupplier)?.name : 'Supplier Name'}
                </button>
                {showSupplierDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-300 rounded-md z-10">
                    {mockSuppliers.map((supplier) => (
                      <button
                        key={supplier.id}
                        onClick={() => handleSupplierSelect(supplier.id)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                      >
                        {supplier.name}
                      </button>
                    ))}
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
                )}
              </div>

              <div className="flex flex-col gap-3">
                <input 
                  type="text" 
                  placeholder="Supplier Invoice Number" 
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  className="w-72 rounded-md border border-gray-400 px-4 py-2 text-center text-gray-700 bg-gray-50 focus:outline-none" 
                />
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
            </div>

            <div className="w-full overflow-x-auto border border-gray-300 rounded-lg">
              <table className="w-full text-sm text-center">
                <thead className="bg-[#e0e0e0] text-gray-800 border-b border-gray-300">
                  <tr>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Product Name</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Quantity <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Batch <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Buying Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Selling Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Tally Price <span className="text-red-500">*</span></th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Expiry Date</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Product Type</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Tax%</th>
                    <th className="py-3 px-2 border-r border-gray-300 font-semibold whitespace-nowrap">Total</th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map((item, index) => {
                    const itemTax = Number(item.gstRate || '0')
                    // Total includes GST: taxable (qty * buying price) + tax.
                    const itemTaxable =
                      Number(item.quantity || '0') * Number(item.buyingPrice || '0')
                    const itemTotal = itemTaxable + (itemTaxable * itemTax) / 100

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
                            type="text"
                            value={item.batch}
                            onChange={(e) => handleUpdateItem(index, 'batch', e.target.value)}
                            placeholder="Batch no."
                            className="w-24 text-center border border-gray-400 rounded bg-white text-gray-800 placeholder-gray-500 focus:outline-none p-1 text-xs"
                          />
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
                        <td className="p-2 border-r border-gray-300 align-middle text-xs">
                          <select
                            value={item.productType}
                            onChange={(e) => handleTypeSelectChange(index, e.target.value)}
                            className="w-32 bg-white border border-gray-400 rounded text-xs focus:outline-none text-gray-800 p-1"
                          >
                            <option value="">Select type</option>
                            {item.productType &&
                              !availableProductTypes.some((t) => t.name === item.productType) && (
                                <option value={item.productType}>{item.productType}</option>
                              )}
                            {availableProductTypes.map((t) => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                            <option value="add-type">+ Add Type</option>
                          </select>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <span className="font-medium text-gray-800">
                            {item.selectedProduct ? `${itemTax}%` : '—'}
                          </span>
                        </td>
                        <td className="p-2 border-r border-gray-300 align-middle">
                          <span className="text-black font-medium">{itemTotal > 0 ? itemTotal.toFixed(2) : '0.00'}</span>
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
                  className="bg-[#6b66fc] hover:bg-[#5b56dc] text-white font-medium px-8 py-2 rounded-lg text-lg min-w-30"
                >
                  Purchase
                </button>
              </div>
              <button 
                onClick={() => document.getElementById('bulk-upload-input')?.click()}
                className="bg-[#e4dd5f] hover:bg-[#d4cd4f] text-gray-900 font-medium px-6 py-2 rounded-lg text-lg"
              >
                Bulk Upload
              </button>
              <input 
                type="file" 
                id="bulk-upload-input" 
                className="hidden" 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                onChange={handleBulkUpload}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Type Modal */}
      {showAddTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-6 rounded-lg min-w-96 border border-gray-300">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-black">Add Purchase Type</h3>
              <button
                onClick={closeAddTypeModal}
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
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g., Purchase of Spices"
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">GST Percentage (%)</label>
                <input
                  type="number"
                  value={newTypeGST}
                  onChange={(e) => setNewTypeGST(e.target.value)}
                  placeholder="e.g., 5, 12, 18"
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  min="0"
                  max="100"
                />
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <button
                  onClick={closeAddTypeModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveType}
                  className="bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Add Type
                </button>
              </div>
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
          <div className="bg-white p-8 rounded-lg min-w-96 border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Add Supplier</h3>
              <button
                onClick={closeAddSupplierModal}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
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
                <textarea
                  placeholder="Address"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  rows={3}
                ></textarea>
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
                <label className="text-gray-700 font-medium mb-1 text-sm">State</label>
                <input
                  type="text"
                  placeholder="State"
                  value={newSupplier.state}
                  onChange={(e) => setNewSupplier({ ...newSupplier, state: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              {addSupplierError && (
                <p className="text-sm text-red-600">{addSupplierError}</p>
              )}
              <div className="flex justify-center gap-4 mt-4">
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
        </div>
      )}

      {/* Search Supplier Modal */}
      {showSearchSupplierDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg min-w-100 border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Search Supplier</h3>
              <button 
                onClick={() => setShowSearchSupplierDialog(false)}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-gray-700 font-medium text-sm">Name</label>
                  <select className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1">
                    <option>Starts With</option>
                    <option>Contains</option>
                    <option>Ends With</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-gray-700 font-medium text-sm">Search Term</label>
                  <input type="text" placeholder="Enter supplier name" className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1" />
                </div>
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium text-sm">State</label>
                <input type="text" placeholder="State" className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1" />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium text-sm">GSTIN</label>
                <input type="text" placeholder="GSTIN" className="w-full border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none mt-1" />
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={() => setShowSearchSupplierDialog(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowSearchSupplierDialog(false)}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white p-8 rounded-lg w-[480px] max-h-[90vh] overflow-auto border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-black">Add Product</h3>
              <button 
                onClick={closeAddProductModal}
                className="text-gray-500 hover:text-gray-800 font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Product Name</label>
                <input
                  type="text"
                  placeholder="Product Name"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">HSN Code</label>
                <input
                  type="text"
                  placeholder="HSN Code"
                  value={newProduct.hsn_code}
                  onChange={(e) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Unit</label>
                <input
                  type="text"
                  placeholder="Unit (kg, liter, etc.)"
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-gray-700 font-medium mb-1 text-sm">Product Type</label>
                <select
                  value={newProduct.product_type}
                  onChange={(e) => setNewProduct({ ...newProduct, product_type: e.target.value })}
                  className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                >
                  {availableProductTypes.map((type) => (
                    <option key={type.id} value={type.name}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex-1 flex flex-col">
                  <label className="text-gray-700 font-medium mb-1 text-sm">GST Rate</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newProduct.gst_rate}
                    onChange={(e) => setNewProduct({ ...newProduct, gst_rate: e.target.value })}
                    className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  />
                </div>
                <div className="flex-1 flex flex-col">
                  <label className="text-gray-700 font-medium mb-1 text-sm">Selling Price</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newProduct.selling_price}
                    onChange={(e) => setNewProduct({ ...newProduct, selling_price: e.target.value })}
                    className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex-1 flex flex-col">
                  <label className="text-gray-700 font-medium mb-1 text-sm">Tally Price</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newProduct.tally_price}
                    onChange={(e) => setNewProduct({ ...newProduct, tally_price: e.target.value })}
                    className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  />
                </div>
                <div className="flex-1 flex flex-col">
                  <label className="text-gray-700 font-medium mb-1 text-sm">Expiry Date</label>
                  <input
                    type="date"
                    value={newProduct.expiry_date}
                    onChange={(e) => setNewProduct({ ...newProduct, expiry_date: e.target.value })}
                    className="border border-gray-400 rounded p-2 bg-gray-50 focus:outline-none"
                  />
                </div>
              </div>
              {addProductError && (
                <p className="text-sm text-red-600">{addProductError}</p>
              )}
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={closeAddProductModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium px-6 py-2 rounded-lg"
                >
                  Close
                </button>
                <button
                  onClick={handleAddProduct}
                  className="bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-2 rounded-lg"
                >
                  Add Product
                </button>
              </div>
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
          <h3 className="text-lg font-bold text-black mb-4">Purchase History</h3>
          <DataTable columns={columns} data={tableData} dense />
        </div>
      )}
    </div>
  )
}
