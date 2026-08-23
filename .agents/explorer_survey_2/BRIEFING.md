# BRIEFING — 2026-08-23T11:45:00Z

## Mission
Map the database schema, data models, persistence layers, and capture rules in the Casa Tabor codebase for the Autonomous Household Email Intelligence System.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Schema & Persistence Investigator, Data Model Analyst, Rule System Mapper
- Working directory: /Users/taboj/casa-tabor/.agents/explorer_survey_2
- Original parent: 18c2d770-6afb-45a3-98cb-ced53b25dfcd
- Milestone: Explorer Phase / Initial Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Map schema, migrations, persistence models, capture rules, lifecycle transitions, executive actions, calendar events, logs, thread keys
- Deliver findings in /Users/taboj/casa-tabor/.agents/explorer_survey_2/handoff.md with full evidence chains, schema details, file paths, and recommended feature assignments
- Send completion message to parent when done

## Current Parent
- Conversation ID: 18c2d770-6afb-45a3-98cb-ced53b25dfcd
- Updated: 2026-08-23T11:45:00Z

## Investigation State
- **Explored paths**:
  - `supabase/migrations/` (All 94 SQL migrations, including `20260816020000_household_capture_rules.sql`, `20260807180000_canonical_inbox_email_knowledge.sql`, `20260809201500_vendor_transaction_threads.sql`, `20260715251000_make_prep_completion_durable.sql`, `20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql`, `20260807190000_family_data_evidence_index.sql`)
  - `supabase/functions/scan-gmail-inbox/index.ts` (1,716 lines)
  - `supabase/functions/_shared/` (`gmail-canonical-email.mjs`, `family-email-evidence.mjs`, `assistant-email-knowledge-read.mjs`, `assistant-agent-tools.mjs`, `capture-command-router.mjs`)
  - `src/utils/vendorTransactions.ts` (741 lines)
  - `src/utils/actionInspectionSynthesis.ts` (1,170 lines)
  - `src/hooks/useHouseholdCaptureRules.ts`
  - `src/hooks/useActionAssigneeLearning.ts`
  - `src/components/canvas/widgets/ActionInspectionSidecar.tsx`
  - `tests/` (`vendor-transaction-producer.test.mjs`, `gmail-canonical-email.test.mjs`, `gmail-cross-inbox-dedupe.test.mjs`, `prep-action-completion.test.mjs`, `action-assignee-learning.test.mjs`)
- **Key findings**:
  - Full relational inventory mapped across 12 core tables (`household_capture_rules`, `canonical_inbox_emails`, `gmail_processed_messages`, `family_knowledge_claims`, `prep_items`, `prep_item_resolutions`, `prep_item_feedback`, `prep_item_suppressions`, `attention_topic_rules`, `family_data_documents`, `family_data_chunks`, `email_conflicts`).
  - Capture rules query/matching/injection runtime loop mapped with 4 multi-channel feedback mechanisms (Gmail 'Casa' label, Kiosk Policy Tune modal, push downvotes, assignee picker).
  - Multi-vendor deterministic order ID normalizer & composite thread key state machine mapped (`confirmed` -> `payment` -> `shipped` -> `out_for_delivery` -> `delivered`/`problem`) with future date guardrail and agency level separation (`agency_level = 0` for Logistics Radar).
  - Executive action items mapped to enforced 9-category taxonomy with compound PDF decomposition, `action_key` uniqueness, and transactional resolution.
  - Three concrete schema migration proposals authored for R3 (canonical keys/vendor index), R4 (few-shot exemplar memory & expanded capture rule routing), and multi-email tracking.
- **Unexplored areas**: None for this survey milestone.

## Key Decisions Made
- All 1,698 baseline tests verified passing. Full handoff written to `handoff.md` with complete evidence chains and migration designs.

## Artifact Index
- /Users/taboj/casa-tabor/.agents/explorer_survey_2/DISPATCH.md — Initial dispatch log
- /Users/taboj/casa-tabor/.agents/explorer_survey_2/BRIEFING.md — Working memory
- /Users/taboj/casa-tabor/.agents/explorer_survey_2/progress.md — Liveness & progress tracker
- /Users/taboj/casa-tabor/.agents/explorer_survey_2/handoff.md — 5-component survey report
