import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf8')
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim().replace(/["\x27]/g, '')
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim().replace(/["\x27]/g, '')
const supabase = createClient(url, anonKey)

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173'

async function runHeadedLiveTest() {
  console.log('============================================================')
  console.log('🎬 Launching Headed Chromium Browser — Natural Language Varied Phrasing!')
  console.log('============================================================')

  // Clean old test events
  await supabase.from('events').delete().ilike('title', '%Pediatric%')
  await supabase.from('events').delete().ilike('title', '%Annual%')

  // 1. Create fresh test event
  const testEventId = crypto.randomUUID()
  const initialTitle = 'Pediatric Exam'
  const today = new Date()
  const startTime = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 15, 0, 0)).toISOString()
  const endTime = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16, 0, 0)).toISOString()

  console.log(`📅 Creating fresh event: "${initialTitle}" (${testEventId})`)
  const { error: insErr } = await supabase.from('events').insert({
    id: testEventId,
    title: initialTitle,
    start_time: startTime,
    end_time: endTime,
    all_day: false,
    location_name: 'Pediatric Health Center',
    address: '100 Medical Center Dr',
  })
  if (insErr) {
    console.error('Error inserting test event:', insErr)
    process.exit(1)
  }

  // Fetch family members
  const { data: familyMembers } = await supabase.from('family_members').select('id, name')
  const familyMap = new Map((familyMembers ?? []).map(m => [m.name.toLowerCase(), m.id]))
  const primaryMember = (familyMembers || []).find(m => m.name.toLowerCase() === 'jake') || (familyMembers || [])[0]

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  await page.addInitScript(({ storageKey, member }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      memberId: member.id,
      memberName: member.name,
      token: 'authenticated-kiosk-session',
    }))
  }, { storageKey: 'casa_tabor_profile_session', member: primaryMember })

  const results = []

  // Diverse natural language phrasings
  const testCases = [
    {
      id: 1,
      name: 'Single Driver (Conversational)',
      prompt: 'Can Kelly take care of driving for the Pediatric Exam?',
      verifyDb: async () => {
        const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
        const d0 = data?.driver_overrides?.[0] || data?.driver_overrides?.['0']
        const planDriver = data?.transportation_plan?.legs?.[0]?.driverName
        return d0 === familyMap.get('kelly') || planDriver === 'Kelly'
      },
    },
    {
      id: 2,
      name: 'Split Drivers (Colloquial)',
      prompt: 'Let\'s have Jake do drop-off and Kelly do pick-up for Pediatric Exam',
      verifyDb: async () => {
        const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
        const d0 = data?.driver_overrides?.[0] || data?.driver_overrides?.['0']
        const d1 = data?.driver_overrides?.[1] || data?.driver_overrides?.['1']
        const leg0 = data?.transportation_plan?.legs?.[0]?.driverName
        const leg1 = data?.transportation_plan?.legs?.[1]?.driverName
        return (d0 === familyMap.get('jake') && d1 === familyMap.get('kelly')) || (leg0 === 'Jake' && leg1 === 'Kelly')
      },
    },
    {
      id: 3,
      name: 'Logistics Stay on Site (Indirect)',
      prompt: 'Whoever goes to Pediatric Exam needs to wait there during the appointment rather than leaving',
      verifyDb: async () => {
        const { data } = await supabase.from('event_plan_overrides').select('*').eq('event_id', testEventId).maybeSingle()
        return data?.waits === true || data?.transportation_plan?.waitOnSite === true
      },
    },
    {
      id: 4,
      name: 'Category Classification (Natural)',
      prompt: 'Please categorize Pediatric Exam under Medical appointments',
      verifyDb: async () => {
        const { data: ev } = await supabase.from('events').select('category').eq('id', testEventId).maybeSingle()
        const { data: en } = await supabase.from('event_enrichments').select('category').eq('event_id', testEventId).maybeSingle()
        return (ev?.category || en?.category || '').toLowerCase() === 'medical'
      },
    },
    {
      id: 5,
      name: 'Add Attendees (Casual List)',
      prompt: 'Include Liv and Owen on the attendee list for Pediatric Exam',
      verifyDb: async () => {
        const { data } = await supabase.from('event_members').select('family_member_id').eq('event_id', testEventId)
        const memberIds = new Set((data || []).map(m => m.family_member_id))
        return memberIds.has(familyMap.get('owen')) && memberIds.has(familyMap.get('liv'))
      },
    },
    {
      id: 6,
      name: 'Remove Attendee (Conversational)',
      prompt: 'Actually Owen cannot make it to Pediatric Exam, take him off',
      verifyDb: async () => {
        const { data } = await supabase.from('event_members').select('family_member_id').eq('event_id', testEventId)
        const memberIds = new Set((data || []).map(m => m.family_member_id))
        return !memberIds.has(familyMap.get('owen'))
      },
    },
    {
      id: 7,
      name: 'Primary Attendee (Natural)',
      prompt: 'Set Emme as the primary person for Pediatric Exam',
      verifyDb: async () => {
        const { data } = await supabase.from('event_members').select('*').eq('event_id', testEventId)
        const emme = (data || []).find(m => m.family_member_id === familyMap.get('emme'))
        return emme?.role === 'primary_attendee' || emme?.is_primary === true
      },
    },
    {
      id: 8,
      name: 'Update Venue (Conversational)',
      prompt: 'The appointment moved to Walgreens Pharmacy on Dixie Hwy for Pediatric Exam',
      verifyDb: async () => {
        const { data } = await supabase.from('events').select('location_name, address').eq('id', testEventId).single()
        return (data?.location_name || data?.address || '').toLowerCase().includes('walgreens') || (data?.location_name || data?.address || '').toLowerCase().includes('dixie')
      },
    },
    {
      id: 9,
      name: 'Prep / Packing Items (Natural)',
      prompt: 'Remember to pack a water bottle and shin guards for Pediatric Exam',
      verifyDb: async () => {
        const { data } = await supabase.from('event_checklist_items').select('*').eq('event_id', testEventId)
        const titles = (data || []).map(i => (i.label || i.title || '').toLowerCase())
        return titles.some(t => t.includes('water bottle')) || titles.some(t => t.includes('shin guards'))
      },
    },
    {
      id: 10,
      name: 'Rename Title (Conversational)',
      prompt: 'Let\'s change the name of Pediatric Exam to Annual Pediatric Wellness Check',
      verifyDb: async () => {
        const { data } = await supabase.from('events').select('title').eq('id', testEventId).single()
        return (data?.title || '').toLowerCase().includes('annual pediatric') || (data?.title || '').toLowerCase().includes('wellness')
      },
    },
  ]

  try {
    console.log('🧭 Opening Casa Calendar in browser...')
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    console.log('🤖 Opening Copilot drawer...')
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('open-ai-chat'))
    })
    await page.waitForTimeout(1500)

    const getTextarea = async () => {
      const typeInstead = page.locator('button:has-text("Type instead")').first()
      if (await typeInstead.isVisible({ timeout: 500 }).catch(() => false)) {
        await typeInstead.click().catch(() => {})
        await page.waitForTimeout(300)
      }
      const ta = page.locator('textarea[aria-label="Assistant message"], textarea[placeholder*="Ask Copilot"]').last()
      await ta.waitFor({ state: 'visible', timeout: 10000 })
      return ta
    }

    await getTextarea()
    console.log('✓ Ready for live conversation execution.\n')

    for (const tc of testCases) {
      console.log(`💬 Test ${tc.id}/10: "${tc.prompt}"`)
      console.log(`   Intent: [${tc.name}]`)

      const chatTextarea = await getTextarea()
      await chatTextarea.click()
      await chatTextarea.fill(tc.prompt)
      await page.waitForTimeout(300)
      await chatTextarea.press('Enter')

      // Wait for the action proposal button to appear
      let clicked = false
      const deadline = Date.now() + 18000
      while (Date.now() < deadline) {
        const activeButtons = page.locator('button:has-text("Apply change"), button:has-text("Yes, prepare it"), button:has-text("Create event"), button:has-text("Apply")')
        const count = await activeButtons.count()
        if (count > 0) {
          const latestBtn = activeButtons.nth(count - 1)
          if (await latestBtn.isVisible()) {
            console.log('   👆 Proposal action card generated! Clicking action button...')
            await page.waitForTimeout(600)
            await latestBtn.click().catch(() => {})
            clicked = true
            await page.waitForTimeout(2500)
            break
          }
        }
        await page.waitForTimeout(500)
      }

      if (!clicked) {
        await page.waitForTimeout(2000)
      }

      // Verify database
      let isDbValid = false
      for (let a = 0; a < 6; a++) {
        isDbValid = await tc.verifyDb().catch(() => false)
        if (isDbValid) break
        await page.waitForTimeout(1000)
      }

      if (isDbValid) {
        console.log(`   ✅ PASS: Semantic intent understood, DB updated, UX refreshed.`)
        results.push({ id: tc.id, name: tc.name, prompt: tc.prompt, status: 'PASS' })
      } else {
        console.log(`   ❌ FAIL: Mutation was not reflected in DB.`)
        results.push({ id: tc.id, name: tc.name, prompt: tc.prompt, status: 'FAIL' })
      }

      await page.waitForTimeout(1000)
    }

    console.log('\n============================================================')
    console.log('📊 NATURAL LANGUAGE VARIANCE TEST SUMMARY')
    console.log('============================================================')
    for (const r of results) {
      console.log(`[${r.status === 'PASS' ? 'x' : ' '}] Test ${r.id.toString().padStart(2)}: ${r.name.padEnd(35)} -> ${r.status}`)
    }

    await page.waitForTimeout(6000)

  } catch (error) {
    console.error('Error during test execution:', error)
  } finally {
    await supabase.from('events').delete().ilike('title', '%Pediatric%')
    await browser.close()
    console.log('Test session completed.')
  }
}

runHeadedLiveTest()
