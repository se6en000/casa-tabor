# Synthesis: Milestone 1 Exploration

## Explorer Findings Summary

### Explorer 1 (Codebase Architecture)
- Environment: Node v24 ESM (`"type": "module"`), Deno for Supabase Edge Functions.
- Existing data: Supabase has 2,247 inbox emails, 2,348 processed messages with OAuth refresh tokens in `family_mailboxes`.
- Shared code location: `supabase/functions/_shared/email-clusterer.mjs` (portable ESM) + `src/lib/email-clustering.ts` (TS export).
- CLI Harvester: `scripts/harvest-historical-email-corpus.mjs` supports `--source=supabase|gmail|synthetic`, `--limit=1000`, `--out=...`, `--anonymize`, `--cluster`.
- Tests: `node --test tests/email-harvester-clusterer.test.mjs`.

### Explorer 2 (Clustering Algorithm & PII Redaction)
- Multi-pass PII Redactor:
  - Redacts full names, 10/11-digit phone numbers, personal email addresses, physical street addresses/ZIPs, credit card numbers (Luhn/13-19 digits), bank routing/account numbers, SSNs, and passwords/tokens.
  - Retains non-sensitive tracking numbers/order codes with format masking (e.g. `[TRACKING: 1Z...MASKED]`), merchant names, and relative temporal dates.
- 6 Core Semantic Archetypes:
  1. `Logistics & Parcels` (e-commerce, groceries, couriers, meal kits)
  2. `Executive Action Tasks` (permission slips, waivers, bills/invoices, registrations)
  3. `Temporal Appointments` (doctor, school, travel, sports)
  4. `Lifecycle State Updates` (flight schedule changes, order edits, delivery delays)
  5. `Estate Context & Knowledge` (newsletters, HOA, maintenance)
  6. `Promotional Noise` (marketing, sales, automated digests)
- Hybrid 4-tier Classification:
  - Level 1: Strong sender domain & Gmail label heuristic routing
  - Level 2: Strict intent verbs & structural token matching (Action vs Status vs Logistics)
  - Level 3: Multi-feature Bayesian / TF-IDF keyword & header scoring
  - Level 4: Confidence scoring & fallback guardrails (0% false escalation to Executive Action Tasks)
- Entity Extractor: merchant/organization name, temporal anchor dates, masked tracking numbers, action URLs, monetary amounts.

### Explorer 3 (Corpus Generation & Testing Methodology)
- 1,000+ Realistic Synthetic Corpus Generator:
  - 6 archetypes represented across realistic proportions (Logistics ~25%, Executive ~15%, Temporal ~15%, Lifecycle ~10%, Estate ~10%, Promotional ~25%).
  - Real-world senders across Primary, Updates, Promotions categories.
- 8-Class Edge Case Taxonomy:
  1. Empty snippet and empty body
  2. Malformed / missing headers
  3. Extreme PII density (multiple cards, SSNs, addresses in single email)
  4. Zero PII baseline
  5. Nested forwarded / reply chains
  6. Multilingual / Unicode characters & emoji subjects
  7. Ambiguous multi-category boundary emails (e.g. promotional discount mentioning an upcoming flight)
  8. Very long email bodies (100KB+)
- Test Assertions:
  - 100% PII redaction rate on sensitive synthetic seeds
  - Classification accuracy >= 98% on benchmark labeled corpus
  - Deduplication resilience across identical IDs and message bodies
  - Performance: >= 1,000 emails processed and clustered in < 3 seconds

## Consensus Implementation Blueprint
- Core Clustering & PII Engine: `supabase/functions/_shared/email-clusterer.mjs`
- Frontend/TS Bridge: `src/lib/email-clustering.ts`
- Corpus Harvester Script: `scripts/harvest-historical-email-corpus.mjs`
- Test Suite: `tests/email-harvester-clusterer.test.mjs`
