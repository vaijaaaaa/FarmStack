'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Column {
  key: string
  label: string
}

interface DataTableProps {
  columns: Column[]
  data: Record<string, ReactNode>[]
  // dense: fit many columns with no horizontal scroll (compact padding,
  // fixed layout, wrapping cells).
  dense?: boolean
  // pageSize: when set, the table paginates client-side with this many rows
  // per page and shows Previous/Next controls.
  pageSize?: number
}

export default function DataTable({ columns, data, dense = false, pageSize }: DataTableProps) {
  const [selected, setSelected] = useState(-1)
  const [page, setPage] = useState(0)
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  const totalPages = pageSize ? Math.max(1, Math.ceil(data.length / pageSize)) : 1

  // Keep the page index valid as the data changes (filter, refresh).
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1))
  }, [totalPages])

  const pageData = pageSize ? data.slice(page * pageSize, page * pageSize + pageSize) : data

  // Keep selection valid as the visible rows change.
  useEffect(() => {
    setSelected((s) => (pageData.length === 0 ? -1 : Math.min(s, pageData.length - 1)))
  }, [pageData.length, page])

  // Scroll the highlighted row into view.
  useEffect(() => {
    if (selected < 0 || !bodyRef.current) return
    const row = bodyRef.current.children[selected] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (pageData.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s < 0 ? 0 : s + 1, pageData.length - 1))
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

  const thClass = dense
    ? 'px-2 py-2 text-left text-[10px] font-semibold uppercase text-gray-700 break-words'
    : 'px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700'
  const tdClass = dense
    ? 'px-2 py-2 align-top text-xs text-gray-900 break-words'
    : 'px-4 py-3 text-sm text-gray-900'

  const showPagination = !!pageSize && data.length > pageSize
  const firstRow = data.length === 0 ? 0 : page * pageSize! + 1
  const lastRow = Math.min(data.length, (page + 1) * (pageSize ?? 0))

  return (
    <div>
      <div
        className={dense ? 'outline-none' : 'overflow-x-auto outline-none'}
        tabIndex={0}
        role="grid"
        onKeyDown={handleKeyDown}
      >
        <table className={dense ? 'w-full table-fixed' : 'w-full'}>
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th key={col.key} className={thClass}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {pageData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => setSelected(idx)}
                className={`border-b border-gray-100 ${
                  idx === selected
                    ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={tdClass}>
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

      {showPagination && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-sm text-gray-600">
            Showing <span className="font-medium">{firstRow}</span>–
            <span className="font-medium">{lastRow}</span> of{' '}
            <span className="font-medium">{data.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
