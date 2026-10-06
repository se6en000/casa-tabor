import { chromium } from '@playwright/test'
const SP = process.argv[2]
const b = await chromium.launch({ args: ['--disable-font-subpixel-positioning', '--font-render-hinting=none'] })
const sizes = { phone: { width: 390, height: 844 }, tablet: { width: 1180, height: 820 }, wall: { width: 1920, height: 1080 } }
const errors = []
async function shot(size, at, name, extra = '', act) {
  const p = await b.newPage({ viewport: sizes[size] })
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  await p.goto(`http://127.0.0.1:4176/__recipes-fixture?at=${encodeURIComponent(at)}${size === 'wall' ? '&wall=1' : ''}${extra}`)
  await p.getByTestId('recipes-fixture').waitFor()
  await p.waitForTimeout(700)
  if (act) await act(p)
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${SP}/rv/${size}-${name}.png`, fullPage: size === 'phone' })
  await p.close()
}
for (const size of ['phone', 'tablet', 'wall']) {
  await shot(size, '/recipes', 'wall', '&cooking=phone')
  await shot(size, '/recipes/scampi', 'recipe')
  await shot(size, '/recipes/scampi/cook', 'cook', '&cooking=phone')
  await shot(size, '/recipes/new', 'add')
  await shot(size, '/recipes/scampi/edit', 'edit')
}
await shot('phone', '/recipes/scampi', 'groceries', '', (p) => p.getByRole('button', { name: 'Groceries' }).click())
await shot('phone', '/recipes/scampi', 'photo', '', (p) => p.getByRole('button', { name: 'Change photo' }).click())
await shot('phone', '/recipes/scampi/cook', 'steps', '&cooking=phone', (p) => p.getByRole('button', { name: 'All steps' }).click())
await shot('phone', '/recipes/new', 'check', '', async (p) => { await p.getByRole('button', { name: /Paste a link/ }).click(); await p.getByRole('textbox', { name: 'The recipe’s link' }).fill('https://example.com/pancakes'); await p.getByRole('button', { name: 'Read it' }).click(); await p.waitForTimeout(800) })
console.log(errors.join('\n') || 'no errors')
await b.close()
