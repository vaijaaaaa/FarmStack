'use client'

import { useEffect } from 'react'

// Tally-style keyboard data entry, applied app-wide.
//  - Enter inside a form field moves focus to the NEXT field
//  - ArrowDown / ArrowUp move to the next / previous field
//  - Enter on the LAST field submits the form (clicks [data-kbd-submit])
//  - Ctrl+S / Cmd+S submits from anywhere in the form
//
// Left/Right are left untouched (normal text-cursor movement). Arrow nav is
// only applied to plain inputs — <select> keeps native Up/Down (change option)
// and <textarea> keeps native Up/Down (move between lines).
//
// A "form" is any element marked with [data-kbd-scope]; its primary action
// button must be marked with [data-kbd-submit]. Scopes can be nested (e.g. a
// modal inside a page) — the nearest scope to the focused field wins.

const FIELD_SELECTOR = 'input, select, textarea'

function isVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false
  if ((el as HTMLInputElement).type === 'hidden') return false
  return el.offsetParent !== null || el.getClientRects().length > 0
}

export default function FormKeyboardNav() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return

      const scope = target.closest('[data-kbd-scope]') as HTMLElement | null

      // Ctrl/Cmd+S → submit
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        const root: ParentNode = scope ?? document
        const submitBtn = root.querySelector('[data-kbd-submit]') as HTMLElement | null
        if (submitBtn) {
          e.preventDefault()
          submitBtn.click()
        }
        return
      }

      const isArrow = e.key === 'ArrowDown' || e.key === 'ArrowUp'
      if (e.key !== 'Enter' && !isArrow) return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (!scope) return

      const tag = target.tagName
      const inputType = (target as HTMLInputElement).type
      const isManagedInput =
        tag === 'INPUT' &&
        inputType !== 'button' &&
        inputType !== 'submit' &&
        inputType !== 'checkbox' &&
        inputType !== 'radio' &&
        inputType !== 'file'

      // Up/Down field jump: plain inputs only. <select> keeps native option
      // change and <textarea> keeps native line movement.
      if (isArrow) {
        if (!isManagedInput) return
        const fields = Array.from(
          scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
        ).filter(isVisible)
        const idx = fields.indexOf(target)
        if (idx === -1) return
        const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1
        if (nextIdx < 0 || nextIdx >= fields.length) {
          e.preventDefault()
          return
        }
        e.preventDefault()
        const next = fields[nextIdx]
        next.focus()
        if (
          next instanceof HTMLInputElement &&
          /^(text|search|tel|url|email|number|password)$/.test(next.type)
        ) {
          next.select()
        }
        return
      }

      // Enter: advance, or submit on the last field.
      if (tag !== 'INPUT' && tag !== 'SELECT') return // textarea keeps newline
      if (!isManagedInput && tag !== 'SELECT') return

      e.preventDefault()

      const fields = Array.from(
        scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
      ).filter(isVisible)

      const idx = fields.indexOf(target)
      if (idx === -1) return

      if (idx < fields.length - 1) {
        const next = fields[idx + 1]
        next.focus()
        if (
          next instanceof HTMLInputElement &&
          /^(text|search|tel|url|email|number|password)$/.test(next.type)
        ) {
          next.select()
        }
      } else {
        const submitBtn = scope.querySelector('[data-kbd-submit]') as HTMLElement | null
        submitBtn?.click()
      }
    }

    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  return null
}
