'use client'

import { useEffect, useState } from 'react'
import { Language, Customer } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { customerApi } from '@/src/services/api'
import { Button } from '@/components/ui/button'
import { Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface BulkUploadModalProps {
  language: Language
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedCustomer {
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

export default function BulkUploadModal({ language, isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedCustomer[]>([])
  const [uploading, setUploading] = useState(false)
  const [existing, setExisting] = useState<Customer[]>([])

  // Load existing customers (for duplicate checks) whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return
    setPreview([])
    setFile(null)
    customerApi
      .list()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [isOpen])

  const existingPhones = new Set(
    existing.map((c) => (c.phone || '').trim()).filter(Boolean),
  )
  const existingGstins = new Set(
    existing.map((c) => (c.gstin || '').trim().toLowerCase()).filter(Boolean),
  )

  const duplicateReason = (row: ParsedCustomer, idx: number): string => {
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

  const EXPECTED_HEADERS = [
    'name',
    'phone',
    'aadhar_card',
    'address',
    'state',
    'country',
    'gstin',
    'acres',
    'loyalty',
    'referral',
    'display_number',
  ]

  const parseCSV = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter((line) => line.trim())
      const headers = (lines[0] || '').split(',').map((h) => h.trim().toLowerCase())
      const headersMatch =
        headers.length === EXPECTED_HEADERS.length &&
        EXPECTED_HEADERS.every((h, i) => headers[i] === h)
      if (!headersMatch) {
        toast.error(
          `Invalid columns. This must be a customer CSV with columns: ${EXPECTED_HEADERS.join(', ')}`,
        )
        setFile(null)
        setPreview([])
        return
      }
      const dataLines = lines.slice(1)
      const parsed: ParsedCustomer[] = dataLines.map((line) => {
        const [name, phone, aadhar_card, address, state, country, gstin, acres, loyalty, referral, display_number] =
          line.split(',').map((s) => s.trim())
        return {
          name: name || '',
          phone: phone || '',
          aadhar_card: aadhar_card || '',
          address: address || '',
          state: state || '',
          country: country || '',
          gstin: gstin || '',
          acres: acres || '',
          loyalty: loyalty || '',
          referral: referral || '',
          display_number: display_number || '',
        }
      })
      setPreview(parsed)
    }
    reader.readAsText(file)
  }

  const updateRow = (idx: number, field: keyof ParsedCustomer, value: string) => {
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
      const customer = preview[i]
      if (!customer.name.trim()) {
        skipped++
        continue
      }
      if (duplicateReason(customer, i)) {
        skipped++
        continue
      }
      try {
        await customerApi.create({
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          aadhar_card: customer.aadhar_card.trim(),
          address: customer.address.trim(),
          state: customer.state.trim(),
          country: customer.country.trim(),
          gstin: customer.gstin.trim(),
          acres: customer.acres.trim(),
          loyalty: customer.loyalty.trim(),
          referral: customer.referral.trim(),
          display_number: customer.display_number.trim(),
          tally_ledger_name: customer.name.trim(),
        })
        successCount++
      } catch {
        failCount++
      }
    }

    setUploading(false)
    toast.success(
      `${successCount} customers uploaded` +
        (skipped > 0 ? `, ${skipped} duplicate/empty skipped` : '') +
        (failCount > 0 ? `, ${failCount} failed` : ''),
    )
    // Leave the modal only on a real success; keep it open (with the data) on
    // total failure so the user can fix and retry.
    if (successCount > 0) {
      onSuccess()
      onClose()
    }
  }

  if (!isOpen) return null

  const inputClass =
    'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black'
  const duplicateCount = preview.filter((r, i) => duplicateReason(r, i)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-2xl font-bold text-black">Bulk Upload Customers</h2>

        <a
          href="data:text/csv;charset=utf-8,name%2Cphone%2Caadhar_card%2Caddress%2Cstate%2Ccountry%2Cgstin%2Cacres%2Cloyalty%2Creferral%2Cdisplay_number%0AJohn%20Doe%2C9876543210%2C123456789012%2CBangalore%2CKarnataka%2CIndia%2C27AABCT1234H1Z0%2C5%2CGold%2CRamesh%2CC001%0AJane%20Smith%2C9876543211%2C123456789013%2CPune%2CMaharashtra%2CIndia%2C27AABCD5678H1Z0%2C3%2CSilver%2CSuresh%2CC002"
          download="customers_template.csv"
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
                    <th className="border border-gray-200 px-3 py-2 text-left">Aadhar Card</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Address (City)</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">State</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Country</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">GSTIN</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Acres</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Loyalty</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Referral</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Display Number</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((customer, idx) => {
                    const reason = duplicateReason(customer, idx)
                    return (
                      <tr key={idx} className={reason ? 'bg-red-50' : ''}>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.name}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          />
                          {reason && <p className="mt-0.5 text-xs text-red-600">{reason}</p>}
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.phone}
                            onChange={(e) => updateRow(idx, 'phone', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.aadhar_card}
                            onChange={(e) => updateRow(idx, 'aadhar_card', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.address}
                            onChange={(e) => updateRow(idx, 'address', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.state}
                            onChange={(e) => updateRow(idx, 'state', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.country}
                            onChange={(e) => updateRow(idx, 'country', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.gstin}
                            onChange={(e) => updateRow(idx, 'gstin', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.acres}
                            onChange={(e) => updateRow(idx, 'acres', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.loyalty}
                            onChange={(e) => updateRow(idx, 'loyalty', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.referral}
                            onChange={(e) => updateRow(idx, 'referral', e.target.value)}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-1">
                          <input
                            className={inputClass}
                            value={customer.display_number}
                            onChange={(e) => updateRow(idx, 'display_number', e.target.value)}
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
