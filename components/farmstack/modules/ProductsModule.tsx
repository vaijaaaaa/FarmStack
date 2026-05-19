import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useProducts } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

interface ProductsModuleProps {
  language: Language
}

export default function ProductsModule({ language }: ProductsModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { products, createProduct, refresh } = useProducts()
  const [showForm, setShowForm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [productName, setProductName] = useState('')
  const [hsnCode, setHsnCode] = useState('')
  const [gstRate, setGstRate] = useState('')
  const [productType, setProductType] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [tallyPrice, setTallyPrice] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [unit, setUnit] = useState('')

  const columns = [
    { key: 'name', label: 'Product Name' },
    { key: 'hsn_code', label: 'HSN Code' },
    { key: 'gst_rate', label: 'GST Rate' },
    { key: 'product_type', label: 'Type' },
    { key: 'selling_price', label: 'Selling Price' },
    { key: 'tally_price', label: 'Tally Price' },
    { key: 'expiry_date', label: 'Expiry Date' },
    { key: 'tally', label: 'Tally Status' },
  ]

  const tableData = products.map((product) => ({
    name: product.name,
    hsn_code: product.hsn_code,
    gst_rate: `${product.gst_rate || 0}%`,
    product_type: product.product_type,
    selling_price: `₹${product.selling_price || 0}`,
    tally_price: `₹${product.tally_price || 0}`,
    expiry_date: product.expiry_date || 'N/A',
    tally: (
      <TallyStatusCell
        type="product"
        invoiceId={product.id}
        status={product.tally_sync_status || 'not_synced'}
        response={product.tally_response}
        onSynced={refresh}
      />
    ),
  }))

  const handleSaveProduct = async () => {
    if (productName && hsnCode && gstRate && productType && sellingPrice && tallyPrice && expiryDate && unit) {
      try {
        setSaveError('')
        await createProduct({
          name: productName,
          hsn_code: hsnCode,
          unit,
          product_type: productType,
          gst_rate: parseInt(gstRate),
          selling_price: parseInt(sellingPrice),
          tally_price: parseInt(tallyPrice),
          expiry_date: expiryDate,
          maintain_batches: false,
          tally_stock_item_name: productName,
        })
        setShowForm(false)
        setProductName('')
        setHsnCode('')
        setGstRate('')
        setProductType('')
        setSellingPrice('')
        setTallyPrice('')
        setExpiryDate('')
        setUnit('')
      } catch (err) {
        setSaveError((err as Error).message)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('products')}</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-black text-white hover:bg-gray-900"
        >
          {showForm ? 'Cancel' : 'Add Product'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Enter product name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">HSN Code</label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="Enter HSN code"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">GST Rate</label>
              <input
                type="number"
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                placeholder="Enter GST rate"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">Type</label>
              <input
                type="text"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                placeholder="Enter product type"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Selling Price</label>
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Enter selling price"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">Tally Price</label>
              <input
                type="number"
                value={tallyPrice}
                onChange={(e) => setTallyPrice(e.target.value)}
                placeholder="Enter Tally price"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Enter unit"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex gap-3">
            <Button
              onClick={handleSaveProduct}
              className="bg-black text-white hover:bg-gray-900"
            >
              {t('save')}
            </Button>
            <Button
              onClick={() => setShowForm(false)}
              className="border border-gray-300 bg-white text-black hover:bg-gray-50"
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <DataTable columns={columns} data={tableData} />
      </div>
    </div>
  )
}
