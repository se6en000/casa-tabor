import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CALENDAR_SEMANTIC_TURN_VERSION,
  resolveCalendarSemanticTurn,
  shouldPreferActiveCalendarEntity,
} from '../supabase/functions/_shared/assistant-calendar-agent.mjs'

const context = {
  currentDate: '2026-07-14T16:45:00-04:00',
  utcOffset: '-04:00',
  authoritativeEntities: [],
}

function turn(action, patch, extra = {}) {
  return {
    version: CALENDAR_SEMANTIC_TURN_VERSION,
    action,
    patch,
    ...extra,
  }
}

test('semantic calendar create resolves local date, time, and explicit duration deterministically', () => {
  const result = resolveCalendarSemanticTurn(turn('create', {
    title: 'Dinner with Mom',
    date_reference: { kind: 'weekday', weekday: 'sunday' },
    time: { hour: 6, period: 'pm' },
    duration_minutes: 90,
  }), context)

  assert.equal(result.kind, 'tool')
  assert.equal(result.toolName, 'calendar.create')
  assert.deepEqual(result.args, {
    title: 'Dinner with Mom',
    start: '2026-07-19T18:00:00-04:00',
    end: '2026-07-19T19:30:00-04:00',
  })

  test('semantic calendar create resolves an inclusive all-day date range', () => {
    const result = resolveCalendarSemanticTurn(turn('create', {
      title: 'Family Staycation',
      date_reference: { kind: 'absolute', year: 2026, month: 8, day: 3 },
      end_date_reference: { kind: 'absolute', year: 2026, month: 8, day: 7 },
      all_day: true,
    }), context)

    assert.deepEqual(result, {
      kind: 'tool',
      toolName: 'calendar.create',
      args: {
        title: 'Family Staycation',
        start: '2026-08-03T00:00:00-04:00',
        end: '2026-08-08T00:00:00-04:00',
        all_day: true,
      },
    })
  })

  test('whole-range shift preserves a multi-day all-day event duration', () => {
    const event = {
      type: 'event',
      id: 'staycation',
      title: 'Family Staycation',
      version: 'v1',
      start: '2026-08-03T00:00:00-04:00',
      end: '2026-08-08T00:00:00-04:00',
      allDay: true,
    }
    const result = resolveCalendarSemanticTurn(turn('update', {
      shift_days: 7,
    }), {
      ...context,
      authoritativeEntities: [event],
      activeEntity: { type: 'event', id: event.id },
    })

    assert.deepEqual(result, {
      kind: 'tool',
      toolName: 'calendar.update',
      args: {
        id: event.id,
        expected_updated_at: event.version,
        start: '2026-08-10T00:00:00-04:00',
        end: '2026-08-15T00:00:00-04:00',
      },
    })
  })
})

test('pending create corrections preserve omitted duration and infer bare time from event context', () => {
  const result = resolveCalendarSemanticTurn(turn('revise', {
    date_reference: { kind: 'weekday', weekday: 'saturday' },
    time: { hour: 10, period: 'ambiguous' },
  }), {
    ...context,
    pendingAction: {
      toolName: 'calendar.create',
      args: {
        title: 'Dinner with Mom',
        start: '2026-07-19T18:00:00-04:00',
        end: '2026-07-19T19:30:00-04:00',
      },
    },
  })

  assert.equal(result.kind, 'tool')
  assert.equal(result.args.start, '2026-07-18T22:00:00-04:00')
  assert.equal(result.args.end, '2026-07-18T23:30:00-04:00')
})

test('pending member clarification revises the same create without changing its range', () => {
  const result = resolveCalendarSemanticTurn(turn('revise', {
    members_add: ['Kelly'],
  }), {
    ...context,
    pendingAction: {
      toolName: 'calendar.create',
      args: {
        title: 'Dinner with Mom',
        start: '2026-07-19T18:00:00-04:00',
        end: '2026-07-19T19:30:00-04:00',
      },
    },
  })

  assert.deepEqual(result.args.members, ['Kelly'])
  assert.equal(result.args.start, '2026-07-19T18:00:00-04:00')
  assert.equal(result.args.end, '2026-07-19T19:30:00-04:00')
})

test('active event updates use authoritative identity and preserve duration unless changed', () => {
  const event = {
    type: 'event',
    id: 'dinner-1',
    title: 'Dinner with Kelly',
    version: 'v1',
    start: '2026-07-19T18:00:00-04:00',
    end: '2026-07-19T19:00:00-04:00',
  }
  const result = resolveCalendarSemanticTurn(turn('update', {
    date_reference: { kind: 'weekday', weekday: 'saturday' },
    time: { hour: 11, period: 'pm' },
    duration_minutes: 120,
  }), {
    ...context,
    authoritativeEntities: [event],
    activeEntity: { type: 'event', id: event.id },
  })

  assert.deepEqual(result, {
    kind: 'tool',
    toolName: 'calendar.update',
    args: {
      id: 'dinner-1',
      expected_updated_at: 'v1',
      start: '2026-07-18T23:00:00-04:00',
      end: '2026-07-19T01:00:00-04:00',
    },
  })
})

