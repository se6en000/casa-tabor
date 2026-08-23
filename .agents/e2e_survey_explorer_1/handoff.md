# Handoff Report — Codebase Survey for Autonomous Household Email Intelligence E2E Testing

**Author**: Codebase Explorer 1  
**Timestamp**: 2026-08-23T11:48:20Z  
**Type**: Hard Handoff  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/`

---

## 1. Observation

1. **Project & Test Runner Configuration**:
   - `package.json:5`: `"type": "module"`
   - `package.json:9`: `"test": "node --test tests/*.test.mjs"`
   - Node runtime: `v24.13.0`
   - Verified that running `node --test tests/gmail-*.test.mjs` ran 39 test cases across 8 suites in 644ms, passing 100% with zero failures.

2. **Core Backend Email Intelligence Modules**:
   - `supabase/functions/scan-gmail-inbox/index.ts`: 1,716 lines; handles dual-pass fetching, keyword gating (`CALENDAR_KEYWORDS`, `ACTION_KEYWORDS`), learned capture rules (`household_capture_rules`), LLM classification, attachment extraction via Gemini multimodal, suggestion persistence via `persistEventSuggestions`, action persistence via `persistInboxActions`, knowledge claim persistence via `persistEmailKnowledgeClaims`, and evidence indexing via `persistFamilyEmailEvidence`.
   - `supabase/functions/scan-travel-emails/index.ts`: 1,323 lines; dedicated flight, hotel, and car rental extraction into `trips` and `trip_legs`.
   - `supabase/functions/_shared/gmail-canonical-email.mjs`: defines `canonicalEmailKey` using RFC Message-ID (`rfc:...`) with SHA-256 fallback (`fallback:...`), `normalizeInternetMessageId`, and `canonicalContentFingerprint`.
   - `supabase/functions/_shared/gmail-message-content.mjs`: defines `extractGmailMessageContent` for multipart body extraction, attachment metadata, and sanitization.
   - `supabase/functions/_shared/family-email-evidence.mjs`: defines `classifyFamilyEvidenceCandidate`, `redactFamilyEvidenceText` (redacts Student IDs, PINs, card numbers), and `chunkFamilyEvidenceText`.
   - `supabase/functions/_shared/assistant-email-knowledge-read.mjs`: defines `formatFamilyKnowledgeContext`.
   - `supabase/functions/_shared/immediate-family-scope.mjs`: defines family scoping utilities.

3. **Core Frontend & Domain Utilities**:
   - `src/utils/actionInspectionSynthesis.ts`: defines `detectSuggestedEvent`, `detectSuggestedActionBundle`, `synthesizeActionAnalysis`, `extractSmartActionTitle`, `extractAmount`, `parseDateSafe`.
   - `src/utils/vendorTransactions.ts`: defines `buildDeliveryTransitItem`, `consolidateTransitItems`, `isDeliveryTransitItem`, `orderId`, `canonicalizeOrderId`, `inferDeliveryStage`.
   - `src/utils/needsYouFeed.ts`: defines `splitActionableAndTransitItems`, `mergeNeedsYouItems`.
   - `src/utils/prepCategories.ts`: defines 9-category taxonomy (`PREP_CATEGORIES`, `PREP_FILTERS`, `PREP_SOURCE_FILTERS`).
   - `src/types/index.ts`: defines `PrepItem`, `PrepItemCategory`, `DeliveryTransitItem`, `DeliveryTransitStage`, `SuggestedEventPlan`, `SuggestedActionBundle`, `ActionAnalysis`.

4. **Database Schemas & Migrations**:
   - `supabase/migrations/20260807180000_canonical_inbox_email_knowledge.sql`: creates `canonical_inbox_emails` and `family_knowledge_claims`.
   - `supabase/migrations/20260816020000_household_capture_rules.sql`: creates `household_capture_rules`.
   - `supabase/migrations/20260822080000_gmail_attachments_and_document_summaries.sql`: adds `attachments JSONB`, `extracted_document_summary TEXT`, and `source_origin TEXT`.

---

## 2. Logic Chain

1. From **Observation 1**, the repository uses Node's native ESM test runner (`node:test`, `node:assert/strict`) on Node v24.13.0, which supports direct loading and execution of `.mjs` and TypeScript `.ts` modules without a build step.
2. From **Observation 2 & 3**, all key operations across the four tiers of email intelligence are encapsulated in clean, pure functions in `supabase/functions/_shared/` and `src/utils/`, while backend edge function logic in `supabase/functions/scan-gmail-inbox/index.ts` adheres to strict structural and behavioral contracts.
3. Therefore, an opaque-box E2E test in `tests/e2e-email-intelligence-tiers.test.mjs` can directly import these modules, feed representative email fixtures (school letters with PDF attachments, appointments, multi-stage delivery updates, bills/payments, travel confirmations), execute the full pipeline across all 4 tiers, and assert the resulting data models deterministically.

---

## 3. Caveats

- Live network calls to external Google Gmail API or live Gemini LLM APIs are not invoked during standard unit/e2e tests in `tests/*.test.mjs`; instead, the test suite uses realistic structured payload fixtures (matching Google API formats) and verifies the deterministic parsing, deduplication, categorization, extraction, and synthesis logic.
- No other caveats.

---

## 4. Conclusion

The Autonomous Household Email Intelligence System is fully surveyed, and a concrete blueprint for `tests/e2e-email-intelligence-tiers.test.mjs` has been drafted and documented in `codebase_report.md`. The test runner setup is verified, fast, and ready for full E2E tier implementation.

---

## 5. Verification Method

To independently verify these findings:
1. Run all Gmail tests:
   ```bash
   node --test tests/gmail-*.test.mjs
   ```
2. Verify that Node is `>= v24`:
   ```bash
   node -v
   ```
3. Inspect the detailed report:
   ```bash
   cat .agents/e2e_survey_explorer_1/codebase_report.md
   ```
