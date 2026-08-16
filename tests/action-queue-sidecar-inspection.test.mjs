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

test('synthesizeActionAnalysis: dynamic synthesis accurately extracts context per matter', async () => {
  const { synthesizeActionAnalysis } = await import('../src/utils/actionInspectionSynthesis.ts')

  // 1. Bank of America Vehicle Loan Auto-Pay
  const bofaItem = {
    id: 'prep-bofa',
    description: 'Your automatic payment of $317.00 to BANK OF AMERICA - VEHICLE LOAN has been scheduled. The payment will be made from account *******9451.',
    source_type: 'gmail',
    due_by: '2026-08-15',
    household_id: 'tabor',
    created_at: '2026-08-15T07:00:00Z',
    status: 'pending',
  }
  const bofaAnalysis = synthesizeActionAnalysis(bofaItem)
  assert.equal(bofaAnalysis.senderLabel, 'Bank of America Auto Loans')
  assert.match(bofaAnalysis.urgency, /Auto-debit scheduled for today|drafted from account/i)
  assert.match(bofaAnalysis.requiredAction, /\$317\.00/i)
  assert.match(bofaAnalysis.householdImpact, /vehicle financing/i)
  assert.equal(bofaAnalysis.documents.some((d) => d.type === 'payment' && d.amount === '$317.00'), true)
  assert.match(bofaAnalysis.emailBody, /Bank of America|Vehicle Loan|\$317\.00/i)
  assert.doesNotMatch(bofaAnalysis.emailBody, /Principal Adams|Science Camp/i)

  // 2. Walmart Grocery Order
  const walmartItem = {
    id: 'prep-walmart',
    description: 'Walmart Grocery Order: Weekly household staples and fresh produce',
    source_type: 'gmail',
    due_by: '2026-08-15',
    household_id: 'tabor',
    created_at: '2026-08-15T08:00:00Z',
    status: 'pending',
  }
  const walmartAnalysis = synthesizeActionAnalysis(walmartItem)
  assert.equal(walmartAnalysis.senderLabel, 'Walmart Grocery & Delivery')
  assert.match(walmartAnalysis.urgency, /Order cutoff/i)
  assert.match(walmartAnalysis.requiredAction, /cart items|substitutions/i)
  assert.equal(walmartAnalysis.documents.some((d) => d.type === 'cart'), true)
  assert.match(walmartAnalysis.emailBody, /Walmart/i)
  assert.doesNotMatch(walmartAnalysis.emailBody, /Principal Adams/i)

  // 3. Science Camp Waiver
  const campItem = {
    id: 'prep-camp',
    description: '5th Grade Science Camp Emergency Medical Waiver & Medication Form',
    source_type: 'gmail',
    due_by: '2026-08-15',
    household_id: 'tabor',
    created_at: '2026-08-15T07:14:00Z',
    status: 'pending',
  }
  const campAnalysis = synthesizeActionAnalysis(campItem)
  assert.match(campAnalysis.senderLabel, /Principal Adams/i)
  assert.match(campAnalysis.urgency, /deadline/i)
  assert.match(campAnalysis.requiredAction, /signature/i)
  assert.equal(campAnalysis.documents.some((d) => d.type === 'waiver'), true)
  assert.ok(campAnalysis.suggestedEvent, 'Science camp waiver should have a suggested calendar event')
  assert.equal(campAnalysis.suggestedEvent.date, '2026-08-17')
  assert.match(campAnalysis.suggestedEvent.title, /Science Camp/i)

  // 4. School PTO Spirit Day (Lynita Butler)
  const ptoItem = {
    id: 'prep-pto',
    description: 'PTO Spirit Day 8/28/26 - Dear Parents & Guardians',
    source_type: 'gmail',
    due_by: '2026-08-28',
    household_id: 'tabor',
    created_at: '2026-08-15T09:00:00Z',
    status: 'pending',
  }
  const ptoAnalysis = synthesizeActionAnalysis(ptoItem)
  assert.match(ptoAnalysis.senderLabel, /Lynita Butler|PTO/i)
  assert.match(ptoAnalysis.urgency, /Spirit Day|August 28/i)
  assert.match(ptoAnalysis.requiredAction, /spirit shirt|uniform/i)
  assert.match(ptoAnalysis.emailBody, /Spirit Day|Palm Beach School/i)
  assert.ok(ptoAnalysis.suggestedEvent, 'PTO Spirit Day should have a suggested calendar event')
  assert.equal(ptoAnalysis.suggestedEvent.date, '2026-08-28')
  assert.equal(ptoAnalysis.suggestedEvent.allDay, true)
  assert.match(ptoAnalysis.suggestedEvent.title, /PTO Spirit Day/i)
})

test('detectSuggestedEvent: returns accurate plan for quick queue badge detection', async () => {
  const { detectSuggestedEvent } = await import('../src/utils/actionInspectionSynthesis.ts')

  const pto = detectSuggestedEvent({
    id: 'pto-1',
    description: 'PTO Spirit Day 8/28/26 - Wear Emerald Green & Gold',
    source_type: 'gmail',
    due_by: '2026-08-28',
  })
  assert.ok(pto)
  assert.equal(pto.date, '2026-08-28')
  assert.equal(pto.displayDate, 'Fri, Aug 28')
  assert.equal(pto.allDay, true)

  const camp = detectSuggestedEvent({
    id: 'camp-1',
    description: 'Lake Alpine Science Camp Waiver Due',
    source_type: 'gmail',
  })
  assert.ok(camp)
  assert.equal(camp.date, '2026-08-17')
  assert.equal(camp.displayDate, 'Mon, Aug 17')

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



