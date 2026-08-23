# BRIEFING — 2026-08-23T12:20:35Z

## Mission
Investigate and design the Compound Decomposer subsystem for Milestone 4 (multi-intent emails, newsletters, PDF attachments, action & temporal decomposition, date anchoring, sibling linkages, and client inspection synthesis).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, analyzer, architect
- Working directory: /Users/taboj/casa-tabor/.agents/explorer_m4_1/
- Original parent: 8fd0d06f-0af7-44cc-831f-e6584f49ca87
- Milestone: M4

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly follow the 5-component handoff report protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method)
- Adhere to PROJECT.md and sub_orch_m4/SCOPE.md write boundaries and contracts

## Current Parent
- Conversation ID: 8fd0d06f-0af7-44cc-831f-e6584f49ca87
- Updated: 2026-08-23T12:20:35Z

## Investigation State
- **Explored paths**:
  - `supabase/functions/scan-gmail-inbox/index.ts` (email scanning, attachment extraction, prompt structure, intent parsing, prep_items insertion, sibling clustering)
  - `supabase/functions/_shared/` (`email-clusterer.mjs`, `canonical-order-resolver.mjs`, `family-email-evidence.mjs`, `gmail-canonical-email.mjs`, `gmail-message-content.mjs`)
  - `src/utils/` (`actionInspectionSynthesis.ts`, `needsYouFeed.ts`, `vendorTransactions.ts`, `calendarEventMatcher.ts`)
  - `src/hooks/` (`useCreateSuggestedEvent.ts`, `usePrepItems.ts`, `useHouseholdCaptureRules.ts`)
  - `src/components/canvas/widgets/` (`ActionInspectionSidecar.tsx`, `ActionQueueWidget.tsx`)
  - `tests/` (`e2e-email-intelligence-tiers.test.mjs`, `tests/fixtures/email-benchmark.json`)
- **Key findings**:
  - Existing `scan-gmail-inbox/index.ts` has preliminary single-pass extraction, but decomposition is coupled and lacks isolated testability and deterministic offline execution.
  - Sibling clustering operates on `cluster_id` and `source_ref` (`gmail:<member_id>:<msg_id>`).
  - Client sidecar dynamically aggregates siblings into `SuggestedActionBundle` allowing 1-tap bulk approval or individual toggles.
  - Date anchoring requires resolving relative date strings strictly relative to the email sent date (`sourceEmailDate`), with timezone safety preventing EDT midnight roll-off.
- **Unexplored areas**: None for M4 Compound Decomposer scope.

## Key Decisions Made
- Designed `supabase/functions/_shared/compound-decomposer.mjs` as a pure ESM module exportable to both edge functions and offline test harnesses.
- Specified contracts for `DecomposedActionItem` and `CompoundDecompositionResult`.
- Detailed deterministic regex/NLP decomposition heuristics + LLM prompt schema construction for edge function runtime.
- Specified client-side inspection enhancements in `src/utils/actionInspectionSynthesis.ts` to seamlessly synthesize multi-action bundles from sibling records.

## Artifact Index
- `/Users/taboj/casa-tabor/.agents/explorer_m4_1/DISPATCH.md` — Inbound instruction record
- `/Users/taboj/casa-tabor/.agents/explorer_m4_1/progress.md` — Liveness & heartbeat
- `/Users/taboj/casa-tabor/.agents/explorer_m4_1/BRIEFING.md` — Situational awareness
- `/Users/taboj/casa-tabor/.agents/explorer_m4_1/handoff.md` — Complete 5-component handoff report
