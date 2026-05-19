export type Language = 'en' | 'kn'
export type UserRole = 'user' | 'admin'

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
}

export type TallySyncStatus = 'not_synced' | 'pending' | 'synced' | 'failed' | 'blocked'

export interface SalesInvoice {
  id: string
  invoice_number: string
  customer_id: string
  customer_name?: string
  tally_name?: string
  date?: string
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
