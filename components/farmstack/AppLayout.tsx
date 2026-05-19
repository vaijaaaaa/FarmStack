'use client'

import { useState, useCallback } from 'react'
import { Language, UserRole } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import Sidebar from './Sidebar'
import Header from './Header'
import Dashboard from './modules/Dashboard'
import CustomersModule from './modules/CustomersModule'
import SuppliersModule from './modules/SuppliersModule'
import ProductsModule from './modules/ProductsModule'
import SalesInvoiceModule from './modules/SalesInvoiceModule'
import PurchaseInvoiceModule from './modules/PurchaseInvoiceModule'
import TallySyncModule from './modules/TallySyncModule'
import SettingsModule from './modules/SettingsModule'
import AnalyticsModule from './modules/AnalyticsModule'
import TypeModule from './modules/TypeModule'
import AccountsModule from './modules/AccountsModule'
import CropPurchaseModule from './modules/CropPurchaseModule'
import EntriesModule from './modules/EntriesModule'

type Page = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'sales_invoice' | 'purchase_invoice' | 'tally_sync' | 'settings' | 'analytics' | 'type' | 'accounts' | 'crop_purchase' | 'entries'

const PAGE_TITLES: Record<Page, Record<Language, string>> = {
  dashboard: { en: 'Dashboard', kn: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' },
  customers: { en: 'Customers', kn: 'ಗ್ರಾಹಕರು' },
  suppliers: { en: 'Suppliers', kn: 'ಪೂರೈಕೆದಾರರು' },
  products: { en: 'Products', kn: 'ಪಾಸರಗಳು' },
  sales_invoice: { en: 'Sales Invoice', kn: 'ಮಾರಾಟ ರಸೀದಿ' },
  purchase_invoice: { en: 'Purchase Invoice', kn: 'ಖರೀದಿ ರಸೀದಿ' },
  tally_sync: { en: 'Tally Sync', kn: 'ಟ್ಯಾಲಿ ಸಿಂಕ್' },
  settings: { en: 'Settings', kn: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು' },
  analytics: { en: 'Analytics', kn: 'ವಿಶ್ಲೇಷಣೆ' },
  type: { en: 'Product Types', kn: 'ಉತ್ಪನ್ನ ಪ್ರಕಾರ' },
  accounts: { en: 'Accounts', kn: 'ಖಾತೆಗಳು' },
  crop_purchase: { en: 'Crop Purchase', kn: 'ಕ್ರಾಪ್ ಖರೀದಿ' },
  entries: { en: 'Entries', kn: 'ನಮೂದುಗಳು' },
}

export default function AppLayout() {
  const [role, setRole] = useState<UserRole>('user')
  const [language, setLanguage] = useState<Language>('en')
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  const handleRoleChange = useCallback((newRole: UserRole) => {
    setRole(newRole)
  }, [])

  const handlePageChange = useCallback((page: Page) => {
    setCurrentPage(page)
  }, [])

  const handleLanguageChange = useCallback((lang: Language) => {
    setLanguage(lang)
  }, [])

  const getPageTitle = () => {
    return PAGE_TITLES[currentPage][language]
  }

  const renderPage = () => {
    const commonProps = { language }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard {...commonProps} role={role} onRoleChange={handleRoleChange} />
      case 'customers':
        return <CustomersModule {...commonProps} />
      case 'suppliers':
        return <SuppliersModule {...commonProps} />
      case 'products':
        return <ProductsModule {...commonProps} />
      case 'sales_invoice':
        return <SalesInvoiceModule {...commonProps} />
      case 'purchase_invoice':
        return <PurchaseInvoiceModule {...commonProps} />
      case 'tally_sync':
        return <TallySyncModule {...commonProps} />
      case 'settings':
        return <SettingsModule {...commonProps} onLanguageChange={handleLanguageChange} />
      case 'analytics':
        return <AnalyticsModule {...commonProps} />
      case 'type':
        return <TypeModule {...commonProps} />
      case 'accounts':
        return <AccountsModule {...commonProps} />
      case 'crop_purchase':
        return <CropPurchaseModule {...commonProps} />
      case 'entries':
        return <EntriesModule {...commonProps} />
      default:
        return <Dashboard {...commonProps} role={role} onRoleChange={handleRoleChange} />
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar currentPage={currentPage} onPageChange={handlePageChange} language={language} role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header pageTitle={getPageTitle()} language={language} onLanguageChange={handleLanguageChange} />
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-8" key={currentPage}>
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  )
}
