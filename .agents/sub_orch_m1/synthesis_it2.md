# Synthesis: Milestone 1 Iteration 2 Exploration

## Root Cause & Remediation Strategy

### 1. PII Redaction Regex & Corpus Zero-Leakage (Explorer 1)
- **SSN**: Added support for dot (`123.45.6789`), underscore (`123_45_6789`), space (`123 45 6789`), and unhyphenated 9-digit SSNs preceded by label.
- **Credit Cards**: Extended regex to handle dot-separated cards (`4532.1234.5678.9010`) and space-separated cards with Luhn check, preserving Amazon (`111-2222222-3333333`) and Walmart (`2000123-12345678`) order ID formats.
- **International Phones**: Added E.164 pattern handling `+44 7911 123456`, `+33 1 42 68 55 00`, `+81 3 1234 5678`, and `+1-555-123-4567`.
- **PO Boxes**: Added dedicated regex for `P.O. Box 123`, `PO Box 45678`, `Post Office Box 4920`.
- **Corpus Zero-Leakage**: Updated `clusterEmailCorpus` and `anonymizeEmail` to sanitize `email.snippet`, `email.to`, and `email.from` so that no raw family names or PII leak into `data/historical-email-corpus.json`.

### 2. Classification Precedence & Retailer Promotional Overlap (Explorer 2)
- Separated pure couriers (`ups.com`, `fedex.com`, `usps.com`, `dhl.com`) from hybrid retailers (`amazon.com`, `walmart.com`, `target.com`, `chewy.com`, `doordash.com`, `instacart.com`, `hellofresh.com`).
- Retail domains are now pre-screened for promotional keywords/headers (`% off`, `sale`, `deals`, `coupon`, `promo`, `limited time`, `save $`, `clearance`, `List-Unsubscribe`). If promotional tokens are detected, route to `promotional_noise` (confidence 0.98).
- Hybrid retailers only route to `logistics_parcels` if explicit transactional tokens are present (`order confirmation`, `your order has shipped`, `out for delivery`, `package delivered`, `order #`).
- Multi-hop forwarded headers are properly unwrapped with `lastIndexOf` / regex stripping so body text is not pushed out of the classification window.

### 3. Utility Past-Due / Disconnection vs Outage Hierarchy (Explorer 3)
- Inverted utility evaluation order: Fraud Alerts -> Billing/Past-Due/Disconnection (`executive_actions` / `action_bill_payment`) -> Outage (`lifecycle_updates` / `utility_service_outage`) -> Info Guides.
- Outage regex refined to avoid matching "pay now to avoid disruption of service" notices.

### 4. Comprehensive Validation Plan
- Run all 3 test suites:
  1. `node --test tests/email-harvester-clusterer.test.mjs`
  2. `node --test tests/adversarial-clusterer.test.mjs`
  3. `node --test tests/email-clusterer-stress.test.mjs`
- Regenerate `data/historical-email-corpus.json` and verify 0 raw PII leakage.
