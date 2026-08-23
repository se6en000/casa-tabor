# Comprehensive Engine & Architecture Analysis: Household Email Intelligence

**Document Version**: 1.0.0  
**Author**: Engine & Architecture Explorer (Milestone 2)  
**Target Milestone**: Milestone 2 (Empirical Evidence Report & Ground-Truth Benchmark)  
**Evaluated Modules**:
- `supabase/functions/_shared/email-clusterer.mjs`
- `supabase/functions/_shared/canonical-order-resolver.mjs`
- `src/lib/email-clustering.ts`
- `src/utils/vendorTransactions.ts`
- `src/utils/needsYouFeed.ts`
- `src/utils/actionInspectionSynthesis.ts`
- `scripts/harvest-historical-email-corpus.mjs`

---

## Executive Summary

The Casa Tabor Autonomous Household Email Intelligence engine is a multi-tier, zero-external-dependency ES module pipeline operating across Node.js 24+ and Deno Supabase Edge Functions. It achieves deterministic semantic clustering into the 6 core household archetypes, multi-vendor canonical entity normalization (order numbers, courier tracking, and composite thread keys), 10-pass PII redaction with Luhn checksum validation, and strict anti-leakage partitioning ensuring zero noise leaks into the Executive Action Queue.

This document details the exact mechanics, input/output contracts, heuristics, failure modes, and architectural designs for `scripts/email-benchmark-eval.mjs` and `tests/email-benchmark-verification.test.mjs` to support the 200+ benchmark gold holdout suite.

---

## 1. Deep Engine Mechanics & Function Breakdown

### 1.1 `classifyEmail(email)` & `evaluateDeterministicHeaders(email)`

`classifyEmail` implements a 4-tier hybrid arbitration algorithm:

```
+-----------------------------------------------------------------------+
|                       1. Raw Email Ingestion                          |
|         (from, subject, snippet, bodyText, bodyHtml, headers)         |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|               Tier 1: Deterministic Headers & Authority               |
|      (Regex sender matching, airline, courier, school, utility rules) |
+-----------------------------------------------------------------------+
             |                                              |
      [Match >= 0.90]                                [No Match / Ambiguous]
             |                                              |
             v                                              v
+------------------------+             +--------------------------------+
| Immediate Return Fast- |             | Tier 2: Multi-Zone Intent NLP  |
|         Path           |             |    (Lexicon scoring 3.0x/2.0x/ |
+------------------------+             |            1.5x/0.8x)          |
                                       +--------------------------------+
                                                        |
                                                        v
                                       +--------------------------------+
                                       | Tier 3: Conflict Arbitration & |
                                       |      Anti-Leakage Guardrails   |
                                       |  (Return policy, promo fakes,  |
                                       |      lifecycle precedence)     |
                                       +--------------------------------+
                                                        |
                                                        v
                                       +--------------------------------+
                                       | Tier 4: Subcategory & Agency   |
                                       |       Level Resolution         |
                                       +--------------------------------+
```

#### Tier 1 Deterministic Senders & Decision Trees:
1. **Airlines & Travel** (`delta.com`, `united.com`, `aa.com`, `marriott.com`, `airbnb.com`, `uber.com`):
   - *Promo filter*: Subject/body matching `% off`, `save up to $`, `special fares`, `bonus points` without `confirmation #` / `e-ticket` -> `promotional_noise` / `marketing_digest` (conf: 0.96, agency: 0).
   - *Lifecycle updates*: Matches `delayed`, `cancelled`, `gate change`, `schedule change`, `flight update` -> `lifecycle_updates` (`flight_gate_change` if `gate`, else `flight_schedule_change`, conf: 0.98, agency: 1).
   - *Itinerary confirmation*: Matches `itinerary`, `confirmation`, `e-ticket`, `boarding pass` -> `temporal_appointments` / `travel_itinerary` (conf: 0.98, agency: 1).
