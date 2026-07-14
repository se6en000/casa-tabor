import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentShadowTelemetry,
  buildAgentShadowRequest,
  parseAgentShadowResponse,
} from '../supabase/functions/_shared/assistant-agent-shadow.mjs'

test('shadow planner request exposes capability tools without phrase routing', () => {
  const request = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Actually, Saturday morning instead.' }],
    context: {
      currentDate: 'Tuesday, July 14, 2026 at 7:00 AM',
      utcOffset: '-04:00',
      page: 'calendar',
      pendingAction: {
        toolName: 'calendar.create',
        args: { title: 'Swim practice', start: 'Friday at 4 PM' },
      },
    },
  })
  const instruction = request.system_instruction.parts[0].text
  assert.match(instruction, /understand any natural wording/)
  assert.match(instruction, /PENDING ACTION/)
  assert.match(instruction, /MUST call the same pending capability/)
  assert.match(instruction, /COMPLETED TOOL CALLS/)
  assert.match(instruction, /count 0 means the proposed time is clear/)
  assert.ok(request.tools[0].function_declarations.some((tool) => tool.name === 'calendar_create'))
  assert.equal(request.tool_config.function_calling_config.mode, 'AUTO')
})

test('completed clear conflict checks cannot loop', () => {
  const request = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Schedule swim practice Friday at 4 PM.' }],
    context: {
      completedToolCalls: [{
        toolName: 'calendar.check_conflicts',
        args: {
          start: '2026-07-17T16:00:00-04:00',
          end: '2026-07-17T17:00:00-04:00',
        },
        result: { conflicts: [], count: 0 },
      }],
    },
  })
  const names = request.tools[0].function_declarations.map((tool) => tool.name)
  assert.ok(!names.includes('calendar_check_conflicts'))
  assert.ok(names.includes('calendar_create'))
})

test('shadow response parser maps provider function names to capability names', () => {
  const result = parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'calendar_create',
            args: {
              title: 'Swim practice',
              start: '2026-07-18T10:00:00-04:00',
              end: '2026-07-18T11:00:00-04:00',
            },
          },
        }],
      },
    }],
  })
  assert.equal(result.kind, 'tool')
  assert.equal(result.toolName, 'calendar.create')
})

test('shadow response parser preserves clarification without treating it as execution', () => {
  const result = parseAgentShadowResponse({
    candidates: [{ content: { parts: [{ text: 'Which dentist appointment do you mean?' }] } }],
  })
  assert.deepEqual(result, {
    kind: 'clarify',
    text: 'Which dentist appointment do you mean?',
  })
})

test('authoritative read planning exposes only reads and typed deferral', () => {
  const request = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Delete every event Thursday' }],
    plannerMode: 'authoritative_read',
  })

  const declarations = request.tools[0].function_declarations
  assert.equal(request.tool_config.function_calling_config.mode, 'ANY')
  assert.deepEqual(declarations.map((declaration) => declaration.name), ['assistant_read_request'])

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_read_request',
            args: { requested_effect: 'mutation' },
          },
        }],
      },
    }],
  }), { kind: 'defer', reason: 'mutation' })

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_read_request',
            args: {
              requested_effect: 'read',
              tool_name: 'calendar.get_range',
              tool_args: {
                start: '2026-07-16T00:00:00-04:00',
                end: '2026-07-17T00:00:00-04:00',
              },
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'calendar.get_range',
    args: {
      start: '2026-07-16T00:00:00-04:00',
      end: '2026-07-17T00:00:00-04:00',
    },
  })
})

test('write proposal planning exposes additive and exact updates but no destructive tools', () => {
  const request = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Move the dentist appointment to Friday' }],
    plannerMode: 'additive_write',
  })
  const declarations = request.tools[0].function_declarations
  assert.equal(request.tool_config.function_calling_config.mode, 'ANY')
  assert.deepEqual(declarations.map((declaration) => declaration.name), ['assistant_write_request'])

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_write_request',
            args: { requested_effect: 'other_write' },
          },
        }],
      },
    }],
  }), { kind: 'defer', reason: 'unsupported_write' })

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_write_request',
            args: {
              requested_effect: 'additive_write',
              tool_name: 'calendar.create',
              tool_args: {
                title: 'Swim practice',
                start: '2026-07-17T16:00:00-04:00',
                end: '2026-07-17T17:00:00-04:00',
              },
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'calendar.create',
    args: {
      title: 'Swim practice',
      start: '2026-07-17T16:00:00-04:00',
      end: '2026-07-17T17:00:00-04:00',
    },
  })

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_write_request',
            args: {
              requested_effect: 'exact_update',
              tool_name: 'calendar.update',
              tool_args: {
                id: 'event-1',
                expected_updated_at: 'v1',
                start: '2026-07-17T14:00:00-04:00',
                end: '2026-07-17T15:00:00-04:00',
              },
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'calendar.update',
    args: {
      id: 'event-1',
      expected_updated_at: 'v1',
      start: '2026-07-17T14:00:00-04:00',
      end: '2026-07-17T15:00:00-04:00',
    },
  })
})

test('shadow telemetry contains no raw conversation text or tool arguments', () => {
  const telemetry = agentShadowTelemetry(
    { kind: 'tool', toolName: 'calendar.create', args: { title: 'Private title' } },
    {
      model: 'gemini-2.5-flash-lite',
      toolEffect: 'write',
      policyDecision: 'execute',
      policyCode: 'policy_approved',
      elapsedMs: 321,
      userTextHash: 'abc123',
    },
  )
  const serialized = JSON.stringify(telemetry)
  assert.doesNotMatch(serialized, /Private title/)
  assert.ok(!('args' in telemetry))
  assert.equal(telemetry.user_text_hash, 'abc123')
})
