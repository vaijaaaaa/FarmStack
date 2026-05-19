import { useState } from 'react'
import { Language, Customer } from '@/types/farmstack'
import CustomerHistoryPage from './customers/CustomerHistoryPage'
import AddCustomerPage from './customers/AddCustomerPage'
import BulkUploadModal from './customers/BulkUploadModal'

interface CustomersModuleProps {
  language: Language
}

type View = 'history' | 'add' | 'edit'

export default function CustomersModule({ language }: CustomersModuleProps) {
  const [view, setView] = useState<View>('history')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  const handleAddCustomer = () => {
    setEditingCustomer(null)
    setView('add')
  }

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer)
    setView('edit')
  }

  const handleBack = () => {
    setEditingCustomer(null)
    setView('history')
  }

  const handleSuccess = () => {
    setEditingCustomer(null)
    setView('history')
  }

  if (view === 'add') {
    return (
      <AddCustomerPage
        language={language}
        onBack={handleBack}
        onSuccess={handleSuccess}
      />
    )
  }

  if (view === 'edit' && editingCustomer) {
    return (
      <AddCustomerPage
        language={language}
        editingCustomer={editingCustomer}
        onBack={handleBack}
        onSuccess={handleSuccess}
      />
    )
  }

  return (
    <>
      <CustomerHistoryPage
        language={language}
        onAddCustomer={handleAddCustomer}
        onEditCustomer={handleEditCustomer}
        onBulkUpload={() => setShowBulkUpload(true)}
      />
      <BulkUploadModal
        language={language}
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={() => {
          setShowBulkUpload(false)
          setView('history')
        }}
      />
    </>
  )
}
