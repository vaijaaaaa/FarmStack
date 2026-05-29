'use client'

import { useEffect, useState } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { productApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface BulkUploadModalProps {
  language: Language
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedProduct {
  name: string
  hsn_code: string
  unit: string
  gst_rate: string
}

export default function BulkUploadModal({ language, isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedProduct[]>([])
  const [uploading, setUploading] = useState(false)
  const [existing, setExisting] = useState<Product[]>([])

  // Load existing products (for duplicate checks) whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return
    setPreview([])
    setFile(null)
    productApi
      .list()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [isOpen])

  const existingNames = new Set(
    existing.map((p) => (p.name || '').trim().toLowerCase()).filter(Boolean),
  )

  // Products are unique by name — flag any name that already exists or repeats.
  const duplicateReason = (row: ParsedProduct, idx: number): string => {
    const name = row.name.trim().toLowerCase()
    if (!name) return ''
    if (existingNames.has(name)) return 'Product name already exists'
    for (let i = 0; i < idx; i++) {
      if (preview[i].name.trim().toLowerCase() === name) return 'Duplicate name in file'
    }
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
      const lines = text.split('\n').filter((line) => line.trim())
      const dataLines = lines.slice(1)
      const parsed: ParsedProduct[] = dataLines.map((line) => {
        const [name, hsn_code, unit, gst_rate] = line.split(',').map((s) => s.trim())
        return {
          name: name || '',
          hsn_code: hsn_code || '',
          unit: unit || '',
          gst_rate: gst_rate || '',
        }
      })
      setPreview(parsed)
    }
    reader.readAsText(file)
  }

  const updateRow = (idx: number, field: keyof ParsedProduct, value: string) => {
    setPreview((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  const deleteRow = (idx: number) => {
    setPreview((rows) => rows.filter((_, i) => i !== idx))
  }

  const handleUpload = async () => {
    if (preview.length === 0) {
      toast.error('No data to upload')
      return
    }

    setUploading(true)
    let successCount = 0
    let failCount = 0
    let skipped = 0

    for (let i = 0; i < preview.length; i++) {
      const product = preview[i]
      if (!product.name.trim()) {
        skipped++
        continue
      }
      if (duplicateReason(product, i)) {
        skipped++
        continue
      }
      try {
        await productApi.create({
          name: product.name.trim(),
          hsn_code: product.hsn_code.trim(),
          unit: product.unit.trim(),
          gst_rate: parseFloat(product.gst_rate) || 0,
        })
        successCount++
      } catch {
        failCount++
      }
    }

    setUploading(false)
    toast.success(
      `${successCount} products uploaded` +
        (skipped > 0 ? `, ${skipped} duplicate/empty skipped` : '') +
        (failCount > 0 ? `, ${failCount} failed` : ''),
    )
    onSuccess()
  }

  if (!isOpen) return null

  const inputClass =
    'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black'
  const duplicateCount = preview.filter((r, i) => duplicateReason(r, i)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-2xl font-bold text-black">Bulk Upload Products</h2>

        <a
          href="data:text/csv;charset=utf-8,name%2Chsn_code%2Cunit%2Cgst_rate%0AUrea%2C31021000%2CBags%2C5%0ASeeds%2C12099110%2CKg%2C0"
          download="products_template.csv"
          className="mb-4 inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-3 font-medium text-green-700 transition-colors hover:bg-green-200"
        >
          <Upload size={20} />
          Download CSV Template
        </a>

        <div className="mb-4 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Upload className="mx-auto mb-2 text-gray-400" size={40} />
            <p className="text-gray-600">{file ? file.name : 'Click to upload CSV'}</p>
            <p className="text-sm text-gray-400">CSV file only</p>
          </label>
        </div>

        {preview.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 font-semibold text-black">
              Review &amp; edit rows
              {duplicateCount > 0 && (
                <span className="ml-2 text-sm font-normal text-red-600">
                  ({duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} will be skipped)
                </span>
              )}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left">Name</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">HSN Code</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Unit</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">GST Rate</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((product, idx) => {
                    const reason = duplicateReason(product, idx)
                    return (
                      <tr key={idx} className={reason ? 'bg-red-50' : ''}>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={product.name}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          />
                          {reason && <p className="mt-0.5 text-xs text-red-600">{reason}</p>}
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={product.hsn_code}
                            onChange={(e) => updateRow(idx, 'hsn_code', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={product.unit}
                            onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={product.gst_rate}
                            onChange={(e) => updateRow(idx, 'gst_rate', e.target.value)}
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
            <p className="mt-2 text-xs text-gray-500">{preview.length} row(s) ready to upload</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || preview.length === 0}
            className="bg-black text-white hover:bg-gray-900"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  )
}
