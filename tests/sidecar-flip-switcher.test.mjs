import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

import { useAppStore } from '../src/stores/appStore.ts'

test('appStore: sidecarTab switching operations', () => {
  // Set initial state
  useAppStore.setState({ sidecarTab: 'event', selectedSidecarEventId: 'evt-123', aiDrawerOpen: true })
  assert.equal(useAppStore.getState().sidecarTab, 'event')
  assert.equal(useAppStore.getState().selectedSidecarEventId, 'evt-123')

  // Toggle sidecar tab to 'ai'
  useAppStore.getState().toggleSidecarTab()
  assert.equal(useAppStore.getState().sidecarTab, 'ai')
  // selected event ID should be preserved during the flip
  assert.equal(useAppStore.getState().selectedSidecarEventId, 'evt-123')

  // Toggle sidecar tab back to 'event'
  useAppStore.getState().toggleSidecarTab()
  assert.equal(useAppStore.getState().sidecarTab, 'event')
  assert.equal(useAppStore.getState().selectedSidecarEventId, 'evt-123')

  // openAiInSidecar switches to 'ai' and keeps drawer open
  useAppStore.getState().openAiInSidecar({ prompt: 'Hello Copilot' })
  assert.equal(useAppStore.getState().sidecarTab, 'ai')
  assert.equal(useAppStore.getState().aiDrawerOpen, true)

  // openEventInSidecar switches to 'event' and sets new event ID
  useAppStore.getState().openEventInSidecar('evt-456')
  assert.equal(useAppStore.getState().sidecarTab, 'event')
  assert.equal(useAppStore.getState().selectedSidecarEventId, 'evt-456')
  assert.equal(useAppStore.getState().aiDrawerOpen, true)
})

test('LivingFlowHeader component source contract: Rotate3d icon and onSwitchToAi support', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/calendar/living-flow/components/LivingFlowHeader.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.match(content, /Rotate3d/, 'LivingFlowHeader must import and render Rotate3d icon')
  assert.match(content, /onSwitchToAi/, 'LivingFlowHeader must accept onSwitchToAi prop')
  assert.match(content, /Flip to Copilot|Switch to Copilot/i, 'LivingFlowHeader must have accessible label/title for the flip button')
})

test('AIChatDrawer component source contract: Rotate3d icon and onSwitchToEvent support', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/shared/AIChatDrawer.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.match(content, /Rotate3d/, 'AIChatDrawer must import and render Rotate3d icon')
  assert.match(content, /onSwitchToEvent/, 'AIChatDrawer must accept onSwitchToEvent prop')
  assert.match(content, /Flip to inspection details|Flip to event|Switch to event/i, 'AIChatDrawer must have accessible label/title for the flip button')
})

test('LivingFlowSidecar and types contract: forwards onSwitchToAi', () => {
  const typesPath = path.resolve(process.cwd(), 'src/components/calendar/living-flow/types.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  assert.match(typesContent, /onSwitchToAi\?:/, 'LivingFlowProps must include onSwitchToAi prop')

  const sidecarPath = path.resolve(process.cwd(), 'src/components/calendar/living-flow/LivingFlowSidecar.tsx')
  const sidecarContent = fs.readFileSync(sidecarPath, 'utf-8')
  assert.match(sidecarContent, /onSwitchToAi/, 'LivingFlowSidecar must forward onSwitchToAi prop to LivingFlowHeader')
})

test('SidecarCompanion 3D Flip Card architecture contract', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/shared/SidecarCompanion.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  assert.match(content, /onSwitchToAi/, 'SidecarCompanion must pass onSwitchToAi to LivingFlowSidecar')
  assert.match(content, /onSwitchToEvent/, 'SidecarCompanion must pass onSwitchToEvent to AIChatDrawer')
  assert.match(content, /preserve-3d|perspective|rotateY/i, 'SidecarCompanion must implement 3D flip card transform')
})
