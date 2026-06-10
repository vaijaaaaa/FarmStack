'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Optional: render extra content (e.g. a badge) after the label in each list item. */
  renderOption?: (option: SelectOption) => React.ReactNode
}

interface PanelPos {
  left: number
  width: number
  top?: number
  bottom?: number
}

const PANEL_MAX_H = 300

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— Select —',
  renderOption,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<PanelPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  // Position the floating panel relative to the trigger, flipping above when
  // there isn't enough room below. Rendered in a portal so no parent overflow
  // can clip it (the bug when used inside a scrolling grid).
  const computePos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const flipUp = spaceBelow < PANEL_MAX_H && r.top > spaceBelow
    setPos({
      left: r.left,
      width: r.width,
      top: flipUp ? undefined : r.bottom + 4,
      bottom: flipUp ? window.innerHeight - r.top + 4 : undefined,
    })
  }

  const toggle = () => {
    if (!open) computePos()
    setOpen((v) => !v)
  }

  // Re-focus search + recompute on open; reposition on scroll/resize.
  useEffect(() => {
    if (!open) return
    computePos()
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    const reflow = () => computePos()
    window.addEventListener('scroll', reflow, true)
    window.addEventListener('resize', reflow)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('scroll', reflow, true)
      window.removeEventListener('resize', reflow)
    }
  }, [open])

  // Close on outside click (trigger and portal panel both count as "inside").
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (val: string) => {
    onChange(val)
    setOpen(false)
    setSearch('')
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearch('')
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="ml-2 flex shrink-0 items-center gap-1 text-gray-400">
          {selected && <X className="h-3.5 w-3.5 hover:text-gray-700" onClick={clear} />}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
            }}
            className="z-[100] overflow-hidden rounded-md border border-gray-300 bg-white"
          >
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
              />
            </div>

            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400">No results</li>
              ) : (
                filtered.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => select(o.value)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        o.value === value ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {renderOption && (
                        <span className="ml-2 shrink-0">{renderOption(o)}</span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
