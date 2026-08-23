# Canonical Order Resolver & Deterministic Entity Specification
**Milestone 3: Domain Requirements, Patterns, State Machines & Guardrails**
**Author**: Explorer 3 (Specification Miner)
**Date**: 2026-08-23

---

## 1. Executive Summary & Architectural Role

The **Deterministic Entity & Canonical Order Resolver** subsystem provides multi-vendor canonical identity resolution, tense-aware lifecycle state machine progression, date guardrails, and 0% leakage filtering across Casa Tabor's client and edge function pipelines.

It bridges disparate and uncoordinated email communications (order confirmations, payment holds, modification deadlines, carrier tracking assignments, out-for-delivery notifications, proof-of-delivery receipts, and return policy footnotes) into a singular, unified, deterministic composite entity thread.

### Core Guarantees:
1. **Multi-Vendor Canonical Normalization**: Normalizes disparate order numbering schemes (Amazon 3-7-7, Walmart 7-8, Apple W-prefix, Nike C0-prefix, Target digits, Jiffy 10-digit IDs, HelloFresh box IDs) into deterministic canonical strings regardless of input hyphenation, whitespace, or prefixes.
2. **Multi-Carrier Tracking Resolution**: Normalizes courier tracking numbers across UPS (1Z / 18-char), FedEx (12/14/15/20/22 digits), USPS (20-22 digits, 13-char international), and DHL (10-11 digits) and binds them to vendor order records.
3. **Composite Thread Keying**: Generates persistent thread keys (`transaction:${vendorKey}:${orderId}`, `courier:${carrier}:${tracking}`, `delivery:${vendorKey}:${dateKey}`) that seamlessly consolidate multi-stage updates into a single hero entity with full update history.
4. **Tense-Aware Lifecycle Progression**: Implements a 6-stage monotonic state machine (`confirmed` -> `payment` -> `shipped` -> `out_for_delivery` -> `delivered` / `problem`) that prevents regressions from delayed receipt emails while honoring active modification windows ("Being Prepared" / "Last call to add items").
5. **Temporal Guardrails**:
   - *Future Arrival Date Guardrail*: Orders scheduled for future delivery target dates strictly stay in transit and never prematurely resolve to `delivered` even if ambiguous past-tense strings occur.
   - *Past Courier Auto-Resolution*: Same-day courier dispatches (`out_for_delivery`) from past calendar days automatically resolve to `delivered`, while active transit orders (`shipped`/`confirmed`) remain open.
6. **0% Executive Action Queue Leakage**: Strict partitioning ensures passive logistics tracking, merchant shipping updates, and return/claim policy disclaimers are assigned `agency_level: 0` and routed to the Logistics Radar / Inbound Manifest, creating zero false tasks or calendar noise.

---

## 2. Authoritative Interface Contracts

### 2.1 Canonical Entity Result Contract
Shared contract between client (`src/utils/vendorTransactions.ts`) and edge functions (`supabase/functions/_shared/canonical-order-resolver.mjs`):

```typescript
export type DeliveryTransitStage =
  | 'confirmed'
  | 'payment'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'problem'

export interface CanonicalEntityResult {
  vendor: string
  vendorKey: string
  orderId: string | null
  canonicalOrderId: string | null
  trackingNumber: string | null
  carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null
  compositeThreadKey: string
  effectiveStage: DeliveryTransitStage
  rawStage: DeliveryTransitStage
  isPerishable: boolean
  cost: string | null
  itemSummary: string | null
  etaDisplay: string | null
  deliveryDate: string | null // ISO string YYYY-MM-DD
  policyDisclaimer: string | null
  agencyLevel: number // 0 for passive logistics radar, >=1 for human action
}
```

### 2.2 Client Delivery Transit Item Contract (`src/types/index.ts`)
```typescript
export interface DeliveryUpdateEvent {
  id: string
  title: string
  description?: string | null
  stage: DeliveryTransitStage
  occurredAt: string
  sourceRef?: string | null
  rawItem?: PrepItem
}

export interface DeliveryTransitItem {
  id: string
  threadKey: string
  vendor: string
  title: string
  itemSummary: string | null
  stage: DeliveryTransitStage
  cost?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  etaDisplay?: string | null
  isPerishable?: boolean
  occurredAt: string
  rawItem: PrepItem
  policyDisclaimer?: string | null
  updateHistory?: DeliveryUpdateEvent[]
}
```

---

## 3. Multi-Vendor Order Number Patterns & Canonicalization Rules

