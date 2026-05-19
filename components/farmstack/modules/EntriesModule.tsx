'use client'

import { Language } from '@/types/farmstack'
import { Button } from '@/components/ui/button'

interface EntriesModuleProps {
  language: Language
}

export default function EntriesModule({ language }: EntriesModuleProps) {
  const entries = [
    { id: 1, date: '2026-05-10', type: 'Sale', description: 'Organic Rice sold to Rajesh', amount: '₹2,625', status: 'Completed' },
    { id: 2, date: '2026-05-09', type: 'Purchase', description: 'Fertilizer purchase', amount: '₹3,150', status: 'Completed' },
    { id: 3, date: '2026-05-08', type: 'Sale', description: 'Wheat flour sold', amount: '₹3,150', status: 'Pending' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Entries</h1>
          <p className="mt-2 text-gray-600">View all transaction entries</p>
        </div>
        <Button className="bg-black text-white hover:bg-gray-900">Add Entry</Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Amount</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-600">{entry.date}</td>
                <td className="px-6 py-4 text-sm font-medium text-black">
                  <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${entry.type === 'Sale' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {entry.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{entry.description}</td>
                <td className="px-6 py-4 text-sm font-semibold text-black">{entry.amount}</td>
                <td className="px-6 py-4 text-sm">
                  <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${entry.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {entry.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <button className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                  <button className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                  <button className="text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
