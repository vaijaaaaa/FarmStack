// Thin client for the API routes.
import type { Customer, Supplier, Product, ProductType, SalesInvoice } from '@/types/farmstack'

// The Tally server URL the user configured (their localhost, or a tunnel URL).
// Stored in the browser and sent on every request so the server posts to the
// right Tally. Empty => server falls back to its default (localhost:9000).
export const TALLY_URL_STORAGE_KEY = 'farmstack_tally_url'
export function getStoredTallyUrl(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(TALLY_URL_STORAGE_KEY) || ''
}
function tallyHeader(): Record<string, string> {
  const url = getStoredTallyUrl().trim()
  return url ? { 'x-tally-url': url } : {}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...tallyHeader() },
    ...init,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`)
  }
  return data as T
}

export const customerApi = {
  list: () => request<Customer[]>('/api/customers'),
  listPaginated: (page: number = 1, limit: number = 10, search: string = '', searchBy: string = 'name') =>
    request<{ data: Customer[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/customers?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&searchBy=${searchBy}`,
    ),
  create: (payload: Partial<Customer>) =>
    request<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Customer>) =>
    request<Customer>('/api/customers', { method: 'PUT', body: JSON.stringify({ id, ...payload }) }),
  bulkUpload: (customers: any[]) =>
    request<{ success: number; failed: number; errors: any[]; created: any[] }>(
      '/api/customers/bulk',
      { method: 'POST', body: JSON.stringify({ customers }) },
    ),
}

export const supplierApi = {
  list: () => request<Supplier[]>('/api/suppliers'),
  listPaginated: (page: number = 1, limit: number = 10, search: string = '', searchBy: string = 'name') =>
    request<{ data: Supplier[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/suppliers?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&searchBy=${searchBy}`,
    ),
  create: (payload: Partial<Supplier>) =>
    request<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Supplier>) =>
    request<Supplier>('/api/suppliers', { method: 'PUT', body: JSON.stringify({ id, ...payload }) }),
  bulkUpload: (suppliers: any[]) =>
    request<{ success: number; failed: number; errors: any[]; created: any[] }>(
      '/api/suppliers/bulk',
      { method: 'POST', body: JSON.stringify({ suppliers }) },
    ),
}

export const productApi = {
  list: () => request<Product[]>('/api/products'),
  listPaginated: (page: number = 1, limit: number = 10, search: string = '', searchBy: string = 'name') =>
    request<{ data: Product[]; total: number; page: number; limit: number; totalPages: number }>(
      `/api/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&searchBy=${searchBy}`,
    ),
  create: (payload: Partial<Product>) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Product>) =>
    request<Product>('/api/products', { method: 'PUT', body: JSON.stringify({ id, ...payload }) }),
  bulkUpload: (products: any[]) =>
    request<{ success: number; failed: number; errors: any[]; created: any[] }>(
      '/api/products/bulk',
      { method: 'POST', body: JSON.stringify({ products }) },
    ),
}

export const productTypeApi = {
  list: () => request<ProductType[]>('/api/product-types'),
  create: (payload: Partial<ProductType>) =>
    request<ProductType>('/api/product-types', { method: 'POST', body: JSON.stringify(payload) }),
}

export const salesApi = {
  list: () => request<SalesInvoice[]>('/api/sales-invoices'),
  create: (payload: Partial<SalesInvoice>) =>
    request<SalesInvoice>('/api/sales-invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

export interface PurchaseHistoryRow {
  id: string
  supplier_id: string
  supplier_name: string
  supplier_invoice_number: string
  purchase_date: string
  product_id: string
  product_name: string
  quantity: number
  buying_price: number
  selling_price: number
  tally_price: number
  expiry_date: string
  type: string
  tax: number
  total_price: number
  batch: string
  unit: string
  status: string
  created_at: string
  tally_sync_enabled: number
  tally_sync_status: string
  tally_response: string | null
  tally_synced_at: string | null
  tally_voucher_id: string | null
}

export const purchaseApi = {
  list: () => request<PurchaseHistoryRow[]>('/api/purchase-invoices'),
  create: (payload: unknown) =>
    request<{ id: string; tally?: { status: string; message: string } }>(
      '/api/purchase-invoices',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
}

export interface TallyConnection {
  connected: boolean
  message: string
}

export interface TallySyncOutcome {
  status: 'not_synced' | 'pending' | 'synced' | 'failed' | 'blocked'
  message: string
  voucherId?: string | null
}

export type TallyEntityType =
  | 'purchase'
  | 'sales'
  | 'supplier'
  | 'customer'
  | 'product'
  | 'product_type'

export interface BulkMasterEntry {
  kind: 'supplier' | 'customer' | 'product' | 'product_type' | 'ledger' | 'gst'
  id?: string
  name?: string
  group?: string
  label?: string
}

export interface BulkMasterResult {
  label: string
  status: 'synced' | 'failed'
  message: string
}

export const invoiceApi = {
  updateDate: (type: 'purchase' | 'sales', id: string, date: string) =>
    request<{ id: string; date: string }>(
      type === 'purchase' ? '/api/purchase-invoices' : '/api/sales-invoices',
      { method: 'PATCH', body: JSON.stringify({ id, date }) },
    ),
}

export const tallyApi = {
  status: async (): Promise<TallyConnection> => {
    try {
      const res = await fetch('/api/tally', { headers: tallyHeader() })
      const data = await res.json().catch(() => null)
      if (data && typeof data.connected === 'boolean') return data
      return { connected: false, message: 'Could not check Tally connection' }
    } catch {
      return { connected: false, message: 'Could not check Tally connection' }
    }
  },
  sync: (type: TallyEntityType, id: string) =>
    request<TallySyncOutcome>('/api/tally', {
      method: 'POST',
      body: JSON.stringify({ type, id }),
    }),
  syncMasters: (masters: BulkMasterEntry[]) =>
    request<{ results: BulkMasterResult[] }>('/api/tally', {
      method: 'POST',
      body: JSON.stringify({ action: 'sync-masters', masters }),
    }),
  listLedgers: async (): Promise<{ ledgers: { name: string; parent: string }[]; error?: string }> => {
    try {
      const res = await fetch('/api/tally/ledgers', { headers: tallyHeader() })
      const data = await res.json().catch(() => null)
      if (data && Array.isArray(data.ledgers)) {
        return { ledgers: data.ledgers, error: data.error }
      }
      return { ledgers: [], error: 'Could not read ledgers from Tally' }
    } catch {
      return { ledgers: [], error: 'Could not reach Tally' }
    }
  },
}
