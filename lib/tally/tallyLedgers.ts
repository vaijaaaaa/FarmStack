// Reads the list of existing ledgers (parties) from TallyPrime so users can
// map a customer/supplier to the EXACT ledger name already in Tally. A single
// character mismatch makes Tally reject the voucher, so picking from this list
// instead of typing prevents sync failures.
import { postXml } from './tallyClient'
import { TALLY_COMPANY } from './config'

export interface TallyLedger {
  name: string
  parent: string
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function buildLedgersRequestXml(): string {
  const companyVar = TALLY_COMPANY
    ? `<SVCURRENTCOMPANY>${esc(TALLY_COMPANY)}</SVCURRENTCOMPANY>`
    : ''
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FarmStackLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${companyVar}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FarmStackLedgers" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`
}

function parseLedgers(xml: string): TallyLedger[] {
  const ledgers: TallyLedger[] = []
  const seen = new Set<string>()
  // Each ledger comes back as <LEDGER NAME="..."> ... <PARENT>..</PARENT> </LEDGER>
  const ledgerRe = /<LEDGER\b[^>]*\bNAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi
  let m: RegExpExecArray | null
  while ((m = ledgerRe.exec(xml)) !== null) {
    const name = decodeEntities(m[1])
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const parentMatch = /<PARENT\b[^>]*>([\s\S]*?)<\/PARENT>/i.exec(m[2])
    ledgers.push({
      name,
      parent: parentMatch ? decodeEntities(parentMatch[1]) : '',
    })
  }
  ledgers.sort((a, b) => a.name.localeCompare(b.name))
  return ledgers
}

export async function fetchTallyLedgers(): Promise<TallyLedger[]> {
  const raw = await postXml(buildLedgersRequestXml())
  if (/<LINEERROR>/i.test(raw)) {
    const err = /<LINEERROR>([\s\S]*?)<\/LINEERROR>/i.exec(raw)
    throw new Error(`Tally rejected the ledger request: ${err ? decodeEntities(err[1]) : 'unknown error'}`)
  }
  return parseLedgers(raw)
}
