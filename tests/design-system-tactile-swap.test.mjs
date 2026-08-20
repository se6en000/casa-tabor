import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('TactileSwap: defines canonical spring physics and keyframe animations', async () => {
  const source = await readFile(resolve('src/components/ui/TactileSwap.tsx'), 'utf8')
  assert.match(source, /export const TACTILE_SPRING_TRANSITION(?::\s*\w+)?\s*=\s*\{/)
  assert.match(source, /type:\s*'spring'/)
  assert.match(source, /stiffness:\s*350/)
  assert.match(source, /damping:\s*26/)

  assert.match(source, /export const TACTILE_SWAP_SCALE_ANIMATION(?::\s*\w+)?\s*=\s*\{/)
  assert.match(source, /scale:\s*\[1,\s*1\.015,\s*0\.995,\s*1\]/)
  assert.match(source, /duration:\s*0\.65/)

  assert.match(source, /export function TactileSheenBeam/)
  assert.match(source, /export function TactileSwapBadge/)
  assert.match(source, /export function useTactileSwapState/)
  assert.match(source, /export function getTactileCardClasses/)
})

test('Design System index: exports public Tactile components', async () => {
  const uiIndex = await readFile(resolve('src/components/ui/index.ts'), 'utf8')
  assert.match(uiIndex, /TactileSheenBeam/)
  assert.match(uiIndex, /TactileSwapBadge/)
})

test('CookPage & Weekly Horizon: consume TactileSwap primitives', async () => {
  const cookPage = await readFile(resolve('src/pages/CookPage.tsx'), 'utf8')
  assert.match(cookPage, /<TactileSheenBeam\s*\/>/)
  assert.match(cookPage, /<TactileSwapBadge/)
  assert.match(cookPage, /TACTILE_SPRING_TRANSITION/)
  assert.match(cookPage, /TACTILE_SWAP_SCALE_ANIMATION/)
})

test('Grocery List: consumes TactileSwap primitives for cross-category reordering', async () => {
  const groceryPage = await readFile(resolve('src/pages/GroceryPage.tsx'), 'utf8')
  const groceryRow = await readFile(resolve('src/components/grocery/GroceryItemRow.tsx'), 'utf8')
  const groceryGrid = await readFile(resolve('src/components/grocery/GroceryAisleGrid.tsx'), 'utf8')

  assert.match(groceryPage, /useTactileSwapState/)
  assert.match(groceryGrid, /isItemJustMoved/)
  assert.match(groceryRow, /<TactileSheenBeam\s*\/>/)
  assert.match(groceryRow, /<TactileSwapBadge\s+type="move"\s*\/>/)
  assert.match(groceryRow, /TACTILE_SPRING_TRANSITION/)
  assert.match(groceryRow, /TACTILE_SWAP_SCALE_ANIMATION/)
})
