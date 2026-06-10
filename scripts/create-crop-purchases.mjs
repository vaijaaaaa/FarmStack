// One-off migration: create the crop_purchases table + indexes.
// Run: node scripts/create-crop-purchases.mjs
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'

// Load DATABASE_URL from .env.local (standalone node doesn't read it automatically).
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
if (!match) throw new Error('DATABASE_URL not found in .env.local')
const connectionString = match[1].trim()

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 })

const sql = `
CREATE TABLE IF NOT EXISTS crop_purchases (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id),
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT DEFAULT '',
  is_walkin INTEGER DEFAULT 0,
  bags REAL DEFAULT 0,
  weight REAL DEFAULT 0,
  price REAL DEFAULT 0,
  vehicle_number TEXT DEFAULT '',
  labour_per_bag REAL DEFAULT 0,
  wt_adj_per_bag REAL DEFAULT 0,
  less_percent REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  date TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crop_purchases_season ON crop_purchases(season_id);
CREATE INDEX IF NOT EXISTS idx_crop_purchases_customer ON crop_purchases(customer_id);
`

try {
  await pool.query(sql)
  const check = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'crop_purchases' ORDER BY ordinal_position",
  )
  console.log('crop_purchases created. Columns:', check.rows.map((r) => r.column_name).join(', '))
} finally {
  await pool.end()
}
