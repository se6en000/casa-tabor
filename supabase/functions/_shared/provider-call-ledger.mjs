function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
}

function readJsonBody(init) {
  if (typeof init?.body !== 'string') return null
  try {
    return JSON.parse(init.body)
  } catch {
    return null
  }
}

function inferProvider(url) {
  const value = String(url)
  if (value.includes('generativelanguage.googleapis.com')) return 'gemini'
  if (value.includes('api.openai.com')) return 'openai'
  if (value.includes('api.anthropic.com')) return 'anthropic'
  return 'unknown'
}

function inferModel(provider, url, requestBody) {
  if (provider === 'gemini') {
    return decodeURIComponent(String(url).match(/\/models\/([^:?/]+)/)?.[1] ?? 'unknown')
  }
  return typeof requestBody?.model === 'string' ? requestBody.model : 'unknown'
}

function extractUsage(provider, payload, promptChars = 0) {
  if (!payload || typeof payload !== 'object') {
    const estimatedPromptTokens = promptChars > 0 ? Math.max(1, Math.ceil(promptChars / 4)) : 0
    return { inputTokens: estimatedPromptTokens, cachedInputTokens: 0, thoughtTokens: 0, outputTokens: 0, totalTokens: estimatedPromptTokens }
  }
  if (provider === 'gemini') {
    const usage = payload.usageMetadata ?? {}
    let inputTokens = nonNegativeInteger(usage.promptTokenCount)
    const cachedInputTokens = nonNegativeInteger(usage.cachedContentTokenCount)
    const thoughtTokens = nonNegativeInteger(usage.thoughtsTokenCount)
    const outputTokens = nonNegativeInteger(usage.candidatesTokenCount)
    let totalTokens = nonNegativeInteger(usage.totalTokenCount)

    // For embeddings or responses without usageMetadata, approximate tokens from promptChars
    if (inputTokens === 0 && promptChars > 0) {
      inputTokens = Math.max(1, Math.ceil(promptChars / 4))
      totalTokens = inputTokens
    }

    return {
      inputTokens,
      cachedInputTokens,
      thoughtTokens,
      outputTokens,
      totalTokens,
    }
  }
  if (provider === 'openai') {
    const usage = payload.usage ?? {}
    return {
      inputTokens: nonNegativeInteger(usage.prompt_tokens ?? usage.input_tokens),
      cachedInputTokens: nonNegativeInteger(
        usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens,
      ),
      thoughtTokens: nonNegativeInteger(
        usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens,
      ),
      outputTokens: nonNegativeInteger(usage.completion_tokens ?? usage.output_tokens),
      totalTokens: nonNegativeInteger(usage.total_tokens),
    }
  }
  const usage = payload.usage ?? {}
  const inputTokens = nonNegativeInteger(usage.input_tokens)
  const cachedInputTokens = nonNegativeInteger(usage.cache_read_input_tokens)
  const outputTokens = nonNegativeInteger(usage.output_tokens)
  return {
    inputTokens,
    cachedInputTokens,
    thoughtTokens: 0,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

function finishReason(provider, payload) {
  if (provider === 'gemini') return payload?.candidates?.[0]?.finishReason ?? null
  if (provider === 'openai') return payload?.choices?.[0]?.finish_reason ?? null
  return payload?.stop_reason ?? null
}

async function readResponsePayload(provider, response) {
  const clone = response.clone()
  const contentType = clone.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    const text = await clone.text().catch(() => '')
    let usageMetadata = null
    let lastCandidate = null
    for (const line of text.split('\n')) {
      if (!line.trim().startsWith('data:')) continue
      try {
        const payload = JSON.parse(line.trim().slice(5).trim())
        if (payload?.usageMetadata) usageMetadata = payload.usageMetadata
        if (payload?.candidates?.[0]) lastCandidate = payload.candidates[0]
      } catch {
        // Ignore malformed transport frames; the provider response remains authoritative.
      }
    }
    return provider === 'gemini'
      ? { usageMetadata, candidates: lastCandidate ? [lastCandidate] : [] }
      : null
  }
  return clone.json().catch(() => null)
}

function countPromptCharacters(requestBody) {
  let count = 0
  const visit = (value) => {
    if (typeof value === 'string') {
      count += value.length
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (['text', 'content', 'system', 'system_instruction', 'messages', 'contents', 'parts'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(requestBody)
  return count
}

function countTools(requestBody) {
  if (Array.isArray(requestBody?.tools)) return requestBody.tools.length
  return 0
}

function safeEndpoint(url) {
  try {
    const parsed = new URL(String(url))
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return null
  }
}

async function insertLedgerRow(table, row) {
  if (typeof Deno === 'undefined') return
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error(`[provider-call-ledger] Missing Supabase credentials for ${table}`)
    return
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!response.ok) {
    console.error(`[provider-call-ledger] ${table} insert failed (${response.status}): ${await response.text().catch(() => '')}`)
  }
}

function persistWithoutExtendingUserLatency(promise) {
  const runtime = globalThis.EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise)
    return
  }
  promise.catch((error) => console.error('[provider-call-ledger] background insert failed', error))
}

async function dispatchRateLimitNotification(functionName, model, status) {
  if (status !== 429) return
  if (typeof Deno === 'undefined') return
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return

  try {
    // Check if a rate limit notification was recently created in the last 15 minutes to avoid notification storms
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/notifications?source=eq.system&type=eq.rate_limit_warning&created_at=gte.${fifteenMinutesAgo}&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (checkRes.ok) {
      const existing = await checkRes.json()
      if (Array.isArray(existing) && existing.length > 0) {
        return // Suppress duplicate alert within 15-minute window
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        type: 'rate_limit_warning',
        title: 'AI Rate Limit Reached',
        body: `Casa exceeded the request limit on ${functionName} (${model}). Backing off temporarily.`,
        source: 'system',
        read: false,
      }),
    })
  } catch (error) {
    console.error('[provider-call-ledger] failed to dispatch rate limit alert', error)
  }
}

