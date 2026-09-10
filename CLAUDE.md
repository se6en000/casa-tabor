# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Casa Tabor is a household operations app: React 19 + TypeScript + Vite frontend, Supabase (Postgres + Edge Functions) backend, deployed to Vercel and run full-screen on a wall-mounted Raspberry Pi kiosk (Chromium), plus mobile/tablet web. It covers calendar, grocery, cooking/recipes, music, family/todo tracking, an AI assistant with voice (Alexa-style), Google Calendar sync, Gmail-based "household email intelligence" (auto-classifying/acting on household email), SMS, and push notifications.

## Commands

```bash
npm run dev                 # vite dev server
npm run build                # tokens:check + style:check + certify:experience + tsc -b + vite build (see Quality Gate below)
npm run lint                 # eslint .
npm test                     # node --test tests/*.test.mjs  (~2200 tests)
node --test tests/<file>.test.mjs   # run a single test file
npm run guardrails:check     # npx vitest run tests/guardrails/  (architecture guardrail tests, separate from npm test)
npm run test:visual          # playwright visual regression (chromium)
npm run test:visual:update   # update visual snapshots
npm run preview              # preview production build
```

Design-system / experience gates (all run as part of `npm run build`, can be run individually):
```bash
npm run tokens:check         # design tokens in sync (generate-design-tokens.mjs --check)
npm run style:check          # no raw hex colors / sub-44px targets / arbitrary font sizes (style-audit.mjs --check)
npm run certify:experience    # primitive adoption >= 90% (experience-certification.mjs)
npm run design-system:audit  # coverage report -> reports/design-system-migration-todo.md
```

Supabase:
```bash
npm run supabase:check                 # verify-supabase.mjs
npm run db:health                       # db-health-check.mjs
npm run functions:typecheck             # deno check on every supabase/functions/*/index.ts — run before deploying any edge function
npx supabase functions deploy FUNCTION_NAME --project-ref sjiejymuuuqzqukyeagk
```
Never deploy edge functions via the base64 management API approach — use the CLI above.

**`supabase/functions/**/*.ts` gets zero type-checking from `tsc -b`** (that project only covers `src/` — see `tsconfig.json`), so a plain undefined-variable reference can sit in production code, completely invisible, until the exact branch finally runs. That's a real incident that happened here, not a hypothetical. `npm run functions:typecheck` (`scripts/deno-typecheck.mjs`, needs `deno` on PATH — installed via `curl -fsSL https://deno.land/install.sh | sh`) closes that gap: it fails only on "Cannot find name" errors (TS2304/TS2552), since those are always real bugs, while reporting-but-not-blocking-on the pre-existing backlog of other type-mismatch errors (mostly Supabase client generic types) that isn't practical to clear in one pass. Run it before deploying any edge function you touched, and before deploying `ai-assistant`/`ai-agent-write` specifically since they're the highest-traffic, highest-blast-radius functions.

## Deployment (see `.github/instructions/deployment.instructions.md` for full detail)

- Deploy targets: Vercel project `casa-projects/casa-tabor`, Supabase project ref `sjiejymuuuqzqukyeagk`.
- **No agent may deploy code that hasn't passed** `tokens:check`, `style:check`, `certify:experience`, and `npm test`. `npm run deploy` (`scripts/deploy.sh`) enforces this and halts on failure.
- **Canonical one-command path — use this, don't hand-run the steps below:**
  ```bash
  bash scripts/ship.sh ["commit message"]     # tests -> gates+build (once) -> commit -> push both remotes ->
                                               # Vercel prod (prebuilt, no redundant remote rebuild) -> verify live SHA -> Pi kiosk refresh
  SKIP_KIOSK=1 bash scripts/ship.sh           # web-only deploy, skip the Pi
  ```
  This app is meant to be portable — built and shipped from any machine (Mac, this Pi itself, etc.). `scripts/ship.sh` adapts automatically: if it detects it's running ON the kiosk Pi itself (its own IP matches `PI_HOST`), it self-bootstraps SSH trust (adds its own key to its own `authorized_keys`, its own host key to `known_hosts`) so the refresh step can SSH to itself over the LAN — this only ever self-trusts the exact host it's running on, never a different unknown host. From any other machine it behaves like a normal remote SSH deploy.
