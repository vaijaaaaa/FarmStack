'use client'

import { useEffect, useState } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { productApi } from '@/src/services/api'
import { useProductTypes } from '@/hooks/useDatabase'
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
  product_type: string
  unit: string
  gst_rate: string
  gst_supply_type: string
  selling_price: string
  tally_price: string
  expiry_date: string
  is_seed: boolean
}

// Dropdown option sources — the SAME values the Product Add/Edit form uses.
const DEFAULT_UNITS = ['Kg', 'Nos', 'Bags', 'Litre']
const DEFAULT_GST_RATES = ['18', '5', '0']
const GST_SUPPLY_OPTIONS = [
  { value: 'local', label: 'Local (CGST + SGST)' },
  { value: 'interstate', label: 'Interstate (IGST)' },
]

// Map a free-text CSV GST-supply value to the canonical option value so e.g.
// "Interstate" / "INTERSTATE" all become "interstate" (the value the app uses).
const normalizeSupply = (raw: string): string => {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return 'local'
  if (v === 'local' || v === 'interstate') return v
  return raw.trim() // unrecognised → kept so it can be flagged + re-selected
}

// CSV columns mirror the product form fields (is_seed is set via the UI, not CSV).
const TEMPLATE_CSV =
  'name,hsn_code,product_type,unit,gst_rate,gst_supply_type,selling_price,tally_price,expiry_date\n' +
  'Urea Fertilizer,31021000,Fertilizers,Bags,5,local,300,300,\n' +
  'Hybrid Maize Seed,12099110,Seeds,Bags,5,local,1200,1200,2027-06-30'

