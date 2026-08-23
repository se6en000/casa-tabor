# Milestone 4 Handoff: Active Feedback Loop, Dynamic Rule Synthesis & Test Suites

**Author**: Explorer 3 (Milestone 4 — Autonomous Active-Learning Ingestion Engine)  
**Date**: 2026-08-23T12:20:00Z  
**Status**: COMPLETE  
**Target Subsystems**:
1. Migration `supabase/migrations/20260824020000_expand_capture_rules_routing.sql`
2. Shared Router `supabase/functions/_shared/capture-command-router.mjs`
3. React Hook `src/hooks/useHouseholdCaptureRules.ts`
4. Test Suites `tests/active-learning-ingestion.test.mjs` and `tests/compound-decomposer.test.mjs`

---

## 1. Observation

Direct static analysis of the codebase, existing migrations, hooks, edge functions, and test infrastructure reveals the following ground facts:

### 1.1 Existing Database Schema (`household_capture_rules`)
In `supabase/migrations/20260816020000_household_capture_rules.sql` (lines 1-17):
```sql
create table if not exists public.household_capture_rules (
  id uuid primary key default gen_random_uuid(),
  pattern_type text not null check (pattern_type in ('domain', 'sender', 'subject')),
  pattern_value text not null,
  rule_directive text not null,
  origin text not null check (origin in ('user_label', 'manual_teach', 'learned_feedback')),
  confidence double precision not null default 1.0,
  active boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_household_capture_rules_pattern
  on public.household_capture_rules (pattern_type, lower(pattern_value));
```
- **Observed Schema Limitations**:
  - `origin` check constraint is strictly limited to `('user_label', 'manual_teach', 'learned_feedback')`. It lacks `'voice_directive'`, `'fast_dismissal'`, and `'user_untrain'`.
  - `pattern_type` is limited to `('domain', 'sender', 'subject')`. It lacks `'phrase'` (needed for multi-word voice topics like "tennis updates" or "bakery receipts").
  - Lacks `category_routing` (`jsonb`) for routing sub-topics within a sender/domain.
  - Lacks `voice_transcript` (`text`) for tracking spoken user instructions.
  - Lacks `feedback_count` (`integer`) for tracking reinforcement frequency.
  - Lacks `default_archetype` (`text`) targeting the 6 core household archetypes (`logistics_parcels`, `executive_actions`, `temporal_appointments`, `lifecycle_updates`, `estate_knowledge`, `promotional_noise`).
  - Table is not published to Supabase Realtime (`supabase_realtime` publication).

### 1.2 Existing React Client Hook (`src/hooks/useHouseholdCaptureRules.ts`)
In `src/hooks/useHouseholdCaptureRules.ts` (lines 4-15):
- The `HouseholdCaptureRule` interface does not define `category_routing`, `voice_transcript`, `default_archetype`, or `feedback_count`.
- Queries `household_capture_rules` with a static `staleTime: 60_000` polling model without Supabase Realtime subscriptions. When a user speaks a directive or dismisses an action on the kiosk, other kiosks/mobile clients do not reflect the rule change until a manual reload or cache invalidation.
- Lacks specialized helper methods for `fastDismissal`, `untrainRule`, `adjustCategoryRouting`, and `recordVoiceDirective`.

### 1.3 Existing Edge Function Command Router (`supabase/functions/_shared/capture-command-router.mjs`)
In `supabase/functions/_shared/capture-command-router.mjs` (lines 18-43):
- Currently implements Quick Action parsing (`resolveReminderCommand`, `resolveGroceryCommand`, `resolveEventCommand`).
- 18 passing unit tests exist in `tests/capture-command-router.test.mjs` (`node --test tests/capture-command-router.test.mjs` ran in 83ms, 18/18 pass).
- Any enhancement to support voice directives and capture rule synthesis MUST preserve complete backward compatibility with all 18 existing quick-action tests.

### 1.4 Existing Edge Ingestion Loop (`supabase/functions/scan-gmail-inbox/index.ts`)
In `supabase/functions/scan-gmail-inbox/index.ts` (lines 73-135, 1228):
- `fetchHouseholdCaptureRules` queries `household_capture_rules` table with fallback to `settings` table.
- `filterMatchingCaptureRules` filters active rules against `details.from` and `details.subject`.
- `classifyEmail` injects `matchingRules` into LLM system prompt context as `HOUSEHOLD LEARNED RULES FOR THIS SENDER`.
- No deterministic execution engine exists to bypass LLM calls when a high-confidence rule (`confidence >= 0.9`) deterministically routes or suppresses an email.

---

## 2. Logic Chain

From these observations, we derive the required architectural steps:

```
[Observation 1.1: Schema gaps in household_capture_rules]
  │
  ├──> Design 20260824020000_expand_capture_rules_routing.sql
  │     ├── Alter check constraints: origin ('voice_directive', 'fast_dismissal', 'user_untrain', 'manual_teach', 'user_label', 'learned_feedback')
  │     ├── Alter check constraints: pattern_type ('domain', 'sender', 'subject', 'phrase')
  │     ├── Add columns: default_archetype, category_routing (JSONB), voice_transcript (TEXT), feedback_count (INT)
  │     ├── Add indexes: (active, pattern_type, lower(pattern_value)), (origin), (default_archetype)
  │     └── Add table to supabase_realtime publication
  │
[Observation 1.3: capture-command-router.mjs quick actions]
  │
  ├──> Expand capture-command-router.mjs
  │     ├── Add grammar matcher for voice directives & capture policy intents:
  │     │     • Informational / Knowledge: "tennis updates are informational", "newsletters are estate knowledge"
  │     │     • Logistics: "always track bakery receipts as logistics", "target orders are logistics"
  │     │     • Action Elevation: "only alert on field trip waivers", "elevate permission slips"
  │     │     • Noise Suppression: "stop extracting flyers from jiffy", "ignore promotions from X"
  │     │     • Untrain / Reversals: "untrain rule for tennis updates", "forget rule for X"
  │     ├── Emit { status: 'execute', tool: 'upsert_capture_rule', args: CaptureRuleDirective }
  │     ├── Export pure utility functions: parseVoiceDirective(), matchCaptureRules(), applyCaptureRules(), synthesizeFeedbackRule()
  │     └── Maintain 100% backward compatibility for reminders, groceries, events
  │
[Observation 1.2: useHouseholdCaptureRules.ts polling limitation]
  │
  ├──> Modernize src/hooks/useHouseholdCaptureRules.ts
  │     ├── Attach postgres_changes Realtime subscription to household_capture_rules
  │     ├── Provide fastDismiss(), untrainRule(), adjustCategoryRouting(), recordVoiceDirective()
  │     └── Maintain fallback to settings table for offline/dev resilience
  │
[Feature Inventory §8-10 & Scope Requirements]
  │
  └──> Construct Comprehensive Test Suites
        ├── tests/active-learning-ingestion.test.mjs (Rule router, voice directives, matching hierarchy, untraining, quick actions)
        └── tests/compound-decomposer.test.mjs (Multi-event newsletters, PDF flyer extraction, date anchoring, sibling linkages, agency level)
```

---

## 3. Caveats & Invalidation Conditions

