// Creates FarmStack masters (suppliers, customers, products, types) as
// TallyPrime ledgers / stock items / units, and records sync status.
import { query, queryOne, execute, nowIso } from '@/lib/db'
import { postXml } from './tallyClient'
import { parseTallyResponse } from './tallyResponseParser'
import { GST_LEDGERS } from './config'
import {
  ledgerMessage,
  gstLedgerMessage,
  unitMessage,
  stockItemMessage,
  ledgerGroupForType,
  buildMastersEnvelope,
} from './tallyMasterBuilder'

// The four GST tax ledgers the voucher builder references.
export function gstLedgerMessages(): string[] {
  return [
    gstLedgerMessage(GST_LEDGERS.inputCgst, 'Central Tax'),
    gstLedgerMessage(GST_LEDGERS.inputSgst, 'State Tax'),
    gstLedgerMessage(GST_LEDGERS.outputCgst, 'Central Tax'),
    gstLedgerMessage(GST_LEDGERS.outputSgst, 'State Tax'),
  ]
}

export type MasterKind = 'supplier' | 'customer' | 'product' | 'product_type'

const TABLE: Record<MasterKind, string> = {
  supplier: 'suppliers',
  customer: 'customers',
  product: 'products',
  product_type: 'product_types',
}

export interface MasterOutcome {
  status: 'synced' | 'failed'
  message: string
}

async function setMasterStatus(
  kind: MasterKind,
  id: string,
  o: MasterOutcome,
): Promise<void> {
  await execute(
    `UPDATE ${TABLE[kind]}
     SET tally_sync_status = ?, tally_response = ?, tally_synced_at = ?
     WHERE id = ?`,
    [o.status, o.message, o.status === 'synced' ? nowIso() : null, id],
  )
}

async function messagesForMaster(
  kind: MasterKind,
  id: string,
): Promise<{ messages: string[]; label: string } | null> {
  if (kind === 'supplier') {
    const r = await queryOne<any>('SELECT * FROM suppliers WHERE id = ?', [id])
    if (!r) return null
    const name = r.tally_ledger_name || r.name
    return {
      label: `Supplier: ${name}`,
      messages: [ledgerMessage(name, 'Sundry Creditors', { gstin: r.gstin, billwise: true })],
    }
  }
  if (kind === 'customer') {
    const r = await queryOne<any>('SELECT * FROM customers WHERE id = ?', [id])
    if (!r) return null
    const name = r.tally_ledger_name || r.name
    return {
      label: `Customer: ${name}`,
      messages: [ledgerMessage(name, 'Sundry Debtors', { gstin: r.gstin, billwise: true })],
    }
  }
  if (kind === 'product') {
    const r = await queryOne<any>('SELECT * FROM products WHERE id = ?', [id])
    if (!r) return null
    const unit = r.unit || 'Nos'
    const name = r.tally_stock_item_name || r.name
    return {
      label: `Product: ${name}`,
      messages: [unitMessage(unit), stockItemMessage(name, unit)],
    }
  }
  const r = await queryOne<any>('SELECT * FROM product_types WHERE id = ?', [id])
  if (!r) return null
  return {
    label: `Type: ${r.name}`,
    messages: [ledgerMessage(r.name, ledgerGroupForType(r.name))],
  }
}

export async function syncMasterById(
  kind: MasterKind,
  id: string,
): Promise<MasterOutcome> {
  const built = await messagesForMaster(kind, id)
  if (!built) return { status: 'failed', message: `${kind} not found` }
  try {
    const raw = await postXml(buildMastersEnvelope(built.messages))
    const parsed = parseTallyResponse(raw)
    const outcome: MasterOutcome = {
      status: parsed.success ? 'synced' : 'failed',
      message: parsed.success
        ? `${built.label} synced to Tally`
        : parsed.message,
    }
    await setMasterStatus(kind, id, outcome)
    return outcome
  } catch (err) {
    const outcome: MasterOutcome = { status: 'failed', message: (err as Error).message }
    await setMasterStatus(kind, id, outcome)
    return outcome
  }
}

export interface BulkEntry {
  kind: MasterKind | 'ledger' | 'gst'
  id?: string
  name?: string
  group?: string
  label?: string
}

export interface BulkResult {
  label: string
  status: 'synced' | 'failed'
  message: string
}

export async function syncMastersBulk(entries: BulkEntry[]): Promise<BulkResult[]> {
  const results: BulkResult[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.kind === 'gst') {
      if (seen.has('gst')) continue
      seen.add('gst')
      const label = e.label || 'GST ledgers (CGST/SGST)'
      try {
        const raw = await postXml(buildMastersEnvelope(gstLedgerMessages()))
        const parsed = parseTallyResponse(raw)
        results.push({
          label,
          status: parsed.success ? 'synced' : 'failed',
          message: parsed.success ? `${label} synced to Tally` : parsed.message,
        })
      } catch (err) {
        results.push({ label, status: 'failed', message: (err as Error).message })
      }
      continue
    }

    const key = `${e.kind}:${e.id || e.name}`
    if (seen.has(key) || (!e.id && !e.name)) continue
    seen.add(key)

    if (e.kind === 'ledger' && e.name) {
      const label = e.label || `Ledger: ${e.name}`
      try {
        const raw = await postXml(
          buildMastersEnvelope([
            ledgerMessage(e.name, e.group || ledgerGroupForType(e.name)),
          ]),
        )
        const parsed = parseTallyResponse(raw)
        results.push({
          label,
          status: parsed.success ? 'synced' : 'failed',
          message: parsed.success ? `${label} synced to Tally` : parsed.message,
        })
      } catch (err) {
        results.push({ label, status: 'failed', message: (err as Error).message })
      }
      continue
    }

    if (e.id) {
      const built = await messagesForMaster(e.kind as MasterKind, e.id)
      const outcome = await syncMasterById(e.kind as MasterKind, e.id)
      results.push({
        label: built?.label || e.label || `${e.kind}`,
        status: outcome.status,
        message: outcome.message,
      })
    }
  }
  return results
}

// Best-effort: create the masters a voucher needs before posting it.
export async function ensureMastersForVoucher(opts: {
  kind: 'purchase' | 'sales'
  partyName: string
  partyGstin?: string
  items: Array<{ productName: string; unit: string; ledgerName: string }>
}): Promise<void> {
  const messages: string[] = []
  if (opts.partyName) {
    messages.push(
      ledgerMessage(
        opts.partyName,
        opts.kind === 'purchase' ? 'Sundry Creditors' : 'Sundry Debtors',
        { gstin: opts.partyGstin, billwise: true },
      ),
    )
  }
  const units = new Set<string>()
  const stock = new Set<string>()
  const ledgers = new Set<string>()
  for (const it of opts.items) {
    const unit = it.unit || 'Nos'
    if (!units.has(unit)) {
      units.add(unit)
      messages.push(unitMessage(unit))
    }
    if (it.productName && !stock.has(it.productName)) {
      stock.add(it.productName)
      messages.push(stockItemMessage(it.productName, unit))
    }
    if (it.ledgerName && !ledgers.has(it.ledgerName)) {
      ledgers.add(it.ledgerName)
      messages.push(ledgerMessage(it.ledgerName, ledgerGroupForType(it.ledgerName)))
    }
  }
  // Always ensure GST ledgers exist (idempotent) so GST vouchers never fail.
  messages.push(...gstLedgerMessages())
  if (messages.length === 0) return
  try {
    await postXml(buildMastersEnvelope(messages))
  } catch {
    // best effort — the voucher post will surface the real problem
  }
}