export function createTrackedProviderFetch(baseContext) {
  return async function trackedProviderFetch(url, init, callContext = {}) {
    const startedAt = Date.now()
    const id = crypto.randomUUID()
    const requestBody = readJsonBody(init)
    const provider = callContext.provider ?? inferProvider(url)
    const model = callContext.model ?? inferModel(provider, url, requestBody)
    const promptChars = callContext.promptChars ?? countPromptCharacters(requestBody)
    try {
      const response = await fetch(url, init)
      const responseLatencyMs = Date.now() - startedAt
      const ledgerWrite = readResponsePayload(provider, response).then((payload) => {
        const usage = extractUsage(provider, payload, promptChars)
        const providerRequestId =
          response.headers.get('x-request-id')
          ?? response.headers.get('x-goog-request-id')
          ?? response.headers.get('request-id')
        if (response.status === 429) {
          persistWithoutExtendingUserLatency(dispatchRateLimitNotification(baseContext.functionName, model, response.status))
        }
        return insertLedgerRow('ai_provider_calls', {
          id,
          idempotency_key: callContext.idempotencyKey ?? id,
          provider_request_id: providerRequestId,
          correlation_id: callContext.correlationId ?? null,
          request_id: callContext.requestId ?? null,
          turn_id: callContext.turnId ?? null,
          function_name: baseContext.functionName,
          capability: baseContext.capability,
          lane: callContext.lane ?? baseContext.lane ?? null,
          call_purpose: callContext.callPurpose ?? baseContext.callPurpose ?? 'generation',
          call_index: callContext.callIndex ?? 1,
          traffic_class: callContext.trafficClass ?? baseContext.trafficClass ?? 'background',
          provider,
          model,
          endpoint: safeEndpoint(url),
          input_tokens: usage.inputTokens,
          cached_input_tokens: usage.cachedInputTokens,
          thought_tokens: usage.thoughtTokens,
          output_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
          prompt_chars: promptChars,
          tool_count: callContext.toolCount ?? countTools(requestBody),
          latency_ms: responseLatencyMs,
          status: response.ok ? 'success' : 'provider_error',
          http_status: response.status,
          finish_reason: finishReason(provider, payload),
          error_class: response.ok ? null : `http_${response.status}`,
          retry_of: callContext.retryOf ?? null,
          policy_mode: callContext.policyMode ?? null,
          policy_version: callContext.policyVersion ?? null,
          channel: callContext.channel ?? null,
          device: callContext.device ?? null,
          metadata: {},
        })
      })
      persistWithoutExtendingUserLatency(ledgerWrite)
      return response
    } catch (error) {
      persistWithoutExtendingUserLatency(insertLedgerRow('ai_provider_calls', {
        id,
        idempotency_key: callContext.idempotencyKey ?? id,
        correlation_id: callContext.correlationId ?? null,
        request_id: callContext.requestId ?? null,
        turn_id: callContext.turnId ?? null,
        function_name: baseContext.functionName,
        capability: baseContext.capability,
        lane: callContext.lane ?? baseContext.lane ?? null,
        call_purpose: callContext.callPurpose ?? baseContext.callPurpose ?? 'generation',
        call_index: callContext.callIndex ?? 1,
        traffic_class: callContext.trafficClass ?? baseContext.trafficClass ?? 'background',
        provider,
        model,
        endpoint: safeEndpoint(url),
        latency_ms: Date.now() - startedAt,
        status: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'transport_error',
        error_class: error instanceof Error ? error.name : 'unknown_transport_error',
        prompt_chars: promptChars,
        tool_count: callContext.toolCount ?? countTools(requestBody),
        metadata: {},
      }))
      throw error
    }
  }
}

