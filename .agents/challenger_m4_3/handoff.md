# Milestone 4 Challenger 3 Handoff Report

**Author**: Challenger M4-3 (Empirical Challenger, Critic, Specialist)  
**Milestone**: Milestone 4 (Autonomous Active-Learning Ingestion Engine)  
**Target Modules**: `capture-command-router.mjs`, `compound-decomposer.mjs`, `useHouseholdCaptureRules.ts`, `few-shot-exemplar-store.mjs`  
**Date**: 2026-08-23T12:35:45Z  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

A dedicated empirical adversarial verification suite was created and executed at `tests/challenger-m4-adversarial.test.mjs`.

### 1.1 Verified & Certified Hardening Fixes (5 of 6 Clean)
1. **Smart/Curly Quote Stripping** (`cleanPatternValue` in `supabase/functions/_shared/capture-command-router.mjs:225-231`):
   - Verified that `cleanPatternValue` cleanly strips leading/trailing ASCII quotes (`" '`), iOS/macOS smart double curly quotes (`“ ”`), smart single curly quotes (`‘ ’`), and guillemets (`« »`).
   - Verified that internal phrase apostrophes (e.g. `“jacob’s bakery receipts” are logistics` -> `jacob’s bakery receipts`) are strictly preserved.
   - Tested in `CHALLENGE-1.1`, `CHALLENGE-1.2`, `CHALLENGE-1.3` (PASS).

2. **Suppression Parser with Modifiers** (`parseVoiceDirective` in `supabase/functions/_shared/capture-command-router.mjs:128-134`):
   - Verified that adjectives (`weekly`, `daily`, `monthly`, `promotional`, `all`, `the`) and prepositional phrases (`from`, `about`, `of`, `on`) are cleanly stripped from suppression inputs (e.g. `"do not extract weekly newsletters from target.com"` -> `target.com`).
   - Tested in `CHALLENGE-3.1` (PASS).

3. **Untrain Parser with Prefixes** (`parseVoiceDirective` in `supabase/functions/_shared/capture-command-router.mjs:106-124`):
   - Verified that prefix order `/^\s*(?:the\s+)?rule\s+(?:for|about|on|from)\s+/i` correctly normalizes `"untrain rule for tennis updates"`, `"forget the rule for bakery receipts"`, `"delete rule about target.com"`, and `"remove the rule on field trip waivers"` into clean pattern values with `active: false`.
   - Tested in `CHALLENGE-4.1` (PASS).

4. **Daypart Precision in Date Anchoring** (`anchorRelativeDate` in `supabase/functions/_shared/compound-decomposer.mjs:53-70`):
   - Verified that `"tomorrow morning"`, `"this afternoon"`, `"tomorrow evening"`, `"this Friday morning"`, and `"tonight"` correctly set `isAllDay = false`, compute the appropriate hour (09:00, 14:00, 19:00, 20:00), and produce non-null offset ISO strings (`YYYY-MM-DDTHH:mm:ss-04:00`).
   - Tested in `CHALLENGE-5.1` (PASS).

5. **Client Precedence Hierarchy & Body Matching** (`matchRule` in `src/hooks/useHouseholdCaptureRules.ts:246-294`):
   - Verified deterministic 4-tier precedence: `sender [4] > domain [3] > subject [2] > phrase [1]`, with confidence tie-breaking.
   - Verified phrase matching across both `subject` and `body` with optional `body` parameter safety.
   - Tested in `CHALLENGE-6.1` to `CHALLENGE-7.1` (PASS).

---

### 1.2 Empirically Discovered Defect (Fix #2 Incomplete / Asymmetric)

#### Defect: Regex Asymmetry in `isCaptureRuleDirective` Line 91 Rejects Valid Directives
- **Location**: `supabase/functions/_shared/capture-command-router.mjs:88-93`
- **Observed Behavior**:
  In `isCaptureRuleDirective`:
  ```javascript
  // Line 88 (Pattern: "... are/is ...") - Correctly updated:
  if (/\b(?:are|is)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }

  // Line 91 (Pattern: "track/route/mark/treat ... as/to/into ...") - INCOMPLETE:
  if (/\b(?:track|route|mark|treat)\s+.+\s+(?:as|to|into)\s+(?:logistics|estate\s+knowledge|informational|promotional|executive\s+actions|appointments|parcels?|packages?|delivery|receipts?|orders?|actions?|tasks?|waivers?|bills?|invoices?|calendar|schedule|updates?|lifecycle|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }
  ```
