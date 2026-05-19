'use client'

import { Language } from '@/types/farmstack'

interface AnalyticsModuleProps {
  language: Language
}

export default function AnalyticsModule({ language }: AnalyticsModuleProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">Analytics</h1>
        <p className="mt-2 text-gray-600">View detailed analytics and reports</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Revenue Trend</div>
          <div className="mt-4 flex items-end justify-between gap-2">
            <div className="h-12 w-3 rounded bg-blue-500"></div>
            <div className="h-16 w-3 rounded bg-blue-500"></div>
            <div className="h-14 w-3 rounded bg-blue-500"></div>
            <div className="h-20 w-3 rounded bg-blue-500"></div>
            <div className="h-18 w-3 rounded bg-blue-500"></div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Sales Performance</div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-black">₹2,45,000</div>
            <div className="mt-1 text-sm text-green-600">+12% from last month</div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-600">Purchase Cost</div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-black">₹1,28,000</div>
            <div className="mt-1 text-sm text-red-600">+5% from last month</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-black">Monthly Summary</h2>
        <p className="mt-4 text-gray-600">Analytics feature is coming soon</p>
      </div>
    </div>
  )
}
