import { useState, useEffect } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { mockSyncLogs } from '@/lib/mock-data'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { tallyApi, getStoredTallyUrl, TALLY_URL_STORAGE_KEY } from '@/src/services/api'

interface TallySyncModuleProps {
  language: Language
}

// Command the client runs on the Tally PC to start a Cloudflare tunnel.
const TUNNEL_CMD = 'cloudflared tunnel --url http://localhost:9000'

export default function TallySyncModule({ language }: TallySyncModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const [syncLogs] = useState(mockSyncLogs)
  const [tallyUrl, setTallyUrl] = useState('')
  const [conn, setConn] = useState<{
    state: 'unknown' | 'checking' | 'ok' | 'fail'
    message: string
  }>({ state: 'unknown', message: '' })

  // silent = background re-check (no "Checking…" flicker).
  const checkConnection = async (silent = false) => {
    if (!silent) setConn({ state: 'checking', message: 'Checking connection…' })
    const res = await tallyApi.status()
    setConn({ state: res.connected ? 'ok' : 'fail', message: res.message })
  }

  // Load the saved URL, test once, then keep the status live: re-check every
  // 20s and whenever the tab regains focus, so it turns red if Tally goes down.
  useEffect(() => {
    setTallyUrl(getStoredTallyUrl())
    checkConnection()
    const interval = setInterval(() => checkConnection(true), 20000)
    const onFocus = () => checkConnection(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveUrl = () => {
    const cleaned = tallyUrl.trim().replace(/\/+$/, '')
    localStorage.setItem(TALLY_URL_STORAGE_KEY, cleaned)
    setTallyUrl(cleaned)
    toast.success(
      cleaned
        ? 'Tally Server URL saved'
        : 'Cleared — using default (this computer’s localhost:9000)',
    )
    checkConnection()
  }

  const handleClearUrl = () => {
    setTallyUrl('')
    localStorage.removeItem(TALLY_URL_STORAGE_KEY)
    toast.success('Cleared — using this computer’s Tally (localhost:9000)')
    checkConnection()
  }

  const copyTunnelCmd = async () => {
    try {
      await navigator.clipboard.writeText(TUNNEL_CMD)
      toast.success('Command copied — paste it into Command Prompt')
    } catch {
      toast.error('Could not copy. Select the command and copy it manually.')
    }
  }

  const dot =
    conn.state === 'ok'
      ? 'bg-green-500'
      : conn.state === 'fail'
        ? 'bg-red-500'
        : conn.state === 'checking'
          ? 'bg-yellow-400'
          : 'bg-gray-300'
  const statusLabel =
    conn.state === 'ok'
      ? 'Connected'
      : conn.state === 'fail'
        ? 'Not connected'
        : conn.state === 'checking'
          ? 'Checking…'
          : 'Unknown'

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">{t('tally_sync')}</h2>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-black">Tally Connection</h3>
            <p className="mt-1 text-sm text-gray-600">
              Tell the app where your Tally is running.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${dot}`}></div>
            <span
              className={`text-sm font-medium ${
                conn.state === 'ok'
                  ? 'text-green-700'
                  : conn.state === 'fail'
                    ? 'text-red-700'
                    : 'text-gray-600'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Tally Server URL
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={tallyUrl}
              onChange={(e) => setTallyUrl(e.target.value)}
              placeholder="http://localhost:9000  (or your tunnel URL, e.g. https://xxxx.trycloudflare.com)"
              className="min-w-[260px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <Button onClick={handleSaveUrl} className="bg-black text-white hover:bg-gray-900">
              Save
            </Button>
            <Button onClick={() => checkConnection()} variant="outline" className="shadow-none">
              Test Connection
            </Button>
            <Button onClick={handleClearUrl} variant="outline" className="shadow-none">
              Clear
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Running the app on the <b>same PC as Tally</b>? Leave this blank (it uses
            localhost:9000). Using the <b>cloud / Vercel site</b>? Run a tunnel on the Tally
            computer and paste the URL it gives you here.
          </p>
          {conn.message && (
            <p
              className={`mt-2 text-xs ${
                conn.state === 'ok' ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {conn.message}
            </p>
          )}

          {/* Copyable tunnel command for cloud / Vercel users. */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-gray-500">
              Using the cloud site? Run this on the Tally PC (Command Prompt), then paste the link
              it gives into the box above and click Save:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded border border-gray-200 px-3 py-2 font-mono text-xs text-gray-800">
                {TUNNEL_CMD}
              </code>
              <Button type="button" variant="outline" onClick={copyTunnelCmd} className="shadow-none">
                Copy
              </Button>
            </div>
          </div>
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
