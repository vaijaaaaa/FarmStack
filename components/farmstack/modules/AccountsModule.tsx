'use client'

import { useEffect, useRef } from 'react'
import { Language } from '@/types/farmstack'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CalendarDays, UserPlus, Eye, Lock } from 'lucide-react'
import { useSeasons, useLedgers } from '@/hooks/useDatabase'
import SeasonsTab from './accounts/SeasonsTab'
import LedgerAddingTab from './accounts/LedgerAddingTab'
import LedgerViewTab from './accounts/LedgerViewTab'

interface AccountsModuleProps {
  language: Language
}

const TABS = [
  { value: 'season', label: 'Season', shortcut: '1', icon: CalendarDays },
  { value: 'ledger-adding', label: 'Ledger Adding', shortcut: '2', icon: UserPlus },
  { value: 'ledger-display', label: 'Ledger Display', shortcut: '3', icon: Eye },
  { value: 'ledger-closure', label: 'Ledger Closure', shortcut: '4', icon: Lock },
] as const

export default function AccountsModule({ language }: AccountsModuleProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const { seasons, loading: seasonsLoading, createSeason } = useSeasons()
  const { ledgers, createLedger, closeLedger, reopenLedger, bulkCreateLedgers, refresh: refreshLedgers } = useLedgers()

  // Number-key tab shortcuts (same UX as AnalyticsModule)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const tab = TABS.find((t) => t.shortcut === e.key)
      if (!tab) return
      const trigger = tabsRef.current?.querySelector<HTMLButtonElement>(`[data-value="${tab.value}"]`)
      trigger?.click()
      trigger?.focus()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])


  return (
    // Pull back the p-8 from AppLayout so this page owns its full viewport height
    <div className="-m-8 flex h-[calc(100vh-56px)] flex-col">
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div className="px-8 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-black">Accounts</h1>
      </div>

      {/* ── Tabs fill remaining height ────────────────────────────────── */}
      <Tabs defaultValue="season" ref={tabsRef as any} className="flex min-h-0 flex-1 flex-col px-8 pb-5">
        <TabsList className="h-auto w-full shrink-0 justify-start gap-1 rounded-xl bg-gray-100 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                data-value={tab.value}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                <kbd className="ml-1 rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                  {tab.shortcut}
                </kbd>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="season" className="min-h-0 flex-1 overflow-auto">
          <SeasonsTab seasons={seasons} loading={seasonsLoading} onAdd={createSeason} />
        </TabsContent>

        <TabsContent value="ledger-adding" className="min-h-0 flex-1 overflow-hidden">
          <LedgerAddingTab seasons={seasons} ledgers={ledgers} onAdd={createLedger} onBulkAdd={bulkCreateLedgers} />
        </TabsContent>

        <TabsContent value="ledger-display" className="min-h-0 flex-1 overflow-auto">
          <LedgerViewTab mode="display" seasons={seasons} ledgers={ledgers} />
        </TabsContent>

        <TabsContent value="ledger-closure" className="min-h-0 flex-1 overflow-auto">
          <LedgerViewTab
            mode="closure"
            seasons={seasons}
            ledgers={ledgers}
            onClose={async (id, date, closingBalance) => {
              await closeLedger(id, date, closingBalance)
              await refreshLedgers()
            }}
            onReopen={async (id) => {
              await reopenLedger(id)
              await refreshLedgers()
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
