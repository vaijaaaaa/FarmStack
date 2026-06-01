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

export interface LedgerOpts {
  gstin?: string
  billwise?: boolean
  address?: string
  state?: string
  country?: string
  phone?: string
}

// GST-era applicability date used by TallyPrime's dated "*.LIST" detail blocks.
// A LIST block WITHOUT an APPLICABLEFROM date is silently ignored by Tally, so
// every mailing/GST detail list must carry this.
const GST_APPLICABLE_FROM = '20170701'

export function ledgerMessage(name: string, parent: string, opts: LedgerOpts = {}): string {
  const billwise = opts.billwise ? '<ISBILLWISEON>Yes</ISBILLWISEON>' : ''
  // Purchase/Sales account ledgers are the accounting allocation for stock
  // items in item invoices. They MUST have "Inventory values are affected"
  // (AFFECTSSTOCK = Yes), otherwise Tally silently drops the inventory line
  // from imported vouchers and the voucher posts as accounting-only.
  const affectsStock =
    parent === 'Purchase Accounts' || parent === 'Sales Accounts'
      ? '<AFFECTSSTOCK>Yes</AFFECTSSTOCK>'
      : ''

  const country = opts.country?.trim()
  const state = opts.state?.trim()
  const gstin = opts.gstin?.trim()
  const address = opts.address?.trim()
  const phone = opts.phone?.trim()

  // ---- Top-level mailing / contact tags (per Tally sample XML) ----
  let top = ''
  if (country) top += `<COUNTRYNAME>${esc(country)}</COUNTRYNAME>`
  if (state) top += `<LEDSTATENAME>${esc(state)}</LEDSTATENAME>`
  if (gstin) {
    top += `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>`
    top += `<PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>`
  }
  if (phone) {
    top += `<LEDGERPHONE>${esc(phone)}</LEDGERPHONE>`
    top += `<LEDGERMOBILE>${esc(phone)}</LEDGERMOBILE>`
  }

  // Only attach mailing-name / address lists for party ledgers that have them.
  const hasMailing = !!(address || state || country)
  let mailingLists = ''
  if (hasMailing) {
    mailingLists += `<MAILINGNAME.LIST TYPE="String"><MAILINGNAME>${esc(name)}</MAILINGNAME></MAILINGNAME.LIST>`
    if (address) {
      mailingLists += `<ADDRESS.LIST TYPE="String"><ADDRESS>${esc(address)}</ADDRESS></ADDRESS.LIST>`
    }
    // Dated mailing-details block — TallyPrime reads "Mailing Details"
    // (address + state + country) from here. MUST carry APPLICABLEFROM.
    mailingLists +=
      `<LEDMAILINGDETAILS.LIST>` +
      `<APPLICABLEFROM>${GST_APPLICABLE_FROM}</APPLICABLEFROM>` +
      `<MAILINGNAME>${esc(name)}</MAILINGNAME>` +
      (address ? `<ADDRESS.LIST TYPE="String"><ADDRESS>${esc(address)}</ADDRESS></ADDRESS.LIST>` : '') +
      (state ? `<STATE>${esc(state)}</STATE>` : '') +
      (country ? `<COUNTRY>${esc(country)}</COUNTRY>` : '') +
      `</LEDMAILINGDETAILS.LIST>`
  }

  // Dated GST-registration block — populates Statutory > GST Registration
  // Details (registration type + GSTIN/UIN). MUST carry APPLICABLEFROM.
  let gstReg = ''
  if (gstin) {
    gstReg =
      `<LEDGSTREGDETAILS.LIST>` +
      `<APPLICABLEFROM>${GST_APPLICABLE_FROM}</APPLICABLEFROM>` +
      `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` +
      (state ? `<PLACEOFSUPPLY>${esc(state)}</PLACEOFSUPPLY>` : '') +
      `<GSTIN>${esc(gstin)}</GSTIN>` +
      `</LEDGSTREGDETAILS.LIST>`
  }

  return `<LEDGER NAME="${esc(name)}" ACTION="Create">
        <NAME>${esc(name)}</NAME>
        <PARENT>${esc(parent)}</PARENT>
        ${affectsStock}${billwise}${top}${mailingLists}${gstReg}
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
