import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

import { useAppStore } from '../src/stores/appStore.ts'

test('appStore: action sidecar state management and operations', () => {
  // Reset store state
  useAppStore.setState({
    sidecarTab: 'event',
    selectedSidecarEventId: null,
    selectedSidecarActionId: null,
    aiDrawerOpen: false,
  })

  // Test openActionInSidecar
  useAppStore.getState().openActionInSidecar('prep-science-camp')
  assert.equal(useAppStore.getState().sidecarTab, 'action')
  assert.equal(useAppStore.getState().selectedSidecarActionId, 'prep-science-camp')
  assert.equal(useAppStore.getState().aiDrawerOpen, true)

  // Toggle sidecar tab to 'ai'
  useAppStore.getState().toggleSidecarTab()
  assert.equal(useAppStore.getState().sidecarTab, 'ai')
  assert.equal(useAppStore.getState().selectedSidecarActionId, 'prep-science-camp')

  // Toggle sidecar tab back to 'action'
  useAppStore.getState().toggleSidecarTab()
  assert.equal(useAppStore.getState().sidecarTab, 'action')
  assert.equal(useAppStore.getState().selectedSidecarActionId, 'prep-science-camp')

  // Test closeSidecar resets action id
  useAppStore.getState().closeSidecar()
  assert.equal(useAppStore.getState().aiDrawerOpen, false)
  assert.equal(useAppStore.getState().selectedSidecarActionId, null)
  assert.equal(useAppStore.getState().selectedSidecarEventId, null)
})

test('ActionInspectionSidecar component source contract', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/canvas/widgets/ActionInspectionSidecar.tsx')
  assert.ok(fs.existsSync(filePath), 'ActionInspectionSidecar.tsx must exist')
  const content = fs.readFileSync(filePath, 'utf-8')

  // 1. Must support 3D flip to AI and close
  assert.match(content, /Rotate3d|SwitchCamera/, 'ActionInspectionSidecar must import and render Rotate3d icon for AI flip')
  assert.match(content, /onSwitchToAi/, 'ActionInspectionSidecar must accept onSwitchToAi prop')
  assert.match(content, /onClose/, 'ActionInspectionSidecar must accept onClose prop')

  // 2. Must feature AI Executive Brief
  assert.match(content, /Executive Brief|AI Executive Brief|AI Analysis/i, 'Must render AI Executive Brief section')

  // 3. Must feature Extracted Attachments or Action Links
  assert.match(content, /Attachment|Document|Portal|Link/i, 'Must render extracted documents/attachments')

  // 4. Must feature Clean Reader Mode Source Email
  assert.match(content, /Source Email|Original Message|Evidence/i, 'Must render clean reader mode email/evidence')

  // 5. Must feature Pinned 1-Tap Action Bar with minimum 44px/48px touch targets
  assert.match(content, /Mark Done|Mark Paid|Done/i, 'Must have primary completion button')
  assert.match(content, /Snooze/i, 'Must have snooze button')
  assert.match(content, /min-h-\[4[48]px\]|min-h-control/i, 'Buttons must adhere to touch target minimums (44px/48px)')
})

test('SidecarCompanion integrates ActionInspectionSidecar on action tab', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/shared/SidecarCompanion.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.match(content, /ActionInspectionSidecar/, 'SidecarCompanion must import ActionInspectionSidecar')
  assert.match(content, /selectedSidecarActionId/, 'SidecarCompanion must track selectedSidecarActionId')
  assert.match(content, /isActionView|sidecarTab === 'action'/, 'SidecarCompanion must support action view tab')
})

test('ActionQueueWidget triggers openActionInSidecar on card/row inspection', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/canvas/widgets/ActionQueueWidget.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.match(content, /openActionInSidecar/, 'ActionQueueWidget must call openActionInSidecar')
  assert.match(content, /openActionInSidecar\(heroItem(\.id)?\)/, 'ActionQueueWidget must pass heroItem to openActionInSidecar')
  assert.match(content, /openActionInSidecar\(item(\.id)?\)/, 'ActionQueueWidget must pass micro item to openActionInSidecar')
})

