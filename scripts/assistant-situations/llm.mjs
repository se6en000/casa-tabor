import { sql } from './world.mjs'

// Gemini, with the family's own configured key (read at run time, never printed), for two
// jobs: writing new ways to say a turn, and judging a free-text answer against its gist.

let keyPromise = null
async function key() {
  keyPromise ??= sql(`select value from settings where key = 'llm_config'`).then(([row]) => {
    const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    return v.api_key
  })
  return keyPromise
}

export async function gemini(prompt, { temperature = 0, model = 'gemini-2.5-flash' } = {}) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': await key() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const body = await res.json()
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Gemini gave no JSON: ${JSON.stringify(body).slice(0, 200)}`)
  }
}

/** New ways a person might say this turn — never the example itself. */
export async function freshPhrasings(meaning, example, count = 5) {
  const out = await gemini(`A family is talking to their home assistant (a wall screen or phone), by voice or typing.
What the person means on this turn: ${meaning}
One way to say it: "${example}"
Write ${count} other ways a real person would say this same thing — casual, terse, rambling, voice-dictation style with no punctuation, different word order, different vocabulary. Keep every fact (names, places, days, times) the same; keep any {placeholder} exactly as written. Don't repeat the example.
Return a JSON array of strings.`, { temperature: 1 })
  return Array.isArray(out) ? out.filter((s) => typeof s === 'string' && s.trim()) : []
}

/** Did this answer do what the turn needed? Graded on meaning, not wording. */
export async function judge({ conversation, reply, gist, facts }) {
  const out = await gemini(`You are grading a family home assistant. Grade on meaning, not wording; be strict about facts.
Conversation so far:
${conversation.map((m) => `${m.role === 'user' ? 'PERSON' : 'ASSISTANT'}: ${m.content}`).join('\n')}
ASSISTANT'S REPLY TO GRADE: ${reply}
Facts from the family's real calendar: ${JSON.stringify(facts)}
A right reply: ${gist}
Return JSON {"pass": boolean, "why": "one short sentence"}.`)
  return { pass: out?.pass === true, why: String(out?.why ?? '') }
}
