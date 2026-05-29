'use client'

import { useEffect, useState } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface BulkUploadModalProps {
  language: Language
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedSupplier {
  name: string
  phone: string
  gstin: string
  state: string
}

export default function BulkUploadModal({ language, isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedSupplier[]>([])
  const [uploading, setUploading] = useState(false)
  const [existing, setExisting] = useState<Supplier[]>([])

  // Load existing suppliers (for duplicate checks) whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return
    setPreview([])
    setFile(null)
    supplierApi
      .list()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [isOpen])

  const existingPhones = new Set(
    existing.map((s) => (s.phone || '').trim()).filter(Boolean),
  )
  const existingGstins = new Set(
    existing.map((s) => (s.gstin || '').trim().toLowerCase()).filter(Boolean),
  )

  // Returns a duplicate reason for a row, or '' if it is unique.
  const duplicateReason = (row: ParsedSupplier, idx: number): string => {
    const phone = row.phone.trim()
    const gstin = row.gstin.trim().toLowerCase()
    if (phone && existingPhones.has(phone)) return 'Phone already exists'
    if (gstin && existingGstins.has(gstin)) return 'GSTIN already exists'
    for (let i = 0; i < idx; i++) {
      if (phone && preview[i].phone.trim() === phone) return 'Duplicate phone in file'
      if (gstin && preview[i].gstin.trim().toLowerCase() === gstin) return 'Duplicate GSTIN in file'
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
      const parsed: ParsedSupplier[] = dataLines.map((line) => {
        const [name, phone, gstin, state] = line.split(',').map((s) => s.trim())
        return { name: name || '', phone: phone || '', gstin: gstin || '', state: state || '' }
      })
      setPreview(parsed)
    }
    reader.readAsText(file)
  }

  const updateRow = (idx: number, field: keyof ParsedSupplier, value: string) => {
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
      const supplier = preview[i]
      if (!supplier.name.trim()) {
        skipped++
        continue
      }
      if (duplicateReason(supplier, i)) {
        skipped++
        continue
      }
      try {
        await supplierApi.create({
          name: supplier.name.trim(),
          phone: supplier.phone.trim(),
          gstin: supplier.gstin.trim(),
          state: supplier.state.trim(),
          tally_ledger_name: supplier.name.trim(),
        })
        successCount++
      } catch {
        failCount++
      }
    }

    setUploading(false)
    toast.success(
      `${successCount} suppliers uploaded` +
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
        <h2 className="mb-4 text-2xl font-bold text-black">Bulk Upload Suppliers</h2>

        <a
          href="data:text/csv;charset=utf-8,name%2Cphone%2Cgstin%2Cstate%0AABC%20Supplies%2C9876543210%2C27AABCT1234H1Z0%2CKarnataka%0AXYZ%20Traders%2C9876543211%2C27AABCD5678H1Z0%2CMaharashtra%0AFarm%20Goods%2C9876543212%2C27AABCE9012H1Z0%2CPunjab"
          download="suppliers_template.csv"
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
                    <th className="border border-gray-200 px-3 py-2 text-left">Phone</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">GSTIN</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">State</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((supplier, idx) => {
                    const reason = duplicateReason(supplier, idx)
                    return (
                      <tr key={idx} className={reason ? 'bg-red-50' : ''}>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={supplier.name}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          />
                          {reason && <p className="mt-0.5 text-xs text-red-600">{reason}</p>}
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={supplier.phone}
                            onChange={(e) => updateRow(idx, 'phone', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={supplier.gstin}
                            onChange={(e) => updateRow(idx, 'gstin', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={supplier.state}
                            onChange={(e) => updateRow(idx, 'state', e.target.value)}
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
