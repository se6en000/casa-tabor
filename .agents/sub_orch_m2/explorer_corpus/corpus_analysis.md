# Empirical Email Corpus Analysis & Ground-Truth Benchmark Specification

**Casa Tabor Autonomous Household Email Intelligence System**  
**Milestone 2: Empirical Evidence Report & Ground-Truth Benchmark**  
**Working Directory:** `/Users/taboj/casa-tabor/.agents/sub_orch_m2/explorer_corpus/`  
**Dataset Source:** `/Users/taboj/casa-tabor/data/historical-email-corpus.json`  
**Analysis Date:** 2026-08-23

---

## 1. Executive Summary & Corpus Metadata

An exhaustive empirical investigation was performed over the 1,100 historical email corpus harvested across Casa Tabor family mailboxes. The dataset represents realistic multi-inbox family operations spanning e-commerce, courier logistics, school administration, athletics, medical clinics, utilities, HOA governance, home maintenance, and retail promotions.

### Key Corpus Metrics
- **Total Harvested Emails**: 1,100
- **Total Deduplicated Messages**: 1,100 (100% unique RFC Message-ID entries across mailboxes)
- **Mailbox Distribution**:
  - `jacob`: 550 emails (50.0%)
  - `kelly`: 550 emails (50.0%)
- **Corpus Date Range**: `2026-08-17T20:53:20.000Z` to `2026-08-18T15:12:20.000Z` (28.3 hours synthetic sequence representing multi-month family event streams)
- **Domain Diversity**: 40 distinct sender domains
- **Sender Addresses**: 47 unique `From` email headers
- **PII Ingestion Count**: 947 out of 1,100 emails contained injected confidential family PII tokens, with 1,859 total redacting operations performed with 0% unredacted leakage.

---

## 2. 6-Archetype Empirical Distribution & Subcategories

The 1,100 emails cluster into the 6 canonical household archetypes with realistic proportions reflecting an active suburban household with multiple school-aged children.

| Archetype | Count | Percentage | Subcategories Present | Target Agency Level |
|---|---|---|---|---|
| **`logistics_parcels`** | 248 | 22.55% | `courier_tracking` (169), `ecommerce_order` (40), `grocery_delivery` (32), `meal_kit` (7) | `agency_level: 0` |
| **`executive_actions`** | 190 | 17.27% | `liability_waiver` (110), `bill_invoice_due` (58), `permission_slip` (22) | `agency_level: 2` (standard) / `3` (past due/urgent) |
| **`temporal_appointments`** | 183 | 16.64% | `sports_practice_game` (109), `medical_doctor` (29), `dental_ortho` (24), `travel_itinerary` (21) | `agency_level: 1` |
| **`estate_knowledge`** | 166 | 15.09% | `school_newsletter` (88), `hoa_rules_digest` (42), `home_maintenance_guide` (36) | `agency_level: 0` |
| **`lifecycle_updates`** | 158 | 14.36% | `order_item_cancellation` (81), `appointment_reschedule` (32), `flight_schedule_change` (31), `delivery_delay_exception` (14) | `agency_level: 1` |
| **`promotional_noise`** | 155 | 14.09% | `retail_sale` (93), `coupon_discount` (54), `marketing_digest` (8) | `agency_level: 0` |
| **Total** | **1,100** | **100.0%** | **23 Subcategories** | - |

---

## 3. Sender & Domain Breakdown

Analysis of sender domain frequency confirms high representation across institutional, logistics, and retail partners.

