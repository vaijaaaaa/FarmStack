'use client'

import { useState } from 'react'
import { Language, Supplier } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import SupplierHistoryPage from './suppliers/SupplierHistoryPage'
import AddSupplierPage from './suppliers/AddSupplierPage'
import BulkUploadModal from './suppliers/BulkUploadModal'

type Page = 'history' | 'add' | 'edit'

interface SuppliersModuleProps {
  language: Language
}

export default function SuppliersModule({ language }: SuppliersModuleProps) {
  const t = (key: string) => getTranslation(language, key)
  const [currentPage, setCurrentPage] = useState<Page>('history')
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  // Bumped after a bulk upload to force the history list to re-mount + refetch.
  const [reloadKey, setReloadKey] = useState(0)

  const handleAddSupplier = () => {
    setEditingSupplier(null)
    setCurrentPage('add')
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setCurrentPage('edit')
  }

  const handleBack = () => {
    setCurrentPage('history')
    setEditingSupplier(null)
  }

  const handleSuccess = () => {
    setCurrentPage('history')
    setEditingSupplier(null)
    setReloadKey((k) => k + 1)
  }

  return (
    <div>
      {currentPage === 'history' && (
        <SupplierHistoryPage
          key={reloadKey}
          language={language}
          onAddSupplier={handleAddSupplier}
          onEditSupplier={handleEditSupplier}
          onBulkUpload={() => setShowBulkUpload(true)}
        />
      )}

      {currentPage === 'add' && (
        <AddSupplierPage
          language={language}
          editingSupplier={null}
          onBack={handleBack}
          onSuccess={handleSuccess}
        />
      )}

      {currentPage === 'edit' && editingSupplier && (
        <AddSupplierPage
          language={language}
          editingSupplier={editingSupplier}
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
