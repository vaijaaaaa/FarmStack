// Seed test data into Supabase. Run: node supabase/seed.js
// Idempotent: fixed seed-* ids + ON CONFLICT DO NOTHING, safe to re-run.
const fs = require('node:fs')

const url = fs
  .readFileSync(require('node:path').join(__dirname, '..', '.env.local'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))
  .slice('DATABASE_URL='.length)
  .trim()

const { Pool } = require('pg')
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

const now = (d) => new Date(d).toISOString()

// Seeds, Fertilizers, Pesticide already exist in your DB — these add the two
// missing ones; existing names are skipped via ON CONFLICT (name).
const productTypes = [
  { id: 'seed-pt-4', name: 'Irrigation', description: 'Drip and sprinkler equipment', tax: 12 },
  { id: 'seed-pt-5', name: 'Tools', description: 'Farm tools and equipment', tax: 18 },
]

const products = [
  { id: 'seed-prod-1', name: 'Hybrid Maize Seed', kannada_name: 'ಮೆಕ್ಕೆ ಜೋಳ ಬೀಜ', hsn_code: '1209', unit: 'BAG', product_type: 'Seeds', gst_rate: 5, selling_price: 1200, tally_price: 1200, is_seed: 1, location: 'Karnataka' },
  { id: 'seed-prod-2', name: 'Urea Fertilizer 50kg', kannada_name: 'ಯೂರಿಯಾ ಗೊಬ್ಬರ', hsn_code: '3102', unit: 'BAG', product_type: 'Fertilizers', gst_rate: 5, selling_price: 300, tally_price: 300, is_seed: 0, location: 'Karnataka' },
  { id: 'seed-prod-3', name: 'Glyphosate Pesticide 1L', kannada_name: 'ಕೀಟನಾಶಕ', hsn_code: '3808', unit: 'LTR', product_type: 'Pesticide', gst_rate: 18, selling_price: 450, tally_price: 450, is_seed: 0, location: 'Karnataka' },
  { id: 'seed-prod-4', name: 'Drip Irrigation Pipe', kannada_name: 'ಹನಿ ನೀರಾವರಿ ಕೊಳವೆ', hsn_code: '3917', unit: 'MTR', product_type: 'Irrigation', gst_rate: 12, selling_price: 25, tally_price: 25, is_seed: 0, location: 'Karnataka' },
  { id: 'seed-prod-5', name: 'Garden Sprayer 16L', kannada_name: 'ಸಿಂಪಡಿಸುವ ಯಂತ್ರ', hsn_code: '8424', unit: 'PCS', product_type: 'Tools', gst_rate: 18, selling_price: 850, tally_price: 850, is_seed: 0, location: 'Karnataka' },
]

const suppliers = [
  { id: 'seed-supp-1', name: 'Karnataka Agro Seeds Pvt Ltd', phone: '9845011111', address: 'Yeshwanthpur, Bengaluru', state: 'Karnataka', country: 'India', gstin: '29AABCK1234A1Z5', place_of_supply: 'Karnataka' },
  { id: 'seed-supp-2', name: 'Krishna Fertilizers', phone: '9845022222', address: 'Hubballi', state: 'Karnataka', country: 'India', gstin: '29AABCK2345B1Z4', place_of_supply: 'Karnataka' },
  { id: 'seed-supp-3', name: 'Green Valley Agro Chemicals', phone: '9845033333', address: 'Belagavi', state: 'Karnataka', country: 'India', gstin: '29AABCG3456C1Z3', place_of_supply: 'Karnataka' },
  { id: 'seed-supp-4', name: 'Sri Sai Irrigation Systems', phone: '9845044444', address: 'Davangere', state: 'Karnataka', country: 'India', gstin: '29AABCS4567D1Z2', place_of_supply: 'Karnataka' },
  { id: 'seed-supp-5', name: 'Farm Tools India', phone: '9845055555', address: 'Mysuru', state: 'Karnataka', country: 'India', gstin: '29AABCF5678E1Z1', place_of_supply: 'Karnataka' },
]

