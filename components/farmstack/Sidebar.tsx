import { Language, UserRole } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'

type Page = 'dashboard' | 'customers' | 'suppliers' | 'products' | 'sales_invoice' | 'purchase_invoice' | 'tally_sync' | 'settings' | 'analytics' | 'type' | 'accounts' | 'crop_purchase' | 'entries'

interface SidebarProps {
  currentPage: Page
  onPageChange: (page: Page) => void
  language: Language
  role: UserRole
  onRoleChange: (role: UserRole) => void
}

const userMenuItems: { id: Page; key: string }[] = [
  { id: 'dashboard', key: 'dashboard' },
  { id: 'purchase_invoice', key: 'purchase_invoice' },
  { id: 'sales_invoice', key: 'sales_invoice' },
  { id: 'analytics', key: 'analytics' },
  { id: 'tally_sync', key: 'tally_sync' },
]

const adminMenuItems: { id: Page; key: string }[] = [
  { id: 'dashboard', key: 'dashboard' },
  { id: 'purchase_invoice', key: 'purchase_invoice' },
  { id: 'sales_invoice', key: 'sales_invoice' },
  { id: 'tally_sync', key: 'tally_sync' },
  { id: 'suppliers', key: 'suppliers' },
  { id: 'customers', key: 'customers' },
  { id: 'products', key: 'products' },
  { id: 'type', key: 'type' },
  { id: 'analytics', key: 'analytics' },
  { id: 'accounts', key: 'accounts' },
  { id: 'crop_purchase', key: 'crop_purchase' },
  { id: 'entries', key: 'entries' },
]

export default function Sidebar({ currentPage, onPageChange, language, role, onRoleChange }: SidebarProps) {
  const t = (key: string) => getTranslation(language, key)

  const handleNavigation = (page: Page) => {
    onPageChange(page)
  }

  const menuItems = role === 'admin' ? adminMenuItems : userMenuItems

  return (
    <aside className="w-64 border-r border-gray-200 bg-white">
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-200 p-6">
          <h2 className="text-xl font-bold text-black">FarmStack</h2>
          <p className="mt-1 text-xs text-gray-500">Farm Management</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onRoleChange('user')}
              type="button"
              className={`flex-1 rounded px-3 py-1.5 text-xs font-semibold transition-all ${
                role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              User
            </button>
            <button
              onClick={() => onRoleChange('admin')}
              type="button"
              className={`flex-1 rounded px-3 py-1.5 text-xs font-semibold transition-all ${
                role === 'admin'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Admin
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-0 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNavigation(item.id)}
              className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors cursor-pointer ${
                currentPage === item.id
                  ? 'border-l-2 border-black bg-gray-50 text-black'
                  : 'border-l-2 border-transparent text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t(item.key)}
            </button>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">Demo User</p>
            <p className="mt-1 text-xs text-gray-500">{role === 'admin' ? 'Admin Account' : 'Farmer Account'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
