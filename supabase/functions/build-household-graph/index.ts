import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
}

type GraphNodeType = 'member' | 'place' | 'contact' | 'event' | 'routine'
type EdgeType = 'attends' | 'at_place' | 'knows' | 'follows_routine' | 'instance_of_routine' | 'has_provider'

type GraphNode = {
  node_key: string
  node_type: GraphNodeType
  ref_id: string | null
  label: string
  metadata: Record<string, unknown>
}

type GraphEdge = {
  edge_type: EdgeType
  from_key: string
  to_key: string
  weight: number
  metadata: Record<string, unknown>
}

const LOCATION_EDGE_TYPES = new Set(['school', 'sports', 'medical', 'work'])

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode) {
  if (!nodes.has(node.node_key)) nodes.set(node.node_key, node)
}

function addEdge(edges: Map<string, GraphEdge>, edge: GraphEdge) {
  const key = `${edge.edge_type}::${edge.from_key}::${edge.to_key}`
  const current = edges.get(key)
  if (!current) {
    edges.set(key, edge)
    return
  }
  current.weight += edge.weight
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const correlationId = getCorrelationId(req, 'graph')
  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

  const now = new Date()
  const nowIso = now.toISOString()
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString()

  const [membersResult, placesResult, contactsResult, contactPlacesResult, familyContactsResult, eventsResult] = await Promise.all([
    sb.from('family_members').select('id, name, role').order('sort_order'),
    sb.from('saved_places').select('id, name, aliases, address, category'),
    sb.from('saved_contacts').select('id, name, aliases, relationship, primary_place_id, primary_place_source'),
    sb.from('contact_place_relationships')
      .select('contact_id, place_id, relationship, is_default, source, confidence')
      .eq('confirmed', true),
    sb.from('family_contact_relationships')
      .select('family_member_id, contact_id, relationship, source, confidence')
      .eq('confirmed', true),
    sb
      .from('events')
      .select('id, title, event_type, rrule, start_time, location_name, address, source_member_id, event_members(family_member_id), event_enrichments(category)')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd),
  ])

  if (
    membersResult.error ||
    placesResult.error ||
    contactsResult.error ||
    contactPlacesResult.error ||
    familyContactsResult.error ||
    eventsResult.error
  ) {
    const error = membersResult.error ?? placesResult.error ?? contactsResult.error ??
      contactPlacesResult.error ?? familyContactsResult.error ?? eventsResult.error
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? 'Graph query failed', correlation_id: correlationId }), {
      status: 500,
      headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId),
    })
  }

  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()

  type PlaceCandidate = {
    key: string
    category: string | null
    addressNorm: string
    terms: Set<string>
  }
  const placeCandidates: PlaceCandidate[] = []
  const placeTermsToKey = new Map<string, string>()

  for (const m of membersResult.data ?? []) {
    addNode(nodes, {
      node_key: `member:${m.id}`,
      node_type: 'member',
      ref_id: m.id,
      label: m.name,
      metadata: { role: m.role },
    })
  }

  for (const p of placesResult.data ?? []) {
    const key = `place:${p.id}`
    const terms = new Set<string>()
    terms.add(normalize(p.name))
    for (const alias of p.aliases ?? []) terms.add(normalize(alias))
    if (p.address) terms.add(normalize(p.address))

    addNode(nodes, {
      node_key: key,
      node_type: 'place',
      ref_id: p.id,
      label: p.name,
      metadata: { category: p.category, address: p.address ?? null },
    })

    placeCandidates.push({
      key,
      category: p.category,
      addressNorm: normalize(p.address),
      terms,
    })

    for (const term of terms) {
      if (term) placeTermsToKey.set(term, key)
    }
  }

  for (const c of contactsResult.data ?? []) {
    const contactKey = `contact:${c.id}`
    addNode(nodes, {
      node_key: contactKey,
      node_type: 'contact',
      ref_id: c.id,
      label: c.name,
      metadata: {
        relationship: c.relationship ?? null,
        aliases: c.aliases ?? [],
        primary_place_id: c.primary_place_id ?? null,
        primary_place_source: c.primary_place_source ?? null,
      },
    })

    const contactTerms = [normalize(c.name), ...(c.aliases ?? []).map((a) => normalize(a))].filter(Boolean)
    for (const member of membersResult.data ?? []) {
      const memberNameNorm = normalize(member.name)
      if (!memberNameNorm) continue
      if (contactTerms.some((term) => term.includes(memberNameNorm) || memberNameNorm.includes(term))) {
        addEdge(edges, {
          edge_type: 'knows',
          from_key: `member:${member.id}`,
          to_key: contactKey,
          weight: 1,
          metadata: { matched_on: 'name_or_alias' },
        })
      }
    }

  }

  for (const relationship of contactPlacesResult.data ?? []) {
    addEdge(edges, {
      edge_type: 'at_place',
      from_key: `contact:${relationship.contact_id}`,
      to_key: `place:${relationship.place_id}`,
      weight: relationship.confidence ?? 1,
      metadata: {
        relationship: relationship.relationship,
        is_default: relationship.is_default,
        source: relationship.source,
      },
    })
  }

  for (const relationship of familyContactsResult.data ?? []) {
    addEdge(edges, {
      edge_type: 'has_provider',
      from_key: `member:${relationship.family_member_id}`,
      to_key: `contact:${relationship.contact_id}`,
      weight: relationship.confidence ?? 1,
      metadata: {
        relationship: relationship.relationship,
        source: relationship.source,
      },
    })
  }

  const memberPlaceCounts = new Map<string, number>()
  // "who typically goes here" / "what happens here" summaries, merged into place
  // node metadata below so the assistant can resolve e.g. "Liv's dentist" without
  // re-deriving this from raw events on every request.
  const placeVisitorCounts = new Map<string, Map<string, number>>()
  const placeActivityCounts = new Map<string, Map<string, number>>()
  const memberIdToName = new Map((membersResult.data ?? []).map((m) => [m.id, m.name]))

  function bumpCount(map: Map<string, Map<string, number>>, placeKey: string, subKey: string) {
    const inner = map.get(placeKey) ?? new Map<string, number>()
    inner.set(subKey, (inner.get(subKey) ?? 0) + 1)
    map.set(placeKey, inner)
  }

  function topEntries(map: Map<string, number> | undefined, limit: number) {
    if (!map) return []
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }))
  }

  type EventRow = {
    id: string
    title: string
    event_type: string
    rrule: string | null
    start_time: string
    location_name: string | null
    address: string | null
    source_member_id: string | null
    event_members: { family_member_id: string }[]
    event_enrichments: { category: string | null }[] | { category: string | null } | null
  }

  for (const ev of (eventsResult.data ?? []) as EventRow[]) {
    const eventKey = `event:${ev.id}`
    addNode(nodes, {
      node_key: eventKey,
      node_type: 'event',
      ref_id: ev.id,
      label: ev.title,
      metadata: {
        start_time: ev.start_time,
        event_type: ev.event_type,
        source_member_id: ev.source_member_id,
      },
    })

    const attendeeIds = new Set((ev.event_members ?? []).map((em) => em.family_member_id))
    if (ev.source_member_id) attendeeIds.add(ev.source_member_id)

    for (const memberId of attendeeIds) {
      addEdge(edges, {
        edge_type: 'attends',
        from_key: `member:${memberId}`,
        to_key: eventKey,
        weight: 1,
        metadata: { start_time: ev.start_time },
      })
    }

    if (ev.rrule || ev.event_type === 'reminder') {
      const routineKey = `routine:${ev.id}`
      addNode(nodes, {
        node_key: routineKey,
        node_type: 'routine',
        ref_id: ev.id,
        label: ev.title,
        metadata: { rrule: ev.rrule, event_type: ev.event_type },
      })

      addEdge(edges, {
        edge_type: 'instance_of_routine',
        from_key: eventKey,
        to_key: routineKey,
        weight: 1,
        metadata: {},
      })

      for (const memberId of attendeeIds) {
        addEdge(edges, {
          edge_type: 'follows_routine',
          from_key: `member:${memberId}`,
          to_key: routineKey,
          weight: 1,
          metadata: {},
        })
      }
    }

    const locationNorm = normalize(ev.location_name)
    const addressNorm = normalize(ev.address)
    let matchedPlaceKey = ''
    if (locationNorm) matchedPlaceKey = placeTermsToKey.get(locationNorm) ?? ''
    if (!matchedPlaceKey && addressNorm) {
      const byAddress = placeCandidates.find((p) => p.addressNorm && p.addressNorm === addressNorm)
      if (byAddress) matchedPlaceKey = byAddress.key
    }
    if (!matchedPlaceKey && locationNorm) {
      const loose = placeCandidates.find((p) => [...p.terms].some((term) => term && (locationNorm.includes(term) || term.includes(locationNorm))))
      if (loose) matchedPlaceKey = loose.key
    }

    if (!matchedPlaceKey && (locationNorm || addressNorm)) {
      const fallbackKey = `place:derived:${locationNorm || addressNorm}`
      addNode(nodes, {
        node_key: fallbackKey,
        node_type: 'place',
        ref_id: null,
        label: ev.location_name ?? ev.address ?? 'Unknown place',
        metadata: { derived: true, address: ev.address ?? null },
      })
      matchedPlaceKey = fallbackKey
    }

    if (matchedPlaceKey) {
      addEdge(edges, {
        edge_type: 'at_place',
        from_key: eventKey,
        to_key: matchedPlaceKey,
        weight: 1,
        metadata: { at: ev.start_time },
      })

      const placeCategory = placeCandidates.find((p) => p.key === matchedPlaceKey)?.category
      const eventCategory = (Array.isArray(ev.event_enrichments) ? ev.event_enrichments[0] : ev.event_enrichments)?.category
      bumpCount(placeActivityCounts, matchedPlaceKey, eventCategory || ev.title)
      for (const memberId of attendeeIds) {
        const key = `member:${memberId}::${matchedPlaceKey}`
        memberPlaceCounts.set(key, (memberPlaceCounts.get(key) ?? 0) + 1)
        bumpCount(placeVisitorCounts, matchedPlaceKey, memberIdToName.get(memberId) ?? memberId)
        if (placeCategory && LOCATION_EDGE_TYPES.has(placeCategory)) {
          addEdge(edges, {
            edge_type: 'at_place',
            from_key: `member:${memberId}`,
            to_key: matchedPlaceKey,
            weight: 0.5,
            metadata: { inferred_from_category: placeCategory },
          })
        }
      }
    }
  }

  for (const [key, count] of memberPlaceCounts.entries()) {
    const [memberKey, placeKey] = key.split('::')
    addEdge(edges, {
      edge_type: 'at_place',
      from_key: memberKey,
      to_key: placeKey,
      weight: count,
      metadata: { frequency_window_days: 210 },
    })
  }

  for (const [placeKey, node] of nodes.entries()) {
    if (node.node_type !== 'place') continue
    const commonVisitors = topEntries(placeVisitorCounts.get(placeKey), 6)
    const commonActivities = topEntries(placeActivityCounts.get(placeKey), 4)
    if (commonVisitors.length === 0 && commonActivities.length === 0) continue
    nodes.set(placeKey, {
      ...node,
      metadata: { ...node.metadata, common_visitors: commonVisitors, common_activities: commonActivities },
    })
  }

  const nodeRows = [...nodes.values()]
  if (nodeRows.length > 0) {
    const { error: upsertNodeError } = await sb.from('household_graph_nodes').upsert(nodeRows, { onConflict: 'node_key' })
    if (upsertNodeError) {
      return new Response(JSON.stringify({ ok: false, error: upsertNodeError.message, correlation_id: correlationId }), {
        status: 500,
        headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId),
      })
    }
  }

  const nodeLookupResults = await Promise.all(
    Array.from({ length: Math.ceil(nodeRows.length / 75) }, (_, index) =>
      sb
        .from('household_graph_nodes')
        .select('id, node_key')
        .in('node_key', nodeRows.slice(index * 75, (index + 1) * 75).map((node) => node.node_key))),
  )
  const nodeLookupError = nodeLookupResults.find((result) => result.error)?.error
  if (nodeLookupError) {
    return new Response(JSON.stringify({ ok: false, error: nodeLookupError.message, correlation_id: correlationId }), {
      status: 500,
      headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId),
    })
  }

  const nodeLookup = nodeLookupResults.flatMap((result) => result.data ?? [])
  const nodeKeyToId = new Map((nodeLookup ?? []).map((n) => [n.node_key, n.id]))
  const edgeRows = [...edges.values()]
    .map((edge) => ({
      edge_type: edge.edge_type,
      from_node_id: nodeKeyToId.get(edge.from_key) ?? null,
      to_node_id: nodeKeyToId.get(edge.to_key) ?? null,
      weight: edge.weight,
      metadata: edge.metadata,
      last_seen_at: nowIso,
    }))
    .filter((edge) => edge.from_node_id && edge.to_node_id)

  await sb.from('household_graph_edges').delete().lt('last_seen_at', windowStart)

  if (edgeRows.length > 0) {
    const { error: upsertEdgeError } = await sb.from('household_graph_edges').upsert(edgeRows, {
      onConflict: 'edge_type,from_node_id,to_node_id',
    })
    if (upsertEdgeError) {
      return new Response(JSON.stringify({ ok: false, error: upsertEdgeError.message, correlation_id: correlationId }), {
        status: 500,
        headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId),
      })
    }
  }

  const { count: nodeCount } = await sb.from('household_graph_nodes').select('*', { count: 'exact', head: true })
  const { count: edgeCount } = await sb.from('household_graph_edges').select('*', { count: 'exact', head: true })

  // Passive directory auto-discovery: now that the graph reflects the latest
  // calendar activity, surface any newly-recurring unmatched places/contacts
  // (and family-member/contact links) as unconfirmed suggestions for review
  // in Settings. Additive-only, idempotent, never touches confirmed rows —
  // safe to no-op or fail without affecting the graph rebuild itself.
  let discovery: Record<string, unknown> | null = null
  try {
    const { data: discoveryData, error: discoveryError } = await sb.rpc('discover_directory_candidates')
    if (discoveryError) {
      console.error('discover_directory_candidates failed', discoveryError.message)
    } else {
      discovery = discoveryData as Record<string, unknown>
      const asCount = (key: string) => (typeof discovery?.[key] === 'number' ? (discovery[key] as number) : 0)
      const placesInserted = asCount('places_inserted')
      const contactsInserted = asCount('contacts_inserted')
      // Only places_inserted/contacts_inserted show up as an inline Add/Skip row in
      // the Needs You card (family_links/connections are silent auto-links with no
      // per-entry review UI) — the notification copy must count only what a person
      // can actually act on, or "3 new entries" will show up with just 2 rows to
      // review and look broken/confusing.
      const reviewableCount = placesInserted + contactsInserted
      const totalInserted = Object.values(discovery ?? {}).reduce(
        (sum, v) => sum + (typeof v === 'number' ? v : 0),
        0,
      )
      // Only notify when something actually needs review — a zero-result scan
      // (the common case once the backlog is caught up) shouldn't spam the bell.
      if (totalInserted > 0) {
        const noun =
          reviewableCount === 1
            ? (placesInserted === 1 ? 'a new place' : 'a new contact')
            : `${reviewableCount} new places or contacts`
        const body =
          reviewableCount > 0
            ? `We noticed ${noun} from your calendar — save the ones you want to keep, or skip them.`
            : 'We linked some places and contacts already in your directory, based on your calendar.'
        await sb.from('notifications').insert({
          type: 'directory_suggestions',
          title: reviewableCount > 0 ? 'New places & contacts to review' : 'Directory updated from your calendar',
          body,
          source: 'system',
        })
      }
    }
  } catch (discoveryCatchError) {
    console.error('discover_directory_candidates threw', discoveryCatchError)
  }

    return new Response(
      JSON.stringify({
        ok: true,
        correlation_id: correlationId,
        window: { start: windowStart, end: windowEnd },
        counts: {
          nodes_upserted: nodeRows.length,
          edges_upserted: edgeRows.length,
          nodes_total: nodeCount ?? null,
          edges_total: edgeCount ?? null,
        },
        directory_discovery: discovery,
      }),
      { headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, correlation_id: correlationId, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  }
})
