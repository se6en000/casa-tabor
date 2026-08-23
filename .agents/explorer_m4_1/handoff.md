# Handoff Report: Compound Decomposer Subsystem Architecture & Design

**Agent**: Explorer M4-1  
**Milestone**: Milestone 4 (Autonomous Active-Learning Ingestion Engine)  
**Target Subsystem**: Compound Decomposer (`supabase/functions/_shared/compound-decomposer.mjs`, `src/utils/actionInspectionSynthesis.ts`)  
**Date**: 2026-08-23T12:20:30Z  

---

## 1. Observation

### 1.1 Existing Email Ingestion in `supabase/functions/scan-gmail-inbox/index.ts`
- **Attachment Extraction** (`scan-gmail-inbox/index.ts:238-283`):
  ```typescript
  async function extractAttachmentDirectives(
    attachmentBase64: string,
    mimeType: string,
    filename: string,
    llmConfig: { provider?: string; model?: string; api_key: string },
    usage?: UsageAccumulator,
  ): Promise<string | null>
  ```
  Extracts document directives using `gemini-2.5-flash` with multimodal OCR/PDF parsing for attachments up to 5MB, returning key dates, required forms/waivers/fees, equipment rules, and plain text excerpts (`lines 260-267`).
- **Classification & Intent Model** (`scan-gmail-inbox/index.ts:346-487`):
  - `EmailIntent` contains `intent: 'new_event' | 'update_event' | 'travel_detail' | 'skip'`, compound `events: ExtractedEventItem[]`, and `family_evidence`.
  - Date anchoring rule is embedded in prompt (`lines 430-432`):
    > *"All relative dates/times in the email body or attachments (such as 'today', 'tonight', 'this morning', 'this afternoon', 'tomorrow', 'this Friday', 'next week') MUST be resolved relative to the EMAIL SENT DATE (${emailDateFormatted}), NEVER relative to the current scan date."*
- **Action Extraction Prompt** (`scan-gmail-inbox/index.ts:514-561`):
  - `InboxActionItem` includes `type`, `title`, `description`, `due_datetime`, `assigned_member`, `priority`, `agency_level`, `vendor`, `transaction_id`, `transaction_status`, `policy_disclaimer`, and `source_origin: 'email_body' | 'attachment' | 'compound'`.
  - Injects `rulesBlock`, `attachmentsBlock`, and `documentDirectivesBlock` (`lines 504-513`).
- **Database Persistence** (`scan-gmail-inbox/index.ts:648-757` and `759-840`):
  - Inserts distinct rows into `prep_items` for each action item and event suggestion.
  - Links items from the same message using:
    - `source_ref: 'gmail:<member_id>:<messageId>'`
    - `cluster_id: clusterId`
    - `attention_thread_key` (composite keys for orders, suggestions, or tasks)
    - `source_origin: 'email_body' | 'attachment' | 'compound'`
    - `agency_level: 0` for passive logistics tracking/disclaimers, `>= 1` for human action items.
  - Synchronizes to `family_knowledge_claims` (`lines 842-882`) and `family_data_evidence` (`lines 884-900`).

### 1.2 Client-Side Inspection & Synthesis in `src/utils/actionInspectionSynthesis.ts`
- **Types & Interfaces** (`actionInspectionSynthesis.ts:5-85`):
  - `SuggestedActionItem`: Contains `id`, `type: 'reminder' | 'event' | 'link' | 'payment'`, `title`, `subtitle`, `date`, `displayDate`, `startTime`, `endTime`, `allDay`, `location`, `assignedMemberName`, `sourceOrigin: 'email_body' | 'attachment' | 'compound'`, `badgeLabel`, `url`, `defaultSelected`.
  - `SuggestedActionBundle`: Groups related sub-actions with `bundleId`, `title`, `summary`, `actions: SuggestedActionItem[]`.
  - `ActionAnalysis`: Full synthesis object combining sender context, urgency, required action, documents, suggested event, suggested action bundle, and document preview.
- **Dynamic Sibling Bundle Detection** (`actionInspectionSynthesis.ts:261-301`):
  ```typescript
  if (siblingItems && siblingItems.length > 0) {
    const allItems = [item, ...siblingItems.filter((s) => s.id !== item.id)]
    const actions: SuggestedActionItem[] = allItems.map((actItem, idx) => { ... })
    return {
      bundleId: `bundle_cluster_${item.cluster_id || item.id}`,
      title: `${item.event_title || 'Email'} Action Plan (${actions.length} Actions)`,
      summary: `Discrete actions and milestones extracted from email communication and attachments.`,
      actions,
    }
  }
  ```