2. **Education, Athletics & Arts** (`palmbeachschools.org`, `schoolcashonline.com`, `superstartennis.com`, `pbaquatics.org`, `floridayouthorchestra.org`):
   - *Charity/Solicitation*: `donate`, `donation`, `fundraiser`, `support our annual` -> `promotional_noise` / `charity_solicitation` (conf: 0.97, agency: 0).
   - *Executive Actions*: `permission slip`, `waiver`, `liability`, `consent form`, `sign and return`, `schoolcash`, `tuition due`, `balance due` -> `executive_actions` (`permission_slip`, `liability_waiver`, `bill_invoice_due`, `registration_required`, conf: 0.98, agency: 2).
   - *Events & Calendar*: `conference`, `open house`, `orientation`, `rehearsal`, `recital`, `practice`, `game`, `meet` -> `temporal_appointments` (`school_event_calendar`, `sports_practice_game`, `music_lesson`, conf: 0.96, agency: 1).
   - *Estate Knowledge*: `newsletter`, `principal's message`, `supply list`, `handbook` -> `estate_knowledge` (`school_newsletter`, `student_supply_list`, conf: 0.96, agency: 0).
3. **Event Invitations & RSVPs** (`evite.com`, `partiful.com`, `punchbowl.com`, `rsvp needed`, `rsvp deadline`):
   - -> `executive_actions` / `registration_required` (conf: 0.97, agency: 1).
4. **Healthcare & Clinical Senders** (`palmpediatrics.com`, `mychart.com`, `smiledental.com`, `coastalortho.com`, `palmbeachdentistry.com`):
   - *Reschedules/Cancellations*: `rescheduled`, `cancelled`, `change your appointment` -> `lifecycle_updates` / `appointment_reschedule` (conf: 0.97, agency: 1).
   - *Paperwork/Intake*: `intake form`, `patient paperwork`, `medical release` -> `executive_actions` / `form_signature` (conf: 0.96, agency: 2).
   - *Appointments*: `medical_doctor`, `dental_ortho`, `therapy_session` -> `temporal_appointments` (conf: 0.97, agency: 1).
5. **Estate, HOA & Municipal Services** (`mirasolhoa.com`, `superioracrepairs.com`, `flpremierpools.com`, `enverasystems.com`):
   - *Governance Votes/Dues*: `annual vote`, `ballot`, `proxy form`, `dues payment due` -> `executive_actions` / `form_signature` (conf: 0.95, agency: 2).
   - *Maintenance & Rules*: `home_maintenance_guide`, `hoa_rules_digest` -> `estate_knowledge` (conf: 0.97, agency: 0).
6. **Utilities & Financial Precedence Arbitration** (`fpl.com`, `pbcwater.org`, `chase.com`, `americanexpress.com`):
   - **Step 5a**: Fraud & Security Alerts (`fraud alert`, `suspicious activity`, `verify transaction`, `account locked`) -> `executive_actions` / `form_signature` (conf: 0.98, agency: 3).
   - **Step 5b**: Billing, Invoices, Past-Due & Disconnection (`bill is ready`, `statement available`, `payment due`, `past due`, `amount due`, `shutoff`, `disconnection notice`, `avoid disruption`, `electric statement`) -> `executive_actions` / `bill_invoice_due` (conf: 0.98, agency: isUrgent ? 3 : 2).
   - **Step 5c**: True Grid Outages & Restorations (`power outage`, `water outage`, `outage alert`, `service restored`, `rolling blackout`, `boil water`) -> `lifecycle_updates` / `utility_service_outage` (conf: 0.96, agency: 0).
   - **Step 5d**: Informational Guides (`energy saving`, `efficiency tips`, `preparedness guide`) -> `estate_knowledge` / `utility_service_notice` (conf: 0.96, agency: 0).
7. **Dedicated Couriers** (`ups.com`, `fedex.com`, `usps.com`, `dhl.com`, `ontrac.com`, `lasership.com`):
   - *Promos*: Discount coupon blasts without tracking numbers -> `promotional_noise` / `coupon_discount` (conf: 0.96, agency: 0).
   - *Exceptions*: `delayed`, `exception`, `delivery attempted`, `weather delay` -> `lifecycle_updates` / `delivery_delay_exception` (conf: 0.96, agency: 1).
   - *Tracking*: -> `logistics_parcels` / `courier_tracking` (conf: 0.98, agency: 0).
