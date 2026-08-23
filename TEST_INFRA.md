# E2E Test Infra: Autonomous Household Email Intelligence System

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests derive strictly from user requirements in `ORIGINAL_REQUEST.md` and architectural guarantees in `PROJECT.md`, exercising public modules, schemas, and pipeline outputs as an end user / household operating system would.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Interaction + Real-World Application Workload Scenarios.
- **Deterministic & Offline**: Full test suite runs via native Node.js test runner (`node --test tests/e2e-email-intelligence-tiers.test.mjs` or `npm test`) with zero network dependencies or live API token flakiness, completing in $<10$ seconds.
- **Zero-Tolerance Integrity**: Complete, genuine assertions with strict behavioral checks; zero mocking of assertions, zero cheating.

---

## Feature Inventory & Tier Coverage Matrix

| # | Feature / Archetype | Requirement Source | Tier 1 (Coverage ≥5) | Tier 2 (Boundary ≥5) | Tier 3 (Pairwise) | Tier 4 (Scenarios) |
|---|---------------------|--------------------|:-------------------:|:-------------------:|:-----------------:|:------------------:|
| 1 | `logistics_parcels` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (Walmart, Apple) |
| 2 | `executive_actions` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (School Waiver, HOA) |
| 3 | `temporal_appointments` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (Bak MSOA, Flight) |
| 4 | `lifecycle_updates` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (Flight Change) |
| 5 | `estate_knowledge` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (HOA Notice) |
| 6 | `promotional_noise` Archetype | ORIGINAL_REQUEST §1, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (Suppression) |
| 7 | Multi-Vendor Order Canonicalizer | ORIGINAL_REQUEST §2, PROJECT.md §2 | 7 vendors (10 cases) | 5 cases | ✓ | ✓ (Walmart, Apple) |
| 8 | Multi-Carrier Courier Tracking | ORIGINAL_REQUEST §2, PROJECT.md §2 | 4 couriers (6 cases) | 5 cases | ✓ | ✓ (UPS, FedEx, USPS) |
| 9 | Tense-Aware Stage Progression | ORIGINAL_REQUEST §2, PROJECT.md §2 | 5 cases | 5 cases | ✓ | ✓ (Multi-stage updates) |
| 10| Compound & Multimodal Decomposition | ORIGINAL_REQUEST §3, PROJECT.md §3 | 5 cases | 5 cases | ✓ | ✓ (Bak MSOA flyer) |
| 11| Active Learning & Rule Overrides | ORIGINAL_REQUEST §4, PROJECT.md §4 | 5 cases | 5 cases | ✓ | ✓ (Rule injection) |
| 12| 0% Action Queue False Leakage | ORIGINAL_REQUEST §1-2, PROJECT.md §1 | 5 cases | 5 cases | ✓ | ✓ (Estate Radar) |
| 13| Cross-Inbox Deduplication | ORIGINAL_REQUEST §2, PROJECT.md §2 | 5 cases | 5 cases | ✓ | ✓ (Family duplicate) |
| 14| Omnichannel Kiosk Touch & Feed UX | ORIGINAL_REQUEST §5, PROJECT.md §5 | 5 cases | 5 cases | ✓ | ✓ (Sidecar actions) |

---

## Test Architecture & Directory Layout

### Execution & Test Runner
- **Runner**: Node.js v24 native test runner (`node:test`, `node:assert/strict`).
- **Command**: `node --test tests/e2e-email-intelligence-tiers.test.mjs`
- **Full Suite Command**: `npm test`
- **Pass / Fail Semantics**: Exit code 0, 100% tests passing, zero unhandled rejections, strict type and schema validation.

