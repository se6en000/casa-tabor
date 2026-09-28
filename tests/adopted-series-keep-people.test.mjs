import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// Jake, 2026-09-28: "according to AI I have a portfolio review this morning, but I don't see it on
// the score." Casa pushed his monthly "Portfolio trigger review" (with Jake on it) to Google; the
// importer then adopted Google's copy as a new series whose template had no people, so every
// copy had nobody — and the Score draws events on a person's lane. Same for three of Emme's runs.

const path = new URL('../supabase/migrations/20260928090000_adopted_series_keep_people.sql', import.meta.url)
const sql = existsSync(path) ? readFileSync(path, 'utf8') : ''

test('adopting a Google series that began as a Casa event gives its template that event\'s people', () => {
  assert.match(sql, /create or replace function public\.recurrence_adopt_google_master_core/i)
  const adopt = sql.slice(sql.search(/create or replace function public\.recurrence_adopt_google_master_core/i))
  assert.match(adopt, /returning id into v_template_id;\s+(--[^\n]*\n\s*)*insert into public\.event_members/i)
  assert.match(adopt, /c\.google_event_id = v_resource\.google_event_id/)
})

test('the series already adopted without people get them back, templates and copies alike', () => {
  const repair = sql.slice(sql.search(/-- Repair/i))
  assert.match(repair, /insert into public\.event_members[\s\S]+t\.record_kind = 'series_template'/i)
  assert.match(repair, /insert into public\.event_members[\s\S]+o\.record_kind = 'occurrence'/i)
  assert.match(repair, /not exists \(select 1 from public\.event_members/i, 'only where nobody is on it yet')
})
