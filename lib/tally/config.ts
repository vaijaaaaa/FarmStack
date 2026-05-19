// Tally connection + ledger configuration. Override via env vars if your
// TallyPrime company uses different ledger names.
export const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000'

// Empty => Tally uses whichever company is currently open.
export const TALLY_COMPANY = process.env.TALLY_COMPANY || ''

// GST ledger names. These ledgers must already exist in TallyPrime.
export const GST_LEDGERS = {
  inputCgst: process.env.TALLY_INPUT_CGST || 'Input CGST',
  inputSgst: process.env.TALLY_INPUT_SGST || 'Input SGST',
  outputCgst: process.env.TALLY_OUTPUT_CGST || 'Output CGST',
  outputSgst: process.env.TALLY_OUTPUT_SGST || 'Output SGST',
}

export const TALLY_TIMEOUT_MS = Number(process.env.TALLY_TIMEOUT_MS || 20000)
