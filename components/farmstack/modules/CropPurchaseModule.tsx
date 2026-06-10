'use client'

import { useMemo, useState } from 'react'
import { Plus, X, Download, Trash2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Language, CropPurchase } from '@/types/farmstack'
import { useCustomers, useSeasons, useCropPurchases, useLedgers } from '@/hooks/useDatabase'
import SearchableSelect from './accounts/SearchableSelect'
import { inr, fmtDate } from './accounts/data'
import { printHtml } from '@/lib/printHtml'

interface CropPurchaseModuleProps {
  language: Language
}

// One editable grid row (strings while editing).
// mode 'dropdown' = pick an existing season customer → posts to that ledger.
// mode 'typed'    = free-text walk-in seller → recorded only, no ledger.
type RowMode = 'dropdown' | 'typed'
interface CropRow {
  key: string
  mode: RowMode
  seasonId: string // stamped when the seller is picked; survives a header season change
  customer_id: string | null
  customer_name: string
  is_walkin: boolean
  bags: string
  weight: string
  price: string
  vehicle_number: string
  date: string
}

interface Config {
  labourPerBag: number
  wtAdjPerBag: number
  lessPercent: number
}

const today = () => new Date().toISOString().slice(0, 10)

let seq = 0
const uid = () => `crop-${Date.now()}-${seq++}`

// Legacy "Patti" constants (from Accountant.exe.Config). Price is the rate per
// ONE standard bag of BASE_WT kg — NOT per quintal.
const BASE_WT = 75 // PattiBaseWt — value = netWeight × price / 75
const DEFAULT_WT = 74 // PattiDefaultWt — per-bag weight used when Weight is left blank

// Legacy "Patti" net-payable formula, decoded from the old app's Export logic and
// verified cell-for-cell against the exported Excel. Lives here only.
// The Weight entered is the NET weight (exactly the value shown in the patti/Excel
// Weight column) — it is used as-is; no tare is subtracted here. It is read two ways:
//   • Weight > 75     → total net weight: gross = floor(weight × price / 75 + 0.1)
//   • 0 < Weight ≤ 75 → per-bag average weight: gross = floor(bags × price × weight / 75 + 0.1)
//   • Weight = 0      → fall back to DEFAULT_WT (74) as the per-bag weight.
// Then: labour = ceil(bags × labour/bag); less = round(gross × less%/100);
//       net = gross − labour − less.
function computeNet(row: CropRow, cfg: Config): number {
  const bags = Number(row.bags) || 0
  const weight = Number(row.weight) || 0
  const price = Number(row.price) || 0
  if (bags <= 0 || price <= 0) return 0

  let gross: number
  if (weight > BASE_WT) {
    // Total net weight (as entered) → value per base-bag.
    gross = Math.floor((weight * price) / BASE_WT + 0.1)
  } else if (weight > 0) {
    // Per-bag average weight.
    gross = Math.floor((bags * price * weight) / BASE_WT + 0.1)
  } else {
    // Weight blank → default per-bag weight.
    gross = Math.floor((bags * price * DEFAULT_WT) / BASE_WT + 0.1)
  }

  const labour = Math.ceil(bags * cfg.labourPerBag)
  const less = Math.round((gross * cfg.lessPercent) / 100)
  return gross - labour - less
}

// Same math as computeNet but for a stored CropPurchase, returning each part so
// the printed invoice / history can show the value, less and hamali breakdown.
function breakdownFor(cp: CropPurchase): { gross: number; less: number; labour: number; net: number } {
  const bags = Number(cp.bags) || 0
  const weight = Number(cp.weight) || 0
  const price = Number(cp.price) || 0
  let gross: number
  if (weight > BASE_WT) gross = Math.floor((weight * price) / BASE_WT + 0.1)
  else if (weight > 0) gross = Math.floor((bags * price * weight) / BASE_WT + 0.1)
  else gross = Math.floor((bags * price * DEFAULT_WT) / BASE_WT + 0.1)
  const labour = Math.ceil(bags * (Number(cp.labour_per_bag) || 0))
  const less = Math.round((gross * (Number(cp.less_percent) || 0)) / 100)
  return { gross, less, labour, net: gross - labour - less }
}

