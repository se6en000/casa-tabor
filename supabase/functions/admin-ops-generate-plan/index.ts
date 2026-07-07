import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.mjs'

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
  sampleRows?: any[]
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Parse natural language request to extract operation details
function parseRequest(request: string): {
  operation: 'delete' | 'add' | 'edit'
  description: string
  scope: {
    dateRangeStart?: string
    dateRangeEnd?: string
    titleFilter?: string
    memberFilter?: string[]
  }
} {
  const lower = request.toLowerCase()
  let operation: 'delete' | 'add' | 'edit' = 'delete'
  
  if (lower.includes('delete') || lower.includes('remove')) {
    operation = 'delete'
  } else if (lower.includes('add') || lower.includes('create')) {
    operation = 'add'
  } else if (lower.includes('change') || lower.includes('update') || lower.includes('move')) {
    operation = 'edit'
  }

  const scope: {
    dateRangeStart?: string
    dateRangeEnd?: string
    titleFilter?: string
    memberFilter?: string[]
  } = {}

  // Extract date range
  const dateMatch = request.match(/(?:in|during)\s+(\w+)\s+(\d{4})?/i)
  if (dateMatch) {
    const monthYear = dateMatch[1]
    const year = dateMatch[2] || new Date().getFullYear().toString()
    scope.dateRangeStart = `${year}-01-01` // Simplified - would need better parsing
  }

  const dateRangeMatch = request.match(/(?:between|from)\s+(\w+\s+\d+)\s+(?:and|to)\s+(\w+\s+\d+)/i)
  if (dateRangeMatch) {
    // This would need more sophisticated parsing
    scope.dateRangeStart = dateRangeMatch[1]
    scope.dateRangeEnd = dateRangeMatch[2]
  }

  // Extract title filter (common patterns)
  const titlePatterns = [
    /['"]([^'"]+)['"]/,
    /(?:named|titled|called)\s+(['"]?)([^'"]+)\1/i,
  ]
  
  for (const pattern of titlePatterns) {
    const match = request.match(pattern)
    if (match) {
      scope.titleFilter = match[match.length - 1]
      break
    }
  }

  // Extract member filter
  const memberMatch = request.match(/(?:for|by)\s+(\w+)/i)
  if (memberMatch) {
    scope.memberFilter = [memberMatch[1]]
  }

  return {
    operation,
    description: request,
    scope,
  }
}

async function generatePlan(sb: ReturnType<typeof createClient>, request: string): Promise<OperationPlan> {
  // Parse the request
  const parsed = parseRequest(request)

  // Build query to get sample rows
  let query = sb.from('events').select('id, title, member_name, start_time, status')

  // Apply filters
  if (parsed.scope.dateRangeStart) {
    query = query.gte('start_time', parsed.scope.dateRangeStart)
  }
  if (parsed.scope.dateRangeEnd) {
    query = query.lte('start_time', parsed.scope.dateRangeEnd)
  }
  if (parsed.scope.titleFilter) {
    query = query.ilike('title', `%${parsed.scope.titleFilter}%`)
  }
  if (parsed.scope.memberFilter && parsed.scope.memberFilter.length > 0) {
    query = query.in('member_name', parsed.scope.memberFilter)
  }

  // Get count and sample rows
  const countRes = await sb
    .from('events')
    .select('id', { count: 'exact', head: true })
    .then((r) => ({ count: r.count || 0 }))

  // Get sample rows (max 5)
  const { data: sampleRows = [], error: sampleError } = await query.limit(5)

  if (sampleError) {
    throw new Error(`Failed to fetch sample rows: ${sampleError.message}`)
  }

  // Ensure we have at least a title filter or date range
  if (!parsed.scope.titleFilter && !parsed.scope.dateRangeStart && !parsed.scope.memberFilter) {
    throw new Error('Request must include at least one scope filter: title pattern, date range, or member name')
  }

  return {
    operation: parsed.operation,
    description: parsed.description,
    scope: parsed.scope,
    estimatedCount: sampleRows.length > 0 ? Math.max(sampleRows.length * 10, 5) : 0, // Rough estimate
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
