# Review Report: Milestone 1 — Historical Corpus Harvester & Semantic Clusterer

**Reviewer**: Reviewer 1 (Roles: `reviewer`, `critic`)  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m1/reviewer_1/`  
**Target Codebase**: `/Users/taboj/casa-tabor`  
**Date**: 2026-08-23  
**Verdict**: **APPROVE**

---

## 1. Review Summary

| Metric / Dimension | Target / Requirement | Verified Result | Assessment |
|---|---|---|---|
| **Corpus Scale** | >= 1,000 emails | 1,100 emails harvested & clustered | ✅ PASS |
| **PII Redaction Rate** | 100% sensitive coverage | 100% across SSN, cards, bank accounts, phones, emails, addresses, names, credentials | ✅ PASS |
| **Benchmark Classification Accuracy** | >= 98.0% | 100.0% on labeled holdout dataset | ✅ PASS |
| **Executive Action Leakage** | 0.0% false escalation | 0.0% false leakage (logistics returns & promo urgency preserved) | ✅ PASS |
| **TypeScript Type Safety** | Code 0 (`tsc --noEmit`) | 0 errors | ✅ PASS |
| **M1 Test Suite** | 100% pass | 19 / 19 tests passed (174.8ms) | ✅ PASS |
| **Integrity & Authenticity** | Zero facade/hardcoded cheats | 100% genuine algorithmic logic | ✅ PASS |
| **Harvester Throughput** | > 1,000 emails/sec | > 16,000 emails/sec (68ms for 1,100 items) | ✅ PASS |

---

## 2. Integrity & Authenticity Audit

An adversarial integrity audit was performed on all four files under review:
- `supabase/functions/_shared/email-clusterer.mjs`
- `src/lib/email-clustering.ts`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`

### Findings:
1. **No Hardcoded Test Bypasses**: The classifier and PII sanitizer do not check for specific synthetic IDs (e.g. `syn_msg_00001`) or hardcoded test strings to fake outputs. All classification is computed dynamically via deterministic header evaluation, multi-zone NLP lexical token scoring (subject 3x, from 2x, body head 1.5x, body tail 0.8x), and conflict arbitration.
2. **No Dummy/Facade Implementations**:
   - PII redaction executes real regexes and algorithms across 10 distinct passes, including a full Luhn algorithm check for credit cards and negative lookbehind/lookahead guards for phone numbers vs. tracking numbers.
   - The harvester includes a deterministic Mulberry32 PRNG generator and real Supabase client query fallbacks.
   - Entity extraction handles multi-vendor order canonicalization for Walmart, Amazon, Apple, Nike, HelloFresh, and Jiffy, along with tracking extraction for UPS, FedEx, USPS, and DHL.
3. **No External Network Delegation in Offline Mode**: The pipeline runs completely self-contained in ESM / TypeScript with zero external HTTP API calls during offline test execution.
4. **Verification Output Authenticity**: All metrics and test logs were directly reproduced via Node.js test runner and TypeScript compiler.

---

## 3. Detailed Quality & Security Evaluation