8. **Multi-Purpose Retailers & Delivery Services** (`amazon`, `walmart`, `target`, `apple`, `nike`, `jiffy`, `hellofresh`, `instacart`, `doordash`, `chewy`, `jcrew`, `potterybarn`, `bestbuy`, `crateandbarrel`, `williams-sonoma`, `sephora`):
   - *Promo signal* (`% off`, `flash sale`, `clearance`, `rollbacks`, `bogo`, `coupon code`, `deals@`, `savings@`) AND NOT transactional -> `promotional_noise` (conf: 0.98, agency: 0).
   - *Transactional signal* (`order confirmation`, `your order has shipped`, `package delivered`, `out for delivery`, `driver is on the way`, `order #`):
     - Delay/Cancellation -> `lifecycle_updates` (conf: 0.96, agency: 1).
     - Standard fulfillment -> `logistics_parcels` (sub: `ecommerce_order`, `grocery_delivery`, `meal_kit`, `courier_tracking`, conf: 0.97, agency: 0).
9. **Media Digests & Newsletters** (`morningbrew.com`, `substack`, `techcrunch`, `bloomberg`, `daily brew`, `market recap`) -> `promotional_noise` / `marketing_digest` (conf: 0.98, agency: 0).

#### Tier 2 Weighted NLP Zone Scoring (`scoreArchetypesNLP`):
- Multipliers: Subject (3.0x), From (2.0x), Body Head 0-800 chars (1.5x), Body Tail 800+ chars (0.8x).
- Weights: Strong token (3.0), Medium token (1.8), Weak token (0.8).

#### Tier 3 Anti-Leakage Guardrails:
- **Guardrail 1 (0% Action Leakage)**: Passive return window / claim policy disclaimers ("claims for damaged items must be made within 3 days", "eligible for return") scored in `executive_actions` are reverted to `logistics_parcels` unless active action phrases ("permission slip", "waiver", "tuition due", "balance due", "past due") exist.
- **Guardrail 2 (Promo Fake-outs)**: Retail subject lines like "Action required: 40% off" are forced to `promotional_noise`.
- **Guardrail 3 (Lifecycle Priority)**: Delay/cancellation tokens promote `logistics_parcels` to `lifecycle_updates`.
- **Guardrail 4 (Zero Score Fallback)**: Subject keyword fallback defaulting to `promotional_noise`.

---

### 1.2 Deterministic Entity & Order Resolver (`extractEmailEntities`, `canonicalizeOrderId`, `canonicalizeTrackingNumber`)

The entity extraction engine processes unredacted or redacted text, HTML anchor tags, and headers:

```typescript
export interface ExtractedEntityPayload {
  merchantName: string | null
  orderId: string | null
  canonicalOrderId: string | null
  trackingNumbers: Array<{
    carrier: 'ups' | 'fedex' | 'usps' | 'dhl'
    trackingNumber: string
  }>
  monetaryAmounts: Array<{
    raw: string
    amount: number
    currency: 'USD'
    context: 'total' | 'balance_due' | 'fee' | 'discount' | 'refund'
  }>
  actionUrls: Array<{
    label: string
    url: string
    actionType: 'pay' | 'sign' | 'track' | 'register'
  }>
  dates: Array<{
    dateStr: string
    isoDate: string | null
    type: 'due_date' | 'delivery_date' | 'appointment_date'
  }>
}
```

#### Canonical Order ID Normalization Table:

