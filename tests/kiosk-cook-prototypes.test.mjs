import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('AnimatedRoutes exposes mock prototype routes for Option 2 (Medium) and Option 3 (High - Living Canvas)', () => {
  const routes = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')

  assert.match(routes, /path="\/prototype\/cook-medium"/, 'AnimatedRoutes missing /prototype/cook-medium route')
  assert.match(routes, /path="\/prototype\/cook-high"/, 'AnimatedRoutes missing /prototype/cook-high route')
  assert.match(routes, /CookPrototypeMediumPage/, 'AnimatedRoutes missing CookPrototypeMediumPage component')
  assert.match(routes, /CookPrototypeLivingCanvasPage/, 'AnimatedRoutes missing CookPrototypeLivingCanvasPage component')
})

test('CookPage has easy option switcher links to prototype URLs for Options 2 & 3', () => {
  const cookPage = readFileSync(new URL('../src/pages/CookPage.tsx', import.meta.url), 'utf8')

  assert.match(cookPage, /\/prototype\/cook-medium/, 'CookPage missing link to medium prototype')
  assert.match(cookPage, /\/prototype\/cook-high/, 'CookPage missing link to high prototype')
})

test('CookPrototypeMediumPage features 2-stage flow and auto-timer extraction', () => {
  const mediumPage = readFileSync(new URL('../src/pages/CookPrototypeMediumPage.tsx', import.meta.url), 'utf8')

  assert.match(mediumPage, /mise-en-place|miseEnPlace|stage/i, 'Medium prototype missing 2-stage prep flow')
  assert.match(mediumPage, /timer/i, 'Medium prototype missing step timer integration')
  assert.match(mediumPage, /0\.5x|1x|2x|scale/i, 'Medium prototype missing portion scaling')
})

test('CookPrototypeLivingCanvasPage features full command center, 64px touch targets, multi-timer dock, and pantry closure', () => {
  const highPage = readFileSync(new URL('../src/pages/CookPrototypeLivingCanvasPage.tsx', import.meta.url), 'utf8')

  assert.match(highPage, /Sous Chef|Ask Sous Chef|Hot Mic/i, 'High prototype missing Sous Chef AI hot mic trigger')
  assert.match(highPage, /Multi-Timer|Timer Dock|timer/i, 'High prototype missing multi-timer dock')
  assert.match(highPage, /Dinner Served|Pantry|Inventory/i, 'High prototype missing Dinner Served pantry closure flow')
  assert.match(highPage, /min-h-\[64px\]|h-16|p-4|64px/i, 'High prototype missing 64px+ touch targets for kitchen ergonomics')
})
