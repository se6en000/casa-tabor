# Adversarial Challenge Report — Milestone 1: Historical Corpus Harvester & Semantic Clusterer

**Author**: Challenger 1 (critic, specialist)  
**Target Files Evaluated**:
- `supabase/functions/_shared/email-clusterer.mjs`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`

**Overall Risk Assessment**: **HIGH**  
**Final Verdict**: **REQUEST_CHANGES**

---

## 1. Executive Summary

An adversarial stress test suite (`tests/adversarial-clusterer.test.mjs`, `tests/test-merchant-promo-leakage.mjs`, and `tests/test-pii-obfuscation-deep.mjs`) was developed and executed to empirically challenge the Milestone 1 email harvesting, anonymization, and semantic clustering pipeline.

While the engine exhibits excellent baseline speed (>40,000 emails/sec), zero Executive Action Queue leakage on non-merchant senders, and high resilience against prompt injections and malformed payloads, **two concrete failure modes** were uncovered:
1. **Critical Classifier Short-Circuit**: The Tier 1 deterministic header classifier unconditionally matches vendor names in sender email addresses (`walmart`, `amazon`, `chewy`, `hellofresh`, `blueapron`, `instacart`, `doordash`) and routes them directly to `logistics_parcels` with `0.97` confidence. This completely short-circuits promotional detection, causing **100% of marketing deals, discount coupons, and circulars from these major retailers to be falsely categorized as active parcel logistics**.
2. **PII Obfuscation Gaps**: The PII sanitization engine achieved only **77.1% pass rate (8 leaks across 35 test vectors)** when tested against real-world obfuscations: dot-separated SSNs (`123.45.6789`), dot-separated credit cards (`4111.2222.3333.4444`), international phone numbers (`+44`, `+33`, `+81`), and PO Box addresses (`PO Box 4920`).

---

## 2. Identified Challenges & Failure Modes

### [Critical] Challenge 1: Deterministic Vendor Domain Matching Short-Circuits Promotional Detection

- **Assumption Challenged**: That emails from recognized retailer domains (e.g. `@amazon.com`, `@walmart.com`, `@doordash.com`, `@chewy.com`, `@hellofresh.com`, `@instacart.com`) represent package logistics and grocery deliveries by default.
- **Attack Scenario / Empirical Proof**:
  - `DoorDash <deals@doordash.com>` with subject `"Get $0 delivery fees on your next 3 dinner orders with DashPass!"` and body `"Enjoy unlimited free delivery... promo code ZERO"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `ecommerce_order`).
  - `Amazon Deals <store-news@amazon.com>` with subject `"Save 50% on Echo Dot and Fire TV - Prime Exclusive Sale!"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `ecommerce_order`).
  - `Walmart <savings@walmart.com>` with subject `"Rollbacks on electronics: Up to 40% off this weekend only"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `ecommerce_order`).
  - `Chewy <promotions@chewy.com>` with subject `"Save $20 on your first pet food order + free shipping"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `ecommerce_order`).
  - `Instacart <offers@instacart.com>` with subject `"Save $15 on your grocery order of $50 or more!"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `grocery_delivery`).
  - `HelloFresh <hello@hellofresh.com>` with subject `"Claim 16 Free Meals + 3 Surprise Gifts when you reactivate!"` -> Classified as `logistics_parcels` (Confidence: 0.97, subCategory: `meal_kit`).
- **Root Cause**:
  In `supabase/functions/_shared/email-clusterer.mjs` lines 753–772:
  ```javascript
  // 2. High-Confidence Logistics / Courier Senders
  if (
    /ups\.com|fedex\.com|usps\.com|dhl\.com|inhome|delivery|tracking|shipment|walmart|amazon|chewy|hellofresh|blueapron|instacart|doordash/.test(from) ||
    /\b(tracking number|your order has shipped|package delivered|out for delivery|order confirmation|inhome delivery)\b/.test(analyzedSubject)
  ) {
    ...
    return { archetype: 'logistics_parcels', subCategory: sub, confidence: 0.97, agencyLevel: 0 }
  }
  ```
  Because this rule executes in Tier 1 *before* promotional headers (line 835) and *before* Tier 2 NLP intent scoring, any email from these domains returns `confidence: 0.97 >= 0.90` and halts evaluation immediately.
- **Blast Radius**:
  The Inbound Logistics Manifest and Estate Logistics Radar widgets will be flooded with marketing promotions, discount coupons, and sales digests from household vendors, polluting family delivery timelines with fake packages.
- **Recommended Mitigation**:
  1. Restrict the Tier 1 sender domain check to pure dedicated courier domains (`ups.com`, `fedex.com`, `usps.com`, `dhl.com`).
  2. For retail/grocery/meal-kit merchants (`amazon`, `walmart`, `chewy`, `instacart`, `hellofresh`), require explicit transactional subject tokens (e.g. `order confirmation`, `your order has shipped`, `out for delivery`, `inhome delivery`, `delivered`, `tracking number`) to qualify for the Tier 1 fast path.
  3. Pre-screen for promotional keywords (`% off`, `sale`, `coupon`, `promo code`, `free meals`, `deals`) or `List-Unsubscribe` / `precedence: bulk` headers before short-circuiting to logistics.