### Directory Layout
```
casa-tabor/
├── TEST_INFRA.md                                  # Test suite methodology, architecture, and coverage index
├── TEST_READY.md                                  # Publication indicator when 100% E2E tests pass
├── tests/
│   ├── e2e-email-intelligence-tiers.test.mjs     # Primary 4-Tier E2E test suite
│   ├── fixtures/
│   │   └── email-benchmark.json                   # Complete multi-tier raw & structured email test fixtures
│   ├── vendor-transaction-producer.test.mjs      # Vendor order & courier normalization tests
│   ├── gmail-canonical-email.test.mjs             # Deduplication & RFC Message-ID tests
│   ├── gmail-attachment-multimodal-actions.test.mjs # Compound PDF/flyer decomposition tests
│   └── action-queue-sidecar-inspection.test.mjs   # Omnichannel kiosk & sidecar inspection tests
├── src/
│   ├── utils/
│   │   ├── vendorTransactions.ts                 # Order normalization & stage progression
│   │   ├── needsYouFeed.ts                       # 0% leakage partition & feed builder
│   │   ├── actionInspectionSynthesis.ts          # Compound action bundle & event synthesis
│   │   └── prepCategories.ts                     # Taxonomy & categories
│   └── types/index.ts                            # Core data models
└── supabase/
    └── functions/_shared/
        ├── gmail-canonical-email.mjs             # Deduplication & RFC key hashing
        ├── gmail-message-content.mjs             # Multipart MIME parsing & attachment extraction
        └── family-email-evidence.mjs             # Sensitive PII redaction & chunking
```

---

## Detailed Tier Structure & Coverage Breakdown

### Tier 1: Feature Coverage (≥5 Test Cases per Feature)
- **T1.1: 6 Semantic Email Archetypes**
  - TC1.1.1: `logistics_parcels` — Amazon delivery confirmation with tracking and items.
  - TC1.1.2: `executive_actions` — School permission slip requiring signed PDF waiver and deadline.
  - TC1.1.3: `temporal_appointments` — Pediatrician wellness visit with specific start time, location, and doctor.
  - TC1.1.4: `lifecycle_updates` — Airline flight departure time schedule change notification.
  - TC1.1.5: `estate_knowledge` — HOA quarterly landscaping and maintenance notice.
  - TC1.1.6: `promotional_noise` — Retail discount promotional email correctly routed to suppression.
- **T1.2: Multi-Vendor Order Number Canonicalizer**
  - TC1.2.1: Walmart unhyphenated 15-digit ID (`200015480824348` $\rightarrow$ `2000154-80824348`).
  - TC1.2.2: Walmart unhyphenated 16-digit ID (`2000154808243489` $\rightarrow$ `2000154-808243489`).
  - TC1.2.3: Amazon 17-digit contiguous ID (`11284729104829103` $\rightarrow$ `112-8472910-4829103`).
  - TC1.2.4: Apple order ID lowercase with `w` prefix (`w1029384756` $\rightarrow$ `W1029384756`).
  - TC1.2.5: Nike order ID lowercase with `c0` prefix (`c0192837465` $\rightarrow$ `C0192837465`).
  - TC1.2.6: Jiffy order number extraction from receipt body (`2541442349`).
  - TC1.2.7: HelloFresh meal kit order reference (`hf-98765432` $\rightarrow$ `HF-98765432`).
- **T1.3: Multi-Carrier Courier Tracking & Carrier Detection**
  - TC1.3.1: UPS 1Z tracking (`1Z9999999999999999` $\rightarrow$ uppercase carrier UPS).
  - TC1.3.2: USPS 22-digit tracking (`9400111899562549301823` $\rightarrow$ carrier USPS).
  - TC1.3.3: FedEx 12-digit tracking (`789456123012` with carrier context $\rightarrow$ FedEx).
  - TC1.3.4: FedEx 15-digit / 20-digit ground tracking (`96110209876543210987`).
  - TC1.3.5: DHL Express 10-digit tracking (`1234567890` $\rightarrow$ carrier DHL).
- **T1.4: Tense-Aware Lifecycle Stage Progression**
  - TC1.4.1: Future delivery phrasing ("Your items will arrive Monday") resolves to `confirmed` / `shipped`, not `delivered`.
  - TC1.4.2: Present delivery phrasing ("Out for delivery today") resolves to `out_for_delivery`.
  - TC1.4.3: Past delivery phrasing ("Delivered to front porch at 2:15 PM") resolves to `delivered`.
  - TC1.4.4: Active editing window ("Order placed, you have until 3 PM to modify") resolves to `payment` / preparation stage.
  - TC1.4.5: Cancelled / delayed delivery notice updates stage accordingly without phantom delivery.
