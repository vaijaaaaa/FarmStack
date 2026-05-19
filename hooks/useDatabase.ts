'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Customer, Supplier, Product, ProductType, SalesInvoice } from '@/types/farmstack'
import {
  customerApi,
  supplierApi,
  productApi,
  productTypeApi,
  salesApi,
  purchaseApi,
  type PurchaseHistoryRow,
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

export function useProductTypes() {
  const { data, loading, error, refresh, add } = useCollection<
    ProductType,
    Partial<ProductType>,
    ProductType
  >(productTypeApi.list, productTypeApi.create)
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