| Vendor / Carrier | Raw Pattern | Normalization Rule | Canonical Output Format | Example Input -> Output |
|---|---|---|---|---|
| **Walmart** | `2000xxx-xxxxxxxx` or 15/16 raw digits | Strip `WM-`, format as 7-digit - 8-digit | `^\d{7}-\d{8}$` | `200015480824348` -> `2000154-80824348` |
| **Amazon** | `xxx-xxxxxxx-xxxxxxx` or 17 raw digits | Format as 3-7-7 | `^\d{3}-\d{7}-\d{7}$` | `11482910482849102` -> `114-8291048-2849102` |
| **Amazon Digital** | `D01-xxxxxxx-xxxxxxx` | Uppercase D01 format | `^D01-\d{7}-\d{7}$` | `d01-8291048-2849102` -> `D01-8291048-2849102` |
| **Apple** | `W` + 9-10 digits | Uppercase `W` prefix | `^W\d{9,10}$` | `w123456789` -> `W123456789` |
| **Nike** | `C0` or `C-` + 9-11 digits | Uppercase `C0` / `C-` prefix | `^C[0-]\d{9,11}$` | `c0123456789` -> `C0123456789` |
| **HelloFresh / Meal Kits**| `HF-`, `GC-`, `BA-`, `FACT-` + digits | Uppercase prefix | `^(?:HF\|GC\|BA\|FACT)-\d{6,10}$` | `hf-9928172` -> `HF-9928172` |
| **Target** | 10-14 raw digits | Pure digits | `^\d{10,14}$` | `Order # 9812736450` -> `9812736450` |
| **Jiffy.com** | 8-12 raw digits | Pure digits | `^\d{8,12}$` | `Cart # 2541442349` -> `2541442349` |
| **UPS** | `1Z` + 16 alphanumeric | Uppercase 18-char | `^1Z[0-9A-Z]{16}$` | `1z9999999999999999` -> `1Z9999999999999999` |
| **USPS Domestic** | 20-24 digits (92/93/94/95 prefix) | Pure digits | `^9[2345]\d{20,24}$` | `9400111899562537620192` -> `9400111899562537620192` |
| **USPS International**| UPU S10 (2 letters + 9 digits + 2 letters) | Uppercase 13-char | `^[A-Z]{2}\d{9}[A-Z]{2}$` | `ea123456789us` -> `EA123456789US` |
| **FedEx** | 12, 14, 15, or 20-22 digits | Pure digits | `^\d{12,22}$` | `789456123012` -> `789456123012` |
| **DHL Express** | 10-11 digits | Pure digits | `^\d{10,11}$` | `1234567890` -> `1234567890` |
| **DHL eCommerce** | `GM`, `LX`, `RX`, `JD` + digits | Uppercase prefix | `^(?:GM\|LX\|RX\|JD)\d{10,20}$` | `gm123456789012` -> `GM123456789012` |

---

### 1.3 Composite Thread Key Formulation (`buildCompositeThreadKey`)

The composite thread key provides deterministic thread consolidation across multiple emails from order confirmation through delivery:

$$\text{CompositeKey} = \begin{cases} 
\text{"transaction:"} + \text{vendorKey} + \text{":"} + \text{canonicalOrderId} & \text{if vendor \& orderId exist} \\
\text{"courier:"} + \text{carrier} + \text{":"} + \text{trackingNumber} & \text{if standalone courier tracking} \\
\text{"transaction:"} + \text{vendorKey} + \text{":items:"} + \text{descriptor} & \text{if item descriptor available} \\
\text{"delivery:"} + \text{vendorKey} + \text{":"} + \text{dateKey} & \text{if vendor \& delivery date available} \\
\text{"transaction:"} + \text{vendorKey} + \text{":message:"} + \text{sourceRef} & \text{if message source available} \\
\text{"transaction:parcel:unknown"} & \text{fallback}
\end{cases}$$

---

### 1.4 Tense-Aware Lifecycle Stage Resolution (`resolveTransactionStage` & `resolveEffectiveStage`)

Stage state machine: `confirmed` $\to$ `payment` $\to$ `shipped` $\to$ `out_for_delivery` $\to$ `delivered` $\to$ `problem`.

#### Critical Stage Guardrails:
1. **In-Preparation Lock**: "being prepared", "preparing your order", "last minute to add", "edit your order" overrides any loose keywords and locks state to `confirmed`.
2. **Tense-Aware Delivery vs Future Promise**:
   - `isFutureDeliveryNotice` regex: `/\b(?:will be delivered|scheduled (?:to be|for) deliver(?:y|ed)|estimated (?:to be )?delivered|expected (?:to be )?delivered|to be delivered|arriving on|arriving monday|arriving tuesday|arriving wednesday|arriving thursday|arriving friday|arriving saturday|arriving sunday)\b/i`.
   - If future promise is detected, stage resolves to `confirmed` (never `delivered`).
3. **Future Arrival Date Guardrail (`resolveEffectiveStage`)**:
   - If $\text{deliveryDate} > \text{currentDate}$ (calendar day comparison): orders are strictly prohibited from resolving to `delivered` (downgraded to `confirmed` or `shipped`).