- **T1.5: Compound Email & Multimodal Attachment Decomposition**
  - TC1.5.1: School newsletter decomposing into 2 calendar events, 1 permission slip action, and 1 general announcement.
  - TC1.5.2: Multimodal PDF flyer summary decomposing into structured key points and source origin tagging (`attachment`).
  - TC1.5.3: Email body + attachment hybrid extraction correctly assigning `source_origin: 'compound'`.
  - TC1.5.4: Sibling action deduplication linking all sub-tasks to parent thread ID.
  - TC1.5.5: Granular item selection allowing selective dismissal or acceptance of individual bundled actions.
- **T1.6: Active Learning & Rule Overrides**
  - TC1.6.1: Learned rule for sender domain with directive `mute_promotions` suppressing future marketing emails.
  - TC1.6.2: Learned rule for specific sender with directive `require_action_review` promoting items to Executive Action Queue.
  - TC1.6.3: User downvote feedback triggering item suppression threshold (strength $\ge 2$).
  - TC1.6.4: Fast dismissal feedback reducing confidence score on similar recurring patterns.
  - TC1.6.5: Dynamic few-shot exemplar prompt injection tailoring classification to household preferences.
- **T1.7: 0% Action Queue False Leakage Partitioning**
  - TC1.7.1: Passive logistics parcel (`agency_level: 0`) routes strictly to `deliveryTransitItems`, leaving `actionableItems` empty.
  - TC1.7.2: Merchant delivery update email with return policy disclaimers routes to `deliveryTransitItems` with 0% noise in action queue.
  - TC1.7.3: High-agency bill payment request (`agency_level: 2`) routes strictly to `actionableItems`.
  - TC1.7.4: Mixed batch of 5 logistics items and 2 action items partitions exactly into 5 transit items and 2 actionable items.
  - TC1.7.5: Re-classification after user edit moves item across partition boundary without duplication.

---

### Tier 2: Boundary & Corner Cases (≥5 Test Cases per Edge Case)
- **T2.1: Empty & Malformed MIME Payloads**
  - TC2.1.1: Completely empty email body with only subject line.
  - TC2.1.2: Missing MIME headers, missing Message-ID (falls back to deterministic SHA-256 fingerprint).
  - TC2.1.3: Truncated HTML with unclosed tags, malformed entities, and non-UTF8 characters.
  - TC2.1.4: Payload with 0 attachments but `has_attachments: true` flag.
  - TC2.1.5: Excessively large body payload (>2MB) safely truncated without memory exhaustion.
- **T2.2: Extreme & Unusual Order IDs**
  - TC2.2.1: Walmart 15-digit order ID embedded in raw URL query parameter (`?orderId=200015480824348`).
  - TC2.2.2: Amazon order ID with erratic whitespace or tab separation (`112 - 8472910 - 4829103`).
  - TC2.2.3: Order ID spanning multiple lines or followed by punctuation (`Order #200015480824348.`).
  - TC2.2.4: 30-character pseudo-order hash correctly sanitized or skipped without crash.
  - TC2.2.5: Multiple order IDs in a single receipt (split shipments) correctly canonicalized.
- **T2.3: Date Boundary & Future Arrival Guardrails**
  - TC2.3.1: Delivery date set 14 days in the future with raw status text "delivered" downgraded to `confirmed`.
  - TC2.3.2: Midnight rollover date parsing (e.g. 23:59 vs 00:01) maintaining correct calendar date.
  - TC2.3.3: Ambiguous date strings ("next Friday", "arriving Monday") resolved against reference timestamp.
  - TC2.3.4: Overlapping multi-day event dates (e.g. 3-day school camp: Aug 25 - Aug 27) parsed into discrete start and end ISO strings.
  - TC2.3.5: Past `out_for_delivery` item older than 24 hours auto-resolving to `delivered`.
- **T2.4: Ambiguous Agency Levels & Policy Disclaimers**
  - TC2.4.1: Shipping notice containing "Click here to return within 30 days" retained as passive `agency_level: 0`.
  - TC2.4.2: Delivery notice containing "Signature required upon arrival" elevated to `agency_level: 1` with alert notice.
  - TC2.4.3: Promotional newsletter containing "RSVP to our sale event" correctly identified as `promotional_noise`, suppressing calendar event creation.
  - TC2.4.4: Low confidence classification ($<0.60$) flagging item for human review draft rather than automated execution.
  - TC2.4.5: Conflicting agency signals in body vs attachment resolved in favor of highest agency level.