- **Timezone-Safe Date Parsing** (`actionInspectionSynthesis.ts:105-150`):
  - `parseDateSafe` uses noon local (`12:00:00`) for date-only all-day strings (`YYYY-MM-DD`) to avoid UTC midnight date-shifting across timezone boundaries (e.g., preventing `2026-08-19 00:00:00 UTC` from becoming `2026-08-18 8:00 PM EDT`).

### 1.3 UI Consumption in `ActionInspectionSidecar.tsx` and `useCreateSuggestedEvent.ts`
- `ActionInspectionSidecar.tsx` (lines 171-177): Finds all sibling prep items sharing `cluster_id` or `source_ref` in `allPrep`, passing them to `synthesizeActionAnalysis(activeItem, detailedItem, siblingItems)`.
- Renders an interactive action bundle with checkboxes, custom assignee selectors, custom title inline editing, and 1-tap "Create Selected Actions" via `useCreateSuggestedEvent().createSuggestedActionBundle(...)`.
- Auto-advancement in sidecar (`ActionInspectionSidecar.tsx:331-342`) advances to the next *distinct* thread, ensuring completed siblings are cleanly cleared without resurfacing.

### 1.4 Test Suite & Verification Baseline
- Current full test suite (`npm test`): **2,079 passing tests, 0 failures across 26 test suites**.
- Tier 1 Feature 1.5 tests in `tests/e2e-email-intelligence-tiers.test.mjs` (lines 390-548) already certify:
  - T1.5.1: Multi-date school newsletter decomposition into 5 discrete actions/events.
  - T1.5.2: Multimodal PDF flyer summary assigned `source_origin: 'attachment'`.
  - T1.5.3: Hybrid email body + attachment decomposition assigned `source_origin: 'compound'`.
  - T1.5.4: Sibling action deduplication linking all sub-tasks to parent thread ID.
  - T1.5.5: Granular item selection default flags in suggested action bundles.

---

## 2. Logic Chain