- The older manual path still works if you need to skip steps: push to both git remotes, `npx vercel --prod`, then `bash pi/refresh-casa-kiosk.sh` (see `.github/instructions/deployment.instructions.md`) — but prefer `scripts/ship.sh`, it's faster (no duplicate build) and verifies the production version hash actually matches what you pushed before touching the kiosk.
- After any frontend change, refresh the Pi kiosk yourself (don't just hand back to the user) — `scripts/ship.sh` does this by default; pass `SKIP_KIOSK=1` only for changes that don't need the wall display updated. Kiosk host: `jake@192.168.86.118`.

## Architecture

**Frontend** (`src/`):
- `pages/` — one file per screen (Calendar, Grocery, Cook, Music, Home, ActionHub, Briefing, TripDetail, AdminOps, DesignSystemGallery, various `*SettingsPage`s).
- `components/ui/` + `design-system/` — the shared component/token library. `design-system/documentation.mjs` documents each primitive's intended use, states, and anti-patterns; `design-system/tokens.mjs` / `generated/design-tokens.css` are the token source of truth (generated, checked by `tokens:check`).
- `stores/` — small Zustand stores (`appStore`, `attentionStore`, `calendarStore`).
- `hooks/` — data/domain hooks (React Query-backed); calendar data flows through a single rolling cache (`useRollingEvents` / `useCalendarEvents`) rather than per-view fetches (see Database Guardrails).
- `lib/` — domain logic: order/tracking canonicalization (`vendorTransactions`-style resolvers), event mutations, transportation/departure calculations, assistant conversation state, voice turn-taking, Spotify/YouTube integrations. Several modules ship as paired `.ts` + prebuilt `.mjs`/`.d.mts` (used by both the app and standalone `scripts/`).
- `contexts/` — Theme and profile-session context.

**Backend** (`supabase/`):
- `functions/` — ~65 Deno edge functions: Gmail scanning (`scan-gmail-inbox`), Google Calendar two-way sync (`sync-calendars`, `push-to-google`, `process-google-sync-jobs`, webhook handlers), AI assistant/agent endpoints (`ai-assistant`, `ai-agent-read/write/shadow`), grocery intelligence, recipe extraction, weather/geocoding/ETA enrichment, SMS/push notifications, admin ops. Shared helpers live in `functions/_shared/` (includes the canonical order/tracking resolver).
- `migrations/` — timestamped SQL migrations (200+). Every FK needs an index; multi-table writes go through a single RPC/transaction, not sequential client calls; `pg_cron` jobs must be >=15min interval with a 10s timeout — see Database Guardrails below.

**Household email intelligence subsystem** — a specific initiative documented in full in `PROJECT.md` (interface contracts, milestones, feature inventory): classifies household Gmail into 6 archetypes (`logistics_parcels`, `executive_actions`, `temporal_appointments`, `lifecycle_updates`, `estate_knowledge`, `promotional_noise`), canonicalizes vendor orders/carrier tracking into composite thread keys, and maintains an active-learning rule store (`household_capture_rules`). Ground-truth fixtures: `tests/fixtures/email-benchmark.json`; eval runner: `scripts/email-benchmark-eval.mjs`.

**Pi kiosk** (`pi/`): the systemd services/scripts that run the kiosk browser session on the wall-mounted Raspberry Pi (`casa-kiosk.service`, `casa-watchdog.*`, `start-casa.sh`, sensor bridge, cast/whisper bridges) and the refresh/health-check scripts used during deploys.

**iOS Reminders sync**: grocery <-> Apple Reminders sync runs via Mac-side launchd scripts (`~/.casa-sync/`), not just the `sync-ios-to-casa`/`sync-casa-to-ios` edge functions — see `.github/instructions/ios-reminders-sync.instructions.md` for the known cursor-precision and echo-loop pitfalls before debugging this as an app bug.

## Design system rules

Full detail: `.github/instructions/design-system.instructions.md`. Key points:
- Reuse `src/components/ui/` and `src/design-system/` primitives/tokens before writing new UI; don't hand-roll buttons/pills/toggles/fields/dialogs when a shared component exists.
- Built for a wall-mounted touch display viewed from a distance: semantic typography roles only (no arbitrary font sizes), density-aware touch targets (>=44px), no reliance on hover/tiny icons/color-alone.
- **No raw Unicode emojis anywhere in the UI** — use Lucide icons instead (renders inconsistently across kiosk/iOS/Android/web).
- When extending the system, add the primitive to `src/components/ui/` + tokens/variants to `src/design-system/`, document it in `DesignSystemGalleryPage.tsx`, and migrate duplicate implementations.

## Database & query guardrails (strict, CI-enforced)

Full detail: `GUARDRAILS.md`. Enforced by `tests/guardrails/*.test.ts` (`npm run guardrails:check`):
- No independent hooks/queries fetching overlapping data — sub-views derive from one rolling cache via `useMemo`.
- No deep correlated PostgREST joins across tables — use a Postgres RPC/view instead (`tests/guardrails/query-anti-patterns.test.ts`).
- Multi-table writes must be one atomic RPC/transaction, not sequential client round-trips.
- Realtime subscriptions are centralized singletons with >=500ms debounce, never mounted per-component.
- Every migration FK gets an accompanying index.
- `pg_cron` + `net.http_post` jobs: >=15min interval, `timeout_milliseconds := 10000` (`tests/guardrails/cron-governance.test.ts`).

## Other repo-specific instructions in effect

These live under `.github/instructions/*.instructions.md` (scoped via `applyTo`) and `AGENTS.md`; read the file directly for full text when touching that area:
- **TDD protocol** (`AGENTS.md`): write the failing test first, stop for review, then implement, with terminal-log/screenshot proof — never mark work done without it.
- **Engineering baseline** (`pro-fix-framework.instructions.md`): fix root causes, reuse existing helpers, proportional validation; don't invoke subagents for ordinary changes.
- **Response style**: code-only answers for coding tasks unless explanation is requested; keep non-code replies short.
- **Alexa architecture lens** (`alexa.instructions.md`): voice/assistant work is judged against Alexa-grade latency/determinism standards; debug via the `ai_drawer_debug_events` Supabase table first, Pi logs only as fallback.
- `.agents/` contains orchestration/subagent coordination artifacts only — never source code.
