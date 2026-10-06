import { chromium } from '@playwright/test'
const SP = process.argv[2]
const b = await chromium.launch({ args: ['--disable-font-subpixel-positioning', '--font-render-hinting=none'] })
const PAPER = '#EBE4D7'
const paperize = async (p) => p.evaluate((paper) => {
  const alphaOf = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const parts = m[1].split(',').map((x) => parseFloat(x)); return parts.length > 3 ? parts[3] : 1 }
  const els = document.querySelectorAll('button, a, [role="checkbox"], [role="switch"], label span, button span')
  els.forEach((el) => {
    const cs = getComputedStyle(el)
    const bw = parseFloat(cs.borderTopWidth) || 0
    if (bw < 1 || cs.borderTopStyle === 'none') return
    const bg = cs.backgroundColor
    if (bg === 'transparent' || alphaOf(bg) < 0.35) el.style.backgroundColor = paper
  })
}, PAPER)
const shots = [
  ['wall-day', { width: 1920, height: 1080 }, '/__wall-fixture?at=2026-09-25T13:40:00', null],
  ['wall-launch', { width: 1920, height: 1080 }, '/__wall-fixture?at=2026-09-25T07:12:00', null],
  ['wall-todo', { width: 1920, height: 1080 }, '/__wall-fixture?at=2026-09-25T13:40:00', async (p) => { await p.getByRole('button', { name: /^To do:/ }).click(); await p.waitForTimeout(800) }],
  ['phone-today', { width: 390, height: 844 }, '/__phone-fixture?at=2026-09-25T07:12:00&viewer=jake-id', null],
]
for (const [n, size, url, act] of shots) {
  for (const mode of ['before', 'after']) {
    const p = await b.newPage({ viewport: size })
    await p.goto(`http://127.0.0.1:4176${url}`)
    await p.waitForTimeout(1500)
    if (act) await act(p)
    if (mode === 'after') await paperize(p)
    await p.waitForTimeout(300)
    await p.screenshot({ path: `${SP}/canvas54/${n}-${mode}.png` }); await p.close()
  }
}
await b.close()