### Top Sender Domains
| Domain | Count | Category / Typical Sender | Typical Archetype |
|---|---|---|---|
| `amazon.com` | 95 | Amazon Shipping & Auto-Confirm, Deals | `logistics_parcels`, `lifecycle_updates`, `promotional_noise` |
| `walmart.com` | 79 | Walmart InHome Delivery, Orders, Savings | `logistics_parcels`, `lifecycle_updates`, `promotional_noise` |
| `enverasystems.com` | 54 | Envera Gate Security | `estate_knowledge` |
| `fpl.com` | 50 | Florida Power & Light eBill & Alerts | `executive_actions`, `lifecycle_updates` |
| `palmpediatrics.com` | 43 | Palm Pediatrics Appointments & Reschedules | `temporal_appointments`, `lifecycle_updates` |
| `mirasolhoa.com` | 42 | Mirasol HOA Board Management | `estate_knowledge`, `executive_actions` |
| `delta.com` | 38 | Delta Air Lines Ticket Receipts & Flight Updates | `temporal_appointments`, `lifecycle_updates` |
| `instacart.com` | 36 | Instacart Delivery & Offers | `logistics_parcels`, `promotional_noise` |
| `superioracrepairs.com` | 36 | Superior AC Repairs Maintenance Bulletins | `estate_knowledge` |
| `flpremierpools.com` | 34 | FL Premier Pools Maintenance | `estate_knowledge` |
| `chase.com` | 32 | Chase Alerts & Statements | `executive_actions` |
| `ups.com` | 31 | UPS My Choice Tracking & Exceptions | `logistics_parcels`, `lifecycle_updates` |
| `superstartennis.com` | 29 | Superstar Tennis Coach & Waivers | `executive_actions`, `temporal_appointments` |
| `mychart.com` | 29 | MyChart Health Clinic Reminders | `temporal_appointments` |
| `united.com` | 28 | United Airlines Customer Care | `temporal_appointments`, `lifecycle_updates` |
| `americanexpress.com` | 28 | American Express Notifications | `executive_actions` |
| `schoolcashonline.com` | 26 | SchoolCash Online Fee Invoices | `executive_actions` |
| `coastalortho.com` | 24 | Coastal Orthodontics Appointments | `temporal_appointments` |
| `smiledental.com` | 24 | Smile Dental Care Reminders | `temporal_appointments` |
| `dhl.com` | 22 | DHL Express Delivery Notices | `logistics_parcels` |
| `palmbeachschools.org` | 22 | Palm Beach County Schools Principal & Forms | `executive_actions`, `estate_knowledge` |
| `chewy.com` | 22 | Chewy Orders & Promotions | `logistics_parcels`, `promotional_noise` |
| `pbaquatics.org` | 21 | PB Aquatics Swim Meets | `temporal_appointments` |
| `pbcwater.org` | 21 | PBC Water Utilities eBills | `executive_actions` |
| `fedex.com` | 21 | FedEx Tracking Updates | `logistics_parcels`, `lifecycle_updates` |
| `floridayouthorchestra.org` | 21 | Florida Youth Orchestra Director | `temporal_appointments` |
| `hellofresh.com` | 20 | HelloFresh Delivery & Reactivation Deals | `logistics_parcels`, `promotional_noise` |
| `crateandbarrel.com` | 18 | Crate & Barrel Promotions | `promotional_noise` |
| `usps.com` | 18 | USPS Informed Delivery | `logistics_parcels` |
| `bestbuy.com` | 17 | Best Buy Deals | `promotional_noise` |
| `jcrew.com` | 16 | J.Crew Sales | `promotional_noise` |
| `target.com` | 14 | Target Orders & Circle Offers | `logistics_parcels`, `promotional_noise` |
| `jiffyshirts.com` / `jiffy.com` | 14 | Jiffy Transfers / Shirts Orders | `logistics_parcels` |
| `nike.com` | 12 | Nike Member Orders & Deals | `logistics_parcels`, `promotional_noise` |
| `doordash.com` | 12 | DoorDash Deals & Delivery | `promotional_noise`, `logistics_parcels` |
| `blueapron.com` | 12 | Blue Apron Meal Kits | `logistics_parcels` |
| `williams-sonoma.com` | 12 | Williams Sonoma Sales | `promotional_noise` |
| `email.apple.com` | 10 | Apple Store Order Confirmations & News | `logistics_parcels`, `promotional_noise` |
| `potterybarn.com` | 9 | Pottery Barn Special Offers | `promotional_noise` |
| `morningbrew.com` | 8 | Morning Brew Daily Digest | `promotional_noise` |

---

## 4. Vendor Identity & Order Number Resolution Patterns

