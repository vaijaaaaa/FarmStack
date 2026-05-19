// Parses TallyPrime's IMPORTRESULT / RESPONSE XML into a usable result.

export interface TallyParseResult {
  success: boolean
  created: number
  altered: number
  errors: number
  exceptions: number
  voucherId: string | null
  message: string
  raw: string
}

function tagInt(xml: string, tag: string): number {
  const m = new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`, 'i').exec(xml)
  return m ? parseInt(m[1], 10) : 0
}

function decodeEntities(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function tagText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return m ? decodeEntities(m[1].trim()) : ''
}

function friendly(rawError: string): string {
  const e = rawError.toLowerCase()
  if (e.includes('does not exist') && e.includes('ledger')) {
    return `Ledger does not exist in Tally: ${rawError}`
  }
  if (e.includes('stock item') && e.includes('does not exist')) {
    return `Stock item does not exist in Tally: ${rawError}`
  }
  if (e.includes('unit')) return `Unit problem in Tally: ${rawError}`
  if (e.includes('date is missing') || (e.includes('date') && e.includes('split'))) {
    return (
      'Tally rejected this voucher date — it is outside your TallyPrime company\'s ' +
      'open financial year/period. ' +
      'How to fix: click "Edit date & sync" here, choose a date that falls inside ' +
      'the period your Tally is currently open in (the working date shown in Tally, ' +
      'e.g. a date in the current financial year), then Save & Sync. ' +
      `(Tally\'s raw message: ${rawError})`
    )
  }
  if (e.includes('date')) return `Voucher date problem: ${rawError}`
  if (e.includes('company')) return `Tally company problem: ${rawError}`
  return rawError
}

export function parseTallyResponse(raw: string): TallyParseResult {
  const created = tagInt(raw, 'CREATED')
  const altered = tagInt(raw, 'ALTERED')
  const errors = tagInt(raw, 'ERRORS')
  const exceptions = tagInt(raw, 'EXCEPTIONS')
  const lastVchRaw = tagText(raw, 'LASTVCHID')
  const lastVch = lastVchRaw && lastVchRaw !== '0' ? lastVchRaw : ''
  const lineError =
    tagText(raw, 'LINEERROR') || tagText(raw, 'DESC') || tagText(raw, 'ERRORLIST')

  // A plain text/non-XML body (e.g. connection page) is treated as failure.
  const looksLikeImport = /IMPORTRESULT|RESPONSE|LINEERROR|CREATED/i.test(raw)

  const success = looksLikeImport && errors === 0 && exceptions === 0 && (created > 0 || altered > 0)

  let message: string
  if (success) {
    message =
      created > 0
        ? 'Voucher created in Tally successfully'
        : 'Voucher already existed in Tally (updated)'
  } else if (lineError) {
    message = friendly(lineError)
  } else if (!looksLikeImport) {
    message = `Unexpected response from Tally: ${raw.slice(0, 200)}`
  } else {
    message = `Tally rejected the voucher (errors: ${errors}, exceptions: ${exceptions}).`
  }

  return {
    success,
    created,
    altered,
    errors,
    exceptions,
    voucherId: lastVch || null,
    message,
    raw,
  }
}
