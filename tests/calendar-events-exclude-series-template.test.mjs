import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

// Regression: `events` rows with record_kind = 'series_template' are internal
// pattern-source records for a recurring series (referenced by
// event_series.template_event_id with ON DELETE RESTRICT). They carry a real
// start_time/end_time (the series' original occurrence), so any calendar-range
// query that doesn't exclude them will surface a phantom duplicate card. Users
// who open that phantom card and try to delete it hit a raw foreign-key
// violation ("violates foreign key constraint... on table event_series")
// instead of the recurring delete-scope flow, because the card's own id
// belongs to a template row, not an occurrence.
//
// Fix: every calendar-range event query must exclude record_kind = 'series_template'.

test('fetchEventsForRange excludes series_template rows from the events range query', () => {
  const src = read('src/hooks/useCalendarEvents.ts')
  const fnMatch = src.match(/async function fetchEventsForRange[\s\S]*?\n}\n/)
  assert.ok(fnMatch, 'fetchEventsForRange function should exist')
  assert.match(
    fnMatch[0],
    /\.neq\(['"]record_kind['"],\s*['"]series_template['"]\)/,
    'fetchEventsForRange must exclude series_template rows so recurring pattern-source records never render as calendar cards',
  )
})

test('useWeekEventIndex excludes series_template rows from the week index query', () => {
  const src = read('src/hooks/useCalendarEvents.ts')
  const fnMatch = src.match(/export function useWeekEventIndex[\s\S]*?\n}\n/)
  assert.ok(fnMatch, 'useWeekEventIndex function should exist')
  assert.match(
    fnMatch[0],
    /\.neq\(['"]record_kind['"],\s*['"]series_template['"]\)/,
    'useWeekEventIndex must exclude series_template rows from its week-count query',
  )
})

test('EventEditSheet blocks deleting a series_template row instead of attempting a raw delete', () => {
  const src = read('src/components/calendar/EventEditSheet.tsx')
  const fnMatch = src.match(/const requestDelete = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[/)
  assert.ok(fnMatch, 'requestDelete should exist')
  assert.match(
    fnMatch[0],
    /event\.record_kind === ['"]series_template['"]/,
    'requestDelete must guard against deleting series_template rows directly (they are referenced by event_series.template_event_id with ON DELETE RESTRICT)',
  )
  assert.match(fnMatch[0], /setDeleteBlocked\(true\)/, 'the guard should mark deletion as blocked so the confirm dialog hides the destructive action')
})
