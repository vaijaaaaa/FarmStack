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

// Find the Cancel / Close / Back button in a modal or form, so Escape can "go
// back". Honours an explicit [data-kbd-cancel] first, then aria-label, then text.
function findCancelButton(scope: HTMLElement): HTMLElement | null {
  const marked = scope.querySelector('[data-kbd-cancel]') as HTMLElement | null
  if (marked) return marked
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button'))
  const byAria = buttons.find((b) =>
    /close|cancel|back/i.test(b.getAttribute('aria-label') || ''),
  )
  if (byAria) return byAria
  return (
    buttons.find((b) => {
      const txt = (b.textContent || '').trim().toLowerCase()
      return (
        txt === 'cancel' ||
        txt === 'close' ||
        txt === 'back' ||
        txt === '×' ||
        txt === '✕' ||
        txt === 'x' ||
        txt.startsWith('back to') ||
        txt.startsWith('← back')
      )
    }) || null
  )
}

function isVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false
  if ((el as HTMLInputElement).type === 'hidden') return false
  return el.offsetParent !== null || el.getClientRects().length > 0
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

// Where Tab should be trapped: the topmost open modal if any, else the whole
// app. Keeps Tab from leaving the page into the browser chrome.
function getTrapRoot(): HTMLElement {
  const modals = Array.from(
    document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"]'),
  ).filter(isVisible)
  for (let i = modals.length - 1; i >= 0; i--) {
    if (getFocusable(modals[i]).length > 0) return modals[i]
  }
  return document.body
}

// Where the text caret sits, so Left/Right only jump fields at the field edge
// (keeping normal cursor movement inside text). Returns null when the field has
// no usable text caret (number / email / etc.) — those always jump on Left/Right.
function caretEdge(el: HTMLInputElement): { atStart: boolean; atEnd: boolean } | null {
  try {
    if (typeof el.selectionStart !== 'number') return null
    const start = el.selectionStart
    const end = el.selectionEnd ?? start
    if (start !== end) return { atStart: false, atEnd: false } // text selected → native
    return { atStart: start === 0, atEnd: start === (el.value ?? '').length }
  } catch {
    return null
  }
}

export default function FormKeyboardNav() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return

      // The "scope" is the set of fields to navigate among. An explicit
      // [data-kbd-scope] wins (and enables Enter-to-submit via [data-kbd-submit]).
      // Otherwise fall back so navigation works everywhere: the nearest form, a
      // modal/dialog, this app's fixed-overlay modals, or the page content
      // (<main>). Inputs outside all of these (header/sidebar) stay untouched.
      const scope =
        (target.closest('[data-kbd-scope]') as HTMLElement | null) ||
        (target.closest('form') as HTMLElement | null) ||
        (target.closest('[role="dialog"]') as HTMLElement | null) ||
        (target.closest('.fixed') as HTMLElement | null) ||
        (target.closest('main') as HTMLElement | null)

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

      // Escape → go back: close the nearest modal/form by clicking its
      // Cancel/Close/Back button.
      if (e.key === 'Escape') {
        const escScope =
          (target.closest('[role="dialog"]') as HTMLElement | null) ||
          (target.closest('.fixed') as HTMLElement | null) ||
          (target.closest('[data-kbd-scope]') as HTMLElement | null) ||
          (target.closest('form') as HTMLElement | null)
        const cancelBtn = escScope && findCancelButton(escScope)
        if (cancelBtn) {
          e.preventDefault()
          cancelBtn.click()
        }
        return
      }

      // Tab trap: keep focus inside the app (or the open modal) instead of
      // escaping to the browser toolbar. Only wraps at the first/last element;
      // normal Tab between fields is left to the browser.
      if (e.key === 'Tab') {
        const root = getTrapRoot()
        const focusables = getFocusable(root)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey) {
          if (!active || active === first || !root.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (!active || active === last || !root.contains(active)) {
            e.preventDefault()
            first.focus()
          }
        }
        return
      }

      const isVertical = e.key === 'ArrowDown' || e.key === 'ArrowUp'
      const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      const isArrow = isVertical || isHorizontal
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

      // Arrow field-jump: plain inputs only. <select> keeps native option change
      // and <textarea> keeps native cursor/line movement.
      if (isArrow) {
        if (!isManagedInput) return

        // Left/Right move the caret inside the text and only jump fields at the
        // field edge (or when there's no editable caret, e.g. number fields).
        if (isHorizontal) {
          const caret = caretEdge(target as HTMLInputElement)
          if (caret) {
            if (e.key === 'ArrowRight' && !caret.atEnd) return
            if (e.key === 'ArrowLeft' && !caret.atStart) return
          }
        }

        const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
        const fields = Array.from(
          scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
        ).filter(isVisible)
        const idx = fields.indexOf(target)
        if (idx === -1) return
        const nextIdx = forward ? idx + 1 : idx - 1
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