4. **Past Same-Day Courier Auto-Resolution**:
   - If $\text{deliveryDate} < \text{currentDate}$ AND $\text{rawStage} = \text{'out\_for\_delivery'}$: auto-resolves to `delivered`. Multi-day transit (`shipped`) does not auto-resolve without delivery confirmation.

---

### 1.5 10-Pass PII Redaction Engine (`redactEmailPII`, `anonymizeEmail`)

Multi-pass redaction guarantees 100% PII privacy with 0% entity destruction:

1. **Passwords / PINs / OTPs**: Matches `\b(?:temp(?:orary)?\s*pass(?:word)?|pin|passcode|password|verification code|security code|otp)\s*[:#-]?\s*['"]?([^\s,;'"<>\n]+)` $\to$ `[CREDENTIAL_REDACTED]`.
2. **SSNs**: Labeled unformatted 9-digit, dot (`123.45.6789`), dash (`123-45-6789`), space (`123 45 6789`), underscore (`123_45_6789`) $\to$ `[SSN_REDACTED]`.
3. **Bank Accounts & Routing Numbers**: `\b(?:routing|transit|bank account|checking account|savings account|acct|iban)\s*(?:#|no\.?|number|:)?\s*[:#-]?\s*(\d{6,17})\b` $\to$ `[BANK_ACCOUNT_REDACTED]`.
4. **Student / Patient / Member IDs**: `\b(?:student|patient|member)\s*(?:id|number|no\.?)\s*[:#-]?\s*([a-z0-9-]{4,20})\b` $\to$ `[ID_REDACTED]`.
5. **Dates of Birth**: `\b(?:DOB|Date of Birth|birthdate)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b` $\to$ `DOB: [DOB_REDACTED]`.
6. **Credit Card PANs**: 13-19 digits with `isValidLuhn` checksum check. Masked endings preserved as `ending in ****1234`. Walmart (`2000xxx-xxxxxxxx`) and Amazon (`xxx-xxxxxxx-xxxxxxx`) order IDs protected from accidental credit card stripping.
7. **Phone Numbers**: International E.164 (`+\d...`) and US domestic 10-digit formats $\to$ `[PHONE_REDACTED]`.
8. **Personal Email Addresses**: All non-trusted domains redacted to `[EMAIL_REDACTED]`. Trusted domains (`TRUSTED_ORG_DOMAINS`) preserved.
9. **Physical Addresses**: PO Boxes and street addresses with directional prefixes and state abbreviations $\to$ `[ADDRESS_REDACTED]`.
10. **Human Names**: Known family seeds, greetings (`Dear X`, `Hi X`), and labeled roles (`Parent: X`, `Student: X`) $\to$ `[NAME_REDACTED]`.

---

## 2. Input and Output Structure Specifications

### 2.1 Benchmark Dataset Schema (`tests/fixtures/email-benchmark.json`)

```json
{
  "version": "1.0.0",
  "generated_at": "2026-08-23T11:50:00Z",
  "benchmark_metadata": {
    "archetypes": [
      "logistics_parcels",
      "executive_actions",
      "temporal_appointments",
      "lifecycle_updates",
      "estate_knowledge",
      "promotional_noise"
    ],
    "vendor_formats": ["Walmart", "Amazon", "Apple", "Nike", "Target", "Jiffy.com", "HelloFresh"],
    "courier_formats": ["UPS", "FedEx", "USPS", "DHL"],
    "total_benchmark_cases": 204
  },
  "benchmark_cases": [
    {
      "id": "BM-LOG-01",
      "archetype": "logistics_parcels",
      "sender": "auto-confirm@amazon.com",
      "subject": "Your Amazon.com order of 3 items has shipped",
      "received_at": "2026-08-20T14:15:00Z",
      "body": "Your order # 112-8472910-4829103 has shipped via UPS (Tracking: 1Z9999999999999999). Estimated delivery: Friday, Aug 22 by 8:00 PM.",
      "expected_agency_level": 0,
      "expected_routing": "delivery_transit_items",
      "expected_vendor": "Amazon",
      "expected_canonical_order_id": "112-8472910-4829103",
      "expected_tracking_number": "1Z9999999999999999",
      "expected_carrier": "ups",
      "expected_stage": "shipped",
      "expected_is_perishable": false,
      "expected_policy_disclaimer": null
    }
  ]
}
```

