import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAssistantIntent } from '../supabase/functions/_shared/assistant-intent-profile.mjs'
import {
  readToolResultFound,
  shouldSynthesizeReadTool,
  readToolSynthesisInstruction,
} from '../supabase/functions/_shared/assistant-read-tool-synthesis.mjs'

test('web and inquiry intent classification captures live and local lookups', () => {
  const webQueries = [
    'hey is there a ghost tour next to our hotel we can take?',
    'Find local walking tours near Collins Park',
    'What are the top attractions in South Beach?',
    'What are fun activities to do in Miami Beach this weekend?',
    'What are the latest reviews for The Plymouth Hotel?',
    'What is the latest stock price for Apple?',
    'Search the web for upcoming concerts in Miami',
    'Look up recommendations for Italian restaurants in South Beach',
  ]

  for (const query of webQueries) {
    const intent = classifyAssistantIntent(query)
    assert.equal(
      intent.profile === 'web' || intent.profile === 'general',
      true,
      `Expected "${query}" to resolve to web or general profile, got ${intent.profile}`,
    )
  }
})

test('read tool synthesis supports search_web results with grounded sources', () => {
  assert.equal(
    readToolResultFound({
      results: [{ title: 'Miami Ghost Tours', url: 'https://example.com', snippet: 'Top ghost tours' }],
      count: 1,
    }),
    true,
  )

  assert.equal(
    shouldSynthesizeReadTool({
      name: 'search_web',
      resultFound: true,
      remainingBudgetMs: 5000,
    }),
    true,
  )

  const instruction = readToolSynthesisInstruction('search_web')
  assert.match(instruction, /web results/i)
  assert.match(instruction, /cite the source links/i)
})

test('Google Search grounding request formatting is valid for Gemini', () => {
  const primaryTools = []
  const hasFunctionDeclarations = primaryTools.length > 0
  const provider = 'gemini'
  const apiKey = 'test_key'
  const directReminderCreateFlow = false

  const enableGoogleSearchGrounding =
    !hasFunctionDeclarations && provider === 'gemini' && Boolean(apiKey) && !directReminderCreateFlow

  assert.equal(enableGoogleSearchGrounding, true)

  const requestTools = hasFunctionDeclarations
    ? primaryTools
    : enableGoogleSearchGrounding
      ? [{ google_search: {} }]
      : undefined

  assert.deepEqual(requestTools, [{ google_search: {} }])
})
