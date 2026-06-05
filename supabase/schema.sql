-- FarmStack schema for Supabase (PostgreSQL).
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Mirrors the original sql.js schema; boolean-style flags stay INTEGER (0/1)
-- and money/quantity stay REAL so the existing API route code works unchanged.

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
  aadhar_card TEXT DEFAULT '',
  tally_ledger_name TEXT DEFAULT '',
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
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
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
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
  is_seed INTEGER DEFAULT 0,
  tally_stock_item_name TEXT DEFAULT '',
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  tax REAL DEFAULT 0,
  tally_sync_status TEXT DEFAULT 'not_synced',
  tally_response TEXT,
  tally_synced_at TEXT,
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

-- Accounts module: a season is a named period (e.g. "2026 Dalwa").
-- name/description are optional (not mandatory) so both default to ''.
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- Entries: cash/credit money movements recorded against a customer within a
-- season. Each row feeds that customer's season ledger (cash = credit / money
-- received, credit = debit / amount charged). `type` is 'cash' or 'credit'.
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id),
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT DEFAULT '',
  type TEXT DEFAULT 'cash',
  date TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  comments TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON purchase_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created ON sales_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_created ON purchase_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_season ON entries(season_id);
CREATE INDEX IF NOT EXISTS idx_entries_customer ON entries(customer_id);
