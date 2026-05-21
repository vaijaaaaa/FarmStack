// Stock = total purchased - total sold, per product.
// Server-side source of truth used by sales save and Tally sync validation.
import { query } from '@/lib/db'

export interface StockInfo {
  purchased: number
  sold: number
  available: number
}

/**
 * Remaining stock for every product that has ever been purchased or sold.
 *
 * @param excludeSalesInvoiceId - when re-validating an already-saved sale
 *   (e.g. before Tally sync, or when editing it), pass its id so that sale's
 *   own quantity is NOT counted against the available stock.
 */
export async function getStockMap(
  excludeSalesInvoiceId?: string,
): Promise<Map<string, StockInfo>> {
  const purchased = await query<{ product_id: string; q: number }>(
    'SELECT product_id, SUM(quantity) AS q FROM purchase_items GROUP BY product_id',
  )
  const sold = excludeSalesInvoiceId
    ? await query<{ product_id: string; q: number }>(
        'SELECT product_id, SUM(quantity) AS q FROM sales_items WHERE invoice_id != ? GROUP BY product_id',
        [excludeSalesInvoiceId],
      )
    : await query<{ product_id: string; q: number }>(
        'SELECT product_id, SUM(quantity) AS q FROM sales_items GROUP BY product_id',
      )

  const map = new Map<string, StockInfo>()
  for (const r of purchased) {
    const id = String(r.product_id || '')
    if (!id) continue
    map.set(id, { purchased: Number(r.q) || 0, sold: 0, available: Number(r.q) || 0 })
  }
  for (const r of sold) {
    const id = String(r.product_id || '')
    if (!id) continue
    const cur = map.get(id) || { purchased: 0, sold: 0, available: 0 }
    cur.sold = Number(r.q) || 0
    cur.available = cur.purchased - cur.sold
    map.set(id, cur)
  }
  return map
}

export function availableFor(map: Map<string, StockInfo>, productId: string): number {
  return map.get(productId)?.available ?? 0
}
