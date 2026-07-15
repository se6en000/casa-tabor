import type { EventLocationScope } from './eventLocation'

export type RecurrenceScopeOperation = 'update' | 'location' | 'delete'

export interface RecurrenceScopeImpact {
  affectedCount?: number
  preservedExceptionCount?: number
}

export interface RecurrenceScopeChoice {
  scope: EventLocationScope
  label: string
  description: string
  impact: string | null
}

const SCOPE_DESCRIPTIONS: Record<RecurrenceScopeOperation, Record<EventLocationScope, string>> = {
  update: {
    this: 'Update this event only.',
    future: 'Update this and all later events.',
    all: 'Update every event, past and future.',
  },
  location: {
    this: 'Change this event location only.',
    future: 'Change this and all later event locations.',
    all: 'Change every event location, past and future.',
  },
  delete: {
    this: 'Delete this event only.',
    future: 'Delete this and all later events.',
    all: 'Delete every event, past and future.',
  },
}

function eventCount(count: number): string {
  return `${count} event${count === 1 ? '' : 's'}`
}

export function recurrenceScopeDialogTitle(operation: RecurrenceScopeOperation): string {
  if (operation === 'delete') return 'Delete recurring event'
  if (operation === 'location') return 'Change recurring event location'
  return 'Update recurring event'
}

export function recurrenceScopeSubmitLabel(
  operation: RecurrenceScopeOperation,
  impact?: RecurrenceScopeImpact,
): string {
  const verb = operation === 'delete' ? 'Delete' : operation === 'location' ? 'Change' : 'Update'
  return impact?.affectedCount == null ? `${verb} selected events` : `${verb} ${eventCount(impact.affectedCount)}`
}

export function buildRecurrenceScopeChoices({
  operation,
  impacts = {},
}: {
  operation: RecurrenceScopeOperation
  impacts?: Partial<Record<EventLocationScope, RecurrenceScopeImpact>>
}): RecurrenceScopeChoice[] {
  const choices: Array<Omit<RecurrenceScopeChoice, 'impact'>> = [
    {
      scope: 'this',
      label: 'Only this event',
      description: SCOPE_DESCRIPTIONS[operation].this,
    },
    {
      scope: 'future',
      label: 'This and following events',
      description: SCOPE_DESCRIPTIONS[operation].future,
    },
    {
      scope: 'all',
      label: 'Entire series',
      description: SCOPE_DESCRIPTIONS[operation].all,
    },
  ]

  return choices.map((choice) => {
    const impact = impacts[choice.scope]
    const details = []
    if (impact?.affectedCount != null) details.push(eventCount(impact.affectedCount))
    if (impact?.preservedExceptionCount) {
      details.push(
        `${impact.preservedExceptionCount} one-off change${impact.preservedExceptionCount === 1 ? '' : 's'} preserved`,
      )
    }
    return { ...choice, impact: details.length > 0 ? details.join(' · ') : null }
  })
}
