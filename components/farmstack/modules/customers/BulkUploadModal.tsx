'use client'

import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { customerApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'

interface BulkUploadModalProps {
  language: Language
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const CSV_TEMPLATE = `name,address,phone,state,country,gstin,acres,loyalty,referral,display_number
ABC Farm,123 Main St,9876543210,Karnataka,India,27AABCT1234H1Z0,10,Gold,Referral 1,1001
Green Growers,456 Village Rd,9876543211,Tamil Nadu,India,33AABCD5678H1Z0,20,Silver,Referral 2,1002`

interface CustomerRow {
  name?: string
  address?: string
  phone?: string
  state?: string
  country?: string
  gstin?: string
  acres?: string
  loyalty?: string
  referral?: string
  display_number?: string
}

function parseCSV(text: string): CustomerRow[] {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: CustomerRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: CustomerRow = {}

    headers.forEach((header, idx) => {
      if (values[idx]) {
        row[header as keyof CustomerRow] = values[idx]
      }
    })

    if (row.name) {
      rows.push(row)
    }
  }

  return rows
}

export default function BulkUploadModal({ language, isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)

  const downloadTemplate = () => {
    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(CSV_TEMPLATE))
    element.setAttribute('download', 'customers_template.csv')
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    toast.success('Template downloaded')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setFile(selectedFile)
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
      } catch {
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
          const customers = rows.map((row) => ({
            name: row.name || '',
            address: row.address || '',
            phone: row.phone || '',
            state: row.state || '',
            country: row.country || '',
            gstin: row.gstin || '',
            acres: row.acres || '',
            loyalty: row.loyalty || '',
            referral: row.referral || '',
            display_number: row.display_number || '',
          }))

          const result = await customerApi.bulkUpload(customers)
          setUploadResult(result)

          if (result.success > 0) toast.success(`Successfully added ${result.success} customer(s)`)
          if (result.failed > 0) toast.error(`${result.failed} customer(s) failed to add`)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white">
        <div className="sticky top-0 border-b border-gray-200 bg-white p-6">
          <h2 className="text-xl font-bold text-black">Bulk Upload Customers</h2>
        </div>

        <div className="space-y-6 p-6">
          {!uploadResult ? (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  <strong>How to use:</strong> Download the template, fill in customer data in CSV format, and upload the file.
                </p>
              </div>

              <div>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 rounded-md bg-green-100 px-4 py-2 text-green-700 transition-colors hover:bg-green-200"
                >
                  <Download size={16} />
                  Download CSV Template
                </button>
              </div>

              <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-gray-400">
                <input
                  type="file"
                  id="customer-file-input"
                  onChange={handleFileSelect}
                  accept=".csv"
                  className="hidden"
                />
                <label htmlFor="customer-file-input" className="inline-flex cursor-pointer flex-col items-center gap-2">
                  <Upload size={32} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {file ? file.name : 'Click to upload or drag file here'}
                  </span>
                  <span className="text-xs text-gray-500">CSV file only</span>
                </label>
              </div>

              {preview.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-700">Preview (first 10 rows)</h3>
                  <div className="overflow-x-auto rounded-md border border-gray-200">
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
                            <td className="px-3 py-2">{row.name || '—'}</td>
                            <td className="px-3 py-2">{row.phone || '—'}</td>
                            <td className="px-3 py-2">{row.gstin || '—'}</td>
                            <td className="px-3 py-2">{row.state || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3 pt-4 border-t border-gray-200">
                <Button onClick={handleClose} className="bg-gray-300 text-gray-800 hover:bg-gray-400">
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={!file || loading} className="bg-black text-white hover:bg-gray-900 disabled:opacity-50">
                  {loading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-sm text-green-800"><strong>Success:</strong> {uploadResult.success} customer(s) added</p>
                </div>
                {uploadResult.failed > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="mb-2 text-sm text-red-800"><strong>Failed:</strong> {uploadResult.failed} customer(s)</p>
                    <div className="max-h-40 overflow-y-auto">
                      {uploadResult.errors.map((err: any, idx: number) => (
                        <div key={idx} className="mb-1 text-xs text-red-700">
                          Row {err.row} ({err.name}): {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-3 pt-4 border-t border-gray-200">
                <Button onClick={handleClose} className="bg-gray-300 text-gray-800 hover:bg-gray-400">
                  Close
                </Button>
                <Button onClick={handleSuccess} className="bg-black text-white hover:bg-gray-900">
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