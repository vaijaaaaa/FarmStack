'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Customer, Supplier, Product, ProductType, SalesInvoice, Season, Entry, LedgerRecord, CropPurchase } from '@/types/farmstack'
import {
  customerApi,
  supplierApi,
  productApi,
  productTypeApi,
  salesApi,
  purchaseApi,
  seasonApi,
  entriesApi,
  ledgerApi,
  cropPurchaseApi,
  type PurchaseHistoryRow,
  type CreateEntriesPayload,
  type CreateCropPurchasesPayload,
} from '@/src/services/api'

// ── Shared stale-while-revalidate cache for list endpoints ──────────────────
// The app is state-driven: switching modules unmounts/remounts them, so without
// a cache every visit re-fetches from scratch and dropdowns sit empty until the
// network round-trip finishes. These module-level maps let a remounted hook
// render its last value INSTANTLY while it revalidates in the background, and
// let concurrent callers of the same endpoint share ONE in-flight request.
const listCache = new Map<string, unknown[]>()
const listInflight = new Map<string, Promise<unknown[]>>()
const listSubscribers = new Map<string, Set<(data: unknown[]) => void>>()
// Monotonic per-key fetch sequence. Only the latest-started fetch is allowed to
// write the cache, so a slow stale (pre-mutation) response can never clobber the
// fresh data from a later refresh (e.g. the row you just saved flickering away).
const listSeq = new Map<string, number>()

// Fetch a list by key. force=false reuses an in-flight request (dedup) — used on
// mount. force=true always starts a fresh request — used after a mutation so the
// new row is never masked by a pre-mutation in-flight fetch.
function loadList<T>(key: string, list: () => Promise<T[]>, force: boolean): Promise<T[]> {
  if (!force) {
    const existing = listInflight.get(key)
    if (existing) return existing as Promise<T[]>
  }
  const seq = (listSeq.get(key) ?? 0) + 1
  listSeq.set(key, seq)
  const p = list().then((data) => {
    // Apply only if no newer fetch for this key has started since — otherwise this
    // response is stale and must not overwrite fresher cache/subscribers.
    if (listSeq.get(key) === seq) {
      listCache.set(key, data as unknown[])
      listSubscribers.get(key)?.forEach((fn) => fn(data as unknown[]))
    }
    return data
  })
  listInflight.set(key, p as Promise<unknown[]>)
  void p.finally(() => {
    if (listInflight.get(key) === (p as Promise<unknown[]>)) listInflight.delete(key)
  })
  return p
}

function useCachedList<T>(key: string, list: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>(() => (listCache.get(key) as T[]) ?? [])
  // Only show a loading state on the very first ever fetch (nothing cached yet).
  const [loading, setLoading] = useState(() => !listCache.has(key))
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (force: boolean) => {
      if (!listCache.has(key)) setLoading(true)
      try {
        // Don't setData from the returned value directly — a stale fetch resolves
        // with stale data. Let the seq-gated subscriber notification update state,
        // so only the latest fetch ever writes it.
        await loadList<T>(key, list, force)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [key, list],
  )

  // Mutations call this — always revalidates fresh.
  const refresh = useCallback(() => run(true), [run])

  useEffect(() => {
    const sub = setData as unknown as (d: unknown[]) => void
    let subs = listSubscribers.get(key)
    if (!subs) {
      subs = new Set()
      listSubscribers.set(key, subs)
    }
    subs.add(sub)
    // Render cached data immediately; revalidate in the background (deduped).
    void run(false)
    return () => {
      subs!.delete(sub)
    }
  }, [key, run])

  return { data, loading, error, refresh }
}

function useCollection<T, C, R = void>(
  key: string,
  list: () => Promise<T[]>,
  create: (payload: C) => Promise<R>,
) {
  const { data, loading, error, refresh } = useCachedList<T>(key, list)

  const add = useCallback(
    async (payload: C) => {
      const created = await create(payload)
      await refresh()
      return created
    },
    [create, refresh],
  )

  return { data, loading, error, refresh, add }
}

export function useCustomers() {
  const { data, loading, error, refresh, add } = useCollection<
    Customer,
    Partial<Customer>,
    Customer
  >('customers', customerApi.list, customerApi.create)
  return { customers: data, loading, error, refresh, createCustomer: add }
}

export function useSeasons() {
  const { data, loading, error, refresh, add } = useCollection<
    Season,
    Partial<Season>,
    Season
  >('seasons', seasonApi.list, seasonApi.create)
  // Sort high → low by name (numeric-aware): 2027, 2026, 2025…
  const seasons = useMemo(
    () => [...data].sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true })),
    [data],
  )
  const updateSeason = useCallback(
    async (id: string, payload: Partial<Season>) => {
      const res = await seasonApi.update(id, payload)
      await refresh()
      return res
    },
    [refresh],
  )
  return { seasons, loading, error, refresh, createSeason: add, updateSeason }
}

