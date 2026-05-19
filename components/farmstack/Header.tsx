import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'

interface HeaderProps {
  pageTitle: string
  language: Language
  onLanguageChange: (language: Language) => void
}

export default function Header({ pageTitle, language, onLanguageChange }: HeaderProps) {
  const t = (key: string) => getTranslation(language, key)

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-black">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => onLanguageChange(language === 'en' ? 'kn' : 'en')}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {language === 'en' ? 'ಕನ್ನಡ' : 'English'}
          </button>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
            D
          </div>
        </div>
      </div>
    </header>
  )
}
