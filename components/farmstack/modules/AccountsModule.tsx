'use client'

import { Language } from '@/types/farmstack'
import { Button } from '@/components/ui/button'

interface AccountsModuleProps {
  language: Language
}

export default function AccountsModule({ language }: AccountsModuleProps) {
  const accounts = [
    { id: 1, name: 'Petty Cash', type: 'Cash', balance: '₹5,000' },
    { id: 2, name: 'Bank Account - HDFC', type: 'Bank', balance: '₹50,000' },
    { id: 3, name: 'Payables', type: 'Liability', balance: '₹12,000' },
    { id: 4, name: 'Receivables', type: 'Asset', balance: '₹25,000' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Accounts</h1>
          <p className="mt-2 text-gray-600">Manage all accounts and balances</p>
        </div>
        <Button className="bg-black text-white hover:bg-gray-900">Add Account</Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Account Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Balance</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-black">{account.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{account.type}</td>
                <td className="px-6 py-4 text-sm font-semibold text-black">{account.balance}</td>
                <td className="px-6 py-4 text-sm">
                  <button className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                  <button className="text-blue-600 hover:text-blue-800">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
