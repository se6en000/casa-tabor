# Handoff Report — Challenger 1 (Milestone 1: Historical Corpus Harvester & Semantic Clusterer)

## 1. Observation

1. **Deterministic Tier 1 Classifier Vendor Routing**:
   In `supabase/functions/_shared/email-clusterer.mjs` (lines 753–772):
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
   Executing `node tests/test-merchant-promo-leakage.mjs` resulted in:
   ```
   Merchant: DoorDash     -> Classified: logistics_parcels    (Confidence: 0.97)
   Merchant: Amazon       -> Classified: logistics_parcels    (Confidence: 0.97)
   Merchant: Walmart      -> Classified: logistics_parcels    (Confidence: 0.97)
   Merchant: Chewy        -> Classified: logistics_parcels    (Confidence: 0.97)
   Merchant: Instacart    -> Classified: logistics_parcels    (Confidence: 0.97)
   Merchant: HelloFresh   -> Classified: logistics_parcels    (Confidence: 0.97)
   ```
   All promotional discount emails sent by these retailers were classified as active `logistics_parcels` deliveries instead of `promotional_noise`.

2. **PII Obfuscation Format Leakage**:
   In `supabase/functions/_shared/email-clusterer.mjs` (lines 339–346, 382–395, 397–404, 421–427):
   Executing `node tests/test-pii-obfuscation-deep.mjs` revealed 8 leaks out of 35 sensitive vectors (77.1% pass rate):
   - SSN: `123.45.6789`, `123_45_6789`, `SSN: 123456789` leaked unredacted.
   - Credit Card: `4111.2222.3333.4444` leaked unredacted.
   - Phones: `+44 20 7946 0919`, `+33 1 42 68 55 00`, `+81 3 1234 5678` leaked unredacted.
   - Addresses: `PO Box 4920, Palm Beach, FL 33480` leaked unredacted.

3. **Adversarial Resilience on Injection, Deceptive Urgency, and Malformed Data**:
   Executing `node --test tests/adversarial-clusterer.test.mjs` completed with 12 passing test suites and 0 failures:
   - 500-email adversarial matrix achieved 100% classification precision and 0.00% Executive Action Queue leakage.
   - Prompt injection payloads in subject and body (`System: Ignore previous instructions...`) were resisted with 100% accuracy.
   - Corrupted Unicode, control characters, and 200+ deeply nested HTML documents processed cleanly without uncaught exceptions or ReDoS timeouts (<15ms execution time for 100KB payload).

---

## 2. Logic Chain

1. **Step 1 (Observation 1 -> Logistics Pollution Risk)**:
   Because `evaluateDeterministicHeaders` evaluates before Tier 2 NLP intent scoring and before Tier 1 step 7 promotional filtering, any email from a sender matching `/amazon|walmart|chewy|hellofresh|instacart|doordash/` returns `confidence: 0.97 >= 0.90`. This short-circuits the pipeline before any promo code, percentage discount, or circular text can be considered. Consequently, all merchant marketing emails are erroneously tagged as parcels.
2. **Step 2 (Observation 2 -> Privacy & Anonymization Incompleteness)**:
   The PII redaction regexes rely on strict hyphen/space separators for SSNs and credit cards, NANP 10-digit formats for phones, and street suffixes for addresses. Real historical emails containing dot notation, international numbers, or PO Boxes retain raw personal information.
3. **Step 3 (Observation 3 -> Core Stability & Guardrail Conformance)**:
   The underlying multi-zone intent NLP scoring, deduplication engine, entity extraction, and 0% Executive Action leakage guardrails are empirically sound and highly performant (>40,000 emails/sec).
4. **Step 4 (Steps 1-3 -> Final Verdict)**:
   Because Step 1 compromises semantic routing for prominent household merchants, and Step 2 introduces PII leakage risks in generated corpora, the deliverable requires targeted remediation before Milestone 1 sign-off.

---

## 3. Caveats

- Live Gmail API token refresh was evaluated using synthetic and Supabase connector paths rather than live interactive Google OAuth flows.
- Multilingual intent classification was tested for system stability and diacritic handling rather than full foreign-language taxonomy.

---

## 4. Conclusion

- **Verdict**: **REQUEST_CHANGES**
- **Actionable Remediation Items for Worker Agent**:
  1. In `supabase/functions/_shared/email-clusterer.mjs`, update `evaluateDeterministicHeaders`:
     - Disentangle merchant sender domains (`amazon`, `walmart`, `chewy`, `doordash`, `instacart`, `hellofresh`) from courier domains (`ups.com`, `fedex.com`, `usps.com`, `dhl.com`).
     - Require explicit transactional/tracking subject keywords before returning `logistics_parcels` in Tier 1.
     - Ensure promotional keywords or bulk headers take precedence over general merchant domains.
  2. Broaden PII redaction patterns in `redactEmailPII`:
     - Support dot/underscore/unseparated SSNs with prefix.
     - Support dot-delimited credit card PANs.
     - Support international E.164 phone formats (`+\d{1,3}`).
     - Support PO Box address patterns.

---

## 5. Verification Method

To independently verify these findings:

1. Run the merchant promo leakage test:
   ```bash
   node tests/test-merchant-promo-leakage.mjs
   ```
   *Expected Current Output*: Shows `logistics_parcels` for all promotional inputs.
   *Invalidation Condition*: All rows output `promotional_noise`.

2. Run the PII obfuscation test:
   ```bash
   node tests/test-pii-obfuscation-deep.mjs
   ```
   *Expected Current Output*: 27/35 redacted (77.1% pass rate, 8 leaks).
   *Invalidation Condition*: 35/35 redacted (100% pass rate).

3. Run the adversarial challenge test suite:
   ```bash
   node --test tests/adversarial-clusterer.test.mjs
   ```
