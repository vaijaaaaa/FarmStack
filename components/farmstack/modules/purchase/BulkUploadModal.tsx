'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export interface ParsedPurchaseRow {
  productName: string
  quantity: string
  buyingPrice: string
  batch: string
  expiryDate: string
}

interface BulkUploadModalProps {
  isOpen: boolean
  onClose: () => void
  // Returns the valid rows (product matched + quantity > 0) to the parent, which
  // maps them onto the new-purchase form. Unit / Type / GST / Tally price come
  // from the product master there.
  onApply: (rows: ParsedPurchaseRow[]) => void
  products: { id: string; name: string }[]
}

const EXPECTED_HEADERS = ['product_name', 'quantity', 'buying_price', 'batch', 'expiry_date']

const TEMPLATE_CSV =
  'product_name,quantity,buying_price,batch,expiry_date\n' +
  'Urea,10,250,BATCH-001,2027-12-31\n' +
  'DAP,5,1200,BATCH-002,2027-06-30'

export default function BulkUploadModal({ isOpen, onClose, onApply, products }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedPurchaseRow[]>([])

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return
    setPreview([])
    setFile(null)
  }, [isOpen])

  const productNames = new Set(products.map((p) => (p.name || '').trim().toLowerCase()))

  // Returns a warning for a row, or '' if it is valid (and will be added).
  const rowWarning = (row: ParsedPurchaseRow): string => {
    if (!row.productName.trim()) return 'Product name is required'
    if (!productNames.has(row.productName.trim().toLowerCase()))
      return 'Product not found — will be skipped'
    if (!(Number(row.quantity) > 0)) return 'Quantity must be greater than 0'
    return ''
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }
    setFile(selectedFile)
    parseCSV(selectedFile)
  }

  const parseCSV = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split(/\r\n|\n/).filter((line) => line.trim())
      const headers = (lines[0] || '').split(',').map((h) => h.trim().toLowerCase())
      const headersMatch =
        headers.length === EXPECTED_HEADERS.length &&
        EXPECTED_HEADERS.every((h, i) => headers[i] === h)
      if (!headersMatch) {
        toast.error(
          `Invalid columns. This must be a purchase CSV with columns: ${EXPECTED_HEADERS.join(', ')}`,
        )
        setFile(null)
        setPreview([])
        return
      }
      const rows: ParsedPurchaseRow[] = lines.slice(1).map((line) => {
        const [productName, quantity, buyingPrice, batch, expiryDate] = line
          .split(',')
          .map((s) => (s || '').trim())
        return {
          productName: productName || '',
          quantity: quantity || '',
          buyingPrice: buyingPrice || '',
          batch: batch || '',
          expiryDate: expiryDate || '',
        }
      })
      setPreview(rows)
    }
    reader.readAsText(file)
  }

  const updateRow = (idx: number, field: keyof ParsedPurchaseRow, value: string) => {
    setPreview((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  const deleteRow = (idx: number) => {
    setPreview((rows) => rows.filter((_, i) => i !== idx))
  }

  const handleApply = () => {
    const valid = preview.filter((r) => !rowWarning(r))
    if (valid.length === 0) {
      toast.error('No valid rows to add. Check that product names match your products.')
      return
    }
    onApply(valid)
    const skipped = preview.length - valid.length
    toast.success(
      `${valid.length} item(s) added to purchase` + (skipped > 0 ? `, ${skipped} skipped` : ''),
    )
    onClose()
  }

  if (!isOpen) return null

  const inputClass =
    'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black'
  const skipCount = preview.filter((r) => rowWarning(r)).length

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-2xl font-bold text-black">Bulk Upload Purchase Items</h2>

        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
          download="purchase_items_template.csv"
          className="mb-4 inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-3 font-medium text-green-700 transition-colors hover:bg-green-200"
        >
          <Upload size={20} />
          Download CSV Template
        </a>

        <div className="mb-4 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="purchase-csv-upload"
          />
          <label htmlFor="purchase-csv-upload" className="cursor-pointer">
            <Upload className="mx-auto mb-2 text-gray-400" size={40} />
            <p className="text-gray-600">{file ? file.name : 'Click to upload CSV'}</p>
            <p className="text-sm text-gray-400">CSV file only</p>
          </label>
        </div>

        {preview.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 font-semibold text-black">
              Review &amp; edit rows
              {skipCount > 0 && (
                <span className="ml-2 text-sm font-normal text-red-600">
                  ({skipCount} row{skipCount > 1 ? 's' : ''} will be skipped)
                </span>
              )}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left">Product Name</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Quantity</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Buying Price</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Batch</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Expiry Date</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => {
                    const warning = rowWarning(row)
                    return (
                      <tr key={idx} className={warning ? 'bg-red-50' : ''}>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={row.productName}
                            onChange={(e) => updateRow(idx, 'productName', e.target.value)}
                          />
                          {warning && <p className="mt-0.5 text-xs text-red-600">{warning}</p>}
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={row.quantity}
                            onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={row.buyingPrice}
                            onChange={(e) => updateRow(idx, 'buyingPrice', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={row.batch}
                            onChange={(e) => updateRow(idx, 'batch', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={row.expiryDate}
                            onChange={(e) => updateRow(idx, 'expiryDate', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1 text-center">
                          <button
                            onClick={() => deleteRow(idx)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">{preview.length} row(s) parsed</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={preview.length === 0}
            className="bg-black text-white hover:bg-gray-900"
          >
            Add to Purchase
          </Button>
        </div>
      </div>
    </div>
  )
}