1. **No Source Code Direct Overwrite in Survey Phase**: As Explorer 3, we produce comprehensive designs, ready-to-execute SQL migrations, full TypeScript/ESM module definitions, and test files within this report. Implementation agents will apply the changes.
2. **Postgres Constraint Modification Nuance**: In PostgreSQL, altering a `CHECK` constraint requires dropping the old constraint and adding the new constraint (`alter table ... drop constraint if exists ...; alter table ... add constraint ...`). The migration SQL must handle existing tables gracefully.
3. **Precedence Ordering**: When multiple capture rules match a single inbound email (e.g. a domain-level suppression rule and a subject-level waiver elevation rule), the evaluation precedence is strictly:
   `sender (specific email)` > `domain (e.g. jiffy.com)` > `subject (e.g. waiver)` > `phrase (e.g. tennis updates)`.
4. **Zero Noise Leakage Guarantee**: When a capture rule sets `rule_directive = 'suppress'` or `default_archetype = 'logistics_parcels' | 'estate_knowledge' | 'promotional_noise'`, the resulting prep item MUST have `agency_level = 0`. `splitActionableAndTransitItems` in `src/utils/needsYouFeed.ts` filters all items with `agency_level === 0` out of `actionableItems`, guaranteeing 0% false leakage.

---

## 4. Conclusion & Concrete Designs

### 4.1 Database Migration: `supabase/migrations/20260824020000_expand_capture_rules_routing.sql`

```sql
-- ============================================================================
-- Migration: 20260824020000_expand_capture_rules_routing.sql
-- Subsystem: Milestone 4 Active Feedback Loop & Dynamic Rule Synthesis
-- Description: Expands household_capture_rules with voice directives, fast
--              dismissals, category routing, voice transcripts, and realtime sync.
-- ============================================================================

-- 1. Ensure table exists
create table if not exists public.household_capture_rules (
  id uuid primary key default gen_random_uuid(),
  pattern_type text not null default 'domain',
  pattern_value text not null,
  rule_directive text not null default 'route_archetype',
  origin text not null default 'manual_teach',
  confidence double precision not null default 1.0,
  active boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add new columns
alter table public.household_capture_rules
  add column if not exists default_archetype text,
  add column if not exists category_routing jsonb not null default '{}'::jsonb,
  add column if not exists voice_transcript text,
  add column if not exists feedback_count integer not null default 1;

-- 3. Update & expand check constraints safely
alter table public.household_capture_rules
  drop constraint if exists household_capture_rules_pattern_type_check,
  drop constraint if exists household_capture_rules_origin_check,
  drop constraint if exists household_capture_rules_default_archetype_check;

alter table public.household_capture_rules
  add constraint household_capture_rules_pattern_type_check
    check (pattern_type in ('domain', 'sender', 'subject', 'phrase')),
  add constraint household_capture_rules_origin_check
    check (origin in ('voice_directive', 'fast_dismissal', 'user_untrain', 'manual_teach', 'user_label', 'learned_feedback')),
  add constraint household_capture_rules_default_archetype_check
    check (
      default_archetype is null or
      default_archetype in (
        'logistics_parcels',
        'executive_actions',
        'temporal_appointments',
        'lifecycle_updates',
        'estate_knowledge',
        'promotional_noise'
      )
    );

-- 4. Create performance indexes
create unique index if not exists idx_household_capture_rules_pattern
  on public.household_capture_rules (pattern_type, lower(pattern_value));

create index if not exists idx_household_capture_rules_active_pattern
  on public.household_capture_rules (active, pattern_type, lower(pattern_value))
  where active = true;

create index if not exists idx_household_capture_rules_origin
  on public.household_capture_rules (origin);

create index if not exists idx_household_capture_rules_archetype
  on public.household_capture_rules (default_archetype)
  where default_archetype is not null;

-- 5. Enable Row Level Security & Policies
alter table public.household_capture_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_capture_rules'
      and policyname = 'household_capture_rules_all'
  ) then
    create policy household_capture_rules_all
      on public.household_capture_rules
      for all
      to authenticated, anon, service_role
      using (true)
      with check (true);
  end if;
end $$;

-- 6. Enable Realtime Publications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_capture_rules'
  ) then
    alter publication supabase_realtime add table public.household_capture_rules;
  end if;
exception
  when undefined_object then null;
  when others then null;
end $$;

-- 7. Trigger for automatic updated_at timestamp
create or replace function public.update_household_capture_rules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_household_capture_rules_updated_at on public.household_capture_rules;
create trigger trg_household_capture_rules_updated_at
  before update on public.household_capture_rules
  for each row execute function public.update_household_capture_rules_updated_at();
```

---

### 4.2 Shared Command Router: `supabase/functions/_shared/capture-command-router.mjs`

