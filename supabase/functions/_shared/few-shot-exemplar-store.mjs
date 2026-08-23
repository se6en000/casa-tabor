// supabase/functions/_shared/few-shot-exemplar-store.mjs
/**
 * Dynamic Few-Shot Exemplar Memory Store & Runtime Prompt Injector
 * Pure ESM Module (zero external dependencies) for Edge Functions and Node.js test runner.
 */

// In-memory cache for edge function execution lifecycles (5 minute TTL)
let cachedExemplars = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

export function extractDomainFromEmail(emailOrSender) {
  if (!emailOrSender) return ''
  const str = String(emailOrSender).trim().toLowerCase()
  const match = str.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)
  if (match) return match[1]
  const domainMatch = str.match(/(?:^|\/\/)([a-z0-9.-]+\.[a-z]{2,})/i)
  return domainMatch ? domainMatch[1] : str
}

export function tokenizeText(text) {
  if (!text) return new Set()
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

export function calculateJaccardSimilarity(tokensA, tokensB) {
  if (!tokensA || !tokensB || tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Multi-factor scoring heuristic evaluating exemplar relevance to an incoming email
 */
export function scoreExemplar(exemplar, query = {}) {
  let score = 0
  const qDomain = (query.domain || extractDomainFromEmail(query.from || query.sender || '')).toLowerCase()
  const qSender = (query.from || query.sender || '').toLowerCase()
  const qSubject = (query.subject || query.title || '').toLowerCase()
  const qBody = (query.body || query.snippet || '').toLowerCase()
  const qArchetype = query.archetype || query.emailArchetype

  const exDomain = (exemplar.domain || '').toLowerCase()
  const exSender = (exemplar.sender_pattern || exemplar.senderPattern || '').toLowerCase()
  const exArchetype = exemplar.email_archetype || exemplar.emailArchetype
  const exSubject = (exemplar.sample_subject || exemplar.sampleSubject || '').toLowerCase()
  const exSnippet = (exemplar.sample_snippet || exemplar.sampleSnippet || '').toLowerCase()
  const exWeight = Number(exemplar.exemplar_weight ?? exemplar.exemplarWeight ?? 1.0)

  // 1. Exact or Subdomain Match (up to 40 pts)
  if (qDomain && exDomain) {
    if (qDomain === exDomain) {
      score += 40
    } else if (qDomain.endsWith(`.${exDomain}`) || exDomain.endsWith(`.${qDomain}`)) {
      score += 25
    } else if (qSender.includes(exDomain)) {
      score += 20
    }
  }

  // 2. Sender pattern match (up to 30 pts)
  if (qSender && exSender) {
    const cleanPattern = exSender.replace(/%/g, '')
    if (cleanPattern && qSender.includes(cleanPattern)) {
      score += 30
    }
  }

  // 3. Archetype match (20 pts)
  if (qArchetype && exArchetype && qArchetype === exArchetype) {
    score += 20
  }

  // 4. Subject Jaccard similarity (up to 25 pts)
  if (qSubject && exSubject) {
    const tokensQ = tokenizeText(qSubject)
    const tokensEx = tokenizeText(exSubject)
    const jaccard = calculateJaccardSimilarity(tokensQ, tokensEx)
    score += Math.round(jaccard * 25)
  }

  // 5. Snippet / keyword co-occurrence (up to 15 pts)
  if (qBody && exSnippet) {
    const keywords = [
      'waiver', 'tracking', 'order', 'flight', 'gate', 'schedule',
      'doctor', 'visit', 'bill', 'due', 'delivered', 'shipped',
      'cancelled', 'delay', 'swimming', 'camp', 'concussion',
      'pool', 'hoa', 'sprinkler', 'grocery', 'inhome', 'curriculum',
    ]
    let matchCount = 0
    for (const kw of keywords) {
      if (qBody.includes(kw) && exSnippet.includes(kw)) {
        matchCount++
      }
    }
    score += Math.min(15, matchCount * 5)
  }

  // Fallback baseline for domain wildcard
  if (exDomain === '*') {
    score += 10
  }

  return score * exWeight
}

/**
 * Scores, ranks, and filters candidate exemplars
 */
export function scoreAndRankExemplars(exemplars = [], query = {}, options = {}) {
  const limit = options.limit ?? 2
  const minScore = options.minScore ?? 10

  if (!Array.isArray(exemplars) || exemplars.length === 0) {
    return []
  }

  const scored = exemplars
    .filter((e) => e.active !== false)
    .map((e) => ({
      exemplar: e,
      score: scoreExemplar(e, query),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)

  // Ensure diversity: avoid returning duplicate exemplars with identical subjects
  const seenSubjects = new Set()
  const result = []

  for (const item of scored) {
    const subj = (item.exemplar.sample_subject || item.exemplar.sampleSubject || '').toLowerCase()
    if (!seenSubjects.has(subj)) {
      seenSubjects.add(subj)
      result.push(item.exemplar)
      if (result.length >= limit) break
    }
  }

  return result
}

/**
 * Formats retrieved exemplars into a clean markdown prompt block
 */
export function formatFewShotPromptBlock(exemplars = []) {
  if (!Array.isArray(exemplars) || exemplars.length === 0) {
    return ''
  }

  let block = '\n### REFERENCE GOLDEN EXTRACTION EXEMPLARS:\n'
  block += 'Follow these approved structured extraction patterns for similar household messages:\n\n'

  for (let i = 0; i < exemplars.length; i++) {
    const e = exemplars[i]
    const domain = e.domain || 'general'
    const archetype = e.email_archetype || e.emailArchetype || 'unknown'
    const subject = e.sample_subject || e.sampleSubject || ''
    const snippet = e.sample_snippet || e.sampleSnippet || ''
    const output = e.extracted_output || e.extractedOutput || {}

    block += `[Example ${i + 1} | Domain: ${domain} | Archetype: ${archetype}]\n`
    block += `Input Subject: "${subject}"\n`
    block += `Input Excerpt: "${snippet.slice(0, 300)}"\n`
    block += `Expected Structured Output:\n`
    block += '```json\n'
    block += JSON.stringify(output, null, 2) + '\n'
    block += '```\n\n'
  }

  return block
}

/**
 * Fallback golden seeds (14 seeds across all 6 archetypes)
 */
export function getDefaultGoldenExemplars() {
  return [
    {
      id: 'seed-walmart-01',
      domain: 'walmart.com',
      sender_pattern: '%help@walmart.com%',
      email_archetype: 'logistics_parcels',
      sample_subject: 'Thanks for your InHome delivery order, Jacob',
      sample_snippet: 'Your Walmart InHome grocery order 200015480824348 ($138.65) is scheduled for delivery tomorrow between 2pm - 6pm. 27 items including fresh organic milk and produce.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'Walmart InHome Delivery (27 items)',
          description: 'Walmart grocery delivery scheduled tomorrow between 2pm-6pm (Order #2000154-80824348)',
          due_datetime: '2026-08-24T18:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'Walmart',
          transaction_id: '2000154-80824348',
          transaction_status: 'confirmed',
          is_perishable: true,
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'Walmart',
          vendorKey: 'walmart',
          orderId: '2000154-80824348',
          canonicalOrderId: '2000154-80824348',
          carrier: null,
          trackingNumber: null,
          compositeThreadKey: 'transaction:walmart:2000154-80824348',
          effectiveStage: 'confirmed',
          isPerishable: true,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-amazon-01',
      domain: 'amazon.com',
      sender_pattern: '%auto-confirm@amazon.com%',
      email_archetype: 'logistics_parcels',
      sample_subject: 'Your Amazon.com order of 3 items has shipped',
      sample_snippet: 'Your order # 112-8472910-4829103 has shipped via UPS (Tracking: 1Z9999999999999999). Estimated delivery: Friday, Aug 22 by 8:00 PM.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'Amazon Shipment #112-8472910-4829103',
          description: 'Order #112-8472910-4829103 shipped via UPS 1Z9999999999999999. Estimated delivery Friday, Aug 22.',
          due_datetime: '2026-08-22T20:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'Amazon',
          transaction_id: '112-8472910-4829103',
          transaction_status: 'shipped',
          policy_disclaimer: 'Return eligible within 30 days of receipt.',
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'Amazon',
          vendorKey: 'amazon',
          orderId: '112-8472910-4829103',
          canonicalOrderId: '112-8472910-4829103',
          carrier: 'ups',
          trackingNumber: '1Z9999999999999999',
          compositeThreadKey: 'transaction:amazon:112-8472910-4829103',
          effectiveStage: 'shipped',
          isPerishable: false,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-hellofresh-01',
      domain: 'hellofresh.com',
      sender_pattern: '%delivery@hellofresh.com%',
      email_archetype: 'logistics_parcels',
      sample_subject: 'Your weekly meal box #HF-9928172 is on its way!',
      sample_snippet: 'Your HelloFresh meal kit order HF-9928172 has shipped via FedEx tracking 789456123012. Fresh ingredients packed on ice.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'HelloFresh Box #HF-9928172',
          description: 'Weekly meal kit box shipped via FedEx 789456123012',
          due_datetime: '2026-08-23T18:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'HelloFresh',
          transaction_id: 'HF-9928172',
          transaction_status: 'shipped',
          is_perishable: true,
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'HelloFresh',
          vendorKey: 'hellofresh',
          orderId: 'HF-9928172',
          canonicalOrderId: 'HF-9928172',
          carrier: 'fedex',
          trackingNumber: '789456123012',
          compositeThreadKey: 'transaction:hellofresh:hf-9928172',
          effectiveStage: 'shipped',
          isPerishable: true,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.4,
      active: true,
    },
    {
      id: 'seed-school-waiver-01',
      domain: 'palmbeachschools.org',
      sender_pattern: '%principal@palmbeachschools.org%',
      email_archetype: 'executive_actions',
      sample_subject: 'Action Required: Sign Fall 2026 Science Camp Liability Waiver for Liv',
      sample_snippet: 'Dear Parents, please complete the digital parent liability and emergency medical release waiver for the 6th Grade Science Camp. The form must be signed and returned by Sept 5, 2026.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'forms',
          title: 'Sign Science Camp Liability Waiver (Liv)',
          description: 'Complete digital parent liability and emergency medical release waiver for 6th Grade Science Camp by Sept 5, 2026.',
          due_datetime: '2026-09-05T23:59:59Z',
          assigned_member: 'Liv',
          priority: 2,
          agency_level: 2,
          source_origin: 'email_body',
        }],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-fpl-01',
      domain: 'fpl.com',
      sender_pattern: '%billing@fpl.com%',
      email_archetype: 'executive_actions',
      sample_subject: 'Florida Power & Light: Your monthly electric bill ($241.18) is due Sept 5',
      sample_snippet: 'Your Florida Power & Light statement for account *******8492 is ready. Balance due: $241.18. Due date: September 5, 2026.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'payment',
          title: 'Pay FPL Electric Bill ($241.18)',
          description: 'Monthly electric utility bill for account 8492 ($241.18) due Sept 5, 2026.',
          due_datetime: '2026-09-05T23:59:59Z',
          priority: 2,
          agency_level: 2,
          vendor: 'Florida Power & Light',
          transaction_id: '8492',
          source_origin: 'email_body',
        }],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-soccer-physical-01',
      domain: 'jupiterunitedsoccer.com',
      sender_pattern: '%coach@jupiterunitedsoccer.com%',
      email_archetype: 'executive_actions',
      sample_subject: 'Urgent: Complete FHSAA Concussion Protocol & Physical Form for Emme',
      sample_snippet: 'All competitive players must submit an updated FHSAA concussion protocol acknowledgement and sports physical before the first match. Due Aug 29.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'forms',
          title: 'Submit FHSAA Concussion Form & Physical (Emme)',
          description: 'Submit updated concussion acknowledgement and sports physical for soccer before Aug 29.',
          due_datetime: '2026-08-29T23:59:59Z',
          assigned_member: 'Emme',
          priority: 3,
          agency_level: 2,
          source_origin: 'email_body',
        }],
      },
      exemplar_weight: 1.4,
      active: true,
    },
    {
      id: 'seed-doctor-01',
      domain: 'pediatricassociates.com',
      sender_pattern: '%appointments@pediatricassociates.com%',
      email_archetype: 'temporal_appointments',
      sample_subject: 'Confirmation: Liv Annual Well-Child Visit on Sept 14 at 9:00 AM',
      sample_snippet: 'Appointment Confirmation for Liv Tabor with Dr. Hanna on Monday, September 14, 2026 at 9:00 AM. Location: Pediatric Associates Palm Beach Gardens.',
      extracted_output: {
        intent: 'new_event',
        events: [{
          title: 'Liv Annual Well-Child Visit',
          start_datetime: '2026-09-14T09:00:00-04:00',
          end_datetime: '2026-09-14T10:00:00-04:00',
          all_day: false,
          location: 'Pediatric Associates Palm Beach Gardens',
          description: 'Annual well-child checkup for Liv with Dr. Hanna',
          assigned_member: 'Liv',
        }],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-bak-curriculum-01',
      domain: 'palmbeachschools.org',
      sender_pattern: '%bakmsoa.palmbeachschools.org%',
      email_archetype: 'temporal_appointments',
      sample_subject: 'Bak MSOA Curriculum Night & Open House: Thursday Aug 27 at 5:30 PM',
      sample_snippet: 'Join us on Thursday, August 27, 2026. 6th Grade session starts at 5:30 PM, 7th & 8th Grade session starts at 6:45 PM in the main auditorium.',
      extracted_output: {
        intent: 'new_event',
        events: [
          {
            title: 'Bak MSOA 6th Grade Curriculum Night',
            start_datetime: '2026-08-27T17:30:00-04:00',
            end_datetime: '2026-08-27T18:30:00-04:00',
            all_day: false,
            location: 'Bak MSOA Main Auditorium',
            description: '6th Grade Open House and Curriculum Night orientation session',
          },
          {
            title: 'Bak MSOA 7th & 8th Grade Curriculum Night',
            start_datetime: '2026-08-27T18:45:00-04:00',
            end_datetime: '2026-08-27T19:45:00-04:00',
            all_day: false,
            location: 'Bak MSOA Main Auditorium',
            description: '7th and 8th Grade Open House and Curriculum Night orientation session',
          },
        ],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-delta-01',
      domain: 'delta.com',
      sender_pattern: '%ticketreceipt@delta.com%',
      email_archetype: 'lifecycle_updates',
      sample_subject: 'Schedule Change Alert: Flight DL1482 on Oct 14 departs 11:15 AM',
      sample_snippet: 'Important schedule update: Flight DL1482 from PBI to ATL on Oct 14, 2026 has been moved from 4:30 PM to 11:15 AM. Confirmation code # GHY82K.',
      extracted_output: {
        intent: 'update_event',
        updates_event_title: 'Flight DL1482: PBI to ATL',
        updates_event_date: '2026-10-14',
        change_summary: 'Departure time moved earlier from 4:30 PM to 11:15 AM (Confirmation # GHY82K)',
        start_datetime: '2026-10-14T11:15:00-04:00',
        end_datetime: '2026-10-14T13:10:00-04:00',
        location: 'PBI Airport',
        description: 'Delta Flight DL1482 departure time changed to 11:15 AM',
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-ups-exception-01',
      domain: 'ups.com',
      sender_pattern: '%tracking@ups.com%',
      email_archetype: 'lifecycle_updates',
      sample_subject: 'UPS Exception: Severe weather delay for tracking 1Z9999999999999999',
      sample_snippet: 'Severe tropical weather has delayed transportation. Your delivery date for UPS tracking 1Z9999999999999999 has been updated to Tuesday, Aug 25.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'UPS Delivery Delay (Weather Exception)',
          description: 'UPS tracking 1Z9999999999999999 delayed due to severe weather. Rescheduled to Tuesday, Aug 25.',
          due_datetime: '2026-08-25T20:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'UPS',
          transaction_id: '1Z9999999999999999',
          transaction_status: 'problem',
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'UPS',
          vendorKey: 'ups',
          orderId: null,
          canonicalOrderId: null,
          carrier: 'ups',
          trackingNumber: '1Z9999999999999999',
          compositeThreadKey: 'courier:ups:1z9999999999999999',
          effectiveStage: 'problem',
          isPerishable: false,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.4,
      active: true,
    },
    {
      id: 'seed-hoa-01',
      domain: 'taborhoa.org',
      sender_pattern: '%board@taborhoa.org%',
      email_archetype: 'estate_knowledge',
      sample_subject: 'Tabor Estates HOA: Fall 2026 Landscaping & Sprinkler Restriction Rules',
      sample_snippet: 'Town water conservation mandate: Odd numbered homes may water lawns on Wednesdays and Saturdays before 8:00 AM. Even numbered homes on Thursdays and Sundays.',
      extracted_output: {
        intent: 'skip',
        family_evidence: {
          relevant: true,
          category: 'utilities',
          summary: 'Tabor Estates HOA lawn irrigation restrictions: Odd-numbered homes water Wed/Sat before 8:00 AM; Even-numbered homes water Thu/Sun.',
          entity_names: ['Tabor Estates HOA', 'Town Water Conservation'],
          effective_at: '2026-08-19T00:00:00Z',
          privacy_class: 'standard',
          confidence: 0.95,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-pool-log-01',
      domain: 'flacleanpool.com',
      sender_pattern: '%service@flacleanpool.com%',
      email_archetype: 'estate_knowledge',
      sample_subject: 'Weekly Pool Chemistry & Salt Cell Maintenance Log - August 2026',
      sample_snippet: 'Service complete: Salt level 3200 ppm, pH 7.4, Chlorine 3.0 ppm. Cleaned skimmer baskets and inspected pump timer.',
      extracted_output: {
        intent: 'skip',
        family_evidence: {
          relevant: true,
          category: 'other_family_service',
          summary: 'Pool maintenance log: Salt 3200 ppm, pH 7.4, Chlorine 3.0 ppm, skimmers cleared.',
          entity_names: ['Florida Clean Pool Service'],
          effective_at: '2026-08-21T16:00:00Z',
          privacy_class: 'standard',
          confidence: 0.9,
        },
      },
      exemplar_weight: 1.4,
      active: true,
    },
    {
      id: 'seed-williams-sonoma-01',
      domain: 'williams-sonoma.com',
      sender_pattern: '%deals@williams-sonoma.com%',
      email_archetype: 'promotional_noise',
      sample_subject: 'Labor Day Cookware Sale: Save up to 50% on Le Creuset Dutch Ovens!',
      sample_snippet: 'Exclusive holiday savings! Save up to 50% on French enameled cast iron, stainless steel cookware, and cutlery. Free shipping on orders over $99.',
      extracted_output: {
        intent: 'skip',
        skip_reason: 'Promotional marketing sale without actionable household deadlines or scheduled appointments',
        actions: [],
        family_evidence: { relevant: false },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-morning-brew-01',
      domain: 'morningbrew.com',
      sender_pattern: '%newsletter@morningbrew.com%',
      email_archetype: 'promotional_noise',
      sample_subject: 'The Daily Brew: Tech stocks rally and markets digest rate cut signals',
      sample_snippet: 'Good morning! Markets reached fresh record highs as investors evaluated central bank commentary. Plus, retail trends this week.',
      extracted_output: {
        intent: 'skip',
        skip_reason: 'General news digest and financial commentary',
        actions: [],
        family_evidence: { relevant: false },
      },
      exemplar_weight: 1.4,
      active: true,
    },
  ]
}

/**
 * Fetches all active exemplars from Supabase with memory caching
 */
export async function fetchExemplars(sb) {
  const now = Date.now()
  if (cachedExemplars && now < cacheExpiresAt) {
    return cachedExemplars
  }

  if (sb && typeof sb.from === 'function') {
    try {
      const { data, error } = await sb
        .from('household_few_shot_exemplars')
        .select('*')
        .eq('active', true)
        .order('exemplar_weight', { ascending: false })

      if (!error && Array.isArray(data) && data.length > 0) {
        cachedExemplars = data
        cacheExpiresAt = now + CACHE_TTL_MS
        return data
      }
    } catch {
      // Fall through to default fallback
    }
  }

  const defaults = getDefaultGoldenExemplars()
  cachedExemplars = defaults
  cacheExpiresAt = now + CACHE_TTL_MS
  return defaults
}

/**
 * Main runtime entry point: retrieves and ranks top few-shot exemplars for prompt injection
 */
export async function retrieveFewShotExemplars(sb, query = {}, options = {}) {
  const pool = await fetchExemplars(sb)
  return scoreAndRankExemplars(pool, query, options)
}

/**
 * Clears the in-memory cache (for testing)
 */
export function clearExemplarCache() {
  cachedExemplars = null
  cacheExpiresAt = 0
}
