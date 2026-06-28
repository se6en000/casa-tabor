import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  AMBIGUITY_GUARDRAILS,
  DIFF_AND_OUTPUT_GUARDRAILS,
  EDIT_INTENT_GUARDRAILS,
  RECOVERY_AND_CONFLICT_GUARDRAILS,
} from '../_shared/ai-prompt-guardrails.mjs'
import { optionalEnv, requireEnv } from '../_shared/env.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImagePayload { mimeType: string; data: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const mapsKey = optionalEnv('GOOGLE_MAPS_API_KEY', '')
  const braveKey = optionalEnv('BRAVE_API_KEY', '')

  const { messages, context, image, correlation_id: correlationId } = await req.json()
  const cid = correlationId ?? `${context?.page ?? 'unknown'}:${Date.now().toString(36)}`
  const requestStartMs = Date.now()
  const STAGE_SLO = {
    contextLoadMs: 1200,
    llmPrimaryMs: 4500,
    requestTotalMs: 7000,
  } as const
  const warnIfSlow = (stage: string, elapsedMs: number, budgetMs: number) => {
    if (elapsedMs > budgetMs) {
      console.warn(`[ai-assistant][${cid}] slo_breach stage=${stage} elapsed=${elapsedMs} budget=${budgetMs}`)
    }
  }
  console.log(`[ai-assistant][${cid}] request messages=${Array.isArray(messages) ? messages.length : 0}`)

  // Load config, saved places, contacts, grocery list, events in parallel
  const now = new Date()
  // Start from 24h ago so in-progress events (started earlier today) are visible
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yearEnd = new Date(); yearEnd.setFullYear(yearEnd.getFullYear() + 1, 11, 31); yearEnd.setHours(23,59,59,999)

  const contextLoadStartMs = Date.now()
  const [
    { data: cfgRow },
    { data: savedPlaces },
    savedContactsResult,
    eventsResult,
    { data: groceryLists },
    { data: groceryItems },
  ] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').limit(1),
    sb.from('saved_places').select('name, aliases, address, city, state, zip, category, notes, phone').order('name'),
    sb.from('saved_contacts').select('name, aliases, phone, email, address, relationship, notes').order('name').then(r => r).catch(() => ({ data: null, error: null })),
    sb.from('events')
      .select('id, title, start_time, end_time, updated_at, location_name, address, all_day, event_type, description, event_enrichments(prep_notes, category, what_to_bring, outfit_suggestion, parking_notes, contact_name, contact_phone, cost_estimate, dietary_notes, meal_impact), event_checklist_items(id, label, note, checked, category, sort_order, created_at), event_action_items(id, title, description, due_date, is_urgent, completed, assigned_to, created_at), event_members(family_members(id, name))')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', yearEnd.toISOString())
      .order('start_time'),
    sb.from('grocery_lists').select('id, name').order('created_at').limit(5),
    sb.from('grocery_items')
      .select('id, list_id, name, quantity, unit, category, checked, notes')
      .eq('checked', false)
      .is('deleted_at', null)
      .order('category')
      .order('name'),
  ])

  if (eventsResult.error) {
    console.error('[ai-assistant] events query error:', JSON.stringify(eventsResult.error))
    return new Response(JSON.stringify({ type: 'debug', error: eventsResult.error, yearStart: windowStart.toISOString(), yearEnd: yearEnd.toISOString(), correlation_id: cid }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' }
    })
  }
  const allEvents = eventsResult.data
  console.log('[ai-assistant] events loaded:', allEvents?.length ?? 0)
  const contextLoadMs = Date.now() - contextLoadStartMs
  console.log(`[ai-assistant][${cid}] stage=context_load ms=${contextLoadMs}`)
  warnIfSlow('context_load', contextLoadMs, STAGE_SLO.contextLoadMs)

  const savedContacts = (savedContactsResult as { data: unknown }).data

  const config = cfgRow?.[0]?.value ?? { provider: 'gemini', model: 'gemini-1.5-flash', api_key: '' }
  const apiKey = config.api_key as string
  const model = (config.model as string) || 'gemini-1.5-flash'

  if (!apiKey) {
    return new Response(JSON.stringify({ type: 'error', code: 'no_api_key', message: 'No AI API key configured. Go to Settings → AI to add one.', correlation_id: cid }), {
      status: 200, headers: { ...CORS, 'content-type': 'application/json' }
    })
  }

  const utcOffset = (context.utcOffset as string) ?? '-04:00'

  // Convert a UTC ISO string to a human-readable local time string using the user's offset
  function toLocal(iso: string): string {
    if (!iso) return ''
    const offsetMatch = utcOffset.match(/([+-])(\d{2}):(\d{2})/)
    if (!offsetMatch) return iso
    const sign = offsetMatch[1] === '+' ? 1 : -1
    const offsetMs = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60000
    const local = new Date(new Date(iso).getTime() + offsetMs)
    return local.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
    })
  }

  function normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b(appt|apt)\b/g, 'appointment')
      .replace(/\bdr\b/g, 'doctor')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function tokenized(value: string): string[] {
    return normalizeSearchText(value).split(' ').filter((token) => token.length > 1)
  }

  // Build context strings
  const familyNames = (context.family as {name: string}[]).map(f => f.name).join(', ')

  type DbEvent = {
    id: string; title: string; start_time: string; end_time: string; updated_at: string;
    location_name: string | null; address: string | null; all_day: boolean; event_type: string; description: string | null;
    event_enrichments?: {
      prep_notes?: string | null;
      category?: string | null;
      what_to_bring?: string[] | null;
      outfit_suggestion?: string | null;
      parking_notes?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      cost_estimate?: string | null;
      dietary_notes?: string | null;
      meal_impact?: string | null;
    }[] | null;
    event_checklist_items?: {
      id: string;
      label: string;
      note?: string | null;
      checked?: boolean | null;
      category?: string | null;
      sort_order?: number | null;
      created_at?: string | null;
    }[] | null;
    event_action_items?: {
      id: string;
      title: string;
      description?: string | null;
      due_date?: string | null;
      is_urgent?: boolean | null;
      completed?: boolean | null;
      assigned_to?: string | null;
      created_at?: string | null;
    }[] | null;
    event_members: { family_members: { id: string; name: string } | null }[];
  }

  const eventsText = !allEvents || allEvents.length === 0
    ? 'No upcoming events.'
    : (allEvents as DbEvent[]).map(e => {
        const members = e.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ') ?? ''
        const loc = e.address ?? e.location_name ?? ''
        const timeStr = e.all_day ? 'all-day' : `${toLocal(e.start_time)} – ${toLocal(e.end_time)}`
        return `- ID:${e.id} | updated_at:${e.updated_at} | "${e.title}" | ${timeStr}${loc ? ` | 📍${loc}` : ''}${members ? ` | 👤${members}` : ''}`
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
        description: 'Create a new calendar event or reminder. Low-risk creates may execute immediately; otherwise require confirmation.',
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
            expected_updated_at: { type: 'STRING', description: 'Current event updated_at timestamp from context. Required for safe edit/undo protection.' },
            title: { type: 'STRING', description: 'New title' },
            start: { type: 'STRING', description: 'New start ISO datetime with UTC offset' },
            end: { type: 'STRING', description: 'New end ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'New location name or venue label. Use empty string to clear.' },
            address: { type: 'STRING', description: 'New street address. Use empty string to clear.' },
            members_add: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to ADD to the event' },
            members_remove: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to REMOVE from the event' },
            notes: { type: 'STRING', description: 'Visible Notes field in the event details panel (prep_notes). Use empty string to clear.' },
            description: { type: 'STRING', description: 'Underlying calendar description/body text. Use empty string to clear.' },
            all_day: { type: 'BOOLEAN', description: 'Toggle all-day status' },
            category: { type: 'STRING', description: 'Category like appointment, school, sports, dining, travel, social, other. Use empty string to clear.' },
            what_to_bring: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Full replacement list for What to Bring. Send the complete final list.' },
            outfit_suggestion: { type: 'STRING', description: 'What to Wear field. Use empty string to clear.' },
            parking_notes: { type: 'STRING', description: 'Parking field. Use empty string to clear.' },
            contact_name: { type: 'STRING', description: 'Contact name. Use empty string to clear.' },
            contact_phone: { type: 'STRING', description: 'Contact phone number. Use empty string to clear.' },
            cost_estimate: { type: 'STRING', description: 'Cost Estimate field. Use empty string to clear.' },
            dietary_notes: { type: 'STRING', description: 'Dietary Notes field. Use empty string to clear.' },
            meal_impact: { type: 'STRING', description: 'Meal Impact field. Use empty string to clear.' },
            checklist_items: {
              type: 'ARRAY',
              description: 'Full replacement checklist for the event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing checklist item ID when editing an existing item' },
                  label: { type: 'STRING', description: 'Checklist item text' },
                  note: { type: 'STRING', description: 'Optional secondary note. Use empty string to clear.' },
                  checked: { type: 'BOOLEAN', description: 'Whether the item is already checked off' },
                  category: { type: 'STRING', description: 'Optional grouping/category label. Use empty string to clear.' },
                },
                required: ['label'],
              },
            },
            action_items: {
              type: 'ARRAY',
              description: 'Full replacement action-item list for the event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing action item ID when editing an existing item' },
                  title: { type: 'STRING', description: 'Action item title' },
                  description: { type: 'STRING', description: 'Optional longer description. Use empty string to clear.' },
                  due_date: { type: 'STRING', description: 'Optional ISO datetime with UTC offset. Use empty string to clear.' },
                  is_urgent: { type: 'BOOLEAN', description: 'True if this should appear as the urgent banner' },
                  completed: { type: 'BOOLEAN', description: 'Whether the action is already completed' },
                  assigned_to: { type: 'STRING', description: 'Optional assignee name. Use empty string to clear.' },
                },
                required: ['title'],
              },
            },
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
        name: 'search_web',
        description: 'Search the live web for current information, reviews, news, prices, and factual lookups that need fresh sources.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search query' },
            max_results: { type: 'NUMBER', description: 'Number of results to return (1-8). Default 5.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_grocery_items',
        description: 'Add one or more items to the grocery list immediately (no confirmation step). Infer category and normalize likely product names/brands when needed.',
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
  // Pull user-editable custom instructions (persist across all chats)
  const customRow = await sb.from('settings').select('value').eq('key', 'ai_custom_instructions').maybeSingle()
  const customInstructions = (customRow.data?.value as { text?: string } | null)?.text?.trim() || ''

  const systemInstruction = `You are the Casa Tabor family assistant — a smart, warm, conversational AI for the ${familyNames} family.
Current date/time: ${context.currentDate}
User's local UTC offset: ${context.utcOffset ?? '-04:00'} (use this for all times you generate)
Home city: ${context.homeCity ?? 'West Palm Beach'}

FAMILY MEMBERS: ${familyNames}
${placesText ? `\nSAVED PLACES (use for location nicknames):\n${placesText}` : ''}
${contactsText ? `\nSAVED CONTACTS:\n${contactsText}` : ''}
${context.focusedEvent ? `
⭐ EVENT EDIT MODE — CRITICAL INSTRUCTIONS:
You are EXCLUSIVELY focused on editing this one event. Do not answer general questions, discuss other events, or go off-topic. Every response must stay in the context of editing this event.

CURRENT EVENT DATA:
ID: ${(context.focusedEvent as {id:string}).id}
Title: ${(context.focusedEvent as {title:string}).title}
Time: ${(context.focusedEvent as {start_time:string}).start_time} → ${(context.focusedEvent as {end_time:string}).end_time}${(context.focusedEvent as {all_day:boolean}).all_day ? ' (all-day)' : ''}
Updated at: ${(context.focusedEvent as {updated_at:string}).updated_at}
Location name: ${(context.focusedEvent as {location_name:string|null}).location_name ?? '⚠️ MISSING'}
Address: ${(context.focusedEvent as {address:string|null}).address ?? '⚠️ MISSING'}
Members: ${((context.focusedEvent as {members:string[]}).members ?? []).join(', ') || '⚠️ MISSING'}
Category: ${(context.focusedEvent as {category:string|null}).category ?? '⚠️ MISSING'}
Notes/Prep: ${(context.focusedEvent as {notes:string|null}).notes ?? '⚠️ MISSING'}
Description: ${(context.focusedEvent as {description:string|null}).description ?? '⚠️ MISSING'}
What to bring: ${((context.focusedEvent as {what_to_bring?: string[]}).what_to_bring ?? []).join(', ') || '⚠️ MISSING'}
What to wear: ${(context.focusedEvent as {outfit_suggestion:string|null}).outfit_suggestion ?? '⚠️ MISSING'}
Parking: ${(context.focusedEvent as {parking_notes:string|null}).parking_notes ?? '⚠️ MISSING'}
Contact name: ${(context.focusedEvent as {contact_name:string|null}).contact_name ?? '⚠️ MISSING'}
Contact phone: ${(context.focusedEvent as {contact_phone:string|null}).contact_phone ?? '⚠️ MISSING'}
Cost estimate: ${(context.focusedEvent as {cost_estimate:string|null}).cost_estimate ?? '⚠️ MISSING'}
Dietary notes: ${(context.focusedEvent as {dietary_notes:string|null}).dietary_notes ?? '⚠️ MISSING'}
Meal impact: ${(context.focusedEvent as {meal_impact:string|null}).meal_impact ?? '⚠️ MISSING'}
Checklist items: ${JSON.stringify((context.focusedEvent as {checklist?: unknown[]}).checklist ?? [])}
Action items: ${JSON.stringify((context.focusedEvent as {actions?: unknown[]}).actions ?? [])}

RULES:
- Always use update_event with ID: ${(context.focusedEvent as {id:string}).id} for any changes. You already have the event — never search for it.
- Always include expected_updated_at: ${(context.focusedEvent as {updated_at:string}).updated_at} in every update_event call for this event.
- Use notes for the visible Notes section, and description for the underlying calendar body text.
- Use empty string to clear a text field.
- Never invent or send fields outside the update_event schema.
- For what_to_bring, send the complete final list, not just the newly added item.
- For checklist_items and action_items, send the complete final list, not just the delta. Preserve existing item IDs when keeping/editing an item so state stays stable.
- Batch related edits into one update_event call whenever possible so the user confirms once.
- Hard limits: what_to_bring max 25 items, checklist_items max 30, action_items max 30, members_add/members_remove max 10 names per action. If the user wants more, ask to split it up.
- After the user confirms a change, apply it immediately with update_event; confirm what you changed in one sentence.
- If the user changes the location, mention that driving logistics and weather will refresh automatically.
- If the user tries to discuss something unrelated to this event, politely redirect them back to editing it.
${EDIT_INTENT_GUARDRAILS}
${DIFF_AND_OUTPUT_GUARDRAILS}
${RECOVERY_AND_CONFLICT_GUARDRAILS}
 
ON OPEN (the [EVENT_EDIT_MODE] signal): Give a concise friendly summary of the event so the user knows you're primed — include title, date/time, who's attending, and location if set. Then highlight any ⚠️ MISSING fields as things worth filling in, and ask what they'd like to change or add first.` : ''}

ALL UPCOMING EVENTS (full year, use exact IDs):
${eventsText}

GROCERY LIST (unchecked items):
${groceryText}
${defaultListId ? `Default list ID: ${defaultListId}` : ''}

INSTRUCTIONS:
- You are allowed to answer general/random questions directly (facts, explanations, ideas, writing help, etc.) when no Casa data/action is needed.
- Use tools for calendar/grocery/place actions. Reads (search) execute immediately. Most writes need confirmation, but low-risk create_event and add_grocery_items should execute immediately.
- Always operate on UUIDs from the events list. Use search_events when unsure, then update with the exact ID.
- For update_event, always copy the event's updated_at value from context/events list into expected_updated_at.
- Batch related field updates into a single update_event action instead of many small ones.
- When editing an event found via search_events, preserve unchanged detail-pane data from that event response (notes, category, bring list, checklist_items, action_items, etc.).
- what_to_bring is a full replacement field. When adding/removing one item, preserve existing items from the selected event and send the complete final list.
- Always apply append/replace/clear/transform intent classification before building update_event args.
- Prefer append semantics for "add/include/also/plus" phrasing unless user explicitly asks to replace.
- For each write proposal, include "Will change", "Will preserve", and "Needs confirmation".
- For add_grocery_items, do NOT ask for confirmation. Just add items immediately. If you inferred/corrected an item name or category, mention it briefly after adding.
- Treat shopping, groceries, pantry restocks, and food purchase intents as add_grocery_items by default. Unless user explicitly asks a question instead of an action, auto-add immediately.
- Confirmation budget: never ask for more than one explicit confirmation for the same write. If user already confirmed once in this turn/thread, proceed.
- For low-risk write intents (add_grocery_items and straightforward create_event), execute immediately and offer undo language instead of asking for confirmation.
- Never claim "done/completed/updated/saved" for write actions unless the tool execution result confirms success; for calendar writes, only use completion wording when sync_status is synced.
- If user already stated a time, do not ask for time again unless there is a true ambiguity conflict.
- Default time window: when no date is given, search from NOW (${context.currentDate}) forward — never return past events.
- "Next event" / "what's next" = first event whose start_time is strictly AFTER NOW. If an event is currently in progress (started before NOW, ends after NOW), mention it as "currently happening" first, then state what starts next.
- Default duration: 1 hour if not specified for normal appointments. For trip/vacation/travel intents or explicit multi-day language ("3-day", "through Friday", "until Sunday"), default to a multi-day event instead of 1 hour and preserve the implied span.
- Ambiguous time default: when user says a bare time like "1:30" without AM/PM, assume ${context.ambiguousTimeDefaultMeridiem ?? 'PM'} unless user context clearly indicates otherwise.
- Fuzzy match titles, nicknames, partial names, relative dates. If multiple events match, ask which one.
- If an initial event search is empty, retry with a shorter/broader query before telling the user nothing was found.
- Never perform writes when search_events reports ambiguous=true or top confidence < 0.75; ask a disambiguation question first.
- Working context: keep operating on the same event we're discussing unless the user clearly switches.
- Relative shifts ("push it 1h later"): compute from the event's current start_time.
- "Add my wife"/"add Kelly": resolve from FAMILY MEMBERS.
- SAVED PLACES: when a place name matches, use its address directly — never ask for the address.
- Conflict awareness: warn if a new event overlaps an existing one by >15 min.
- Prefer edit over create: if a similar event exists at the same time, update it instead of creating a duplicate.
- Tone: warm, concise (1–3 sentences). Be proactive — flag conflicts, drive-time buffers, busy days.
- For timeless facts and general knowledge (e.g., ages/biographies/math/history), answer directly from model knowledge and simple reasoning. Do not refuse just because live web access is unavailable.
- For live/public info requests (e.g., latest reviews/news/prices), use search_web first. For local business lookups (address/phone/location), use search_places. When using search_web, cite the source links you used in your reply.${customInstructions ? `\n\nUSER'S CUSTOM RULES (always apply, override defaults if they conflict):\n${customInstructions}` : ''}
${AMBIGUITY_GUARDRAILS}
${DIFF_AND_OUTPUT_GUARDRAILS}
${RECOVERY_AND_CONFLICT_GUARDRAILS}`

  // Convert message history to Gemini format
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } }
  type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

  const history: GeminiContent[] = []
  const msgList = messages as { role: 'user' | 'assistant'; content: string }[]

  for (const m of msgList) {
    const text = (m.content ?? '').trim()
    if (!text) continue  // skip empty messages — Gemini rejects them silently
    const role = m.role === 'user' ? 'user' : 'model'
    // Enforce strict alternation — merge consecutive same-role messages
    const prev = history[history.length - 1]
    if (prev?.role === role) {
      (prev.parts[0] as { text: string }).text += '\n' + text
    } else {
      history.push({ role, parts: [{ text }] })
    }
  }

  // Gemini requires conversation to start with a user turn
  if (history.length > 0 && history[0].role !== 'user') {
    history.shift()
  }

  // Add current user message with optional image
  const lastMsg = history[history.length - 1]
  if (lastMsg?.role === 'user' && image) {
    lastMsg.parts.unshift({ inlineData: { mimeType: (image as ImagePayload).mimeType, data: (image as ImagePayload).data } })
  }

  // Helper: execute read-only tools server-side
  async function executeReadTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stageStartMs = Date.now()
    if (name === 'search_events') {
      const query = normalizeSearchText((args.query as string) ?? '')
      const queryTokens = tokenized(query)
      const dateHint = normalizeSearchText((args.date_hint as string) ?? '')
      const memberName = normalizeSearchText((args.member_name as string) ?? '')

      let results = allEvents as DbEvent[] ?? []

      if (memberName) {
        results = results.filter(e =>
          e.event_members?.some(m => normalizeSearchText(m.family_members?.name ?? '').includes(memberName))
        )
      }
      if (dateHint) {
        results = results.filter(e => {
          const d = new Date(e.start_time)
          const dayName = normalizeSearchText(d.toLocaleDateString('en-US', { weekday: 'long' }))
          const dateStr = normalizeSearchText(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))
          return dayName.includes(dateHint) || dateStr.includes(dateHint) || e.start_time.includes(dateHint.replace(/[^0-9-]/g, ''))
        })
      }

      const scoredResults = results.map((event) => {
        let score = 0
        const title = normalizeSearchText(event.title)
        const searchableText = normalizeSearchText([
          event.title,
          event.location_name ?? '',
          event.address ?? '',
          event.description ?? '',
          event.event_enrichments?.[0]?.prep_notes ?? '',
        ].join(' '))

        if (query) {
          if (title === query) score += 0.85
          else if (title.includes(query)) score += 0.65
          else if (searchableText.includes(query)) score += 0.5

          if (queryTokens.length > 0) {
            const overlap = queryTokens.filter((token) => searchableText.includes(token)).length / queryTokens.length
            score += overlap * 0.25
          }
        }
        if (memberName) {
          const memberHit = event.event_members?.some((m) => m.family_members?.name.toLowerCase().includes(memberName))
          if (memberHit) score += 0.2
        }
        if (dateHint) score += 0.15
        if (!query && !memberName && !dateHint) score += 0.5
        return { event, confidence: Math.min(1, Number(score.toFixed(2))) }
      })
        .filter(({ confidence }) => !query || confidence >= 0.2)
        .sort((a, b) => b.confidence - a.confidence)

      if (scoredResults.length === 0) return { found: false, message: 'No matching events found.' }

      const topConfidence = scoredResults[0]?.confidence ?? 0
      const secondConfidence = scoredResults[1]?.confidence ?? 0
      const ambiguous = scoredResults.length > 1 && (topConfidence < 0.75 || topConfidence - secondConfidence < 0.15)

      const payload = {
        found: true,
        count: scoredResults.length,
        ambiguity: {
          ambiguous,
          top_confidence: topConfidence,
          second_confidence: secondConfidence,
          recommended_action: ambiguous ? 'ask_user_to_disambiguate' : 'safe_to_proceed_after_confirmation',
        },
        events: scoredResults.slice(0, 10).map(({ event: e, confidence }) => ({
          id: e.id,
          confidence,
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          location: e.location_name,
          address: e.address,
          members: e.event_members?.map(m => m.family_members?.name).filter(Boolean),
          all_day: e.all_day,
          description: e.description,
          notes: e.event_enrichments?.[0]?.prep_notes ?? null,
          category: e.event_enrichments?.[0]?.category ?? null,
          what_to_bring: e.event_enrichments?.[0]?.what_to_bring ?? [],
          outfit_suggestion: e.event_enrichments?.[0]?.outfit_suggestion ?? null,
          parking_notes: e.event_enrichments?.[0]?.parking_notes ?? null,
          contact_name: e.event_enrichments?.[0]?.contact_name ?? null,
          contact_phone: e.event_enrichments?.[0]?.contact_phone ?? null,
          cost_estimate: e.event_enrichments?.[0]?.cost_estimate ?? null,
          dietary_notes: e.event_enrichments?.[0]?.dietary_notes ?? null,
          meal_impact: e.event_enrichments?.[0]?.meal_impact ?? null,
          checklist_items: (e.event_checklist_items ?? [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
            .map((item) => ({
              id: item.id,
              label: item.label,
              note: item.note ?? null,
              checked: item.checked === true,
              category: item.category ?? null,
            })),
          action_items: (e.event_action_items ?? [])
            .slice()
            .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
            .map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description ?? null,
              due_date: item.due_date ?? null,
              is_urgent: item.is_urgent === true,
              completed: item.completed === true,
              assigned_to: item.assigned_to ?? null,
            })),
        })),
      }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count ?? 0}`)
      return payload
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
        const payload = { places, count: places.length }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=fetch_failed`)
        return { places: [], count: 0 }
      }
    }

    if (name === 'search_web') {
      const query = String(args.query ?? '').trim()
      const parsedMax = Number(args.max_results ?? 5)
      const maxResults = Number.isFinite(parsedMax) ? Math.max(1, Math.min(8, Math.round(parsedMax))) : 5
      if (!query) return { results: [], count: 0, error: 'Missing query' }
      if (!braveKey) return { results: [], count: 0, error: 'BRAVE_API_KEY not configured' }

      try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search')
        url.searchParams.set('q', query)
        url.searchParams.set('count', String(maxResults))
        url.searchParams.set('safesearch', 'moderate')

        const res = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': braveKey,
          },
        })
        const data = await res.json()
        if (!res.ok) {
          const message = data?.error?.detail ?? data?.error ?? 'Brave search failed'
          const payload = { results: [], count: 0, error: message }
          console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=provider`)
          return payload
        }

        const results = (data?.web?.results ?? []).map((item: {
          title?: string
          url?: string
          description?: string
          age?: string
          page_age?: string
          profile?: { long_name?: string }
        }) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          snippet: item.description ?? '',
          source: item.profile?.long_name ?? null,
          age: item.age ?? item.page_age ?? null,
        }))
        const payload = { results, count: results.length, query }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=network`)
        return { results: [], count: 0, error: 'Unable to reach Brave Search' }
      }
    }

    return { error: 'Unknown tool' }
  }

  // Call Gemini with function calling — up to 2 rounds (tool call → result → final answer)
  async function callGeminiWithTools(contents: GeminiContent[]): Promise<{ type: string; [key: string]: unknown }> {
    const llmStartMs = Date.now()
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
    const llmPrimaryMs = Date.now() - llmStartMs
    console.log(`[ai-assistant][${cid}] stage=llm_primary ms=${llmPrimaryMs} status=${res.status}`)
    warnIfSlow('llm_primary', llmPrimaryMs, STAGE_SLO.llmPrimaryMs)

    if (!res.ok) {
      const errText = await res.text()
      const isQuota = res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
      return { type: 'error', code: isQuota ? 'quota_exceeded' : 'llm_error', message: errText.slice(0, 200) }
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    if (!candidate) return { type: 'error', code: 'llm_error', message: 'No response from AI' }

    // Check for safety/finish reason blocks
    const finishReason = candidate.finishReason
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'TOOL_USE' && !candidate.content) {
      return { type: 'text', text: `I had trouble processing that (${finishReason}). Could you rephrase?` }
    }

    const summarizeReadTool = (name: string, toolResult: Record<string, unknown>): string => {
      if (name === 'search_events') {
        const count = Number(toolResult.count ?? 0)
        if (count > 0) return `I found ${count} matching event${count === 1 ? '' : 's'}.`
        return 'I could not find any matching events.'
      }
      if (name === 'search_places') {
        const count = Number(toolResult.count ?? 0)
        if (count > 0) return `I found ${count} place option${count === 1 ? '' : 's'}.`
        return 'I could not find a matching place yet.'
      }
      if (name === 'search_web') {
        const count = Number(toolResult.count ?? 0)
        if (count > 0) return `I found ${count} web result${count === 1 ? '' : 's'} for that query.`
        return 'I could not find web results for that query.'
      }
      return 'I found results for your request.'
    }

    const resolveModelParts = async (parts: GeminiPart[]) => {
      const funcCallPart = parts.find((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
      const textParts = parts
        .flatMap((p) => 'text' in p && typeof p.text === 'string' && p.text.trim() ? [p.text.trim()] : [])

      if (!funcCallPart && textParts.length > 0) {
        return { type: 'text', text: textParts.join('\n') }
      }

      if (!funcCallPart) return null

      const { name, args } = (funcCallPart as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall

      // Read-only tools: execute server-side, feed result back for final answer
      if (name === 'search_events' || name === 'search_places' || name === 'search_web') {
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
        console.log(`[ai-assistant][${cid}] stage=llm_secondary ms=${Date.now() - llmStartMs} status=${res2.status}`)
        if (!res2.ok) return { type: 'error', code: 'llm_error', message: 'Second LLM call failed' }
        const data2 = await res2.json()
        const finalText = data2.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? ''
        return { type: 'text', text: finalText || summarizeReadTool(name, toolResult) }
      }

      if (name === 'add_grocery_items') {
        const execResult = await sb.functions.invoke('execute-ai-action', {
          body: {
            tool: name,
            args,
            session_id: null,
            correlation_id: `${cid}:auto-grocery:${Date.now().toString(36)}`,
          },
        })

        const execError = execResult.error?.message ?? (execResult.data as { error?: string } | null)?.error ?? null
        if (execError) {
          return { type: 'text', text: `I couldn't add that to grocery yet: ${execError}` }
        }

        const payload = (execResult.data as {
          success?: boolean
          count?: number
          items?: { name: string; category?: string; normalized_from?: string | null }[]
        } | null) ?? {}
        if (!payload.success) {
          return { type: 'text', text: "I couldn't add that to grocery right now. Please try again." }
        }

        const addedItems = Array.isArray(payload.items) ? payload.items : []
        const names = addedItems.map((item) => item.name).filter(Boolean)
        const corrected = addedItems
          .filter((item) => item.normalized_from && item.normalized_from !== item.name)
          .map((item) => `${item.normalized_from} → ${item.name}`)

        const addedLine = names.length > 0
          ? `Added to grocery: ${names.join(', ')}.`
          : `Added ${payload.count ?? 0} grocery item${payload.count === 1 ? '' : 's'}.`
        const correctionLine = corrected.length > 0
          ? ` I interpreted ${corrected.join('; ')}.`
          : ''

        return { type: 'text', text: `${addedLine}${correctionLine}` }
      }

      if (name === 'create_event') {
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        const start = typeof args.start === 'string' ? args.start : ''
        const end = typeof args.end === 'string' ? args.end : ''
        const location = typeof args.location === 'string' ? args.location.trim() : ''
        const notes = typeof args.notes === 'string' ? args.notes.trim() : ''
        const members = Array.isArray(args.members)
          ? args.members.filter((member): member is string => typeof member === 'string' && member.trim().length > 0)
          : []
        const startMs = Date.parse(start)
        const endMs = Date.parse(end)
        const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
          ? (endMs - startMs) / 60000
          : NaN
        const isLowRiskCreate = (
          title.length >= 3 &&
          title.length <= 140 &&
          Number.isFinite(durationMinutes) &&
          durationMinutes >= 5 &&
          durationMinutes <= 240 &&
          members.length <= 2 &&
          location.length === 0 &&
          notes.length === 0
        )

        if (isLowRiskCreate) {
          const execResult = await sb.functions.invoke('execute-ai-action', {
            body: {
              tool: name,
              args,
              session_id: null,
              correlation_id: `${cid}:auto-create:${Date.now().toString(36)}`,
            },
          })

          const execError = execResult.error?.message ?? (execResult.data as { error?: string } | null)?.error ?? null
          if (execError) {
            return { type: 'text', text: `I heard you but couldn't auto-create that yet: ${execError}` }
          }

          const payload = (execResult.data as { success?: boolean; sync_status?: 'synced' | 'queued' | 'failed'; sync_warning?: string } | null) ?? {}
          if (!payload.success) {
            return { type: 'text', text: "I couldn't auto-create that yet. Please try once more." }
          }

          if (payload.sync_status === 'synced') {
            return { type: 'text', text: `Confirmed — I created "${title}" at ${start}.` }
          }
          if (payload.sync_status === 'queued') {
            return { type: 'text', text: `Saved in Casa Tabor. Google sync is queued and still in progress for "${title}".` }
          }
          return {
            type: 'text',
            text: payload.sync_warning
              ? payload.sync_warning
              : `Saved in Casa Tabor, but I could not confirm Google sync yet for "${title}".`,
          }
        }
      }

      // Write tools: return to frontend for confirmation
      return {
        type: 'tool_action',
        tool: name,
        args,
        display_text: buildDisplayText(name, args),
      }
    }

    const initialParts = candidate.content?.parts ?? []
    const initialResolved = await resolveModelParts(initialParts)
    if (initialResolved) return initialResolved

    // Rare provider edge case: retry once before surfacing fallback copy.
    console.error('[ai-assistant] Empty Gemini response. finishReason:', finishReason, 'parts:', JSON.stringify(initialParts))
    const retryRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    )
    console.log(`[ai-assistant][${cid}] stage=llm_retry ms=${Date.now() - llmStartMs} status=${retryRes.status}`)
    if (retryRes.ok) {
      const retryData = await retryRes.json()
      const retryParts = retryData.candidates?.[0]?.content?.parts ?? []
      const retryResolved = await resolveModelParts(retryParts)
      if (retryResolved) return retryResolved
      console.error('[ai-assistant] Empty retry response. finishReason:', retryData.candidates?.[0]?.finishReason, 'parts:', JSON.stringify(retryParts))
    }

    const latestUserText = [...contents]
      .reverse()
      .find((turn) => turn.role === 'user')
      ?.parts.flatMap((part) => 'text' in part && typeof part.text === 'string' ? [part.text.trim()] : [])
      .find((part) => part.length > 0)

    // Last-resort reliability pass: no tools, compact prompt, latest user turn only.
    // This avoids occasional empty tool-call responses from Gemini under load.
    if (latestUserText) {
      const fallbackBody = {
        system_instruction: {
          parts: [{
            text: 'You are the Casa Tabor assistant. Respond helpfully in 1-3 concise sentences. If data is missing, ask one clear follow-up question.',
          }],
        },
        contents: [{ role: 'user', parts: [{ text: latestUserText }] }],
        generation_config: { temperature: 0.2, max_output_tokens: 320 },
      }
      const fallbackRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fallbackBody) }
      )
      console.log(`[ai-assistant][${cid}] stage=llm_fallback ms=${Date.now() - llmStartMs} status=${fallbackRes.status}`)
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json()
        const fallbackParts = fallbackData.candidates?.[0]?.content?.parts ?? []
        const fallbackText = fallbackParts
          .flatMap((part: { text?: string }) => typeof part.text === 'string' && part.text.trim() ? [part.text.trim()] : [])
          .join('\n')
        if (fallbackText) {
          console.log(`[ai-assistant][${cid}] recovered empty response via compact fallback`)
          return { type: 'text', text: fallbackText }
        }
      } else {
        const fallbackErr = await fallbackRes.text().catch(() => '')
        console.error(`[ai-assistant][${cid}] compact fallback failed status=${fallbackRes.status} body=${fallbackErr.slice(0, 180)}`)
      }
    }

    return { type: 'text', text: 'I heard you, but I hit a brief response issue. Please continue and I will keep going.' }
  }

  function buildDisplayText(name: string, args: Record<string, unknown>): string {
    if (name === 'create_event') return `Create: **${args.title}** on ${args.start}`
    if (name === 'update_event') {
      const labels: string[] = []
      if (args.title !== undefined) labels.push('title')
      if (args.start !== undefined || args.end !== undefined) labels.push('time')
      if (args.location !== undefined || args.address !== undefined) labels.push('location')
      if (args.notes !== undefined) labels.push('notes')
      if (args.description !== undefined) labels.push('description')
      if (args.category !== undefined) labels.push('category')
      if (args.what_to_bring !== undefined) labels.push('bring list')
      if (args.checklist_items !== undefined) labels.push('checklist')
      if (args.action_items !== undefined) labels.push('actions')
      if ((args.members_add as string[])?.length || (args.members_remove as string[])?.length) labels.push('attendees')
      if (
        args.outfit_suggestion !== undefined ||
        args.parking_notes !== undefined ||
        args.contact_name !== undefined ||
        args.contact_phone !== undefined ||
        args.cost_estimate !== undefined ||
        args.dietary_notes !== undefined ||
        args.meal_impact !== undefined
      ) {
        labels.push('details')
      }

      const uniqueLabels = [...new Set(labels)]
      const preview = uniqueLabels.slice(0, 3).join(', ')
      const extra = uniqueLabels.length > 3 ? ` +${uniqueLabels.length - 3} more` : ''
      return uniqueLabels.length > 0
        ? `Review update: ${preview}${extra}`
        : 'Review event update'
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
    const requestTotalMs = Date.now() - requestStartMs
    console.log(`[ai-assistant][${cid}] stage=request_total ms=${requestTotalMs} result_type=${String(result?.type ?? 'unknown')}`)
    warnIfSlow('request_total', requestTotalMs, STAGE_SLO.requestTotalMs)
    logUsage()
    return new Response(JSON.stringify({ ...result, correlation_id: cid }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message ?? 'Unknown error'
    console.error(`[ai-assistant][${cid}] error ${msg}`)
    return new Response(
      JSON.stringify({ type: 'error', code: 'llm_error', message: msg, correlation_id: cid }),
      { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
