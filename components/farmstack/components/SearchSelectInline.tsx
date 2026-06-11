'use client'

import { useEffect, useRef, useState } from 'react'

// Inline searchable dropdown — type to filter, the SAME global FormKeyboardNav
// drives arrow/Enter navigation through the options (they are real, focusable
// <button>s kept in the form DOM). The panel is position:fixed so it is never
// clipped by a scrolling parent (e.g. a table with overflow-x-auto).
//
// Used for the Product pickers so they behave identically to the Supplier
// dropdown, which follows the same input + focusable-buttons pattern.

export interface InlineOption {
  value: string
  label: string
}

export interface InlineFooterAction {
  key: string
  label: string
  onSelect: () => void
  className?: string
}

interface Props {
  options: InlineOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputClassName?: string
  footerActions?: InlineFooterAction[]
  emptyText?: string
  /** 'auto' (default) flips up when short on room below; 'down'/'up' force a side. */
  direction?: 'auto' | 'down' | 'up'
}

export default function SearchSelectInline({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  inputClassName = '',
  footerActions = [],
  emptyText = 'No results',
  direction = 'auto',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  // Show the selected option's label in the box; re-sync when value changes.
  useEffect(() => {
    setSearch(selectedLabel)
  }, [selectedLabel])

  // While the box still shows the selected label, treat it as "not searching"
  // so the full list is visible; once the user edits the text, filter.
  const isSearching = search.trim() !== '' && search !== selectedLabel
  const filtered = isSearching
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const PANEL_MAX_H = 320

  const computePos = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    // Flip the panel above the input when there isn't enough room below it —
    // unless a direction is forced.
    const flipUp =
      direction === 'up' ||
      (direction === 'auto' && spaceBelow < PANEL_MAX_H && r.top > spaceBelow)
    setPos({
      left: r.left,
      width: r.width,
      top: flipUp ? undefined : r.bottom + 4,
      bottom: flipUp ? window.innerHeight - r.top + 4 : undefined,
    })
  }

  // Reposition the fixed panel on scroll/resize while open.
  useEffect(() => {
    if (!open) return
    computePos()
    const reflow = () => computePos()
    window.addEventListener('scroll', reflow, true)
    window.addEventListener('resize', reflow)
    return () => {
      window.removeEventListener('scroll', reflow, true)
      window.removeEventListener('resize', reflow)
    }
  }, [open])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      data-dropdown-open={open ? '' : undefined}
      onBlur={(e) => {
        // Close once focus leaves the field entirely (input + all option buttons).
        if (!rootRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false)
          setSearch(selectedLabel)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
          setSearch(selectedLabel)
        }
      }}
      className="relative"
    >
      <input
        ref={inputRef}
        type="text"
        value={search}
        placeholder={placeholder}
        onChange={(e) => {
          setSearch(e.target.value)
          computePos()
          setOpen(true)
        }}
        onFocus={() => {
          computePos()
          setOpen(true)
        }}
        className={inputClassName}
      />
      {open && pos && (
        <div
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
          className="z-[100] overflow-hidden border border-gray-400 bg-white"
        >
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                className={`w-full text-left px-2 py-1 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                  o.value === value ? 'bg-blue-50 font-medium text-gray-900' : 'text-gray-800'
                }`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-1 text-sm text-gray-400">{emptyText}</p>
            )}
          </div>
          {footerActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                setOpen(false)
                a.onSelect()
              }}
              className={`w-full text-left px-2 py-1 text-sm font-medium border-t border-gray-300 focus:outline-none ${
                a.className ?? 'text-gray-800 hover:bg-blue-50 focus:bg-blue-50'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
