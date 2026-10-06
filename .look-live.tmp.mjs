import { chromium } from '@playwright/test'
const SP = process.argv[2]
const b = await chromium.launch()
const errors = []
for (const [name, size, path] of [['live-phone-wall', { width: 390, height: 844 }, '/recipes'], ['live-phone-recipe', { width: 390, height: 844 }, '/recipes/8cfa3cd2-a68f-4b73-912f-92865ba1ee6a'], ['live-tablet-wall', { width: 1180, height: 820 }, '/recipes']]) {
  const p = await b.newPage({ viewport: size })
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await p.goto(`https://casa-tabor.vercel.app${path}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${SP}/rv/${name}.png` })
  await p.close()
}
console.log(errors.join('\n') || 'no page errors')
await b.close()