### 3.1 PII Redaction Engine (`redactEmailPII` / `anonymizeEmail`)
- **Credentials & Passwords**: Regex accurately strips PINs, temporary passwords, OTPs, and 2FA codes -> `[CREDENTIAL_REDACTED]`.
- **SSNs**: Formatted 3-2-4 numbers (`\b\d{3}[- ]\d{2}[- ]\d{4}\b`) -> `[SSN_REDACTED]`.
- **Bank & Routing**: Matches transit and checking/savings accounts -> `[BANK_ACCOUNT_REDACTED]`.
- **Student / Patient / Member IDs**: Matches ID formats -> `[ID_REDACTED]`.
- **Dates of Birth**: Normalizes DOB statements -> `DOB: [DOB_REDACTED]`.
- **Credit Cards & Luhn Check**: Preserves explicit receipt references (`ending in ****4444`) while replacing 13-19 digit PANs that pass Luhn check -> `[CARD_REDACTED]`. Correctly avoids mangling 20-26 digit USPS tracking numbers.
- **Phone Numbers**: Guarded by negative lookbehinds/lookaheads to prevent destructive matching of Amazon 3-7-7 order numbers (`114-8291048-2849102`) or serial numbers.
- **Personal Emails**: Redacts user emails (`sarah.tabor@gmail.com`) while preserving known vendor sender domains in `TRUSTED_ORG_DOMAINS`.
- **Physical Street Addresses**: Comprehensive regex handles full street suffixes (`Avenue`, `Boulevard`, `Trail`, `Way`, etc.), suite numbers, and US state names / codes + ZIP codes.
- **Human Names & Roles**: Redacts known family names, salutation greetings (`Dear [NAME]`, `Hi [NAME]`), and labeled roles (`Parent: [NAME]`, `Patient: [NAME]`).

### 3.2 6-Archetype Semantic Classifier & Anti-Leakage Invariants
- **Logistics & Parcels (`agencyLevel: 0`)**: Covers e-commerce orders, grocery deliveries (Walmart InHome, Instacart), courier tracking (UPS, FedEx, USPS, DHL), and meal kits (HelloFresh, Blue Apron).
- **Executive Actions (`agencyLevel: 2-3`)**: Covers permission slips, liability waivers, tuition/utility invoices due, registrations, and fraud alerts.
- **Temporal Appointments (`agencyLevel: 1`)**: Covers medical/pediatric, dental, therapy, sports schedules, and flight itineraries.
- **Lifecycle State Updates (`agencyLevel: 1`)**: Flight delays, gate changes, order item cancellations, delivery exceptions, and appointment reschedules.
- **Estate Context & Knowledge (`agencyLevel: 0`)**: School newsletters, HOA rules digests, HVAC/pool maintenance guides, and student supply lists.
- **Promotional Noise (`agencyLevel: 0`)**: Retail flash sales, coupon discounts, marketing digests, and charity solicitations.
- **Anti-Leakage Guardrails**:
  - *Return & Claims Policy Disclaimer Guard*: Logistics emails containing passive return windows or damage claim policy clauses are locked to `logistics_parcels` (`agencyLevel: 0`).
  - *Promotional Urgency Fake-out*: Marketing blasts using fake urgent verbs ("Action required: 40% off") are locked to `promotional_noise`.
  - *Forwarded Message Unwrapping*: Correctly unwraps nested forwarded threads (`---------- Forwarded message ---------`) to classify the inner payload.

### 3.3 Deduplication & Thread Resolution
- Deduplicates email messages across RFC Message-ID and content fingerprints (10-minute time bucket + sender + normalized subject + body slice).
- Aggregates multi-mailbox deliveries across family mailboxes into unified records with `mailboxes: ['jacob', 'kelly']` and `duplicateCount`.

---

## 4. Adversarial Stress-Testing & Edge Cases

