# Antigravity Agent Guardrails (GUARDRAILS.md)

## 1. UX Feedback & Creative Implementation
* **No Skipped Steps:** When provided with UX feedback or a creative plan, you must address every single point. Do not silently drop or ignore implementation steps.
* **Intelligent Interpretation:** Act as an expert UX builder. Do not take creative plans so literally that the implementation becomes clunky or unintuitive. Translate creative ideas into best-practice UI/UX patterns.
* **Holistic Review:** Before marking a UX task complete, verify that the overall intent of the feedback is achieved. 

## 2. Test-Driven Verification (Strict)
* **Prove It:** Never claim a test has passed without generating the actual terminal log Artifact.
* **Red First:** Always show the failing test log before writing the implementation code.
* **Visual Proof:** For front-end changes, use the Browser Subagent to capture a screenshot or recording. 
* **No Hallucinations:** Faking task completion is strictly prohibited. 

## 3. Project Context Constraints
* **Module Integrity:** When modifying the family management, calendar, school tracking, or todo modules, prioritize clean, testable architecture.
* **Deployment Readiness:** Ensure all code changes are ready for Vercel deployment. No hardcoded placeholders.
* **Communication Style:** When explaining your implementation decisions to me, use short, concise responses. Always use bullet points for longer explanations.

## 4. Database & Query Performance Guardrails (Strict)
* **Single Rolling Store & In-Memory Slicing:** Never write independent hooks or queries that fetch overlapping date ranges or subsets of an existing domain over the network. Sub-views (Today, Tomorrow, Week, Month, Kiosk) must derive from a single unified rolling cache (`useRollingEvents`, `useCalendarFeed`) via `useMemo` (0ms navigation, zero redundant HTTP calls).
* **No Deep Correlated PostgREST Joins:** Never write PostgREST `.select(...)` strings that nest sub-resources across multiple tables (which cause Postgres subplan execution loops and sequential scans). Complex multi-table aggregations must use a dedicated Postgres RPC (`public.get_calendar_feed`) or Database View. Guarded by CI (`tests/guardrails/query-anti-patterns.test.ts`).
* **Atomic Server-Side Mutations:** Any write operation affecting $\ge 2$ related tables (e.g. event + members + enrichment + overrides) must execute as a single atomic Postgres transaction/RPC (`public.upsert_event_bundle`) instead of 4–5 sequential client HTTP roundtrips.
* **Throttled Realtime (Min 500ms Debounce):** Realtime subscriptions must never be mounted in individual UI components. All table listeners must be managed by centralized singletons with a minimum 500ms debounce window to prevent multi-device thundering herds (Desktop, Mobile, Kiosk).
* **Index Every Foreign Key:** Every foreign key in a database migration must have an accompanying `CREATE INDEX IF NOT EXISTS idx_<table_column>` to prevent sequential table scans during joins and cascaded lookups.
* **Background Worker & Cron Governance (Strict):**
  * `pg_cron` jobs invoking `net.http_post` must have a minimum interval of $\ge 15$ minutes and strict `timeout_milliseconds := 10000`. High-frequency self-referencing HTTP loops (<15m) are strictly prohibited. Guarded by CI (`tests/guardrails/cron-governance.test.ts`).
  * All client database roles (`authenticator`, `anon`, `authenticated`) must maintain `idle_in_transaction_session_timeout = '10s'` and `statement_timeout = '15s'` to prevent connection pool exhaustion.
  * Nightly cleanup procedure `maintain_system_operational_queues()` must be scheduled to prune `net._http_response`, `net.http_request_queue`, and `cron.job_run_details`.

