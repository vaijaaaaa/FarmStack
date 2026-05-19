import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { useCustomers } from '@/hooks/useDatabase'
import { Button } from '@/components/ui/button'
import DataTable from '../components/DataTable'
import TallyStatusCell from '../components/TallyStatusCell'

interface CustomersModuleProps {
  language: Language
}

export default function CustomersModule({ language }: CustomersModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const { customers, createCustomer, refresh } = useCustomers()
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [saveError, setSaveError] = useState('')

  const columns = [
    { key: 'name', label: 'Customer Name' },
    { key: 'address', label: 'Address' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'tally', label: 'Tally Status' },
  ]

  const tableData = customers.map((customer) => ({
    name: customer.name,
    address: customer.address,
    gstin: customer.gstin,
    tally: (
      <TallyStatusCell
        type="customer"
        invoiceId={customer.id}
        status={customer.tally_sync_status || 'not_synced'}
        response={customer.tally_response}
        onSynced={refresh}
      />
    ),
  }))

  const handleSaveCustomer = async () => {
    if (customerName && address && gstin) {
      try {
        setSaveError('')
        await createCustomer({
          name: customerName,
          address,
          gstin,
          tally_ledger_name: customerName,
        })
        setShowForm(false)
        setCustomerName('')
        setAddress('')
        setGstin('')
      } catch (err) {
        setSaveError((err as Error).message)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">{t('customers')}</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-black text-white hover:bg-gray-900"
        >
          {showForm ? 'Cancel' : 'Add Customer'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
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
              onClick={handleSaveCustomer}
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