export default function BulkUploadModal({ language, isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const { productTypes } = useProductTypes()
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

  // Match a CSV product type / unit to a known option regardless of casing.
  const canonicalType = (raw: string): string => {
    const v = (raw || '').trim()
    return productTypes.find((p) => p.name.toLowerCase() === v.toLowerCase())?.name || v
  }
  const canonicalUnit = (raw: string): string => {
    const v = (raw || '').trim()
    return DEFAULT_UNITS.find((u) => u.toLowerCase() === v.toLowerCase()) || v
  }

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

  // Dropdown-validation: the review grid is the source of truth, so every
  // dropdown value must be a recognised option before upload is allowed.
  const dropdownError = (row: ParsedProduct): string => {
    if (!row.product_type.trim()) return 'Select a Product Type'
    if (!row.unit.trim()) return 'Select a Unit'
    if (row.gst_supply_type !== 'local' && row.gst_supply_type !== 'interstate')
      return 'Select a GST Supply Type'
    if (row.gst_rate.trim() && Number.isNaN(Number(row.gst_rate))) return 'GST Rate must be a number'
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
      const dataLines = lines.slice(1)
      const parsed: ParsedProduct[] = dataLines.map((line) => {
        const [
          name,
          hsn_code,
          product_type,
          unit,
          gst_rate,
          gst_supply_type,
          selling_price,
          tally_price,
          expiry_date,
        ] = line.split(',').map((s) => (s || '').trim())
        return {
          name: name || '',
          hsn_code: hsn_code || '',
          // Normalise to the form's canonical option values up front.
          product_type: canonicalType(product_type || ''),
          unit: canonicalUnit(unit || ''),
          gst_rate: gst_rate || '',
          gst_supply_type: normalizeSupply(gst_supply_type || ''),
          selling_price: selling_price || '',
          tally_price: tally_price || '',
          expiry_date: expiry_date || '',
          is_seed: false,
        }
      })
      setPreview(parsed)
    }
    reader.readAsText(file)
  }

  const updateRow = (idx: number, field: keyof ParsedProduct, value: string) => {
    setPreview((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  const toggleSeed = (idx: number) => {
    setPreview((rows) => rows.map((r, i) => (i === idx ? { ...r, is_seed: !r.is_seed } : r)))
  }

  const setAllSeed = (value: boolean) => {
    setPreview((rows) => rows.map((r) => ({ ...r, is_seed: value })))
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
        // The edited review-row values (dropdown selections) are what get saved.
        await productApi.create({
          name: product.name.trim(),
          hsn_code: product.hsn_code.trim(),
          product_type: product.product_type.trim(),
          unit: product.unit.trim(),
          gst_rate: parseFloat(product.gst_rate) || 0,
          gst_supply_type: product.gst_supply_type.trim() || 'local',
          selling_price: parseFloat(product.selling_price) || 0,
          tally_price: parseFloat(product.tally_price) || 0,
          expiry_date: product.expiry_date.trim(),
          is_seed: product.is_seed,
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
    // Leave the modal only on a real success; keep it open (with the data) on
    // total failure so the user can fix and retry.
    if (successCount > 0) {
      onSuccess()
      onClose()
    }
  }

  if (!isOpen) return null

  const inputClass =
    'w-full min-w-[90px] rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black'
  const selectClass = inputClass + ' bg-white'
  const duplicateCount = preview.filter((r, i) => duplicateReason(r, i)).length
  const seedCount = preview.filter((p) => p.is_seed).length
  const invalidCount = preview.filter((r) => dropdownError(r) !== '').length
  const hasBlockingErrors = invalidCount > 0

  // Render a dropdown for select-based fields (same options/values as the form),
  // a plain input for the rest. The CSV value is preserved as an option when it
  // isn't recognised, so nothing is silently lost.
  const fieldCell = (product: ParsedProduct, idx: number, field: keyof ParsedProduct) => {
    if (field === 'product_type') {
      const known = productTypes.some((p) => p.name === product.product_type)
      return (
        <select className={selectClass} value={product.product_type} onChange={(e) => updateRow(idx, field, e.target.value)}>
          <option value="">Select type</option>
          {!known && product.product_type && (
            <option value={product.product_type}>{product.product_type} (unknown)</option>
          )}
          {productTypes.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      )
    }
    if (field === 'unit') {
      const units =
        !product.unit || DEFAULT_UNITS.includes(product.unit) ? DEFAULT_UNITS : [...DEFAULT_UNITS, product.unit]
      return (
        <select className={selectClass} value={product.unit} onChange={(e) => updateRow(idx, field, e.target.value)}>
          <option value="">Select unit</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      )
    }
    if (field === 'gst_rate') {
      const rates =
        !product.gst_rate || DEFAULT_GST_RATES.includes(product.gst_rate)
          ? DEFAULT_GST_RATES
          : [...DEFAULT_GST_RATES, product.gst_rate]
      return (
        <select className={selectClass} value={product.gst_rate} onChange={(e) => updateRow(idx, field, e.target.value)}>
          <option value="">Select rate</option>
          {rates.map((r) => (
            <option key={r} value={r}>
              {r === '0' ? 'Exempted' : `${r}%`}
            </option>
          ))}
        </select>
      )
    }
    if (field === 'gst_supply_type') {
      const valid = GST_SUPPLY_OPTIONS.some((o) => o.value === product.gst_supply_type)
      return (
        <select
          className={selectClass}
          value={valid ? product.gst_supply_type : ''}
          onChange={(e) => updateRow(idx, field, e.target.value)}
        >
          <option value="">Select supply</option>
          {GST_SUPPLY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    return (
      <input
        className={inputClass}
        value={product[field] as string}
        onChange={(e) => updateRow(idx, field, e.target.value)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-4 text-2xl font-bold text-black">Bulk Upload Products</h2>

        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-black">
                Review &amp; edit rows
                {duplicateCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-red-600">
                    ({duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} will be skipped)
                  </span>
                )}
              </h3>
              {/* Seed selection — unchecked by default, with check/uncheck all */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">Mark as Seed:</span>
                <button
                  type="button"
                  onClick={() => setAllSeed(true)}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
                >
                  Check All
                </button>
                <button
                  type="button"
                  onClick={() => setAllSeed(false)}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
                >
                  Uncheck All
                </button>
                <span className="text-gray-500">
                  {seedCount} of {preview.length} selected
                </span>
              </div>
            </div>
            {hasBlockingErrors && (
              <p className="mb-2 text-sm font-medium text-red-600">
                {invalidCount} row{invalidCount > 1 ? 's have' : ' has'} an invalid dropdown value —
                pick a valid option before uploading.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-2 text-left">Name</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">HSN Code</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Product Type</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Unit</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">GST Rate</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">GST Supply</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Selling Price</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Tally Price</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Expiry Date</th>
                    <th className="border border-gray-200 px-2 py-2 text-center">Seed</th>
                    <th className="border border-gray-200 px-2 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((product, idx) => {
                    const reason = duplicateReason(product, idx)
                    const dErr = dropdownError(product)
                    const fields: (keyof ParsedProduct)[] = [
                      'name',
                      'hsn_code',
                      'product_type',
                      'unit',
                      'gst_rate',
                      'gst_supply_type',
                      'selling_price',
                      'tally_price',
                      'expiry_date',
                    ]
                    return (
                      <tr key={idx} className={reason || dErr ? 'bg-red-50' : ''}>
                        {fields.map((field) => (
                          <td key={field} className="border border-gray-200 px-1 py-1">
                            {fieldCell(product, idx, field)}
                            {field === 'name' && (reason || dErr) && (
                              <p className="mt-0.5 text-xs text-red-600">{reason || dErr}</p>
                            )}
                          </td>
                        ))}
                        <td className="border border-gray-200 px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={product.is_seed}
                            onChange={() => toggleSeed(idx)}
                            className="h-4 w-4 accent-black"
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
            disabled={uploading || preview.length === 0 || hasBlockingErrors}
            className="bg-black text-white hover:bg-gray-900"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  )
}