- **T2.5: Multi-Recipient & Cross-Inbox Deduplication**
  - TC2.5.1: Identical email delivered to Mom and Dad inboxes with same RFC Message-ID resolving to identical `canonicalEmailKey`.
  - TC2.5.2: Identical email forwarded with altered Subject (e.g. "Fwd: ...") deduplicated via fallback normalized body fingerprint.
  - TC2.5.3: Duplicate tracking emails from courier and merchant consolidating into single active transit card.
  - TC2.5.4: Near-duplicate automated reminders (Day 1 reminder vs Day 3 reminder) updating existing action item rather than creating duplicate.
  - TC2.5.5: Multi-recipient thread replies updating thread conversation history in place.

---

### Tier 3: Cross-Feature Pairwise Interactions
- **T3.1: Multi-Stage Order Progression + Return Policy Disclaimers**
  - Interaction: Email 1 (Order Placed) $\rightarrow$ Email 2 (Shipped with UPS tracking) $\rightarrow$ Email 3 (Delivered with 30-day return policy).
  - Validation: Consolidated transit item updates stage smoothly from `payment` $\rightarrow$ `shipped` $\rightarrow$ `delivered`; return policy disclaimer does NOT leak into Executive Action Queue.
- **T3.2: Compound School Newsletter Decomposition + Calendar Event Generation**
  - Interaction: Newsletter with PDF attachment describing 6th Grade Science Camp ($150 fee due Aug 28) and Open House (Sep 2, 6:00 PM).
  - Validation: Decomposes into: (1) `actionableItems` entry for $150 fee with deadline; (2) `suggestedEvents` entry for Open House on Sep 2; (3) `estate_knowledge` reference summary.
- **T3.3: Active Learning Rule Override + Dynamic Few-Shot Retrieval**
  - Interaction: Generic retail receipt from local farm stand normally classified as noise; user creates rule "Always track Farm Stand as Logistics".
  - Validation: Next incoming receipt matches active capture rule, retrieves few-shot exemplar, and routes to `logistics_parcels` with parcel transit tracking.
- **T3.4: Airline Schedule Change + Calendar Conflict Detection**
  - Interaction: Flight itinerary update moves departure from 2:00 PM to 10:00 AM, conflicting with existing dentist appointment.
  - Validation: `lifecycle_updates` extracts new flight leg, detects conflict with existing calendar appointment, and creates high-agency alert in `actionableItems`.
- **T3.5: Sensitive PII Redaction + Estate Knowledge Indexing**
  - Interaction: School registration email containing Student ID numbers, lunch PIN, and medical emergency info.
  - Validation: PII redact utility strips sensitive identifiers (`[STUDENT_ID_REDACTED]`, `[PIN_REDACTED]`) before indexing knowledge claims into family vector memory.
- **T3.6: Kiosk Touch Sidecar Action + Feed Synchronization**
  - Interaction: 1-tap resolution of compound action on kiosk touch screen (accepts calendar event, archives task).
  - Validation: UI feed updates optimistically, dispatches database mutation, and updates badge count in Estate Logistics Radar.

---

### Tier 4: Real-World Application Scenarios (End-to-End Household Narratives)

- **Scenario 1: Bak MSOA School Science Camp & Open House (Compound Education)**
  - **Narrative**: Parent receives a Bak Middle School of the Arts newsletter containing a welcome letter, an embedded PDF flyer for 7th Grade Science Camp with a $175 registration fee due September 5th, a required liability waiver, and the Annual Curriculum Night on September 12th from 6:00 PM to 8:30 PM.
  - **Expected Outcome**:
    - Archetype: `executive_actions` & `temporal_appointments` (Compound).
    - Extraction:
      - Action Item 1: "Submit Science Camp Liability Waiver & $175 Fee" (Due: Sep 5, 2026, Agency: 2, Source: `attachment`).
      - Event Item 1: "Bak MSOA Curriculum Night" (Date: Sep 12, 2026, 18:00–20:30, Location: Bak MSOA Auditorium, Source: `email_body`).
      - Knowledge Claim: "Bak MSOA 7th Grade Science Camp dates & packing guidelines" indexed into family knowledge memory.
    - Partitioning: 100% routed to Executive Action Queue and Calendar; 0% in Transit Items.

