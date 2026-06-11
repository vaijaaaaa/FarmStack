// Background Tally sync queue (server-only).
//
// Posting a voucher to TallyPrime is slow — several XML round-trips to the local
// Tally server (a sale also auto-syncs its prerequisite purchases first). Doing
// that inside the save request makes "Saving sale…" hang for many seconds.
//
// Instead the API saves the invoice as `pending` and enqueues the sync here. Jobs
// run ONE AT A TIME in the background (Tally can't handle concurrent voucher
// posts, and the prerequisite-purchase chaining must stay ordered), so the save
// request returns instantly. The invoice's tally_sync_status is updated by the
// sync service when the job finishes; the Sales list / Tally page reflect it on
// the next load, and failures can be retried from the UI.
//
// Note: this is an in-process queue. It works for local/desktop and tunnelled
// runs where the Node process stays alive. On a frozen serverless instance a job
// may not finish — the invoice simply stays `pending` and the user pushes it from
// the Tally Sync page (the existing manual-retry path).
import { syncSalesInvoice, syncPurchaseInvoice } from './tallySyncService'
import { runWithTallyUrl } from './tallyContext'

type JobKind = 'sales' | 'purchase'
interface Job {
  kind: JobKind
  id: string
  tallyUrl: string
}

const queue: Job[] = []
const queued = new Set<string>() // de-dupe by `${kind}:${id}` while still pending
let draining = false

function key(kind: JobKind, id: string) {
  return `${kind}:${id}`
}

export function enqueueTallySync(kind: JobKind, id: string, tallyUrl: string): void {
  if (!id) return
  const k = key(kind, id)
  if (queued.has(k)) return
  queued.add(k)
  queue.push({ kind, id, tallyUrl })
  void drain()
}

export function enqueueSalesSync(id: string, tallyUrl: string): void {
  enqueueTallySync('sales', id, tallyUrl)
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length) {
      const job = queue.shift()!
      queued.delete(key(job.kind, job.id))
      try {
        await runWithTallyUrl(job.tallyUrl, () =>
          job.kind === 'sales' ? syncSalesInvoice(job.id) : syncPurchaseInvoice(job.id),
        )
      } catch {
        // The sync service persists a `failed` status on error; the user can
        // retry from the Tally Sync page. Swallow so one bad job never stalls
        // the rest of the queue.
      }
    }
  } finally {
    draining = false
  }
}
