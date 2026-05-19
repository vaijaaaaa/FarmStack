// Thin client for the local SQLite-backed API routes.
import type { Customer, Supplier, Product, ProductType, SalesInvoice } from '@/types/farmstack'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
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
  create: (payload: Partial<Customer>) =>
    request<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),
}

export const supplierApi = {
  list: () => request<Supplier[]>('/api/suppliers'),
  create: (payload: Partial<Supplier>) =>
    request<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
}

export const productApi = {
  list: () => request<Product[]>('/api/products'),
  create: (payload: Partial<Product>) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
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
      const res = await fetch('/api/tally')
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
}