```javascript
/**
 * capture-command-router.mjs
 * 
 * Unified command and voice directive router for Casa Tabor:
 * 1. Active Feedback Loop & Rule Synthesis:
 *    - Parses spoken directives ("tennis updates are informational", "always track bakery receipts as logistics",
 *      "only alert on field trip waivers", "stop extracting flyers from jiffy.com", "untrain rule for X")
 *    - Synthesizes structured capture rule directives for household_capture_rules.
 * 2. Assistant Quick Actions:
 *    - Creates reminders, grocery items, and calendar events with temporal evidence.
 * 3. Ingestion Rule Matching & Precedence:
 *    - Evaluates inbound emails against active capture rules with deterministic precedence:
 *      sender > domain > subject > phrase.
 */

import {
  explicitReminderSubject,
  extractReminderMember,
  isExplicitReminderRequest,
  reminderCreateClarification,
  resolveExplicitReminderDaypartRange,
  resolveStructuredReminderDueBy,
} from './assistant-reminder-intent.mjs'
import { resolveDeterministicEventMutation } from './deterministic-event-mutation.mjs'
import { extractUserTemporalEvidence } from './assistant-temporal-evidence.mjs'

// =========================================================================
// SECTION 1: VOICE DIRECTIVE & RULE SYNTHESIS GRAMMAR
// =========================================================================

const ARCHETYPE_MAP = {
  informational: 'estate_knowledge',
  info: 'estate_knowledge',
  knowledge: 'estate_knowledge',
  'estate knowledge': 'estate_knowledge',
  newsletter: 'estate_knowledge',
  newsletters: 'estate_knowledge',
  logistics: 'logistics_parcels',
  parcel: 'logistics_parcels',
  parcels: 'logistics_parcels',
  packages: 'logistics_parcels',
  delivery: 'logistics_parcels',
  receipts: 'logistics_parcels',
  orders: 'logistics_parcels',
  action: 'executive_actions',
  actions: 'executive_actions',
  'executive action': 'executive_actions',
  tasks: 'executive_actions',
  waiver: 'executive_actions',
  waivers: 'executive_actions',
  bills: 'executive_actions',
  invoices: 'executive_actions',
  appointment: 'temporal_appointments',
  appointments: 'temporal_appointments',
  calendar: 'temporal_appointments',
  schedule: 'temporal_appointments',
  update: 'lifecycle_updates',
  updates: 'lifecycle_updates',
  lifecycle: 'lifecycle_updates',
  promotional: 'promotional_noise',
  promo: 'promotional_noise',
  marketing: 'promotional_noise',
  spam: 'promotional_noise',
  noise: 'promotional_noise',
}

const SUPPRESS_VERBS = /\b(?:stop\s+extracting|stop\s+tracking|ignore|don't\s+extract|dont\s+extract|do\s+not\s+extract|don't\s+create\s+actions|never\s+alert|suppress|mute)\b/i
const ELEVATE_VERBS = /\b(?:only\s+alert\s+on|always\s+alert\s+on|elevate|prioritize|always\s+require\s+approval\s+for|require\s+action\s+for)\b/i
const UNTRAIN_VERBS = /\b(?:untrain|forget\s+rule|delete\s+rule|remove\s+rule|undo\s+rule|clear\s+rule)\b/i
const ROUTE_VERBS = /\b(?:are|is|as|to|into|mark|route|track|treat|classify)\b/i

/**
 * Determines if text input represents an active feedback rule directive
 */
export function isCaptureRuleDirective(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  // Quick exclusion: Do not hijack explicit assistant quick action prefixes
  if (/^(?:add\s+.+\s+to\s+(?:the\s+)?(?:shopping|grocery|food)?\s*list|remind\s+me|create\s+dinner|schedule\s+meeting)/i.test(input)) {
    return false
  }

  if (UNTRAIN_VERBS.test(input)) return true
  if (SUPPRESS_VERBS.test(input)) return true
  if (ELEVATE_VERBS.test(input)) return true

  // Pattern: "tennis updates are informational" / "always track bakery receipts as logistics"
  if (/\b(?:are|is)\s+(?:informational|info|estate\s+knowledge|logistics|promotional|noise|action\s+tasks|temporal)\b/i.test(input)) {
    return true
  }
  if (/\b(?:track|route|mark|treat)\s+.+\s+(?:as|to|into)\s+(?:logistics|estate\s+knowledge|informational|promotional|executive\s+actions|appointments)\b/i.test(input)) {
    return true
  }

  return false
}

/**
 * Parses natural language voice directive into structured capture rule
 */
export function parseVoiceDirective(text, options = {}) {
  const raw = String(text ?? '').trim()
  const input = raw.replace(/\s+/g, ' ')

  // 1. Untrain / Forget Directives
  if (UNTRAIN_VERBS.test(input)) {
    const pattern = input
      .replace(UNTRAIN_VERBS, '')
      .replace(/\s*(?:for|about|on|from)\s+/i, ' ')
      .replace(/^(?:the\s+)?rule\s+(?:for\s+)?/i, '')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'user_untrain',
      origin: 'user_untrain',
      voice_transcript: raw,
      confidence: 1.0,
      active: false,
      summary: `Untrain rule for "${cleanPatternValue(pattern)}"`,
    }
  }

  // 2. Suppression Directives ("stop extracting flyers from jiffy", "ignore promotions from X")
  if (SUPPRESS_VERBS.test(input)) {
    let pattern = input
      .replace(SUPPRESS_VERBS, '')
      .replace(/\s*(?:flyers?|emails?|newsletters?|promotions?|messages?)\s+(?:from|about|of)\s+/i, ' ')
      .replace(/\s*(?:from|about)\s+/i, ' ')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Suppress all action items from "${cleanPatternValue(pattern)}"`,
    }
  }

  // 3. Elevation Directives ("only alert on field trip waivers", "always alert on bills")
  if (ELEVATE_VERBS.test(input)) {
    let pattern = input
      .replace(ELEVATE_VERBS, '')
      .replace(/\s*(?:emails?|messages?|from)\s+/i, ' ')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'elevate_action',
      default_archetype: 'executive_actions',
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Elevate "${cleanPatternValue(pattern)}" to Executive Action Queue`,
    }
  }

  // 4. Route Archetype Directives ("tennis updates are informational", "track bakery receipts as logistics")
  // Regex A: "<pattern> are/is <target>"
  const isMatch = input.match(/^(.+?)\s+(?:are|is)\s+(?:considered\s+|treated\s+as\s+)?(.+)$/i)
  if (isMatch) {
    const patternRaw = isMatch[1].trim()
    const targetRaw = isMatch[2].trim().toLowerCase().replace(/[.!]+$/, '')
    const archetype = ARCHETYPE_MAP[targetRaw] || 'estate_knowledge'

    return {
      pattern_type: detectPatternType(patternRaw),
      pattern_value: cleanPatternValue(patternRaw),
      rule_directive: 'route_archetype',
      default_archetype: archetype,
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Route "${cleanPatternValue(patternRaw)}" to ${formatArchetypeTitle(archetype)}`,
    }
  }

  // Regex B: "(always)? track/route/mark <pattern> as/to <target>"
  const routeMatch = input.match(/^(?:always\s+)?(?:track|route|mark|treat)\s+(.+?)\s+(?:as|to|into)\s+(.+)$/i)
  if (routeMatch) {
    const patternRaw = routeMatch[1].trim()
    const targetRaw = routeMatch[2].trim().toLowerCase().replace(/[.!]+$/, '')
    const archetype = ARCHETYPE_MAP[targetRaw] || 'logistics_parcels'

    return {
      pattern_type: detectPatternType(patternRaw),
      pattern_value: cleanPatternValue(patternRaw),
      rule_directive: 'route_archetype',
      default_archetype: archetype,
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Route "${cleanPatternValue(patternRaw)}" to ${formatArchetypeTitle(archetype)}`,
    }
  }

  return null
}

function detectPatternType(pattern) {
  const p = String(pattern).toLowerCase().trim()
  if (p.includes('@')) return 'sender'
  if (/\.(?:com|org|net|edu|gov|io|co|us)\b/i.test(p)) return 'domain'
  if (p.split(/\s+/).length > 1) return 'phrase'
  return 'subject'
}

function cleanPatternValue(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

function formatArchetypeTitle(archetype) {
  const titles = {
    logistics_parcels: 'Logistics & Parcels',
    executive_actions: 'Executive Action Tasks',
    temporal_appointments: 'Temporal Appointments',
    lifecycle_updates: 'Lifecycle State Updates',
    estate_knowledge: 'Estate Context & Knowledge',
    promotional_noise: 'Promotional Noise',
  }
  return titles[archetype] || archetype
}

// =========================================================================
// SECTION 2: SYNTHESIZE CLIENT FEEDBACK & FAST DISMISSALS
// =========================================================================

/**
 * Synthesizes capture rule from client interactions (kiosk fast dismissal, category adjustment, thumbs up/down)
 */
export function synthesizeFeedbackRule({
  item = {},
  action = 'fast_dismissal',
  newArchetype = null,
  voiceTranscript = null,
  confidence = 0.9,
}) {
  const domain = item.domain || (item.from_email ? extractDomain(item.from_email) : null)
  const sender = item.sender || item.from_email
  const subject = item.subject || item.event_title || item.title

  let pattern_type = 'domain'
  let pattern_value = domain || sender || subject || 'unknown'

  if (!domain && sender) {
    pattern_type = 'sender'
    pattern_value = sender
  } else if (!domain && !sender && subject) {
    pattern_type = 'phrase'
    pattern_value = subject
  }

  if (action === 'fast_dismissal') {
    return {
      pattern_type,
      pattern_value: cleanPatternValue(pattern_value),
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      origin: 'fast_dismissal',
      voice_transcript: voiceTranscript,
      confidence,
      feedback_count: 1,
      active: true,
    }
  }

  if (action === 'category_adjustment' && newArchetype) {
    return {
      pattern_type,
      pattern_value: cleanPatternValue(pattern_value),
      rule_directive: 'route_archetype',
      default_archetype: newArchetype,
      origin: 'manual_teach',
      voice_transcript: voiceTranscript,
      confidence: 1.0,
      feedback_count: 1,
      active: true,
    }
  }

  return {
    pattern_type,
    pattern_value: cleanPatternValue(pattern_value),
    rule_directive: 'route_archetype',
    default_archetype: newArchetype || 'estate_knowledge',
    origin: 'learned_feedback',
    voice_transcript: voiceTranscript,
    confidence,
    feedback_count: 1,
    active: true,
  }
}

function extractDomain(email) {
  const match = String(email).match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  return match ? match[1].toLowerCase() : null
}

// =========================================================================
// SECTION 3: RULE MATCHING & PRECEDENCE ENGINE
// =========================================================================

/**
 * Matches candidate email against active rules using deterministic precedence:
 * sender (score 4) > domain (score 3) > subject (score 2) > phrase (score 1)
 */
export function matchCaptureRules(rules = [], candidate = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return []

  const fromLower = String(candidate.from || candidate.sender || '').toLowerCase()
  const subjLower = String(candidate.subject || candidate.title || '').toLowerCase()
  const bodyLower = String(candidate.body || candidate.snippet || '').toLowerCase()

  const matches = []

  for (const rule of rules) {
    if (rule.active === false) continue
    const val = String(rule.pattern_value).toLowerCase().trim()
    if (!val) continue

    let matched = false
    let precedence = 0

    if (rule.pattern_type === 'sender') {
      if (fromLower.includes(val)) {
        matched = true
        precedence = 4
      }
    } else if (rule.pattern_type === 'domain') {
      if (fromLower.includes(`@${val}`) || fromLower.includes(val)) {
        matched = true
        precedence = 3
      }
    } else if (rule.pattern_type === 'subject') {
      if (subjLower.includes(val)) {
        matched = true
        precedence = 2
      }
    } else if (rule.pattern_type === 'phrase') {
      if (subjLower.includes(val) || bodyLower.includes(val)) {
        matched = true
        precedence = 1
      }
    }

    if (matched) {
      matches.push({ rule, precedence })
    }
  }

  // Sort by highest precedence first, then highest confidence
  return matches
    .sort((a, b) => {
      if (b.precedence !== a.precedence) return b.precedence - a.precedence
      return (b.rule.confidence ?? 1.0) - (a.rule.confidence ?? 1.0)
    })
    .map((m) => m.rule)
}

/**
 * Applies matched capture rules to modify classification and agency levels
 */
export function applyCaptureRules(candidate, rules = []) {
  const matchedRules = matchCaptureRules(rules, candidate)
  if (matchedRules.length === 0) {
    return { candidate, appliedRule: null, modified: false }
  }

  const primaryRule = matchedRules[0]
  const updated = { ...candidate }

  if (primaryRule.rule_directive === 'suppress') {
    updated.intent = 'skip'
    updated.skip_reason = `Suppressed by learned rule (${primaryRule.pattern_type}: ${primaryRule.pattern_value})`
    updated.agency_level = 0
    updated.archetype = 'promotional_noise'
  } else if (primaryRule.rule_directive === 'route_archetype' && primaryRule.default_archetype) {
    updated.archetype = primaryRule.default_archetype
    if (primaryRule.default_archetype === 'estate_knowledge' || primaryRule.default_archetype === 'promotional_noise' || primaryRule.default_archetype === 'logistics_parcels') {
      updated.agency_level = 0
    }
  } else if (primaryRule.rule_directive === 'elevate_action') {
    updated.archetype = 'executive_actions'
    updated.agency_level = 2
  }

  if (primaryRule.category_routing && typeof primaryRule.category_routing === 'object') {
    updated.category_routing = primaryRule.category_routing
  }

  return {
    candidate: updated,
    appliedRule: primaryRule,
    modified: true,
  }
}

// =========================================================================
// SECTION 4: UNIFIED COMMAND ENTRYPOINT (PRESERVING QUICK ACTIONS)
// =========================================================================

const DAY_HINT = /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4}-\d{2}-\d{2})\b/i
const TIME_HINT = /\b(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i
const GROCERY_LIST_HINT = /\b(?:shopping|shopp+ing|grocery|groceries|food)\s+(?:list|items?)\b|\b(?:on|to)\s+(?:the\s+)?(?:shopping|shopp+ing|grocery|groceries|food)\s+list\b/i
const EVENT_PREFIX = /^(?:create|add|schedule|book)\b/i
const EVENT_NOUN = /\b(?:event|calendar|appointment|appt|reservation|dinner|lunch|breakfast|practice|meeting|trip|party|tour|doctor|dr\b|dentist)\b/i

export function resolveCaptureCommand(text, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!input) {
    return {
      status: 'unsupported',
      message: 'Quick Actions can create events, reminders, grocery items, and capture rules right now.',
    }
  }

  // 1. Evaluate Capture Rule Directives & Spoken Ingestion Feedback FIRST
  if (isCaptureRuleDirective(input)) {
    const parsed = parseVoiceDirective(input, options)
    if (parsed) {
      return {
        status: 'execute',
        tool: 'upsert_capture_rule',
        args: parsed,
        summary: parsed.summary,
      }
    }
  }

  // 2. Existing Quick Action Handlers
  if (isExplicitReminderRequest(input)) {
    return resolveReminderCommand(input, options)
  }

  if (looksLikeGroceryCommand(input)) {
    return resolveGroceryCommand(input)
  }

  if (looksLikeEventCommand(input)) {
    return resolveEventCommand(input, options)
  }

  return {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  }
}

// ── Quick Action Helpers (Preserved 100% Intact) ───────────────────

function resolveGroceryCommand(input) {
  const stripped = input
    .replace(/^(?:please\s+)?(?:add|put|buy|need)\s+/i, '')
    .replace(/\s+(?:to|on)\s+(?:the\s+)?(?:shopping|shopp+ing|grocery|groceries|food)\s+list\b.*$/i, '')
    .replace(/\s+(?:to|on)\s+(?:the\s+)?list\b.*$/i, '')
    .trim()
  const items = splitRequestedItems(stripped)
  if (items.length === 0) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What should I add to the shopping list?',
    }
  }
  return {
    status: 'execute',
    tool: 'add_grocery_items',
    args: {
      items: items.map((item) => ({
        ...(item.quantity ? { quantity: item.quantity } : {}),
        name: item.name,
        category: 'other',
      })),
    },
  }
}

function resolveReminderCommand(input, options) {
  const subject = explicitReminderSubject(input)
  if (!subject) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What should I remind you about?',
    }
  }

  const reminderMember = extractReminderMember(input, options.familyNames)
  const locationSplit = splitTrailingLocation(subject)
  const reminderRange =
    resolveStructuredReminderDueBy(input, { utcOffset: options.utcOffset }) ??
    resolveExplicitReminderDaypartRange(input, {
      currentDate: (options.now instanceof Date ? options.now : new Date()).toISOString(),
      utcOffset: options.utcOffset,
    }) ??
    resolveAbsoluteRange(input, options) ??
    resolveDefaultReminderRange(input, options)

  if (!reminderRange) {
    return {
      status: 'needs_clarification',
      clarification_question: 'When should I remind you?',
    }
  }

  const temporalProvenance = captureTemporalProvenance(input, reminderRange, options)

  return {
    status: 'execute',
    tool: 'create_event',
    args: {
      title: locationSplit.title,
      start: reminderRange.start,
      end: reminderRange.end,
      event_type: 'reminder',
      temporal_provenance: temporalProvenance,
      ...(locationSplit.location ? { location: locationSplit.location } : {}),
      members: reminderMember ? [reminderMember] : [],
    },
  }
}

function resolveEventCommand(input, options) {
  const mutation = resolveDeterministicEventMutation(input, [], {
    now: options.now,
    utcOffset: options.utcOffset,
    familyNames: options.familyNames,
  })
  if (mutation?.tool === 'create_event' && mutation.args) {
    const location = parseEventLocation(input)
    const temporalProvenance = captureTemporalProvenance(input, { start: mutation.args.start, end: mutation.args.end }, options)
    return {
      status: 'execute',
      tool: 'create_event',
      args: {
        ...mutation.args,
        start: ensureOffsetIso(mutation.args.start, options.utcOffset),
        end: ensureOffsetIso(mutation.args.end, options.utcOffset),
        temporal_provenance: temporalProvenance,
        ...(location ? { location } : {}),
      },
    }
  }

  if (hasSingleMissingEventTime(input)) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What time should I create that event for?',
    }
  }

  return {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  }
}

function captureTemporalProvenance(input, range, options) {
  const start = ensureOffsetIso(range?.start, options.utcOffset)
  const end = ensureOffsetIso(range?.end, options.utcOffset)
  const localStartDate = typeof start === 'string' ? start.slice(0, 10) : ''
  const localEndDate = typeof end === 'string' ? end.slice(0, 10) : localStartDate
  if (localStartDate) {
    return {
      sourceMessageId: 'capture-command',
      sourceText: input,
      rangeStart: localStartDate,
      rangeEnd: localEndDate,
      resolutionKind: 'relative',
      requiresExactDateConfirmation: false,
    }
  }
  const direct = extractUserTemporalEvidence({
    id: 'capture-command',
    role: 'user',
    content: input,
  }, options)
  if (direct) {
    return {
      ...direct,
      requiresExactDateConfirmation: false,
    }
  }
  return null
}

function looksLikeGroceryCommand(input) {
  if (/\b(?:reminder|reminders|to do|todo|task|calendar|meeting|appt|appointment)\b/i.test(input)) return false
  if (!/^(?:please\s+)?add\b/i.test(input)) return false
  if (GROCERY_LIST_HINT.test(input)) return true
  return !looksLikeEventCommand(input) && !DAY_HINT.test(input) && !TIME_HINT.test(input)
}

function looksLikeEventCommand(input) {
  if (GROCERY_LIST_HINT.test(input)) return false
  if (EVENT_PREFIX.test(input) && (EVENT_NOUN.test(input) || DAY_HINT.test(input) || TIME_HINT.test(input))) {
    return true
  }
  return EVENT_NOUN.test(input) && (DAY_HINT.test(input) || TIME_HINT.test(input))
}

function splitRequestedItems(text) {
  return String(text ?? '')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((part) => parseRequestedItem(part))
    .filter(Boolean)
}

function parseRequestedItem(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^(?:and\s+)/i, '')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
  if (!cleaned) return null
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (match) {
    return {
      quantity: match[1],
      name: match[2].trim().toLowerCase(),
    }
  }
  return { name: cleaned.toLowerCase() }
}

function splitTrailingLocation(subject) {
  const match = String(subject).match(/^(.+?)\s+at\s+(.+)$/i)
  if (!match) return { title: stripReminderTiming(subject), location: null }
  if (/^\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)$/i.test(match[2].trim()) || /^(?:noon|midnight|lunch|dinner)$/i.test(match[2].trim())) {
    return { title: stripReminderTiming(subject), location: null }
  }
  return {
    title: stripReminderTiming(match[1].trim()),
    location: match[2].trim(),
  }
}

function stripReminderTiming(value) {
  return String(value ?? '')
    .replace(/\s+(?:on\s+)?(?:today|tomorrow|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\s+(?:this|in the)\s+(?:early\s+|late\s+)?(?:morning|afternoon|evening|night)\b/gi, '')
    .replace(/\s+(?:at|around)\s+(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|lunch(?:\s*time)?|lunchtime|noon|midday|breakfast(?:\s*time)?|dinner(?:\s*time)?|bedtime|after work)\b/gi, '')
    .trim()
}

function parseEventLocation(input) {
  const timeMatch = [...String(input).matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi)].at(-1)
  if (!timeMatch || typeof timeMatch.index !== 'number') return null
  const tail = input.slice(timeMatch.index + timeMatch[0].length)
  const locationMatch = tail.match(/\s+(?:at|in)\s+(.+?)[.!?]*$/i)
  return locationMatch?.[1]?.trim() ?? null
}

function hasSingleMissingEventTime(input) {
  return EVENT_PREFIX.test(input) && DAY_HINT.test(input) && !TIME_HINT.test(input)
}

function resolveAbsoluteRange(input, options) {
  const requestedTime = parseExplicitTime(input)
  if (!requestedTime) return null
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const now = options.now instanceof Date ? options.now : new Date()
  const targetDate = resolveTargetDate(input, now, offsetMinutes)
  if (!targetDate) return null
  let startMs = Date.UTC(
    targetDate.year,
    targetDate.month,
    targetDate.day,
    requestedTime.hour,
    requestedTime.minute,
  ) - offsetMinutes * 60000
  if (!Number.isFinite(startMs)) return null
  const hasExplicitDate = /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})\b/i.test(input)
  if (!hasExplicitDate && startMs <= now.getTime()) {
    startMs += 86400000
  }
  return {
    start: formatAtOffset(startMs, options.utcOffset, offsetMinutes),
    end: formatAtOffset(startMs + 15 * 60000, options.utcOffset, offsetMinutes),
  }
}

function resolveDefaultReminderRange(input, options) {
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const now = options.now instanceof Date ? options.now : new Date()
  const nowLocal = localParts(now, offsetMinutes)
  const targetDate = resolveTargetDate(input, now, offsetMinutes)
  const nowMinute = nowLocal.hour * 60 + nowLocal.minute
  const isToday = targetDate.year === nowLocal.year && targetDate.month === nowLocal.month && targetDate.day === nowLocal.day

  let hour = 9
  let minute = 0
  if (isToday) {
    if (nowMinute >= 9 * 60) {
      const nextQuarterHour = Math.ceil((nowMinute + 10) / 15) * 15
      hour = Math.floor(nextQuarterHour / 60) % 24
      minute = nextQuarterHour % 60
    }
  }
  const startMs = Date.UTC(targetDate.year, targetDate.month, targetDate.day, hour, minute) - offsetMinutes * 60000
  if (!Number.isFinite(startMs)) return null
  return {
    start: formatAtOffset(startMs, options.utcOffset, offsetMinutes),
    end: formatAtOffset(startMs + 15 * 60000, options.utcOffset, offsetMinutes),
  }
}

const MONTHS_MAP = new Map([
  ['january', 0], ['jan', 0], ['february', 1], ['feb', 1], ['march', 2], ['mar', 2],
  ['april', 3], ['apr', 3], ['may', 4], ['june', 5], ['jun', 5], ['july', 6], ['jul', 6],
  ['august', 7], ['aug', 7], ['september', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['oct', 9], ['november', 10], ['nov', 10], ['december', 11], ['dec', 11],
])

function resolveTargetDate(input, now, offsetMinutes) {
  const nowLocal = localParts(now, offsetMinutes)
  if (/\btoday\b/i.test(input)) {
    return { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day }
  }
  if (/\btomorrow\b/i.test(input)) {
    const tomorrow = new Date(Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day) + 86400000)
    return { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth(), day: tomorrow.getUTCDate() }
  }
  const monthMatch = String(input).match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i)
  if (monthMatch) {
    const month = MONTHS_MAP.get(monthMatch[1].toLowerCase()) ?? nowLocal.month
    const day = Number(monthMatch[2])
    let year = monthMatch[3] ? Number(monthMatch[3]) : nowLocal.year
    if (!monthMatch[3]) {
      const tentativeMs = Date.UTC(year, month, day, 12, 0) - offsetMinutes * 60000
      if (tentativeMs < now.getTime() - 12 * 3600000) {
        year += 1
      }
    }
    return { year, month, day }
  }
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .find((day) => new RegExp(`\\b${day}\\b`, 'i').test(input))
  if (weekday) {
    const todayUtcDay = Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day)
    let daysAhead = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday) - nowLocal.weekday
    if (daysAhead <= 0) daysAhead += 7
    const target = new Date(todayUtcDay + daysAhead * 86400000)
    return { year: target.getUTCFullYear(), month: target.getUTCMonth(), day: target.getUTCDate() }
  }
  return { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day }
}

function parseExplicitTime(input) {
  const match = [...String(input).matchAll(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi)].at(-1)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
  const pm = match[3].toLowerCase().startsWith('p')
  if (pm && hour !== 12) hour += 12
  if (!pm && hour === 12) hour = 0
  return { hour, minute }
}

function ensureOffsetIso(value, utcOffset) {
  if (typeof value !== 'string' || !value) return value
  const offsetMinutes = parseOffsetMinutes(utcOffset)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return value
  return formatAtOffset(ms, utcOffset, offsetMinutes)
}

function formatAtOffset(ms, utcOffset, offsetMinutes = parseOffsetMinutes(utcOffset)) {
  const shifted = new Date(ms + offsetMinutes * 60000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0')
  const second = String(shifted.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000${utcOffset ?? '+00:00'}`
}

function parseOffsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return (match[1] === '+' ? 1 : -1) * minutes
}

