import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Jake, Oct 3: "it looks like its listening … and its not actually listening". While Casa thinks the mic is held
// (nothing heard counts); a hold must never outlive its session — a fresh start hears again, and so does an answer.
const src = readFileSync(new URL('../src/hooks/useSpeechInput.ts', import.meta.url), 'utf8')

test('a fresh start clears a hold left from Casa thinking', () => {
  const start = src.indexOf('const start = useCallback(async () => {')
  const body = src.slice(start, start + 400)
  assert.match(body, /suppressRef\.current = false/)
})

test('hold pauses the quiet clock and drops what is heard; rearm hears again and starts a fresh window', () => {
  const hold = src.slice(src.indexOf('const hold = useCallback('), src.indexOf('const rearm = useCallback('))
  assert.match(hold, /suppressRef\.current = true/)
  assert.match(hold, /stopWakeSilenceTimer\(\)/)
  const rearm = src.slice(src.indexOf('const rearm = useCallback('), src.indexOf('const rearm = useCallback(') + 500)
  assert.match(rearm, /suppressRef\.current = false/)
  assert.match(rearm, /scheduleWakeSilenceTimeout\(\)/)
  assert.match(src, /if \(suppressRef\.current\) return/) // what's heard while held doesn't count
})