export default function CropPurchaseModule({ language: _language }: CropPurchaseModuleProps) {
  const { customers } = useCustomers()
  const { seasons } = useSeasons()
  const { ledgers } = useLedgers()
  const { cropPurchases, createCropPurchases } = useCropPurchases()

  const [seasonId, setSeasonId] = useState('')
  const [labourPerBag, setLabourPerBag] = useState('6')
  const [wtAdjPerBag, setWtAdjPerBag] = useState('2')
  const [lessPercent, setLessPercent] = useState('2')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{
    ledger: { name: string; net: number }[]
    walkin: { name: string; net: number }[]
  } | null>(null)

  const cfg: Config = {
    labourPerBag: Number(labourPerBag) || 0,
    wtAdjPerBag: Number(wtAdjPerBag) || 0,
    lessPercent: Number(lessPercent) || 0,
  }

  const blankRow = (mode: RowMode): CropRow => ({
    key: uid(),
    mode,
    seasonId,
    customer_id: null,
    customer_name: '',
    is_walkin: mode === 'typed',
    bags: '',
    weight: '',
    price: '',
    vehicle_number: '',
    date: today(),
  })

  // Always start with one dropdown row + one typed (walk-in) row.
  const [rows, setRows] = useState<CropRow[]>([blankRow('dropdown'), blankRow('typed')])

  // A row is "started" once it has a seller or any numeric input.
  const rowStarted = (r: CropRow) =>
    (r.mode === 'dropdown' ? r.customer_id !== null : r.customer_name.trim() !== '') ||
    r.bags.trim() !== '' ||
    r.weight.trim() !== '' ||
    r.price.trim() !== ''

  // Normalize the grid: keep every STARTED row plus exactly ONE trailing blank of
  // each mode. Extra empty rows are pruned automatically (they "close"), so the
  // two defaults (one dropdown + one typed) are all that ever linger unfilled.
  // Filling the last blank of a mode spawns a fresh blank of that same mode.
  const normalizeRows = (list: CropRow[]): CropRow[] => {
    const started = list.filter(rowStarted)
    const dropdownBlank =
      list.find((r) => r.mode === 'dropdown' && !rowStarted(r)) ?? blankRow('dropdown')
    const typedBlank = list.find((r) => r.mode === 'typed' && !rowStarted(r)) ?? blankRow('typed')
    return [...started, dropdownBlank, typedBlank]
  }

  const seasonOptions = seasons.map((s) => ({
    value: s.id,
    label: s.name || s.description || '(untitled)',
  }))

  // Ledgers in the selected season + active-account detection (same rule as the
  // server and other account views).
  const seasonLedgers = useMemo(
    () => (seasonId ? ledgers.filter((l) => l.season_id === seasonId) : []),
    [ledgers, seasonId],
  )
  const activeLedgerIds = useMemo(() => {
    const seasonName = new Map(seasons.map((s) => [s.id, s.name || '']))
    const oldestOpen = new Map<string, string>()
    for (const l of ledgers) {
      if (l.status === 'closed') continue
      const cur = oldestOpen.get(l.customer_id)
      const curLedger = cur ? ledgers.find((x) => x.id === cur) : undefined
      if (
        !curLedger ||
        (seasonName.get(l.season_id) || '') < (seasonName.get(curLedger.season_id) || '')
      )
        oldestOpen.set(l.customer_id, l.id)
    }
    return new Set(oldestOpen.values())
  }, [ledgers, seasons])

  // Only customers enrolled in the selected season appear in the dropdown.
  // Walk-ins (not in any season) are added via free text.
  const customerOptions = useMemo(() => {
    const enrolled = new Set(seasonLedgers.map((l) => l.customer_id))
    return customers.filter((c) => enrolled.has(c.id)).map((c) => ({ value: c.id, label: c.name }))
  }, [customers, seasonLedgers])

  const updateRow = (key: string, patch: Partial<CropRow>) => {
    setRows((prev) => normalizeRows(prev.map((r) => (r.key === key ? { ...r, ...patch } : r))))
    setMsg(null)
  }

  const removeRow = (key: string) => {
    setRows((prev) => normalizeRows(prev.filter((r) => r.key !== key)))
  }

  const pickCustomer = (key: string, id: string) => {
    // Block sellers whose account in this season is closed.
    const ledger = seasonLedgers.find((l) => l.customer_id === id)
    if (ledger?.status === 'closed') {
      const name = customers.find((c) => c.id === id)?.name ?? 'This customer'
      toast.error(`${name}'s account is closed — crop can't be posted to a closed account.`)
      return
    }
    updateRow(key, {
      seasonId,
      customer_id: id,
      customer_name: customers.find((c) => c.id === id)?.name ?? '',
      is_walkin: false,
    })
  }

  // Typed (walk-in) row: free text sets the name; never touches a ledger.
  const typeWalkin = (key: string, name: string) => {
    updateRow(key, { seasonId, customer_id: null, customer_name: name, is_walkin: true })
  }

  // ── Totals (read-only) ──────────────────────────────────────────────────────
  const totalBags = rows.reduce((s, r) => s + (Number(r.bags) || 0), 0)
  const totalWeight = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0)

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportXlsx = () => {
    const data = seasonId
      ? cropPurchases.filter((cp) => cp.season_id === seasonId)
      : cropPurchases
    if (data.length === 0) {
      toast.error('No crop purchases to export')
      return
    }
    const headers = ['Date', 'Customer', 'Walk-in?', 'Bags', 'Weight', 'Price', 'Net', 'Vehicle']
    const aoa: (string | number)[][] = [headers]
    for (const cp of data) {
      aoa.push([
        cp.date || '',
        cp.customer_name || '',
        cp.is_walkin ? 'Yes' : 'No',
        cp.bags || 0,
        cp.weight || 0,
        cp.price || 0,
        cp.net_amount || 0,
        cp.vehicle_number || '',
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c })
      if (ws[ref]) ws[ref].s = { font: { bold: true } }
    }
    ws['!cols'] = headers.map((h, c) => {
      const maxLen = aoa.reduce((m, row) => Math.max(m, String(row[c] ?? '').length), h.length)
      return { wch: Math.min(40, maxLen + 2) }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patti')
    XLSX.writeFile(wb, `crop_purchases_${today()}.xlsx`)
    toast.success('Crop purchases exported')
  }

  const clearAll = () => {
    setRows([blankRow('dropdown'), blankRow('typed')])
    setMsg(null)
  }

  // ── Recent crop purchases (history) ─────────────────────────────────────────
  const recentPurchases = useMemo(() => {
    const list = seasonId ? cropPurchases.filter((cp) => cp.season_id === seasonId) : cropPurchases
    return [...list]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 30)
  }, [cropPurchases, seasonId])

  // ── Print a half-A5 (A6) crop-purchase invoice (the "Patti") ────────────────
  const printCropInvoice = (cp: CropPurchase) => {
    const b = breakdownFor(cp)
    const seasonName = seasons.find((s) => s.id === cp.season_id)?.name || ''
    const rs = (n: number) => `₹${inr(n)}`
    printHtml(`<!doctype html><html><head><title>Patti — ${cp.customer_name || ''}</title>
      <style>
        @page { size: 105mm 148mm; margin: 6mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#111; margin:0; font-size:12px; }
        .title { text-align:center; font-size:13px; font-weight:bold; letter-spacing:.5px; margin-bottom:6px; }
        .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
        .name { font-size:15px; font-weight:bold; }
        .veh { text-align:right; font-size:12px; }
        .date { font-size:12px; color:#333; margin-top:2px; }
        hr { border:none; border-top:1px solid #999; margin:6px 0; }
        table { width:100%; border-collapse:collapse; }
        td { padding:2px 0; font-size:12px; }
        td.r { text-align:right; }
        .lbl { color:#444; }
        .grand td { font-size:14px; font-weight:bold; border-top:1px solid #000; padding-top:4px; }
        .ded td { color:#a00; }
      </style></head><body>
      <div class="title">CROP PURCHASE${seasonName ? ' · ' + seasonName : ''}</div>
      <div class="hdr">
        <div>
          <div class="name">${cp.customer_name || '—'}</div>
          <div class="date">Date: ${fmtDate(cp.date || cp.created_at || '')}</div>
        </div>
        <div class="veh">Vehicle No.<br><b>${cp.vehicle_number || '—'}</b></div>
      </div>
      <hr>
      <table>
        <tr><td class="lbl">Bags</td><td class="r">${inr(Number(cp.bags) || 0)}</td></tr>
        <tr><td class="lbl">Weight</td><td class="r">${inr(Number(cp.weight) || 0)}</td></tr>
        <tr><td class="lbl">Rate</td><td class="r">${rs(Number(cp.price) || 0)}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="lbl">Value</td><td class="r">${rs(b.gross)}</td></tr>
        <tr class="ded"><td class="lbl">Less (${inr(Number(cp.less_percent) || 0)}%)</td><td class="r">- ${inr(b.less)}</td></tr>
        <tr class="ded"><td class="lbl">Hamali</td><td class="r">- ${inr(b.labour)}</td></tr>
        <tr class="grand"><td>Grand Total</td><td class="r">${rs(b.net)}</td></tr>
      </table>
      </body></html>`)
  }

  // ── Save flow ───────────────────────────────────────────────────────────────
  const openConfirm = () => {
    setMsg(null)
    const valid = rows.filter(
      (r) => (r.customer_id || (r.is_walkin && r.customer_name)) && computeNet(r, cfg) > 0,
    )
    if (valid.length === 0) {
      setMsg({ kind: 'err', text: 'Add at least one row with a seller and a positive value.' })
      return
    }
    if (valid.some((r) => !(r.seasonId || seasonId))) {
      setMsg({ kind: 'err', text: 'Please select a season.' })
      return
    }
    setConfirm({
      ledger: valid
        .filter((r) => r.customer_id)
        .map((r) => ({ name: r.customer_name, net: computeNet(r, cfg) })),
      walkin: valid
        .filter((r) => r.is_walkin)
        .map((r) => ({ name: r.customer_name, net: computeNet(r, cfg) })),
    })
  }

  const doSave = async () => {
    setConfirm(null)
    const valid = rows.filter(
      (r) => (r.customer_id || (r.is_walkin && r.customer_name)) && computeNet(r, cfg) > 0,
    )

    // Group by each row's own season (rows may span seasons if the header season
    // changed between picks) → one batch per season.
    const bySeason = new Map<string, CropRow[]>()
    for (const r of valid) {
      const sid = r.seasonId || seasonId
      if (!bySeason.has(sid)) bySeason.set(sid, [])
      bySeason.get(sid)!.push(r)
    }

    setSaving(true)
    try {
      for (const [sid, seasonRows] of bySeason) {
        await createCropPurchases({
          season_id: sid,
          labour_per_bag: cfg.labourPerBag,
          wt_adj_per_bag: cfg.wtAdjPerBag,
          less_percent: cfg.lessPercent,
          rows: seasonRows.map((r) => ({
            customer_id: r.customer_id,
            customer_name: r.customer_name,
            is_walkin: r.is_walkin ? 1 : 0,
            bags: Number(r.bags) || 0,
            weight: Number(r.weight) || 0,
            price: Number(r.price) || 0,
            vehicle_number: r.vehicle_number.trim(),
            net_amount: computeNet(r, cfg),
            date: r.date,
          })),
        })
      }
      setRows([blankRow('dropdown'), blankRow('typed')])
      setMsg({
        kind: 'ok',
        text: `${valid.length} crop ${valid.length === 1 ? 'purchase' : 'purchases'} saved.`,
      })
    } catch (err) {
      const text = (err as Error).message
      setMsg({ kind: 'err', text })
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-black">Crop Purchase</h1>

      {/* ── Config bar ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex w-52 flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Season</span>
            <SearchableSelect
              options={seasonOptions}
              value={seasonId}
              onChange={setSeasonId}
              placeholder="— Select season —"
            />
          </div>
          <ConfigInput label="Labour/Bag" value={labourPerBag} onChange={setLabourPerBag} />
          <ConfigInput label="Wt. Adj/Bag" value={wtAdjPerBag} onChange={setWtAdjPerBag} />
          <ConfigInput label="Less %" value={lessPercent} onChange={setLessPercent} />
        </div>
      </div>

      {/* ── Summary + actions bar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Bags </span>
            <span className="font-semibold text-gray-900">{inr(totalBags)}</span>
          </div>
          <div>
            <span className="text-gray-500">Weight </span>
            <span className="font-semibold text-gray-900">{inr(totalWeight)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openConfirm}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={exportXlsx}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-400"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-red-300 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="overflow-visible rounded-xl border border-gray-400 bg-white">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-400 bg-gray-50 text-left">
              <th className="w-10 border-r border-gray-400 px-2 py-2.5 text-center font-medium text-gray-400">#</th>
              <th className="w-80 border-r border-gray-400 px-3 py-2.5 font-medium text-gray-500">Customer</th>
              <th className="w-24 border-r border-gray-400 px-3 py-2.5 text-right font-medium text-gray-500">Bags</th>
              <th
                className="w-28 border-r border-gray-400 px-3 py-2.5 text-right font-medium text-gray-500"
                title="Net weight (the value shown on the patti). A value of 75 or less is read as the per-bag average weight."
              >
                Weight
              </th>
              <th className="w-28 border-r border-gray-400 px-3 py-2.5 text-right font-medium text-gray-500">Price</th>
              <th className="w-32 border-r border-gray-400 px-3 py-2.5 text-right font-medium text-gray-500">Net</th>
              <th className="border-r border-gray-400 px-3 py-2.5 font-medium text-gray-500">Vehicle No.</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {[...rows.filter((r) => r.mode === 'dropdown'), ...rows.filter((r) => r.mode === 'typed')].map((r, i) => {
              const net = computeNet(r, cfg)
              const started = rowStarted(r)
              return (
                <tr
                  key={r.key}
                  className={`border-b border-gray-300 last:border-0 hover:bg-gray-50/50 ${
                    r.mode === 'typed' ? 'bg-purple-50/30' : ''
                  }`}
                >
                  <td className="border-r border-gray-400 px-2 py-1.5 text-center text-xs text-gray-400">
                    {started ? i + 1 : ''}
                  </td>
                  <td className="border-r border-gray-400 px-3 py-2.5">
                    {r.mode === 'dropdown' ? (
                      <SearchableSelect
                        options={customerOptions}
                        value={r.customer_id ?? ''}
                        onChange={(id) => pickCustomer(r.key, id)}
                        placeholder="— Select customer —"
                        triggerClassName="py-2.5 text-base border-gray-400 font-medium"
                        renderOption={(o) => {
                          const l = seasonLedgers.find((x) => x.customer_id === o.value)
                          if (!l) return null
                          const closed = l.status === 'closed'
                          const active = !closed && activeLedgerIds.has(l.id)
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              closed
                                ? 'bg-red-100 text-red-600'
                                : active
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-green-100 text-green-700'
                            }`}>
                              {closed ? 'Closed' : active ? 'Active' : 'Open'}
                            </span>
                          )
                        }}
                      />
                    ) : (
                      <input
                        value={r.customer_name}
                        onChange={(e) => typeWalkin(r.key, e.target.value)}
                        placeholder="customer name"
                        className="w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base font-medium text-gray-700 placeholder-grey-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    )}
                  </td>
                  <td className="border-r border-gray-400 px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r.bags}
                      onChange={(e) => updateRow(r.key, { bags: e.target.value })}
                      placeholder="0"
                      className="w-full rounded bg-transparent px-2 py-2 text-right text-sm text-gray-900 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="border-r border-gray-400 px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r.weight}
                      onChange={(e) => updateRow(r.key, { weight: e.target.value })}
                      placeholder="0"
                      className="w-full rounded bg-transparent px-2 py-2 text-right text-sm text-gray-900 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="border-r border-gray-400 px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => updateRow(r.key, { price: e.target.value })}
                      placeholder="0"
                      className="w-full rounded bg-transparent px-2 py-2 text-right text-sm text-gray-900 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="border-r border-gray-400 px-3 py-1.5 text-right">
                    <span className={`text-sm font-medium ${net > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                      ₹{inr(net)}
                    </span>
                  </td>
                  <td className="border-r border-gray-400 px-2 py-1.5">
                    <input
                      value={r.vehicle_number}
                      onChange={(e) => updateRow(r.key, { vehicle_number: e.target.value })}
                      placeholder="KA-00-0000"
                      className="w-full rounded bg-transparent px-2 py-2 text-sm text-gray-700 placeholder-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {started && (
                      <button
                        onClick={() => removeRow(r.key)}
                        className="text-gray-300 hover:text-red-500"
                        title="Remove row"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-gray-400">
          Fill a row to add the next one automatically. Type a name not in the list to add a
          walk-in seller (recorded only — no ledger).
        </p>
        {msg && (
          <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>
        )}
      </div>

      {/* ── Recent crop purchases (history) ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-300 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Recent Crop Purchases
            {seasonId && (
              <span className="ml-2 font-normal text-gray-400">
                · {seasons.find((s) => s.id === seasonId)?.name}
              </span>
            )}
          </h2>
          <span className="text-xs text-gray-400">{recentPurchases.length} shown</span>
        </div>
        {recentPurchases.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            No crop purchases yet{seasonId ? ' for this season' : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Bags</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 text-center font-medium">Print</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.map((cp) => (
                  <tr key={cp.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-600">{fmtDate(cp.date || cp.created_at || '')}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {cp.customer_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{inr(cp.bags || 0)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{inr(cp.weight || 0)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">₹{inr(cp.price || 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">₹{inr(cp.net_amount || 0)}</td>
                    <td className="px-3 py-2 text-gray-500">{cp.vehicle_number || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => printCropInvoice(cp)}
                        title="Print invoice"
                        className="inline-flex items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirmation modal ──────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800">Confirm crop purchase</h3>
              <button onClick={() => setConfirm(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 space-y-4 overflow-auto px-5 py-4 text-sm">
              {confirm.ledger.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase text-green-700">
                    Will post to ledger
                  </p>
                  <ul className="space-y-1">
                    {confirm.ledger.map((x, idx) => (
                      <li key={idx} className="flex justify-between text-gray-700">
                        <span>{x.name}</span>
                        <span className="font-medium">₹{inr(x.net)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {confirm.walkin.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase text-purple-600">
                    Recorded only — no account
                  </p>
                  <ul className="space-y-1">
                    {confirm.walkin.map((x, idx) => (
                      <li key={idx} className="flex justify-between text-gray-700">
                        <span>{x.name}</span>
                        <span className="font-medium">₹{inr(x.net)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={doSave}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
              >
                Confirm &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex w-28 flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}