| Vendor | Raw Input Pattern(s) | Regex Pattern | Canonical Normalization Algorithm | Canonical Example |
|---|---|---|---|---|
| **Amazon** | 17 digits, standard 3-7-7 hyphenated, unhyphenated, `#` prefix | `\b(?:\d{3}-\d{7}-\d{7}|\d{17})\b` | Extract digits only. If length == 17, format as `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`. Otherwise lowercase normalized key. | `112-8472910-4829103` |
| **Walmart** | 15-16 digits, standard 7-8 hyphenated, unhyphenated starting with `2000` or `1000`, `WM:` prefix, `#` prefix | `\b(?:2000\|1000)\d{3}-\d{8}\b` or `\b(?:2000\|1000)\d{11,13}\b` or `\b\d{15,16}\b` | Extract digits only. If length == 15 or 16, format as `${d.slice(0,7)}-${d.slice(7)}`. Otherwise lowercase normalized key. | `2000154-80824348` |
| **Apple** | Web Order Number starting with 'W' followed by 9-10 digits | `\bW\d{9,10}\b` (case-insensitive) | Strip non-alphanumeric, convert to uppercase (`clean.toUpperCase()`). | `W123456789` |
| **Nike** | Order Number starting with 'C0' or 'C-' followed by 9-11 digits | `\bC0\d{9,11}\b` or `\bC-\d{9,11}\b` (case-insensitive) | Strip dashes if `C-`, convert to uppercase (`clean.replace(/^C-/, 'C0').toUpperCase()`). | `C0123456789` |
| **Target** | 9-14 numeric digits, optionally preceded by Target context or `#` | `\btarget\b[^\d]*(\d{9,14})\b` or `#(\d{9,14})\b` | Clean non-digits, return standard digit string. | `987654321012` |
| **Jiffy** | 8-12 numeric digits (typically 10 digits), e.g. "Order #2541442349", "Cart #50 (Order #2541442349)" | `\b(?:order\s*#?\s*|#)(\d{8,12})\b` | Extract explicit Order # (ignore Cart #), return clean numeric string. | `2541442349` |
| **HelloFresh & Meal Kits** | Meal kit box orders starting with `HF-`, `GC-`, `BA-`, `FACT-` followed by 6-10 digits | `\b(?:HF\|GC\|BA\|FACT)-\d{6,10}\b` (case-insensitive) | Convert to uppercase (`clean.toUpperCase()`). | `HF-12345678` |
| **General / Long-Tail** | Explicit `Order #`, `Confirmation #`, `Invoice #`, `orderId=`, `#123456...` | `\b(?:order\|cart\|confirmation\|reference\|invoice\|receipt\|wm)\s*(?:number\|no\.?\|id\|#\|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b` | Strip `#`, `:`, whitespace; lowercase and replace non-alphanumeric with hyphens. | `order-9912` |

### Vendor Alias Mapping
Vendor detection maps email headers, body text, and sender domains:
- `Walmart`: `['walmart.com', 'walmart+', 'walmart', 'inhome', 'walmart grocery', 'walmart inhome']`
- `Amazon`: `['amazon.com', 'amazon', 'prime', 'amazon fresh', 'whole foods']`
- `Jiffy.com`: `['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy']`
- `HelloFresh`: `['hellofresh', 'hello fresh', 'greenchef', 'green chef', 'factor75', 'blue apron']`
- `Target`: `['target.com', 'target', 'shipt']`
- `Apple`: `['apple.com', 'apple store', 'apple']`
- `Nike`: `['nike.com', 'nike']`
- `Instacart`: `['instacart.com', 'instacart']`
- `DoorDash`: `['doordash.com', 'doordash']`
- `Uber Eats`: `['ubereats.com', 'uber eats', 'ubereats']`
- `Etsy`: `['etsy.com', 'etsy']`
- `Sephora`: `['sephora.com', 'sephora']`
- `Nordstrom`: `['nordstrom.com', 'nordstrom']`
- `Chewy`: `['chewy.com', 'chewy']`
- `Pottery Barn`: `['potterybarn.com', 'pottery barn']`
- `Williams Sonoma`: `['williams-sonoma.com', 'williams sonoma']`
- `Couriers`: `FedEx`, `UPS`, `USPS`, `DHL`

---

## 4. Courier Tracking Formats & Normalization

