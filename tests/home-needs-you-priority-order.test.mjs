import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')

test('Needs you cards sort by urgency before lower-priority future items', () => {
  assert.match(source, /function urgencyRank\(days: number\)/)
  assert.match(source, /if \(days <= 0\) return 0/)
  assert.match(source, /if \(days <= 1\) return 1/)
  assert.match(source, /if \(days <= 4\) return 2/)
  assert.match(source, /const prioritizedTopics = useMemo\(/)
  assert.match(source, /if \(aUrgency !== bUrgency\) return aUrgency - bUrgency/)
  // Rendered topics preserve the same urgency order after topic-wide pending removals.
  assert.match(source, /const visibleAttentionTopics = useMemo\(\s*\(\) => prioritizedTopics\.filter/)
  assert.match(source, /visibleAttentionTopics\.slice\(0, NEEDS_YOU_HOME_RAIL_LIMIT\)\.map/)
})
