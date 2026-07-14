import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_TOOL_DEFINITIONS,
  getAgentTool,
  getAgentToolByLegacyName,
  legacyToolNameFor,
  toGeminiFunctionDeclaration,
} from '../supabase/functions/_shared/assistant-agent-tools.mjs'

test('agent tools use unique capability names and strict object schemas', () => {
  const names = AGENT_TOOL_DEFINITIONS.map((definition) => definition.name)
  assert.equal(new Set(names).size, names.length)
  for (const definition of AGENT_TOOL_DEFINITIONS) {
    assert.match(definition.name, /^(calendar|grocery|recipe)\.[a-z_]+$/)
    assert.equal(definition.inputSchema.type, 'object')
    assert.equal(definition.inputSchema.additionalProperties, false)
    for (const required of definition.inputSchema.required) {
      assert.ok(definition.inputSchema.properties[required], `${definition.name}.${required}`)
    }
  }
})

test('write and destructive tools always identify exact capability effects', () => {
  assert.equal(getAgentTool('calendar.search').effect, 'read')
  assert.equal(getAgentTool('calendar.create').effect, 'write')
  assert.equal(getAgentTool('calendar.delete').effect, 'destructive')
  assert.equal(getAgentTool('grocery.remove_item').effect, 'destructive')
})

test('legacy adapters support incremental migration without changing action names', () => {
  assert.equal(legacyToolNameFor('calendar.create'), 'create_event')
  assert.equal(legacyToolNameFor('calendar.update'), 'update_event')
  assert.equal(legacyToolNameFor('grocery.add_items'), 'add_grocery_items')
  assert.equal(getAgentToolByLegacyName('remove_grocery_item').name, 'grocery.remove_item')
  assert.equal(legacyToolNameFor('calendar.get_range'), null)
})

test('Gemini declarations are generated from provider-neutral schemas', () => {
  const declaration = toGeminiFunctionDeclaration(getAgentTool('calendar.create'))
  assert.equal(declaration.name, 'calendar_create')
  assert.equal(declaration.parameters.type, 'OBJECT')
  assert.equal(declaration.parameters.properties.members.type, 'ARRAY')
  assert.equal(declaration.parameters.properties.members.items.type, 'STRING')
  assert.deepEqual(declaration.parameters.required, ['title', 'start', 'end'])
  assert.ok(!('additionalProperties' in declaration.parameters))
})

test('mutation capabilities require authoritative identifiers and versions where available', () => {
  assert.deepEqual(getAgentTool('calendar.update').inputSchema.required, ['id', 'expected_updated_at'])
  assert.deepEqual(getAgentTool('calendar.delete').inputSchema.required, ['id', 'expected_updated_at', 'title'])
  assert.deepEqual(getAgentTool('grocery.update_item').inputSchema.required, ['id', 'expected_updated_at'])
  assert.deepEqual(getAgentTool('grocery.remove_item').inputSchema.required, ['id', 'name'])
})