| Carrier | Tracking Format | Regex Pattern | Checksum / Normalization | Canonical Form |
|---|---|---|---|---|
| **UPS** | 1Z format (18 alphanumeric: `1Z` + 6-char Shipper Account + 2-digit Service + 8-char Package ID) | `\b1Z[0-9A-Z]{16}\b` (case-insensitive) | Uppercase conversion. Optional Mod 10 check digit verification. | `1Z9999999999999999` |
| **UPS (Numeric / MI)** | 9-12 digits (Ground/Freight) or 22-34 digits (Mail Innovations) | `\b(?:ups|tracking)\b[^\d]*(\d{9,12})\b` or `\b(92\d{20,32})\b` | Numeric string. | `9274890123456789012345` |
| **FedEx** | Standard Express/Ground 12-digit, Ground 15-digit, SmartPost 14-digit, Barcode 20-digit, Ground96 22-digit | `\b(?:fedex|tracking)\b[^\d]*(\d{12}\|\d{14}\|\d{15}\|\d{20,22})\b` or standalone `\b\d{12}\b` / `\b\d{15}\b` | Clean non-digits. | `987654321012` |
| **USPS** | Domestic routing barcode 20-24 digits (typically 22 digits starting with 92, 93, 94, 95) | `\b(9[2345]\d{20,24})\b` | Clean non-digits. | `9400100000000000000000` |
| **USPS (International)** | UPU S10 format (13 characters: 2 letters + 9 digits + 2 letters country code, e.g. `US`) | `\b([A-Z]{2}\d{9}[A-Z]{2})\b` (case-insensitive) | Uppercase conversion. | `EA123456789US` |
| **DHL** | Express 10 digits, Freight 11 digits, or eCommerce with prefix GM/LX/RX/JD | `\b(?:dhl|tracking)\b[^\d]*(\d{10,11})\b` or `\b(?:GM\|LX\|RX\|JD)\d{10,20}\b` | Uppercase alphanumeric / clean digits. | `1234567890` |

### Tracking URL Generation
- UPS: `https://www.ups.com/track?tracknum=${trackingNumber}`
- FedEx: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`
- USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`
- DHL: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`

---

## 5. Composite Thread Keys & Multi-Stage Consolidation Mechanics

### 5.1 Key Hierarchy & Syntax
The composite thread key provides an absolute identity across disparate emails:

1. **Vendor Order Key (Primary)**:
   ```
   transaction:${vendorKey}:${canonicalOrderId}
   ```
   *Examples*:
   - `transaction:walmart:2000154-80824348`
   - `transaction:amazon:112-8472910-4829103`
   - `transaction:jiffy-com:2541442349`
   - `transaction:apple:w123456789`
   - `transaction:nike:c0123456789`

2. **Courier Tracking Key (Standalone Carrier Shipment)**:
   ```
   courier:${carrier}:${normalizedTrackingNumber}
   ```
   *Examples*:
   - `courier:ups:1z9999999999999999`
   - `courier:fedex:987654321012`
   - `courier:usps:9400100000000000000000`
   - `courier:dhl:1234567890`

3. **Date-Based Fallback Delivery Key (No Order ID)**:
   ```
   delivery:${vendorKey}:${dateKey}`
   ```
   *Example*: `delivery:walmart:2026-08-19`

### 5.2 Multi-Email Consolidation Lifecycle Flow
```
+-----------------------------------------------------------------------------------+
| Email 1: Order Placed (Walmart)                                                   |
| - Subject: "Thanks for your InHome order #2000154-80824348"                       |
| - Stage: confirmed (Being Prepared)                                               |
| - ThreadKey: transaction:walmart:2000154-80824348                                 |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| Email 2: Modification / Add Items Notice                                          |
| - Subject: "Last minute to add more to your order #2000154-80824348"              |
| - Stage: confirmed (In Preparation lock)                                          |
| - ThreadKey: transaction:walmart:2000154-80824348                                 |
| - Result: Merges in place, appends to updateHistory, retains confirmed stage      |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| Email 3: Payment Hold / Pricing Summary                                           |
| - Subject: "Temporary hold is $138.65 for order #2000154-80824348"                |
| - Stage: payment                                                                  |
| - ThreadKey: transaction:walmart:2000154-80824348                                 |
| - Result: Merges cost ($138.65), stage stays confirmed (does not regress)        |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| Email 4: Driver Dispatch / Out for Delivery                                       |
| - Subject: "Your InHome delivery should arrive by 3:44pm (27 items)"              |
| - Stage: out_for_delivery                                                         |
| - ThreadKey: transaction:walmart:2000154-80824348                                 |
| - Result: Stage advances to out_for_delivery, merges item summary + ETA window     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| Email 5: Delivery Confirmation / Drop-off Receipt                                 |
| - Subject: "Your package has been delivered to front door"                        |
| - Stage: delivered                                                                |
| - ThreadKey: transaction:walmart:2000154-80824348                                 |
| - Result: Stage advances to delivered, ETA displays "Delivered today"             |
+-----------------------------------------------------------------------------------+
```

