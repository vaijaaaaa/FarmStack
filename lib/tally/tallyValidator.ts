// Pre-flight validation before sending a voucher to Tally.
import type { VoucherInput } from './tallyXmlBuilder'

export function validateVoucher(
  kind: 'purchase' | 'sales',
  input: VoucherInput,
): string[] {
  const errors: string[] = []
  const party = kind === 'purchase' ? 'Supplier' : 'Customer'

  if (!input.date) {
    const field = kind === 'purchase' ? 'Purchase Date' : 'Sale Date'
    errors.push(
      `${field} is required — it becomes the Tally voucher date. Set the ${field} on the form before syncing to Tally.`,
    )
  }
  if (!input.partyLedger || !input.partyLedger.trim()) {
    errors.push(`${party} name is missing`)
  }
  if (!input.items || input.items.length === 0) {
    errors.push('Voucher has no items')
  }

  input.items?.forEach((it, i) => {
    const n = `Item ${i + 1}`
    if (!it.productName || !it.productName.trim()) errors.push(`${n}: product name is missing`)
    if (!it.ledgerName || !it.ledgerName.trim()) {
      errors.push(`${n}: ${kind} ledger (type) is missing`)
    }
    if (!Number.isFinite(it.quantity) || !(it.quantity > 0)) {
      errors.push(`${n}: Quantity is required for all ${kind} items before syncing to Tally — it must be a number greater than 0.`)
    }
    if (!it.unit || !it.unit.trim()) {
      errors.push(`${n}: unit is missing — set the product's unit (e.g. Kg, Bag, Nos) before syncing to Tally, otherwise stock cannot be posted.`)
    }
    if (!(it.rate > 0)) errors.push(`${n}: rate must be greater than 0`)
  })

  const total = (input.items || []).reduce((s, it) => s + it.baseAmount, 0)
  if (!(total > 0)) errors.push('Voucher total must be greater than 0')

  return errors
}