test('synthesizeActionAnalysis: dynamic synthesis accurately extracts context per matter without fake personas', async () => {
  const { synthesizeActionAnalysis } = await import('../src/utils/actionInspectionSynthesis.ts')

  // 1. Bank of America Vehicle Loan Auto-Pay
  const bofaItem = {
    id: 'prep-bofa',
    event_title: 'Bank of America Auto-Pay Scheduled',
    description: 'Your automatic payment of $317.00 to BANK OF AMERICA - VEHICLE LOAN has been scheduled. The payment will be made from account *******9451.',
    source_type: 'gmail',
    due_by: '2026-08-15',
    household_id: 'tabor',
    created_at: '2026-08-15T07:00:00Z',
    status: 'pending',
  }
  const bofaAnalysis = synthesizeActionAnalysis(bofaItem)
  assert.match(bofaAnalysis.subject, /Bank of America/i)
  assert.match(bofaAnalysis.requiredAction, /\$317\.00/i)
  assert.match(bofaAnalysis.householdImpact, /\$317\.00/i)
  assert.equal(bofaAnalysis.documents.some((d) => d.type === 'payment' && d.amount === '$317.00'), true)
  assert.match(bofaAnalysis.emailBody, /Bank of America|Vehicle Loan|\$317\.00/i)
  assert.doesNotMatch(bofaAnalysis.emailBody, /Principal Adams|Science Camp|Dear Tabor Household/i)

  // 2. Walmart Grocery Order
  const walmartItem = {
    id: 'prep-walmart',
    event_title: 'Walmart Grocery Order Confirmation',
    description: 'Walmart Grocery Order: Weekly household staples and fresh produce',
    source_type: 'gmail',
    due_by: '2026-08-15',
    household_id: 'tabor',
    created_at: '2026-08-15T08:00:00Z',
    status: 'pending',
  }
  const walmartAnalysis = synthesizeActionAnalysis(walmartItem)
  assert.match(walmartAnalysis.subject, /Walmart/i)
  assert.match(walmartAnalysis.emailBody, /Walmart/i)
  assert.doesNotMatch(walmartAnalysis.emailBody, /Principal Adams|Dear 5th Grade/i)

  // 3. Science Camp Item with Real Gmail Context
  const campItem = {
    id: 'prep-camp',
    event_title: 'Science Camp Emergency Medical Release',
    description: '5th Grade Science Camp Emergency Medical Waiver & Medication Form',
    source_type: 'gmail',
    due_by: '2026-08-17',
    household_id: 'tabor',
    created_at: '2026-08-15T07:14:00Z',
    status: 'pending',
  }
  const campDetails = {
    ...campItem,
    gmailContext: {
      subject: 'Science Camp Emergency Medical Release Form',
      from_email: 'office@oakridgeschool.edu',
      received_at: '2026-08-15T07:14:00Z',
      email_body: 'Guardian signature required on emergency medical waiver for the Lake Alpine camp trip.',
      attachments: [{ filename: 'Science_Camp_Medical_Waiver.pdf', mimeType: 'application/pdf', size: 124000 }],
    },
  }
  const campAnalysis = synthesizeActionAnalysis(campItem, campDetails)
  assert.match(campAnalysis.senderLabel, /office@oakridgeschool\.edu|office/i)
  assert.match(campAnalysis.subject, /Science Camp/i)
  assert.equal(campAnalysis.documents.some((d) => d.title.includes('Medical Waiver')), true)
  assert.ok(campAnalysis.suggestedEvent, 'Dated camp item should have a suggested calendar event')
  assert.equal(campAnalysis.suggestedEvent.date, '2026-08-17')

  // 4. School PTO Spirit Day
  const ptoItem = {
    id: 'prep-pto',
    event_title: 'PTO Spirit Day on August 28',
    description: 'PTO Spirit Day 8/28/26 - Students wear school colors',
    source_type: 'gmail',
    due_by: '2026-08-28',
    household_id: 'tabor',
    created_at: '2026-08-15T09:00:00Z',
    status: 'pending',
  }
  const ptoAnalysis = synthesizeActionAnalysis(ptoItem)
  assert.match(ptoAnalysis.subject, /Spirit Day/i)
  assert.match(ptoAnalysis.urgency, /(?:Aug(?:ust)?\s*28|today)/i)

  // 5. Lake Lytal Lassie League Community Email (Must NOT match fake Principal Adams or fake Science Camp)
  const lytalItem = {
    id: 'prep-lytal',
    event_title: 'Lake Lytal Lassie League Enrollment',
    description: 'The Lake Lytal Lassie League is trying to increase enrollment. Please help spread the word by sharing the attached flyers on social media or within your school community.',
    source_type: 'gmail',
    household_id: 'tabor',
    created_at: '2026-08-15T07:14:00Z',
    status: 'pending',
  }
  const lytalAnalysis = synthesizeActionAnalysis(lytalItem)
  assert.doesNotMatch(lytalAnalysis.senderLabel, /Principal Adams/i)
  assert.doesNotMatch(lytalAnalysis.urgency, /Lake Alpine|Science Camp/i)
  assert.doesNotMatch(lytalAnalysis.requiredAction, /emergency medical release|Owen/i)
  assert.doesNotMatch(lytalAnalysis.emailBody, /Principal Adams|Science Camp/i)
  assert.equal(lytalAnalysis.suggestedEvent, null)
})

