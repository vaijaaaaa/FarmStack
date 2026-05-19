import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { Button } from '@/components/ui/button'

interface SettingsModuleProps {
  language: Language
  onLanguageChange: (language: Language) => void
}

export default function SettingsModule({ language, onLanguageChange }: SettingsModuleProps) {
  const t = (key: string) => getTranslation(language, key)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">{t('settings')}</h2>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-black">Language</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="language"
              checked={language === 'en'}
              onChange={() => onLanguageChange('en')}
              className="h-4 w-4"
            />
            <span className="font-medium text-black">English</span>
          </label>
          <label className="flex items-center gap-3 rounded-lg p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="language"
              checked={language === 'kn'}
              onChange={() => onLanguageChange('kn')}
              className="h-4 w-4"
            />
            <span className="font-medium text-black">ಕನ್ನಡ (Kannada)</span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-black">Business Profile</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-2">Business Name</label>
            <input
              type="text"
              defaultValue="Demo Farm Business"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-2">GSTIN</label>
            <input
              type="text"
              defaultValue="29AABCT1234H1Z0"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-black">Tally Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-2">Tally Server Address</label>
            <input
              type="text"
              defaultValue="localhost:9000"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-2">Company Name</label>
            <input
              type="text"
              defaultValue="Demo Company"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <Button className="bg-black text-white hover:bg-gray-900">Test Connection</Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-black">Data Management</h3>
        <div className="space-y-3">
          <Button className="w-full border border-gray-300 bg-white text-black hover:bg-gray-50">
            Backup Data
          </Button>
          <Button className="w-full border border-gray-300 bg-white text-black hover:bg-gray-50">
            Export Data
          </Button>
        </div>
      </div>
    </div>
  )
}
