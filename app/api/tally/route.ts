import { NextResponse } from 'next/server'
import { checkTallyConnection } from '@/lib/tally/tallyClient'
import { setTallyUrlForRequest } from '@/lib/tally/tallyContext'
import { syncPurchaseInvoice, syncSalesInvoice } from '@/lib/tally/tallySyncService'
import {
  syncMasterById,
  syncMastersBulk,
  type MasterKind,
  type BulkEntry,
} from '@/lib/tally/tallyMasterSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Manual "Retry Sync" / "Sync to Tally" can post several vouchers in one call.
// Give it time to finish. Vercel default ~10s.
export const maxDuration = 60

const MASTER_KINDS: MasterKind[] = ['supplier', 'customer', 'product', 'product_type']

// Connection check.
export async function GET(request: Request) {
  setTallyUrlForRequest(request)
  const result = await checkTallyConnection()
  return NextResponse.json(result, { status: result.connected ? 200 : 503 })
}

// Sync to Tally:
//  - voucher: { type: 'purchase' | 'sales', id }
//  - master:  { type: 'supplier'|'customer'|'product'|'product_type', id }
//  - bulk:    { action: 'sync-masters', masters: BulkEntry[] }
export async function POST(request: Request) {
  setTallyUrlForRequest(request)
  try {
    const body = await request.json()

    if (body.action === 'sync-masters') {
      const masters: BulkEntry[] = Array.isArray(body.masters) ? body.masters : []
      const results = await syncMastersBulk(masters)
      return NextResponse.json({ results })
    }

    const type = String(body.type ?? '')
    const id = String(body.id ?? '')

    if (id && (type === 'purchase' || type === 'sales')) {
      const outcome =
        type === 'purchase'
          ? await syncPurchaseInvoice(id)
          : await syncSalesInvoice(id)
      return NextResponse.json(outcome)
    }

    if (id && MASTER_KINDS.includes(type as MasterKind)) {
      const outcome = await syncMasterById(type as MasterKind, id)
      return NextResponse.json(outcome)
    }

    return NextResponse.json(
      { error: 'Provide a valid type and id, or action "sync-masters"' },
      { status: 400 },
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
