'use client'

import { useEffect, useRef } from 'react'
import { Language } from '@/types/farmstack'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BarChart2, TrendingDown, AlertTriangle, Package } from 'lucide-react'

interface AnalyticsModuleProps {
  language: Language
}

const TABS = [
  {
    value: 'product-sale-qty',
    label: 'Product Sale Qty',
    shortcut: '1',
    icon: BarChart2,
    description: 'Sales data of a particular product for a given period',
  },
  {
    value: 'run-rate',
    label: 'Run Rate',
    shortcut: '2',
    icon: TrendingDown,
    description: 'Products that will go out of stock within 10 days',
  },
  {
    value: 'near-expiry',
    label: 'Near Expiry',
    shortcut: '3',
    icon: AlertTriangle,
    description: 'Products approaching their expiry date',
  },
  {
    value: 'stock',
    label: 'Stock',
    shortcut: '4',
    icon: Package,
    description: 'All products with current quantity and price',
  },
] as const

type TabValue = (typeof TABS)[number]['value']

export default function AnalyticsModule({ language }: AnalyticsModuleProps) {
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const tab = TABS.find((t) => t.shortcut === e.key)
      if (!tab) return

      const trigger = tabsRef.current?.querySelector<HTMLButtonElement>(
        `[data-value="${tab.value}"]`,
      )
      trigger?.click()
      trigger?.focus()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">Analytics</h1>
      </div>

      <Tabs defaultValue="product-sale-qty" ref={tabsRef as any}>
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-gray-100 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                data-value={tab.value}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                <kbd className="ml-1 rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 data-[state=active]:border-gray-200 data-[state=active]:bg-gray-100">
                  {tab.shortcut}
                </kbd>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <TabsContent key={tab.value} value={tab.value}>
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-10 text-center">
                <Icon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <h2 className="text-lg font-semibold text-gray-800">{tab.label}</h2>
                <p className="mt-1 text-sm text-gray-500">{tab.description}</p>
                <p className="mt-4 text-xs text-gray-400">Coming soon</p>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