test('detectSuggestedEvent: returns accurate plan for quick queue badge detection', async () => {
  const { detectSuggestedEvent } = await import('../src/utils/actionInspectionSynthesis.ts')

  const pto = detectSuggestedEvent({
    id: 'pto-1',
    event_title: 'PTO Spirit Day',
    description: 'PTO Spirit Day 8/28/26 - Wear Emerald Green & Gold',
    source_type: 'gmail',
    due_by: '2026-08-28',
  })
  assert.ok(pto)
  assert.equal(pto.date, '2026-08-28')
  assert.equal(pto.displayDate, 'Fri, Aug 28 · All Day')
  assert.equal(pto.allDay, true)

  const datedEvent = detectSuggestedEvent({
    id: 'event-1',
    event_title: 'Science Camp Bus Departure',
    description: 'Lake Alpine Science Camp Departure',
    source_type: 'gmail',
    event_date: '2026-08-17',
  })
  assert.ok(datedEvent)
  assert.equal(datedEvent.date, '2026-08-17')
  assert.equal(datedEvent.displayDate, 'Mon, Aug 17 · All Day')

  const nonDated = detectSuggestedEvent({
    id: 'misc-1',
    description: 'Take out the recycling bin',
    source_type: 'general',
  })
  assert.equal(nonDated, null)
})

test('ActionInspectionSidecar features proactive Suggested Event Action Plan and calendar creation', () => {
  const sidecarCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/canvas/widgets/ActionInspectionSidecar.tsx'),
    'utf8'
  )

  // 1. Must render Suggested Event Action Plan section
  assert.match(sidecarCode, /Suggested Event Action Plan/i, 'Must render Suggested Event Action Plan header')
  assert.match(sidecarCode, /analysis\.suggestedEvent/, 'Must inspect analysis.suggestedEvent')

  // 2. Must render Add to Calendar button with touch target
  assert.match(sidecarCode, /Add to Calendar/i, 'Must render Add to Calendar button')
  assert.match(sidecarCode, /handleCreateSuggestedEvent/, 'Must define handleCreateSuggestedEvent')
  assert.match(sidecarCode, /Scheduled\s*\(/i, 'Must render Scheduled state when event exists')

  // 3. Must link created event to calendar and trigger background sync
  assert.match(sidecarCode, /create-google-event/, 'Must invoke create-google-event edge function')
  assert.match(sidecarCode, /events/, 'Must invalidate events cache query')
})

