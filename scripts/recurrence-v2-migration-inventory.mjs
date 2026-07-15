import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  buildReusableBundle,
  classifySeries,
} from './recurrence-v2-migration-inventory-core.mjs'

if (!process.argv.includes('--live-readonly')) {
  throw new Error('Pass --live-readonly to query production without changing Google or Casa data.')
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [
        line.slice(0, separator),
        line.slice(separator + 1).replace(/^['"]|['"]$/g, ''),
      ]
    }),
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function allRows(table, select, configure = (query) => query) {
  const rows = []
  for (let page = 0; ; page += 1) {
    const from = page * 1000
    const { data, error } = await configure(
      supabase.from(table).select(select).range(from, from + 999),
    )
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

async function refreshAccessToken(token) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: token.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google token refresh failed for ${token.google_email}: ${payload.error_description ?? payload.error}`)
  }
  return payload.access_token
}

async function googlePages(url, accessToken, pageLimit = 20) {
  const items = []
  let pageToken
  for (let page = 0; page < pageLimit; page += 1) {
    const target = new URL(url)
    if (pageToken) target.searchParams.set('pageToken', pageToken)
    const response = await fetch(target, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(`Google Calendar ${response.status}: ${payload.error?.message ?? response.statusText}`)
    }
    items.push(...(payload.items ?? []))
    pageToken = payload.nextPageToken
    if (!pageToken) return { items, truncated: false }
  }
  return { items, truncated: Boolean(pageToken) }
}

function indexChildren(rows) {
  const index = new Map()
  for (const row of rows) {
    const children = index.get(row.event_id) ?? []
    children.push(row)
    index.set(row.event_id, children)
  }
  return index
}

function isoRange(casaEvents) {
  const starts = casaEvents.map((event) => new Date(event.start_time).getTime())
  const now = new Date()
  const future = new Date(now)
  future.setUTCMonth(future.getUTCMonth() + 18)
  return {
    timeMin: new Date(Math.min(...starts, now.getTime() - 90 * 86400000) - 86400000).toISOString(),
    timeMax: new Date(Math.max(...starts, future.getTime()) + 86400000).toISOString(),
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length)
  let next = 0
  async function worker() {
    while (next < values.length) {
      const index = next
      next += 1
      results[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

const [
  tokens,
  casaEvents,
  members,
  enrichments,
  planOverrides,
  logistics,
  checklist,
  actions,
] = await Promise.all([
  allRows(
    'google_tokens',
    'family_member_id,google_email,refresh_token,last_sync_at,last_sync_error',
  ),
  allRows(
    'events',
    'id,title,description,start_time,end_time,all_day,location_name,address,lat,lng,google_event_id,google_calendar_id,source_member_id,status,is_enriched,category,event_type,updated_at',
    (query) => query.not('google_event_id', 'is', null),
  ),
  allRows('event_members', 'event_id,family_member_id,role,rsvp_status'),
  allRows('event_enrichments', 'event_id,confidence,what_to_bring,prep_notes,category,category_locked,outfit_suggestion,parking_notes,contact_name,contact_phone,cost_estimate,dietary_notes,meal_impact'),
  allRows('event_plan_overrides', 'event_id,transportation_plan'),
  allRows('event_logistics', 'event_id,sort_order,step_type,icon,title,description,time,location_name,address'),
  allRows('event_checklist_items', 'event_id,label,note,checked,category,sort_order'),
  allRows('event_action_items', 'event_id,title,description,due_date,is_urgent,completed,completed_at,assigned_to,template_due_offset_minutes'),
])

const eventIds = new Set(casaEvents.map((event) => event.id))
const childIndexes = {
  members: indexChildren(members.filter((row) => eventIds.has(row.event_id))),
  enrichment: indexChildren(enrichments.filter((row) => eventIds.has(row.event_id))),
  planOverride: indexChildren(planOverrides.filter((row) => eventIds.has(row.event_id))),
  logistics: indexChildren(logistics.filter((row) => eventIds.has(row.event_id))),
  checklist: indexChildren(checklist.filter((row) => eventIds.has(row.event_id))),
  actions: indexChildren(actions.filter((row) => eventIds.has(row.event_id))),
}
const enrichedCasaEvents = casaEvents.map((event) => ({
  ...event,
  bundle: buildReusableBundle(event, {
    members: childIndexes.members.get(event.id),
    enrichment: childIndexes.enrichment.get(event.id),
    planOverride: childIndexes.planOverride.get(event.id),
    logistics: childIndexes.logistics.get(event.id),
    checklist: childIndexes.checklist.get(event.id),
    actions: childIndexes.actions.get(event.id),
  }),
}))
const range = isoRange(casaEvents)
const accountReports = []
const recurringCasaIds = new Set()
const googleKnownIds = new Set()
const googleKnownEventIds = new Set()
const accountContexts = []

for (const token of tokens) {
  const accessToken = await refreshAccessToken(token)
  const eventListUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  eventListUrl.searchParams.set('singleEvents', 'false')
  eventListUrl.searchParams.set('showDeleted', 'true')
  eventListUrl.searchParams.set('maxResults', '2500')
  const eventList = await googlePages(eventListUrl, accessToken)
  const masters = eventList.items.filter((event) => Array.isArray(event.recurrence) && event.recurrence.length > 0)
  eventList.items.forEach((event) => {
    googleKnownIds.add(`${token.family_member_id}:${event.id}`)
    googleKnownEventIds.add(event.id)
  })

  const instanceResults = await mapWithConcurrency(masters, 4, async (master) => {
    const instancesUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(master.id)}/instances`,
    )
    instancesUrl.searchParams.set('showDeleted', 'true')
    instancesUrl.searchParams.set('maxResults', '2500')
    instancesUrl.searchParams.set('timeMin', range.timeMin)
    instancesUrl.searchParams.set('timeMax', range.timeMax)
    try {
      const result = await googlePages(instancesUrl, accessToken)
      result.items.forEach((event) => {
        googleKnownIds.add(`${token.family_member_id}:${event.id}`)
        googleKnownEventIds.add(event.id)
      })
      return { master, ...result, error: null }
    } catch (error) {
      return { master, items: [], truncated: false, error: error.message }
    }
  })
  const instanceToMaster = new Map()
  for (const result of instanceResults) {
    for (const instance of result.items) instanceToMaster.set(instance.id, result.master.id)
  }
  accountContexts.push({ token, eventList, masters, instanceResults, instanceToMaster })
}