- **Discrepancy**:
  Line 91 was only partially updated and is missing the following archetype keywords defined in `ARCHETYPE_MAP`:
  1. `knowledge` (only `estate\s+knowledge` is matched)
  2. `info` (only `informational` is matched)
  3. `newsletters?` (omitted entirely)
  4. `appointment` (singular omitted because `appointments` lacks `?`)
  5. `executive\s+actions?` (singular omitted because `executive\s+actions` lacks `?`)

- **Empirical Impact**:
  Valid spoken directives using standard routing grammar:
  - `"route pool maintenance into knowledge"`
  - `"track clinic visits as info"`
  - `"mark school bulletins as newsletter"`
  - `"route community letters as newsletters"`
  - `"treat doctor checkup as appointment"`
  
  Return `false` from `isCaptureRuleDirective(input)` and are subsequently rejected as `unsupported` commands in `resolveCaptureCommand`.

- **Empirical Proof**:
  Verified in `tests/challenger-m4-adversarial.test.mjs` test `CHALLENGE-2.3 (EMPIRICAL DEFECT PROOF)`:
  ```javascript
  assert.equal(isCaptureRuleDirective('route pool maintenance into knowledge'), false)
  assert.equal(resolveCaptureCommand('route pool maintenance into knowledge').status, 'unsupported')
  ```

---

## 2. Logic Chain

1. **Directive Grammar Equivalence**: Users naturally express routing directives in either equational form (`"X are knowledge"`) or imperative routing form (`"route X into knowledge"`).
2. **Grammar Filter Gating**: `resolveCaptureCommand` invokes `isCaptureRuleDirective(input)` as the entry gate for rule creation.
3. **Asymmetric Rejection**: Because Line 91 in `isCaptureRuleDirective` lacks `knowledge`, `info`, `newsletters?`, and `appointments?`, imperative routing forms containing these keywords fail the guard and fall through to the unsupported action error handler.
4. **Resolution Requirement**: Line 91 must use the identical comprehensive list of archetype aliases as Line 88.

---

## 3. Caveats

- **Scope Boundary**: 5 of the 6 fixes implemented by Worker 2 are verified to be fully correct, complete, and regression-free.
- **Minimal Blast Radius**: The required correction is strictly a 1-line update to the regex in `supabase/functions/_shared/capture-command-router.mjs:91`.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

### Required Action for Worker:
Update line 91 of `supabase/functions/_shared/capture-command-router.mjs` to match all aliases symmetrically with line 88:

```javascript
export function isCaptureRuleDirective(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  // Quick exclusion: Do not hijack explicit assistant quick action prefixes
  if (/^(?:add\s+.+\s+to\s+(?:the\s+)?(?:shopping|grocery|food)?\s*list|remind\s+me|create\s+dinner|schedule\s+meeting)/i.test(input)) {
    return false
  }

  if (UNTRAIN_VERBS.test(input)) return true
  if (SUPPRESS_VERBS.test(input)) return true
  if (ELEVATE_VERBS.test(input)) return true

  // Pattern: "tennis updates are informational" / "always track bakery receipts as logistics"
  if (/\b(?:are|is)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }
  if (/\b(?:track|route|mark|treat)\s+.+\s+(?:as|to|into)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|executive\s+actions?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }

  return false
}
```

---

## 5. Verification Method

1. Run the dedicated Challenger 3 adversarial test suite:
   ```bash
   node --test tests/challenger-m4-adversarial.test.mjs
   ```
2. Run the full Milestone 4 suite:
   ```bash
   node --test tests/active-learning-ingestion.test.mjs tests/compound-decomposer.test.mjs tests/capture-command-router.test.mjs
   ```
3. Run the full regression test suite:
   ```bash
   npm test
   ```
4. Run TypeScript check & linter:
   ```bash
   npx tsc -b
   npx eslint src/hooks/useHouseholdCaptureRules.ts supabase/functions/_shared/capture-command-router.mjs supabase/functions/_shared/few-shot-exemplar-store.mjs supabase/functions/_shared/compound-decomposer.mjs
   ```