test('conversation state converts provider revise into update after confirmation', () => {
    const event = {
      type: 'event',
      id: 'dinner-1',
      title: 'Dinner with Kelly',
      version: 'v1',
      start: '2026-07-19T18:00:00-04:00',
      end: '2026-07-19T19:00:00-04:00',
    }
    const result = resolveCalendarSemanticTurn(turn('revise', {
      date_reference: { kind: 'weekday', weekday: 'saturday' },
      time: { hour: 11, period: 'pm' },
      duration_minutes: 120,
    }), {
      ...context,
      authoritativeEntities: [event],
      activeEntity: { type: 'event', id: event.id },
    })

    assert.equal(result.kind, 'tool')
    assert.equal(result.toolName, 'calendar.update')
    assert.equal(result.args.id, event.id)
})

test('active conversation identity outranks a model-nominated duplicate for pronoun corrections', () => {
    const active = {
      type: 'event',
      id: 'new-dinner',
      title: 'Dinner with Kelly',
      version: 'new-v1',
      start: '2026-07-19T18:00:00-04:00',
      end: '2026-07-19T19:30:00-04:00',
    }
    const olderDuplicate = {
      ...active,
      id: 'old-dinner',
      version: 'old-v1',
    }
    const result = resolveCalendarSemanticTurn(turn('update', {
      date_reference: { kind: 'weekday', weekday: 'saturday' },
      time: { hour: 7, period: 'ambiguous' },
    }, {
      targetEntityId: olderDuplicate.id,
    }), {
      ...context,
      authoritativeEntities: [active, olderDuplicate],
      activeEntity: { type: 'event', id: active.id },
      preferActiveEntity: true,
    })

    assert.equal(result.kind, 'tool')
    assert.equal(result.args.id, active.id)
    assert.equal(result.args.expected_updated_at, active.version)
})

test('pronoun correction prefers active identity unless another event is named', () => {
  const active = { type: 'event', id: 'dinner', title: 'Jake | Dinner With Kelly' }
  const dentist = { type: 'event', id: 'dentist', title: 'Jake | Dentist Appointment' }

  assert.equal(
    shouldPreferActiveCalendarEntity(
      'Actually, make that Saturday at seven.',
      active,
      [active, dentist],
    ),
    true,
  )
  assert.equal(
    shouldPreferActiveCalendarEntity(
      'Actually, make that dentist appointment Saturday at seven.',
      active,
      [active, dentist],
    ),
    false,
  )
})

test('explicit target clues may switch away from the active conversation event', () => {
    const active = {
      type: 'event',
      id: 'dinner',
      title: 'Dinner with Kelly',
      version: 'dinner-v1',
      start: '2026-07-19T18:00:00-04:00',
      end: '2026-07-19T19:30:00-04:00',
    }
    const dentist = {
      type: 'event',
      id: 'dentist',
      title: 'Dentist appointment',
      version: 'dentist-v1',
      start: '2026-07-20T09:00:00-04:00',
      end: '2026-07-20T09:45:00-04:00',
    }
    const result = resolveCalendarSemanticTurn(turn('delete', {}, {
      targetEntityId: dentist.id,
      target: { title: 'Dentist appointment' },
    }), {
      ...context,
      authoritativeEntities: [active, dentist],
      activeEntity: { type: 'event', id: active.id },
    })

    assert.equal(result.kind, 'tool')
    assert.equal(result.args.id, dentist.id)
})

test('ambiguous destructive targets remain a named clarification instead of selecting a row', () => {
  const events = [
    { type: 'event', id: 'one', title: 'Dentist', version: 'v1' },
    { type: 'event', id: 'two', title: 'Dentist', version: 'v2' },
  ]
  const result = resolveCalendarSemanticTurn(turn('delete', {}, {
    candidateEntityIds: ['one', 'two'],
  }), {
    ...context,
    authoritativeEntities: events,
  })

  test('semantic target clues deterministically narrow noisy model candidates', () => {
    const events = [
      {
        type: 'event',
        id: 'late',
        title: '[Agent QA] Late Thursday pickup',
        version: 'v1',
        start: '2026-07-16T21:15:00-04:00',
        end: '2026-07-16T21:45:00-04:00',
      },
      {
        type: 'event',
        id: 'softball',
        title: '[Agent QA] Thursday softball practice',
        version: 'v2',
        start: '2026-07-16T18:30:00-04:00',
        end: '2026-07-16T20:00:00-04:00',
      },
    ]
    const result = resolveCalendarSemanticTurn(turn('delete', {}, {
      candidateEntityIds: events.map(({ id }) => id),
      target: {
        title: 'late Thursday pickup',
        date_reference: { kind: 'weekday', weekday: 'thursday' },
        time: { hour: 9, minute: 15, period: 'pm' },
      },
    }), {
      ...context,
      authoritativeEntities: events,
    })

    assert.equal(result.kind, 'tool')
    assert.equal(result.args.id, 'late')
  })

  assert.equal(result.kind, 'clarify')
  assert.equal(result.code, 'ambiguous_authoritative_target')
  assert.deepEqual(result.candidates, events)
})

test('semantic calendar turns fail closed on invented event IDs and invalid versions', () => {
  assert.deepEqual(resolveCalendarSemanticTurn(turn('delete', {}, {
    targetEntityId: 'invented',
  }), context), {
    kind: 'reject',
    code: 'unknown_authoritative_event',
  })
  assert.deepEqual(resolveCalendarSemanticTurn({ action: 'create', patch: {} }, context), {
    kind: 'reject',
    code: 'invalid_calendar_semantic_turn',
  })
})
