'use client'

import { useState } from 'react'
import { Language, Product } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import ProductHistoryPage from './products/ProductHistoryPage'
import AddProductPage from './products/AddProductPage'
import BulkUploadModal from './products/BulkUploadModal'

type Page = 'history' | 'add' | 'edit'

interface ProductsModuleProps {
  language: Language
}

export default function ProductsModule({ language }: ProductsModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const [currentPage, setCurrentPage] = useState<Page>('history')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const handleAddProduct = () => {
    setEditingProduct(null)
    setCurrentPage('add')
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setCurrentPage('edit')
  }

  const handleBack = () => {
    setCurrentPage('history')
    setEditingProduct(null)
  }

  const handleSuccess = () => {
    setCurrentPage('history')
    setEditingProduct(null)
  }

  return (
    <div>
      {currentPage === 'history' && (
        <ProductHistoryPage
          language={language}
          onAddProduct={handleAddProduct}
          onEditProduct={handleEditProduct}
          onBulkUpload={() => setShowBulkUpload(true)}
        />
      )}

      {currentPage === 'add' && (
        <AddProductPage
          language={language}
          editingProduct={null}
          onBack={handleBack}
          onSuccess={handleSuccess}
        />
      )}

      {currentPage === 'edit' && editingProduct && (
        <AddProductPage
          language={language}
          editingProduct={editingProduct}
          onBack={handleBack}
          onSuccess={handleSuccess}
        />
      )}

      <BulkUploadModal
        language={language}
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
