// Draws the home-screen icons (apple-touch-icon 180, icon-192, icon-512) from the Tabor House mark: `node scripts/make-app-icon.mjs`.
import { chromium } from 'playwright'
const STONE='#D6CCBC', INK='#26221D', BRASS='#A88450'
// The home-screen icon without the ring (Jake, Oct 5: "take out the circle and make the T, the rule and HOUSE a little
// bigger … a little too small with the circle on as an iPhone icon"): the 38l mark ×1.45 on stone.
const mark = `<rect width="1024" height="1024" fill="${STONE}"/>
<text x="512" y="582" text-anchor="middle" font-family="Cormorant Garamond" font-weight="500" font-size="478" fill="${INK}">T</text>
<line x1="425" y1="644" x2="599" y2="644" stroke="${BRASS}" stroke-width="7"/>
<text x="524" y="756" text-anchor="middle" font-family="DM Sans" font-weight="600" font-size="67" letter-spacing="23" fill="${BRASS}">HOUSE</text>`
const fonts = '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=DM+Sans:wght@600&display=swap" rel="stylesheet">'
const b = await chromium.launch()
const dest = process.argv[2] || new URL('../public/icons/', import.meta.url).pathname
for (const [f, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const p = await b.newPage({ viewport: { width: s, height: s } })
  await p.setContent(`<!doctype html><html><head>${fonts}<style>html,body{margin:0}</style></head><body><svg viewBox="0 0 1024 1024" width="${s}" height="${s}" style="display:block">${mark}</svg></body></html>`)
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300)
  await p.screenshot({ path: dest + f }); await p.close()
}
await b.close(); console.log('ok')
