import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')

test('Needs you cards sort by urgency before lower-priority future items', () => {
  assert.match(source, /function urgencyRank\(days: number\)/)
  assert.match(source, /if \(days <= 0\) return 0/)
  assert.match(source, /if \(days <= 1\) return 1/)
  assert.match(source, /if \(days <= 4\) return 2/)
  assert.match(source, /const prioritizedPrepItems = useMemo\(/)
  assert.match(source, /if \(aUrgency !== bUrgency\) return aUrgency - bUrgency/)
  // Rendered list is `visiblePrepItems` (prioritizedPrepItems minus items in their post-tap
  // "mark done" undo window), sourced directly from the same urgency-sorted array.
  assert.match(source, /const visiblePrepItems = useMemo\(\s*\(\) => prioritizedPrepItems\.filter/)
  assert.match(source, /visiblePrepItems\.slice\(0, 4\)\.map/)
})
