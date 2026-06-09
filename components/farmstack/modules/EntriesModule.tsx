'use client'

import { Language } from '@/types/farmstack'
import EntriesGrid from './EntriesGrid'

interface EntriesModuleProps {
  language: Language
}

export default function EntriesModule({ language }: EntriesModuleProps) {
  return (
    // Reclaim AppLayout's p-8 so the page owns its full viewport height.
    <div className="-m-8 flex h-[calc(100vh-56px)] flex-col">
      <div className="px-8 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-black">Entries</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-8 pb-6 pt-1">
        <EntriesGrid />
      </div>
    </div>
  )
}
