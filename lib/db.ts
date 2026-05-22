// Server-only SQLite layer backed by sql.js (WASM) with file persistence.
// One farmstack.db file at the project root acts as the offline working database.
import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = path.join(process.cwd(), 'farmstack.db')
const WASM_PATH = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kannada_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  kannada_address TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  acres TEXT DEFAULT '',
  loyalty TEXT DEFAULT '',
  referral TEXT DEFAULT '',
  display_number TEXT DEFAULT '',
  tally_ledger_name TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kannada_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  kannada_address TEXT DEFAULT '',
  state TEXT DEFAULT '',
  country TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  place_of_supply TEXT DEFAULT '',
  tally_ledger_name TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kannada_name TEXT DEFAULT '',
  hsn_code TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  product_type TEXT DEFAULT '',
  location TEXT DEFAULT '',
  gst_rate REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  tally_price REAL DEFAULT 0,
  expiry_date TEXT DEFAULT '',
  maintain_batches INTEGER DEFAULT 0,
  gst_supply_type TEXT DEFAULT 'local',
  batch TEXT DEFAULT '',
  tally_stock_item_name TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  tax REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT DEFAULT '',
  tally_name TEXT DEFAULT '',
  date TEXT DEFAULT '',
  sale_type TEXT DEFAULT 'cash',
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'saved',
  eway_bill_no TEXT,
  eway_bill_date TEXT,
  dispatch_from TEXT,
  ship_to TEXT,
  transporter_name TEXT,
  transporter_id TEXT,
  transport_mode TEXT,
  transport_doc_no TEXT,
  transport_doc_date TEXT,
  vehicle_number TEXT,
  vehicle_type TEXT,
  tally_sync_enabled INTEGER DEFAULT 0,
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
  tally_voucher_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id TEXT,
  batch TEXT DEFAULT '',
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  tally_price REAL DEFAULT 0,
  gst REAL DEFAULT 0,
  type TEXT DEFAULT '',
  unit TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT DEFAULT '',
  supplier_invoice_number TEXT DEFAULT '',
  purchase_date TEXT DEFAULT '',
  tally_status INTEGER DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'saved',
  tally_sync_enabled INTEGER DEFAULT 0,
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
  tally_voucher_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT DEFAULT '',
  quantity REAL DEFAULT 0,
  buying_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  tally_price REAL DEFAULT 0,
  expiry_date TEXT DEFAULT '',
  type TEXT DEFAULT '',
  tax REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  batch TEXT DEFAULT '',
  unit TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON purchase_items(invoice_id);
`

type SqlValue = string | number | null
type Row = Record<string, SqlValue>

// Only the WASM engine is cached as a singleton. The Database itself is
// (re)loaded from the farmstack.db file for every operation so that multiple
// module instances (Next.js dev hot-reload) never read stale in-memory state.
let sqlEnginePromise: Promise<any> | null = null

function getEngine(): Promise<any> {
  if (!sqlEnginePromise) {
    sqlEnginePromise = (async () => {
      const mod: any = await import('sql.js')
      const initSqlJs = mod.default ?? mod
      return initSqlJs({ locateFile: () => WASM_PATH })
    })()
  }
  return sqlEnginePromise
}

function ensureColumn(db: any, table: string, column: string, definition: string): void {
  const result = db.exec(`PRAGMA table_info(${table});`)
  const columns = result[0]?.values?.map((row: unknown[]) => row[1]) ?? []
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`)
  }
}

function applySchema(db: any): void {
  db.run('PRAGMA foreign_keys = ON;')
  db.run(SCHEMA)
  ensureColumn(db, 'products', 'location', "TEXT DEFAULT ''")
  ensureColumn(db, 'products', 'gst_supply_type', "TEXT DEFAULT 'local'")
  ensureColumn(db, 'products', 'batch', "TEXT DEFAULT ''")
  const tallyColumns: Array<[string, string]> = [
    ['tally_sync_enabled', 'INTEGER DEFAULT 0'],
    ['tally_sync_status', "TEXT DEFAULT 'not_synced'"],
    ['tally_response', 'TEXT'],
    ['tally_synced_at', 'TEXT'],
    ['tally_voucher_id', 'TEXT'],
  ]
  for (const table of ['purchase_invoices', 'sales_invoices']) {
    for (const [col, def] of tallyColumns) ensureColumn(db, table, col, def)
  }
  ensureColumn(db, 'sales_items', 'type', "TEXT DEFAULT ''")
  ensureColumn(db, 'sales_items', 'unit', "TEXT DEFAULT ''")
  ensureColumn(db, 'sales_invoices', 'sale_type', "TEXT DEFAULT 'cash'")
  ensureColumn(db, 'purchase_items', 'batch', "TEXT DEFAULT ''")
  ensureColumn(db, 'purchase_items', 'unit', "TEXT DEFAULT ''")
  ensureColumn(db, 'suppliers', 'country', "TEXT DEFAULT ''")
  ensureColumn(db, 'suppliers', 'place_of_supply', "TEXT DEFAULT ''")
  const masterTallyColumns: Array<[string, string]> = [
    ['tally_sync_status', "TEXT DEFAULT 'not_synced'"],
    ['tally_response', 'TEXT'],
    ['tally_synced_at', 'TEXT'],
  ]
  ensureColumn(db, 'customers', 'state', "TEXT DEFAULT ''")
  ensureColumn(db, 'customers', 'country', "TEXT DEFAULT ''")
  ensureColumn(db, 'customers', 'acres', "TEXT DEFAULT ''")
  ensureColumn(db, 'customers', 'loyalty', "TEXT DEFAULT ''")
  ensureColumn(db, 'customers', 'referral', "TEXT DEFAULT ''")
  ensureColumn(db, 'customers', 'display_number', "TEXT DEFAULT ''")
  for (const table of ['customers', 'suppliers', 'products', 'product_types']) {
    for (const [col, def] of masterTallyColumns) ensureColumn(db, table, col, def)
  }
}

async function openDb(): Promise<any> {
  const SQL = await getEngine()
  const existed = fs.existsSync(DB_PATH)
  const db = existed
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database()
  applySchema(db)
  if (!existed) persistNow(db)
  return db
}

function persistNow(db: any): void {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()))
}

// Serialize all DB access so concurrent requests can't corrupt the file.
let chain: Promise<unknown> = Promise.resolve()

function withDb<T>(fn: (db: any) => T, write = false): Promise<T> {
  const run = chain.then(async () => {
    const db = await openDb()
    try {
      const result = fn(db)
      if (write) persistNow(db)
      return result
    } finally {
      try {
        db.close()
      } catch {
        /* ignore */
      }
    }
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function query<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  return withDb((db) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    stmt.free()
    return rows
  })
}

export function queryOne<T = Row>(sql: string, params: SqlValue[] = []): Promise<T | null> {
  return query<T>(sql, params).then((rows) => rows[0] ?? null)
}

export function execute(sql: string, params: SqlValue[] = []): Promise<void> {
  return withDb((db) => {
    db.run(sql, params)
  }, true)
}

// Run multiple statements atomically. The callback receives a `run` helper.
export function transaction(
  work: (run: (sql: string, params?: SqlValue[]) => void) => void,
): Promise<void> {
  return withDb((db) => {
    db.run('BEGIN;')
    try {
      work((sql, params = []) => db.run(sql, params))
      db.run('COMMIT;')
    } catch (err) {
      db.run('ROLLBACK;')
      throw err
    }
  }, true)
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
