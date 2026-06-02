// Server-only Postgres layer (Supabase) using the `pg` driver.
// Keeps the same query/execute/transaction interface the old sql.js layer had,
// so the API routes keep their existing `?`-placeholder SQL unchanged.
import { Pool, types } from 'pg'

// COUNT(*) and other bigint (int8/oid 20) columns come back as strings by
// default; parse them to JS numbers so `count + 1` arithmetic stays correct.
types.setTypeParser(20, (v) => parseInt(v, 10))

type SqlValue = string | number | null
type Row = Record<string, SqlValue>

// Cache the pool on globalThis so Next.js dev hot-reloads reuse one pool
// instead of creating a new one each time (which leaked connections and
// exhausted Supabase's pooler client limit).
const globalForDb = globalThis as unknown as { _farmstackPool?: Pool }

function getPool(): Pool {
  if (!globalForDb._farmstackPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Add your Supabase Postgres connection string to .env.local')
    }
    const pool = new Pool({
      connectionString,
      // Supabase requires TLS; its cert chain isn't in Node's default store.
      ssl: { rejectUnauthorized: false },
      // Keep this well under Supabase's pooler client limit.
      max: 5,
      keepAlive: true,
      // Release connections after 30s idle so they don't accumulate against
      // the pooler cap, while staying warm during active use.
      idleTimeoutMillis: 30000,
    })
    // Pre-open a couple connections so the first page load is already warm.
    for (let i = 0; i < 2; i++) {
      pool.query('SELECT 1').catch(() => {})
    }
    globalForDb._farmstackPool = pool
  }
  return globalForDb._farmstackPool
}

// Translate sql.js `?` placeholders into Postgres `$1, $2, ...`.
function toPg(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

export async function query<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  const res = await getPool().query(toPg(sql), params)
  return res.rows as T[]
}

export async function queryOne<T = Row>(sql: string, params: SqlValue[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params: SqlValue[] = []): Promise<void> {
  await getPool().query(toPg(sql), params)
}

// Run multiple statements atomically. The callback synchronously queues
// statements via `run`, which are then executed in order inside a single
// Postgres transaction on one pooled connection.
export async function transaction(
  work: (run: (sql: string, params?: SqlValue[]) => void) => void,
): Promise<void> {
  const statements: Array<{ sql: string; params: SqlValue[] }> = []
  work((sql, params = []) => statements.push({ sql, params }))

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    for (const s of statements) {
      await client.query(toPg(s.sql), s.params)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
