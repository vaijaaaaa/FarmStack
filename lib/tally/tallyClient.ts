// Server-side HTTP client for TallyPrime. Never call this from the browser.
import { resolveTallyUrl, TALLY_TIMEOUT_MS } from './config'

// Sent on every Tally request so ngrok free tunnels skip their browser-warning
// interstitial (harmless for direct localhost / Cloudflare tunnels).
const TUNNEL_HEADERS = { 'ngrok-skip-browser-warning': 'true' }

export interface ConnectionResult {
  connected: boolean
  message: string
  raw?: string
}

function friendlyConnError(err: unknown): string {
  const msg = (err as Error)?.message || String(err)
  if (/abort|timeout/i.test(msg)) {
    return 'TallyPrime is not responding (timeout). Check if it is running at ' + resolveTallyUrl()
  }
  if (/ECONNREFUSED|fetch failed|refused|network/i.test(msg)) {
    return 'TallyPrime is not running. Please open TallyPrime and enable the HTTP server at ' + resolveTallyUrl()
  }
  return `Could not reach TallyPrime: ${msg}`
}

export async function checkTallyConnection(): Promise<ConnectionResult> {
  try {
    const res = await fetch(resolveTallyUrl(), {
      method: 'GET',
      headers: TUNNEL_HEADERS,
      signal: AbortSignal.timeout(Math.min(TALLY_TIMEOUT_MS, 8000)),
    })
    const raw = await res.text()
    const running = res.ok || /running|tallyprime|tally/i.test(raw)
    return {
      connected: running,
      message: running
        ? 'TallyPrime Server is running'
        : 'Unexpected response from TallyPrime',
      raw,
    }
  } catch (err) {
    return { connected: false, message: friendlyConnError(err) }
  }
}

// POST raw XML to Tally and return the raw XML response text.
export async function postXml(xml: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(resolveTallyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=utf-8', ...TUNNEL_HEADERS },
      body: xml,
      signal: AbortSignal.timeout(TALLY_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(friendlyConnError(err))
  }
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`TallyPrime returned HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return text
}
