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

- [~] **P0.1 — Put the database structure in the repo (baseline migration)** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Why: if the database were lost, or a test copy were needed, the repo couldn't rebuild it.
  - Findings 2026-09-25: 13 live tables have no creating migration — `conflicts`, `daily_briefings`, `event_action_items`, `event_checklist_items`, `event_enrichments`, `event_logistics`, `event_members`, `events`, `family_members`, `settings`, `sync_state`, `venues`, `voice_sessions` (+ enums `conflict_type`, `enrichment_confidence`, `event_status`, `family_role`, `notification_type`, `sms_direction`, `voice_intent` to check). Migration history had drifted: 9 changes existed only in production, 23 repo files were recorded in production under different versions, 17 August files were never recorded.
  - Progress: recovered the 9 production-only migrations verbatim from `supabase_migrations.schema_migrations` into `supabase/migrations/`; renamed the 23 files to their production versions (all references updated; 90 affected tests + full suite 2549/2549 pass). Verified in prod (read-only) that 16 of the 17 unrecorded August files took effect; `20260831191000_personal_artwork_signature_xs.sql` never ran (default is still `md`).
  - Remaining: (1) record the 16 hand-applied August files as applied in production history (metadata only — needs Jake's OK); (2) apply or delete the never-run signature_xs file (Jake); (3) write the baseline for the 13 tables and prove a clean replay on a Supabase branch (costs roughly $0.01/hour while it exists — needs Jake's OK).
  - Done means:
    - One migration (timestamp before `20260528000100`) creates every untracked table, type/enum, index and RLS policy the live DB has for: `events`, `event_members`, `family_members`, `settings`, `event_enrichments`, `event_logistics`, `event_checklist_items`, plus any other table found referenced in code but not created by a migration (list them here).
    - Idempotent (`if not exists` / guarded), and recorded as already-applied in production's migration history **without executing against prod** (e.g. `supabase migration repair`). No production data touched.
    - Proven: all migrations apply cleanly, in order, to a fresh empty database (Supabase branch or local); the diff between that result and production's schema for these tables is empty.
  - Evidence: _

- [ ] **P0.2 — Make the slow tests fast without losing coverage**
  - Why: 15 tests cost ~73 s of every ship.
  - Done means:
    - `tests/ambient-photometric-brightness.test.mjs` runs in < 2 s total (e.g. a fixed, representative set of lux points instead of a brute-force sweep) and still asserts the same properties (monotonic, pitch-black → 0, daylight ratio, evening lamp).
    - The recurrence timezone test, certification tests and any other test > 1 s are either < 1 s or have a written reason here.
    - Full suite ≤ 20 s on the Pi.
  - Evidence: _

- [ ] **P0.3 — Remove network dependencies from the ship gate**
  - Why: a ship shouldn't fail because the internet or production DB hiccupped.
  - Done means: tests that hit live services (e.g. the live Supabase RPC check in `tests/granular-ai-telemetry-and-rate-limits.test.mjs`) move to an on-demand health script (`npm run db:health` or similar); the ship gate runs fully offline.
  - Evidence: _

- [ ] **P0.4 — Parallelize ship.sh and print step timings**
  - Done means: tests and the build/type check run concurrently; each step prints its duration; a failure in either still stops the ship; `SKIP_KIOSK=1` still works.
  - Evidence: _

- [ ] **P0.5 — Type-check speed**
  - Done means: `tsc -b` on a no-change rebuild is < 25 s, or this item records exactly why not and what was tried (incremental build info, project references, TypeScript native preview).
  - Evidence: _