test('ActionQueueWidget and ActionHubPage render suggested event badges and open sidecar', () => {
  const actionQueueCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/canvas/widgets/ActionQueueWidget.tsx'),
    'utf8'
  )
  const actionHubCode = fs.readFileSync(
    path.join(process.cwd(), 'src/pages/ActionHubPage.tsx'),
    'utf8'
  )

  assert.match(actionQueueCode, /detectSuggestedEvent/, 'ActionQueueWidget must use detectSuggestedEvent')
  assert.match(actionQueueCode, /Suggests/, 'ActionQueueWidget must render Suggests pill')

  assert.match(actionHubCode, /detectSuggestedEvent/, 'ActionHubPage must use detectSuggestedEvent')
  assert.match(actionHubCode, /openActionInSidecar/, 'ActionHubPage must use openActionInSidecar')
  assert.doesNotMatch(actionHubCode, /PrepItemDetailPanel/, 'ActionHubPage must not use legacy PrepItemDetailPanel')
})

test('Ask AI from ActionInspectionSidecar prefills context and resets session', () => {
  const sidecarCompanionCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shared/SidecarCompanion.tsx'),
    'utf8'
  )
  const actionInspectionCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/canvas/widgets/ActionInspectionSidecar.tsx'),
    'utf8'
  )
  const aiChatDrawerCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shared/AIChatDrawer.tsx'),
    'utf8'
  )
  const useAIAssistantCode = fs.readFileSync(
    path.join(process.cwd(), 'src/hooks/useAIAssistant.ts'),
    'utf8'
  )

  // 1. ActionInspectionSidecar emits ActionAiContext
  assert.match(actionInspectionCode, /onSwitchToAi\s*\(/)
  assert.match(actionInspectionCode, /actionId:\s*activeItem\?\.id/)
  assert.match(actionInspectionCode, /amount/)
  assert.match(actionInspectionCode, /emailBody/)

  // 2. SidecarCompanion passes focusedAction to AIChatDrawer
  assert.match(sidecarCompanionCode, /focusedAction=\{(activeActionContext|focusedActionContext)\s*\|\|\s*undefined\}/)
  assert.match(sidecarCompanionCode, /handleAskAiAboutAction/)

  // 3. AIChatDrawer receives focusedAction, starts a fresh session, and primes context
  assert.match(aiChatDrawerCode, /focusedAction\?:\s*ActionAiContext/)
  assert.match(aiChatDrawerCode, /firedActionGreetRef/)
  assert.match(aiChatDrawerCode, /startFresh\(\)/)
  assert.match(aiChatDrawerCode, /primeMessages\(\[\{\s*id:\s*crypto\.randomUUID\(\),\s*role:\s*'assistant'/)
  assert.match(aiChatDrawerCode, /focusedAction && !focusedEvent/)

  // 4. useAIAssistant includes focusedAction in buildContext
  assert.match(useAIAssistantCode, /focusedAction:\s*ctx\.focusedAction\s*\?/)
  assert.match(useAIAssistantCode, /required_action:\s*ctx\.focusedAction\.requiredAction/)
})

test('ActionInspectionSidecar: Snooze and Done buttons execute mutations and auto-advance', () => {
  const sidecarCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/canvas/widgets/ActionInspectionSidecar.tsx'),
    'utf8'
  )
  const sidecarCompanionCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shared/SidecarCompanion.tsx'),
    'utf8'
  )

  // 1. ActionInspectionSidecar imports mutation hooks
  assert.match(sidecarCode, /useCompletePrepItem/, 'Must import useCompletePrepItem')
  assert.match(sidecarCode, /useSnoozePrepItem/, 'Must import useSnoozePrepItem')

  // 2. ActionInspectionSidecar defines handleActionComplete and handleActionSnooze
  assert.match(sidecarCode, /handleActionComplete/, 'Must implement handleActionComplete')
  assert.match(sidecarCode, /handleActionSnooze/, 'Must implement handleActionSnooze')
  assert.match(sidecarCode, /completePrepItem\(activeItem\.id\)/, 'Must call completePrepItem as fallback')
  assert.match(sidecarCode, /snoozePrepItem\(activeItem\.id,\s*period,\s*activeItem\.due_by\)/, 'Must call snoozePrepItem as fallback')

  // 3. Snooze dropdown options
  assert.match(sidecarCode, /handleActionSnooze\('3h'\)/, 'Must support Tonight (+3h) snooze')
  assert.match(sidecarCode, /handleActionSnooze\('tomorrow'\)/, 'Must support Tomorrow Morning snooze')
  assert.match(sidecarCode, /handleActionSnooze\('1d'\)/, 'Must support In 24 Hours snooze')

  // 4. SidecarCompanion wires onCompleteAction and onSnoozeAction
  assert.match(sidecarCompanionCode, /useCompletePrepItem/, 'SidecarCompanion must import useCompletePrepItem')
  assert.match(sidecarCompanionCode, /useSnoozePrepItem/, 'SidecarCompanion must import useSnoozePrepItem')
  assert.match(sidecarCompanionCode, /onCompleteAction=\{/, 'SidecarCompanion must pass onCompleteAction')
  assert.match(sidecarCompanionCode, /onSnoozeAction=\{/, 'SidecarCompanion must pass onSnoozeAction')
  assert.match(sidecarCompanionCode, /onSelectAction=\{/, 'SidecarCompanion must pass onSelectAction')
  assert.match(sidecarCompanionCode, /queueItems=\{allPrep\}/, 'SidecarCompanion must pass queueItems')
})

test('buildGmailWebUrl & resolveGmailAccountEmail targets specific user account', async () => {
  const { buildGmailWebUrl, resolveGmailAccountEmail } = await import('../src/utils/prepItemClusters.ts')

  const familyMembers = [
    { id: '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488', name: 'Jake', email: 'jacobrtabor@gmail.com' },
    { id: '917b4b82-dd58-4a4b-a4fa-76065f62e33c', name: 'Tabor Family', email: 'taborfamilyemail@gmail.com' },
  ]

  // 1. Strings Meeting / School item -> taborfamilyemail@gmail.com
  const stringsItem = {
    id: 'strings-1',
    event_title: 'Re: Strings Meeting Information and Paperwork',
    description: 'Place a note in their green folder for their teacher.',
    source_type: 'gmail',
    source_ref: 'gmail:household:19fed2dc206dca31',
  }
  assert.equal(resolveGmailAccountEmail(stringsItem, null, familyMembers), 'taborfamilyemail@gmail.com')
  const stringsUrl = buildGmailWebUrl(stringsItem, null, familyMembers)
  assert.match(stringsUrl, /mail\.google\.com\/mail\/u\/taborfamilyemail%40gmail\.com\/#search/i)

  // 2. Lake Lytal item -> taborfamilyemail@gmail.com via member ID
  const lytalItem = {
    id: 'lytal-1',
    event_title: 'Lake Lytal Needs Your Help',
    source_type: 'gmail',
    source_ref: 'gmail:917b4b82-dd58-4a4b-a4fa-76065f62e33c:19fe2336b8028922',
  }
  assert.equal(resolveGmailAccountEmail(lytalItem, null, familyMembers), 'taborfamilyemail@gmail.com')
  const lytalUrl = buildGmailWebUrl(lytalItem, null, familyMembers)
  assert.match(lytalUrl, /mail\.google\.com\/mail\/u\/taborfamilyemail%40gmail\.com\/#search/i)

  // 3. Amazon Developer identity verification / personal item -> jacobrtabor@gmail.com
  const amazonDevItem = {
    id: 'amazon-1',
    event_title: '[Reminder - Action Required] Verify your Amazon Developer Account',
    description: 'Jake needs to verify his identity for the Amazon Appstore Developer Account.',
    source_type: 'gmail',
    source_ref: 'gmail:19edaa66ae4673d0:appstore.amazon.com',
  }
  assert.equal(resolveGmailAccountEmail(amazonDevItem, null, familyMembers), 'jacobrtabor@gmail.com')
  const amazonDevUrl = buildGmailWebUrl(amazonDevItem, null, familyMembers)
  assert.match(amazonDevUrl, /mail\.google\.com\/mail\/u\/jacobrtabor%40gmail\.com\/#search/i)

  // 4. Personal item via Jake member ID -> jacobrtabor@gmail.com
  const spcoItem = {
    id: 'spco-1',
    event_title: 'Your SPCO order has been received!',
    source_type: 'gmail',
    source_ref: 'gmail:8bf81a21-f2b8-4232-91c6-5a5e9d5b9488:19fadd04f4a9f47d',
  }
  assert.equal(resolveGmailAccountEmail(spcoItem, null, familyMembers), 'jacobrtabor@gmail.com')
  const spcoUrl = buildGmailWebUrl(spcoItem, null, familyMembers)
  assert.match(spcoUrl, /mail\.google\.com\/mail\/u\/jacobrtabor%40gmail\.com\/#search/i)
})

test('ActionInspectionSidecar and usePrepItems resolve sibling actions and advance only to distinct matters', () => {
  const prepItemsContent = fs.readFileSync(
    path.join(process.cwd(), 'src/hooks/usePrepItems.ts'),
    'utf8'
  )
  const sidecarContent = fs.readFileSync(
    path.join(process.cwd(), 'src/components/canvas/widgets/ActionInspectionSidecar.tsx'),
    'utf8'
  )

  // 1. useResolvePrepItem queries sibling identifiers and updates database with orConditions
  assert.match(prepItemsContent, /select\('id,\s*source_ref,\s*cluster_id,\s*action_key'\)/)
  assert.match(prepItemsContent, /dismissed:\s*true,\s*dismissed_at:\s*nowIso/)
  assert.match(prepItemsContent, /orConditions\.push\(`source_ref\.eq\.\$\{item\.source_ref\}`\)/)
  assert.match(prepItemsContent, /orConditions\.push\(`cluster_id\.eq\.\$\{item\.cluster_id\}`\)/)

  // 2. ActionInspectionSidecar collects all sibling IDs and advances only to distinct items
  assert.match(sidecarContent, /const siblingIds = siblingItems\.map\(\(s\) => s\.id\)/)
  assert.match(sidecarContent, /const allRelatedIds = new Set\(\[activeItem\.id, \.\.\.siblingIds\]\)/)
  assert.match(sidecarContent, /queueItems\.find\(\(q\) => !allRelatedIds\.has\(q\.id\)\)/)
  assert.doesNotMatch(sidecarContent, /handleSelectAction\(siblingItems\[0\]\.id\)/)
})

test('synthesizeActionAnalysis: dynamic extraction produces truthful softball, basketball, and bus directives with zero FAST assessment hallucinations', async () => {
  const { synthesizeActionAnalysis } = await import('../src/utils/actionInspectionSynthesis.ts')

  // 1. Lake Lytal Softball Item
  const lytalItem = {
    id: 'lytal-softball-1',
    event_title: 'Lake Lytal Lassie League - Fall Evaluations',
    description: 'Attend fall softball evaluations to be placed on a team. The flyer with evaluation dates is attached.',
    source_type: 'gmail',
    source_ref: 'gmail:household:1a0347ef87f5e98c',
    agency_level: 2,
    created_at: '2026-08-23T14:00:00Z',
  }
  const lytalDetails = {
    ...lytalItem,
    gmailContext: {
      subject: 'Lake Lytal Lassie League - Fall Evaluations',
      from_email: 'Lake Lytal Lassie League <info@lakelytalsoftball.org>',
      received_at: '2026-08-23T14:00:00Z',
      email_body: 'Hello Families,\nSign ups for the Fall Softball Season are open until September 1st. Please attend the fall softball evaluations so we can place every player on the right team. Attached is the official flyer with evaluation dates and field numbers.',
      attachments: [{ filename: 'Fall_Softball_Evaluations_Flyer.pdf', mimeType: 'application/pdf', size: 145000 }],
      extracted_document_summary: '• Fall Softball Season sign ups open until September 1st\n• Mandatory player evaluations on fields 3 & 4\n• All players will be placed on a team\n• Wear cleats, softball pants, and bring personal glove/helmet',
    },
  }
  const lytalAnalysis = synthesizeActionAnalysis(lytalItem, lytalDetails)
  assert.equal(lytalAnalysis.senderLabel, 'Lake Lytal Lassie League')
  assert.ok(lytalAnalysis.extractedDocumentPreview, 'Must have document preview')
  assert.match(lytalAnalysis.extractedDocumentPreview.title, /Directives|Flyer/i)

  // Verify anti-hallucination: MUST NOT contain FAST assessment or standardized testing strings!
  const previewJson = JSON.stringify(lytalAnalysis.extractedDocumentPreview)
  assert.doesNotMatch(previewJson, /FAST ELA/i, 'Must NEVER hallucinate FAST ELA testing')
  assert.doesNotMatch(previewJson, /FAST Math/i, 'Must NEVER hallucinate FAST Mathematics testing')
  assert.doesNotMatch(previewJson, /Science Diagnostic/i, 'Must NEVER hallucinate Science Diagnostic assessment')
  assert.doesNotMatch(previewJson, /Chromebook/i, 'Must NEVER hallucinate school Chromebooks')

  // Verify truthful directives
  assert.match(previewJson, /Softball|evaluations|September 1st/i)

  // 2. Bak MSOA Basketball Tryouts
  const bakItem = {
    id: 'bak-tryouts-1',
    event_title: 'Bak - Boys/Girls Basketball Tryouts',
    description: 'Students trying out for basketball must attend all three days: August 31st, September 1st, and September 2nd, from 3:30pm-5:00pm. They should report to the gym after being dismissed and wear athletic attire.',
    source_type: 'gmail',
    agency_level: 2,
    created_at: '2026-08-23T15:00:00Z',
  }
  const bakAnalysis = synthesizeActionAnalysis(bakItem)
  assert.match(bakAnalysis.subject, /Basketball Tryouts/i)
  assert.ok(bakAnalysis.extractedDocumentPreview, 'Must generate dynamic directives for basketball tryouts')
  const bakDirectives = JSON.stringify(bakAnalysis.extractedDocumentPreview.keyPoints)
  assert.match(bakDirectives, /August 31st|September 1st|gym|athletic/i)
  assert.doesNotMatch(bakDirectives, /FAST ELA|FAST Math/i)

  // 3. Palm Beach Schools Urgent Bus Route Change
  const busItem = {
    id: 'pbsd-bus-1',
    event_title: 'URGENT: Reverted Changes for Buses R28 & R7 Effective Immediately',
    description: 'The AM/PM Publix bus stop for R28 & R7 has been reverted to its original location behind the Publix of Ibis shopping plaza. Address questions to the Transportation Dept.',
    source_type: 'gmail',
    agency_level: 2,
    created_at: '2026-08-23T16:00:00Z',
  }
  const busAnalysis = synthesizeActionAnalysis(busItem)
  assert.match(busAnalysis.subject, /Buses R28 & R7/i)
  const busDirectives = JSON.stringify(busAnalysis.extractedDocumentPreview?.keyPoints || [])
  assert.match(busDirectives, /Publix|bus stop|Transportation/i)
  assert.doesNotMatch(busDirectives, /FAST ELA/i)
})

