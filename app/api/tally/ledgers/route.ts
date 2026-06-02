import { NextResponse } from 'next/server'
import { fetchTallyLedgers } from '@/lib/tally/tallyLedgers'
import { setTallyUrlForRequest } from '@/lib/tally/tallyContext'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tally/ledgers
// Returns the list of ledgers currently in TallyPrime so the UI can let users
// map a customer/supplier to an exact existing ledger name.
export async function GET(request: Request) {
  setTallyUrlForRequest(request)
  try {
    const ledgers = await fetchTallyLedgers()
    return NextResponse.json({ ledgers })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, ledgers: [] },
      { status: 503 },
    )
  }
}