function resolveMaster(event, context) {
  const exactMasterId = context.instanceToMaster.get(event.google_event_id)
  if (exactMasterId) return { masterId: exactMasterId, identityMatch: 'instance_id' }
  const candidates = context.masters
    .filter((master) => event.google_event_id.startsWith(`${master.id}_`))
    .sort((left, right) => right.id.length - left.id.length)
  if (candidates.length === 1 || candidates[0]?.id.length > candidates[1]?.id.length) {
    return { masterId: candidates[0]?.id, identityMatch: 'master_id_prefix' }
  }
  return null
}

for (const context of accountContexts) {
  const { token, eventList, masters, instanceResults } = context
  const accountCasaRows = enrichedCasaEvents.filter((event) => {
    if (event.source_member_id === token.family_member_id) return true
    if (event.source_member_id !== null) return false
    const resolutions = accountContexts
      .map((candidate) => ({ candidate, resolution: resolveMaster(event, candidate) }))
      .filter(({ resolution }) => resolution)
    return resolutions.length === 1 && resolutions[0].candidate === context
  })
  const groupedCasaRows = new Map()
  for (const event of accountCasaRows) {
    const resolution = resolveMaster(event, context)
    if (!resolution) continue
    recurringCasaIds.add(event.id)
    const rows = groupedCasaRows.get(resolution.masterId) ?? []
    rows.push({ ...event, identityMatch: resolution.identityMatch })
    groupedCasaRows.set(resolution.masterId, rows)
  }

  const series = instanceResults.map((result) => ({
    ...classifySeries({
      account: token.google_email,
      master: result.master,
      instances: result.items,
      casaRows: groupedCasaRows.get(result.master.id) ?? [],
    }),
    instanceFetchError: result.error,
    instanceFetchTruncated: result.truncated,
  }))

  accountReports.push({
    account: token.google_email,
    familyMemberId: token.family_member_id,
    lastSyncAt: token.last_sync_at,
    lastSyncError: token.last_sync_error,
    eventListTruncated: eventList.truncated,
    recurringMasterCount: masters.length,
    exceptionResourceCount: eventList.items.filter((event) => event.recurringEventId).length,
    singleEventCount: eventList.items.filter(
      (event) => !event.recurringEventId && !event.recurrence?.length,
    ).length,
    series,
  })
}

