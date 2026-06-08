import { NextResponse } from 'next/server'
import { query, execute, newId, nowIso } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query(
      'SELECT id, name, description, start_date, end_date, created_at FROM seasons ORDER BY created_at DESC',
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
      start_date: String(body.start_date ?? '').trim(),
      end_date: String(body.end_date ?? '').trim(),
      created_at: nowIso(),
    }

    await execute(
      'INSERT INTO seasons (id, name, description, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [season.id, season.name, season.description, season.start_date, season.end_date, season.created_at],
    )

    return NextResponse.json(season, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Update a season's fields (name/description/date range).
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = String(body.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'Season id is required' }, { status: 400 })
    }
    await execute(
      'UPDATE seasons SET name = ?, description = ?, start_date = ?, end_date = ? WHERE id = ?',
      [
        String(body.name ?? '').trim(),
        String(body.description ?? '').trim(),
        String(body.start_date ?? '').trim(),
        String(body.end_date ?? '').trim(),
        id,
      ],
    )
    return NextResponse.json({ id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
