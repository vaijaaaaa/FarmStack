import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query(
      'SELECT id, name, description, created_at FROM seasons ORDER BY created_at DESC',
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const season = {
      id: newId(),
      name: String(body.name ?? '').trim(),
      description: String(body.description ?? '').trim(),
      created_at: nowIso(),
    }

    await execute(
      'INSERT INTO seasons (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [season.id, season.name, season.description, season.created_at],
    )

    return NextResponse.json(season, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
