import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Wall and phone guards draw with Google Fonts. Fetched live, a slow download held the
// fixture blank past its 20 s wait (ship failures that never happened alone, 2026-09-26) and
// once let a reference image catch the fallback face. So the tests are served a committed
// copy: the first run fetches and saves each font request here; every run after is offline.
const CACHE = join(dirname(fileURLToPath(import.meta.url)), 'font-cache')
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//

export function serveFontsFromCache(test) {
  test.beforeEach(async ({ page }) => {
    await page.route(FONT_HOSTS, async (route) => {
      const url = route.request().url()
      const key = createHash('sha1').update(url).digest('hex').slice(0, 16)
      const body = join(CACHE, `${key}.bin`)
      const meta = join(CACHE, `${key}.json`)
      if (existsSync(body) && existsSync(meta)) {
        const { contentType } = JSON.parse(readFileSync(meta, 'utf8'))
        return route.fulfill({ status: 200, contentType, body: readFileSync(body), headers: { 'access-control-allow-origin': '*' } })
      }
      const response = await route.fetch()
      if (response.ok()) {
        mkdirSync(CACHE, { recursive: true })
        writeFileSync(body, await response.body())
        writeFileSync(meta, JSON.stringify({ url, contentType: response.headers()['content-type'] ?? 'application/octet-stream' }))
      }
      return route.fulfill({ response })
    })
  })
}