- [ ] **P0.6 — Test inventory (label, don't delete)**
  - Done means: `tests/MANIFEST.md` lists all test files with one label each — `keep` (runs code, still relevant), `convert` (source-text test on live code; replace with a behavioral test when that code is next touched), `retire-with:<surface>` (pins code the Wall will retire; deleted in the same commit as that code). Counts per label are recorded here.
  - Evidence: _

- [ ] **P0.7 — Ship target met**
  - Done means: three consecutive real ships complete in ≤ 120 s end-to-end (timings pasted here).
  - Evidence: _

- [ ] **P0.8 — Freeze the old homepage**
  - Done means: a note at the top of `src/components/canvas/CalmKioskView.tsx` and in `CLAUDE.md`: bug fixes only, no new features or redesigns. Jake confirms.
  - Evidence: _

## Phase 1 — The trip engine (one source of truth)

- [ ] **P1.1 — Define the Trip model**
  - Done means: `src/wall/engine/types.ts` defines a Trip/leg: who travels, who drives, from, to (place + label), leave-at, arrive-at, return leg, source event id, kind (drop-off, pickup, errand, appointment, game, …), confidence (computed vs. confirmed). Short doc comment per field. Reviewed against every board in the design.
  - Evidence: _

- [ ] **P1.2 — Build the engine: day → lanes**
  - Done means:
    - Pure function(s) in `src/wall/engine/` turn events + routines + members + places + ETAs into per-person lanes (at-a-place blocks, driving legs, busy blocks) for any date. Wraps the reuse-map modules; copies none of them.
    - Anything that requires travel is a trip **regardless of item type** (reminders included).
    - Reports which members are active today (driving, caring for someone, or attending); the Wall passes that to `selectLaneMembers` so a sitter switched off on the home screen gets a lane on days they're involved (rule and tests already in `src/wall/lanes.ts`).
    - Behavioral tests with a fixture of the real Fri Sep 25 / Sat Sep 26 day: the 10:25 photobook pickup is a trip (leave 10:10, driver Jake); the 4:30 violin lesson is at home, not a trip; school blocks come from routines; Saturday's softball + baseball at Ferrin Park are detected as a mergeable pair.
  - Evidence: _

- [ ] **P1.3 — "Next Move" selector**
  - Done means: one function answers "what must someone do next, who, where, leave when" from the engine output; tests cover a reminder that needs a drive, an at-home event, simultaneous departures, an event already in progress, and nothing-left-today.
  - Evidence: _

- [ ] **P1.4 — Store the driver on each leg**
  - Done means: migration adds the performing member to trip legs (e.g. `event_logistics.member_id`, FK index, RLS); backfill from `event_members.role = 'driver'` and routines; the event editor and the AI write to it; the engine prefers stored drivers over inferred ones. SQL check of coverage recorded here.
  - Evidence: _

- [ ] **P1.5 — Drive-time coverage**
  - Done means: every non-home event with a location in the next 14 days has a drive time from home (≥ 95%, SQL query and result recorded); default origin is the home address setting.
  - Evidence: _

## Phase 2 — Wall v1 (read-only) on the kiosk

- [~] **P2.0 — Wall tokens in the design-token system** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: the Wall palette (limestone, brass, ink, rust, five person pigments plus their dark-posture variants) and the distance type scale (across-the-room / walking-past / standing-at-it sizes) are registered in `src/design-system/tokens.mjs` and generated CSS; `tokens:check` and `style:check` pass; no raw hex in `src/wall/` components.
  - Evidence (partial): `77a5c5c8` — `wall-*` colors (ground, ink, rule, stone, brass, rust, six pigments) in `staticColor`; new `wallType` group (fixed stage px, 16px minimum) emitted by `generate-design-tokens.mjs`; tokens/style/certify gates pass; no hex in `src/wall/`. **Remaining:** dark-posture (evening) variants — do with P2.4.

- [~] **P2.1 — Wall shell** — Claimed: Claude (Opus 5.5), 2026-09-25
  - Done means: `/wall` route; fixed 1920×1080 stage (scales to the physical screen); `src/wall/tokens` (limestone / brass / ink, person pigments, rust reserved for "move now"); a guardrail test that fails if anything in `src/wall/` imports old-homepage code.
  - Criteria changed 2026-09-25 by Claude: tokens live in `src/design-system/tokens.mjs` (P2.0), not `src/wall/tokens`, so the existing token/style gates cover them — decided with Jake alongside the CLAUDE.md design exception.
  - Evidence (partial): `77a5c5c8` — `/wall` renders outside the old app shell (`src/App.tsx` RootSwitch, lazy 6 KB chunk) with auto-update and existing display-sleep kept; `computeStageFit` scales/letterboxes the 1920×1080 stage; frame shows live minute-aligned clock, date, empty Next Move slot, and one lane per home-screen member (Jake, Kelly, Liv, Emme, Owen, Giselle) with hour axis, brass now-line and veiled past. Tests that run the code: `tests/wall-frame.test.mjs` (10 tests: stage fit, minute clock, date/clock format, timeline mapping, lane selection, pigments); import guardrail `tests/wall-isolation.test.mjs`. Live-verified 2026-09-25 on production at 1920 wide in Chrome, no console errors. **Remaining:** verify on the physical Pi kiosk once Jake points it at `/wall`.

- [ ] **P2.2 — The Score** — lanes × time, brass now-line, veiled past, driver monograms at drop-off and pickup, hatched driving legs in the driver's color, work shown only as "Work", "everyone home by" marker. Matches board 02a. Live on kiosk.
  - Evidence: _

- [ ] **P2.3 — Header** — large clock, date, weather phrased as a consequence when it touches a plan, Next Move with countdown ring. Matches 02a.
  - Evidence: _

- [ ] **P2.4 — Postures** — launch / calm (dimmed, whereabouts, ribbon) / evening (dark, tomorrow). Switching rules tested (launch when something is due within 5 min or during the morning rush; evening after 7 PM). Matches 02b and 02c.
  - Evidence: _

- [ ] **P2.5 — Kiosk switch with instant rollback**
  - Done means: the Pi points at `/wall` behind a single setting; switching back to the old homepage takes one step and is documented here; 7-day soak on the real wall; **Jake signs off.**
  - Evidence: _

- [ ] **P2.6 — Screenshot guard for the Wall**
  - Done means: the existing Playwright visual-regression workflow (`.github/workflows/visual-regression.yml`) captures `/wall` at 1920×1080 in each posture from fixed fixture data and fails on unintended layout changes; baselines are committed.
  - Evidence: _

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
| 2026-09-25 | Old email-intelligence docs moved to `docs/email-intelligence/`; `.agents/` run artifacts removed from the repo (still in git history) | Jake |

## Open questions for Jake

- Which calendars are Jake's and Kelly's work calendars (for busy/free in P3.6)?
- Is 120 s an acceptable ship target (P0.7), or tighter?
- Besides Claude Code, which agents/tools will work on this repo (so their instruction files point here too)?