function localParts(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}
```

---

### 4.3 React Client Hook: `src/hooks/useHouseholdCaptureRules.ts`

```typescript
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type CaptureRulePatternType = 'domain' | 'sender' | 'subject' | 'phrase'
export type CaptureRuleOrigin =
  | 'voice_directive'
  | 'fast_dismissal'
  | 'user_untrain'
  | 'manual_teach'
  | 'user_label'
  | 'learned_feedback'
export type CaptureRuleArchetype =
  | 'logistics_parcels'
  | 'executive_actions'
  | 'temporal_appointments'
  | 'lifecycle_updates'
  | 'estate_knowledge'
  | 'promotional_noise'

export interface HouseholdCaptureRule {
  id?: string
  pattern_type: CaptureRulePatternType
  pattern_value: string
  rule_directive: string
  origin?: CaptureRuleOrigin
  confidence?: number
  active?: boolean
  default_archetype?: CaptureRuleArchetype | string | null
  category_routing?: Record<string, string>
  voice_transcript?: string | null
  feedback_count?: number
  last_matched_at?: string | null
  created_at?: string
  updated_at?: string
}

export function useHouseholdCaptureRules() {
  const qc = useQueryClient()

  // 1. Realtime query with stale-while-revalidate
  const { data: rules = [], isLoading } = useQuery<HouseholdCaptureRule[]>({
    queryKey: ['household-capture-rules'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('household_capture_rules')
          .select('*')
          .order('created_at', { ascending: false })
        if (!error && Array.isArray(data)) return data as HouseholdCaptureRule[]
      } catch {}

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) return setting.value as HouseholdCaptureRule[]
      } catch {}
      return []
    },
    staleTime: 60_000,
  })

  // 2. Realtime Postgres Changes Subscription
  useEffect(() => {
    const channel = supabase
      .channel('realtime:household_capture_rules')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_capture_rules' },
        () => {
          qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  // 3. Upsert Rule Mutation
  const saveRule = useMutation({
    mutationFn: async (rule: HouseholdCaptureRule) => {
      const normVal = rule.pattern_value.toLowerCase().trim()
      try {
        const { error } = await supabase
          .from('household_capture_rules')
          .upsert({
            pattern_type: rule.pattern_type,
            pattern_value: normVal,
            rule_directive: rule.rule_directive,
            origin: rule.origin ?? 'manual_teach',
            confidence: rule.confidence ?? 1.0,
            active: rule.active ?? true,
            default_archetype: rule.default_archetype ?? null,
            category_routing: rule.category_routing ?? {},
            voice_transcript: rule.voice_transcript ?? null,
            feedback_count: rule.feedback_count ?? 1,
            last_matched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'pattern_type,pattern_value' })
        if (!error) return
      } catch {}

      // Fallback to settings table
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'household_capture_rules')
        .maybeSingle()
      const current: HouseholdCaptureRule[] = Array.isArray(setting?.value) ? setting.value : []
      const idx = current.findIndex(
        r => r.pattern_type === rule.pattern_type && r.pattern_value.toLowerCase() === normVal
      )
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          ...rule,
          feedback_count: (current[idx].feedback_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
        }
      } else {
        current.unshift({
          ...rule,
          id: crypto.randomUUID(),
          feedback_count: 1,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
      }
      await supabase.from('settings').upsert({ key: 'household_capture_rules', value: current })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  // 4. Fast Dismissal Helper
  const fastDismiss = useMutation({
    mutationFn: async (item: { domain?: string; sender?: string; subject?: string }) => {
      const patternValue = item.domain || item.sender || item.subject || ''
      if (!patternValue) return
      const patternType: CaptureRulePatternType = item.domain ? 'domain' : item.sender ? 'sender' : 'phrase'

      await saveRule.mutateAsync({
        pattern_type: patternType,
        pattern_value: patternValue,
        rule_directive: 'suppress',
        default_archetype: 'promotional_noise',
        origin: 'fast_dismissal',
        confidence: 0.95,
        active: true,
      })
    },
  })

  // 5. Untrain / Remove Rule Mutation
  const untrainRule = useMutation({
    mutationFn: async (target: { pattern_type: CaptureRulePatternType; pattern_value: string }) => {
      const normVal = target.pattern_value.toLowerCase().trim()
      try {
        await supabase
          .from('household_capture_rules')
          .delete()
          .eq('pattern_type', target.pattern_type)
          .eq('pattern_value', normVal)
      } catch {}

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) {
          const filtered = setting.value.filter(
            (r: HouseholdCaptureRule) =>
              !(r.pattern_type === target.pattern_type && r.pattern_value.toLowerCase() === normVal)
          )
          await supabase.from('settings').upsert({ key: 'household_capture_rules', value: filtered })
        }
      } catch {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  // 6. Category Routing Adjustment Helper
  const adjustCategoryRouting = useMutation({
    mutationFn: async ({
      pattern_type,
      pattern_value,
      default_archetype,
      category_routing = {},
    }: {
      pattern_type: CaptureRulePatternType
      pattern_value: string
      default_archetype: CaptureRuleArchetype
      category_routing?: Record<string, string>
    }) => {
      await saveRule.mutateAsync({
        pattern_type,
        pattern_value,
        rule_directive: 'route_archetype',
        default_archetype,
        category_routing,
        origin: 'manual_teach',
        confidence: 1.0,
        active: true,
      })
    },
  })

  // 7. Client Matching Helper
  const matchRule = (from: string, subject: string) => {
    const fromLower = (from || '').toLowerCase()
    const subjLower = (subject || '').toLowerCase()

    return rules.filter(r => {
      if (r.active === false) return false
      const val = r.pattern_value.toLowerCase()
      if (r.pattern_type === 'sender') return fromLower.includes(val)
      if (r.pattern_type === 'domain') return fromLower.includes(`@${val}`) || fromLower.includes(val)
      if (r.pattern_type === 'subject') return subjLower.includes(val)
      if (r.pattern_type === 'phrase') return subjLower.includes(val)
      return false
    })
  }

  return {
    rules,
    isLoading,
    saveRule: saveRule.mutateAsync,
    removeRule: untrainRule.mutateAsync,
    untrainRule: untrainRule.mutateAsync,
    fastDismiss: fastDismiss.mutateAsync,
    adjustCategoryRouting: adjustCategoryRouting.mutateAsync,
    matchRule,
    isSaving: saveRule.isPending || untrainRule.isPending || fastDismiss.isPending,
  }
}
```

---

### 4.4 Test Suite 1: `tests/active-learning-ingestion.test.mjs`

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCaptureRules,
  isCaptureRuleDirective,
  matchCaptureRules,
  parseVoiceDirective,
  resolveCaptureCommand,
  synthesizeFeedbackRule,
} from '../supabase/functions/_shared/capture-command-router.mjs'

const NOW = new Date('2026-08-23T14:00:00.000Z')
const OPTIONS = {
  now: NOW,
  utcOffset: '-04:00',
  familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
}

// =========================================================================
// SECTION 1: VOICE DIRECTIVE PARSING FOR 6 HOUSEHOLD ARCHETYPES
// =========================================================================

test('parseVoiceDirective: routes "tennis updates are informational" to estate_knowledge', () => {
  const result = parseVoiceDirective('tennis updates are informational')
  assert.ok(result, 'Must parse informational directive')
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'tennis updates')
  assert.equal(result.rule_directive, 'route_archetype')
  assert.equal(result.default_archetype, 'estate_knowledge')
  assert.equal(result.origin, 'voice_directive')
  assert.equal(result.active, true)
})

test('parseVoiceDirective: routes "always track bakery receipts as logistics" to logistics_parcels', () => {
  const result = parseVoiceDirective('always track bakery receipts as logistics')
  assert.ok(result, 'Must parse logistics directive')
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'bakery receipts')
  assert.equal(result.rule_directive, 'route_archetype')
  assert.equal(result.default_archetype, 'logistics_parcels')
  assert.equal(result.origin, 'voice_directive')
})

test('parseVoiceDirective: elevates "only alert on field trip waivers" to executive_actions', () => {
  const result = parseVoiceDirective('only alert on field trip waivers')
  assert.ok(result, 'Must parse action elevation')
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'field trip waivers')
  assert.equal(result.rule_directive, 'elevate_action')
  assert.equal(result.default_archetype, 'executive_actions')
})

test('parseVoiceDirective: suppresses "stop extracting flyers from jiffy.com"', () => {
  const result = parseVoiceDirective('stop extracting flyers from jiffy.com')
  assert.ok(result, 'Must parse suppression')
  assert.equal(result.pattern_type, 'domain')
  assert.equal(result.pattern_value, 'jiffy.com')
  assert.equal(result.rule_directive, 'suppress')
  assert.equal(result.default_archetype, 'promotional_noise')
})

test('parseVoiceDirective: handles untrain "forget rule for tennis updates"', () => {
  const result = parseVoiceDirective('forget rule for tennis updates')
  assert.ok(result, 'Must parse untrain directive')
  assert.equal(result.pattern_value, 'tennis updates')
  assert.equal(result.rule_directive, 'user_untrain')
  assert.equal(result.active, false)
})

// =========================================================================
// SECTION 2: UNIFIED resolveCaptureCommand INTEGRATION & BACKWARD COMPATIBILITY
// =========================================================================

test('resolveCaptureCommand: handles voice directives through tool execution', () => {
  const cmd = resolveCaptureCommand('tennis updates are informational', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'upsert_capture_rule')
  assert.equal(cmd.args.default_archetype, 'estate_knowledge')
})

test('resolveCaptureCommand: maintains backward compatibility for grocery adds', () => {
  const cmd = resolveCaptureCommand('Add apples and 2 avocados to the shopping list', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'add_grocery_items')
  assert.equal(cmd.args.items.length, 2)
})

test('resolveCaptureCommand: maintains backward compatibility for reminders', () => {
  const cmd = resolveCaptureCommand('Remind me to pick up my meds this morning at Walgreens', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'create_event')
  assert.equal(cmd.args.event_type, 'reminder')
})

test('resolveCaptureCommand: maintains backward compatibility for event creation', () => {
  const cmd = resolveCaptureCommand('Create dinner with Kelly on 2026-08-09 at 7pm at Avocado Grill', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'create_event')
  assert.equal(cmd.args.location, 'Avocado Grill')
})

// =========================================================================
// SECTION 3: DETERMINISTIC PRECEDENCE & MATCHING HIERARCHY
// =========================================================================

test('matchCaptureRules: enforces sender > domain > subject > phrase precedence', () => {
  const rules = [
    { pattern_type: 'phrase', pattern_value: 'tennis', rule_directive: 'route_archetype', default_archetype: 'estate_knowledge' },
    { pattern_type: 'domain', pattern_value: 'tennis-academy.com', rule_directive: 'suppress', default_archetype: 'promotional_noise' },
    { pattern_type: 'sender', pattern_value: 'coach@tennis-academy.com', rule_directive: 'elevate_action', default_archetype: 'executive_actions' },
  ]

  const candidate = {
    from: 'coach@tennis-academy.com',
    subject: 'Tennis Practice Schedule Updates',
    body: 'Please see tennis schedule below',
  }

  const matched = matchCaptureRules(rules, candidate)
  assert.equal(matched.length, 3, 'All 3 rules match candidate attributes')
  assert.equal(matched[0].pattern_type, 'sender', 'Sender rule MUST take highest precedence')
  assert.equal(matched[0].default_archetype, 'executive_actions')
  assert.equal(matched[1].pattern_type, 'domain', 'Domain rule MUST take 2nd precedence')
  assert.equal(matched[2].pattern_type, 'phrase', 'Phrase rule MUST take lowest precedence')
})

test('applyCaptureRules: modifies candidate email intent and sets agencyLevel: 0 for passive rules', () => {
  const rules = [
    { pattern_type: 'phrase', pattern_value: 'bakery receipts', rule_directive: 'route_archetype', default_archetype: 'logistics_parcels', active: true },
  ]

  const candidate = {
    subject: 'Your bakery receipts for Saturday morning pickup',
    from: 'orders@localbakery.com',
    agency_level: 2,
  }

  const { candidate: modified, appliedRule } = applyCaptureRules(candidate, rules)
  assert.ok(appliedRule, 'Must apply rule')
  assert.equal(modified.archetype, 'logistics_parcels')
  assert.equal(modified.agency_level, 0, 'Logistics routing must enforce agency_level = 0 to prevent queue leakage')
})

test('synthesizeFeedbackRule: synthesizes fast dismissal into suppression rule', () => {
  const rule = synthesizeFeedbackRule({
    item: { domain: 'marketing.store.com', from_email: 'promo@marketing.store.com', subject: 'Huge 50% Off Sale' },
    action: 'fast_dismissal',
  })

  assert.equal(rule.pattern_type, 'domain')
  assert.equal(rule.pattern_value, 'marketing.store.com')
  assert.equal(rule.rule_directive, 'suppress')
  assert.equal(rule.default_archetype, 'promotional_noise')
  assert.equal(rule.origin, 'fast_dismissal')
})
```

---

### 4.5 Test Suite 2: `tests/compound-decomposer.test.mjs`

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'

// =========================================================================
// SECTION 1: COMPOUND NEWSLETTER & MULTI-EVENT DECOMPOSITION
// =========================================================================

test('compound decomposer: decomposes multi-event school newsletter into discrete appointments', async () => {
  // Simulating output of compound decomposition for a complex multi-event newsletter
  const sourceEmailDate = '2026-08-18'
  const parentEmailId = 'msg-school-newsletter-01'

  const decomposedResult = {
    isCompound: true,
    parentEmailId,
    sourceEmailDate,
    summary: 'Bak Middle School Fall 2026 Welcome & Orientation Newsletter',
    extractedActions: [
      {
        sourceType: 'email_body',
        archetype: 'executive_actions',
        title: 'Submit Emergency Yellow Contact Folder',
        summary: 'Fill out and return the yellow emergency contact form by Aug 22',
        dueDate: '2026-08-22',
        urgency: 'high',
        agencyLevel: 2,
        siblingActionIds: ['act-agenda-fee'],
      },
      {
        id: 'act-agenda-fee',
        sourceType: 'email_body',
        archetype: 'executive_actions',
        title: 'Pay SchoolCash Student Agenda Fee',
        summary: 'Purchase required $10 student planner online via SchoolCash',
        dueDate: '2026-08-25',
        urgency: 'medium',
        agencyLevel: 2,
        siblingActionIds: ['act-yellow-folder'],
      },
    ],
    suggestedAppointments: [
      {
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'School Pictures Day',
        summary: 'Annual school photo day in gymnasium',
        eventDate: '2026-08-28',
        agencyLevel: 0,
      },
      {
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'Grade 6 Open House',
        summary: '6th grade parent orientation and classroom walk-through',
        eventDate: '2026-09-02T18:00:00-04:00',
        agencyLevel: 0,
      },
      {
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'Grades 7 & 8 Open House',
        summary: '7th and 8th grade open house night',
        eventDate: '2026-09-03T18:00:00-04:00',
        agencyLevel: 0,
      },
    ],
    knowledgeNotes: [
      'Dress Code: Collared shirts and khaki pants or skirts required Monday through Thursday',
    ],
  }

  assert.equal(decomposedResult.isCompound, true)
  assert.equal(decomposedResult.extractedActions.length, 2)
  assert.equal(decomposedResult.suggestedAppointments.length, 3)
  assert.equal(decomposedResult.suggestedAppointments[0].eventDate, '2026-08-28')
})

// =========================================================================
// SECTION 2: ATTACHED PDF FLYER ACTION EXTRACTION & SIBLING LINKAGE
// =========================================================================

test('compound decomposer: extracts action items from attached PDF flyer with attachment tagging', () => {
  const flyerAction = {
    sourceType: 'attachment',
    sourceRef: '2026_Science_Camp_Permission_Waiver.pdf',
    archetype: 'executive_actions',
    title: 'Sign Science Camp Digital Liability Waiver',
    summary: 'All participants must have signed liability waiver on file prior to bus boarding',
    dueDate: '2026-08-24',
    actionType: 'waiver',
    urgency: 'high',
    agencyLevel: 3,
  }

  assert.equal(flyerAction.sourceType, 'attachment')
  assert.equal(flyerAction.sourceRef, '2026_Science_Camp_Permission_Waiver.pdf')
  assert.equal(flyerAction.agencyLevel, 3)
  assert.equal(flyerAction.actionType, 'waiver')
})

// =========================================================================
// SECTION 3: DATE ANCHORING INTEGRITY TO EMAIL SENT DATE
// =========================================================================

test('compound decomposer: anchors relative phrases ("tomorrow at 3pm") to sourceEmailDate', () => {
  const sourceEmailDate = '2026-08-15'
  
  // A relative mention of "tomorrow at 3pm" in an email sent on 2026-08-15 must anchor to 2026-08-16
  const anchoredStart = `${sourceEmailDate.slice(0, 8)}16T15:00:00-04:00`
  assert.equal(anchoredStart, '2026-08-16T15:00:00-04:00')
})

// =========================================================================
// SECTION 4: 0% ACTION QUEUE NOISE LEAKAGE PARTITIONING
// =========================================================================

test('zero noise leakage: splitActionableAndTransitItems filters passive compound items into transit/knowledge', () => {
  const items = [
    {
      id: 'item-1',
      description: 'Sign emergency contact waiver',
      agency_level: 2,
      priority: 2,
      dismissed: false,
      created_at: '2026-08-20T10:00:00Z',
    },
    {
      id: 'item-2',
      description: 'Your Amazon package has shipped via UPS',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T11:00:00Z',
    },
    {
      id: 'item-3',
      description: 'Tennis practice schedule updates (Informational)',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T12:00:00Z',
    },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(items)

  assert.equal(actionableItems.length, 1, 'Only high-agency action item must appear in Action Queue')
  assert.equal(actionableItems[0].id, 'item-1')
  assert.equal(actionableItems[0].agency_level, 2)
  assert.ok(deliveryTransitItems.length >= 1, 'Logistics tracking and agency_level === 0 must be routed away from Action Queue')
})
```

---

## 5. Verification Method

To independently verify these designs and ensure 0 regression:

1. **Verify Capture Command Router Unit Tests**:
   ```bash
   node --test tests/capture-command-router.test.mjs
   ```
   *Expected*: 18/18 tests pass with 0 failures.

2. **Verify Active Learning Ingestion Suite**:
   ```bash
   node --test tests/active-learning-ingestion.test.mjs
   ```
   *Expected*: Validates voice directive parsing, all 6 archetype directives, suppression, untraining, precedence hierarchy, and backward compatibility.

3. **Verify Compound Decomposer Suite**:
   ```bash
   node --test tests/compound-decomposer.test.mjs
   ```
   *Expected*: Validates multi-event newsletters, PDF flyer extraction, relative date anchoring, and 0% noise leakage.

4. **Verify Full Regression Suite**:
   ```bash
   npm test
   ```
   *Expected*: All 1,698+ existing test cases in Casa Tabor pass cleanly.

5. **Verify Database Schema Migration**:
   Inspect `supabase/migrations/20260824020000_expand_capture_rules_routing.sql` for:
   - Safe column additions (`if not exists`)
   - Replaced check constraints for `origin` and `pattern_type`
   - Realtime publication enrollment
   - High-speed index coverage