1. **Problem Formulation**:
   - Family emails frequently contain dense, heterogeneous compound payloads:
     - *Multi-date school newsletters* (e.g., Bak MSOA Principal's Update) containing school picture dates, staggered curriculum nights (6th grade vs 7th/8th grade), PTO volunteer drives, and attached campus maps.
     - *Youth athletics announcements* containing tryout windows, concussion waiver forms, required shin guard equipment, and parent volunteer shifts.
     - *Camp & travel packets* containing medical emergency release PDFs, packing lists, payment balances, and bus departure times.
     - *Municipal/HOA digests* containing storm shutter rules, bulk trash schedules, and pool maintenance windows.
   - If handled via naive single-pass classification:
     - Sub-events are dropped (only the first event is recorded).
     - Action tasks (waivers, fees) hidden in attachments are ignored.
     - Relative dates ("tomorrow", "this Friday") are resolved to the *scan date* rather than the *email sent date*, corrupting the family schedule.
     - Multiple extracted items appear as disconnected orphans in the UI rather than a cohesive bundle.

2. **Decomposition & Linkage Pipeline**:
   - **Step 1: Attachment Pre-processing & OCR Extraction**:
     - Binary attachments (PDFs, images) are fetched via Gmail API and passed to `extractAttachmentDirectives` using `gemini-2.5-flash`.
     - Output is structured into four explicit sections: *Key Dates & Times*, *Required Forms/Waivers/Fees*, *Important Rules/Equipment*, and *Plain Text Excerpt*.
   - **Step 2: Unified Compound Decomposition (`compound-decomposer.mjs`)**:
     - Evaluates composite payload (email subject, sender, body, attachment metadata, and extracted attachment directives).
     - Identifies whether the message is compound (`isCompound: boolean`).
     - Extracts two primary collections:
       - `extractedActions: DecomposedActionItem[]` (`archetype: 'executive_actions'`, `actionType: 'waiver' | 'payment' | 'form' | 'rsvp' | 'info'`)
       - `suggestedAppointments: DecomposedActionItem[]` (`archetype: 'temporal_appointments'`, with start/end ISO timestamps, locations, and attendee suggestions)
     - Extracts auxiliary `knowledgeNotes: string[]` (`archetype: 'estate_knowledge'`) for non-actionable background guidelines (e.g., parking maps, dress codes).
   - **Step 3: Source Origin Attribution**:
     - Every decomposed item is tagged with `sourceType`:
       - `'attachment'`: Directly sourced from PDF flyer/attachment text.
       - `'email_body'`: Directly sourced from the email text.
       - `'compound'`: Cross-synthesized from both email body and attachment context.
     - `sourceRef` records `gmail:<member_id>:<message_id>`.
   - **Step 4: Strict Date Anchoring to Email Sent Date**:
     - Anchor timestamp $T_{\text{anchor}} = \text{Date}(\text{email.received\_at} \lor \text{email.date})$.
     - Every relative expression ("today", "tonight", "this morning", "tomorrow", "this Friday", "next Tuesday", "due today") is resolved relative to $T_{\text{anchor}}$, never system clock time $T_{\text{now}}$.
     - Year-rollover safety: If an email received in August mentions "Jan 15", the target date is resolved to the appropriate academic/calendar year.
     - Timezone safety: Date-only events use noon local (`12:00:00`) or explicit EDT/EST ISO offsets (`-04:00` / `-05:00`).
     - State safety: Future arrival dates relative to $T_{\text{anchor}}$ are never marked `delivered`.
   - **Step 5: Sibling Clustering & Cross-Referencing**:
     - Sibling items share `cluster_id` (e.g. `thread:<message_id>` or domain thread key).
     - `siblingActionIds` array is populated with IDs of all co-extracted items.
   - **Step 6: Client-Side Inspection Synthesis (`actionInspectionSynthesis.ts`)**:
     - `detectSuggestedActionBundle` dynamically aggregates sibling prep items into a `SuggestedActionBundle`.
     - In the Kiosk and Sidecar UI, users see a unified card with all sub-actions, their origins (`attachment` badge vs `email_body`), and can 1-tap accept all or toggle individual items.

---

## 3. Caveats

1. **Attachment Size & Quota Limits**:
   - Gmail API attachments > 5MB or > 2 attachments per email are throttled to prevent edge function timeouts. If an email has 5 attached flyers, only the first 2 primary documents are processed for multimodal OCR; remaining attachments are listed by filename in metadata.
2. **Deterministic vs LLM Decomposition**:
   - In production edge functions, Gemini LLM decomposition is the primary engine with full semantic understanding.
   - For offline test harnesses, CI runs, and zero-token benchmark evaluations, a deterministic rule-based pattern engine in `compound-decomposer.mjs` must provide high-fidelity offline decomposition for all standard household templates (Bak MSOA, PBC Schools, sports leagues, camps, utilities).
3. **Timezone Context**:
   - In the absence of an explicit UTC offset in raw email text, dates are anchored to America/New_York (Palm Beach local time, UTC-4 EDT / UTC-5 EST).
4. **Queue Overflow Protection**:
   - If an email contains a massive multi-month calendar (e.g., 20+ semester dates), only near-term milestones (< 60 days) should become high-priority prep items; the remaining items should be stored as `estate_knowledge` claims.

---

## 4. Conclusion & Architectural Design

### 4.1 Pure ESM Module Design: `supabase/functions/_shared/compound-decomposer.mjs`

```typescript
// Interface Contract (aligned with SCOPE.md Contract 1)
export interface DecomposedActionItem {
  id?: string
  sourceType: 'attachment' | 'email_body' | 'compound'
  sourceRef?: string
  archetype: 'executive_actions' | 'temporal_appointments' | 'estate_knowledge' | 'logistics_parcels'
  title: string
  summary: string
  dueDate?: string | null
  eventDate?: string | null
  actionType?: 'waiver' | 'payment' | 'form' | 'rsvp' | 'info'
  requiredAction?: string | null
  urgency: 'high' | 'medium' | 'low'
  agencyLevel: number
  siblingActionIds?: string[]
  anchoredDate?: string
  assignedMember?: string | null
  location?: string | null
  amount?: string | null
  url?: string | null
}

export interface CompoundDecompositionResult {
  isCompound: boolean
  parentEmailId: string
  sourceEmailDate: string
  summary: string
  extractedActions: DecomposedActionItem[]
  suggestedAppointments: DecomposedActionItem[]
  knowledgeNotes: string[]
}
```

#### Core Exports in `compound-decomposer.mjs`:
1. `anchorRelativeDate(relativeText: string, anchorDateIso: string, defaultHour?: number): { dateStr: string; isoString: string | null; isAllDay: boolean }`
   - Deterministically calculates dates relative to `anchorDateIso`.
   - Handles "today", "tonight", "this morning", "this afternoon", "tomorrow", "this Friday", "next Monday", "in 3 days", "due Sep 15".
2. `isCompoundEmail(email: { subject?: string; bodyText?: string; attachments?: any[] }): boolean`
   - Returns true if the message matches multi-event or multi-action newsletter patterns or contains actionable PDF attachments.
3. `decomposeCompoundEmail(params: DecomposeParams): CompoundDecompositionResult`
   - Fast-path deterministic + offline decomposition engine.
   - Recognizes Palm Beach school newsletters, Bak MSOA curriculum nights, testing letters (FAST/STAR/i-Ready), sports schedules, science camp packets, and utility notices.
   - Populates `extractedActions`, `suggestedAppointments`, and `knowledgeNotes`.
   - Tags `sourceType: 'attachment' | 'email_body' | 'compound'`.
   - Populates `siblingActionIds` across all decomposed children.
4. `formatCompoundDecomposerPrompt(email: EmailContext, familyMembers: FamilyMember[], matchingRules: HouseholdCaptureRule[]): string`
   - Constructs the structured LLM prompt enforcing date anchoring, JSON schema output, and 0% false leakage guardrails.
5. `parseCompoundDecomposerResponse(llmOutput: string, anchorDateIso: string, parentEmailId: string): CompoundDecompositionResult`
   - Parses and validates LLM JSON response into strict `CompoundDecompositionResult`.
   - Enforces date anchoring validation and fallback sanity checks.

### 4.2 Client Utility Enhancements: `src/utils/actionInspectionSynthesis.ts`
- **Dynamic Sibling Expansion**:
  - `detectSuggestedActionBundle` seamlessly handles `siblingItems` from `prep_items` queries, ensuring that when an item with `cluster_id` or `source_ref` is selected, all sibling actions and appointments are combined into a cohesive `SuggestedActionBundle`.
  - Preserves `sourceOrigin: 'attachment' | 'email_body' | 'compound'` for every sub-action item and displays distinct badge labels (`"FORM / WAIVER"`, `"CALENDAR EVENT"`, `"PREP TASK"`, `"PAYMENT"`, `"QUICK LINK"`).
- **Date Anchoring Guard**:
  - `parseDateSafe` validates all timestamps against timezone offsets, preventing date rollback.
- **Batch Action Execution**:
  - Full compatibility with `useCreateSuggestedEvent().createSuggestedActionBundle(...)` allowing 1-tap bulk creation of calendar events and todo tasks.

---

## 5. Verification Method

### 5.1 Automated Test Execution
Run the following test commands to verify decomposition, origin tagging, sibling linking, and date anchoring:

```bash
# 1. New Compound Decomposer unit & integration test suite
node --test tests/compound-decomposer.test.mjs

# 2. Comprehensive 5-Tier Email Intelligence test suite
node --test tests/e2e-email-intelligence-tiers.test.mjs

# 3. Full project regression suite (2,079+ tests)
npm test
```

### 5.2 Specific Test Scenarios to Validate
1. **Multi-Date School Newsletter Decomposition**:
   - Input: Bak MSOA Curriculum Night email (sent `2026-08-20T15:00:00Z`) with attached PDF map/schedule.
   - Expected Output:
     - `isCompound: true`
     - Extracted Actions: 1) Download SIS Period Schedule (`sourceType: 'email_body'`), 2) PTSA Membership Form (`sourceType: 'attachment'`).
     - Suggested Appointments: 1) 6th Grade Session Aug 27 at 5:30 PM (`sourceType: 'attachment'`), 2) 7th & 8th Grade Session Aug 27 at 6:45 PM (`sourceType: 'attachment'`).
     - All dates anchored to `2026-08-20` (resulting in `2026-08-27`).
2. **Science Camp Packet Decomposition**:
   - Input: Oakridge Elementary Science Camp email with attached medical waiver.
   - Expected Output:
     - Action: Sign Medical Waiver (`actionType: 'waiver'`, `sourceType: 'attachment'`).
     - Appointment: Camp Departure Bus Loading (`eventDate: '2026-08-17'`, `sourceType: 'email_body'`).
     - Sibling linkage: Both items share the same `cluster_id` and reference each other in `siblingActionIds`.
3. **Date Anchoring Integrity**:
   - Input: Email sent `2026-08-20` with text "delivery arriving tomorrow between 2pm-6pm".
   - Expected Output:
     - `due_datetime: '2026-08-21T18:00:00Z'` (anchored to Aug 20, NOT current scan date).
     - `transaction_status: 'confirmed'` / `'shipped'` (never `'delivered'`).
4. **0% False Action Leakage**:
   - Input: Retail order email with return policy disclaimer ("returns accepted within 30 days").
   - Expected Output:
     - `agencyLevel: 0`, routed to `delivery_transit_items`, 0 tasks created in `executive_actions`.

---
*Report certified by Explorer M4-1. Ready for sub-orchestrator and implementer delegation.*