const duplicateGoogleLinks = [...Map.groupBy(
  enrichedCasaEvents,
  (event) => `${event.source_member_id}:${event.google_event_id}`,
).entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([identity, rows]) => ({ identity, eventIds: rows.map((row) => row.id).sort() }))
const unscopedCasaGoogleRows = enrichedCasaEvents
  .filter((event) => event.source_member_id === null)
  .filter((event) => !recurringCasaIds.has(event.id))
  .map((event) => ({
    eventId: event.id,
    googleEventId: event.google_event_id,
    title: event.title,
    startTime: event.start_time,
  }))
const missingGoogleRows = enrichedCasaEvents
  .filter((event) => event.source_member_id !== null)
  .filter((event) => !recurringCasaIds.has(event.id))
  .filter((event) => !googleKnownIds.has(`${event.source_member_id}:${event.google_event_id}`))
  .map((event) => ({
    eventId: event.id,
    googleEventId: event.google_event_id,
    sourceMemberId: event.source_member_id,
    title: event.title,
    startTime: event.start_time,
  }))
const unscopedMissingGoogleRows = unscopedCasaGoogleRows.filter(
  (event) => !googleKnownEventIds.has(event.googleEventId),
)
const allSeries = accountReports.flatMap((account) => account.series)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  readOnly: true,
  range,
  summary: {
    connectedAccounts: tokens.length,
    googleRecurringMasters: allSeries.length,
    googleInstancesLoaded: allSeries.reduce((total, series) => total + series.googleInstanceCount, 0),
    googleExceptionsDetected: allSeries.reduce((total, series) => total + series.googleExceptions.length, 0),
    linkedRecurringSeries: allSeries.filter((series) => series.casaOccurrenceCount > 0).length,
    casaGoogleLinkedRows: enrichedCasaEvents.length,
    casaRecurringRowsMatched: recurringCasaIds.size,
    legacyPrefixOccurrenceLinks: allSeries.reduce(
      (total, series) => total + (series.identityMatches.master_id_prefix ?? 0),
      0,
    ),
    casaSingleOrUnmatchedRows: enrichedCasaEvents.length - recurringCasaIds.size,
    unscopedCasaGoogleRows: unscopedCasaGoogleRows.length,
    unscopedMissingGoogleRows: unscopedMissingGoogleRows.length,
    duplicateGoogleLinks: duplicateGoogleLinks.length,
    missingGoogleRows: missingGoogleRows.length,
    shadowReadySeries: allSeries.filter((series) => series.migrationDisposition === 'shadow_ready').length,
    manualReviewSeries: allSeries.filter((series) => series.migrationDisposition === 'manual_review').length,
    seriesWithAmbiguousLogistics: allSeries.filter(
      (series) => series.ambiguousPaths.some((path) => path.path === 'logistics'),
    ).length,
    googleOnlySeries: allSeries.filter((series) => series.migrationDisposition === 'google_only').length,
    instanceFetchFailures: allSeries.filter((series) => series.instanceFetchError).length,
  },
  duplicateGoogleLinks,
  unscopedCasaGoogleRows,
  unscopedMissingGoogleRows,
  missingGoogleRows,
  accounts: accountReports,
}

const outputPath = argument('--output')
if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(outputPath ? { ...report.summary, outputPath } : report, null, 2))
