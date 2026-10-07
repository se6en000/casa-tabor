import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Every wall colour has an evening value (Oct 6: the new paper tile colour had none, so on the dark evening face the
// week tiles turned cream with their light text unreadable). A colour that is meant to stay the same at night is
// listed here with why.
const SAME_AT_NIGHT = {
  'wall-ground-calm': 'the day calm face only; the night calm face draws on the evening ground',
  'wall-rail': 'the left panel (canvas 56A) carries .wall-evening itself, so it can’t be remapped; at night it draws on wall-night-rail',
  'wall-band': 'the assistant band is dark by day too; over the night face it raises itself (.wall-band-over-night)',
}

test('every wall colour is remapped on the evening face, or listed as the same at night', () => {
  const tokens = readFileSync(new URL('../src/design-system/tokens.mjs', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const evening = css.slice(css.indexOf('.wall-evening {'), css.indexOf('}', css.indexOf('.wall-evening {')))
  const dayColours = [...new Set([...tokens.matchAll(/'(wall-[a-z0-9-]+)': '#/g)].map((m) => m[1]).filter((n) => !n.startsWith('wall-night')))]
  assert.ok(dayColours.includes('wall-paper'))
  const missing = dayColours.filter((n) => !evening.includes(`--color-${n}:`) && !SAME_AT_NIGHT[n])
  assert.deepEqual(missing, [], `no evening value for: ${missing.join(', ')}`)
})
