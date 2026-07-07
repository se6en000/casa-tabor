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

interface ExecutionResult {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  rowsAffected: number
  errors: string[]
  startedAt: string
  completedAt?: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function executeOperation(
  sbServiceRole: ReturnType<typeof createClient>,
  plan: OperationPlan,
  jobId: string
): Promise<{ rowsAffected: number; errors: string[] }> {
  const errors: string[] = []
  let rowsAffected = 0

  try {
    if (plan.operation === 'delete') {
      // Build delete query with scope validation
      let query = sbServiceRole.from('events').select('id')

      if (plan.scope.dateRangeStart) {
        query = query.gte('start_time', plan.scope.dateRangeStart)
      }
      if (plan.scope.dateRangeEnd) {
        query = query.lte('start_time', plan.scope.dateRangeEnd)
      }
      if (plan.scope.titleFilter) {
        query = query.ilike('title', `%${plan.scope.titleFilter}%`)
      }
      if (plan.scope.memberFilter && plan.scope.memberFilter.length > 0) {
        query = query.in('member_name', plan.scope.memberFilter)
      }

      const { data: rowsToDelete, error: fetchError } = await query

      if (fetchError) {
        errors.push(`Failed to fetch rows: ${fetchError.message}`)
        return { rowsAffected: 0, errors }
      }

      if (!rowsToDelete || rowsToDelete.length === 0) {
        return { rowsAffected: 0, errors: ['No matching rows found'] }
      }

      // Delete in chunks (safety measure)
      const chunkSize = 100
      for (let i = 0; i < rowsToDelete.length; i += chunkSize) {
        const chunk = rowsToDelete.slice(i, i + chunkSize).map((r: any) => r.id)

        // Soft delete (archive) rather than hard delete
        const { error: deleteError } = await sbServiceRole
          .from('events')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .in('id', chunk)

        if (deleteError) {
          errors.push(`Failed to delete chunk ${Math.floor(i / chunkSize) + 1}: ${deleteError.message}`)
        } else {
          rowsAffected += chunk.length
        }
      }
    } else if (plan.operation === 'add') {
      // Add operation would create new events
      // For now, return error as this requires more structured input
      errors.push('Add operation not yet implemented via natural language')
    } else if (plan.operation === 'edit') {
      // Edit operation would update existing events
      // For now, return error as this requires more structured input
      errors.push('Edit operation not yet implemented via natural language')
    }
  } catch (err) {
    errors.push(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { rowsAffected, errors }
}

async function logAuditTrail(
  sbServiceRole: ReturnType<typeof createClient>,
  jobId: string,
  plan: OperationPlan,
  result: { rowsAffected: number; errors: string[] }
): Promise<void> {
  try {
    await sbServiceRole.from('admin_ops_audit_log').insert({
      job_id: jobId,
      operation: plan.operation,
      description: plan.description,
      scope_filters: JSON.stringify(plan.scope),
      rows_affected: result.rowsAffected,
      errors: result.errors.length > 0 ? result.errors : null,
      status: result.errors.length > 0 ? 'failed' : 'completed',
      executed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Failed to log audit trail:', err)
    // Don't throw - audit logging failure shouldn't block operation completion
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const jobId = generateJobId()
  const startedAt = new Date().toISOString()

  try {
    const sbUrl = requireEnv('SUPABASE_URL')
    const sbServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const sbServiceRole = createClient(sbUrl, sbServiceRoleKey)

    const body = await req.json()
    const { plan } = body as { plan: OperationPlan }

    if (!plan) {
      return new Response(
        JSON.stringify({ message: 'Missing plan field' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    // Validate scope (must have at least one filter)
    if (
      !plan.scope.titleFilter &&
      !plan.scope.dateRangeStart &&
      (!plan.scope.memberFilter || plan.scope.memberFilter.length === 0)
    ) {
      return new Response(
        JSON.stringify({ message: 'Operation scope must include at least one filter' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    // Execute the operation
    const result = await executeOperation(sbServiceRole, plan, jobId)

    // Log audit trail
    await logAuditTrail(sbServiceRole, jobId, plan, result)

    const response: ExecutionResult = {
      jobId,
      status: result.errors.length > 0 ? 'failed' : 'completed',
      rowsAffected: result.rowsAffected,
      errors: result.errors,
      startedAt,
      completedAt: new Date().toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (error) {
    console.error('Error executing operation:', error)
    return new Response(
      JSON.stringify({
        jobId,
        status: 'failed',
        rowsAffected: 0,
        errors: [error instanceof Error ? error.message : 'Operation failed'],
        startedAt,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  }
})
