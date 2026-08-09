import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const hook = readFileSync(new URL('../src/hooks/useAttentionTopicLearning.ts', import.meta.url), 'utf8')
const evidence = readFileSync(new URL('../src/components/shared/AttentionTopicEvidence.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260809210000_attention_topic_learning.sql', import.meta.url), 'utf8')

test('topic learning persists merge and separation rules', () => {
  assert.match(hook, /attention_topic_rules/)
  assert.match(hook, /attentionLearningSignature/)
  assert.match(hook, /learnTopic/)
  assert.match(hook, /separateItem/)
  assert.match(hook, /queryKey: \['attention-topic-rules'\]/)
})

test('grouped evidence exposes explicit learning controls', () => {
  assert.match(evidence, /Keep grouped/)
  assert.match(evidence, /Not related/)
  assert.match(evidence, /onKeepGrouped/)
  assert.match(evidence, /onSeparate/)
})

test('topic learning migration stores durable unique signatures', () => {
  assert.match(migration, /create table if not exists public\.attention_topic_rules/)
  assert.match(migration, /signature text primary key/)
  assert.match(migration, /topic_key text not null/)
})