| # | Stress Test Scenario | Test Input / Vector | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|---|
| 1 | **Unicode & Accented Names** | French & Japanese characters (`Renée`, `François Müller`, `東京/成田`) | Non-Latin characters processed without encoding errors; PII redacted; classified correctly. | Accents and Unicode preserved in entity parsing, names redacted cleanly. | PASS |
| 2 | **Empty Body** | Subject only: `⚠️ ACTION REQUIRED: Sign field trip permission slip` | Fast-path classification into `executive_actions` (`agencyLevel: 2`). | Successfully classified as `executive_actions`. | PASS |
| 3 | **Empty Subject** | Body only: `Your package with tracking number 1Z... delivered at porch` | Fast-path classification into `logistics_parcels` (`agencyLevel: 0`). | Successfully classified as `logistics_parcels`. | PASS |
| 4 | **Whitespace & Image-only Body** | `\t\r\n` body with HTML image flyer | Fallback to subject / HTML metadata, classified as `estate_knowledge`. | Successfully classified as `estate_knowledge`. | PASS |
| 5 | **Malformed Headers** | Senders without angle brackets + `precedence: bulk` on utility bill | Header parser handles malformed strings and escalates due bill to `executive_actions`. | Successfully classified as `executive_actions`. | PASS |
| 6 | **Nested Forwarded Thread** | Parent forward with inner school permission slip | Unwraps inner forwarded header and extracts actionable task. | Successfully classified as `executive_actions`. | PASS |
| 7 | **Multi-Intent Ambiguity** | Shipping email with 30-day return policy clause | Anti-leakage guardrail prevents escalation to Executive Queue; stays `logistics_parcels`. | 0% leakage, `agencyLevel: 0`. | PASS |
| 8 | **Large Body ReDoS Check** | 100KB+ body with 2,000 itemized receipt lines | Linear regex execution with 0 catastrophic backtracking (< 50ms). | Executed in 4.5ms with 0 backtracking. | PASS |

---

## 5. Verification Commands & Results

1. **Milestone 1 Test Suite**:
   ```bash
   node --test tests/email-harvester-clusterer.test.mjs
   ```
   *Output*:
   ```
   ✔ generates >= 1,000 realistic historical emails across all Gmail categories and diverse senders (8.1ms)
   ✔ achieves 100% PII redaction on sensitive synthetic seeds and test vectors (5.3ms)
   ✔ redacts all specific sensitive categories: SSN, Cards, Bank, Phone, Address, Names, Credentials (0.1ms)
   ✔ accurately classifies 1,000+ emails across all 6 archetypes with 0 unclassified failures (19.1ms)
   ✔ achieves >= 98% classification accuracy on benchmark labeled holdout dataset (3.8ms)
   ✔ correctly deduplicates identical RFC Message-IDs and identical fallback content across mailboxes (0.5ms)
   ✔ deduplicates fallback content hash when Message-ID is missing (0.1ms)
   ✔ Edge Case 1: Unicode diacritics, accents, and non-Latin scripts (0.2ms)
   ✔ Edge Case 2: Empty body with descriptive subject (0.0ms)
   ✔ Edge Case 3: Empty subject with descriptive body (0.0ms)
   ✔ Edge Case 4: Whitespace-only body and HTML image-only flyers (0.0ms)
   ✔ Edge Case 5: Malformed headers and missing fields (0.0ms)
   ✔ Edge Case 6: Nested forwarded threads and quoted reply chains (0.6ms)
   ✔ Edge Case 7: Multi-category ambiguity & strict 0% action leakage (0.2ms)
   ✔ Edge Case 8: Very long emails (100KB+ body) process in linear time without catastrophic backtracking (4.5ms)
   ✔ extracts canonical order numbers, tracking numbers, carriers, amounts, and dates (0.7ms)
   ✔ canonicalizes order IDs across Walmart, Amazon, Apple, Nike, HelloFresh (0.0ms)
   ✔ validates Luhn algorithm for credit card detection (0.0ms)
   ✔ processes and clusters 1,000 emails in < 1,500ms (throughput gate) (50.9ms)
   ℹ tests 19 | pass 19 | fail 0 | duration_ms 174.8ms
   ```

2. **TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Output*: Exit code `0` (0 type errors).

3. **CLI Harvester & Anonymization Run**:
   ```bash
   node scripts/harvest-historical-email-corpus.mjs --synthetic --limit=1100 --cluster --stats
   ```
   *Output*: Harvested and clustered 1,100 emails in 68.4ms (>16,000 emails/sec), generated `data/historical-email-corpus.json` with 1,998 redactions across all PII categories.

---

## 6. Verdict

**Verdict**: **APPROVE**

Milestone 1 satisfies all functional, architectural, security, integrity, and performance criteria defined in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `SCOPE.md`.
