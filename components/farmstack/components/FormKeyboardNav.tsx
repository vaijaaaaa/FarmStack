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

// A valid navigation target: visible and not read-only. Read-only inputs
// (computed totals like "Total Amount", display-only fields) are skipped so
// arrow/Tab navigation never lands on something the user can't edit.
function isNavigable(el: HTMLElement): boolean {
  if (!isVisible(el)) return false
  if ((el as HTMLInputElement).readOnly) return false
  // tabindex=-1 = intentionally removed from keyboard navigation (read-only
  // display fields, items inside a custom dropdown that Tab should skip, etc.).
  if (el.tabIndex < 0) return false
  return true
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isNavigable)
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

type Dir = 'up' | 'down' | 'left' | 'right'

// Nearest focusable element in a given on-screen direction — 2D spatial /
// "TV-remote" navigation based on bounding-rect geometry, not DOM order.
function findSpatial(current: HTMLElement, dir: Dir): HTMLElement | null {
  // Search within the current region (form / modal / sidebar / page) so focus
  // moves orderly within a section instead of jumping across the whole screen.
  const root =
    (current.closest(
      '[data-kbd-scope], form, [role="dialog"], .fixed.inset-0, nav, aside, main',
    ) as HTMLElement | null) || getTrapRoot()
  const candidates = getFocusable(root).filter((el) => el !== current)
  const cur = current.getBoundingClientRect()
  const cx = cur.left + cur.width / 2
  const cy = cur.top + cur.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    let primary: number
    let perp: number
    if (dir === 'right') {
      if (dx <= 1) continue
      primary = dx
      perp = Math.abs(dy)
    } else if (dir === 'left') {
      if (dx >= -1) continue
      primary = -dx
      perp = Math.abs(dy)
    } else if (dir === 'down') {
      if (dy <= 1) continue
      primary = dy
      perp = Math.abs(dx)
    } else {
      if (dy >= -1) continue
      primary = -dy
      perp = Math.abs(dx)
    }
    // Favour elements aligned along the travel axis (small perpendicular offset).
    const score = primary + perp * 2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
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

      // Tab moves through NAVIGABLE elements only — read-only/calculated fields
      // (e.g. Total Amount) and tabindex=-1 items are skipped automatically — and
      // wraps inside the app/modal so focus never escapes to the browser toolbar.
      if (e.key === 'Tab') {
        const root = getTrapRoot()
        const focusables = getFocusable(root) // excludes read-only / disabled / tabindex=-1
        if (focusables.length === 0) return
        const active = document.activeElement as HTMLElement | null
        const idx = active ? focusables.indexOf(active) : -1
        e.preventDefault()
        if (idx === -1) {
          // Focus isn't on a navigable element (e.g. a read-only field) — jump to
          // the first/last navigable one.
          ;(e.shiftKey ? focusables[focusables.length - 1] : focusables[0]).focus()
          return
        }
        const nextIdx = (idx + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length
        focusables[nextIdx].focus()
        return
      }

      const isVertical = e.key === 'ArrowDown' || e.key === 'ArrowUp'
      const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      const isArrow = isVertical || isHorizontal
      if (e.key !== 'Enter' && !isArrow) return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return

      const tag = target.tagName
      const inputType = (target as HTMLInputElement).type
      const isManagedInput =
        tag === 'INPUT' &&
        inputType !== 'button' &&
        inputType !== 'submit' &&
        inputType !== 'checkbox' &&
        inputType !== 'radio' &&
        inputType !== 'file'

      // ---- Arrow keys: 2D spatial navigation by on-screen position ----
      if (isArrow) {
        // Keep native editing where it matters: <textarea> keeps all arrows,
        // <select> keeps Up/Down (option change), and text inputs keep Left/Right
        // caret movement until the caret reaches the field edge.
        if (tag === 'TEXTAREA') return
        if (tag === 'SELECT' && isVertical) return
        if (isManagedInput && isHorizontal) {
          const caret = caretEdge(target as HTMLInputElement)
          if (caret) {
            if (e.key === 'ArrowRight' && !caret.atEnd) return
            if (e.key === 'ArrowLeft' && !caret.atStart) return
          }
        }

        const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'

        // Inside a form, fields follow ONE predictable sequence in visual / DOM
        // order (Supplier Name → Invoice → Date → Sync → Product → Batch → …):
        // forward = next field, backward = previous field. Read-only fields
        // (e.g. Total Amount) are skipped automatically by getFocusable.
        const formScope = target.closest('[data-kbd-scope], form') as HTMLElement | null
        if (formScope && (tag === 'INPUT' || tag === 'SELECT')) {
          const fields = getFocusable(formScope)
          const idx = fields.indexOf(target)
          if (idx !== -1) {
            e.preventDefault()
            e.stopPropagation()
            const nx = fields[forward ? idx + 1 : idx - 1]
            if (nx) {
              nx.focus()
              if (
                nx instanceof HTMLInputElement &&
                /^(text|search|tel|url|email|number|password)$/.test(nx.type)
              ) {
                nx.select()
              }
            }
            return
          }
        }

        // Everything else (buttons, table rows, cards, sidebar): 2D spatial nav.
        const dir: Dir =
          e.key === 'ArrowUp'
            ? 'up'
            : e.key === 'ArrowDown'
              ? 'down'
              : e.key === 'ArrowLeft'
                ? 'left'
                : 'right'
        const next = findSpatial(target, dir)
        if (next) {
          e.preventDefault()
          e.stopPropagation()
          next.focus()
          if (
            next instanceof HTMLInputElement &&
            /^(text|search|tel|url|email|number|password)$/.test(next.type)
          ) {
            next.select()
          }
        } else if (!isManagedInput) {
          e.preventDefault()
        }
        return
      }

      // ---- Enter ----
      // Checkbox / radio toggle; <select>/<textarea>/<button>/<a> keep their
      // NATIVE behaviour (dropdown open+confirm, newline, click, follow link);
      // other focusable non-fields (table rows, cards) click; text/number fields
      // advance to the next field.
      if (tag === 'INPUT' && (inputType === 'checkbox' || inputType === 'radio')) {
        e.preventDefault()
        target.click()
        return
      }
      if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') {
        return
      }
      if (tag !== 'INPUT') {
        if (target.tabIndex >= 0) {
          e.preventDefault()
          target.click()
        }
        return
      }
      if (!isManagedInput) return

      // Enter on a text/number field: advance to the next field, or submit on last.
      if (!scope) return
      e.preventDefault()
      const fields = Array.from(
        scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
      ).filter(isNavigable)
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
