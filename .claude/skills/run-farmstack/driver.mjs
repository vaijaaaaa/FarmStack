#!/usr/bin/env node
// FarmStack browser driver — drives the running Next.js app with Playwright
// using the SYSTEM Chrome (channel:'chrome'), so no browser download is needed.
//
// Usage (dev server must already be running on BASE_URL, default :3000):
//   node driver.mjs shoot [page] [outfile]   # screenshot a module
//   node driver.mjs flow                      # click through the sidebar, shoot each
//   node driver.mjs eval "<js>"               # run JS in the page, print result
//
// FarmStack is a state-driven single page: the sidebar swaps modules (no routing).
// "page" is a sidebar label substring: dashboard, purchase, sales, crop, accounts,
// entries, products, customers, suppliers, analytics, tally.
//
// Env: BASE_URL (default http://localhost:3000), HEADLESS (default '1'),
//      CHROME (override the Chrome executable path).
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS !== '0'
const SHOTS = join(HERE, 'shots')

const launchOpts = { headless: HEADLESS, channel: 'chrome' }
if (process.env.CHROME) {
  delete launchOpts.channel
  launchOpts.executablePath = process.env.CHROME
}

const out = (name) => (isAbsolute(name) ? name : join(SHOTS, name))

async function openApp(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 })
  // The app boots into the Dashboard; wait for the sidebar to render.
  await page.getByText('FarmStack').first().waitFor({ timeout: 30_000 })
  // Switch to Admin so the full sidebar (Crop Purchase, Accounts, Entries,
  // Customers, Products, Suppliers) is present — User role hides those.
  const admin = page.getByRole('button', { name: /^Admin$/ }).first()
  if (await admin.count()) {
    await admin.click().catch(() => {})
    await page.waitForTimeout(400)
  }
  return page
}

// Click a left-sidebar item by visible-label substring (case-insensitive).
async function gotoModule(page, label) {
  const link = page
    .locator('nav a, nav button, aside a, aside button')
    .filter({ hasText: new RegExp(label, 'i') })
    .first()
  await link.click({ timeout: 15_000 })
  await page.waitForTimeout(700) // module swap + first data render
}

async function main() {
  const [cmd = 'shoot', a1, a2] = process.argv.slice(2)
  await import('node:fs').then((fs) => fs.mkdirSync(SHOTS, { recursive: true }))
  const browser = await chromium.launch(launchOpts)
  try {
    const page = await openApp(browser)

    if (cmd === 'shoot') {
      if (a1) await gotoModule(page, a1)
      const file = out(a2 || `${a1 || 'dashboard'}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log('screenshot →', file)
    } else if (cmd === 'flow') {
      const pages = ['Dashboard', 'Purchase Invoice', 'Sales Invoice', 'Crop Purchase', 'Accounts', 'Entries']
      for (const p of pages) {
        await gotoModule(page, p)
        const file = out(`${p.toLowerCase().replace(/\s+/g, '-')}.png`)
        await page.screenshot({ path: file })
        console.log('screenshot →', file)
      }
    } else if (cmd === 'eval') {
      const result = await page.evaluate(a1)
      console.log(JSON.stringify(result))
    } else {
      console.error(`unknown command: ${cmd}`)
      process.exitCode = 2
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err.message)
  process.exit(1)
})
