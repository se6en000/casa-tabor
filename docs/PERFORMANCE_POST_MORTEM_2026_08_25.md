# Technical Post-Mortem & Architectural Performance Guide
**Incident Date:** 2026-08-25  
**Service:** Supabase Postgres (`sjiejymuuuqzqukyeagk`) / Casa Tabor Frontend  
**Classification:** Query Inefficiency & Lateral PostgREST Join Cascade  
**Resolution:** Correlated JSON Aggregation RPC, Composite Indexes, Elimination of Redundant Client Join Hooks, and Automated Static Guardrail CI

---

## 1. Problem Statement & Historical Context
A previous effort introduced `public.get_calendar_feed` RPC and index definitions to eliminate expensive multi-table queries. However, database triage on 2026-08-25 revealed:
* `get_calendar_feed` was taking **59.1%** of database execution time (47m 05s across 13,843 calls; 2.3s per cold call).
* PostgREST lateral joins on `event_plan_overrides` were consuming **11.6%** of DB runtime (9m 16s across 6,423 calls).
* `family_members` endured **597,029 sequential scans** and `event_members` scanned **51.4M tuples** across 14,045 sequential scans.

---

## 2. Why Did the Previous Fix Leak? (Root Cause Analysis)

### Failure Mode 1: Subquery Hash Semi-Join De-optimization in Postgres RPC
The original `get_calendar_feed` utilized CTEs structured like:
```sql
members_agg AS (
  SELECT em.event_id, ...
  FROM public.event_members em
  JOIN public.family_members fm ON fm.id = em.family_member_id
  WHERE em.event_id IN (SELECT id FROM range_events)
  GROUP BY em.event_id
)
```
**Why this failed:** Postgres could not push down the range index condition into the `IN (SELECT id FROM range_events)` subplan, causing it to fall back to a full table scan on `event_members` (3,660 rows per execution) and a hash join with `family_members`. PostgREST wrapped the RPC call in a lateral scalar subquery, compounding execution time to **2.3 seconds**.

### Failure Mode 2: Client Join Leak via Redundant Hooks
Even though `get_calendar_feed` returned `event_plan_overrides`, the React hook `useEventsForRange` also called a standalone hook `useEventTransportationPlans`:
```ts
supabase
  .from('event_plan_overrides')
  .select('event_id, transportation_plan, events!inner(id)')
  .not('transportation_plan', 'is', null)
  .lt('events.start_time', rangeEnd.toISOString())
```
**Why this failed:** PostgREST translated `events!inner(id)` into a nested lateral join subquery. Because it ran alongside every range query across all active kiosks and desktop windows, it generated 6,423 expensive lateral join queries.

### Failure Mode 3: Realtime Invalidation Herd
When any row in `events`, `member_availability_rules`, or `family_members` changed, multiple subscribers triggered simultaneous invalidations across `['events']`, `['today-events']`, and `['family-members']`. This caused multiple client instances to fire parallel requests at the origin.

---

## 3. The Holistic 4-Pillar Resolution

### Pillar 1: Correlated Single-Pass JSON Aggregation RPC (Postgres)
We replaced CTE `IN (...)` constructs with direct correlated sub-queries:
```sql
SELECT coalesce(jsonb_agg(
  to_jsonb(e) || jsonb_build_object(
    'event_members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(...))
      FROM public.event_members em
      JOIN public.family_members fm ON fm.id = em.family_member_id
      WHERE em.event_id = e.id
    ), '[]'::jsonb),
    'event_plan_overrides', coalesce((
      SELECT jsonb_agg(to_jsonb(epo))
      FROM public.event_plan_overrides epo
      WHERE epo.event_id = e.id
    ), '[]'::jsonb)
    ...
  )
), '[]'::jsonb)
FROM public.events e
WHERE e.start_time < p_end AND e.end_time > p_start ...;
```
* **Result:** Execution time dropped from **2,318 ms to 138 ms (94% drop)** via direct index seek scans (`idx_event_members_event_family_comp`, `idx_event_plan_overrides_event_id`).

### Pillar 2: Composite & Partial Indexes
* `idx_event_members_event_family_comp` on `(event_id, family_member_id)`.
* `idx_member_availability_rules_member` on `(member_id)`.
* `idx_events_range_lookup` on `(start_time, end_time) WHERE record_kind <> 'series_template' AND deleted_at IS NULL`.

### Pillar 3: Client Query Deduplication
* Deleted `useEventTransportationPlans` from `src/hooks/useCalendarEvents.ts`.
* `normalizeEventRow` reads `plan_override.transportation_plan` directly from the single-pass RPC response.

### Pillar 4: Automated CI Guardrail Enforcement
* Created `tests/guardrails/query-anti-patterns.test.ts` to statically assert that no PostgREST queries use multi-table `!inner` nested selects in `src/`.

---

## 4. Verification & Benchmarks

