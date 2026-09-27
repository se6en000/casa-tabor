import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Live, 2026-09-27: "Jebb's birthday" renamed in Google stayed the old title in Casa — re-adopting a
// series Casa already had only copied Google's version stamps. The fix applies Google's newer master
// to the series; checked end to end on production (see FAMILY_WALL_PLAN.md P3.19 step 1).
const sql = readFileSync(new URL('../supabase/migrations/20260927170000_google_series_edits_reach_casa.sql', import.meta.url), 'utf8')
const importer = readFileSync(new URL('../supabase/functions/import-google-recurrence/index.ts', import.meta.url), 'utf8')
const existingBranch = sql.slice(sql.indexOf('if found then'), sql.indexOf("return jsonb_build_object('series_id', v_existing.id"))

test('a newer Google master updates the template, the series and upcoming copies', () => {
  assert.match(existingBranch, /v_resource\.google_updated_at > coalesce\(v_existing\.google_updated_at/)
  assert.match(existingBranch, /set title = v_title, description = v_description, location_name = v_location, address = v_location,\s+start_time = v_start, end_time = v_end, all_day = v_all_day/)
  assert.match(existingBranch, /set recurrence_lines = v_resource\.recurrence_lines/)
  assert.match(existingBranch, /revision = revision \+ case when v_timing_changed then 1 else 0 end/)
})

test('copies edited on their own are left alone, and past copies are history', () => {
  const copies = existingBranch.slice(existingBranch.indexOf("record_kind = 'occurrence'") - 200, existingBranch.indexOf('update public.event_series'))
  assert.match(copies, /not coalesce\(is_exception, false\)/)
  assert.match(copies, /start_time >= now\(\) - interval '1 day'/)
})

test('a new series or a change of time or rule refills its dates right away', () => {
  assert.match(sql, /'rematerialize', to_jsonb\(v_rematerialize\)/)
  assert.match(importer, /for \(const seriesId of \(adoption\.rematerialize \?\? \[\]\)/)
  assert.match(importer, /invoke\('materialize-recurring-events', \{\s+body: \{ series_id: seriesId \}/)
})

test('the functions stay internal', () => {
  assert.match(sql, /revoke execute on function public\.recurrence_adopt_google_master_core\(uuid, boolean\) from anon, authenticated/)
  assert.match(sql, /revoke execute on function public\.recurrence_adopt_google_masters_core\(uuid\[\], boolean\) from anon, authenticated/)
})