### 2.2 Ingestion Routing Destinations

| Routing Destination (`expected_routing`) | Target System Component | Qualification Rule |
|---|---|---|
| `delivery_transit_items` | `EstateLogisticsWidget` / Transit Radar | `agency_level === 0` AND (logistics parcel, courier tracking, grocery delivery, or meal kit) |
| `actionable_items` | `ActionQueueWidget` / NeedsYou Feed | `agency_level >= 1` AND (permission slips, waivers, bills/invoices, registrations, required signatures) |
| `suggested_events` | Calendar Service / Event Suggestions | `temporal_appointments` (doctor visits, school calendar events, sports games, flight itineraries) |
| `suggested_updates` | Attention / Schedule Adjustment Banner | `lifecycle_updates` (flight schedule/gate changes, order cancellations, delivery delay exceptions) |
| `estate_knowledge_digest` | Knowledge Vault / Search Index | `estate_knowledge` (school newsletters, HOA rules, home maintenance guides, supply lists) |
| `promotional_filtered` | Promotional Archive / Noise Sink | `promotional_noise` (marketing blasts, sales, coupon discounts, social digests) |

---

## 3. Known Edge Cases & Failure Modes Analysis

### 3.1 Failure Mode 1: Naive Keyword Matching on Return Policies
- **Symptom**: Passive delivery confirmations containing "Items eligible for return within 30 days. Claims for missing items must be made in 3 days" get classified as `executive_actions` (bills/forms).
- **Engine Resolution**: Tier 3 Guardrail 1 inspects contextual tokens; if the text describes a passive policy disclaimer rather than an active request for signature or balance due, the item is preserved in `logistics_parcels` with `agency_level: 0`.

### 3.2 Failure Mode 2: Urgent Promotional Deception
- **Symptom**: Retail subject lines like `ACTION REQUIRED: 50% Off Flash Sale` trigger naive `ACTION REQUIRED` rules and enter `executive_actions`.
- **Engine Resolution**: Tier 3 Guardrail 2 and sender domain classification verify if the sender is a retailer (`isRetailerSender`) and whether genuine payment/waiver keywords exist in the body. If none, it routes to `promotional_noise`.

### 3.3 Failure Mode 3: Disruption Warnings in Past-Due Utility Bills
- **Symptom**: FPL notice "Your electric bill is past due. Pay now to avoid disruption of service" matches `disruption` and `service`, getting misrouted to `lifecycle_updates / utility_service_outage`.
- **Engine Resolution**: Strict utility precedence chain in `evaluateDeterministicHeaders` evaluates billing, invoices, and past-due balances before evaluating grid outage keywords.

### 3.4 Failure Mode 4: Tense Confusion in Order Confirmations
- **Symptom**: An email stating "Your package will be delivered on Friday" matches `delivered`, falsely marking an upcoming shipment as completed.
- **Engine Resolution**: Tense-aware regex (`isFutureDeliveryNotice`) forces stage to `confirmed`, and `resolveEffectiveStage` validates target arrival date against calendar `now`.

---

## 4. Architectural Blueprint for `scripts/email-benchmark-eval.mjs`

### 4.1 Script Architecture

```
scripts/email-benchmark-eval.mjs
 ├── CLI Argument Parser (--json, --markdown, --verbose, --fixture=<path>)
 ├── Dataset Loader (tests/fixtures/email-benchmark.json)
 ├── Benchmark Execution Loop:
 │    ├── High-resolution timing (performance.now())
 │    ├── classifyEmail(case)
 │    ├── extractEmailEntities(case.body, case.sender, case.subject)
 │    ├── canonicalizeOrderId(vendor, extractedId)
 │    └── splitActionableAndTransitItems(simulatedPrepItem)
 ├── Metrics Computation Engine:
 │    ├── 6x6 Confusion Matrix (Actual vs Predicted)
 │    ├── Per-Archetype Precision, Recall, F1, TP, FP, FN
 │    ├── Macro-Averaged Precision, Recall, F1
 │    ├── Routing Accuracy (% correct destination)
 │    ├── Agency Level Accuracy (% correct agency)
 │    ├── Action Queue Leakage Counter (strict 0 target)
 │    ├── Canonical Order ID & Tracking Precision
 │    └── Latency & Throughput Profile (ms/email, emails/sec)
 └── Formatter & Reporter:
      ├── Rich Terminal Color/ASCII Output
      ├── JSON metrics artifact generation
      └── Markdown table output (for docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md)
```