| Metric | Before Fix | After Fix |
| :--- | :--- | :--- |
| `get_calendar_feed` Latency | `2,318 ms` | `138 ms` (-94%) |
| Redundant Lateral Join Calls | 6,423 calls | 0 calls (eliminated) |
| System Health Status | Degraded / Unhealthy (68k errors) | **100% ACTIVE_HEALTHY across all 6 services** |
| Automated Guardrail Tests | None | `tests/guardrails/query-anti-patterns.test.ts` passing |
| Project Unit Tests | 2,162 passing | 2,162 passing |

---

## 5. Background pg_cron & Connection Pool Starvation Root Cause & Fix

### The Failure Chain (68,207 Errors & Service Outages):
1. **17 Concurrent High-Frequency pg_cron Jobs:** 9 jobs were configured to fire every 1, 2, 5, 10, and 15 minutes calling `net.http_post` to Edge Functions on the same Supabase project.
2. **Double-Hop Connection Loop:** Each `net.http_post` spawned an Edge Function, which connected back to PostgREST/Postgres.
3. **`idle in transaction` Connection Leak:** Client transactions (`authenticator` role) were left open in `idle in transaction` without an idle timeout.
4. **Pool Exhaustion:** All database connection slots saturated, causing PostgREST, Auth (GoTrue), and Storage to fail health checks and return HTTP 522/503.

### Remediation Applied:
* Deactivated aggressive 5-minute looping cron jobs via `cron.alter_job(..., active := false)`.
* Enforced strict connection timeouts:
  * `ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '10s';`
  * `ALTER ROLE anon SET idle_in_transaction_session_timeout = '10s';`
  * `ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '10s';`
  * `ALTER ROLE authenticator SET statement_timeout = '15s';`
* Cleared hung request queues in `net.http_request_queue` and terminated stale backends.
* Clean container restart restored all services to `ACTIVE_HEALTHY`.

---

## 6. Realtime 24,003 Error Spike Root Cause & Fix

### The Failure Chain (24,003 Realtime Errors):
1. **Unpublished Table Subscriptions:** Multiple hooks (`usePrepItems`, `useConflicts`, `useMemberAvailability`, `useGroceryList`, `useCalendarEvents`) subscribed to tables not included in the `supabase_realtime` publication (`prep_items`, `conflicts`, `member_availability_rules`, `member_availability_exceptions`, `family_members`, `grocery_items`, `event_logistics`, `event_checklist_items`, `ai_provider_calls`).
2. **Missing `REPLICA IDENTITY FULL`:** All published tables had default replica identity (`d`), preventing the Realtime WAL listener from decoding before/after row images and evaluating RLS filters on updates/deletes.
3. **Dynamic Per-Component Channel Leaks:** Hooks like `usePrepItems` and `useConflicts` created unique channel names per component mount (`useId()`), multiplying idle WebSocket channels on every UI re-render.

### Remediation Applied:
* **Migration `20260825113000_realtime_publication_and_replica_identity.sql`:**
  * Added all 9 missing tables to `supabase_realtime` publication.
  * Executed `ALTER TABLE public.<table_name> REPLICA IDENTITY FULL` across all 19 realtime tables.
* **Singleton Channel Architecture:**
  * Converted `usePrepItems`, `useConflicts`, and `useHouseholdCaptureRules` to subscriber-counted singleton channels with 800ms debouncing.
* **Automated Guardrail Test:**
  * Added `tests/guardrails/realtime-singleton.test.ts` to statically reject dynamic per-component Realtime channels.

---

## 7. Permanent Multi-Device Zero-Thrashing Architecture

### The Systemic Big-Picture Failure Mode:
Casa runs continuously across **multiple active devices**: 24/7 ambient kitchen/hallway kiosks, wall-mounted tablets, iPhones, and developer tabs.
Whenever any of these conditions occurred:
1. **Multi-Device WebSocket Reconnect Storms:** On connect or network resume, every client fired unconditional query invalidations (`status === 'SUBSCRIBED'`), generating 40+ concurrent PostgREST requests simultaneously.
2. **Short Stale Times & Polling on Static Data:** `staleTime: 60s` on `family_members`, `member_availability_rules`, and `household_capture_rules` generated 100k+ unnecessary daily queries.
3. **Connection Pool Slot Starvation:** Supavisor pooler was unconstrained against Postgres `max_connections: 60`, leaving 0 direct slots for health checks and management operations.

### The 5 Permanent Pillars Applied:
1. **Eliminated Reconnect Refetch Storms:** Removed `_fireInvalidation()` on `status === 'SUBSCRIBED'`. Clients fetch once on mount; subsequent state is purely pushed via Realtime WAL changes.
2. **Jittered Debouncing (800ms–1200ms):** When database updates occur, client invalidations are randomized to prevent lockstep thundering herds across devices.
3. **Zero-Polling / `staleTime: Infinity`:** Static/low-churn tables (`family_members`, `member_availability_rules`, `household_capture_rules`) are cached permanently in memory and only invalidated when Realtime events arrive.
4. **Disabled Background Polling Intervals:** Removed redundant 2-minute polling in `usePrepItems`, `useConflicts`, and `useGroceryList`.
5. **Right-Sized Connection Topology:** Set Supavisor pool size to 15 and PostgREST pool size to 10, reserving 35 connection slots (58% headroom) on Postgres.



