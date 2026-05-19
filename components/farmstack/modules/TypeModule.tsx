'use client'

import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { Button } from '@/components/ui/button'
import { useProductTypes } from '@/hooks/useDatabase'
import TallyStatusCell from '../components/TallyStatusCell'

interface TypeModuleProps {
  language: Language
}

export default function TypeModule({ language }: TypeModuleProps) {
  const { productTypes, createProductType, refresh } = useProductTypes()
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState({ name: '', description: '', tax: '' })
  const [error, setError] = useState('')

  const handleAddType = async () => {
    const name = newType.name.trim()
    if (!name) {
      setError('Type name is required')
      return
    }

    try {
      setError('')
      await createProductType({
        name,
        description: newType.description,
        tax: Number(newType.tax || 0),
      })
      setNewType({ name: '', description: '', tax: '' })
      setShowForm(false)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Product Types</h1>
          <p className="mt-2 text-gray-600">Manage product types and categories</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-black text-white hover:bg-gray-900">
          {showForm ? 'Cancel' : 'Add Type'}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type Name</label>
              <input
                value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="e.g., Sales of Goods"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <input
                value={newType.description}
                onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">GST %</label>
              <input
                type="number"
                value={newType.tax}
                onChange={(e) => setNewType({ ...newType, tax: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="0"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button onClick={handleAddType} className="bg-green-600 text-white hover:bg-green-700">
              Save Type
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">GST %</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tally Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {productTypes.map((type) => (
              <tr key={type.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-black">{type.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{type.description}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{type.tax}%</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <TallyStatusCell
                    type="product_type"
                    invoiceId={type.id}
                    status={type.tally_sync_status || 'not_synced'}
                    response={type.tally_response}
                    onSynced={refresh}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
