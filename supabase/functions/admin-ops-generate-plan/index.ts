import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'
import {
  parseAdminOpsRequest,
  resolveMemberScope,
} from '../_shared/admin-ops.ts'

interface OperationPlan {
  operation: 'delete' | 'add' | 'edit'
  description: string
  scope: {
    dateRangeStart?: string
    dateRangeEnd?: string
    titleFilter?: string
    memberFilter?: string[]
  }
  estimatedCount?: number
  sampleRows?: unknown[]
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SampleRow {
  id: string
  title: string
  start_time: string
  status: string | null
  event_members?: Array<{
    family_member?: {
      name?: string | null
    } | null
  }>
}

function memberNamesFromRow(row: SampleRow): string[] {
  return Array.from(
    new Set(
      (row.event_members ?? [])
        .map((member) => member.family_member?.name?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

async function generatePlan(sb: ReturnType<typeof createClient>, request: string): Promise<OperationPlan> {
  const parsed = parseAdminOpsRequest(request)
  const resolvedMemberScope = await resolveMemberScope(sb, parsed.scope.memberFilter)

  if (resolvedMemberScope && resolvedMemberScope.memberIds.length === 0) {
    throw new Error(`No family members matched "${(parsed.scope.memberFilter ?? []).join(', ')}"`)
  }

  const resolvedScope = {
    ...parsed.scope,
    memberFilter:
      resolvedMemberScope && resolvedMemberScope.memberNames.length > 0
        ? resolvedMemberScope.memberNames
        : parsed.scope.memberFilter,
  }

  let sampleQuery = sb
    .from('events')
    .select(`
      id,
      title,
      start_time,
      status,
      event_members (
        family_member:family_members (name)
      )
    `)

  if (resolvedScope.dateRangeStart) {
    sampleQuery = sampleQuery.gte('start_time', resolvedScope.dateRangeStart)
  }
  if (resolvedScope.dateRangeEnd) {
    sampleQuery = sampleQuery.lte('start_time', resolvedScope.dateRangeEnd)
  }
  if (resolvedScope.titleFilter) {
    sampleQuery = sampleQuery.ilike('title', `%${resolvedScope.titleFilter}%`)
  }
  if (resolvedMemberScope) {
    if (resolvedMemberScope.eventIds.length === 0) {
      return {
        operation: parsed.operation,
        description: parsed.description,
        scope: resolvedScope,
        estimatedCount: 0,
        sampleRows: [],
      }
    }
    sampleQuery = sampleQuery.in('id', resolvedMemberScope.eventIds)
  }
  sampleQuery = sampleQuery.order('start_time').limit(5)

  let countQuery = sb
    .from('events')
    .select('id', { count: 'exact', head: true })

  if (resolvedScope.dateRangeStart) {
    countQuery = countQuery.gte('start_time', resolvedScope.dateRangeStart)
  }
  if (resolvedScope.dateRangeEnd) {
    countQuery = countQuery.lte('start_time', resolvedScope.dateRangeEnd)
  }
  if (resolvedScope.titleFilter) {
    countQuery = countQuery.ilike('title', `%${resolvedScope.titleFilter}%`)
  }
  if (resolvedMemberScope) {
    countQuery = countQuery.in('id', resolvedMemberScope.eventIds)
  }

  const [{ data: rawSampleRows = [], error: sampleError }, { count, error: countError }] = await Promise.all([
    sampleQuery,
    countQuery,
  ])

  if (sampleError) {
    throw new Error(`Failed to fetch sample rows: ${sampleError.message}`)
  }
  if (countError) {
    throw new Error(`Failed to count matching rows: ${countError.message}`)
  }

  const sampleRows = (rawSampleRows as SampleRow[]).map((row) => ({
    ...row,
    member_names: memberNamesFromRow(row),
  }))

  return {
    operation: parsed.operation,
    description: parsed.description,
    scope: resolvedScope,
    estimatedCount: count ?? sampleRows.length,
    sampleRows,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const sbUrl = requireEnv('SUPABASE_URL')
    const sbAnonKey = requireEnv('SUPABASE_ANON_KEY')
    const sb = createClient(sbUrl, sbAnonKey)

    const body = await req.json()
    const { request } = body

    if (!request || typeof request !== 'string') {
      return new Response(
        JSON.stringify({ message: 'Missing or invalid request field' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    const plan = await generatePlan(sb, request)

    return new Response(JSON.stringify(plan), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (error) {
    console.error('Error generating plan:', error)
    return new Response(
      JSON.stringify({ message: error instanceof Error ? error.message : 'Failed to generate plan' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  }
})
