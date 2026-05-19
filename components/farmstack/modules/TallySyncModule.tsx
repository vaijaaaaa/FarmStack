import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { mockSyncLogs } from '@/lib/mock-data'
import { Button } from '@/components/ui/button'

interface TallySyncModuleProps {
  language: Language
}

export default function TallySyncModule({ language }: TallySyncModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const [syncLogs, setSyncLogs] = useState(mockSyncLogs)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = () => {
    setIsSyncing(true)
    setTimeout(() => {
      setIsSyncing(false)
    }, 2000)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">{t('tally_sync')}</h2>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-black">Tally Connection</h3>
            <p className="mt-1 text-sm text-gray-600">Status and sync configuration</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-green-700">{t('connected')}</span>
            </div>
            <p className="text-xs text-gray-500">Last sync: 2 hours ago</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-600">Pending Items</p>
            <p className="mt-2 text-2xl font-bold text-black">2</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-600">Synced Today</p>
            <p className="mt-2 text-2xl font-bold text-black">4</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase text-gray-600">Failed</p>
            <p className="mt-2 text-2xl font-bold text-black">1</p>
          </div>
        </div>

        <div className="mt-6">
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-black text-white hover:bg-gray-900 disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : t('sync')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-black">Sync Logs</h3>
        <div className="space-y-3">
          {syncLogs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg border-l-4 p-4 ${
                log.type === 'success'
                  ? 'border-l-green-500 bg-green-50'
                  : 'border-l-red-500 bg-red-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      log.type === 'success' ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {log.message}
                  </p>
                  {log.error && (
                    <p className="mt-1 text-sm text-gray-600">{log.error}</p>
                  )}
                </div>
                <span
                  className={`ml-4 text-xs font-semibold ${
                    log.type === 'success'
                      ? 'text-green-700'
                      : 'text-red-700'
                  }`}
                >
                  {log.type === 'success' ? t('synced') : t('failed')}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