export function createTrackedMapsFetch(baseContext) {
  return async function trackedMapsFetch(url, init, callContext = {}) {
    const startedAt = Date.now()
    const id = crypto.randomUUID()
    try {
      const response = await fetch(url, init)
      persistWithoutExtendingUserLatency(insertLedgerRow('maps_provider_calls', {
        id,
        idempotency_key: callContext.idempotencyKey ?? id,
        correlation_id: callContext.correlationId ?? null,
        function_name: baseContext.functionName,
        service: baseContext.service,
        sku: callContext.sku ?? baseContext.sku ?? null,
        call_purpose: callContext.callPurpose ?? baseContext.callPurpose ?? 'lookup',
        cache_outcome: 'provider',
        retry_index: callContext.retryIndex ?? 0,
        probe_count: callContext.probeCount ?? 1,
        origin_hash: callContext.originHash ?? null,
        destination_hash: callContext.destinationHash ?? null,
        time_bucket: callContext.timeBucket ?? null,
        latency_ms: Date.now() - startedAt,
        status: response.ok ? 'success' : 'provider_error',
        http_status: response.status,
        error_class: response.ok ? null : `http_${response.status}`,
        metadata: {},
      }))
      return response
    } catch (error) {
      persistWithoutExtendingUserLatency(insertLedgerRow('maps_provider_calls', {
        id,
        idempotency_key: callContext.idempotencyKey ?? id,
        correlation_id: callContext.correlationId ?? null,
        function_name: baseContext.functionName,
        service: baseContext.service,
        sku: callContext.sku ?? baseContext.sku ?? null,
        call_purpose: callContext.callPurpose ?? baseContext.callPurpose ?? 'lookup',
        cache_outcome: 'provider',
        retry_index: callContext.retryIndex ?? 0,
        probe_count: callContext.probeCount ?? 1,
        latency_ms: Date.now() - startedAt,
        status: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'transport_error',
        error_class: error instanceof Error ? error.name : 'unknown_transport_error',
        metadata: {},
      }))
      throw error
    }
  }
}

export const providerCallLedgerInternals = {
  extractUsage,
  inferModel,
  inferProvider,
}
