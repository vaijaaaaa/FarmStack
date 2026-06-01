// Builds TallyPrime import XML for Purchase and Sales vouchers.
// Sign convention used (Tally invoice voucher view):
//   Purchase: party ledger credit (+total), purchase ledger + GST input debit (-amount)
//   Sales:    party ledger debit (-total), sales ledger + GST output credit (+amount)
import { TALLY_COMPANY, GST_LEDGERS } from './config'

// Local supply => tax splits into CGST + SGST. Interstate => single IGST.
export type GstSupplyType = 'local' | 'interstate'

export interface VoucherItem {
  productName: string
  unit: string
  quantity: number
  rate: number
  baseAmount: number
  ledgerName: string // FarmStack "type" => purchase/sales ledger
  taxPercent: number
  gstSupplyType?: GstSupplyType // defaults to 'local' when omitted
  batch?: string
  expiryDate?: string
}

export interface GstBreakdown {
  taxableAmount: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalGstAmount: number
  grandTotal: number
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

// When a sale's total invoice amount (Tally-price basis) is at least this, the
// sale is split into 3 SEPARATE sales vouchers for Tally. XML-only — the app
// keeps one invoice.
export const SALES_SPLIT_THRESHOLD = 50000

// Proportional split (40% / 40% / 20%). For a ₹50,000 value this yields
// ₹20,000 + ₹20,000 + ₹10,000 across the 3 vouchers.
const SALES_SPLIT_RATIOS = [0.4, 0.4, 0.2] as const

// Split an amount into 3 parts (40/40/20). The 3rd part takes the remainder so
// the parts sum back to the original EXACTLY — no rounding mismatch.
export function splitAmountIntoThree(amount: number): number[] {
  const a1 = round2(amount * SALES_SPLIT_RATIOS[0])
  const a2 = round2(amount * SALES_SPLIT_RATIOS[1])
  const a3 = round2(amount - a1 - a2)
  return [a1, a2, a3]
}

// Single source of truth for GST maths.
//  - Exempted (gstRate <= 0): every tax rate/amount is 0.
//  - Local:      CGST = SGST = gstRate / 2, IGST = 0.
//  - Interstate: IGST = gstRate, CGST = SGST = 0.
export function calculateGST(opts: {
  taxableAmount: number
  gstRate: number
  gstSupplyType: GstSupplyType
}): GstBreakdown {
  const taxableAmount = round2(opts.taxableAmount)
  const rate = Number(opts.gstRate) || 0

  if (rate <= 0) {
    return {
      taxableAmount,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalGstAmount: 0,
      grandTotal: taxableAmount,
    }
  }

  if (opts.gstSupplyType === 'interstate') {
    const igstAmount = round2((taxableAmount * rate) / 100)
    return {
      taxableAmount,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: rate,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount,
      totalGstAmount: igstAmount,
      grandTotal: round2(taxableAmount + igstAmount),
    }
  }

  const halfRate = rate / 2
  const cgstAmount = round2((taxableAmount * halfRate) / 100)
  const sgstAmount = round2((taxableAmount * halfRate) / 100)
  const totalGstAmount = round2(cgstAmount + sgstAmount)
  return {
    taxableAmount,
    cgstRate: halfRate,
    sgstRate: halfRate,
    igstRate: 0,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
    totalGstAmount,
    grandTotal: round2(taxableAmount + totalGstAmount),
  }
}

export interface VoucherInput {
  date: string // ISO or yyyy-mm-dd
  partyLedger: string
  voucherNumber?: string
  reference?: string
  narration?: string
  items: VoucherItem[]
  // sales-only optional fields
  ewayBillNo?: string
  ewayBillDate?: string
  dispatchFrom?: string
  shipTo?: string
  transporterName?: string
  vehicleNumber?: string
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Tally import accepts YYYYMMDD reliably.
function tallyDate(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value.replace(/-/g, '')
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function qtyWithUnit(qty: number, unit: string): string {
  return `${qty} ${unit || 'Nos'}`
}

// Tax ledger name carrying its rate, e.g. "Input CGST @ 9%". The rate is part
// of the ledger name so it is visible on the voucher line in Tally.
export function gstRateLedgerName(baseName: string, ratePercent: number): string {
  return `${baseName} @ ${ratePercent}%`
}

interface RateGroup {
  cgstRate: number
  sgstRate: number
  igstRate: number
  cgst: number // amount
  sgst: number
  igst: number
}

// Group items' GST by their GST rate so each rate posts its own tax ledger
// line — this is how Tally shows rate-wise GST (e.g. Input CGST @ 9% vs @ 2.5%).
function gstByRate(items: VoucherItem[]): Map<number, RateGroup> {
  const map = new Map<number, RateGroup>()
  for (const it of items) {
    const rate = Number(it.taxPercent || 0)
    if (rate <= 0) continue // exempted — no GST line
    const b = calculateGST({
      taxableAmount: it.baseAmount,
      gstRate: rate,
      gstSupplyType: it.gstSupplyType === 'interstate' ? 'interstate' : 'local',
    })
    const g =
      map.get(rate) ||
      {
        cgstRate: b.cgstRate,
        sgstRate: b.sgstRate,
        igstRate: b.igstRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
      }
    g.cgst += b.cgstAmount
    g.sgst += b.sgstAmount
    g.igst += b.igstAmount
    map.set(rate, g)
  }
  for (const g of map.values()) {
    g.cgst = round2(g.cgst)
    g.sgst = round2(g.sgst)
    g.igst = round2(g.igst)
  }
  return map
}

// Build the rate-wise GST <LEDGERENTRIES.LIST> block and its amount total.
//  Purchase: deemedPositive=true, sign=-1 (input tax debit).
//  Sales:    deemedPositive=false, sign=+1 (output tax credit).
function gstEntriesFromGroups(
  groups: Map<number, RateGroup>,
  ledgers: { cgst: string; sgst: string; igst: string },
  deemedPositive: boolean,
  sign: 1 | -1,
): { xml: string; total: number } {
  let xml = ''
  let total = 0
  for (const rate of [...groups.keys()].sort((a, b) => a - b)) {
    const g = groups.get(rate)!
    if (g.cgst > 0) {
      xml += ledgerEntry(gstRateLedgerName(ledgers.cgst, g.cgstRate), deemedPositive, sign * g.cgst)
      total += g.cgst
    }
    if (g.sgst > 0) {
      xml += ledgerEntry(gstRateLedgerName(ledgers.sgst, g.sgstRate), deemedPositive, sign * g.sgst)
      total += g.sgst
    }
    if (g.igst > 0) {
      xml += ledgerEntry(gstRateLedgerName(ledgers.igst, g.igstRate), deemedPositive, sign * g.igst)
      total += g.igst
    }
  }
  return { xml, total: round2(total) }
}

// Build the rate-wise GST <LEDGERENTRIES.LIST> block and its amount total.
//  Purchase: deemedPositive=true, sign=-1 (input tax debit).
//  Sales:    deemedPositive=false, sign=+1 (output tax credit).
function buildGstEntries(
  items: VoucherItem[],
  ledgers: { cgst: string; sgst: string; igst: string },
  deemedPositive: boolean,
  sign: 1 | -1,
): { xml: string; total: number } {
  return gstEntriesFromGroups(gstByRate(items), ledgers, deemedPositive, sign)
}

// The i-th slice (0..2) of GST groups: each duty-head amount split 40/40/20 with
// the remainder on the 3rd slice, so the 3 slices' GST sums back EXACTLY.
function sliceGstGroups(groups: Map<number, RateGroup>, sliceIndex: number): Map<number, RateGroup> {
  const out = new Map<number, RateGroup>()
  for (const [rate, g] of groups) {
    out.set(rate, {
      cgstRate: g.cgstRate,
      sgstRate: g.sgstRate,
      igstRate: g.igstRate,
      cgst: splitAmountIntoThree(g.cgst)[sliceIndex],
      sgst: splitAmountIntoThree(g.sgst)[sliceIndex],
      igst: splitAmountIntoThree(g.igst)[sliceIndex],
    })
  }
  return out
}

function inventoryEntry(it: VoucherItem, deemedPositive: boolean, signedAmount: number): string {
  const dp = deemedPositive ? 'Yes' : 'No'
  const batchName = it.batch?.trim() || 'Primary Batch'
  // ACTUALQTY/BILLEDQTY are ALWAYS a positive physical quantity. Tally decides
  // stock IN vs OUT from the voucher type (Purchase = inward, Sales = outward)
  // together with ISDEEMEDPOSITIVE — NOT from the quantity's sign. A negative
  // billed qty is read by Tally as a return/reversal, so a purchase sent with
  // a negative qty posts 0 net stock.
  // No EXPIRYDATE: products are not batch/expiry tracked, and sending it makes
  // Tally discard the batch allocation (and the quantity inside it).
  const qtyStr = esc(qtyWithUnit(Math.abs(it.quantity), it.unit))
  return `
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${esc(it.productName)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>${dp}</ISDEEMEDPOSITIVE>
          <RATE>${money(it.rate)}/${esc(it.unit || 'Nos')}</RATE>
          <AMOUNT>${money(signedAmount)}</AMOUNT>
          <ACTUALQTY>${qtyStr}</ACTUALQTY>
          <BILLEDQTY>${qtyStr}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>Main Location</GODOWNNAME>
            <BATCHNAME>${esc(batchName)}</BATCHNAME>
            <AMOUNT>${money(signedAmount)}</AMOUNT>
            <ACTUALQTY>${qtyStr}</ACTUALQTY>
            <BILLEDQTY>${qtyStr}</BILLEDQTY>
          </BATCHALLOCATIONS.LIST>
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${esc(it.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${dp}</ISDEEMEDPOSITIVE>
            <AMOUNT>${money(signedAmount)}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`
}

function ledgerEntry(name: string, deemedPositive: boolean, amount: number): string {
  return `
        <LEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${money(amount)}</AMOUNT>
        </LEDGERENTRIES.LIST>`
}

function envelope(voucher: string): string {
  return envelopeVouchers([voucher])
}

// Wrap one or more <VOUCHER> blocks, each in its own TALLYMESSAGE, so a single
// import can create multiple vouchers (used by the ₹50k+ sales 3-voucher split).
function envelopeVouchers(vouchers: string[]): string {
  const companyVar = TALLY_COMPANY
    ? `<SVCURRENTCOMPANY>${esc(TALLY_COMPANY)}</SVCURRENTCOMPANY>`
    : ''
  const messages = vouchers
    .map((v) => `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${v}\n        </TALLYMESSAGE>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>${companyVar}</STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

export function buildPurchaseVoucherXml(input: VoucherInput): string {
  const base = input.items.reduce((s, it) => s + it.baseAmount, 0)
  // Rate-wise input tax: local => Input CGST/SGST @ rate, interstate => Input
  // IGST @ rate, exempted => nothing. Zero-amount ledgers are never emitted.
  const gst = buildGstEntries(
    input.items,
    { cgst: GST_LEDGERS.inputCgst, sgst: GST_LEDGERS.inputSgst, igst: GST_LEDGERS.inputIgst },
    true,
    -1,
  )
  const total = base + gst.total

  const inventory = input.items
    .map((it) => inventoryEntry(it, true, -it.baseAmount))
    .join('')

  const gstEntries = gst.xml

  const voucher = `          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${tallyDate(input.date)}</DATE>
            <EFFECTIVEDATE>${tallyDate(input.date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <ISINVOICE>Yes</ISINVOICE>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            ${input.voucherNumber ? `<VOUCHERNUMBER>${esc(input.voucherNumber)}</VOUCHERNUMBER>` : ''}
            <REFERENCE>${esc(input.reference || '')}</REFERENCE>
            <PARTYLEDGERNAME>${esc(input.partyLedger)}</PARTYLEDGERNAME>
            <PARTYNAME>${esc(input.partyLedger)}</PARTYNAME>
            <NARRATION>${esc(input.narration || '')}</NARRATION>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(input.partyLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${money(total)}</AMOUNT>
            </LEDGERENTRIES.LIST>${gstEntries}${inventory}
          </VOUCHER>`
  return envelope(voucher)
}

// Build a single <VOUCHER> for a sales invoice (or one slice of a split sale).
function oneSalesVoucher(
  input: VoucherInput,
  partyTotal: number,
  gstXml: string,
  inventoryXml: string,
  reference: string,
  includeEway: boolean,
): string {
  const eway =
    includeEway && (input.ewayBillNo || input.dispatchFrom || input.vehicleNumber)
      ? `
            <BASICSHIPPEDTO>${esc(input.shipTo || '')}</BASICSHIPPEDTO>
            <CONSIGNEEMAILINGNAME>${esc(input.dispatchFrom || '')}</CONSIGNEEMAILINGNAME>
            <EWAYBILLDETAILS.LIST>
              <EWAYBILLNUMBER>${esc(input.ewayBillNo || '')}</EWAYBILLNUMBER>
              <EWAYBILLDATE>${tallyDate(input.ewayBillDate || '')}</EWAYBILLDATE>
              <CONSIGNORDISPATCHFROM>${esc(input.dispatchFrom || '')}</CONSIGNORDISPATCHFROM>
              <TRANSPORTERNAME>${esc(input.transporterName || '')}</TRANSPORTERNAME>
              <VEHICLENUMBER>${esc(input.vehicleNumber || '')}</VEHICLENUMBER>
            </EWAYBILLDETAILS.LIST>`
      : ''
  return `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${tallyDate(input.date)}</DATE>
            <EFFECTIVEDATE>${tallyDate(input.date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <ISINVOICE>Yes</ISINVOICE>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <REFERENCE>${esc(reference)}</REFERENCE>
            <PARTYLEDGERNAME>${esc(input.partyLedger)}</PARTYLEDGERNAME>
            <PARTYNAME>${esc(input.partyLedger)}</PARTYNAME>
            <NARRATION>${esc(input.narration || '')}</NARRATION>${eway}
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(input.partyLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${money(-partyTotal)}</AMOUNT>
            </LEDGERENTRIES.LIST>${gstXml}${inventoryXml}
          </VOUCHER>`
}

export function buildSalesVoucherXml(input: VoucherInput): string {
  const outputLedgers = {
    cgst: GST_LEDGERS.outputCgst,
    sgst: GST_LEDGERS.outputSgst,
    igst: GST_LEDGERS.outputIgst,
  }
  const base = round2(input.items.reduce((s, it) => s + it.baseAmount, 0))
  // Rate-wise output tax (local => CGST/SGST, interstate => IGST, exempt => none).
  const fullGroups = gstByRate(input.items)
  const fullGst = gstEntriesFromGroups(fullGroups, outputLedgers, false, 1)
  const total = round2(base + fullGst.total)
  const baseRef = input.reference || input.voucherNumber || ''

  // Below ₹50,000 (Tally-price basis) → one normal voucher (unchanged).
  if (total < SALES_SPLIT_THRESHOLD) {
    const inventory = input.items.map((it) => inventoryEntry(it, false, it.baseAmount)).join('')
    return envelope(oneSalesVoucher(input, total, fullGst.xml, inventory, baseRef, true))
  }

  // ₹50,000+ → 3 SEPARATE sales vouchers, each a proportional slice (40/40/20)
  // of every item's quantity + amount AND of the GST. The app keeps one invoice;
  // only the Tally XML is split. The 3 vouchers sum back to the original exactly.
  const origQty = round2(input.items.reduce((s, it) => s + it.quantity, 0))
  const vouchers: string[] = []
  let sumBase = 0
  let sumGst = 0
  let sumQty = 0
  let sumTotal = 0
  for (let s = 0; s < 3; s++) {
    const sliceItems = input.items.map((it) => ({
      ...it,
      baseAmount: splitAmountIntoThree(it.baseAmount)[s],
      quantity: splitAmountIntoThree(it.quantity)[s],
    }))
    const sliceBase = round2(sliceItems.reduce((a, it) => a + it.baseAmount, 0))
    const sliceGst = gstEntriesFromGroups(sliceGstGroups(fullGroups, s), outputLedgers, false, 1)
    const sliceTotal = round2(sliceBase + sliceGst.total)
    const inventory = sliceItems.map((it) => inventoryEntry(it, false, it.baseAmount)).join('')
    vouchers.push(
      oneSalesVoucher(input, sliceTotal, sliceGst.xml, inventory, `${baseRef} - ${s + 1}/3`, s === 0),
    )
    sumBase = round2(sumBase + sliceBase)
    sumGst = round2(sumGst + sliceGst.total)
    sumQty = round2(sumQty + sliceItems.reduce((a, it) => a + it.quantity, 0))
    sumTotal = round2(sumTotal + sliceTotal)
  }
  // Reconciliation guard — the 3 vouchers MUST sum to the original exactly.
  if (
    sumBase !== base ||
    sumGst !== round2(fullGst.total) ||
    sumQty !== origQty ||
    sumTotal !== total
  ) {
    throw new Error(
      `Sales split reconciliation failed: base ${base}/${sumBase}, gst ${round2(fullGst.total)}/${sumGst}, qty ${origQty}/${sumQty}, total ${total}/${sumTotal}`,
    )
  }
  return envelopeVouchers(vouchers)
}