- **Scenario 2: Walmart+ InHome Multi-Stage Perishable Grocery Delivery (Logistics Lifecycle)**
  - **Narrative**: Multi-stage grocery order lifecycle across 3 emails:
    1. Order Confirmed: Unhyphenated order ID `200015480824348`, $142.50, scheduled delivery tomorrow between 10:00 AM - 12:00 PM, item edit cutoff 8:00 AM.
    2. Out for Delivery: InHome delivery associate dispatched, temperature-controlled van en route.
    3. Delivered: Delivery completed at 10:45 AM with doorstep photo and 90-day return policy footer.
  - **Expected Outcome**:
    - Canonical Order ID: `2000154-80824348`.
    - Stage Progression: `confirmed` $\rightarrow$ `out_for_delivery` $\rightarrow$ `delivered`.
    - Partitioning: All 3 updates consolidate into 1 Delivery Transit Item in Estate Logistics Radar; zero noise in Executive Action Queue.

- **Scenario 3: Delta Air Lines Schedule Change with Calendar Conflict (Temporal Lifecycle)**
  - **Narrative**: Delta notifies parent of an involuntary flight change for Flight DL1482 from PBI to ATL: departure moved from 4:30 PM to 11:15 AM on October 14, 2026. A conflicting pediatric orthodontist appointment is scheduled on October 14 at 11:30 AM.
  - **Expected Outcome**:
    - Archetype: `lifecycle_updates`.
    - Trip Leg Update: Departure updated to `2026-10-14T11:15:00`.
    - Conflict Detection: High-priority alert generated: "Flight schedule change conflicts with Orthodontist Appointment (11:30 AM)".
    - Agency Level: 2 (Requires Parent Decision / Rescheduling).

- **Scenario 4: HOA Landscaping & Roof Inspection Notice (Estate Knowledge & Action)**
  - **Narrative**: Casa Bella HOA sends monthly community newsletter containing:
    1. Community pool closure for maintenance next Tuesday (Aug 25).
    2. Mandatory annual roof and gutter inspection: homeowners must clear perimeter walkways by Friday, Aug 28.
    3. General landscaping guidelines and architectural review committee dates.
  - **Expected Outcome**:
    - Archetype: `estate_knowledge` + `executive_actions`.
    - Extraction:
      - Action Item: "Clear perimeter walkways for HOA Roof & Gutter Inspection" (Due: Aug 28, 2026).
      - Event Item: "HOA Community Pool Closed for Maintenance" (Aug 25, 2026).
      - Knowledge Claims: Architectural guidelines indexed into estate memory for AI assistant retrieval.

- **Scenario 5: Apple High-Value Parcel with Direct Signature Requirement (Logistics Alert)**
  - **Narrative**: Apple Store shipment notification for MacBook Pro (Order `w9876543210`, UPS Tracking `1Z9999999999999999`), estimated delivery tomorrow by 3:00 PM. Includes bold notice: "Direct adult signature strictly required upon delivery."
  - **Expected Outcome**:
    - Canonical Order ID: `W9876543210`.
    - Carrier: UPS, Tracking: `1Z9999999999999999`.
    - Agency Elevation: Because direct signature is required, item appears in Estate Logistics Radar with high-visibility Alert Badge: "Signature Required — Adult Must Be Home".

---

## Pass / Fail Thresholds & Acceptance Criteria

1. **Tier 1 (Feature Coverage)**: 100% of all ≥50 test cases pass.
2. **Tier 2 (Boundary & Corner Cases)**: 100% of all ≥25 boundary test cases pass.
3. **Tier 3 (Cross-Feature Combinations)**: 100% of all pairwise interaction tests pass.
4. **Tier 4 (Real-World Scenarios)**: 100% of all 5 end-to-end scenario workflows pass.
5. **Execution Speed**: Full test suite completes in $<10$ seconds.
6. **Integrity Gate**: Forensic integrity audit passes with 0 violations.
