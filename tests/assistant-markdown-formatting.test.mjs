import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTextForMarkdown } from '../src/lib/assistantMarkdown.mjs'

test('legacy calendar agenda rows become a Markdown list', () => {
  const content = [
    '3 things are on your calendar Thursday:',
    '7:00 AM — School drop-off',
    '10:30 AM — Dentist at Lake Worth',
    'All day — Dad and girls to Maine',
  ].join('\n')

  assert.equal(formatTextForMarkdown(content), [
    '3 things are on your calendar Thursday:',
    '- 7:00 AM — School drop-off',
    '- 10:30 AM — Dentist at Lake Worth',
    '- All day — Dad and girls to Maine',
  ].join('\n'))
})

test('one incidental time row remains ordinary prose', () => {
  const content = 'Up next:\n7:00 AM — School drop-off'
  assert.equal(formatTextForMarkdown(content), content)
})

test('existing Markdown remains unchanged', () => {
  const content = 'Shopping list:\n- Milk\n- Bread'
  assert.equal(formatTextForMarkdown(content), content)
})

test('long plain responses are grouped into short readable paragraphs', () => {
  const content = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.'
  assert.equal(
    formatTextForMarkdown(content),
    'First sentence. Second sentence.\n\nThird sentence. Fourth sentence.\n\nFifth sentence.',
  )
})

test('inline Markdown does not exempt long prose from formatting', () => {
  const content = '**Here is the answer.** The second sentence adds context. The third sentence explains the next step.'
  assert.equal(
    formatTextForMarkdown(content),
    '**Here is the answer.** The second sentence adds context.\n\nThe third sentence explains the next step.',
  )
})

test('long two-sentence prose uses one sentence per paragraph', () => {
  const first = `The first explanation is intentionally long ${'because it includes useful context '.repeat(4).trim()}.`
  const second = `The second explanation is also detailed ${'so the user can scan it comfortably '.repeat(4).trim()}.`
  assert.equal(formatTextForMarkdown(`${first} ${second}`), `${first}\n\n${second}`)
})

test('intentional Markdown blocks remain unchanged', () => {
  const content = '## Dinner ideas\n\n- Tacos\n- Pasta\n- Stir-fry'
  assert.equal(formatTextForMarkdown(content), content)
})

test('bullet lists with unicode bullets remain intact', () => {
  const content = 'Tomorrow, Sunday, August 16, 2026, there are three items on the calendar:\n\n• [Alice sleep over](casa://event/b426b652-001f-4d48-bace-84b50284ae58) is an all-day event\n• [Call in my ADD prescription](casa://event/ff4d6a37-408b-47a9-a9e7-5d88a259dfcc) is a reminder'
  assert.equal(formatTextForMarkdown(content), content)
})