---

### [Medium] Challenge 2: PII Sanitization Leakage on Obfuscated & International Formats

- **Assumption Challenged**: That PII in historical emails is formatted exclusively in standard US hyphenated formats.
- **Attack Scenario / Empirical Results**:
  An empirical harness (`tests/test-pii-obfuscation-deep.mjs`) tested 35 distinct sensitive PII patterns across 6 categories:
  - **SSN**: 2/5 redacted (40.0% pass rate). Leaked: dot-separated `123.45.6789`, underscore-separated `123_45_6789`, and unhyphenated labeled `SSN: 123456789`.
  - **Credit Cards**: 5/6 redacted (83.3% pass rate). Leaked: dot-separated `4111.2222.3333.4444`.
  - **Phone Numbers**: 6/9 redacted (66.7% pass rate). Leaked: UK international `+44 20 7946 0919`, France `+33 1 42 68 55 00`, Japan `+81 3 1234 5678`.
  - **Physical Addresses**: 6/7 redacted (85.7% pass rate). Leaked: PO Box format `PO Box 4920, Palm Beach, FL 33480`.
  - **Emails & Credentials**: 8/8 redacted (100% pass rate).
- **Blast Radius**:
  Historical emails containing non-standard SSNs, international travel/contact numbers, PO Box billing addresses, or dot-delimited card numbers will retain raw PII when exported or stored in anonymized benchmark corpora.
- **Recommended Mitigation**:
  1. Broaden SSN regex in `redactEmailPII`:
     `/\b\d{3}[- ._]\d{2}[- ._]\d{4}\b/g` and `/\b(?:SSN|Social Security)\s*[:#-]?\s*(\d{9})\b/gi`.
  2. Broaden Credit Card regex to handle dots:
     `/\b(?:\d[ -.]*?){13,19}\b/g`.
  3. Support international E.164 phone formats:
     `/(?:\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g`.
  4. Add PO Box recognition to address regex:
     `/\b(?:P\.?O\.?\s*Box\s+\d+|Post\s+Office\s+Box\s+\d+)(?:,?\s+[A-Za-z\s]{2,30},?\s+[A-Z]{2}\s+\d{5})?\b/gi`.

---

## 3. Stress Test Results Matrix

| Stress Dimension | Test Suite / Script | Cases Tested | Pass Rate | Leakage Rate | Result |
|---|---|---|---|---|---|
| **Adversarial Matrix (General Senders)** | `tests/adversarial-clusterer.test.mjs` | 500 emails | 100.0% | 0.00% | **PASS** |
| **Vendor Promotional Classification** | `tests/test-merchant-promo-leakage.mjs` | 6 merchants | 0.0% (6/6 misclassified) | 100.0% | **FAIL** |
| **Obfuscated PII Sanitization** | `tests/test-pii-obfuscation-deep.mjs` | 35 vectors | 77.1% (27/35 redacted) | 22.9% | **FAIL** |
| **Adversarial Prompt Injection** | `tests/adversarial-clusterer.test.mjs` | 4 vectors | 100.0% | 0.00% | **PASS** |
| **Header Spoofing & Bulk Conflicts** | `tests/adversarial-clusterer.test.mjs` | 3 vectors | 100.0% | 0.00% | **PASS** |
| **Malformed / Corrupt Payloads** | `tests/adversarial-clusterer.test.mjs` | 13 vectors | 100.0% | 0.00% | **PASS** |
| **Throughput & Backtracking** | `tests/adversarial-clusterer.test.mjs` | 100KB body | 100.0% (<15ms) | 0.00% | **PASS** |

---

## 4. Unchallenged Areas

- **OAuth Live Gmail Token Refresh Flow**: Tested in synthetic/Supabase modes; live Google OAuth token expiry handling was not challenged in live production credentials environment.
- **Multilingual Non-English Email Intent Scoring**: Non-English diacritics and Japanese/French phrases were verified for non-crashing execution, but full semantic taxonomy in foreign languages was out of scope for primary English household corpus.

---

## 5. Conclusion & Next Steps

Milestone 1 has constructed a high-throughput, structurally sound engine with strong anti-escalation guardrails for Executive Actions. However, due to the **100% false classification rate on merchant promotional emails** and the **22.9% PII leakage on non-standard formats**, the deliverable cannot be approved in its current state.

**Action Required**:
The worker agent should implement the targeted fixes in `supabase/functions/_shared/email-clusterer.mjs` for:
1. Disentangling retailer sender matching from courier logistics routing so marketing deals flow to Tier 2 promotional scoring.
2. Expanding the regex patterns for SSNs, international phone numbers, PO Boxes, and dot-separated card numbers.
