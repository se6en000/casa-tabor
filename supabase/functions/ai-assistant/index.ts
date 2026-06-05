import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImagePayload { mimeType: string; data: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

  const { messages, context, image, session_id } = await req.json()

  // Load config, saved places, contacts, grocery list, events in parallel
  const yearStart = new Date(); yearStart.setMonth(0, 1); yearStart.setHours(0,0,0,0)
  const yearEnd = new Date(); yearEnd.setFullYear(yearEnd.getFullYear() + 1, 11, 31); yearEnd.setHours(23,59,59,999)

  const [
    { data: cfgRow },
    { data: savedPlaces },
    savedContactsResult,
    { data: allEvents },
    { data: groceryLists },
    { data: groceryItems },
  ] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('saved_places').select('name, aliases, address, city, state, zip, category, notes, phone').order('name'),
    sb.from('saved_contacts').select('name, aliases, phone, email, address, relationship, notes').order('name').then(r => r).catch(() => ({ data: null, error: null })),
    sb.from('events')
      .select('id, title, start_time, end_time, location_name, all_day, event_type, notes, event_members(family_members(id, name)), enrichments(category, drive_time_minutes, drive_time_text, weather_temp, weather_condition)')
      .eq('status', 'confirmed')
      .gte('start_time', yearStart.toISOString())
      .lte('start_time', yearEnd.toISOString())
      .order('start_time'),
    sb.from('grocery_lists').select('id, name').order('created_at').limit(5),
    sb.from('grocery_items').select('id, list_id, name, quantity, unit, category, checked, notes').eq('checked', false).order('category').order('name'),
  ])

  const savedContacts = (savedContactsResult as { data: unknown }).data

  const config = cfgRow?.value ?? { provider: 'gemini', model: 'gemini-1.5-flash', api_key: '' }
  const apiKey = config.api_key as string
  const model = (config.model as string) || 'gemini-1.5-flash'

  if (!apiKey) {
    return new Response(JSON.stringify({ type: 'error', code: 'no_api_key', message: 'No AI API key configured. Go to Settings → AI to add one.' }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' }
    })
  }

  // Build context strings
  const familyNames = (context.family as {name: string}[]).map(f => f.name).join(', ')

  type DbEvent = {
    id: string; title: string; start_time: string; end_time: string;
    location_name: string | null; all_day: boolean; event_type: string; notes: string | null;
    event_members: { family_members: { id: string; name: string } | null }[];
    enrichments: { category: string | null; drive_time_minutes: number | null; drive_time_text: string | null; weather_temp: number | null; weather_condition: string | null }[];
  }

  const eventsText = !allEvents || allEvents.length === 0
    ? 'No upcoming events.'
    : (allEvents as DbEvent[]).map(e => {
        const members = e.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ') ?? ''
        const category = e.enrichments?.[0]?.category ?? ''
        const driveTime = e.enrichments?.[0]?.drive_time_text ?? ''
        return `- ID:${e.id} | "${e.title}" | ${e.start_time} – ${e.end_time}${e.all_day ? ' (all-day)' : ''}${e.location_name ? ` | 📍${e.location_name}` : ''}${members ? ` | 👤${members}` : ''}${category ? ` | ${category}` : ''}${driveTime ? ` | 🚗${driveTime}` : ''}`
      }).join('\n')

  const placesText = savedPlaces && savedPlaces.length > 0
    ? savedPlaces.map((p: {name: string; aliases?: string[]; address?: string; city?: string; state?: string; zip?: string; phone?: string; notes?: string}) => {
        const addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')
        const aliases = p.aliases?.length ? ` (also: ${p.aliases.join(', ')})` : ''
        return `- ${p.name}${aliases}: ${addr}${p.phone ? ` | ${p.phone}` : ''}`
      }).join('\n')
    : ''

  const contactsText = savedContacts && (savedContacts as unknown[]).length > 0
    ? (savedContacts as {name: string; aliases?: string[]; phone?: string; email?: string; address?: string; relationship?: string; notes?: string}[]).map(c => {
        const aliases = c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''
        const extra = [c.relationship, c.phone, c.email, c.address, c.notes].filter(Boolean).join(' | ')
        return `- ${c.name}${aliases}${extra ? ': ' + extra : ''}`
      }).join('\n')
    : ''

  const defaultListId = groceryLists?.[0]?.id ?? null
  const groceryText = groceryItems && groceryItems.length > 0
    ? groceryItems.map((i: {id: string; name: string; quantity?: string; unit?: string; category: string; checked: boolean}) =>
        `- ID:${i.id} | ${i.name}${i.quantity ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''} [${i.category}]`
      ).join('\n')
    : 'Grocery list is empty.'

  // Tool definitions for Gemini
  const tools = [{
    function_declarations: [
      {
        name: 'search_events',
        description: 'Search for events by title keyword, date, or family member name. Returns matching events. Use this when you need to find a specific event before updating it.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search keyword for event title (partial match ok)' },
            date_hint: { type: 'STRING', description: 'Natural date hint like "Tuesday", "June 9", "next week"' },
            member_name: { type: 'STRING', description: 'Filter by family member name' },
          },
          required: [],
        },
      },
      {
        name: 'create_event',
        description: 'Create a new calendar event or reminder. Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Event title in format "Owner | Description"' },
            start: { type: 'STRING', description: 'ISO datetime with UTC offset e.g. 2026-06-09T18:30:00-04:00' },
            end: { type: 'STRING', description: 'ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'Full street address or place name' },
            members: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to include' },
            notes: { type: 'STRING', description: 'Optional notes or description' },
            all_day: { type: 'BOOLEAN', description: 'True for all-day events' },
            event_type: { type: 'STRING', description: '"event" or "reminder"' },
          },
          required: ['title', 'start', 'end'],
        },
      },
      {
        name: 'update_event',
        description: 'Update one or more fields of an existing event. Requires the event ID (from search_events or the events list). Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'Exact event UUID from the events list' },
            title: { type: 'STRING', description: 'New title' },
            start: { type: 'STRING', description: 'New start ISO datetime with UTC offset' },
            end: { type: 'STRING', description: 'New end ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'New full address or place name' },
            members_add: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to ADD to the event' },
            members_remove: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to REMOVE from the event' },
            notes: { type: 'STRING', description: 'New notes or description' },
            all_day: { type: 'BOOLEAN', description: 'Toggle all-day status' },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_event',
        description: 'Delete (cancel) a calendar event. Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'Exact event UUID' },
            title: { type: 'STRING', description: 'Event title for confirmation display' },
          },
          required: ['id', 'title'],
        },
      },
      {
        name: 'search_places',
        description: 'Search Google Places for a business or address. Use when user gives a business name or partial address.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Business name or location query' },
            city: { type: 'STRING', description: 'City to search in' },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_grocery_items',
        description: 'Add one or more items to the grocery list.',
        parameters: {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  quantity: { type: 'STRING' },
                  unit: { type: 'STRING' },
                  category: { type: 'STRING', description: 'One of: produce, dairy, meat, pantry, frozen, bakery, beverages, other' },
                  notes: { type: 'STRING' },
                },
                required: ['name'],
              },
              description: 'Items to add',
            },
          },
          required: ['items'],
        },
      },
      {
        name: 'check_grocery_item',
        description: 'Mark a grocery item as checked/done or uncheck it.',
        parameters: {
          type: 'OBJECT',
          properties: {
            item_id: { type: 'STRING', description: 'Item UUID' },
            checked: { type: 'BOOLEAN', description: 'True to check off, false to uncheck' },
          },
          required: ['item_id', 'checked'],
        },
      },
      {
        name: 'clear_checked_grocery_items',
        description: 'Remove all checked/completed items from the grocery list.',
        parameters: { type: 'OBJECT', properties: {} },
      },
    ],
  }]

  // Build Gemini conversation with system instruction + history
  const systemInstruction = `You are the Casa Tabor family assistant — a smart, warm, conversational AI for the ${familyNames} family.
Current date/time: ${context.currentDate}
User's local UTC offset: ${context.utcOffset ?? '-04:00'} (use this for all times you generate)
Home city: ${context.homeCity ?? 'West Palm Beach'}

FAMILY MEMBERS: ${familyNames}
${placesText ? `\nSAVED PLACES (use for location nicknames):\n${placesText}` : ''}
${contactsText ? `\nSAVED CONTACTS:\n${contactsText}` : ''}

ALL UPCOMING EVENTS (full year, use exact IDs):
${eventsText}

GROCERY LIST (unchecked items):
${groceryText}
${defaultListId ? `Default list ID: ${defaultListId}` : ''}

INSTRUCTIONS:
- You have access to tools. For calendar operations, ALWAYS use the appropriate tool — never describe what you would do, actually call the tool.
- For write operations (create/update/delete event, add grocery items): call the tool. The system will ask the user to confirm before executing.
- For read operations (search_events, search_places): call the tool and I will execute it and give you the results so you can answer.
- When searching for an event the user mentions: use search_events first if you're not sure of the exact ID. Always use the exact UUID from the events list when updating.
- Fuzzy matching: if the user says "softball practice Tuesday" and you see "Softball Practice" on Tuesday, that's the same event. Be smart about partial names, nicknames, and relative dates.
- Working context: if we've been discussing a specific event in this conversation, continue operating on that same event unless the user clearly changes topic.
- For relative times like "push it an hour later", calculate the new time from the event's current start_time.
- For "add my wife" or "add Kelly", look up the family member ID from the FAMILY MEMBERS list.
- Be warm and concise (1-3 sentences) when answering questions. Be proactive — mention conflicts, suggest drive-time buffers, note if a day is busy.
- Never say "I can't do that" — use the tools.`

  // Convert message history to Gemini format
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } }
  type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

  const history: GeminiContent[] = []
  const msgList = messages as { role: 'user' | 'assistant'; content: string }[]

  for (const m of msgList) {
    if (m.role === 'user') {
      history.push({ role: 'user', parts: [{ text: m.content }] })
    } else {
      history.push({ role: 'model', parts: [{ text: m.content }] })
    }
  }

  // Add current user message with optional image
  const lastMsg = history[history.length - 1]
  if (lastMsg?.role === 'user' && image) {
    lastMsg.parts.unshift({ inlineData: { mimeType: (image as ImagePayload).mimeType, data: (image as ImagePayload).data } })
  }

  // Helper: execute read-only tools server-side
  async function executeReadTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === 'search_events') {
      const query = ((args.query as string) ?? '').toLowerCase()
      const dateHint = ((args.date_hint as string) ?? '').toLowerCase()
      const memberName = ((args.member_name as string) ?? '').toLowerCase()

      let results = allEvents as DbEvent[] ?? []

      if (query) {
        results = results.filter(e => e.title.toLowerCase().includes(query))
      }
      if (memberName) {
        results = results.filter(e =>
          e.event_members?.some(m => m.family_members?.name.toLowerCase().includes(memberName))
        )
      }
      if (dateHint) {
        results = results.filter(e => {
          const d = new Date(e.start_time)
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
          const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase()
          return dayName.includes(dateHint) || dateStr.includes(dateHint) || e.start_time.includes(dateHint.replace(/[^0-9-]/g, ''))
        })
      }

      if (results.length === 0) return { found: false, message: 'No matching events found.' }

      return {
        found: true,
        count: results.length,
        events: results.slice(0, 10).map(e => ({
          id: e.id,
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          location: e.location_name,
          members: e.event_members?.map(m => m.family_members?.name).filter(Boolean),
          all_day: e.all_day,
          notes: e.notes,
        })),
      }
    }

    if (name === 'search_places') {
      const query = args.query as string
      const city = (args.city as string) || (context.homeCity as string) || 'West Palm Beach'
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location',
          },
          body: JSON.stringify({ textQuery: `${query} near ${city}`, maxResultCount: 3 }),
        })
        const data = await res.json()
        const places = (data.places ?? []).map((p: { displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string }) => ({
          name: p.displayName?.text,
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber,
        }))
        return { places, count: places.length }
      } catch { return { places: [], count: 0 } }
    }

    return { error: 'Unknown tool' }
  }

  // Call Gemini with function calling — up to 2 rounds (tool call → result → final answer)
  async function callGeminiWithTools(contents: GeminiContent[]): Promise<{ type: string; [key: string]: unknown }> {
    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools,
      generation_config: { temperature: 0.4, max_output_tokens: 1024 },
      tool_config: { function_calling_config: { mode: 'AUTO' } },
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    )

    if (!res.ok) {
      const errText = await res.text()
      const isQuota = res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
      return { type: 'error', code: isQuota ? 'quota_exceeded' : 'llm_error', message: errText.slice(0, 200) }
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) return { type: 'error', code: 'llm_error', message: 'No response from AI' }

    const parts = candidate.content?.parts ?? []
    const funcCallPart = parts.find((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
    const textPart = parts.find((p: { text?: string }) => p.text)

    if (!funcCallPart && textPart) {
      return { type: 'text', text: (textPart as { text: string }).text }
    }

    if (funcCallPart) {
      const { name, args } = (funcCallPart as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall

      // Read-only tools: execute server-side, feed result back for final answer
      if (name === 'search_events' || name === 'search_places') {
        const toolResult = await executeReadTool(name, args)

        // Feed result back to Gemini for final answer
        const newContents: GeminiContent[] = [
          ...contents,
          { role: 'model', parts: [funcCallPart as GeminiPart] },
          { role: 'user', parts: [{ functionResponse: { name, response: toolResult } } as GeminiPart] },
        ]

        // Second call for final answer
        const res2 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, contents: newContents }) }
        )
        if (!res2.ok) return { type: 'error', code: 'llm_error', message: 'Second LLM call failed' }
        const data2 = await res2.json()
        const finalText = data2.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? ''
        return { type: 'text', text: finalText }
      }

      // Write tools: return to frontend for confirmation
      return {
        type: 'tool_action',
        tool: name,
        args,
        display_text: buildDisplayText(name, args),
      }
    }

    return { type: 'text', text: textPart ? (textPart as { text: string }).text : 'Sorry, I did not understand that.' }
  }

  function buildDisplayText(name: string, args: Record<string, unknown>): string {
    if (name === 'create_event') return `Create: **${args.title}** on ${args.start}`
    if (name === 'update_event') {
      const changes: string[] = []
      if (args.title) changes.push(`title → "${args.title}"`)
      if (args.start) changes.push(`start → ${args.start}`)
      if (args.end) changes.push(`end → ${args.end}`)
      if (args.location) changes.push(`location → "${args.location}"`)
      if (args.notes) changes.push(`notes → "${args.notes}"`)
      if ((args.members_add as string[])?.length) changes.push(`add: ${(args.members_add as string[]).join(', ')}`)
      if ((args.members_remove as string[])?.length) changes.push(`remove: ${(args.members_remove as string[]).join(', ')}`)
      if (args.all_day !== undefined) changes.push(`all-day → ${args.all_day}`)
      return `Update event: ${changes.join(' · ')}`
    }
    if (name === 'delete_event') return `Delete: **${args.title}**`
    if (name === 'add_grocery_items') {
      const items = args.items as { name: string; quantity?: string }[]
      return `Add to grocery list: ${items.map(i => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ')}`
    }
    if (name === 'check_grocery_item') return `Mark grocery item as ${args.checked ? 'done' : 'undone'}`
    if (name === 'clear_checked_grocery_items') return 'Clear all checked grocery items'
    return `Action: ${name}`
  }

  const logUsage = () => {
    sb.from('ai_usage_log').insert({
      function_name: 'ai-assistant',
      provider: config.provider,
      model: config.model,
      input_tokens: 0,
      output_tokens: 0,
      cached: false,
    }).then(() => {}).catch(() => {})
  }

  try {
    const result = await callGeminiWithTools(history)
    logUsage()
    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message ?? 'Unknown error'
    return new Response(
      JSON.stringify({ type: 'error', code: 'llm_error', message: msg }),
      { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