const customers = [
  { id: 'seed-cust-1', name: 'Ramesh Gowda', kannada_name: 'ರಮೇಶ್ ಗೌಡ', phone: '9900011111', address: 'Mandya', state: 'Karnataka', country: 'India', gstin: '', display_number: 'C-001' },
  { id: 'seed-cust-2', name: 'Lakshmi Devi', kannada_name: 'ಲಕ್ಷ್ಮಿ ದೇವಿ', phone: '9900022222', address: 'Tumakuru', state: 'Karnataka', country: 'India', gstin: '', display_number: 'C-002' },
  { id: 'seed-cust-3', name: 'Suresh Patil', kannada_name: 'ಸುರೇಶ್ ಪಾಟೀಲ್', phone: '9900033333', address: 'Vijayapura', state: 'Karnataka', country: 'India', gstin: '29AAAPP1234Q1Z5', display_number: 'C-003' },
  { id: 'seed-cust-4', name: 'Manjunath Hegde', kannada_name: 'ಮಂಜುನಾಥ್ ಹೆಗ್ಡೆ', phone: '9900044444', address: 'Shivamogga', state: 'Karnataka', country: 'India', gstin: '', display_number: 'C-004' },
  { id: 'seed-cust-5', name: 'Anita Kulkarni', kannada_name: 'ಅನಿತಾ ಕುಲಕರ್ಣಿ', phone: '9900055555', address: 'Dharwad', state: 'Karnataka', country: 'India', gstin: '', display_number: 'C-005' },
]

// Purchases bring stock in; sales draw from products that have purchase stock.
const purchases = [
  { id: 'seed-pinv-1', supplier_id: 'seed-supp-1', supplier_name: 'Karnataka Agro Seeds Pvt Ltd', supplier_invoice_number: 'KAS-1001', purchase_date: '2026-05-02',
    items: [{ id: 'seed-pit-1', product_id: 'seed-prod-1', product_name: 'Hybrid Maize Seed', quantity: 50, buying_price: 1000, selling_price: 1200, tax: 5, unit: 'BAG' }] },
  { id: 'seed-pinv-2', supplier_id: 'seed-supp-2', supplier_name: 'Krishna Fertilizers', supplier_invoice_number: 'KF-2001', purchase_date: '2026-05-08',
    items: [{ id: 'seed-pit-2', product_id: 'seed-prod-2', product_name: 'Urea Fertilizer 50kg', quantity: 100, buying_price: 250, selling_price: 300, tax: 5, unit: 'BAG' }] },
  { id: 'seed-pinv-3', supplier_id: 'seed-supp-3', supplier_name: 'Green Valley Agro Chemicals', supplier_invoice_number: 'GV-3001', purchase_date: '2026-05-15',
    items: [{ id: 'seed-pit-3', product_id: 'seed-prod-3', product_name: 'Glyphosate Pesticide 1L', quantity: 40, buying_price: 380, selling_price: 450, tax: 18, unit: 'LTR' }] },
]

const sales = [
  { id: 'seed-sinv-1', invoice_number: 'INV-001', customer_id: 'seed-cust-1', customer_name: 'Ramesh Gowda', date: '2026-05-20', sale_type: 'cash',
    items: [{ id: 'seed-sit-1', product_id: 'seed-prod-1', quantity: 10, rate: 1200, gst: 5, unit: 'BAG' }] },
  { id: 'seed-sinv-2', invoice_number: 'INV-002', customer_id: 'seed-cust-2', customer_name: 'Lakshmi Devi', date: '2026-05-25', sale_type: 'credit',
    items: [{ id: 'seed-sit-2', product_id: 'seed-prod-2', quantity: 20, rate: 300, gst: 5, unit: 'BAG' }] },
]

// Tally ledger names are derived from a product's category, mirroring the app's
// toSalesLedger / toPurchaseLedger. Without these (and a non-zero tally_price)
// a voucher can't be built and Tally sync fails.
const productById = Object.fromEntries(products.map((p) => [p.id, p]))
const ledger = (productId, verb) => {
  const t = (productById[productId]?.product_type || '').toLowerCase()
  const noun =
    { seed: 'Seeds', seeds: 'Seeds', fertilizer: 'Fertilizers', fertilizers: 'Fertilizers',
      micronutrient: 'Micronutrients', micronutrients: 'Micronutrients',
      pesticide: 'Pesticides', pesticides: 'Pesticides', grain: 'Grains', grains: 'Grains' }[t]
  return `${verb} of ${noun || productById[productId]?.product_type || ''}`
}
const tallyPriceOf = (productId) => Number(productById[productId]?.tally_price || 0)

