// Builds TallyPrime "All Masters" import XML for Ledgers, Units and Stock Items.
import { TALLY_COMPANY } from './config'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function ledgerMessage(
  name: string,
  parent: string,
  opts: { gstin?: string; billwise?: boolean } = {},
): string {
  const gstin = opts.gstin
    ? `<PARTYGSTIN>${esc(opts.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>`
    : ''
  const billwise = opts.billwise ? '<ISBILLWISEON>Yes</ISBILLWISEON>' : ''
  // Purchase/Sales account ledgers are the accounting allocation for stock
  // items in item invoices. They MUST have "Inventory values are affected"
  // (AFFECTSSTOCK = Yes), otherwise Tally silently drops the inventory line
  // from imported vouchers and the voucher posts as accounting-only.
  const affectsStock =
    parent === 'Purchase Accounts' || parent === 'Sales Accounts'
      ? '<AFFECTSSTOCK>Yes</AFFECTSSTOCK>'
      : ''
  return `<LEDGER NAME="${esc(name)}" ACTION="Create">
        <NAME>${esc(name)}</NAME>
        <PARENT>${esc(parent)}</PARENT>
        ${affectsStock}${billwise}${gstin}
      </LEDGER>`
}

// GST tax ledger under "Duties & Taxes" (TallyPrime GST classification).
export function gstLedgerMessage(
  name: string,
  dutyHead: 'Central Tax' | 'State Tax' | 'Integrated Tax',
): string {
  return `<LEDGER NAME="${esc(name)}" ACTION="Create">
        <NAME>${esc(name)}</NAME>
        <PARENT>${esc('Duties & Taxes')}</PARENT>
        <TAXTYPE>GST</TAXTYPE>
        <GSTDUTYHEAD>${esc(dutyHead)}</GSTDUTYHEAD>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      </LEDGER>`
}

export function unitMessage(name: string): string {
  const u = name || 'Nos'
  return `<UNIT NAME="${esc(u)}" ACTION="Create">
        <NAME>${esc(u)}</NAME>
        <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
      </UNIT>`
}

export function stockItemMessage(
  name: string,
  baseUnit: string,
  opts: { hsn?: string; gstRate?: number } = {},
): string {
  const u = baseUnit || 'Nos'
  const rate = Number(opts.gstRate || 0)
  const hsn = String(opts.hsn ?? '').trim()
  // When the product has a GST rate, declare full GST details on the stock
  // item. Without this, Tally's GST purchase (Input Tax Credit) processing
  // cannot reconcile the tax and silently drops the item from the voucher.
  let gst = ''
  if (rate > 0) {
    const half = rate / 2
    gst = `
        <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
        <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
        <GSTDETAILS.LIST>
          <APPLICABLEFROM>20170701</APPLICABLEFROM>
          <CALCULATIONTYPE>On Value</CALCULATIONTYPE>
          <HSNCODE>${esc(hsn)}</HSNCODE>
          <TAXABILITY>Taxable</TAXABILITY>
          <STATEWISEDETAILS.LIST>
            <STATENAME>Any</STATENAME>
            <RATEDETAILS.LIST>
              <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
              <GSTRATE>${half}</GSTRATE>
            </RATEDETAILS.LIST>
            <RATEDETAILS.LIST>
              <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
              <GSTRATE>${half}</GSTRATE>
            </RATEDETAILS.LIST>
            <RATEDETAILS.LIST>
              <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
              <GSTRATE>${rate}</GSTRATE>
            </RATEDETAILS.LIST>
          </STATEWISEDETAILS.LIST>
        </GSTDETAILS.LIST>`
  }
  return `<STOCKITEM NAME="${esc(name)}" ACTION="Create">
        <NAME>${esc(name)}</NAME>
        <BASEUNITS>${esc(u)}</BASEUNITS>${gst}
      </STOCKITEM>`
}

// Group a product/sale "type" name into the right Tally accounts group.
export function ledgerGroupForType(typeName: string): string {
  return typeName.toLowerCase().startsWith('sales')
    ? 'Sales Accounts'
    : 'Purchase Accounts'
}

export function buildMastersEnvelope(messages: string[]): string {
  const companyVar = TALLY_COMPANY
    ? `<SVCURRENTCOMPANY>${esc(TALLY_COMPANY)}</SVCURRENTCOMPANY>`
    : ''
  const body = messages
    .filter(Boolean)
    .map((m) => `      <TALLYMESSAGE xmlns:UDF="TallyUDF">\n        ${m}\n      </TALLYMESSAGE>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>${companyVar}</STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${body}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}
