'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Customer, Supplier, Product, ProductType, SalesInvoice, Season, Entry, LedgerRecord } from '@/types/farmstack'
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
  type PurchaseHistoryRow,
  type CreateEntriesPayload,
} from '@/src/services/api'

function useCollection<T, C, R = void>(
  list: () => Promise<T[]>,
  create: (payload: C) => Promise<R>,
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await list())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [list])

  useEffect(() => {
    refresh()
  }, [refresh])

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
  >(customerApi.list, customerApi.create)
  return { customers: data, loading, error, refresh, createCustomer: add }
}

export function useSeasons() {
  const { data, loading, error, refresh, add } = useCollection<
    Season,
    Partial<Season>,
    Season
  >(seasonApi.list, seasonApi.create)
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
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await entriesApi.list())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createEntries = useCallback(
    async (payload: CreateEntriesPayload) => {
      const res = await entriesApi.create(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  return { entries, loading, error, refresh, createEntries }
}

export function useLedgers() {
  const [ledgers, setLedgers] = useState<LedgerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setLedgers(await ledgerApi.list())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

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

  const bulkCreateLedgers = useCallback(
    async (payload: { season_id: string; customers: Partial<LedgerRecord>[] }) => {
      const res = await ledgerApi.createBulk(payload)
      await refresh()
      return res
    },
    [refresh],
  )

  return { ledgers, loading, error, refresh, createLedger, closeLedger, reopenLedger, bulkCreateLedgers }
}

export function useSuppliers() {
  const { data, loading, error, refresh, add } = useCollection<
    Supplier,
    Partial<Supplier>,
    Supplier
  >(supplierApi.list, supplierApi.create)
  return { suppliers: data, loading, error, refresh, createSupplier: add }
}

export function useProducts() {
  const { data, loading, error, refresh, add } = useCollection<
    Product,
    Partial<Product>,
    Product
  >(productApi.list, productApi.create)
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
  >(salesApi.list, salesApi.create)
  return { invoices: data, loading, error, refresh, createInvoice: add }
}

export function usePurchaseInvoices() {
  const { data, loading, error, refresh, add } = useCollection<
    PurchaseHistoryRow,
    unknown,
    { id: string }
  >(purchaseApi.list, purchaseApi.create)
  return { invoices: data, loading, error, refresh, createInvoice: add }
}