Empirical analysis of order formats across the corpus reveals vendor-specific syntax that must be canonicalized into unified composite keys (`transaction:${vendor}:${canonicalOrderId}`).

| Vendor | Raw Order Pattern Observed in Corpus | Canonical Regex Signature | Canonical Format Output | Sample Corpus Matches |
|---|---|---|---|---|
| **Amazon** | `114-6065201-9245080`, `114-2474795-2537506`, `11460652019245080`, `D01-9824102-1204910` | `^\d{3}-\d{7}-\d{7}$` or `^D01-\d{7}-\d{7}$` | `3-7-7` digit format (`114-6065201-9245080`) | 121 occurrences |
| **Walmart** | `2000154-36236856`, `200015414192214`, `1000291-84920192` | `^(?:2000\|1000)\d{3}-\d{8}$` or 15/16-digits | `7-8` digit hyphenated (`2000154-36236856`) | 32 occurrences |
| **Apple** | `W928401928`, `W102948102`, `W 928401928` | `^W\d{9,10}$` | Uppercase `W` + 9-10 digits (`W928401928`) | Standard Apple Store format |
| **Nike** | `C0123456789`, `C-98240192`, `C09284019281` | `^C[0-]\d{9,11}$` | Uppercase `C0` + 9-11 digits (`C0123456789`) | Standard Nike.com format |
| **HelloFresh** | `HF-992834`, `HF-8492019`, `992834` | `^HF-\d{6,10}$` | `HF-` prefix + 6-10 digits (`HF-992834`) | 7 occurrences |
| **Target** | `10294829182`, `98204102948` | `^\d{10,14}$` | Clean 10-14 digits (`10294829182`) | Standard Target.com format |
| **Jiffy.com** | `2541442349`, `98402918` | `^\d{8,12}$` | Clean 8-12 digits (`2541442349`) | Standard Jiffy Shirts format |

---

## 5. Carrier Tracking Number & Courier Recognition

Couriers identified in the corpus map deterministically to standardized composite keys (`courier:${carrier}:${canonicalTrackingNumber}`).

| Carrier | Tracking Number Formats Observed | Regex Detection Signature | Canonicalization Rule | Corpus Frequency |
|---|---|---|---|---|
| **UPS** | `1Z5007294877432287`, `1Z2925037075765431`, `1Z9999999999999999` | `\b(1Z[0-9A-Z]{16})\b` | Uppercase `1Z` + 16 alphanumeric characters | 223 occurrences |
| **FedEx** | `9400111899562537620192`, `784920192847`, `123456789012` | `\b(\d{12}\|\d{15}\|\d{20,22})\b` | Clean numeric digits only | 7 occurrences |
| **USPS** | `9400111899562537620192`, `9205590164917312984712`, `EA123456789US` | `\b(9[2345]\d{20,24})\b` or UPU S10 `^[A-Z]{2}\d{9}[A-Z]{2}$` | Clean numeric or uppercase UPU code | 7 occurrences |
| **DHL** | `1234567890`, `JJD0182940192`, `GM1234567890123456` | `\b(\d{10,11})\b` or `\b(?:GM\|LX\|RX\|JD)\d+\b` | Clean numeric or eCommerce prefix | Tested in test harness |

---

## 6. PII Token Distribution & Sanitization Performance

The PII Redaction engine underwent exhaustive validation against the 1,100 emails.