export function useEntries() {
  const { data, loading, error, refresh } = useCachedList<Entry>('entries', entriesApi.list)

  const createEntries = useCallback(
    async (payload: CreateEntriesPayload) => {
      const res = await entriesApi.create(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  return { entries: data, loading, error, refresh, createEntries }
}

export function useCropPurchases() {
  const { data, loading, error, refresh } = useCachedList<CropPurchase>(
    'crop-purchases',
    cropPurchaseApi.list,
  )

  const createCropPurchases = useCallback(
    async (payload: CreateCropPurchasesPayload) => {
      const res = await cropPurchaseApi.create(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  return { cropPurchases: data, loading, error, refresh, createCropPurchases }
}

export function useLedgers() {
  const { data: ledgers, loading, error, refresh } = useCachedList<LedgerRecord>(
    'ledgers',
    ledgerApi.list,
  )

  const createLedger = useCallback(
    async (payload: Partial<LedgerRecord>) => {
      const created = await ledgerApi.create(payload)
      await refresh()
      return created
    },
    [refresh],
  )

  const closeLedger = useCallback(
    async (id: string, closureDate: string, closingBalance: number) => {
      const res = await ledgerApi.close(id, closureDate, closingBalance)
      await refresh()
      return res
    },
    [refresh],
  )

  const reopenLedger = useCallback(
    async (id: string) => {
      const res = await ledgerApi.reopen(id)
      await refresh()
      return res
    },
    [refresh],
  )

  const updateLedger = useCallback(
    async (id: string, payload: Partial<LedgerRecord>) => {
      const res = await ledgerApi.update(id, payload)
      await refresh()
      return res
    },
    [refresh],
  )

  const bulkCreateLedgers = useCallback(
    async (payload: { season_id: string; customers: Partial<LedgerRecord>[] }) => {
      const res = await ledgerApi.createBulk(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  const moveLedger = useCallback(
    async (payload: {
      season_id: string
      from_customer_id: string
      to_customer_id: string
      to_customer_name: string
    }) => {
      const res = await ledgerApi.move(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  const deleteLedger = useCallback(
    async (id: string) => {
      const res = await ledgerApi.remove(id)
      await refresh()
      return res
    },
    [refresh],
  )

  return { ledgers, loading, error, refresh, createLedger, updateLedger, closeLedger, reopenLedger, bulkCreateLedgers, moveLedger, deleteLedger }
}

export function useSuppliers() {
  const { data, loading, error, refresh, add } = useCollection<
    Supplier,
    Partial<Supplier>,
    Supplier
  >('suppliers', supplierApi.list, supplierApi.create)
  return { suppliers: data, loading, error, refresh, createSupplier: add }
}

export function useProducts() {
  const { data, loading, error, refresh, add } = useCollection<
    Product,
    Partial<Product>,
    Product
  >('products', productApi.list, productApi.create)
  return { products: data, loading, error, refresh, createProduct: add }
}

let productTypesCache: ProductType[] | null = null
let productTypesPromise: Promise<ProductType[]> | null = null
const PRODUCT_TYPES_CACHE_KEY = 'farmstack.productTypes.v1'
const PRODUCT_TYPES_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const DEFAULT_PRODUCT_TYPES: ProductType[] = [
  { id: 'default-1', name: 'Fertilizers', description: 'Default product type', tax: 5 },
  { id: 'default-2', name: 'Micronutrients', description: 'Default product type', tax: 12 },
  { id: 'default-3', name: 'Pesticide', description: 'Default product type', tax: 18 },
  { id: 'default-4', name: 'Seeds', description: 'Default product type', tax: 0 },
]

const readProductTypesCache = (): ProductType[] | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PRODUCT_TYPES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; data: ProductType[] }
    if (!parsed?.at || !Array.isArray(parsed.data)) return null
    if (Date.now() - parsed.at > PRODUCT_TYPES_CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

const writeProductTypesCache = (data: ProductType[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      PRODUCT_TYPES_CACHE_KEY,
      JSON.stringify({ at: Date.now(), data }),
    )
  } catch {
    // ignore storage errors
  }
}

export function useProductTypes() {
  const [data, setData] = useState<ProductType[]>(() => {
    if (productTypesCache) return productTypesCache
    const cached = readProductTypesCache()
    if (cached) {
      productTypesCache = cached
      return cached
    }
    return [...DEFAULT_PRODUCT_TYPES]
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(!!productTypesCache)

  const refresh = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background
    if (!background && !hasLoaded) setLoading(true)
    try {
      if (!productTypesPromise) productTypesPromise = productTypeApi.list()
      const list = await productTypesPromise
      productTypesPromise = null
      productTypesCache = list
      writeProductTypesCache(list)
      setData(list)
      setHasLoaded(true)
      setError(null)
    } catch (err) {
      productTypesPromise = null
      setHasLoaded(true)
      setError((err as Error).message)
    } finally {
      if (!background) setLoading(false)
    }
  }, [hasLoaded])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(
    async (payload: Partial<ProductType>) => {
      const created = await productTypeApi.create(payload)
      await refresh()
      return created
    },
    [refresh],
  )

  return { productTypes: data, loading, error, refresh, createProductType: add }
}

export function useSalesInvoices() {
  const { data, loading, error, refresh, add } = useCollection<
    SalesInvoice,
    Partial<SalesInvoice>,
    SalesInvoice
  >('sales-invoices', salesApi.list, salesApi.create)
  return { invoices: data, loading, error, refresh, createInvoice: add }
}

export function usePurchaseInvoices() {
  const { data, loading, error, refresh, add } = useCollection<
    PurchaseHistoryRow,
    unknown,
    { id: string }
  >('purchase-invoices', purchaseApi.list, purchaseApi.create)
  return { invoices: data, loading, error, refresh, createInvoice: add }
}
