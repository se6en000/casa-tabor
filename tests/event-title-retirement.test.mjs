import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const enrich = readFileSync(new URL('../supabase/functions/enrich-event/index.ts', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const assistantCalendar = readFileSync(new URL('../supabase/functions/_shared/assistant-calendar-agent.mjs', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260715249000_retire_person_title_prefixes.sql', import.meta.url), 'utf8')
const completionMigration = readFileSync(new URL('../supabase/migrations/20260715250000_complete_title_prefix_retirement.sql', import.meta.url), 'utf8')
const notifications = readFileSync(new URL('../supabase/functions/notify-upcoming-events/index.ts', import.meta.url), 'utf8')
const pushToGoogle = readFileSync(new URL('../supabase/functions/push-to-google/index.ts', import.meta.url), 'utf8')
const syncEventToGoogle = readFileSync(new URL('../supabase/functions/sync-event-to-google/index.ts', import.meta.url), 'utf8')
const processGoogleSyncJobs = readFileSync(new URL('../supabase/functions/process-google-sync-jobs/index.ts', import.meta.url), 'utf8')
const processGoogleRecurrenceOutbox = readFileSync(new URL('../supabase/functions/process-google-recurrence-outbox/index.ts', import.meta.url), 'utf8')
const eventBlock = readFileSync(new URL('../src/components/calendar/EventBlock.tsx', import.meta.url), 'utf8')
const weekView = readFileSync(new URL('../src/components/calendar/WeekView.tsx', import.meta.url), 'utf8')
const stackedView = readFileSync(new URL('../src/components/calendar/StackedView.tsx', import.meta.url), 'utf8')

test('enrichment preserves the authored title while keeping primary assignments structured', () => {
  assert.match(enrich, /user-authored event title remains authoritative/)
  assert.match(enrich, /const eventPatch: Record<string, string> = \{\}/)
  assert.doesNotMatch(enrich, /`\$\{resolvedPrimary\} \| \$\{concisePart\}`/)
  assert.match(assistant, /Event title only\. Never prefix it with an owner, attendee, or family member\./)
  assert.doesNotMatch(assistant, /Owner \| Description/)
})

test('calendar surfaces preserve genuine pipe punctuation', () => {
  for (const source of [eventBlock, weekView, stackedView]) {
    assert.match(source, /cleanEventTitle/)
    assert.doesNotMatch(source, /indexOf\(' \| '\)/)
    assert.doesNotMatch(source, /slice\(pipeIdx \+ 3\)/)
  }
  assert.doesNotMatch(notifications, /stripPersonPrefix/)
  assert.doesNotMatch(assistantCalendar, /replace\(\/\^\[\^\|\]/)
})

test('backfill selects verified person prefixes and uses durable Google lanes', () => {
  assert.match(migration, /legacy_person_title_targets/)
  assert.match(migration, /normalize_event_title_person_prefix/)
  assert.match(migration, /before insert or update of title on public\.events/)
  assert.match(migration, /lower\(candidate_prefix\) = lower\(member\.name\)/)
  assert.match(migration, /lower\(parsed\.prefix\) in \('jacob', 'caden'\)/)
  assert.match(migration, /legacy_title_series_revisions/)
  assert.match(migration, /target\.series_id = series\.id/)
  assert.match(migration, /template_title_changed/)
  assert.match(migration, /'patch_master'/)
  assert.match(migration, /'patch_instance'/)
  assert.match(migration, /depends_on_operation_id/)
  assert.match(migration, /jsonb_build_array\('event\.title'\)/)
  assert.match(migration, /insert into public\.google_sync_jobs/)
  assert.match(migration, /event\.event_type <> 'reminder'/)
  assert.match(migration, /'title_only'/)
  assert.doesNotMatch(migration, /weekly update/i)
})

test('follow-up queues every cleaned title exception and preserves meaningful residual titles', () => {
  assert.match(completionMigration, /missing_title_retirement_instances/)
  assert.match(completionMigration, /missing_count not in \(0, 44\)/)
  assert.match(completionMigration, /'patch_instance'/)
  assert.match(completionMigration, /'Mary Watches Owen'/)
  assert.match(completionMigration, /'Ayla Birthday!!'/)
  assert.match(completionMigration, /'Field Trip Lox - Mel Taking'/)
  assert.doesNotMatch(completionMigration, /Weekly Update \| Customer Engagement Summit/)
})

test('standalone title cleanup uses a title-only durable projection', () => {
  assert.match(processGoogleSyncJobs, /title_only: job\.sync_mode === 'title_only'/)
  assert.match(syncEventToGoogle, /title_only: title_only === true/)
  assert.match(pushToGoogle, /if \(title_only === true\)/)
  assert.match(pushToGoogle, /patch: \{ summary \}/)
  assert.match(pushToGoogle, /projection: 'title_only'/)
  assert.match(pushToGoogle, /verified_summary: verified\.summary/)
  assert.match(pushToGoogle, /immutable_google_event/)
  assert.match(pushToGoogle, /current\.summary\?\.includes\(' \| '\)/)
  assert.match(syncEventToGoogle, /'immutable_google_event'/)
  assert.match(processGoogleRecurrenceOutbox, /operation\.payload_snapshot\?\.changed_paths/)
  assert.match(processGoogleRecurrenceOutbox, /\{ summary: event\.title \}/)
  assert.match(processGoogleRecurrenceOutbox, /cause\.status === 404/)
  assert.match(processGoogleRecurrenceOutbox, /current\?\.status === 'cancelled'/)
  assert.match(processGoogleRecurrenceOutbox, /Google title verification failed after recurrence patch/)
})
