import test from 'node:test'
import assert from 'node:assert/strict'
import { pageAsked } from '../src/wall/pageAsk.ts'

// Jake, Oct 3: "alexa should be able to open/show the grocery list page".
test('asking to see the grocery list opens it; a question about it goes to Casa', () => {
  for (const s of ['Show me the grocery list', 'open groceries', 'Alexa, show the shopping list', 'pull up the grocery list please', 'Can you show me the groceries?', 'go to the grocery page', 'Let me see the grocery list.']) assert.equal(pageAsked(s), 'grocery', s)
  for (const s of ["What's on the grocery list?", 'do we need milk', 'add eggs to the grocery list', 'show me Saturday', 'open the calendar']) assert.equal(pageAsked(s), null, s)
})
