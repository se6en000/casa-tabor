export const RECURRENCE_V2_REGRESSION_MATRIX = [
  {
    area: 'generation',
    cases: ['weekly DST', 'ordinal weekdays', 'last weekday', 'RDATE/EXDATE', 'all-day leap day', 'invalid rules'],
    evidence: 'tests/recurrence-v2-foundation.test.mjs',
  },
  {
    area: 'scoped mutations',
    cases: ['this', 'future split', 'all', 'exception preservation', 'exception reset', 'stale revision', 'idempotent replay'],
    evidence: 'scripts/recurrence-v2-command-integration.mjs',
  },
  {
    area: 'detail fidelity',
    cases: ['title', 'time', 'location', 'category', 'attendees', 'primary attendee', 'transportation', 'checklists', 'actions'],
    evidence: 'tests/recurring-event-editor.test.mjs',
  },
  {
    area: 'deletion and recovery',
    cases: ['this delete', 'future delete', 'all delete', '30-day Undo', 'exact restore', 'purge guard'],
    evidence: 'tests/recurring-delete-undo.test.mjs',
  },
  {
    area: 'materialization',
    cases: ['stable IDs', 'rolling horizon', 'progress preservation', 'user tombstones', 'recurrence tombstones'],
    evidence: 'scripts/recurrence-v2-materializer-integration.mjs',
  },
  {
    area: 'Google contract',
    cases: ['master import', 'exception import', 'full fidelity projection', 'explicit invitations', 'bounded retries', 'split saga', 'echo identity'],
    evidence: 'scripts/google-recurrence-projection-integration.mjs',
  },
  {
    area: 'responsive UX',
    cases: ['desktop', 'mobile', 'Pi touch', 'keyboard', 'loading', 'failure', 'retry'],
    evidence: 'tests/recurrence-scope-ux.test.mjs',
  },
  {
    area: 'operations',
    cases: ['pending', 'failed', 'conflict', 'tombstone', 'connection health', 'manual retry'],
    evidence: 'tests/recurrence-operations-visibility.test.mjs',
  },
]

if (process.argv[1]?.endsWith('recurrence-v2-regression-matrix.mjs')) {
  console.log(JSON.stringify(RECURRENCE_V2_REGRESSION_MATRIX, null, 2))
}
