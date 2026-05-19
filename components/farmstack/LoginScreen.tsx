import { useState } from 'react'
import { Language, UserRole } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface LoginScreenProps {
  onLogin: (role: UserRole) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [language, setLanguage] = useState<Language>('en')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showRoleSelection, setShowRoleSelection] = useState(false)

  const t = (key: string) => getTranslation(language, key)

  const handleLogin = () => {
    if (username.trim() && password.trim()) {
      setShowRoleSelection(true)
    }
  }

  const handleRoleSelect = (role: UserRole) => {
    onLogin(role)
  }

  if (showRoleSelection) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Card className="w-full max-w-sm border-0 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-black">Select Your Role</h2>
          <div className="space-y-3">
            <button
              onClick={() => handleRoleSelect('user')}
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-4 text-left font-semibold text-black transition-colors hover:border-blue-500 hover:bg-blue-50"
            >
              <div className="text-lg">👨‍🌾 User</div>
              <div className="mt-1 text-xs text-gray-600">Limited access - View dashboard, sales & purchases</div>
            </button>
            <button
              onClick={() => handleRoleSelect('admin')}
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-4 text-left font-semibold text-black transition-colors hover:border-blue-500 hover:bg-blue-50"
            >
              <div className="text-lg">⚙️ Admin</div>
              <div className="mt-1 text-xs text-gray-600">Full access - Manage all modules</div>
            </button>
          </div>
          <button
            onClick={() => setShowRoleSelection(false)}
            className="mt-4 w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Card className="w-full max-w-sm border-0 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black">FarmStack</h1>
            <p className="mt-1 text-sm text-gray-600">Farm Management System</p>
          </div>
          <button
            onClick={() => setLanguage(language === 'en' ? 'kn' : 'en')}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('language_toggle')}
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-black">
              {t('username')}
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="demo"
              className="border-gray-300"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-black">
              {t('password')}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="demo"
              className="border-gray-300"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-black text-white hover:bg-gray-900"
          >
            {t('login')}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Demo: username &quot;demo&quot; password &quot;demo&quot;
        </p>
      </Card>
    </div>
  )
}
