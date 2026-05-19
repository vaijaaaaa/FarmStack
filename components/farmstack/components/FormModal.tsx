import { useState } from 'react'
import { Language } from '@/types/farmstack'
import { getTranslation } from '@/lib/translations'
import { Button } from '@/components/ui/button'

interface FormField {
  key: string
  label: string
  type: 'text' | 'tel' | 'textarea' | 'checkbox'
  required?: boolean
}

interface FormModalProps {
  title: string
  fields: FormField[]
  onSave: (data: Record<string, string>) => void
  onCancel: () => void
  language: Language
}

export default function FormModal({
  title,
  fields,
  onSave,
  onCancel,
  language,
}: FormModalProps) {
  const t = (key: string) => getTranslation(language, key)
  const [formData, setFormData] = useState<Record<string, string>>({})

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
        <h2 className="mb-6 text-2xl font-bold text-black">{title}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-black mb-2">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea
                  value={formData[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                />
              ) : field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={formData[field.key] === 'on'}
                  onChange={(e) => handleChange(field.key, e.target.checked ? 'on' : 'off')}
                  className="h-4 w-4 rounded border-gray-300"
                />
              ) : (
                <input
                  type={field.type}
                  value={formData[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-6">
            <Button
              type="submit"
              className="bg-black text-white hover:bg-gray-900"
            >
              {t('save')}
            </Button>
            <Button
              type="button"
              onClick={onCancel}
              className="border border-gray-300 bg-white text-black hover:bg-gray-50"
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
