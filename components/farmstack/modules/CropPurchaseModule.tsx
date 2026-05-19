'use client'

import { Language } from '@/types/farmstack'
import { Button } from '@/components/ui/button'

interface CropPurchaseModuleProps {
  language: Language
}

export default function CropPurchaseModule({ language }: CropPurchaseModuleProps) {
  const cropPurchases = [
    { id: 1, cropName: 'Rice', quantity: '500 kg', date: '2026-05-10', supplier: 'Farmer A', price: '₹12,500' },
    { id: 2, cropName: 'Wheat', quantity: '300 kg', date: '2026-05-09', supplier: 'Farmer B', price: '₹9,000' },
    { id: 3, cropName: 'Cotton', quantity: '200 bales', date: '2026-05-08', supplier: 'Supplier C', price: '₹15,000' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Crop Purchases</h1>
          <p className="mt-2 text-gray-600">Manage crop purchase records</p>
        </div>
        <Button className="bg-black text-white hover:bg-gray-900">Add Purchase</Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Crop Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cropPurchases.map((purchase) => (
              <tr key={purchase.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-black">{purchase.cropName}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{purchase.quantity}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{purchase.date}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{purchase.supplier}</td>
                <td className="px-6 py-4 text-sm font-semibold text-black">{purchase.price}</td>
                <td className="px-6 py-4 text-sm">
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
