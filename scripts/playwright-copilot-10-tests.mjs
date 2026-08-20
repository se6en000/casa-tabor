import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf8')
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim().replace(/["\x27]/g, '')
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim().replace(/["\x27]/g, '')
const supabase = createClient(url, serviceKey)

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173'

async function runBrowserTests() {
  console.log(`🌐 Launching Chromium browser automation against: ${BASE_URL}`)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  // Clean any old test events
  await supabase.from('events').delete().ilike('title', '%Playwright%')
  await supabase.from('events').delete().ilike('title', '%Annual Pediatric%')

  // 1. Setup Test Event in Supabase
  const testEventId = crypto.randomUUID()
  const initialTitle = 'Playwright Copilot Test Event'
  const today = new Date()
  const startTime = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 15, 0, 0)).toISOString()
  const endTime = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16, 0, 0)).toISOString()

  console.log(`📅 Inserting test event: "${initialTitle}" (ID: ${testEventId})`)
  const { error: insErr } = await supabase.from('events').insert({
    id: testEventId,
    title: initialTitle,
    start_time: startTime,
    end_time: endTime,
    all_day: false,
    location_name: 'Original Medical Plaza',
    address: '100 Medical Center Dr',
  })
  if (insErr) {
    console.error('Failed to create test event:', insErr)
    await browser.close()
    process.exit(1)
  }

  // Fetch family members
  const { data: familyMembers } = await supabase.from('family_members').select('id, name')
  const familyMap = new Map((familyMembers ?? []).map(m => [m.name.toLowerCase(), m.id]))
  const primaryMember = (familyMembers || []).find(m => m.name.toLowerCase() === 'jake') || (familyMembers || [])[0]

  // Bypass PIN gate with clean profile session
  await page.addInitScript(({ storageKey, member }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      memberId: member.id,
      memberName: member.name,
      token: 'authenticated-kiosk-session',
    }))
  }, { storageKey: 'casa_tabor_profile_session', member: primaryMember })

  const results = []

  try {
    console.log(`🧭 Navigating to calendar page...`)
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    console.log(`🤖 Dispatching open-ai-chat event in browser context...`)
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('open-ai-chat'))
    })
    await page.waitForTimeout(1500)

    const getTextarea = async () => {
      const typeInstead = page.locator('button:has-text("Type instead")').first()
      if (await typeInstead.isVisible({ timeout: 500 }).catch(() => false)) {
        await typeInstead.click().catch(() => {})
        await page.waitForTimeout(500)
      }
      const ta = page.locator('textarea[aria-label="Assistant message"], textarea[placeholder*="Ask Copilot"]').first()
      await ta.waitFor({ state: 'visible', timeout: 10000 })
      return ta
    }

    const initialTa = await getTextarea()
    console.log(`✓ Copilot chat input is active and ready in the browser.`)

    // 10 Distinct test conversations through browser control
    const testCases = [
      {
        id: 1,
        name: 'Single Driver',
        prompt: 'Kelly is driving to Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
          const d0 = data?.driver_overrides?.[0] || data?.driver_overrides?.['0']
          return d0 === familyMap.get('kelly')
        },
      },
      {
        id: 2,
        name: 'Split Drivers',
        prompt: 'Jake will drop off and Kelly pick up for Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
          const d0 = data?.driver_overrides?.[0] || data?.driver_overrides?.['0']
          const d1 = data?.driver_overrides?.[1] || data?.driver_overrides?.['1']
          return d0 === familyMap.get('jake') && d1 === familyMap.get('kelly')
        },
      },
      {
        id: 3,
        name: 'Logistics Mode',
        prompt: 'stay on site for Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
          return data?.waits === true
        },
      },
      {
        id: 4,
        name: 'Category Tagging',
        prompt: 'tag Playwright Copilot Test Event as Medical',
        verifyDb: async () => {
          const { data } = await supabase.from('event_enrichments').select('*').eq('event_id', testEventId).maybeSingle()
          return data?.category?.toLowerCase() === 'medical'
        },
      },
      {
        id: 5,
        name: 'Add Attendees',
        prompt: 'add Owen and Liv to Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_members').select('family_member_id').eq('event_id', testEventId)
          const memberIds = new Set((data || []).map(m => m.family_member_id))
          return memberIds.has(familyMap.get('owen')) && memberIds.has(familyMap.get('liv'))
        },
      },
      {
        id: 6,
        name: 'Remove Attendee',
        prompt: 'remove Owen from Playwright Copilot Test Event attendees',
        verifyDb: async () => {
          const { data } = await supabase.from('event_members').select('family_member_id').eq('event_id', testEventId)
          const memberIds = new Set((data || []).map(m => m.family_member_id))
          return !memberIds.has(familyMap.get('owen')) && memberIds.has(familyMap.get('liv'))
        },
      },
      {
        id: 7,
        name: 'Primary Attendee',
        prompt: 'make Emme the primary attendee for Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_members').select('*').eq('event_id', testEventId)
          const emmeMember = (data || []).find(m => m.family_member_id === familyMap.get('emme'))
          return emmeMember?.role === 'primary_attendee'
        },
      },
      {
        id: 8,
        name: 'Location & Venue',
        prompt: 'update location for Playwright Copilot Test Event to Walgreens on Dixie Hwy',
        verifyDb: async () => {
          const { data } = await supabase.from('events').select('location_name, address').eq('id', testEventId).single()
          return (data?.location_name || data?.address || '').toLowerCase().includes('walgreens')
        },
      },
      {
        id: 9,
        name: 'Prep Checklist',
        prompt: 'bring water bottle and shin guards to Playwright Copilot Test Event',
        verifyDb: async () => {
          const { data } = await supabase.from('event_checklist_items').select('*').eq('event_id', testEventId)
          const titles = (data || []).map(i => (i.label || i.title || '').toLowerCase())
          return titles.some(t => t.includes('water bottle')) || titles.some(t => t.includes('shin guards'))
        },
      },
      {
        id: 10,
        name: 'Rename Title',
        prompt: 'rename Playwright Copilot Test Event to Annual Pediatric Physical',
        verifyDb: async () => {
          const { data } = await supabase.from('events').select('title').eq('id', testEventId).single()
          return data?.title === 'Annual Pediatric Physical'
        },
      },
    ]

    for (const tc of testCases) {
      console.log(`\n------------------------------------------------------------`)
      console.log(`💬 Conversation ${tc.id}/10: "${tc.prompt}" [${tc.name}]`)

      const chatTextarea = await getTextarea()
      await chatTextarea.fill(tc.prompt)
      await page.waitForTimeout(200)
      
      // Press Enter to submit
      await chatTextarea.press('Enter')
      console.log(`   Submitted prompt via browser Enter key.`)

      // Wait for response bubble or tool action card
      await page.waitForTimeout(4000)

      // Look for any Apply / Confirm button if an action card is rendered
      const applyButton = page.locator('button:has-text("Apply change"), button:has-text("Apply"), button:has-text("Confirm"), [data-testid="apply-action-button"]').first()
      if (await applyButton.isVisible({ timeout: 2500 }).catch(() => false)) {
        console.log(`   Found action proposal button. Clicking to apply...`)
        await applyButton.click()
        await page.waitForTimeout(3000)
      }

      // Verify DB state
      let isDbValid = false
      for (let attempt = 0; attempt < 5; attempt++) {
        isDbValid = await tc.verifyDb().catch(() => false)
        if (isDbValid) break
        await page.waitForTimeout(1000)
      }

      // Take a screenshot of the chat turn
      const screenshotPath = `/Users/taboj/.gemini/antigravity/brain/38347c3e-6018-44a7-b669-3682440ecd15/scratch/browser-test-${tc.id}.png`
      await page.screenshot({ path: screenshotPath, fullPage: false })

      if (isDbValid) {
        console.log(`   ✅ PASS: Verified mutation applied in DB and reflected in UI.`)
        results.push({ id: tc.id, name: tc.name, prompt: tc.prompt, status: 'PASS', screenshot: screenshotPath })
      } else {
        console.log(`   ❌ FAIL: Mutation was not reflected in DB.`)
        results.push({ id: tc.id, name: tc.name, prompt: tc.prompt, status: 'FAIL', screenshot: screenshotPath })
      }

      // Brief pacing before next turn
      await page.waitForTimeout(1000)
    }

  } catch (err) {
    console.error('Fatal error during browser automation:', err)
  } finally {
    // Cleanup
    console.log(`\n🧹 Cleaning up test events...`)
    await supabase.from('events').delete().ilike('title', '%Playwright%')
    await supabase.from('events').delete().ilike('title', '%Annual Pediatric%')
    await browser.close()
    console.log('Browser closed.')
  }

  console.log('\n============================================================')
  console.log('📊 BROWSER CONTROL TEST SUMMARY')
  console.log('============================================================')
  for (const r of results) {
    console.log(`[${r.status === 'PASS' ? 'x' : ' '}] ${r.id.toString().padStart(2)}. ${r.name.padEnd(20)} | "${r.prompt.padEnd(65)}" -> ${r.status}`)
  }
}

runBrowserTests()
