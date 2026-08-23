# Adversarial Empirical Challenge Report — Milestone 1
**Author**: Challenger 2 (Empirical Challenger)  
**Date**: 2026-08-23  
**Target Files**:
- `supabase/functions/_shared/email-clusterer.mjs`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`
- `tests/email-clusterer-stress.test.mjs` (Challenge Test Suite)

---

## 1. Executive Summary & Verdict

### **Verdict: REQUEST_CHANGES**

While the historical harvesting pipeline and clustering engine demonstrate exceptional scale throughput (20,800+ emails/sec, <0.05ms latency, <10MB heap delta on 3,000 emails) and 100% deduplication precision/recall, empirical stress testing uncovered **two critical safety/accuracy defects** and **one robustness vulnerability** that violate acceptance criteria:

1. **CRITICAL PII LEAKAGE IN CLUSTERED DATA STRUCTURE (`email.snippet` & `email.to`)**:
   `clusterEmailCorpus()` redacts `subject` and `bodyText` when `anonymize: true`, but leaves `snippet` and `to` verbatim. Clustered output stored to disk (`data/historical-email-corpus.json`) or sent to downstream consumers leaks unredacted human names, personal email addresses, and physical street addresses.
2. **PAST-DUE UTILITY BILL ACTION ESCAPEMENT (`executive_actions` -> `lifecycle_updates`)**:
   In `evaluateDeterministicHeaders()`, utility past-due billing notices containing standard disclaimer language ("pay now to avoid disruption of service") match the outage rule (`/\b(outage|service restored|grid maintenance|disruption)\b/`) before the billing rule is evaluated. This misclassifies urgent past-due utility bills (`agencyLevel: 2`) as passive outage notifications (`agencyLevel: 0`), resulting in an overall accuracy of **97.25%** (below the **>= 98.0%** threshold in §R5/Acceptance Criteria).
3. **SHALLOW FORWARD HEADER UNWRAPPING ON MULTI-HOP THREADS**:
   `evaluateDeterministicHeaders()` utilizes `fullText.indexOf('---------- forwarded message ---------')` which matches only the outermost forward header, leaving inner forward boilerplate intact. When forward padding pushes the core body past the 800-character `zoneBodyHead` window in `scoreArchetypesNLP()`, generic subject tokens dominate classification.

---

## 2. Empirical Benchmark Metrics

### A. Scale & Throughput Harness (3,000 Emails)
| Metric | Observed Value | Threshold Gate | Status |
|---|---|---|---|
| **Corpus Generation** | 11.27 ms | < 500 ms | **PASS** |
| **Clustering Execution Time** | 144.10 ms | < 1,500 ms | **PASS** |
| **Throughput** | **20,818 emails/sec** | >= 500 emails/sec | **PASS** |
| **Average Latency** | **0.048 ms/email** | < 2.5 ms/email | **PASS** |
| **Heap Memory Delta** | **9.36 MB** | < 120 MB | **PASS** |
| **RSS Memory Delta** | **34.77 MB** | < 200 MB | **PASS** |
| **Deduplication Rate** | 100% unique stream (3,000 items) | Linear complexity | **PASS** |
| **Total Sensitive PII Redactions** | 5,697 tokens | Accurate identification | **PASS** |

### B. 6-Archetype Distribution & 6x6 Confusion Matrix (1,200 Gold Standard Cases)
- **Dataset**: Exactly 200 curated, balanced samples per archetype (1,200 total) across realistic variants.
- **Overall Accuracy**: **97.25%** (1,167 / 1,200 correct) — *Target: >= 98.0%*
- **Macro-Averaged Precision**: 97.64%
- **Macro-Averaged Recall**: 97.25%
- **Macro-Averaged F1 Score**: 97.23%
- **Executive Action False Escalations (Leakage)**: **0 (0.00% false leakage)**

#### 6x6 Confusion Matrix (Rows = Ground Truth, Columns = Predicted):
```
Actual \ Predicted         | LOG_PARC | EXEC_ACT | TEMP_APP | LIFE_UPD | EST_KNOW | PROM_NOI |
---------------------------+----------+----------+----------+----------+----------+----------+
logistics_parcels         |      200 |        0 |        0 |        0 |        0 |        0 |
executive_actions         |        0 |      167 |        0 |       33 |        0 |        0 |
temporal_appointments     |        0 |        0 |      200 |        0 |        0 |        0 |
lifecycle_updates         |        0 |        0 |        0 |      200 |        0 |        0 |
estate_knowledge          |        0 |        0 |        0 |        0 |      200 |        0 |
promotional_noise         |        0 |        0 |        0 |        0 |        0 |      200 |
```

#### Per-Archetype Performance Breakdown:
| Archetype | True Pos | False Pos | False Neg | Precision | Recall | F1 Score |
|---|---|---|---|---|---|---|
| `logistics_parcels` | 200 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `executive_actions` | 167 | 0 | 33 | 100.0% | **83.5%** | **91.0%** |
| `temporal_appointments` | 200 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `lifecycle_updates` | 200 | 33 | 0 | **85.8%** | 100.0% | **92.4%** |
| `estate_knowledge` | 200 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| `promotional_noise` | 200 | 0 | 0 | 100.0% | 100.0% | 100.0% |

### C. Deduplication Integrity Harness (450 Multi-Mailbox Stream)
- **Total Stream Emails**: 450
- **Expected Canonical Messages**: 230
- **Actual Canonical Messages**: 230
- **Execution Time**: 0.57 ms
- **Deduplication Rate**: 48.9%
- **Deduplication Precision**: **100.0%** (0 false merges of non-duplicate messages)
- **Deduplication Recall**: **100.0%** (0 missed duplicates across RFC IDs and 10m content buckets)
- **Multi-Mailbox Ownership Preservation**: 100% (All 50 multi-mailbox groups preserved `mailboxes: ['jacob', 'kelly', 'grandma', 'michael']` with `duplicateCount: 4`).

---

## 3. Specific Vulnerabilities & Failure Mode Analysis

### Finding 1: Un-anonymized `snippet` and `to` Fields in Clustered Data Objects
- **Severity**: **CRITICAL**
- **Location**: `supabase/functions/_shared/email-clusterer.mjs:1123-1130`
- **Observed Behavior**:
  ```javascript
  // Current implementation:
  const anonymized = anonymizeEmail(email)
  emailToClassify = {
    ...email,
    subject: anonymized.anonymizedSubject,
    bodyText: anonymized.anonymizedText,
  }
  ```
  `...email` spreads the unredacted `snippet` (e.g. `"Delivering to Sarah Tabor at 123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480"`) and unredacted `to` array (e.g. `["Sarah Tabor <sarah.tabor@gmail.com>"]`).
- **Blast Radius**: PII leaks directly into `data/historical-email-corpus.json` and any downstream edge function or storage reading `clusterEmailCorpus()` outputs.
- **Required Fix**:
  In `email-clusterer.mjs`, ensure `snippet` is sanitized using `redactEmailPII(email.snippet)` (or derived from `anonymizedText.slice(0, 140)`), and `to` array elements have their display names/personal emails sanitized or redacted.

### Finding 2: Utility Past-Due Bills Misclassified as Outages Due to "Disruption" Collision
- **Severity**: **HIGH**
- **Location**: `supabase/functions/_shared/email-clusterer.mjs:822-828`
- **Observed Behavior**:
  ```javascript
  if (/fpl\.com|pbcwater\.org|chase\.com|americanexpress\.com/.test(from)) {
    if (/\b(outage|service restored|grid maintenance|disruption)\b/.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0 }
    }
    if (/\b(bill is ready|statement available|payment due|balance due|past due|amount due|bill due|pay by)\b/.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'bill_invoice_due', confidence: 0.97, agencyLevel: 2 }
    }
  }
  ```
  When FPL sends:
  *"Your electric bill is past due. Amount due: $218.45. Pay now at https://fpl.com/pay to avoid disruption."*
  `disruption` triggers the outage rule first, causing the bill to be labeled `utility_service_outage` with `agencyLevel: 0`.
- **Blast Radius**: 33 out of 200 executive action samples (16.5% of executive action test set) are misrouted, dropping overall classification accuracy to 97.25% and evading the household action queue.
- **Required Fix**:
  Check billing keywords *prior* to outage keywords, or refine the outage regex to require explicit power/water outage phrasing (e.g. `/\b(power outage|service outage|blackout|grid maintenance|outage alert)\b/` and NOT match generic "avoid disruption").

### Finding 3: Multi-Hop Forward Message Header Stripping
- **Severity**: **MEDIUM**
- **Location**: `supabase/functions/_shared/email-clusterer.mjs:734-738`
- **Observed Behavior**:
  `fullText.indexOf('---------- forwarded message ---------')` grabs only the first index. When emails are forwarded multiple times (`Fwd: Fwd: ...`), repeated forward headers fill the first 800 bytes (`zoneBodyHead`), starving the intent scorer.
- **Required Fix**:
  Use `lastIndexOf` or strip all preceding forwarded message headers up to the innermost body, and strip `^(?:fwd|re):\s*` from the subject before evaluating NLP zones.

---

## 4. Required Action Items for Milestone 1 Worker

1. **Fix PII Sanitization in `clusterEmailCorpus`**:
   Ensure `emailToClassify.snippet = anonymized.anonymizedText.slice(0, 140)` and redact names/emails in `emailToClassify.to`.
2. **Fix Utility Outage vs Billing Rule Priority**:
   Reorder utility checks in `evaluateDeterministicHeaders` so billing/statement keywords take priority over operational outage keywords, or qualify `disruption` to require `power disruption` / `outage`.
3. **Enhance Forward Message Unwrapping**:
   Update `evaluateDeterministicHeaders` and NLP preprocessing to strip all nested forwarded header blocks down to the original message content.
4. **Re-run Test Suites**:
   Verify `node --test tests/email-harvester-clusterer.test.mjs` and `node --test tests/email-clusterer-stress.test.mjs` achieve **100% pass**, **>= 99.0% accuracy on the 1,200 sample confusion matrix**, and **0 PII leakage warnings**.
