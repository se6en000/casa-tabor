import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
)

test('Vercel serves the SPA shell for direct React Router requests', () => {
  assert.deepEqual(config.rewrites, [
    {
      source: '/(.*)',
      destination: '/index.html',
    },
  ])
})
