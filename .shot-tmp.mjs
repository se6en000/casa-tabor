import { chromium } from '@playwright/test'
const [,, url, out, wake] = process.argv
const b = await chromium.launch({ args: ['--font-render-hinting=none'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, timezoneId: 'America/New_York', locale: 'en-US' })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:4176' + url)
await p.getByTestId('wall-fixture').waitFor(); await p.waitForTimeout(2000)
if (wake) { await p.mouse.click(400, 600); await p.waitForTimeout(1500) }
await p.screenshot({ path: out })
await b.close()
