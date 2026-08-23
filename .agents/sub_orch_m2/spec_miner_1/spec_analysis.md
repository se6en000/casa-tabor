# Specification Analysis: Milestone 2 (Empirical Evidence Report & Ground-Truth Benchmark)

**Author**: Spec Miner (`spec_miner_1`)  
**Target Milestone**: Milestone 2  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/`  
**Project Root**: `/Users/taboj/casa-tabor`  
**Date**: 2026-08-23T12:12:00Z  

---

## 1. Executive Summary & Milestone Scope

Milestone 2 delivers the foundational empirical evidence and ground-truth benchmark infrastructure for Casa Tabor's Autonomous Household Email Intelligence System.

### Primary Deliverables
1. **200+ Case Ground-Truth Holdout Benchmark Dataset** (`tests/fixtures/email-benchmark.json`):
   - Expanded from the initial 30-case fixture to **200+ curated, gold-standard test cases** spanning all 6 household archetypes, multi-vendor order formats, courier tracking patterns, edge cases, and agency levels.
2. **Empirical Evidence Report** (`docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`):
   - Comprehensive documentation analyzing 1,100+ historical family emails, vendor pattern nuances, naive keyword failure modes, PII redaction metrics, benchmark confusion matrices, and omnichannel kiosk guarantees.
3. **Automated Evaluation Script** (`scripts/email-benchmark-eval.mjs`):
   - Standalone CLI evaluator calculating 6x6 confusion matrices, precision/recall/F1 metrics, agency level accuracy, entity resolution metrics, and zero-leakage compliance.
4. **Verification Test Suite** (`tests/email-benchmark-verification.test.mjs`):
   - Automated Node.js test runner suite certifying dataset integrity, schema conformance, $\ge 98\%$ classification accuracy, and $0\%$ false action queue leakage.

---

## 2. 200+ Case Benchmark Dataset Specification

### 2.1 File Location & Metadata Schema
**Target Path**: `/Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json`

```json
{
  "version": "2.0.0",
  "generated_at": "2026-08-23T12:00:00Z",
  "benchmark_metadata": {
    "total_benchmark_cases": 210,
    "archetypes": [
      "logistics_parcels",
      "executive_actions",
      "temporal_appointments",
      "lifecycle_updates",
      "estate_knowledge",
      "promotional_noise"
    ],
    "vendor_formats": [
      "Walmart",
      "Amazon",
      "Apple",
      "Nike",
      "Target",
      "Jiffy.com",
      "HelloFresh",
      "Blue Apron",
      "Instacart",
      "DoorDash",
      "Chewy"
    ],
    "courier_formats": ["UPS", "FedEx", "USPS", "DHL"],
    "archetype_target_counts": {
      "logistics_parcels": 40,
      "executive_actions": 40,
      "temporal_appointments": 40,
      "lifecycle_updates": 30,
      "estate_knowledge": 30,
      "promotional_noise": 30
    }
  },
  "benchmark_cases": [
    { ... }
  ]
}
```

### 2.2 Case Item Schema & Field Definitions

Each case item in `benchmark_cases` must strictly adhere to the following field contract:

| Field Name | Type | Required? | Allowed Values / Constraints | Description |
|---|---|:---:|---|---|
| `id` | `string` | **Yes** | Pattern: `BM-[A-Z]{3}-\d{2,3}` or `BM-\d{3}` (e.g. `BM-LOG-01`, `BM-042`) | Unique identifier for the benchmark case. |
| `archetype` | `string` | **Yes** | `'logistics_parcels' \| 'executive_actions' \| 'temporal_appointments' \| 'lifecycle_updates' \| 'estate_knowledge' \| 'promotional_noise'` | Authoritative ground-truth archetype. |
| `sub_category` | `string` | Optional | Subcategories defined in `ARCHETYPE_SUBCATEGORIES` (e.g. `ecommerce_order`, `permission_slip`) | Granular taxonomy subcategory. |
| `sender` | `string` | **Yes** | Full email sender header (e.g. `"Amazon.com <auto-confirm@amazon.com>"`) | Authoritative sender email/name. |
| `subject` | `string` | **Yes** | Non-empty string | Raw email subject line. |
| `received_at` | `string` | **Yes** | ISO 8601 string (e.g. `"2026-08-20T14:15:00Z"`) | Timestamp of receipt. |
| `body` | `string` | **Yes** | Non-empty string | Clean text body payload (PII redacted/anonymized). |
| `expected_agency_level` | `number` | **Yes** | `0 \| 1 \| 2 \| 3` | Required human agency level: `0` (passive radar), `1` (low review/event suggestion), `2` (standard action/signature/payment), `3` (urgent/critical action). |
| `expected_routing` | `string` | **Yes** | `'delivery_transit_items' \| 'actionable_items' \| 'suggested_events' \| 'lifecycle_patches' \| 'family_knowledge_claims' \| 'family_data_documents' \| 'skip_noise'` | Target UI feed or memory destination. |
| `expected_canonical_key` | `string` | Optional | e.g. `ORDER:AMAZON:112-8472910-4829103`, `TRACKING:UPS:1Z9999999999999999`, `FLIGHT:DELTA:DL1482:2026-10-14` | Canonical composite identity key. |
| `expected_vendor` | `string` | Optional | Normalized vendor name (e.g. `"Amazon"`, `"Walmart"`, `"Apple"`, `"Nike"`, `"Delta Air Lines"`) | Identified merchant or organization. |
| `expected_canonical_order_id` | `string` | Optional | Canonical order string (e.g. `"112-8472910-4829103"`, `"2000154-80824348"`, `"W1029384756"`) | Normalized order ID. |
| `expected_tracking_number` | `string` | Optional | Normalized tracking number string (e.g. `"1Z9999999999999999"`) | Carrier tracking number. |
| `expected_carrier` | `string` | Optional | `'ups' \| 'fedex' \| 'usps' \| 'dhl' \| null` | Detected courier carrier. |
| `expected_stage` | `string` | Optional | `'confirmed' \| 'payment' \| 'shipped' \| 'out_for_delivery' \| 'delivered' \| 'problem' \| 'n/a'` | Order lifecycle progression stage. |
| `expected_policy_disclaimer` | `boolean` | Optional | `true \| false` | Boolean flag indicating presence of return/claims/warranty policy disclaimer. |
| `expected_is_perishable` | `boolean` | Optional | `true \| false` | True for groceries, meal kits, fresh produce, cold chain deliveries. |
| `expected_cost` | `string` | Optional | e.g. `"$138.65"`, `"$241.18"` | Formatted monetary amount. |
| `expected_due_by` | `string` | Optional | `YYYY-MM-DD` (e.g. `"2026-09-05"`) | Action item deadline date. |
| `expected_assigned_member` | `string` | Optional | e.g. `"Liv"`, `"Emme"`, `"Jacob"`, `"Kelly"` | Household member attributed. |
| `expected_event_title` | `string` | Optional | String title for calendar suggestions | Event title. |
| `expected_start_time` | `string` | Optional | ISO datetime string (e.g. `"2026-09-14T09:00:00-04:00"`) | Scheduled start time. |
| `expected_end_time` | `string` | Optional | ISO datetime string | Scheduled end time. |
| `expected_location` | `string` | Optional | String venue or street address | Event location. |
| `expected_conflict_detected` | `boolean` | Optional | `true \| false` | True if temporal schedule change conflicts with existing calendar. |

---

## 3. The 6 Semantic Archetypes & Subcategory Taxonomy

| # | Archetype | Subcategories | Typical Senders | Key Lexicon Signals | Expected Routing | Agency Level |
|---|---|---|---|---|---|:---:|
| 1 | `logistics_parcels` | `ecommerce_order`, `grocery_delivery`, `courier_tracking`, `meal_kit`, `perishable_shipment` | Amazon, Walmart InHome, Target, Apple, Nike, Chewy, HelloFresh, Blue Apron, Instacart, UPS, FedEx, USPS, DHL | "shipped", "tracking number", "delivered", "out for delivery", "inhome", "package", "driver is on the way" | `delivery_transit_items` | `0` |
| 2 | `executive_actions` | `permission_slip`, `liability_waiver`, `bill_invoice_due`, `registration_required`, `form_signature`, `document_submission` | Palm Beach County Schools, SchoolCash Online, FPL, PBC Water, Chase, Amex, Superstar Tennis, YMCA, DocuSign | "action required", "permission slip", "liability waiver", "balance due", "past due", "please sign", "due by", "registration closes" | `actionable_items` | `2` (Standard) / `3` (Urgent / Fraud / Shutoff) |
| 3 | `temporal_appointments` | `medical_doctor`, `dental_ortho`, `therapy_session`, `school_event_calendar`, `sports_practice_game`, `travel_itinerary`, `music_lesson` | Palm Pediatrics, Smile Dental, Coastal Ortho, MyChart, Bak MSOA, PB Aquatics, Florida Youth Orchestra, Delta, United | "appointment confirmed", "scheduled for", "curriculum night", "teeth cleaning", "practice schedule", "flight itinerary", "e-ticket" | `suggested_events` | `1` |
| 4 | `lifecycle_updates` | `flight_schedule_change`, `flight_gate_change`, `order_item_cancellation`, `delivery_delay_exception`, `appointment_reschedule`, `utility_service_outage` | Delta, United, American Airlines, UPS, FedEx, Amazon, Walmart, FPL Outages, Palm Pediatrics | "flight delayed", "schedule changed", "gate change", "item cancelled", "delivery delay exception", "appointment rescheduled", "power outage" | `lifecycle_patches` (or `delivery_transit_items`) | `0` (Tracking) / `1` (Event Update) / `2` (Flight Conflict) |
| 5 | `estate_knowledge` | `school_newsletter`, `hoa_rules_digest`, `home_maintenance_guide`, `student_supply_list`, `utility_service_notice`, `community_announcement` | Mirasol HOA, Tabor Estates HOA, Superior AC Repairs, FL Premier Pools, Envera Systems, Palm Beach Sheriff, Principal Davis | "weekly newsletter", "hoa rules", "maintenance log", "supply list", "pool chemistry", "community advisory", "filter replacement" | `family_knowledge_claims` / `family_data_documents` | `0` |
| 6 | `promotional_noise` | `retail_sale`, `coupon_discount`, `marketing_digest`, `charity_solicitation`, `social_newsletter` | J.Crew, Pottery Barn, Williams Sonoma, Best Buy, Sephora, DoorDash Deals, Morning Brew, Substack, Marriott Rewards | "% off", "promo code", "flash sale", "coupon", "save big", "limited time offer", "free meals", "bonus points", "daily brew" | `skip_noise` | `0` |

---

## 4. Multi-Vendor Entity Resolution & Normalization Rules

### 4.1 Order Number Canonicalization Rules
The system enforces deterministic normalization across major e-commerce and retail merchants:

1. **Walmart**:
   - 15-digit unhyphenated (`200015480824348` $\rightarrow$ `2000154-80824348`)
   - 16-digit unhyphenated (`2000154808243489` $\rightarrow$ `2000154-808243489`)
   - Strip leading `WM-` prefixes and whitespace.
2. **Amazon**:
   - 17-digit contiguous (`11284729104829103` $\rightarrow$ `112-8472910-4829103`)
   - Preserve digital orders with `D01-` prefix.
   - Standardize 3-7-7 hyphenation.
3. **Apple**:
   - Match `W` followed by 9-10 digits (`w1029384756` $\rightarrow$ `W1029384756`).
4. **Nike**:
   - Match `C0` or `C-` followed by 9-11 digits (`c0192837465` $\rightarrow$ `C0192837465`).
5. **Target**:
   - 10-14 digit clean numeric (`9812736450`).
6. **Jiffy.com / Jiffy Shirts**:
   - 8-12 digit clean numeric order ID (`2541442349`).
7. **HelloFresh & Meal Kits**:
   - Standardize uppercase `HF-`, `GC-`, `BA-`, `FACT-` prefixes (`hf-9928172` $\rightarrow$ `HF-9928172`).

### 4.2 Multi-Carrier Tracking & Composite Keys
- **UPS**: Regex `\b(1Z[0-9A-Z]{16})\b` $\rightarrow$ Carrier `UPS`, Tracking uppercase.
- **USPS**: Regex `\b(9[2345]\d{20,24})\b` $\rightarrow$ Carrier `USPS`.
- **FedEx**: Regex `\b(\d{12}|\d{15}|\d{20,22})\b` in FedEx context $\rightarrow$ Carrier `FedEx`.
- **DHL**: Regex `\b(\d{10,11})\b` in DHL context $\rightarrow$ Carrier `DHL`.
- **Composite Thread Key Formats**:
  - `transaction:${vendor}:${canonicalOrderId}`
  - `courier:${carrier}:${trackingNumber}`
  - `ORDER:${VENDOR}:${CANONICAL_ORDER_ID}`
  - `TRACKING:${CARRIER}:${TRACKING_NUMBER}`

### 4.3 Stage Definitions & Tense-Aware Progression State Machine
1. `confirmed`: Order placed / payment authorized. Future delivery date guardrail prevents premature resolution.
2. `payment`: Preparation window / active modification allowed.
3. `shipped`: Handed over to courier; active tracking number attached.
4. `out_for_delivery`: Courier on final delivery route (arriving today).
5. `delivered`: Package handed over / delivered to porch or mailbox.
6. `problem`: Carrier exception, weather delay, damage, or delivery attempt failure.
7. `n/a`: Non-logistics items (e.g. bills, appointments, newsletters).

---

## 5. Empirical Failure Modes of Naive Keyword Matching

Naive keyword heuristics fail catastrophically in real household email environments. The system implements multi-tier NLP arbitration and guardrails to mitigate the following 6 failure modes:

```
+----------------------------------------------------------------------------------------------------+
|                                    NAIVE KEYWORD FAILURE MODES                                      |
+------------------------------------+--------------------------------+------------------------------+
| Naive Symptom                      | Root Cause                     | Hybrid Guardrail Mitigation  |
+------------------------------------+--------------------------------+------------------------------+
| 1. False Positive Action Leakage   | "Return within 30 days" or     | Anti-Leakage Guardrail 1:    |
|    in Logistics Emails             | "claims window" matches "due"  | Isolates return/warranty text|
|                                    | or "return" keyword            | as passive policy disclaimer;|
|                                    |                                | keeps agencyLevel = 0.       |
+------------------------------------+--------------------------------+------------------------------+
| 2. Promotional Urgency Fake-Out    | Retailers using subject lines  | Anti-Leakage Guardrail 2:    |
|                                    | like "Action Required: 40% Off"| Checks promo headers and     |
|                                    | or "Don't miss out"            | discount keywords; routes to |
|                                    |                                | promotional_noise.           |
+------------------------------------+--------------------------------+------------------------------+
| 3. Utility Precedence Inversion    | Past-due electric bill with    | Deterministic Rule 5:        |
|                                    | disconnection warning matches  | Precedence hierarchy:        |
|                                    | "interruption of service"      | Security > Past Due > Outage |
|                                    | (classified as outage)         | > General Tips.              |
+------------------------------------+--------------------------------+------------------------------+
| 4. Tense Confusion in Logistics    | "Your items will arrive        | Tense-Aware Parser:          |
|                                    | Monday" matched on word        | Future arrival guardrail     |
|                                    | "arrive" -> marked delivered   | downgrades future dates to   |
|                                    |                                | confirmed/shipped.           |
+------------------------------------+--------------------------------+------------------------------+
| 5. Multi-Hop Forwarded Blindness   | Fwd: Fwd: School Permission    | Forward Unwrapping:          |
|                                    | Slip classified under parent's | Parses nested forward chain  |
|                                    | personal Gmail instead of      | using lastIndexOf to extract |
|                                    | school district authority      | authoritative inner sender.  |
+------------------------------------+--------------------------------+------------------------------+
| 6. Promotional Airline Deals       | "Fly to New York for $49"      | Domain Promo Rule 1:         |
|                                    | classified as calendar flight  | Requires explicit ticket/    |
|                                    | appointment                    | confirmation number to route |
|                                    |                                | to temporal_appointments.    |
+------------------------------------+--------------------------------+------------------------------+
```

---

## 6. Empirical Report Structure Specification

**Target File**: `/Users/taboj/casa-tabor/docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`

### Required Report Outline & Contents:

1. **Title & Executive Summary**
   - Corpus scale (1,100+ raw/deduplicated emails harvested across linked family Gmail inboxes).
   - Ground-truth holdout benchmark scale (200+ curated cases).
   - Core achievement: $\ge 98.5\%$ overall classification accuracy, $0.0\%$ false action queue leakage.

2. **Corpus Architecture & Ingestion Statistics**
   - Table: Email count, deduplication rate, category distribution (Personal, Updates, Promotions, Forums).
   - Table: Sender domain diversity (32+ domains across retail, logistics, education, healthcare, HOA, utilities).

3. **6-Archetype Distribution & Semantic Taxonomy**
   - Detailed breakdown of all 6 archetypes with percentage distributions, counts, and subcategory mappings.
   - Ground-truth validation on holdout sets.

4. **Multi-Vendor & Courier Format Nuances**
   - Comprehensive inventory of vendor order number formats (Amazon, Walmart, Apple, Nike, Target, Jiffy, HelloFresh).
   - Courier tracking regex rules and carrier resolution matrix (UPS, FedEx, USPS, DHL).
   - Tense-aware stage progression rules and lifecycle examples.

5. **Failure Mode Analysis: Naive Keyword Matching vs 4-Tier Hybrid Classifier**
   - Deep-dive into the 6 failure modes with verbatim before/after examples.
   - Explanation of the 4-tier hybrid pipeline (Tier 1: Deterministic Headers, Tier 2: NLP Intent Scoring, Tier 3: Anti-Leakage Guardrails, Tier 4: Entity Extractor).

6. **Privacy & PII Redaction Empirical Audit**
   - Verification across 10 sensitive entity categories (Human Names, Phone Numbers, Personal Emails, Physical Addresses / PO Boxes, Credit Cards with Luhn check, Bank Accounts / Routing Numbers, SSNs, Passwords / PINs / OTPs, Student / Patient IDs, Dates of Birth).
   - $100\%$ redaction rate on test vectors with zero PII in serialized benchmark fixtures.

7. **Benchmark Evaluation & Confusion Matrix**
   - 6x6 Confusion Matrix table (True Archetype vs Predicted Archetype).
   - Precision, Recall, F1-Score, and Support table per archetype.
   - Agency Level Accuracy ($0, 1, 2, 3$).
   - Canonical Entity Extraction Accuracy ($>99\%$).

8. **Omnichannel Kiosk UX & 3-Click Navigation Guarantees**
   - 0% leakage partitioning (`agency_level === 0` routed strictly to `delivery_transit_items`).
   - Sidecar drawer inspection, 1-tap actions, $\ge 44\text{px}/48\text{px}$ touch targets, distance-readable typography.

---

## 7. Verification Test & Evaluation Script Specifications

### 7.1 Evaluation Script (`scripts/email-benchmark-eval.mjs`)
- **CLI Usage**: `node scripts/email-benchmark-eval.mjs [options]`
  - `--benchmark=<path>`: Benchmark fixture path (default: `tests/fixtures/email-benchmark.json`).
  - `--corpus=<path>`: Historical corpus path (default: `data/historical-email-corpus.json`).
  - `--format=<markdown|json|table>`: Output formatting mode (default: `table`).
  - `--verbose`: Prints misclassified cases with diff details.
- **Metrics Calculated**:
  - Overall accuracy ($\ge 98\%$).
  - 6x6 Confusion Matrix (True vs Predicted).
  - Precision, Recall, and F1-score for each of the 6 archetypes.
  - Action Queue Leakage count (must be exactly `0`).
  - Canonical Order & Courier Entity match rate ($>99\%$).
  - Agency Level classification match rate ($>98\%$).

### 7.2 Verification Test Suite (`tests/email-benchmark-verification.test.mjs`)
- **Command**: `node --test tests/email-benchmark-verification.test.mjs`
- **Mandatory Assertions**:
  1. `benchmark_cases.length >= 200`: Dataset scale check.
  2. All `id` fields are unique and conform to standard pattern.
  3. Every case has valid `archetype`, `sender`, `subject`, `received_at`, `body`, `expected_agency_level`, and `expected_routing`.
  4. Every archetype is represented by $\ge 25$ cases.
  5. Classifier achieves $\ge 98\%$ accuracy across all 200+ cases.
  6. Exactly $0$ instances of `logistics_parcels`, `promotional_noise`, or `estate_knowledge` leak into `executive_actions` or `actionable_items` (`actionLeakageCount === 0`).
  7. All logistics cases with order IDs or tracking numbers successfully resolve to canonical entities.

---

## 8. Features Discovered & Edge Cases

### Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Benchmark Dataset | 200+ Case Gold Standard | Multi-archetype ground-truth test cases for offline evaluation. | Benchmark JSON object | Labeled test cases with expected routing and entities | Schema mismatch throws validation assertion error | `ORIGINAL_REQUEST.md` §R2, `PROJECT.md` §13 |
| 2 | Semantic Archetypes | 6-Archetype Taxonomy | Grouping emails into 6 distinct household operational classes. | Raw or anonymized email object | `{ archetype, subCategory, confidence, agencyLevel }` | Fallback to `promotional_noise` with confidence 0.75 | `email-clusterer.mjs`, `PROJECT.md` §1 |
| 3 | Agency Routing | Multi-Level Agency Classification | Allocates items to agency levels 0 (passive), 1 (review), 2 (action), 3 (urgent). | Email body, subject, urgency indicators | `agencyLevel: 0 \| 1 \| 2 \| 3`, `expected_routing` | Unknown defaults to 0 (safe mode) | `src/types/index.ts`, `PROJECT.md` §1 |
| 4 | Order Resolution | Multi-Vendor Canonicalization | Deterministic normalization of vendor order numbers (Amazon 3-7-7, Walmart 7-8, Apple W, Nike C0, Target, Jiffy, HelloFresh). | Vendor name, raw order number string | Canonicalized string (e.g. `2000154-80824348`) | Returns normalized fallback string | `canonical-order-resolver.mjs`, `vendorTransactions.ts` |
| 5 | Courier Tracking | Multi-Carrier Detection | Extracts tracking numbers and identifies carrier (UPS, FedEx, USPS, DHL). | Email body, headers, URLs | `{ carrier, trackingNumber }` | Carrier `null` if unrecognized | `email-clusterer.mjs`, `canonical-order-resolver.mjs` |
| 6 | State Progression | Tense-Aware Stage Machine | Tracks progression (`confirmed` -> `shipped` -> `out_for_delivery` -> `delivered`) with future date guardrails. | Email body, subject, reference date | `effectiveStage: DeliveryTransitStage` | Future delivery text downgraded to `confirmed`/`shipped` | `vendorTransactions.ts`, `canonical-order-resolver.mjs` |
| 7 | Leakage Partition | 0% Action Queue False Leakage | Partitions items so logistics tracking and return policies never enter Action Queue. | `PrepItem[]` or classified emails | `{ actionableItems, deliveryTransitItems }` | Strict `agency_level === 0` filter | `needsYouFeed.ts`, `TEST_INFRA.md` §T1.7 |
| 8 | Privacy Redaction | 10-Entity PII Redaction Engine | Redacts names, phones, emails, street/PO box addresses, CCs (Luhn), bank accounts, SSNs, PINs, student IDs, DOBs. | Text/HTML string | Anonymized text with `[TOKEN_REDACTED]` | Preserves masked order IDs and merchant names | `email-clusterer.mjs`, `TEST_INFRA.md` §T1.1 |
| 9 | Forward Unwrapping | Multi-Hop Nested Forward Unwrapper | Extracts innermost authoritative sender from `Fwd:` email chains. | Email body text | Authoritative nested body snippet and sender | Falls back to outer email if no markers found | `email-clusterer.mjs`, `email-harvester-clusterer.test.mjs` |
| 10 | Evaluation Runner | Benchmark Evaluator Script | CLI script computing confusion matrix, accuracy, precision, recall, and entity resolution rates. | Benchmark JSON file | Formatted report table / markdown | Exits with error code 1 if accuracy < 98% | `PROJECT.md` §11, `SCOPE.md` |

### Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---|---|---|
| 1 | PII Redaction | International phone numbers (`+44 20 7946 0919`, `+33 1 42 68 55 00`, `+81 3 1234 5678`) | Fully redacted to `[PHONE_REDACTED]` without truncating surrounding text. |
| 2 | PII Redaction | Credit cards formatted with dots, spaces, dashes, or Luhn checksums | Correctly replaced with `[CARD_REDACTED]` while preserving Amazon 3-7-7 and Walmart 7-8 order IDs. |
| 3 | Order Canonicalizer | Unhyphenated 15/16-digit Walmart order ID in URL query param (`?orderId=200015480824348`) | Successfully extracted and normalized to `2000154-80824348`. |
| 4 | Order Canonicalizer | Amazon order ID with erratic whitespace (`112 - 8472910 - 4829103`) | Whitespace stripped and normalized to `112-8472910-4829103`. |
| 5 | Stage Machine | Email with delivery date 14 days in future containing word "delivered" | Guardrail detects future date and downgrades stage to `confirmed`. |
| 6 | Classifier Guardrail | Retail marketing email with subject "Action Required: 50% Off Flash Sale" | Anti-leakage guardrail intercepts fake urgency and routes to `promotional_noise`. |
| 7 | Classifier Guardrail | Delivery confirmation containing "Items eligible for return within 30 days" | Retained in `logistics_parcels` with `agency_level: 0`, preventing action queue clutter. |
| 8 | Utility Precedence | Electric bill stating "Past due - pay now to avoid interruption of service" | Billing precedence takes priority over outage keywords; classified as `executive_actions` (Agency 3). |
| 9 | Cross-Inbox Deduplication | Identical RFC Message-ID delivered to two family members with different labels | Deduplicated into single canonical record with `mailboxes: ['jacob', 'kelly']` and `duplicateCount: 2`. |
| 10 | Forwarded Thread | Triple-nested forward chain (`Fwd: Fwd: Re: School Waiver`) | `lastIndexOf` unwrap identifies innermost principal sender and routes to `executive_actions`. |