| PII Category | Test Tokens & Formats Detected | Redaction Replacement Token | Occurrences Detected |
|---|---|---|---|
| **Human Names** | `Jacob Tabor`, `Kelly Loucks`, `Olivia Tabor`, `Emme Tabor`, `Owen Tabor`, `François Müller`, `Renée Tabor` | `[NAME_REDACTED]` | 751 |
| **Street Addresses & PO Boxes** | `123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480`, `4520 PGA Blvd, Suite 200`, `PO Box 4920` | `[ADDRESS_REDACTED]` | 397 |
| **Phone Numbers** | `561-555-0199`, `(561) 379-6111`, `+1-561-555-0144`, `+44 20 7946 0919`, `+33 1 42 68 55 00` | `[PHONE_REDACTED]` | 385 |
| **Student / Patient IDs** | `Student ID: STU-987654`, `PBC-442819`, `Patient ID: MED-88234` | `[ID_REDACTED]` | 77 |
| **Credit Card PANs** | `4111-2222-3333-4444`, `4000 1234 5678 9010`, `3782 822463 10005` (Luhn-verified) | `[CARD_REDACTED]` / `ending in ****1234` | 55 |
| **Social Security Numbers** | `123-45-6789`, `123.45.6789`, `123_45_6789`, `123 45 6789` | `[SSN_REDACTED]` | 55 |
| **Personal Email Addresses** | `sarah.tabor@gmail.com`, `michael.tabor@private.com` (non-trusted org domains) | `[EMAIL_REDACTED]` | 55 |
| **Temporary Passwords & PINs** | `Temp Password: Pass#2026!`, `PIN: 4829`, `Verification Code: 994812` | `[CREDENTIAL_REDACTED]` | 55 |
| **Dates of Birth** | `DOB: 05/14/1982`, `Date of Birth: 11/23/2016` | `DOB: [DOB_REDACTED]` | 29 |
| **Total Redactions** | - | - | **1,859** |

---

## 7. Complex Compound Email Patterns & Naive Keyword Failure Modes

The empirical investigation revealed 7 critical failure modes when naive keyword matching or single-field classifiers are applied.

### Failure Mode 1: Promotional Deceptive Urgency vs Genuine Action Tasks
- **Observation**: Retailers frequently use subject lines containing `[Action Required] Save 50% on fall styles before midnight!`, `Action required: Do not let this deal slip away!`, or `Exclusive offer: Sign up today and pay less`.
- **Naive Keyword Flaw**: Matching on `/action required/i` or `/urgent/i` or `/sign/i` triggers false positive routing to `executive_actions` with `agency_level: 2`, directly polluting the family's actionable task feed.
- **Resolution Mechanism**: Tier 1 Header & Precedence inspection + Conflict Arbitration Guardrail 2. If subject contains promo tokens (`% off`, `sale`, `promo code`, `coupon`, `rollbacks`) and body does not contain institutional debt/consent markers (`balance due`, `tuition`, `waiver`, `permission slip`), force classification to `promotional_noise` with `agency_level: 0`.

### Failure Mode 2: E-Commerce Return Policies vs Actionable Tasks (0% Action Leakage)
- **Observation**: Transactional shipping receipts from Amazon, Target, and Walmart include legal boilerplate such as: `Items eligible for return within 30 days of receipt` or `Claims for damaged packages must be filed within 3 days`.
- **Naive Keyword Flaw**: Matching on `/return/i`, `/claims/i`, or `/days/i` falsely flags shipping notifications as actionable return tasks.
- **Resolution Mechanism**: Conflict Arbitration Guardrail 1 (`0% False Action Leakage`). When order identifiers or carrier tracking numbers are present and passive return language is detected without explicit signature/waiver requirements, lock archetype to `logistics_parcels` with `agency_level: 0`.

### Failure Mode 3: Airline Marketing vs Booking Itineraries vs Schedule/Gate Changes
- **Observation**: A single airline domain (e.g. `@delta.com`, `@united.com`) emits 3 distinct email archetypes:
  1. *Marketing Promo*: `Fly to New York from $129 one-way! Book your flight today` -> `promotional_noise` (`agency_level: 0`)
  2. *Confirmed Itinerary*: `Delta Flight Itinerary: Confirmation #DL8942 (MIA -> LGA)` -> `temporal_appointments` (`agency_level: 1`)
  3. *Operational Schedule/Gate Update*: `✈️ Flight DL1492 Schedule Change: Delayed Departure` / `Gate Change Notification: Gate C14` -> `lifecycle_updates` (`agency_level: 1`)
- **Naive Keyword Flaw**: Domain-based or regex rule on `flight` cannot distinguish between promotional ads, calendar reservations, and live airport disruptions.
- **Resolution Mechanism**: Hierarchical regex parsing with gate/delay priority over itinerary tokens, and promo fare detection over standard receipts.