### 5.3 Cross-Referencing & Date Key Collapse
In `consolidateTransitItems`:
- If an item has a generic date key `delivery:${vendor}:${dateKey}` (e.g. `delivery:walmart:2026-08-19`), it searches for any explicit order `transaction:${vendor}:${orderId}` for the same vendor on the same date or within a **36-hour window**.
- When a match is found, the generic date-keyed item merges directly into the explicit transaction thread, preventing duplicate cards on the UI.

---

## 6. Lifecycle State Machine Formal Specification

### 6.1 State Definitions & Stepper Ranks

| Stage | Priority Rank | Stepper Step Index | Meaning & UI Interpretation | Trigger Phrases / Indicators |
|---|---|---|---|---|
| `confirmed` | 0 | Step 0 | Order placed, received, or being prepared in warehouse / store. Active editing window. | `order confirmation`, `thank you for your order`, `order received`, `being prepared`, `last minute to add`, `last call to edit`, `edit your order`, `arriving [future date]` |
| `payment` | 1 | Step 0 | Payment charge, receipt, or temporary hold without separate delivery tracking. | `receipt for payment`, `charged for`, `temporary hold`, `order total`, `payment method` |
| `shipped` | 2 | Step 1 | Order dispatched from fulfillment center, in transit with carrier, tracking assigned. | `shipped`, `has shipped`, `package on the way`, `in transit`, `dispatched`, `carrier tracking`, `shipment for` |
| `out_for_delivery` | 3 | Step 2 | Driver is actively en route on the day of delivery. Active delivery window. | `out for delivery`, `driver is on the way`, `driver heading your way`, `arriving soon`, `should arrive by [time] today` |
| `delivered` | 4 | Step 3 | Package dropped off, confirmed delivery with proof of drop-off. | `has been delivered`, `was delivered`, `package delivered`, `delivered at [time]`, `delivered to front porch/door/garage`, `proof of delivery` |
| `problem` | 5 | Step -1 | Delivery exception, cancellation, missing item report, failed delivery. | `cancelled`, `canceled`, `delivery failed`, `delivery exception`, `package was damaged`, `item is missing` |

### 6.2 Transition Matrix

| From Stage \ To Event | `confirmed` / In Preparation | `payment` Notice | `shipped` Notice | `out_for_delivery` Notice | `delivered` Notice | `problem` / Cancellation |
|---|---|---|---|---|---|---|
| **(initial)** | `confirmed` | `payment` | `shipped` | `out_for_delivery` | `delivered` (if not future) | `problem` |
| **`confirmed`** | `confirmed` (update in place) | `confirmed` (merge cost) | `shipped` | `out_for_delivery` | `delivered` | `problem` |
| **`payment`** | `confirmed` (upgrade) | `payment` | `shipped` | `out_for_delivery` | `delivered` | `problem` |
| **`shipped`** | `shipped` (retain) | `shipped` (retain) | `shipped` (update history) | `out_for_delivery` | `delivered` | `problem` |
| **`out_for_delivery`** | `out_for_delivery` (retain) | `out_for_delivery` (retain) | `out_for_delivery` (retain) | `out_for_delivery` (update ETA) | `delivered` | `problem` |
| **`delivered`** | `delivered` (retain) | `delivered` (retain) | `delivered` (retain) | `delivered` (retain) | `delivered` (retain) | `problem` |
| **`problem`** | `problem` (locked) | `problem` (locked) | `problem` (locked) | `problem` (locked) | `problem` (locked) | `problem` (locked) |

### 6.3 Transition Guardrails & Invariants
1. **Monotonic Forward Progression**: Incoming stages with higher rank advance the merged stage (`mergedStage = incomingRank > existingRank ? incoming.stage : existing.stage`).
2. **Regression Prevention**: Delayed emails (e.g. late credit card charge receipt arriving 2 hours after package shipped) CANNOT demote `shipped` or `out_for_delivery` back to `payment`.
3. **Active Preparation Special Rule**: If the latest incoming email explicitly contains "being prepared" / "last minute to add items", the stage is explicitly pinned to `confirmed` (in preparation) regardless of timestamps, ensuring the user sees the active modification window.
4. **Problem State Dominance**: Any `problem` or `cancellation` status immediately locks the thread to `problem` (Stepper -1).

---

## 7. Temporal Date Logic & Guardrails

### 7.1 Future Arrival Date Guardrail
**Rule**: An order whose delivery target date is strictly in the future relative to the reference evaluation date (`deliveryStart > todayStart`) MUST NOT be marked as `delivered`, even if ambiguous past-tense keywords (e.g. "delivered by Monday", "order processed") appear in the raw text.

