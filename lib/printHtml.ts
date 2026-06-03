'use client'

// Print an HTML document via a hidden iframe instead of window.open(). Browsers
// block sized pop-up windows ("Please allow pop-ups…"), but printing through an
// iframe is a same-document action that is never pop-up-blocked.
export function printHtml(html: string): void {
  if (typeof document === 'undefined') return

  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  })
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  let done = false
  const doPrint = () => {
    if (done) return
    done = true
    win.focus()
    win.print()
    // Leave it long enough for the print dialog to read the document.
    setTimeout(() => iframe.remove(), 1000)
  }

  // Print once the iframe content is ready; fall back to a short timeout for
  // browsers that don't fire onload after document.write.
  win.onload = doPrint
  setTimeout(doPrint, 300)
}