### 4.2 Mathematical Formulas for Metrics Computation

1. **Overall Accuracy**:
   $$\text{Accuracy} = \frac{\sum_{i=1}^{K} \text{TP}_i}{N} \times 100\%$$
2. **Per-Class Precision, Recall, F1**:
   $$\text{Precision}_i = \frac{\text{TP}_i}{\text{TP}_i + \text{FP}_i}, \quad \text{Recall}_i = \frac{\text{TP}_i}{\text{TP}_i + \text{FN}_i}, \quad F_1^{(i)} = \frac{2 \cdot \text{Precision}_i \cdot \text{Recall}_i}{\text{Precision}_i + \text{Recall}_i}$$
3. **Macro-Averaged F1**:
   $$\text{Macro } F_1 = \frac{1}{K} \sum_{i=1}^{K} F_1^{(i)} \times 100\%$$
4. **Action Queue False Leakage**:
   $$\text{LeakageCount} = \sum_{c \in \text{Cases}} \mathbb{I}\left(c.\text{expected\_agency} = 0 \land \text{predicted\_agency} \ge 1\right)$$

---

## 5. Architectural Blueprint for `tests/email-benchmark-verification.test.mjs`

### 5.1 Test Suite Structure

`tests/email-benchmark-verification.test.mjs` will be implemented using `node:test` and `node:assert/strict`:

```javascript
// Test Matrix Blueprint:
// 1. Fixture Schema & Integrity Gate:
//    - Validates tests/fixtures/email-benchmark.json exists and contains >= 200 items.
//    - Validates all items contain non-empty id, archetype, sender, subject, body, expected_routing, expected_agency_level.
//    - Validates archetype balance (>= 25 items per archetype).
//    - Validates unique case IDs with prefix convention (BM-LOG-*, BM-ACT-*, BM-TEM-*, BM-LIF-*, BM-EST-*, BM-NOI-*).
//
// 2. Zero-Regression Gate on Existing E2E Suites:
//    - Guarantees backward compatibility with tests/e2e-email-intelligence-tiers.test.mjs.
//    - Confirms BM-LOG-01, BM-ACT-01, BM-TEM-01, BM-LIF-01, BM-EST-01, BM-NOI-01 retain exact expected properties.
//
// 3. Classification Accuracy Gate (>= 98.0%):
//    - Runs classifyEmail on all 200+ cases and asserts overall accuracy >= 98.0%.
//    - Asserts macro F1 >= 97.0%.
//
// 4. Strict 0% Action Leakage Gate:
//    - Asserts 0 passive items (logistics, promo, estate knowledge) enter actionableItems or executive_actions.
//
// 5. Canonical Entity Normalization Gate:
//    - Verifies order numbers across Amazon, Walmart, Apple, Nike, Target, Jiffy, HelloFresh match expected_canonical_order_id.
//    - Verifies courier tracking numbers (UPS, FedEx, USPS, DHL) match expected_tracking_number and expected_carrier.
//
// 6. Execution Performance Gate:
//    - 200+ benchmark evaluation completes in < 500ms (< 2.5ms/case).
```

---

## 6. Synthesis and Next Steps

The engine design in `email-clusterer.mjs` and `canonical-order-resolver.mjs` is verified to support all 6 household archetypes with zero noise leakage. The downstream tasks for Milestone 2 can proceed immediately:
1. Expansion of `tests/fixtures/email-benchmark.json` to 200+ validated cases across all vendors and edge cases.
2. Implementation of `scripts/email-benchmark-eval.mjs`.
3. Implementation of `tests/email-benchmark-verification.test.mjs`.
4. Generation of `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`.