**Algorithm**:
```typescript
const todayStart = startOfDay(now)
const deliveryStart = startOfDay(deliveryDate)

if (isBefore(todayStart, deliveryStart)) {
  if (rawStage === 'delivered') {
    return 'confirmed' // or 'shipped' if tracking exists
  }
  return rawStage
}
```

### 7.2 Past Courier Auto-Resolution Rule
**Rule**: Same-day courier dispatches (`out_for_delivery`) from past calendar days (`deliveryStart < todayStart`) automatically transition to `delivered`.
- **Constraint**: `confirmed`, `payment`, and `shipped` items from past days MUST NEVER auto-resolve to `delivered` — they may represent delayed warehouse shipments, long-haul multi-day parcel transit, or backordered items.

**Algorithm**:
```typescript
if (isBefore(deliveryStart, todayStart)) {
  if (rawStage === 'out_for_delivery') {
    return 'delivered'
  }
}
```

### 7.3 Relative Date Anchoring
**Rule**: All relative date/time references in email bodies ("today", "tomorrow", "this afternoon", "arriving Monday") MUST be computed relative to the **Email Header Sent/Received Date** (`Date:` / `created_at`), NOT the current system clock at scan time.

### 7.4 ETA Display Formatting
```typescript
if (stage === 'problem') return 'Delivery exception'
if (stage === 'delivered') {
  if (!deliveryDate) return 'Delivered'
  const diff = differenceInCalendarDays(deliveryDate, now)
  if (diff === 0) return 'Delivered today'
  if (diff === -1) return 'Delivered yesterday'
  return `Delivered ${format(deliveryDate, 'MMM d')}`
}
if (!deliveryDate) return rawEta || null
const diff = differenceInCalendarDays(deliveryDate, now)
if (diff === 0) return rawEta || 'Today'
if (diff === 1) return rawEta ? `Tomorrow (${rawEta})` : 'Tomorrow'
if (diff > 1) return format(deliveryDate, 'EEE, MMM d')
if (isBefore(deliveryDate, startOfDay(now))) return `Delivered ${format(deliveryDate, 'MMM d')}`
```

---

## 8. Executive Action Queue Filtering & Policy Disclaimer Extraction

### 8.1 0% Leakage Guarantee Architecture
The Executive Action Queue is strictly reserved for high-agency human tasks (school forms, medical waivers, tuition payments, sports RSVPs). Logistics tracking, delivery notifications, and merchant terms must NEVER leak into actionable queues.

```
Incoming Email / PrepItem
           │
           ▼
┌────────────────────────────────────────────────────────┐
│ Filter Condition:                                      │
│ item.agency_level === 0 || isDeliveryTransitItem(item) │
└────────────────────────────────────────────────────────┘
           │
           ├── TRUE ──► Route to DeliveryTransitItem (Logistics Radar / Inbound Manifest)
           │            [0% Action Queue Leakage, 0 False Calendar Events]
           │
           └── FALSE ─► Route to ActionableItems (Executive Action Queue)
                        [Requires human action: forms, bills, waivers]
```

### 8.2 Policy Disclaimer Extraction
- **Keywords**:
  `\b(?:claims? for (?:missing|wrong|damaged|lost)|claims? must be made within|return window|return (?:by|eligible)|final delivery|shipment for)\b/i`
- **Metadata Handling**:
  - Captured into `policy_disclaimer` field (e.g. *"Claims for missing, wrong, or damaged items must be made within 3 days of final delivery"*).
  - Stored and displayed as secondary metadata inside the Inbound Manifest card inspection sidecar.
  - Crucially: Does **NOT** trigger `problem` stage, does **NOT** create a deadline action item, and does **NOT** create a calendar reminder.

---

