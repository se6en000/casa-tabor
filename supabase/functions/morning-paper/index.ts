import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { TALK_PLAN_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { cleanBriefFacts, cleanFacts, paperPrompt, parsePaperWords, searchPrompt, skyFacts } from '../_shared/morning-paper.mjs'

// The morning paper (canvas 48a; Jake, Oct 6): the wall sends the day's facts (src/wall/paper.ts) and gets back the
// headline, the line under it and the sky — written once a day, kept in morning_papers, so every wall and every
// look that morning shares the one paper. Canvas 58, the morning brief: the wall sends the week, Coming up and what's
// gone quiet too; a web search finds the day's surprise (a date night, an outing nearby); the writer adds today,
// the weekend, next month, way out, one forgotten thing, the surprise and a joke (two calls, a few cents a day).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
}
const providerFetch = createTrackedProviderFetch({ functionName: 'morning-paper', capability: 'briefing', trafficClass: 'background' })

const json = (body: unknown, status: number, correlationId: string) =>
  new Response(JSON.stringify(body), { status, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) })

/** Today in the house's time zone, and its neighbours (a paper is for today; a wall a little off still gets one). */
function nearToday(date: string): boolean {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = new Date(`${date}T12:00:00`)
  return Math.abs(day.getTime() - today.getTime()) < 1.6 * 86_400_000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const correlationId = getCorrelationId(req, 'morning-paper')
  try {
    const body = await req.json().catch(() => ({}))
    const facts = cleanFacts(body?.facts)
    const more = cleanBriefFacts(body?.more)
    if (!facts || !nearToday(facts.date)) return json({ error: 'A paper is for today.' }, 400, correlationId)
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    // A dry run (testing) writes a paper and keeps nothing.
    const dryRun = body?.dryRun === true

    const { data: kept } = dryRun ? { data: null } : await sb.from('morning_papers').select('headline, deck, sky, brief').eq('paper_date', facts.date).maybeSingle()
    if (kept) return json({ words: kept, kept: true }, 200, correlationId)

    // The sky, from the home's cached geocode (home-weather keeps it): free, no key.
    const { data: home } = await sb.from('settings').select('value').eq('key', 'home_config').maybeSingle()
    const geo = home?.value?.geocode_cache
    let sky: string | null = null
    if (typeof geo?.lat === 'number' && typeof geo?.lng === 'number') {
      const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}&hourly=temperature_2m,precipitation_probability&temperature_unit=fahrenheit&timezone=America%2FNew_York&start_date=${facts.date}&end_date=${facts.date}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      sky = skyFacts(wx?.hourly)
    }

    const { data: llm } = await sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle()
    const config = resolveBackgroundLlmConfig(llm?.value) as { provider: string; model: string; api_key?: string }
    if (config.provider !== 'gemini' || !config.api_key) return json({ words: null, error: 'No model for the paper.' }, 200, correlationId)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`

    // The day's surprise, looked up fresh (real places and events only): skipped quietly if search fails.
    let found: string | null = null
    let searchError: string | null = null
    if (more) {
      const area = [home?.value?.city, home?.value?.state].filter(Boolean).join(', ') || 'the family’s town'
      const search = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${config.api_key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: searchPrompt(area, facts.day, new Date(Date.parse(`${facts.date}T12:00:00Z`) + 9 * 86_400_000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 700, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }, { correlationId }).then(async (r) => (r.ok ? r.json() : (searchError = `${r.status} ${(await r.text()).slice(0, 200)}`, null))).catch((e) => ((searchError = String(e)), null))
      const notes = ((search?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>).map((p) => p.text ?? '').join('').trim()
      found = notes ? notes.slice(0, 1800) : null
    }

    // The brief is written once a day and read all morning: the stronger model, a little thinking (under a cent).
    const writer = more ? TALK_PLAN_GEMINI_MODEL : config.model
    const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${writer}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: paperPrompt(facts, sky, more, found) }] }],
        generationConfig: { maxOutputTokens: more ? 4000 : 400, temperature: 0.8, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: more ? 1024 : 0 } },
      }),
    }, { correlationId })
    const data = await res.json().catch(() => null)
    const parts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
    const words = parsePaperWords(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''))
    if (!words) return json({ words: null, error: 'The paper didn’t come out right.' }, 200, correlationId)

    if (dryRun) return json({ words, kept: false, dryRun: true, sky, found, searchError }, 200, correlationId)
    // First one wins (two walls at once): keep it, then read back whichever was kept.
    await sb.from('morning_papers').upsert({ paper_date: facts.date, headline: words.headline, deck: words.deck, sky: words.sky, brief: words.brief ?? null, facts: { ...facts, more }, sky_facts: sky, found, model: writer }, { onConflict: 'paper_date', ignoreDuplicates: true })
    const { data: saved } = await sb.from('morning_papers').select('headline, deck, sky, brief').eq('paper_date', facts.date).maybeSingle()
    return json({ words: saved ?? words, kept: false }, 200, correlationId)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, correlationId)
  }
})