### Failure Mode 4: Utility Statements vs Disconnection Notices vs Outages vs Energy Guides
- **Observation**: Utility providers (Florida Power & Light `@fpl.com`, PBC Water Utilities) generate 4 distinct types of correspondence:
  1. *Security / Fraud Alerts*: `Fraud Alert: Verify recent payment attempt` -> `executive_actions` (`agency_level: 3`)
  2. *Past-Due Disconnection Notices*: `Urgent: Disconnection Notice - Past Due Balance $245.18` -> `executive_actions` (`agency_level: 3`)
  3. *Standard Monthly Statement*: `Your FPL Electric Statement is Ready - Amount Due: $184.20` -> `executive_actions` (`agency_level: 2`)
  4. *Grid Power Outage*: `Power Outage Alert in Palm Beach County - Estimated restoration: 6:00 PM` -> `lifecycle_updates` (`agency_level: 0`)
  5. *Energy Efficiency Guide*: `Seasonal AC Energy Saving & Storm Preparedness Guide` -> `estate_knowledge` (`agency_level: 0`)
- **Naive Keyword Flaw**: Keyword `power` or `FPL` conflates power outages (operational status update) with electric bills (monetary payment required) and seasonal tips (estate reference).
- **Resolution Mechanism**: Strict precedence hierarchy in Tier 1: Fraud -> Disconnection/Past Due -> Standard Bill -> Grid Outage -> Estate Guide.

### Failure Mode 5: HOA Newsletters vs Voting Ballots vs Architectural Violations
- **Observation**: Mirasol HOA (`@mirasolhoa.com`) broadcasts community newsletters containing pool resurfacing schedules (`estate_knowledge`), but also sends annual board voting ballots requiring signed electronic proxies (`executive_actions`).
- **Naive Keyword Flaw**: Routing all HOA emails to knowledge base causes family to miss mandatory annual voting deadlines and architectural compliance notices.
- **Resolution Mechanism**: High-priority check for `annual vote`, `ballot`, `proxy form`, `dues payment due`, or `violation notice` which promotes the email to `executive_actions` (`agency_level: 2`), while general community digests remain `estate_knowledge`.

### Failure Mode 6: Multi-Hop Forwarded Messages (`Fwd: Fwd: Re:`)
- **Observation**: Family members frequently forward school permission slips or shipping tracking with casual informal commentary: `Hey Kelly, can you take care of this before Friday? Fwd: Action Required: Science Museum Permission Slip`.
- **Naive Keyword Flaw**: Naive classifiers evaluate the top sender (`jake.tabor@personalmail.com`) and classify as casual personal banter, missing the nested institutional payload.
- **Resolution Mechanism**: Multi-hop forward unwrapper using `lastIndexOf` on standard forward boundary markers (`---------- Forwarded message ---------`, `-----Original Message-----`, `Begin forwarded message:`) to analyze the deepest authentic inner message body and subject.

### Failure Mode 7: Medical Appointments vs Medical Intake Forms vs Rescheduling
- **Observation**: Pediatric clinics (`@palmpediatrics.com`, `@smiledental.com`) send 3 distinct categories:
  1. *Intake Paperwork*: `Action Required: Complete patient intake paperwork before visit` -> `executive_actions` (`agency_level: 2`)
  2. *Appointment Confirmation*: `Appointment Reminder: Annual Wellness Exam on Sept 8 at 3:00 PM` -> `temporal_appointments` (`agency_level: 1`)
  3. *Clinic Reschedule*: `Appointment Rescheduled: Dr. Martinez Pediatric Visit moved to Thursday` -> `lifecycle_updates` (`agency_level: 1`)
- **Resolution Mechanism**: Tri-state NLP & deterministic rule matching prioritizing intake consent forms for action queues, reschedule notices for lifecycle sync, and standard confirmations for calendar projection.

---

## 8. Catalog of 210 Candidate Benchmark Emails