## 9. Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Normalization | Amazon Order Canonicalizer | Normalizes 17-digit Amazon orders with or without hyphens into standard `3-7-7` format (`XXX-XXXXXXX-XXXXXXX`). | Raw Amazon order string or text | Canonical `XXX-XXXXXXX-XXXXXXX` string | Returns normalized key part if invalid length | Codebase (`src/utils/vendorTransactions.ts`) & Amazon Spec |
| 2 | Normalization | Walmart Order Canonicalizer | Normalizes 15-16 digit Walmart order IDs into standard `7-8` format (`XXXXXXX-XXXXXXXX`). | Raw Walmart order string or text | Canonical `XXXXXXX-XXXXXXXX` string | Returns normalized key part if invalid length | Codebase (`src/utils/vendorTransactions.ts`) & Walmart InHome Corpus |
| 3 | Normalization | Apple Order Canonicalizer | Normalizes Apple Web Order IDs starting with `W` followed by 9-10 digits into uppercase `WXXXXXXXXX`. | Raw Apple order string | Canonical uppercase `WXXXXXXXXX` | Returns uppercase string | Codebase & Apple Store Spec |
| 4 | Normalization | Nike Order Canonicalizer | Normalizes Nike order numbers starting with `C0` or `C-` followed by 9-11 digits into uppercase `C0XXXXXXXXX`. | Raw Nike order string | Canonical uppercase `C0XXXXXXXXX` | Returns uppercase string | Codebase & Nike Order Spec |
| 5 | Normalization | Target Order Canonicalizer | Extracts 9-14 digit Target order numbers from subject/body and normalizes to standard digit string. | Raw Target text / order ID | Canonical numeric string | Returns null if non-numeric | Codebase & Target Order Spec |
| 6 | Normalization | Jiffy Order Canonicalizer | Extracts 10-digit Jiffy order numbers while ignoring Cart numbers in compound titles. | Raw Jiffy text / order ID | Canonical numeric string (e.g. `2541442349`) | Returns null if not found | Codebase (`tests/vendor-transaction-producer.test.mjs`) |
| 7 | Normalization | Meal Kit Order Canonicalizer | Normalizes HelloFresh, Green Chef, Blue Apron, Factor75 box order IDs (`HF-`, `GC-`, `BA-`, `FACT-`). | Raw meal kit text / order ID | Uppercase prefixed string (`HF-12345678`) | Returns normalized key part | Codebase & Meal Kit Spec |
| 8 | Carrier | UPS Tracking Normalizer | Identifies and normalizes 18-char 1Z UPS tracking numbers (`1Z...`) and Mail Innovations numbers. | Raw text containing UPS tracking | Carrier `ups`, uppercase tracking string, tracking URL | Returns null if invalid | UPS Tracking API Spec & Codebase |
| 9 | Carrier | FedEx Tracking Normalizer | Identifies and normalizes 12, 14, 15, 20, 22-digit FedEx tracking numbers. | Raw text containing FedEx tracking | Carrier `fedex`, normalized tracking string, tracking URL | Returns null if invalid | FedEx Tracking Spec & Codebase |
| 10 | Carrier | USPS Tracking Normalizer | Identifies and normalizes 20-24 digit USPS routing barcodes and 13-char international S10 formats. | Raw text containing USPS tracking | Carrier `usps`, normalized tracking string, tracking URL | Returns null if invalid | USPS Postal Barcode Spec & Codebase |
| 11 | Carrier | DHL Tracking Normalizer | Identifies and normalizes 10-11 digit DHL Express/eCommerce tracking numbers. | Raw text containing DHL tracking | Carrier `dhl`, normalized tracking string, tracking URL | Returns null if invalid | DHL Express Spec & Codebase |
| 12 | Keying | Composite Thread Key Generator | Unifies vendor orders and courier tracking into hierarchical thread keys (`transaction:`, `courier:`, `delivery:`). | `PrepItem` or parsed email fields | Unique composite thread key string | Falls back to message ID or date key | Codebase & M3 Scope |
| 13 | Keying | Generic Date Key Collapse | Automatically merges `delivery:${vendor}:${date}` items into explicit `transaction:${vendor}:${orderId}` within 36 hours. | Array of `DeliveryTransitItem` | Consolidated deduplicated array | Retains distinct date key if no order matches | Codebase (`consolidateTransitItems`) |
| 14 | State Machine | 6-Stage Monotonic Progression | Advances order status forward through `confirmed` -> `payment` -> `shipped` -> `out_for_delivery` -> `delivered`. | Existing item and incoming update | Merged stage with highest priority rank | Locked on `problem` state | Codebase (`mergeDeliveryTransitItem`) |
| 15 | State Machine | In Preparation Lock | Explicitly pins stage to `confirmed` (in preparation) when "being prepared" / "last call to edit" is detected. | Raw email text / update | Stage `confirmed`, Stepper index 0 | Overrides newer timestamps | Codebase (`tests/vendor-transaction-producer.test.mjs`) |
| 16 | State Machine | Problem / Exception Handling | Captures delivery failures, damaged items, and cancellations into `problem` stage (Stepper -1). | Cancellation / failure signals | Stage `problem`, Stepper -1 | Disclaimers ignored unless actual failure | Codebase (`transactionStage`) |
| 17 | Date Logic | Future Arrival Date Guardrail | Prevents future delivery target dates from prematurely marking as `delivered`. | Delivery Date, Reference Date, Stage | Stage downgraded to `confirmed`/`shipped` | Returns raw stage if date <= today | Codebase (`resolveEffectiveStage`) |
| 18 | Date Logic | Past Courier Auto-Resolution | Automatically transitions past same-day `out_for_delivery` courier dispatches to `delivered`. | Delivery Date, Reference Date, Stage | Stage `delivered` if past out_for_delivery | Confirmed/shipped items remain open | Codebase (`resolveEffectiveStage`) |
| 19 | Date Logic | Relative Date Header Anchoring | Anchors relative phrases ("today", "arriving Monday") to email sent date header, not scan clock. | Email Sent Date, Relative String | Absolute ISO date string | Fallback to email sent date | Codebase (`supabase/functions/scan-gmail-inbox`) |
| 20 | Date Logic | Dynamic ETA Display Formatter | Renders glanceable ETA strings ("Today", "Tomorrow (by 3pm)", "Delivered yesterday", "Mon, Aug 24"). | Raw ETA, Delivery Date, Stage, Now | Formatted human-readable string | Falls back to raw ETA or formatted date | Codebase (`formatDeliveryEta`) |
| 21 | Queue Filtering | 0% Executive Action Leakage | Routes all logistics and `agency_level: 0` items away from Action Queue into Inbound Manifest. | Array of `PrepItem` | Separated `actionableItems` and `deliveryTransitItems` | Items without action requirement filtered | Codebase (`splitActionableAndTransitItems`) |
| 22 | Queue Filtering | Policy Disclaimer Extractor | Extracts return and claim windows into metadata without creating false tasks or calendar events. | Email body / description text | String `policyDisclaimer` on item | Returns null if no disclaimer found | Codebase (`actionInspectionSynthesis.ts`) |
| 23 | Aggregation | Update History Chronology | Aggregates and deduplicates multi-email timeline events into a sorted chronological history array. | Existing and incoming history | Deduplicated, timestamp-sorted `DeliveryUpdateEvent[]` | Drops duplicate event IDs | Codebase (`mergeDeliveryTransitItem`) |
| 24 | Aggregation | Item Summary Synthesis | Merges generic descriptions ("Package") with specific item counts and grocery details ("27 items including C2O"). | Multiple summary strings | Richest, most specific summary string | Falls back to "Grocery Delivery" / "Package" | Codebase (`mergeItemSummary`) |
| 25 | Aggregation | Cost & Charge Consolidation | Extracts and consolidates dollar amounts (`$138.65`) from payment holds and order totals. | Email text / amounts | Extracted formatted dollar amount | Returns null if no dollar match | Codebase (`extractAmount`) |

