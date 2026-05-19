'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Column {
  key: string
  label: string
}

interface DataTableProps {
  columns: Column[]
  data: Record<string, ReactNode>[]
}

export default function DataTable({ columns, data }: DataTableProps) {
  const [selected, setSelected] = useState(-1)
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  // Keep selection valid as the data changes (filter, paginate, refresh).
  useEffect(() => {
    setSelected((s) => (data.length === 0 ? -1 : Math.min(s, data.length - 1)))
  }, [data.length])

  // Scroll the highlighted row into view.
  useEffect(() => {
    if (selected < 0 || !bodyRef.current) return
    const row = bodyRef.current.children[selected] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (data.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s < 0 ? 0 : s + 1, data.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s < 0 ? 0 : s - 1, 0))
    } else if (e.key === 'Enter' && selected >= 0) {
      const row = bodyRef.current?.children[selected] as HTMLElement | undefined
      const action = row?.querySelector('[data-kbd-row-action]') as HTMLElement | null
      if (action) {
        e.preventDefault()
        action.click()
      }
    }
  }

  return (
    <div
      className="overflow-x-auto outline-none"
      tabIndex={0}
      role="grid"
      onKeyDown={handleKeyDown}
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => setSelected(idx)}
              className={`border-b border-gray-100 ${
                idx === selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-900">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-500">No data available</div>
      )}
    </div>
  )
}
