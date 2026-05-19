import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useSuppliers } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

interface SuppliersModuleProps {
  language: Language
}

export default function SuppliersModule({ language }: SuppliersModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { suppliers, createSupplier, refresh } = useSuppliers()
  const [showForm, setShowForm] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [address, setAddress] = useState('')
  const [state, setState] = useState('')
  const [gstin, setGstin] = useState('')
  const [saveError, setSaveError] = useState('')

  const columns = [
    { key: 'name', label: 'Supplier Name' },
    { key: 'address', label: 'Address' },
    { key: 'state', label: 'State' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'tally', label: 'Tally Status' },
  ]

  const tableData = suppliers.map((supplier) => ({
    name: supplier.name,
    address: supplier.address,
    state: supplier.state || 'N/A',
    gstin: supplier.gstin,
    tally: (
      <TallyStatusCell
        type="supplier"
        invoiceId={supplier.id}
        status={supplier.tally_sync_status || 'not_synced'}
        response={supplier.tally_response}
        onSynced={refresh}
      />
    ),
  }))

  const handleSaveSupplier = async () => {
    if (supplierName && address && state && gstin) {
      try {
        setSaveError('')
        await createSupplier({
          name: supplierName,
          address,
          state,
          gstin,
          tally_ledger_name: supplierName,
        })
        setShowForm(false)
        setSupplierName('')
        setAddress('')
        setState('')
        setGstin('')
      } catch (err) {
        setSaveError((err as Error).message)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('suppliers')}</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-black text-white hover:bg-gray-900"
        >
          {showForm ? 'Cancel' : 'Add Supplier'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Supplier Name</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Enter supplier name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter address"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Enter state"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-2">GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="Enter GSTIN"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex gap-3">
            <Button
              onClick={handleSaveSupplier}
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
