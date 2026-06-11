// Single source of truth for the "Patti" crop-purchase valuation.
// Pure + server-safe (no React/DOM) so the API route, the live grid, the printed
// invoice and the history all compute from THIS one function — the stored
// net_amount (authoritative, set by the server) therefore always matches what the
// invoice/ledger show. Verified cell-for-cell against the legacy Accountant export.
//
// Legacy constants (Accountant.exe.Config). Price is the rate per ONE standard bag
// of BASE_WT kg — NOT per quintal.
export const BASE_WT = 75 // PattiBaseWt — value = netWeight × price / 75
export const DEFAULT_WT = 74 // PattiDefaultWt — per-bag weight used when Weight is blank

export interface PattiConfig {
  labourPerBag: number
  wtAdjPerBag: number
  lessPercent: number
}

// Gross value + the net weight as the old Excel prints it. The entered Weight is
// the GROSS scale weight; the per-bag tare (wtAdj × bags) is deducted on totals:
//   • Weight > 75     → net = weight − ceil(wtAdj × bags); value = floor(net × price / 75 + 0.1)
//   • 0 < Weight ≤ 75 → per-bag average: value = floor(bags × price × weight / 75 + 0.1)
//   • Weight = 0      → fall back to DEFAULT_WT (74) as the per-bag weight.
export function pattiValue(
  bags: number,
  weight: number,
  price: number,
  wtAdjPerBag: number,
): { gross: number; netWeight: number } {
  if (weight > BASE_WT) {
    const netWeight = weight - Math.ceil(wtAdjPerBag * bags)
    return { gross: Math.floor((netWeight * price) / BASE_WT + 0.1), netWeight }
  }
  if (weight > 0) {
    return { gross: Math.floor((bags * price * weight) / BASE_WT + 0.1), netWeight: weight }
  }
  return { gross: Math.floor((bags * price * DEFAULT_WT) / BASE_WT + 0.1), netWeight: DEFAULT_WT }
}

// Full breakdown: value (gross), less, labour (Hamali), net payable, net weight.
//   labour = ceil(bags × labour/bag);  less = round(value × less%/100)
//   net    = value − labour − less
export function pattiBreakdown(
  bags: number,
  weight: number,
  price: number,
  cfg: PattiConfig,
): { gross: number; less: number; labour: number; net: number; netWeight: number } {
  const { netWeight } = pattiValue(bags, weight, price, cfg.wtAdjPerBag)
  if (bags <= 0 || price <= 0) return { gross: 0, less: 0, labour: 0, net: 0, netWeight }
  const { gross } = pattiValue(bags, weight, price, cfg.wtAdjPerBag)
  const labour = Math.ceil(bags * cfg.labourPerBag)
  const less = Math.round((gross * cfg.lessPercent) / 100)
  return { gross, less, labour, net: gross - labour - less, netWeight }
}

// Net payable only — the authoritative amount posted to the ledger.
export function pattiNet(bags: number, weight: number, price: number, cfg: PattiConfig): number {
  return pattiBreakdown(bags, weight, price, cfg).net
}
