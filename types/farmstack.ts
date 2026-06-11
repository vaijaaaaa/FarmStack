export type Language = 'en' | 'kn'
export type UserRole = 'user' | 'admin'

export interface Season {
  id: string
  name: string
  description: string
  start_date?: string
  end_date?: string
  created_at?: string
}

export type EntryType = 'cash' | 'credit'

// A cash/credit money movement against a customer within a season.
// Feeds that customer's season ledger.
export interface Entry {
  id: string
  season_id: string
  customer_id: string
  customer_name: string
  type: EntryType
  date: string // YYYY-MM-DD
  amount: number
  comments: string
  location: string
  created_at?: string
}

// A customer attached to a season (the "Ledger Adding" record). Sales + entries
// for this customer flow into this ledger; opening_balance carries from a prior
// season's closure.
export interface LedgerRecord {
  id: string
  season_id: string
  customer_id: string
  customer_name: string
  user_name: string
  description: string
  acres: number
  credit_limit: number
  display_number: number
  closure_date: string
  opening_balance: number
  closing_balance?: number
  carried?: number
  status: 'open' | 'closed'
  created_at?: string
}

// A crop ("Patti") purchase: the shop buys crop from a farmer. For DB customers
// the net value posts to their season ledger as a credit; walk-ins (customer_id
// null, is_walkin 1) are recorded only.
export interface CropPurchase {
  id: string
  season_id: string
  customer_id: string | null
  customer_name: string
  is_walkin: number // 1 = walk-in
  bags: number
  weight: number
  price: number // per-quintal rate
  vehicle_number: string
  labour_per_bag: number
  wt_adj_per_bag: number
  less_percent: number
  net_amount: number
  date: string // YYYY-MM-DD
  created_at?: string
}

export interface TallyMasterFields {
  tally_sync_status?: string
  tally_response?: string | null
  tally_synced_at?: string | null
}

export interface Customer extends TallyMasterFields {
  id: string
  name: string
  kannada_name: string
  phone: string
  address: string
  kannada_address: string
  state?: string
  country?: string
  gstin: string
  acres?: string
  loyalty?: string
  referral?: string
  display_number?: string
  aadhar_card?: string
  tally_ledger_name: string
}

export interface Supplier extends TallyMasterFields {
  id: string
  name: string
  kannada_name: string
  phone: string
  address: string
  kannada_address: string
  state?: string
  country?: string
  gstin: string
  place_of_supply?: string
  tally_ledger_name: string
}

export interface Product extends TallyMasterFields {
  id: string
  name: string
  kannada_name: string
  hsn_code: string
  unit: string
  product_type: string
  location?: string
  gst_rate?: number
  selling_price?: number
  tally_price?: number
  expiry_date?: string
  maintain_batches: boolean
  gst_supply_type?: string
  batch?: string
  is_seed?: boolean
  tally_stock_item_name: string
}

export interface ProductType extends TallyMasterFields {
  id: string
  name: string
  description: string
  tax: number
}

export interface InvoiceItem {
  id: string
  product_id: string
  batch: string
  quantity: number
  rate: number
  tally_price: number
  gst: number
  type?: string
  unit?: string
}

export type SaleType = 'cash' | 'credit'

export type TallySyncStatus = 'not_synced' | 'pending' | 'synced' | 'failed' | 'blocked'

export interface SalesInvoice {
  id: string
  invoice_number: string
  customer_id: string
  customer_name?: string
  tally_name?: string
  narration?: string
  season_id?: string
  date?: string
  sale_type?: SaleType
  product_name?: string
  quantity?: number
  selling_price?: number
  items: InvoiceItem[]
  total: number
  status: 'draft' | 'saved' | 'synced'
  created_at: string
  // Additional details for sales > 50k (Tally requirement - "Additional Details: Local Sales - Taxable")
  eway_bill_no?: string
  eway_bill_date?: string
  dispatch_from?: string
  ship_to?: string
  transporter_name?: string
  transporter_id?: string
  transport_mode?: string
  transport_doc_no?: string
  transport_doc_date?: string
  vehicle_number?: string
  vehicle_type?: string
  tally_sync_enabled?: number | boolean
  tally_sync_status?: TallySyncStatus
  tally_response?: string | null
  tally_synced_at?: string | null
  tally_voucher_id?: string | null
}

export interface PurchaseInvoice {
  id: string
  invoice_number?: string
  supplier_invoice_number: string
  supplier_id: string
  supplier_name?: string
  product_name?: string
  quantity?: number
  buying_price?: number
  expiry_date?: string
  batch?: string
  unit?: string
  total_price?: number
  items?: InvoiceItem[]
  total: number
  status: 'draft' | 'saved' | 'synced'
  created_at: string
}

export interface SyncLog {
  id: string
  type: 'success' | 'failed'
  message: string
  timestamp: string
  error?: string
}