---

## 10. Edge Cases & Observed / Specified Behaviors

| # | Feature | Input / Scenario | Observed & Specified Behavior |
|---|---|---|---|
| 1 | Walmart Normalization | Unhyphenated 15-digit numeric string: `"200015480824348"` | Normalizes to `"2000154-80824348"` and produces threadKey `transaction:walmart:2000154-80824348`. |
| 2 | Walmart Normalization | Hyphenated string with leading prefix: `"Order # 2000154-80824348"` | Strips prefix and produces canonical `2000154-80824348`. Hyphenated and unhyphenated inputs produce identical threadKeys. |
| 3 | Amazon Normalization | Unhyphenated 17-digit string: `"11284729104829103"` | Normalizes to `"112-8472910-4829103"` and produces threadKey `transaction:amazon:112-8472910-4829103`. |
| 4 | Apple Normalization | Lowercase web order string: `"w123456789"` | Normalizes to uppercase `"W123456789"` and threadKey `transaction:apple:w123456789`. |
| 5 | Nike Normalization | Lowercase dashed order string: `"c-0123456789"` or `"c0123456789"` | Normalizes to uppercase `"C0123456789"` and threadKey `transaction:nike:c0123456789`. |
| 6 | Jiffy Extraction | Compound text: `"Jacob's Cart #50 (Order #2541442349)"` | Correctly extracts order ID `2541442349` (ignoring Cart #50) and produces threadKey `transaction:jiffy-com:2541442349`. |
| 7 | Future Date Guardrail | Email sent Saturday Aug 22: `"Your order is arriving on Monday, Aug 24"` with snippet `"package delivered to front door"` | `resolveEffectiveStage` evaluates Saturday < Monday, detects future date, overrides `delivered` stage to `confirmed`, flags `isItemScheduledLater = true`, and sets ETA display to `"Mon, Aug 24"`. |
| 8 | Past Courier Auto-Resolution | Courier email from yesterday: `out_for_delivery` for Walmart InHome on Aug 19, evaluated on Aug 20 | `resolveEffectiveStage` detects delivery date (Aug 19) < evaluation date (Aug 20) with stage `out_for_delivery`, auto-advances to `delivered`, and displays `"Delivered yesterday"`. |
| 9 | Past Transit Open Orders | Warehouse shipping email from yesterday: `shipped` via UPS on Aug 19, evaluated on Aug 20 | `resolveEffectiveStage` leaves stage as `shipped` (does NOT auto-resolve to delivered, as ground transit takes 2-5 days). |
| 10 | Active Preparation Lock | Order placed yesterday (`confirmed`), follow-up email received today: `"You have until 1:00 PM to add items. Your order is being prepared."` | Stage is explicitly held at `confirmed` (in preparation), stepper index remains Step 0, and item is flagged as arriving today. |
| 11 | Delayed Payment Receipt | Email 1: Order shipped (`shipped`). Email 2 (2 hours later): Credit card receipt (`payment`) | `mergeDeliveryTransitItem` retains `shipped` stage (rank 2 > rank 1), merges cost into entity, and appends payment notice to `updateHistory`. |
| 12 | Policy Disclaimer Leakage | Email body: `"Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27)."` | Disclaimer is extracted into `policyDisclaimer` metadata. `isDeliveryTransitItem` returns `true`, `agency_level` is set to `0`, `splitActionableAndTransitItems` routes it to `deliveryTransitItems` with **0 actionable items** and **0 calendar events**. |
| 13 | Generic Date Key Collapse | Email 1: Generic InHome window `"delivery:walmart:2026-08-19"`. Email 2: Explicit order `"transaction:walmart:2000154-80824348"` on same date | `consolidateTransitItems` merges Email 1 into Email 2, yielding exactly **1 Hero item** on the dashboard with merged item summary, cost, and ETA. |
| 14 | Problem / Damaged Package | Email body: `"Your shipment suffered a delivery exception: package was damaged in transit."` | `transactionStage` returns `'problem'`, stepper index is `-1`, and ETA display is `"Delivery exception"`. |
| 15 | Ambiguous Disclaimer vs Real Problem | Email body: `"Return window is 14 days. If your package was damaged, contact support."` | Recognized as a passive policy disclaimer (no actual damage occurred), stage remains `shipped`, `policyDisclaimer` is populated, and `problem` stage is NOT triggered. |
| 16 | Compound Courier Update | UPS email with tracking `1Z9999999999999999` received for an existing Jiffy order | Maps tracking number to `transaction:jiffy-com:2541442349`, attaches carrier `ups` and tracking URL, and advances stage to `shipped`. |

---

## 11. Implementation Architecture & Test Strategy for Milestone 3

### 11.1 Module Architecture
1. **Shared Resolver Module (`supabase/functions/_shared/canonical-order-resolver.mjs`)**:
   - Pure, dependency-free ES module usable in Deno Edge Functions and Node.js test runners.
   - Exports: `canonicalizeOrderId`, `extractVendorAndOrderId`, `identifyCarrierAndTracking`, `generateCompositeThreadKey`, `resolveEffectiveStage`, `resolveTransactionStage`, `extractPolicyDisclaimer`, `buildCanonicalEntityResult`.
2. **Client Transaction Utilities (`src/utils/vendorTransactions.ts`)**:
   - Imports or mirrors shared logic, providing React-optimized helpers (`buildDeliveryTransitItem`, `consolidateTransitItems`, `mergeDeliveryTransitItem`, `isItemArrivingToday`, `isItemScheduledLater`, `isItemInTransit`, `isItemDelivered`, `formatDeliveryEta`).
3. **Partitioning & Feed Coordinator (`src/utils/needsYouFeed.ts`)**:
   - Uses `splitActionableAndTransitItems` to guarantee 0% leakage into Executive Action Queue for any item with `agency_level: 0` or `isDeliveryTransitItem(item) === true`.

### 11.2 Verification Test Matrix
- **`tests/vendor-transaction-producer.test.mjs`**: Comprehensive suite verifying Walmart, Jiffy, Amazon, Apple, Nike order normalization, 0% leakage, InHome preparation locking, future date guardrails, and past courier resolution.
- **`tests/canonical-order-resolver.test.mjs`**: Edge function unit tests for pure canonical order resolver functions across all 7+ vendors and 4 courier tracking formats.
- **`tests/home-needs-you-priority-order.test.mjs`**: Full feed ranking tests ensuring high-agency items rank above passive logistics radar updates.
