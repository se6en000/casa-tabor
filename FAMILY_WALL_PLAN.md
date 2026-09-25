# The Family Wall — Build Plan & Checklist

**This file is the single source of truth for the Family Wall program.** Every agent or model working on
Casa Tabor (Claude Code, Codex, Copilot, anything else) reads it before starting Wall work and updates it
in the same commit as the work. Jake reviews it on GitHub.

- Design (approved direction): https://claude.ai/artifact/G56Z8ixXCTxpyYRHAtBtiC — "The Family Wall — Reimagined"
  (boards: 01 Enhanced · 02a The Score · 02b Calm · 02c Evening · 02d Jake's phone)
- Strategy: **keep the foundation, replace the screens.** No rewrite, no new repo. The Wall is a new,
  isolated surface inside this repo that reuses the data, integrations, AI backend and logistics logic.
  The old homepage is frozen, then retired once the Wall has replaced it.

---

## How to use this checklist (rules for every agent)

**Status marks**

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | In progress. Add `Claimed: <agent/session>, <date>` |
| `[x]` | Done. Every "Done means" line is true **and** the Evidence line is filled in |
| `[!]` | Blocked. Add `Blocked: <reason> — needs <what/who>` |

**Rules**

1. **Read before you work.** Pick the lowest-numbered unblocked item in the earliest open phase unless Jake says otherwise.
2. **Claim it.** Change `[ ]` to `[~]` and add the Claimed line before writing code.
3. **No checkmark without evidence.** `[x]` requires the Evidence line filled with things someone else can verify:
   - a commit SHA;
   - the name of a test that **runs the code** (imports it and checks results; source-text/regex tests do not count as evidence for Wall work);
   - a live check: what was verified, where (production URL, Pi kiosk at 1920×1080), when;
   - for data changes: the SQL check you ran and its result.
4. **Never lower the bar to get a checkmark.** If a "Done means" line is wrong, don't delete it — add
   `Criteria changed <date> by <who>: <reason>` under it and flag it to Jake in your reply.
5. **Same-commit updates.** Update this file in the commit that does the work.
6. **Product decisions belong to Jake.** Don't guess. Put questions in *Open questions*, decisions in the *Decision log*.
7. **Disclose regressions immediately**, even ones you already fixed.
8. **Ship with `bash scripts/ship.sh`.** It is the only deploy path.

## Quality bar (applies to every item)

- **Logic:** behavioral tests with realistic fixtures (real-shaped events, members, places). Test the edge cases
  named in the item. A function that decides what the family sees gets a test that proves the decision.
- **Wall UI:** fixed 1920×1080 stage, no scrolling; nothing smaller than 16px; only `wall-*` tokens (in `src/design-system/tokens.mjs`), no raw hex;
  **zero imports from the old homepage** (`src/components/canvas/**`, `useHeroIntelligence`, `heroFocus`,
  `useCalmKioskPresenter`). Live-verified on the Pi kiosk, not just a browser.
- **Data:** no schema change without a migration file in `supabase/migrations/` (FK index + RLS per `GUARDRAILS.md`).
- **Copy:** plain family language. No "MISSED" shaming, no raw counts that can't be acted on, no emoji (Lucide icons).
- **Privacy:** parents' work calendars appear only as busy/free; anything marked private never renders on the wall.

---

## Baseline — health check, 2026-09-25

**Keep (solid):** Google Calendar sync and the recurring-event model (227 events on the new series model, only 12
legacy); Gmail, drive-time cache, iOS Reminders sync; RLS on the core tables; `family_members` already has
color, `can_drive`, availability; ~4,000 recorded trip steps (`event_logistics`: departure/arrival/pickup/dropoff/return);
per-event checklists (`event_checklist_items`); weekly availability rules; low use of `any` (16).

**Problems the Wall must fix:**

1. **Core tables aren't in the repo.** `events`, `event_members`, `family_members`, `settings`, `event_enrichments`,
   `event_logistics`, `event_checklist_items` exist only in the live database. No migration creates them.
2. **Drivers aren't stored.** Only 19 of ~4,700 `event_members` rows have role `driver`; `event_logistics` steps
   have no person column. Drivers are guessed at render time.
3. **"What's next" is decided by item type, not by travel.** The hero skips anything typed `reminder`, so
   "Pick up Photobook for Liv" (a reminder that needs a drive) lost to an at-home violin lesson. Classification
   also guesses from title words (`heroFocus.mjs`).
4. **Leave-time logic is spread across ~29 files**, many of them UI components, so screens disagree.
5. **Drive time is known for only ~34% of enriched events** (1,044 of 3,052).
6. **Weak safety net:** 227 of 355 test files only read source text; 62 actually run code. TypeScript `strict` is off.

**Ship-speed baseline:** end-to-end ship **204–285 s**. Tests ≈ 90 s (of which ~73 s come from 15 slow tests;
5 brightness tests alone ≈ 45 s; the other ~2,500 tests ≈ 9 s total). Type check (`tsc -b`) ≈ 63 s.
Vite build ≈ 5 s. Token/style/certify gates ≈ 4.5 s. The remainder is Vercel upload, live-SHA check, and kiosk refresh.
**Note:** the number of tests is not what makes shipping slow; a handful of slow tests and the type check are.
Removing stale tests reduces *friction* (they break on harmless refactors), not time.

---

## Reuse map

| Reuse (wrap, don't copy) | For |
|---|---|
| Supabase data, all edge functions, Google/Gmail/iOS sync, `route_eta_cache`, `saved_places` | Everything the Wall reads and writes |
| `src/lib/canonicalEventDeparture.ts`, `eventTransportation.ts`, `homeTransportationProjection.mjs` | Leave/arrive times per trip |
| `src/lib/familyRoutines.ts`, `memberAvailability.ts`, `member_availability_rules` | School blocks, who's free |
| `src/lib/driverConflictEngine.ts`, `calendarResponsibility.ts` | Driver conflicts, "needs a decision" |
| `event_checklist_items`, `prep_items` | "Before tonight" / "Pack tonight" |
| AI backend (`ai-assistant`, `ai-agent-*` functions, `useAIAssistant`, assistant libs) | The Wall's assistant (UI changes only) |
| `useRollingEvents` / calendar cache, offline queue, error reporter | Data loading, resilience |
| `scripts/ship.sh`, Pi kiosk services | Deploy |

**Do not reuse:** old homepage widgets (`src/components/canvas/**`), `heroFocus.mjs`, `useHeroIntelligence`,
`useCalmKioskPresenter`, `pointerGestures.ts` hacks, sidecar. The Wall gets its own clean component set.

---

## Phase 0 — Safety net & ship speed

- [x] **P0.1 — Put the database structure in the repo (baseline migration)** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Why: if the database were lost, or a test copy were needed, the repo couldn't rebuild it.
  - Done means:
    - One migration (timestamp before `20260528000100`) creates every untracked table, type/enum, index and RLS policy the live DB has for: `events`, `event_members`, `family_members`, `settings`, `event_enrichments`, `event_logistics`, `event_checklist_items`, plus any other table found referenced in code but not created by a migration (list them here).
    - Idempotent (`if not exists` / guarded), and recorded as already-applied in production's migration history **without executing against prod** (e.g. `supabase migration repair`). No production data touched.
    - Proven: all migrations apply cleanly, in order, to a fresh empty database (Supabase branch or local); the diff between that result and production's schema for these tables is empty.
  - Evidence (2026-09-25):
    - Untracked tables found: `conflicts`, `daily_briefings`, `event_action_items`, `event_checklist_items`, `event_enrichments`, `event_logistics`, `event_members`, `events`, `family_members`, `settings`, `sync_state`, `venues`, `voice_sessions`, plus `google_tokens` (used one migration before its creator), and the hand-built production shapes of `sms_log` and `sensor_readings`; 7 enums. All in `20260527000000_baseline_untracked_core_tables.sql` (pre-history shape: live schema minus what later migrations add).
    - History reconciled: 9 production-only migrations recovered verbatim; 23 files renamed to their production versions; 16 hand-applied August files recorded as applied; never-run `personal_artwork_signature_xs` deleted (Jake). New `20260925170000_capture_production_drift.sql` captures changes made directly in production (4 function bodies, 6 indexes, 1 unique constraint, 5 hand-added `sensor_readings` columns, removed views/index/check) — every statement is a no-op on production.
    - Rebuild fixes (repo files only; production already ran the originals, which stay in its history table): guards added to 4 function-text patches whose target was later edited in place, 4 one-time production data repairs (skip when their rows don't exist), the vault check in `20260813134500` (warn instead of fail), the job-id-specific `20260909165158` (now finds jobs by function), and `20260528000500_sms_log`.
    - Baseline and drift migration recorded as applied via `supabase migration repair` (never executed on production). Production history now has 236 records = 236 repo files, all with SQL.
    - Proof: throwaway Supabase branch `p01-rebuild-check`, public schema wiped, all 236 repo migrations replayed from empty with zero errors; schema fingerprint vs production **identical** in all 10 categories — 101 tables, 1,371 columns (types, nullability, defaults), 409 constraints, 401 indexes, 91 policies, 70 triggers, 119 function bodies, 7 enums, 3 views, 99 RLS tables. Branch deleted afterwards. Full suite 2549/2549 and guardrails 4/4 pass.
    - Rebuild note: a rebuilt database needs its vault secrets (e.g. `SUPABASE_ANON_KEY`) set before scheduled jobs work. Supabase's own preview branches replay production's stored (original) statements, which still contain the pre-guard versions, so they fail; use the repo files for rebuilds.

- [x] **P0.2 — Make the slow tests fast without losing coverage**
  - Why: 15 tests cost ~73 s of every ship.
  - Done means:
    - `tests/ambient-photometric-brightness.test.mjs` runs in < 2 s total (e.g. a fixed, representative set of lux points instead of a brute-force sweep) and still asserts the same properties (monotonic, pitch-black → 0, daylight ratio, evening lamp).
    - The recurrence timezone test, certification tests and any other test > 1 s are either < 1 s or have a written reason here.
    - Full suite ≤ 20 s on the Pi.
  - Evidence (2026-09-25): brightness file 45 s → 0.7 s — `lux_to_brightness` is a pure function, so all 27 cases run in one Python process instead of one process each; same 6 assertions pass. Whole suite now runs in a single Node process (`npm test` = `node --test --experimental-test-isolation=none`, requires Node ≥ 22.8; `npm run test:isolated` keeps the old per-file mode): **90 s → 14–15 s**, 2549/2549 pass on two consecutive runs. Remaining tests over 1 s, with reasons: recurrence host-timezone test (~3 s) must start child processes because a process's time zone is fixed at startup; the two experience-certification tests (~1 s each) scan all of `src/` and duplicate the build's `certify:experience` gate — candidates to drop in P0.6.

- [x] **P0.3 — Remove network dependencies from the ship gate**
  - Why: a ship shouldn't fail because the internet or production DB hiccupped.
  - Done means: tests that hit live services (e.g. the live Supabase RPC check in `tests/granular-ai-telemetry-and-rate-limits.test.mjs`) move to an on-demand health script (`npm run db:health` or similar); the ship gate runs fully offline.
  - Evidence (2026-09-25): the only network-dependent test (live `get_cost_dashboard_summary` check in `tests/granular-ai-telemetry-and-rate-limits.test.mjs`) now skips unless `CASA_LIVE_TESTS=1`; `npm run test:live` runs it on demand (8/8 pass live). Audit of all test files found no other real network calls (`event-description-display` only contains a URL string; `ai-circuit-breaker` mocks fetch).

- [x] **P0.4 — Parallelize ship.sh and print step timings**
  - Done means: tests and the build/type check run concurrently; each step prints its duration; a failure in either still stops the ship; `SKIP_KIOSK=1` still works.
  - Evidence (partial, 2026-09-25): `scripts/ship.sh` runs `npm test` in the background while `vercel build` runs; either failing stops the ship before commit (test failures show the test log); every step prints its duration. `bash -n` passes and `tests/route-code-splitting.test.mjs` (reads ship.sh) passes. Proven by the real ship `155239b8` (2026-09-25): tests + gates/build side by side 17 s, commit 0 s, push 2 s, deploy 14 s, live check 3 s, kiosk refresh 23 s.

- [x] **P0.5 — Type-check speed**
  - Done means: `tsc -b` on a no-change rebuild is < 25 s, or this item records exactly why not and what was tried (incremental build info, project references, TypeScript native preview).
  - Evidence (2026-09-25): root cause — with `noEmit` and no `incremental`, `tsc -b` (TypeScript 6.0.3) looked for output files that never exist, so it re-checked everything every time. Added `"incremental": true` to `tsconfig.app.json` and `tsconfig.node.json`: no-change re-check **45 s → 0.5 s**; after a one-line edit ~5–6 s; a deliberate type error is still caught (exit 1).

- [x] **P0.6 — Test inventory (label, don't delete)**
  - Done means: `tests/MANIFEST.md` lists all test files with one label each — `keep` (runs code, still relevant), `convert` (source-text test on live code; replace with a behavioral test when that code is next touched), `retire-with:<surface>` (pins code the Wall will retire; deleted in the same commit as that code). Counts per label are recorded here.
  - Evidence (2026-09-25): `tests/MANIFEST.md`, generated by `node scripts/test-manifest.mjs` (re-run after adding/removing tests). 357 files: **keep 201**, **convert 121**, **retire-with:homepage 35**. Labels come from import/read patterns (a file that both imports code and reads source counts as keep); correct any mislabel by hand. Nothing deleted.

- [x] **P0.7 — Ship target met**
  - Done means: three consecutive real ships complete in ≤ 120 s end-to-end (timings pasted here).
  - Evidence (partial): ship 1 — `155239b8`, 2026-09-25, **59 s** end-to-end (was 204–285 s). Ship 2 — `689f815d`, **64 s**. Ship 3 — `8c876604`, **65 s**. Target met: three consecutive real ships ≤ 120 s. Note: the first ship on a fresh clone has a cold type-check cache (~45 s more).

- [x] **P0.8 — Freeze the old homepage**
  - Done means: a note at the top of `src/components/canvas/CalmKioskView.tsx` and in `CLAUDE.md`: bug fixes only, no new features or redesigns. Jake confirms.
  - Evidence (2026-09-25): freeze note at the top of `src/components/canvas/CalmKioskView.tsx` and in `CLAUDE.md` (Active program section) and `AGENTS.md`; decision recorded in the Decision log (Jake, 2026-09-25).

- [x] **P0.9 — Kiosk light sensor can't record readings (found during P0.1) — NOT A BUG, closed**
  - Why: production's `sensor_readings` table is the original hand-built design (uuid `id`, 0 rows), but `20260608000100_sensor_readings.sql` and the Pi bridge expect a single row with `id = 'latest'`. The bridge's writes likely fail, so ambient-light auto-brightness may be silently broken — and the Wall's calm/evening postures depend on dimming.
  - Done means: Jake confirms whether auto-brightness should work; if yes, the table matches what the bridge writes (migration in repo), the bridge writes successfully (row visible in SQL), and brightness responds on the physical kiosk.
  - Criteria changed 2026-09-25 by Claude: the premise was wrong, so there was nothing to fix. The bridge writes a fixed UUID row (`SUPABASE_SENSOR_ID` in `pi/sensor-bridge/main.py`), which production's uuid `id` accepts; the `id = 'latest'` design only exists in the old `20260608000100` file.
  - Evidence (2026-09-25, on the kiosk): `casa-sensor-bridge` user service running; `GET 127.0.0.1:8765/room-tone` returned lux 143.1, brightness 38, display_on true — auto-brightness works locally and never depended on the table. The table is empty because `settings.display_config.sensor_push_enabled = false`, and the bridge deliberately clears the row when pushing is off. Deployed `/home/jake/sensor-bridge/main.py` is identical to the repo copy.

## Phase 1 — The trip engine (one source of truth)

- [x] **P1.1 — Define the Trip model**
  - Done means: `src/wall/engine/types.ts` defines a Trip/leg: who travels, who drives, from, to (place + label), leave-at, arrive-at, return leg, source event id, kind (drop-off, pickup, errand, appointment, game, …), confidence (computed vs. confirmed). Short doc comment per field. Reviewed against every board in the design.
  - Evidence (2026-09-25): `src/wall/engine/types.ts` — `Trip` (travelers, driver + where the driver came from, destination, leaveAt/arriveAt/homeAt, drive minutes; `driverId: null` means nobody assigned, never a guess), `LaneSegment` (at a place / activity / driving, with the driver for the hatch color), `PlaceStatus` (home / away / unknown), `DayGap`, `SharedDestination`, `DayPlan` (lanes, trips, active members, unplaced items, all-day notes). Mapped to the design: Score lanes ← `lanes`; Next Move ← `Trip` via `selectNextMove`; Needs a decision ← `gaps` + `sharedDestinations`; whereabouts ← at-place segments; sitter lanes ← `activeMemberIds`.

- [x] **P1.2 — Build the engine: day → lanes**
  - Done means:
    - Pure function(s) in `src/wall/engine/` turn events + routines + members + places + ETAs into per-person lanes (at-a-place blocks, driving legs, busy blocks) for any date. Wraps the reuse-map modules; copies none of them.
    - Anything that requires travel is a trip **regardless of item type** (reminders included).
    - Reports which members are active today (driving, caring for someone, or attending); the Wall passes that to `selectLaneMembers` so a sitter switched off on the home screen gets a lane on days they're involved (rule and tests already in `src/wall/lanes.ts`).
    - Behavioral tests with a fixture of the real Fri Sep 25 / Sat Sep 26 day: the 10:25 photobook pickup is a trip (leave 10:10, driver Jake); the 4:30 violin lesson is at home, not a trip; school blocks come from routines; Saturday's softball + baseball at Ferrin Park are detected as a mergeable pair.
  - Criteria changed 2026-09-25 by Claude: production's photobook reminder has **no place, address or drive time** (the 10:10 leave time in the mockup was invented), so the engine cannot honestly make it a trip. Tested instead: it is kept, marked place-unknown (not home), listed in `unplaced`, and never dropped for being a reminder; the same reminder *with* a place becomes a trip (leave 10:10). "Busy blocks" moved to P3.6 (work busy/free), where their data source lands.
  - Evidence (2026-09-25): `src/wall/engine/dayPlan.ts` `buildDayPlan()` — wraps `familyRoutines` (times, overrides, venue names, drive estimates) and `driverConflictEngine.isEventAtHome`; copies neither. Tests that run it: `tests/wall-engine.test.mjs` (18 tests) on `tests/fixtures/wall-day-2026-09-25.mjs` (production-shaped Fri/Sat): school blocks from routines; Emme+Owen share one Jake drop-off (7:25→7:35) even though one routine names Jake by id and the other by name; Liv drop-off Kelly 7:42; both pickups Giselle, who becomes active; photobook kept as place-unknown; reminder-with-place is a trip; explicit home never a trip; no school on weekends or a child's day off; softball driver from the saved plan; baseball with no driver/person → two gaps, never a guess; the two Ferrin Park games flagged as one-car-could-do-both; trips in departure order. Live check against production data (2026-09-25) produced exactly these trips and gaps.
  - Found while building (real data): production enrichment wrote departure times with the wrong date for 226 of 365 events (see P1.5); the engine ignores any stored departure more than 6 h before arrival and uses arrival − drive time instead (tested with baseball's real 2020-dated value).

- [x] **P1.3 — "Next Move" selector**
  - Done means: one function answers "what must someone do next, who, where, leave when" from the engine output; tests cover a reminder that needs a drive, an at-home event, simultaneous departures, an event already in progress, and nothing-left-today.
  - Evidence (2026-09-25): `src/wall/engine/nextMove.ts` `selectNextMove()`; tests in `tests/wall-engine.test.mjs`: before school (Emme & Owen, leave in 25 min), en route at 7:30, simultaneous departures grouped (within 5 min), nothing left after the last pickup even with an at-home lesson later, and a reminder with a place drives the next move (leave in 10 min). On live data: 7:00 → Emme & Owen drop-off; 1:45 PM → Giselle's pickup in 5 min.

- [~] **P1.4 — Store the driver on each leg**
  - Done means: migration adds the performing member to trip legs (e.g. `event_logistics.member_id`, FK index, RLS); backfill from `event_members.role = 'driver'` and routines; the event editor and the AI write to it; the engine prefers stored drivers over inferred ones. SQL check of coverage recorded here.
  - Criteria changed 2026-09-25 by Claude: the health check was incomplete — drivers per leg **are** stored, in `event_plan_overrides.transportation_plan.legs[].driverId` (next 14 days on 2026-09-25: 14 of 34 events have a plan; 14 of 26 legs name a driver), and the event editor and AI already write there. No new column is needed. Done now means: the engine reads plan drivers first and never defaults to a guessed parent (done, tested); the Wall's "Leaving now"/"Hand off" (P3.3) write to those legs; and coverage is reported with a SQL check.
  - Evidence (partial): engine side done — see P1.2 (softball driver from plan; baseball with no driver is a gap, not "Jake").

- [x] **P1.5 — Drive-time coverage**
  - Done means: every non-home event with a location in the next 14 days has a drive time from home (≥ 95%, SQL query and result recorded); default origin is the home address setting.
  - Finding 2026-09-25: 226 of 365 stored `event_enrichments.departure_time` values are more than 6 h from the event (215 have the wrong year), written from May 29 to today; 79 are upcoming. Root cause: `supabase/functions/enrich-event` stores the AI's `departure_time` text unvalidated (`normalizeText(read('departure_time'))`). Fix: validate it deterministically (must fall in the hours before the start; otherwise derive start − drive minutes, or null), plus a repair of existing rows — the repair changes production data, so it waits for Jake's OK.
  - Evidence (2026-09-25):
    - Coverage: every upcoming (14-day) out-of-home event has a drive time — **10 of 10** (SQL on production; 9 Google-synced copies of school-routine days excluded, since the engine uses the routine's own estimate). The two games that were missing one (Lake Lytal, Olympia Park) were re-enriched: 15 and 25 min. Origin is the home address from settings (`enrich-event` builds it from `homeConfig`).
    - Root-cause fix deployed: `supabase/functions/_shared/event-time-sanity.mjs` validates every AI-written time before it is saved — `plausibleDepartureIso` (must be ≤ 6 h before the start and arrive on time, else start − drive time, else null) and `sanitizeStepTimeIso` (wrong-date step times are moved onto the event's date if the clock time fits, else dropped). Used in `enrich-event` for the enrichment row, every logistics step, and the departure backfill. Tests that run it: `tests/event-time-sanity.test.mjs` (8). `npm run functions:typecheck`: no new errors. Live check: re-enriched Saturday's baseball game → departure saved as **2026-09-26 12:10** (was 2020-dated; the model's 12:15 would have arrived late for a 20 min drive), steps dated 2026.
    - The Wall engine applies the same rules to stored departures (`tests/wall-engine.test.mjs`: wrong-year and would-arrive-late cases).
    - Repair of the existing bad rows approved by Jake 2026-09-25. Counted across all stored events (not only upcoming ones), using the same `event-time-sanity.mjs` rules: 888 of 1,050 enrichment departures and 3,249 of 4,054 logistics step times change. **Not yet applied** — the write to production was blocked by the agent permission guard, so Jake runs it: `node scripts/repair-event-times.mjs` previews, `--apply` backs up every old value to `~/casa-tabor-backups/` and writes in one transaction (each row only if it still holds the value just read), then re-checks with the same rules (expect 0 left). The AI-written step *plans* can also be internally inconsistent (e.g. leave 12:15, arrive 12:35 for a 12:30 start); only their dates are fixed, and the Wall doesn't use them.
    - Note for P3.4: `enrich-event` also lets the model fill in an event's location when none was given, which is how "Academic Scholarship Webinar" got a physical school address; the engine treats it as a trip needing a driver, which "Needs a decision" should ask about.

## Phase 2 — Wall v1 (read-only) on the kiosk

- [x] **P2.0 — Wall tokens in the design-token system** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: the Wall palette (limestone, brass, ink, rust, five person pigments plus their dark-posture variants) and the distance type scale (across-the-room / walking-past / standing-at-it sizes) are registered in `src/design-system/tokens.mjs` and generated CSS; `tokens:check` and `style:check` pass; no raw hex in `src/wall/` components.
  - Evidence (partial): `77a5c5c8` — `wall-*` colors (ground, ink, rule, stone, brass, rust, six pigments) in `staticColor`; new `wallType` group (fixed stage px, 16px minimum) emitted by `generate-design-tokens.mjs`; tokens/style/certify gates pass; no hex in `src/wall/`. Dark-posture variants added with P2.4 (the `74b27cbb`): `wall-night-*` colors in `staticColor` and a `.wall-evening` rule in `src/index.css` that points every `wall-*` role at its night value, so the same components draw light-on-dark; calm sizes `wall-clock-calm` (250px) and `wall-date-calm` (42px). `tokens:check`, `style:check`, `certify:experience` pass; still no hex in `src/wall/`.

- [x] **P2.1 — Wall shell** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: `/wall` route; fixed 1920×1080 stage (scales to the physical screen); `src/wall/tokens` (limestone / brass / ink, person pigments, rust reserved for "move now"); a guardrail test that fails if anything in `src/wall/` imports old-homepage code.
  - Criteria changed 2026-09-25 by Claude: tokens live in `src/design-system/tokens.mjs` (P2.0), not `src/wall/tokens`, so the existing token/style gates cover them — decided with Jake alongside the CLAUDE.md design exception.
  - Evidence (partial): `77a5c5c8` — `/wall` renders outside the old app shell (`src/App.tsx` RootSwitch, lazy 6 KB chunk) with auto-update and existing display-sleep kept; `computeStageFit` scales/letterboxes the 1920×1080 stage; frame shows live minute-aligned clock, date, empty Next Move slot, and one lane per home-screen member (Jake, Kelly, Liv, Emme, Owen, Giselle) with hour axis, brass now-line and veiled past. Tests that run the code: `tests/wall-frame.test.mjs` (10 tests: stage fit, minute clock, date/clock format, timeline mapping, lane selection, pigments); import guardrail `tests/wall-isolation.test.mjs`. Live-verified 2026-09-25 on production at 1920 wide in Chrome, no console errors. Physical kiosk verified 2026-09-25 2:18 PM after the Wall became the kiosk default (`9fd500e2`): screenshot of the Pi's own display (2560×1440) shows `/wall` scaled to fill the panel, signed in, real data and live weather, calm posture ("A quiet stretch until 3:12.", Giselle → Bak Middle School in 53 min). That check found Emme and Owen reading "Nothing on the calendar" after their 2:00 pickup — fixed: after a pickup a child reads "Home since 2:10", or "Home · <next item> · 4:30" (`tests/wall-score.test.mjs`).

- [~] **P2.2 — The Score** — lanes × time, brass now-line, veiled past, driver monograms at drop-off and pickup, hatched driving legs in the driver's color, work shown only as "Work", "everyone home by" marker. Matches board 02a. Live on kiosk. — Claimed: Claude (Opus 5.5), 2026-09-25
  - Evidence (partial): `a4257464` + `c73a1265` — `src/wall/score.ts` (pure layout: lanes from the home-screen setting plus active sitters, colors fixed per person, school bars with drop-off/pickup driver initials and "Giselle · 3:30" notes, driving legs hatched in the driver's lane and color, unassigned road time dashed, items with no place outlined, labels truncated at the next label, lane status "Bak Middle School · until 3:30" / "Driving · back by 7:45" / "Leaves at 7:42 with Kelly" / "Needs a driver · leaves 12:05", "Everyone home by" only when every return is known); `src/wall/useWallDay.ts` (shared caches: rolling events, members, routines/days off); `WallScore.tsx`. Tests that run it: `tests/wall-score.test.mjs` (12). Rendered from a read-only dump of production data for Fri 9/25 and Sat 9/26 at several times (local harness, not committed) — matches 02a; fixed three layout problems found that way (cut-off times, pickup note colliding with a 2:00 reminder, missing "with Kelly").
  - **Remaining:** "Work" blocks need work calendars (open question for Jake); on-kiosk check once the kiosk points at `/wall` (production `/wall` sits behind the family PIN, so it can't be checked from a fresh browser).

- [~] **P2.3 — Header** — large clock, date, weather phrased as a consequence when it touches a plan, Next Move with countdown ring. Matches 02a. — Claimed: Claude (Opus 5.5), 2026-09-25
  - Evidence (partial): `c73a1265` — `src/wall/header.ts` (`describeNextMove`: "Jake → Palm Beach Public", "Drop off Emme & Owen · there by 7:35 · 10 min drive", ring counts the last hour in minutes, hours beyond 90 min, rust only within 15 min of leaving; "ON THE ROAD · THERE BY 7:35" while driving; "NEEDS A DRIVER · LEAVE BY 12:05" when nobody is assigned; "Also leaving: …" for a second departure; `weatherLine`: "84° and partly cloudy", plus "60% chance of rain at 12:30, Ferrin Park Field 1" when an outing still ahead has a ≥40% rain forecast), `NextMovePanel.tsx`; `WallView.tsx` draws the whole wall from data only (for P2.6 fixtures). Engine fix found by rendering real Saturday data: a departure due before the trip on the road arrives now comes first (`tests/wall-engine.test.mjs`). Tests: `tests/wall-header.test.mjs` (9).
  - "Leaving now" / "Hand off" buttons belong to P3.3.
  - **Remaining:** on-kiosk check, as for P2.2.

- [~] **P2.4 — Postures** — launch / calm (dimmed, whereabouts, ribbon) / evening (dark, tomorrow). Switching rules tested (launch when something is due within 5 min or during the morning rush; evening after 7 PM). Matches 02b and 02c. — Claimed: Claude (Opus 5.5), 2026-09-25
  - Evidence (partial): `74b27cbb` — `src/wall/posture.ts` (`selectPosture`: evening 7 PM–6 AM; launch from 6 AM until the last run leaving before 9 AM arrives, or within 5 min of a departure; calm otherwise; launch layout while loading), `WallCalm.tsx` (250px clock, "A quiet stretch until 1:50." / "Baseball at 12:30 still needs a driver.", whereabouts per person, NEXT line, day ribbon with now line), `WallEvening.tsx` (dark; tomorrow's Score, forecast from the first outing, "Needs a decision" from missing drivers and shared destinations, first-departure card; after midnight it shows the day just begun), `WallView.tsx` switches. Tests: `tests/wall-posture.test.mjs` (10). Rendered from production data at 1:40 PM and 8:15 PM Friday — matches 02b/02c. Engine fix found that way: shared destinations also match by street address (the two Saturday games are stored as "Ferrin Park Field 1" and "Vivian A. Ferrin Memorial Park", same 11921 Okeechobee Blvd), so "one car could do both" now appears for the real games (`tests/wall-engine.test.mjs`).
  - "Pack tonight" added ("Pack tonight" commit): `src/wall/packing.ts` (checklist items of the day's outings and timed activities only, grouped "Softball · 12:30", packed count), `useWallChecklist.ts` (keyed under `events`, so the calendar realtime channel refreshes it), shown in the evening beside "Needs a decision"; overflow counted as "+2 more". Tests: `tests/wall-packing.test.mjs` (3); evening screenshot baseline updated. Shows all items for now (decision log) — surprise-safe filtering to revisit before Kelly has access.
  - **Remaining:** on-kiosk check.

- [~] **P2.5 — Kiosk switch with instant rollback** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: the Pi points at `/wall` behind a single setting; switching back to the old homepage takes one step and is documented here; 7-day soak on the real wall; **Jake signs off.**
  - **How to switch (one step each way, from this repo on any machine that can SSH to the Pi):**
    - Show the Wall: `bash pi/kiosk-view.sh wall`
    - Back to the old homepage: `bash pi/kiosk-view.sh home`
    - What it's on now: `bash pi/kiosk-view.sh`
    - Since 2026-09-25 (Jake's call) the Wall is the default when no setting exists; `home` is the rollback.
    - The setting is one word in `~/.config/casa-kiosk/view` on the Pi, read by `pi/start-casa.sh` at launch; deploys never overwrite it (before this, every ship restarted the kiosk on the hard-coded homepage URL, so a hand-edited URL would have been reverted by the next deploy).
  - Evidence (partial): `3a80c087` — `pi/start-casa.sh` reads the setting (default: old homepage; deployed, kiosk confirmed still on the homepage after the ship), `pi/kiosk-view.sh`. **Remaining:** Jake switches it (his call), 7-day soak, sign-off.

- [x] **P2.6 — Screenshot guard for the Wall** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: the existing Playwright visual-regression workflow (`.github/workflows/visual-regression.yml`) captures `/wall` at 1920×1080 in each posture from fixed fixture data and fails on unintended layout changes; baselines are committed.
  - Criteria changed 2026-09-25 by Claude: that CI workflow has failed on every run since at least 2026-08-10 (stale `design-system` baselines in all 6 profiles plus flaky old-homepage `living-canvas` checks), so a Wall check inside it could never block anything. The guard runs instead as its own config inside `scripts/ship.sh`, alongside the tests, and **blocks the deploy** on a difference. Per-platform baselines (Linux, from the Pi that ships); on a machine without them it's skipped with a notice. Jake chose to retire the broken checks (decision log): `design-system.spec.mjs` + baselines and `living-canvas.spec.mjs` removed; the remaining accessibility and experience-certification checks pass locally (23/23, twice).
  - Evidence: `44877d73` — `/__wall-fixture?at=…` (visual-test mode only, not in production builds: checked the built bundle), `visual-regression/wall.spec.mjs` (launch before school, launch with a missing driver, calm afternoon, evening before the games), `playwright.wall.config.mjs` (≤300 differing pixels, 1 retry), baselines in `visual-regression/wall.spec.mjs-snapshots/*-linux.png`, `npm run test:visual:wall` / `:update`. Stable across 6 runs; a 1px shift of the lane blocks fails it (1,604 pixels differ). Adds ~20 s to a ship (86 s), so it runs only when the ship touches Wall-visible files (`src/wall`, `src/lib`, styles/tokens, the fixture, the guard itself, packages); other ships are unaffected.

- [~] **P2.7 — Touch: preview the faces, and a way into the rest of the app** — added 2026-09-25 at Jake's request (the kiosk showed only the calm face, with nothing to touch and no way to the rest of the app). Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: a tap anywhere shows the next face (calm → full day → evening → automatic), with a "Previewing …" label, and the wall returns to the automatic face after 2 minutes without a touch; the MT monogram opens a menu to Calendar, Grocery, Meals & kitchen, Music, Briefing, Settings and the previous home screen; on the kiosk, those pages' Home button and 5 idle minutes lead back to the Wall; phones and laptops unaffected. Verified on the physical kiosk.
  - Evidence (partial): `b015d000` — `src/wall/preview.ts`, `kioskHome.ts`, `useReturnToWall.ts`, `WallMenu.tsx`; kiosk URL now `/wall?kiosk=1&density=kiosk` (marks the kiosk), rollback URL `/?density=kiosk&wallHome=0` (unmarks it). Tests: `tests/wall-preview.test.mjs` (5), Playwright `wall.spec.mjs` interaction test (tap cycle, menu open/close). Screenshot guard tightened to ≤40 differing pixels after the 300 limit let the new 44px MT ring (82 pixels) slip through; stable across 3 runs. Physical kiosk 2026-09-25 2:35 PM: two real taps (xdotool on the Pi's display) went Calm → "Previewing Full day" → "Previewing Evening", each with the label. That preview surfaced a "Pack tonight" heading wrapping over the section title on a long real event title — fixed: headings stay on one line, truncated. **Remaining:** the menu and the Home/idle return on the kiosk.

## Phase 3 — Interactive Wall

- [ ] **P3.0 — Design: assistant + event details in the Wall language**
  - Done means: new boards on the design canvas for (a) talking to the assistant (voice-first; where the conversation appears on a wall with no tabs) and (b) opening an event's details (over the Score). **Jake approves before build.**
  - Evidence: _

- [ ] **P3.1 — Event details (Wall style)**, reusing existing event data and mutation paths (`eventMutations.ts`, recurrence editor core). All edits proven with behavioral tests and live on kiosk.
  - Evidence: _

- [ ] **P3.2 — Assistant (Wall style)** — reuses the whole AI backend and `useAIAssistant`; only the presentation changes. Existing AI QA smoke (`npm run qa:ai-assistant`) passes; voice works on the kiosk.
  - Evidence: _

- [ ] **P3.3 — "Leaving now" and "Hand off"** — writes to the stored leg driver (P1.4); the change appears on the wall and on the other parent's phone.
  - Evidence: _

- [ ] **P3.4 — Needs a decision** — engine detects mergeable trips, driver conflicts with work busy blocks, legs with no driver; max 3 shown, each with two answers; answers write data. Tests per rule.
  - Evidence: _

- [ ] **P3.5 — Before tonight / Pack tonight** — event-bound prep from `event_checklist_items` / `prep_items`; "anytime" to-dos never render on the wall.
  - Evidence: _

- [ ] **P3.6 — Parents' work busy/free** — Google free/busy for calendars Jake designates; stores busy blocks only (no titles). Privacy test.
  - Evidence: _

- [ ] **P3.7 — Surprise-safe privacy** — items marked private (e.g. birthday prep) never render on the wall or on the honoree's phone. Test proves it.
  - Evidence: _

## Phase 4 — Phone lens

- [ ] **P4.1 — "My day" on the phone** — my moves, what others covered, my personal to-dos, private items. Matches 02d.
  - Evidence: _

- [ ] **P4.2 — Personal to-dos leave the wall** — personal items appear only on their owner's phone.
  - Evidence: _

## Phase 5 — Retire the old code

**Retirement protocol:** nothing is deleted until its replacement is live-verified and Jake has signed off;
retire in small batches, one commit per batch (easy revert); delete a file's tests in the same commit;
record bundle size before/after; re-run the full suite after each batch.

- [ ] **P5.1 — Retirement inventory** — generated list (from the import graph) of every file only reachable from the old homepage, with its tests. Recorded in `docs/retirement-inventory.md`.
  - Evidence: _

- [ ] **P5.2 — Retire the old homepage** — only after the Wall is the kiosk default for 14 days **and** P4.1 is shipped. Bundle-size delta recorded.
  - Evidence: _

- [ ] **P5.3 — Retire prototypes and dead ends** — `CookPrototype*`, `TabletPrototypePage`, and edge functions with no callers. **Check external callers first:** `google-oauth-callback` (Google redirect), `register-push-subscription`, `sync-ios-todos-to-casa` (Mac launchd) are likely called from outside the repo.
  - Evidence: _

- [ ] **P5.4 — TypeScript strict mode** — on for `src/wall/` from day one; then progressively for the rest.
  - Evidence: _

---

## Decision log

| Date | Decision | By |
|---|---|---|
| 2026-09-25 | Family Wall ("The Score", postures, phone lens) is the product direction | Jake |
| 2026-09-25 | No rewrite / no new repo: new isolated `/wall` surface in this repo; old homepage frozen then retired | Jake (on Claude's recommendation) |
| 2026-09-25 | This file in the repo is the single source of truth for the checklist | Jake |
| 2026-09-25 | Assistant and event details must share the Wall design language; design them before building (P3.0) | Jake |
| 2026-09-25 | Agents no longer stop for review after writing a failing test; stops only for product decisions, required design approvals, or blockers (`AGENTS.md`) | Jake |
| 2026-09-25 | Build the Wall frame (P2.0/P2.1) now, ahead of Phase 0/1, so the kiosk can watch `/wall` while it's built; Jake points the kiosk there himself | Jake |
| 2026-09-25 | Lanes = everyone switched on by the existing "show on home screen" setting (Giselle stays: she does most of the kids' driving and must be visible for conflicts), plus any sitter/driver switched off who has something that day | Jake |
| 2026-09-25 | Repair the AI-written event times already stored in production, using the same rules that now validate new ones | Jake |
| 2026-09-25 | "Pack tonight" shows every checklist item for now — no surprise-safe filtering yet, since Kelly doesn't use the app during testing. **Revisit before Kelly (or anyone being celebrated) gets access.** | Jake |
| 2026-09-25 | Retire the broken visual checks (`design-system` baselines, old-homepage `living-canvas`) rather than refresh them | Jake |
| 2026-09-25 | The kiosk shows the Wall by default | Jake |
| 2026-09-25 | Old email-intelligence docs moved to `docs/email-intelligence/`; `.agents/` run artifacts removed from the repo (still in git history) | Jake |

## Open questions for Jake

- Which calendars are Jake's and Kelly's work calendars (for busy/free in P3.6)?
- Is 120 s an acceptable ship target (P0.7), or tighter?
- Besides Claude Code, which agents/tools will work on this repo (so their instruction files point here too)?