To form the basis of the Ground-Truth Benchmark Dataset (`tests/fixtures/email-benchmark.json`), 210 candidate test vectors were curated and balanced across all 6 archetypes, 23 subcategories, and 38 unique vendors.

### Candidate Pool Summary
- **Total Selected Benchmark Cases**: 210
- **Logistics & Parcels (`logistics_parcels`)**: 40 cases
  - 10 Amazon e-commerce orders & tracking
  - 8 Walmart InHome grocery deliveries
  - 6 Courier shipments (UPS 1Z, FedEx, USPS, DHL)
  - 6 Meal kit deliveries (HelloFresh, Blue Apron)
  - 5 Retail parcel shipments (Target, Apple, Nike, Jiffy, Chewy)
  - 5 Multi-item & perishable orders with return policies
- **Executive Actions (`executive_actions`)**: 35 cases
  - 10 School field trip permission slips (Palm Beach Schools)
  - 10 Sports & camp liability waivers (Superstar Tennis)
  - 10 Utility & tuition bills due (FPL, PBC Water, SchoolCash Online)
  - 5 High-urgency past-due notices & credit card fraud alerts
- **Temporal Appointments (`temporal_appointments`)**: 35 cases
  - 10 Pediatric & dental appointments (Palm Pediatrics, Smile Dental, Coastal Ortho)
  - 8 Flight booking itineraries (Delta Air Lines, United Airlines)
  - 10 Sports practice, games, & swim meets (PB Aquatics, Superstar Tennis)
  - 7 Music lessons & rehearsals (Florida Youth Orchestra)
- **Lifecycle Updates (`lifecycle_updates`)**: 35 cases
  - 12 Flight schedule delays & gate changes (Delta, United)
  - 10 Order item cancellations & out-of-stock refunds (Amazon, Walmart, Target)
  - 8 Courier delivery delays & exception notices (UPS, FedEx)
  - 5 Doctor & dental appointment reschedules
- **Estate Knowledge (`estate_knowledge`)**: 30 cases
  - 12 School principal weekly digests & supply lists (Palm Beach Schools)
  - 10 HOA rules, gate access codes, & pool resurfacing bulletins (Mirasol HOA, Envera)
  - 8 Home HVAC & pool maintenance guides (Superior AC Repairs, FL Premier Pools)
- **Promotional Noise (`promotional_noise`)**: 35 cases
  - 15 Retail sales, flash deals, and clearance rollbacks (J.Crew, Pottery Barn, Best Buy, Crate & Barrel, Williams Sonoma, Nike, Apple)
  - 12 Discount coupons & food delivery vouchers (DoorDash, Instacart, Chewy, HelloFresh)
  - 4 Daily newsletters & digests (Morning Brew)
  - 4 Deceptive promotional emails with fake "Action Required" / "Order" headers

---

## 9. Recommendations for Milestone 2 Benchmark Dataset Implementation

1. **Benchmark Fixture Schema**: Check the curated 210 test cases into `tests/fixtures/email-benchmark.json` adhering to the required schema:
   ```json
   {
     "id": "BM-LOG-001",
     "archetype": "logistics_parcels",
     "subCategory": "ecommerce_order",
     "sender": "auto-confirm@amazon.com",
     "subject": "Your Amazon.com order #114-8291048-2849102 has shipped",
     "received_at": "2026-08-17T20:53:20Z",
     "body": "...",
     "expected_agency_level": 0,
     "expected_vendor": "Amazon",
     "expected_canonical_order_id": "114-8291048-2849102",
     "expected_tracking_number": "1Z9999999999999999",
     "expected_carrier": "ups",
     "expected_stage": "shipped",
     "expected_is_perishable": false,
     "expected_routing": "delivery_transit_items"
   }
   ```
2. **Deterministic Canonical Resolver Synchronization**: Maintain parity between `supabase/functions/_shared/canonical-order-resolver.mjs` and client-side `src/utils/vendorTransactions.ts`.
3. **Automated Evaluation Runner**: Verify all 210 benchmark cases with `scripts/email-benchmark-eval.mjs`, enforcing `>= 98%` classification accuracy and `0%` action queue leakage.
