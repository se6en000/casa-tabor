import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentShadowTelemetry,
  buildAgentShadowRequest,
  isAgentPlanAllowedByRequest,
  parseAgentShadowResponse,
  shouldRetryAgentShadowPlan,
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
  assert.match(instruction, /keep relationship or contact phrases in the title/)
  assert.match(instruction, /Never turn Mom, Dad, Grandma/)
  assert.match(instruction, /COMPLETED TOOL CALLS/)
  assert.match(instruction, /count 0 means the proposed time is clear/)
  assert.ok(request.tools[0].function_declarations.some((tool) => tool.name === 'calendar_create'))
  assert.equal(request.tool_config.function_calling_config.mode, 'AUTO')
  assert.equal(request.generation_config.thinking_config.thinking_budget, 0)
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

  test('pending actions expose reads and only the same mutation capability', () => {
    const request = buildAgentShadowRequest({
      messages: [{ role: 'user', content: 'Actually, Saturday morning instead.' }],
      context: {
        pendingAction: {
          actionId: 'pending-create-1',
          toolName: 'calendar.create',
          args: {
            title: 'Swim practice',
            start: '2026-07-17T16:00:00-04:00',
            end: '2026-07-17T17:00:00-04:00',
          },
        },
      },
    })
    const names = request.tools[0].function_declarations.map((tool) => tool.name)
    assert.ok(names.includes('calendar_create'))
    assert.ok(names.includes('calendar_check_conflicts'))
    assert.ok(!names.includes('calendar_update'))
    assert.ok(!names.includes('grocery_add_items'))
  })

  test('plans cannot invoke capabilities omitted from the current request', () => {
    const request = buildAgentShadowRequest({
      messages: [{ role: 'user', content: 'Schedule swim practice Friday at 4 PM.' }],
      context: {
        completedToolCalls: [{
          toolName: 'calendar.check_conflicts',
          result: { conflicts: [], count: 0 },
        }],
      },
    })
    assert.equal(isAgentPlanAllowedByRequest({
      kind: 'tool',
      toolName: 'calendar.check_conflicts',
      args: {},
    }, request), false)
    assert.equal(isAgentPlanAllowedByRequest({
      kind: 'tool',
      toolName: 'calendar.create',
      args: {},
    }, request), true)

    const writeRequest = buildAgentShadowRequest({
      messages: [{ role: 'user', content: 'Check off milk.' }],
      plannerMode: 'additive_write',
    })
    assert.equal(isAgentPlanAllowedByRequest({
      kind: 'tool',
      toolName: 'grocery.update_item',
      args: {},
    }, writeRequest), true)
    assert.equal(isAgentPlanAllowedByRequest({
      kind: 'tool',
      toolName: 'grocery.remove_item',
      args: {},
    }, writeRequest), true)
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

test('forced structured planning retries only unusable provider output', () => {
  const forcedRequest = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Add milk.' }],
    plannerMode: 'additive_write',
  })
  assert.equal(shouldRetryAgentShadowPlan({
    kind: 'error',
    code: 'missing_candidate',
    finishReason: 'STOP',
  }, forcedRequest), true)
  assert.equal(shouldRetryAgentShadowPlan({
    kind: 'error',
    code: 'missing_candidate',
    finishReason: 'SAFETY',
  }, forcedRequest), false)
  assert.equal(shouldRetryAgentShadowPlan({
    kind: 'clarify',
    text: 'Which milk?',
  }, forcedRequest), false)

  const autoRequest = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Add milk.' }],
  })
  assert.equal(shouldRetryAgentShadowPlan({
    kind: 'error',
    code: 'empty_response',
    finishReason: 'STOP',
  }, autoRequest), false)
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
              user_goal: 'Understand the whole Thursday schedule.',
              helpful_entity_ids: ['late-event'],
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
    responsePlan: {
      userGoal: 'Understand the whole Thursday schedule.',
      helpfulEntityIds: ['late-event'],
    },
  })
  assert.match(request.system_instruction.parts[0].text, /human's likely goal/)
  assert.ok(declarations[0].parameters.properties.helpful_entity_ids)

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_write_request',
            args: {
              requested_effect: 'exact_update',
              tool_name: 'grocery.update_item',
              tool_args: {
                id: 'milk-1',
                expected_updated_at: 'v1',
                checked: true,
              },
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'grocery.update_item',
    args: {
      id: 'milk-1',
      expected_updated_at: 'v1',
      checked: true,
    },
  })
})

test('write proposal planning exposes confirmed destructive tools without direct execution', () => {
  const request = buildAgentShadowRequest({
    messages: [{ role: 'user', content: 'Move the dentist appointment to Friday' }],
    plannerMode: 'additive_write',
  })
  const declarations = request.tools[0].function_declarations
  assert.equal(request.tool_config.function_calling_config.mode, 'ANY')
  assert.deepEqual(declarations.map((declaration) => declaration.name), [
    'calendar_update',
    'calendar_delete',
    'grocery_update_item',
    'grocery_remove_item',
    'assistant_add_request',
    'assistant_write_defer',
  ])
  assert.match(
    request.system_instruction.parts[0].text,
    /ACTIVE ENTITY grocery_item is an exact authoritative target/,
  )
  assert.match(request.system_instruction.parts[0].text, /always require explicit confirmation/)
  assert.ok(declarations.at(-1).parameters.properties.candidate_entity_ids)

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_write_defer',
            args: {
              reason: 'ambiguous',
              candidate_entity_ids: ['event-1', 'event-2'],
            },
          },
        }],
      },
    }],
  }), {
    kind: 'defer',
    reason: 'ambiguous',
    candidateEntityIds: ['event-1', 'event-2'],
  })

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'calendar_delete',
            args: {
              id: 'event-1',
              expected_updated_at: '2026-07-14T16:00:00Z',
              title: 'Birthday dinner',
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'calendar.delete',
    args: {
      id: 'event-1',
      expected_updated_at: '2026-07-14T16:00:00Z',
      title: 'Birthday dinner',
    },
  })

  assert.deepEqual(parseAgentShadowResponse({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'assistant_add_request',
            args: {
              tool_name: 'grocery.add_items',
              tool_args: { items: [{ name: 'bread' }] },
            },
          },
        }],
      },
    }],
  }), {
    kind: 'tool',
    toolName: 'grocery.add_items',
    args: { items: [{ name: 'bread' }] },
  })

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
      policyErrors: ['args.quantity:expected_string'],
      elapsedMs: 321,
      userTextHash: 'abc123',
    },
  )
  const serialized = JSON.stringify(telemetry)
  assert.doesNotMatch(serialized, /Private title/)
  assert.ok(!('args' in telemetry))
  assert.deepEqual(telemetry.policy_errors, ['args.quantity:expected_string'])
  assert.equal(telemetry.user_text_hash, 'abc123')
  assert.equal(telemetry.plan_code, null)
  assert.equal(telemetry.finish_reason, null)
})
