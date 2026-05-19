'use client'

import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { supplierApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'

interface BulkUploadModalProps {
  language: Language
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const CSV_TEMPLATE = `supplier_name,address,phone,state,country,gstin,place_of_supply
ABC Supplies,123 Main St,9876543210,Karnataka,India,27AABCT1234H1Z0,Karnataka
XYZ Traders,456 Market Rd,9876543211,Maharashtra,India,27AABCD5678H1Z0,Maharashtra
Farm Goods,789 Village Lane,9876543212,Punjab,India,27AABCE9012H1Z0,Punjab`

interface SupplierRow {
  supplier_name?: string
  address?: string
  phone?: string
  state?: string
  country?: string
  gstin?: string
  place_of_supply?: string
}

// Simple CSV parser
function parseCSV(text: string): SupplierRow[] {
  const lines = text.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: SupplierRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: SupplierRow = {}

    headers.forEach((header, idx) => {
      if (values[idx]) {
        row[header as keyof SupplierRow] = values[idx]
      }
    })

    if (row.supplier_name) {
      rows.push(row)
    }
  }

  return rows
}

export default function BulkUploadModal({
  language,
  isOpen,
  onClose,
  onSuccess,
}: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)

  const downloadTemplate = () => {
    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(CSV_TEMPLATE))
    element.setAttribute('download', 'suppliers_template.csv')
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    toast.success('Template downloaded')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Check file type
    const isCSV = selectedFile.type === 'text/csv'
    const isExcel = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(selectedFile.type)

    if (!isCSV && !isExcel && !selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setFile(selectedFile)

    // Parse CSV
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const rows = parseCSV(text)
        if (rows.length === 0) {
          toast.error('No valid data found in file')
          return
        }
        setPreview(rows.slice(0, 10))
        setUploadResult(null)
      } catch (err) {
        toast.error('Error parsing CSV file')
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file')
      return
    }

    try {
      setLoading(true)

      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string
          const rows = parseCSV(text)

          // Transform data
          const suppliers = rows.map((row) => ({
            name: row.supplier_name || '',
            address: row.address || '',
            phone: row.phone || '',
            state: row.state || '',
            country: row.country || '',
            gstin: row.gstin || '',
            place_of_supply: row.place_of_supply || '',
          }))

          const result = await supplierApi.bulkUpload(suppliers)
          setUploadResult(result)

          if (result.success > 0) {
            toast.success(`Successfully added ${result.success} supplier(s)`)
          }
          if (result.failed > 0) {
            toast.error(`${result.failed} supplier(s) failed to add`)
          }
        } catch (err) {
          toast.error((err as Error).message)
        } finally {
          setLoading(false)
        }
      }
      reader.readAsText(file)
    } catch (err) {
      toast.error((err as Error).message)
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setPreview([])
    setUploadResult(null)
    onClose()
  }

  const handleSuccess = () => {
    onSuccess()
    handleClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-black">Bulk Upload Suppliers</h2>
        </div>

        <div className="p-6 space-y-6">
          {!uploadResult ? (
            <>
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>How to use:</strong> Download the template, fill in your supplier data (CSV format), and upload the file.
                </p>
              </div>

              {/* Download Template */}
              <div>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors"
                >
                  <Download size={16} />
                  Download CSV Template
                </button>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  id="file-input"
                  onChange={handleFileSelect}
                  accept=".csv"
                  className="hidden"
                />
                <label
                  htmlFor="file-input"
                  className="cursor-pointer inline-flex flex-col items-center gap-2"
                >
                  <Upload size={32} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {file ? file.name : 'Click to upload or drag file here'}
                  </span>
                  <span className="text-xs text-gray-500">CSV file only</span>
                </label>
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Preview (first 10 rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700">Name</th>
                          <th className="px-3 py-2 text-left text-gray-700">Phone</th>
                          <th className="px-3 py-2 text-left text-gray-700">GSTIN</th>
                          <th className="px-3 py-2 text-left text-gray-700">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, idx) => (
                          <tr key={idx} className="border-t border-gray-200 hover:bg-gray-50">
                            <td className="px-3 py-2">{row.supplier_name || '—'}</td>
                            <td className="px-3 py-2">{row.phone || '—'}</td>
                            <td className="px-3 py-2">{row.gstin || '—'}</td>
                            <td className="px-3 py-2">{row.state || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500">{preview.length} rows ready to upload</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <Button
                  onClick={handleClose}
                  className="bg-gray-300 text-gray-800 hover:bg-gray-400"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!file || loading}
                  className="bg-black text-white hover:bg-gray-900 disabled:opacity-50"
                >
                  {loading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Upload Results */}
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Success:</strong> {uploadResult.success} supplier(s) added
                  </p>
                </div>

                {uploadResult.failed > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-800 mb-2">
                      <strong>Failed:</strong> {uploadResult.failed} supplier(s)
                    </p>
                    {uploadResult.errors.length > 0 && (
                      <div className="max-h-40 overflow-y-auto">
                        {uploadResult.errors.map((err: any, idx: number) => (
                          <div key={idx} className="text-xs text-red-700 mb-1">
                            Row {err.row} ({err.name}): {err.error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Result Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <Button
                  onClick={handleClose}
                  className="bg-gray-300 text-gray-800 hover:bg-gray-400"
                >
                  Close
                </Button>
                <Button
                  onClick={handleSuccess}
                  className="bg-black text-white hover:bg-gray-900"
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
