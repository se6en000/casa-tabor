import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionCenter = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const evidence = readFileSync(new URL('../src/components/shared/AttentionTopicEvidence.tsx', import.meta.url), 'utf8')

test('grouped topic counts are touch controls that reveal every source item', () => {
  for (const source of [home, actionCenter]) {
    assert.match(source, /aria-label=\{`Show \$\{topic\.items\.length\}/)
    assert.match(source, /<AttentionTopicEvidence[\s\S]{0,120}items=\{topic\.items\}/)
  }
  assert.match(evidence, /\.map\(\(evidence\)/)
  assert.match(evidence, /evidence\.description/)
  assert.match(evidence, /formatDistanceToNow\(new Date\(evidence\.created_at\)/)
})
