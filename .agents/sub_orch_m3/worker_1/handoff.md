# Handoff Report: Milestone 3 — Deterministic Entity & Canonical Order Resolver

## 1. Observation
- **Shared Pure ES Module**: Created `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs` with 0 external dependencies (runs natively in Deno Edge Functions, Node.js test runner, and browser).
  - Exported functions: `VENDOR_ALIASES`, `normalizeKeyPart`, `canonicalizeOrderId`, `canonicalizeTrackingNumber`, `detectCarrierAndTracking`, `detectVendor`, `detectVendorAndOrder`, `buildCompositeThreadKey`, `resolveTransactionStage`, `resolveEffectiveStage`, `extractPolicyDisclaimer`, `isPerishableDelivery`, `formatDeliveryEta`, `resolveCanonicalEntity`.
- **Type Contract**: Added `CanonicalEntityResult` interface to `/Users/taboj/casa-tabor/src/types/index.ts` matching `PROJECT.md §Interface Contracts`.
- **Edge Function Harmonization**: Refactored `/Users/taboj/casa-tabor/supabase/functions/scan-gmail-inbox/index.ts` to import from `../_shared/canonical-order-resolver.mjs` and delegate transaction descriptor, canonical ID formatting, and composite thread keying directly to the shared module.
- **Client Synchronization**: Updated `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts` to support DHL carrier tracking, composite thread keying (`courier:${carrier}:${tracking}` and `transaction:${vendorKey}:${orderId}`), and exported canonical helpers while maintaining full backward compatibility for React UI hooks and consolidation utilities.
- **Unit Test Coverage**:
  - Created `/Users/taboj/casa-tabor/tests/canonical-order-resolver.test.mjs` covering 11 comprehensive test suites.
  - Expanded `/Users/taboj/casa-tabor/tests/vendor-transaction-producer.test.mjs` to 13 test suites.
- **Verification Results**:
  - `node --test tests/canonical-order-resolver.test.mjs` -> 11/11 passing (0 failed).
  - `node --test tests/vendor-transaction-producer.test.mjs` -> 13/13 passing (0 failed).
  - `node --test tests/canonical-order-resolver.test.mjs tests/vendor-transaction-producer.test.mjs tests/e2e-email-intelligence-tiers.test.mjs` -> 98/98 passing (0 failed).
  - `npm run build` -> Clean TypeScript compilation and Vite build with 0 errors.

## 2. Logic Chain
1. **Multi-Vendor Canonicalization Logic**:
   - Walmart: Strips leading `WM-` / `Order #`, converts 15/16 digit raw strings (`200015480824348`) to hyphenated 7-8 format (`2000154-80824348`).
   - Amazon: Normalizes 17-digit order IDs to `112-8472910-4829103` format and preserves `D01-...` digital order IDs.
   - Apple: Normalizes `W` followed by 9-10 digits to uppercase `W123456789`.
   - Nike: Normalizes `C0` and `C-` order IDs to uppercase `C0123456789` or `C-0123456789`.
   - Target: Cleanly extracts 10-14 digit standalone order numbers.
   - Jiffy: Isolates the 10-digit order ID (`2541442349`) when compound Cart ID strings appear (`Jacob's Cart #50 (Order #2541442349)`).
   - HelloFresh & Meal Kits: Identifies box references (`hf-`, `gc-`, `ba-`, `fact-`) and marks `isPerishable: true`.
2. **Multi-Carrier Courier Tracking & URL Generation**:
   - UPS: Recognizes 18-char `1Z...` formats and Mail Innovations barcodes, generating tracking URLs to `ups.com/track`.
   - FedEx: Recognizes 12, 14, 15, and 20-22 digit tracking numbers, generating tracking URLs to `fedex.com/fedextrack`.
   - USPS: Recognizes 20-24 digit domestic routing barcodes starting with 92/93/94/95 and 13-char international UPU S10 identifiers, generating tracking URLs to `tools.usps.com`.
   - DHL: Recognizes 10-11 digit Express/Freight AWB numbers and eCommerce `GM...` prefixes, generating tracking URLs to `dhl.com`.
3. **Composite Thread Key Precedence**:
   - Merchant orders: `transaction:${vendorKey}:${canonicalOrderId}` (e.g. `transaction:walmart:2000154-80824348`, `transaction:jiffy-com:2541442349`).
   - Standalone courier shipments: `courier:${carrier}:${normalizedTracking}` (e.g. `courier:ups:1z9999999999999999`, `courier:dhl:1234567890`).
   - Fallbacks: `transaction:${vendorKey}:items:${descriptor}`, `delivery:${vendorKey}:${dateKey}`, `transaction:${vendorKey}:message:${sourceRef}`.
4. **Lifecycle Progression & In-Preparation Lock**:
   - 6 monotonic stages: `confirmed` (0), `payment` (0), `shipped` (1), `out_for_delivery` (2), `delivered` (3), `problem` (-1).
   - "Being prepared", "Last minute to add items", and "Last call to edit" lock the transaction stage into `confirmed` (Step 0) even if newer emails arrive.
   - Passive claim policies ("Claims for missing items must be made within 3 days") are extracted into `policyDisclaimer` without triggering `problem` or high-agency actions (`agencyLevel: 0`).
5. **Future Arrival Date Guardrail & Past Courier Auto-Resolution**:
   - Future target dates (`deliveryDate > now`) will never resolve to `delivered`, overriding any ambiguous past-tense phrasing to `confirmed` / `shipped`.
   - Past same-day courier dispatches (`deliveryDate < now` and `stage === 'out_for_delivery'`) auto-resolve to `delivered`.
   - Past multi-day freight (`shipped`, `confirmed`, `payment`) remains in its active stage and does not prematurely auto-resolve.

## 3. Caveats
- `supabase/functions/_shared/canonical-order-resolver.mjs` uses pure native JavaScript `Date` and `Math.round` for calendar arithmetic to ensure 0 external npm dependencies when deployed to Deno Edge Functions.
- `src/utils/vendorTransactions.ts` retains `date-fns` for its React UI formatting helpers while sharing the identical business logic algorithms and stage resolution state machine.

## 4. Conclusion
Milestone 3 is complete and verified. The shared canonical order resolver module provides deterministic entity extraction, multi-vendor/carrier canonicalization, composite thread keying, monotonic lifecycle progression, and 0% executive action queue leakage across both client and server runtimes.

## 5. Verification Method
To independently verify this implementation:
```bash
# 1. Run canonical order resolver unit test suite
node --test tests/canonical-order-resolver.test.mjs

# 2. Run vendor transaction producer unit test suite
node --test tests/vendor-transaction-producer.test.mjs

# 3. Run combined milestone and E2E test suites (98 tests)
node --test tests/canonical-order-resolver.test.mjs tests/vendor-transaction-producer.test.mjs tests/e2e-email-intelligence-tiers.test.mjs

# 4. Verify TypeScript build and style audit
npm run build
```
