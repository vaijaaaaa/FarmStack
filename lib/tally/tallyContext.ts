// Per-request Tally server URL. The browser knows which Tally to reach (its own
// localhost, or a tunnel URL) and sends it as the `x-tally-url` header. Each API
// route stamps that value here so the server-side Tally client can read it
// without threading a URL argument through every function.
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage<string>()

// Call once at the top of any API route that talks to Tally. enterWith binds the
// value to the current request's async context (and all its awaits); it does not
// leak across requests.
export function setTallyUrlForRequest(request: Request): void {
  const url = request.headers.get('x-tally-url')?.trim()
  if (url) storage.enterWith(url)
}

export function currentTallyUrl(): string {
  return storage.getStore() || ''
}

// Run a function with an explicit Tally URL bound to its async context. Used by
// the background sync queue, which runs OUTSIDE the original request and would
// otherwise lose the per-request URL set via setTallyUrlForRequest.
export function runWithTallyUrl<T>(url: string, fn: () => Promise<T>): Promise<T> {
  return url ? storage.run(url, fn) : fn()
}