async function main() {
  const client = await pool.connect()
  try {
    for (const pt of productTypes) {
      await client.query(
        `INSERT INTO product_types (id,name,description,tax,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING`,
        [pt.id, pt.name, pt.description, pt.tax, now('2026-05-01')],
      )
    }
    for (const p of products) {
      await client.query(
        `INSERT INTO products (id,name,kannada_name,hsn_code,unit,product_type,location,gst_rate,selling_price,tally_price,is_seed,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (name) DO NOTHING`,
        [p.id, p.name, p.kannada_name, p.hsn_code, p.unit, p.product_type, p.location, p.gst_rate, p.selling_price, p.tally_price, p.is_seed, now('2026-05-01')],
      )
    }
    for (const s of suppliers) {
      await client.query(
        `INSERT INTO suppliers (id,name,phone,address,state,country,gstin,place_of_supply,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (name) DO NOTHING`,
        [s.id, s.name, s.phone, s.address, s.state, s.country, s.gstin, s.place_of_supply, now('2026-05-01')],
      )
    }
    for (const c of customers) {
      await client.query(
        `INSERT INTO customers (id,name,kannada_name,phone,address,state,country,gstin,display_number,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (name) DO NOTHING`,
        [c.id, c.name, c.kannada_name, c.phone, c.address, c.state, c.country, c.gstin, c.display_number, now('2026-05-01')],
      )
    }
    for (const pv of purchases) {
      const total = pv.items.reduce((sum, it) => sum + it.quantity * it.buying_price * (1 + it.tax / 100), 0)
      await client.query(
        `INSERT INTO purchase_invoices (id,supplier_id,supplier_name,supplier_invoice_number,purchase_date,total,status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'saved',$7) ON CONFLICT (id) DO NOTHING`,
        [pv.id, pv.supplier_id, pv.supplier_name, pv.supplier_invoice_number, pv.purchase_date, total, now(pv.purchase_date)],
      )
      for (const it of pv.items) {
        const totalPrice = it.quantity * it.buying_price * (1 + it.tax / 100)
        await client.query(
          `INSERT INTO purchase_items (id,invoice_id,product_id,product_name,quantity,buying_price,selling_price,tally_price,tax,total_price,type,unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
          [it.id, pv.id, it.product_id, it.product_name, it.quantity, it.buying_price, it.selling_price, tallyPriceOf(it.product_id), it.tax, totalPrice, ledger(it.product_id, 'Purchase'), it.unit],
        )
      }
    }
    for (const sv of sales) {
      const total = sv.items.reduce((sum, it) => sum + it.quantity * it.rate * (1 + it.gst / 100), 0)
      await client.query(
        `INSERT INTO sales_invoices (id,invoice_number,customer_id,customer_name,tally_name,date,sale_type,total,status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'saved',$9) ON CONFLICT (id) DO NOTHING`,
        [sv.id, sv.invoice_number, sv.customer_id, sv.customer_name, sv.customer_name, sv.date, sv.sale_type, total, now(sv.date)],
      )
      for (const it of sv.items) {
        await client.query(
          `INSERT INTO sales_items (id,invoice_id,product_id,quantity,rate,tally_price,gst,type,unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
          [it.id, sv.id, it.product_id, it.quantity, it.rate, tallyPriceOf(it.product_id) || it.rate, it.gst, ledger(it.product_id, 'Sales'), it.unit],
        )
      }
    }

    const counts = {}
    for (const t of ['product_types', 'products', 'suppliers', 'customers', 'purchase_invoices', 'sales_invoices']) {
      counts[t] = (await client.query(`SELECT count(*) FROM ${t}`)).rows[0].count
    }
    console.log('Seed complete. Row counts:', counts)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
