// Builds TallyPrime import XML for Purchase and Sales vouchers.
// Sign convention used (Tally invoice voucher view):
//   Purchase: party ledger credit (+total), purchase ledger + GST input debit (-amount)
//   Sales:    party ledger debit (-total), sales ledger + GST output credit (+amount)
import { TALLY_COMPANY, GST_LEDGERS } from './config'

export interface VoucherItem {
  productName: string
  unit: string
  quantity: number
  rate: number
  baseAmount: number
  ledgerName: string // FarmStack "type" => purchase/sales ledger
  taxPercent: number
  batch?: string
  expiryDate?: string
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

interface GstTotals {
  cgst: number
  sgst: number
}

function gstFor(items: VoucherItem[]): GstTotals {
  let cgst = 0
  let sgst = 0
  for (const it of items) {
    const gst = it.baseAmount * (it.taxPercent || 0) / 100
    cgst += gst / 2
    sgst += gst / 2
  }
  return { cgst: Math.round(cgst * 100) / 100, sgst: Math.round(sgst * 100) / 100 }
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
  const companyVar = TALLY_COMPANY
    ? `<SVCURRENTCOMPANY>${esc(TALLY_COMPANY)}</SVCURRENTCOMPANY>`
    : ''
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
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucher}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

export function buildPurchaseVoucherXml(input: VoucherInput): string {
  const base = input.items.reduce((s, it) => s + it.baseAmount, 0)
  const { cgst, sgst } = gstFor(input.items)
  const total = base + cgst + sgst

  const inventory = input.items
    .map((it) => inventoryEntry(it, true, -it.baseAmount))
    .join('')

  const gstEntries =
    cgst + sgst > 0
      ? ledgerEntry(GST_LEDGERS.inputCgst, true, -cgst) +
        ledgerEntry(GST_LEDGERS.inputSgst, true, -sgst)
      : ''

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

export function buildSalesVoucherXml(input: VoucherInput): string {
  const base = input.items.reduce((s, it) => s + it.baseAmount, 0)
  const { cgst, sgst } = gstFor(input.items)
  const total = base + cgst + sgst

  const inventory = input.items
    .map((it) => inventoryEntry(it, false, it.baseAmount))
    .join('')

  const gstEntries =
    cgst + sgst > 0
      ? ledgerEntry(GST_LEDGERS.outputCgst, false, cgst) +
        ledgerEntry(GST_LEDGERS.outputSgst, false, sgst)
      : ''

  const eway =
    input.ewayBillNo || input.dispatchFrom || input.vehicleNumber
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

  const voucher = `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${tallyDate(input.date)}</DATE>
            <EFFECTIVEDATE>${tallyDate(input.date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <ISINVOICE>Yes</ISINVOICE>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <REFERENCE>${esc(input.reference || input.voucherNumber || '')}</REFERENCE>
            <PARTYLEDGERNAME>${esc(input.partyLedger)}</PARTYLEDGERNAME>
            <PARTYNAME>${esc(input.partyLedger)}</PARTYNAME>
            <NARRATION>${esc(input.narration || '')}</NARRATION>${eway}
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(input.partyLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${money(-total)}</AMOUNT>
            </LEDGERENTRIES.LIST>${gstEntries}${inventory}
          </VOUCHER>`
  return envelope(voucher)
}
