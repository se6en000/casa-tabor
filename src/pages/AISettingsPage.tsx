import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, CheckCircle, AlertCircle, Home, Mic, Activity, RefreshCw, Gauge, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import {
  readVoiceRuntimeConfig,
  VOICE_RUNTIME_CONFIG_KEY,
  writeVoiceRuntimeConfig,
  type VoiceDebugLevel,
  type VoiceRuntimeConfig,
} from '../lib/voiceRuntimeConfig'
import { VOICE_AUDIT_LOG_KEY } from '../lib/voiceAudit'

interface LLMConfig {
  provider: string
  model: string
  api_key: string
}

const VENDORS: Record<string, { label: string; models: { id: string; label: string; fast?: boolean }[] }> = {
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', fast: true },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', fast: true },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', fast: true },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    ],
  },
}

const DEFAULT_FAST_MODEL: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
}

const VOICE_TELEMETRY_KEY = 'casa-voice-telemetry'
const AI_LATENCY_METRICS_KEY = 'casa-ai-latency-rollup'
const AI_REGRESSION_HISTORY_KEY = 'casa-ai-regression-history-v1'

type ForensicsSnapshot = {
  windowHours: number
  totalTraces: number
  completionRate: number
  finalTranscriptRate: number
  noFinalCount: number
  stallCount: number
  invalidTransitionCount: number
  actionFailureRate: number
  llmP95Ms: number | null
  llmP99Ms: number | null
  activeDevices: number
  refreshedAt: string
}

const EMPTY_FORENSICS: ForensicsSnapshot = {
  windowHours: 24,
  totalTraces: 0,
  completionRate: 0,
  finalTranscriptRate: 0,
  noFinalCount: 0,
  stallCount: 0,
  invalidTransitionCount: 0,
  actionFailureRate: 0,
  llmP95Ms: null,
  llmP99Ms: null,
  activeDevices: 0,
  refreshedAt: new Date().toISOString(),
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx] ?? null
}

function parseOutcome(detail?: string | null): string | null {
  if (!detail) return null
  const match = detail.match(/status=([a-z_]+)/i)
  return match?.[1]?.toLowerCase() ?? null
}

type RegressionCase = {
  id: string
  phrase: string
  expectedTool: 'create_event' | 'update_event' | 'add_grocery_items'
}

type RegressionCaseResult = {
  id: string
  phrase: string
  expectedTool: RegressionCase['expectedTool']
  actualType: string
  actualTool: string | null
  latencyMs: number
  pass: boolean
  error?: string
}

type RegressionRun = {
  id: string
  at: string
  scorePct: number
  passCount: number
  totalCount: number
  avgLatencyMs: number
  results: RegressionCaseResult[]
}

const REGRESSION_CASES: RegressionCase[] = [
  {
    id: 'create-simple-appointment',
    phrase: 'Alexa add an appointment tomorrow at 9am to feed Milo',
    expectedTool: 'create_event',
  },
  {
    id: 'update-existing-event',
    phrase: 'Alexa move Feed Milo tomorrow from 9am to 10am',
    expectedTool: 'update_event',
  },
  {
    id: 'add-grocery-items',
    phrase: 'Alexa add oat milk, two avocados, and paper towels to the grocery list',
    expectedTool: 'add_grocery_items',
  },
  {
    id: 'create-evening-task',
    phrase: 'Alexa create an appointment at 7:30pm tomorrow to give Gilbert treats',
    expectedTool: 'create_event',
  },
]

export default function AISettingsPage() {
  const [config, setConfig] = useState<LLMConfig>({ provider: 'gemini', model: 'gemini-2.0-flash', api_key: '' })
  const [customInstructions, setCustomInstructions] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [voiceTelemetry, setVoiceTelemetry] = useState<{ counts: Record<string, number>; updatedAt?: string }>({ counts: {} })
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeConfig>(() => readVoiceRuntimeConfig())
  const [auditEntries, setAuditEntries] = useState(0)
  const [forensics, setForensics] = useState<ForensicsSnapshot>(EMPTY_FORENSICS)
  const [forensicsLoading, setForensicsLoading] = useState(true)
  const [forensicsError, setForensicsError] = useState<string | null>(null)
  const [regressionRunning, setRegressionRunning] = useState(false)
  const [regressionResults, setRegressionResults] = useState<RegressionCaseResult[]>([])
  const [regressionHistory, setRegressionHistory] = useState<RegressionRun[]>([])
  const [regressionError, setRegressionError] = useState<string | null>(null)
  const [localLatencyRollup] = useState<{ p95?: number; p99?: number; sampleCount?: number } | null>(() => {
    try {
      const raw = localStorage.getItem(AI_LATENCY_METRICS_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { byLane?: Record<string, number[]> }
      const llmSamples = parsed.byLane?.llm ?? []
      return {
        sampleCount: llmSamples.length,
        p95: percentile(llmSamples, 95) ?? undefined,
        p99: percentile(llmSamples, 99) ?? undefined,
      }
    } catch {
      return null
    }
  })
  const hydratedRef = useRef(false)
  const { settings: screensaverSettings, update: updateScreensaver } = useScreensaverSettings()

  const loadRegressionHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(AI_REGRESSION_HISTORY_KEY)
      if (!raw) {
        setRegressionHistory([])
        return
      }
      const parsed = JSON.parse(raw) as RegressionRun[]
      setRegressionHistory(Array.isArray(parsed) ? parsed : [])
    } catch {
      setRegressionHistory([])
    }
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'ai_custom_instructions').maybeSingle(),
    ]).then(([cfg, ci]) => {
      if (cfg.data?.value) setConfig(cfg.data.value as LLMConfig)
      const ciVal = (ci.data?.value as { text?: string } | null)?.text
      if (ciVal) setCustomInstructions(ciVal)
      setIsLoading(false)
    })
  }, [])

  const loadForensics = useCallback(async () => {
    setForensicsLoading(true)
    setForensicsError(null)
    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('ai_drawer_debug_events')
        .select('event,session_id,device_id,payload,detail')
        .gte('received_at', sinceIso)
        .order('received_at', { ascending: false })
        .limit(4000)

      if (error) throw error

      const rows = data ?? []
      const sessions = new Map<string, { hasFinal: boolean; hasSend: boolean }>()
      const devices = new Set<string>()
      const llmMs: number[] = []
      let stallCount = 0
      let invalidTransitionCount = 0
      let actionStartCount = 0
      let actionErrorCount = 0
      let noFinalFromOutcome = 0

      for (const row of rows) {
        if (typeof row.device_id === 'string' && row.device_id.trim().length > 0) {
          devices.add(row.device_id)
        }
        const sid = typeof row.session_id === 'string' && row.session_id.trim().length > 0
          ? row.session_id
          : null
        if (sid) {
          if (!sessions.has(sid)) sessions.set(sid, { hasFinal: false, hasSend: false })
          const entry = sessions.get(sid)!
          if (row.event === 'speech_trigger_final') entry.hasFinal = true
          if (row.event === 'voice_final' && typeof row.detail === 'string' && row.detail !== '__SEND__') entry.hasFinal = true
          if (row.event === 'send_current_input') entry.hasSend = true
        }

        if (row.event === 'trace_outcome') {
          const outcome = parseOutcome(row.detail)
          if (outcome === 'asr_end_no_final' || outcome === 'no_input') noFinalFromOutcome += 1
        }
        if (row.event === 'speech_listening_stall') stallCount += 1
        if (row.event === 'turn_state_invalid') invalidTransitionCount += 1
        if (row.event === 'server_execute_action_start') actionStartCount += 1
        if (row.event === 'server_execute_action_error') actionErrorCount += 1
        if (row.event === 'server_ai_assistant_result') {
          const payload = row.payload as { request_ms?: unknown } | null
          const requestMs = typeof payload?.request_ms === 'number' ? payload.request_ms : null
          if (typeof requestMs === 'number' && Number.isFinite(requestMs) && requestMs > 0) llmMs.push(requestMs)
        }
      }

      const traceValues = [...sessions.values()]
      const totalTraces = traceValues.length
      const completionCount = traceValues.filter((s) => s.hasSend).length
      const finalCount = traceValues.filter((s) => s.hasFinal).length
      const noFinalCount = totalTraces > 0 ? totalTraces - finalCount : noFinalFromOutcome
      const actionFailureRate = actionStartCount > 0 ? (actionErrorCount / actionStartCount) * 100 : 0

      setForensics({
        windowHours: 24,
        totalTraces,
        completionRate: totalTraces > 0 ? (completionCount / totalTraces) * 100 : 0,
        finalTranscriptRate: totalTraces > 0 ? (finalCount / totalTraces) * 100 : 0,
        noFinalCount,
        stallCount,
        invalidTransitionCount,
        actionFailureRate,
        llmP95Ms: percentile(llmMs, 95),
        llmP99Ms: percentile(llmMs, 99),
        activeDevices: devices.size,
        refreshedAt: new Date().toISOString(),
      })
    } catch (err) {
      setForensicsError((err as Error).message ?? 'Failed to load observability metrics')
    } finally {
      setForensicsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadForensics()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadForensics])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRegressionHistory()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadRegressionHistory])

  useEffect(() => {
    const refreshRuntime = () => {
      setVoiceRuntime(readVoiceRuntimeConfig())
      try {
        const raw = localStorage.getItem(VOICE_AUDIT_LOG_KEY)
        const entries = raw ? JSON.parse(raw) as unknown[] : []
        setAuditEntries(Array.isArray(entries) ? entries.length : 0)
      } catch {
        setAuditEntries(0)
      }
    }
    refreshRuntime()
    const onStorage = (e: StorageEvent) => {
      if (e.key === VOICE_RUNTIME_CONFIG_KEY || e.key === VOICE_AUDIT_LOG_KEY) refreshRuntime()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(VOICE_TELEMETRY_KEY)
        if (!raw) {
          setVoiceTelemetry({ counts: {} })
          return
        }

        const parsed = JSON.parse(raw) as { counts?: Record<string, number>; updatedAt?: string }
        setVoiceTelemetry({ counts: parsed.counts ?? {}, updatedAt: parsed.updatedAt })
      } catch {
        setVoiceTelemetry({ counts: {} })
      }
    }
    read()
    const timer = setInterval(read, 5000)
    const onStorage = (e: StorageEvent) => {
      if (e.key === VOICE_TELEMETRY_KEY) read()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function handleProviderChange(provider: string) {
    setConfig(c => ({ ...c, provider, model: DEFAULT_FAST_MODEL[provider] ?? '' }))
    setSaveStatus('idle')
    setTestStatus('idle')
  }

  function handleModelChange(model: string) {
    setConfig(c => ({ ...c, model }))
    setSaveStatus('idle')
    setTestStatus('idle')
  }

  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    const updatedAt = new Date().toISOString()
    const [a, b] = await Promise.all([
      supabase.from('settings').upsert(
        { key: 'llm_config', value: config, updated_at: updatedAt },
        { onConflict: 'key' }
      ),
      supabase.from('settings').upsert(
        { key: 'ai_custom_instructions', value: { text: customInstructions.trim() }, updated_at: updatedAt },
        { onConflict: 'key' }
      ),
    ])
    setSaveStatus(a.error || b.error ? 'error' : 'saved')
    if (!a.error && !b.error) setTimeout(() => setSaveStatus('idle'), 3000)
  }, [config, customInstructions])

  useEffect(() => {
    if (isLoading) return
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    setSaveStatus('saving')
    const t = setTimeout(() => {
      handleSave()
    }, 700)
    return () => clearTimeout(t)
  }, [config, customInstructions, isLoading, handleSave])

  async function handleTest() {
    setTestStatus('testing')
    setTestMessage('')
    try {
      // Save first so the function picks up the latest config
      await supabase.from('settings').upsert({ key: 'llm_config', value: config, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      const { data, error } = await supabase.functions.invoke('generate-briefing')
      if (error) throw error
      setTestStatus('ok')
      setTestMessage(`Generated successfully using ${data?.briefing?.generated_by ?? config.provider}`)
    } catch (err) {
      setTestStatus('fail')
      setTestMessage((err as Error).message)
    }
  }

  async function runSyntheticRegressionHarness() {
    if (regressionRunning) return
    setRegressionRunning(true)
    setRegressionError(null)
    setRegressionResults([])
    const now = new Date()
    const traceId = `regression-${Date.now().toString(36)}`
    const syntheticContext = {
      page: 'app',
      currentDate: now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
      utcOffset: '-04:00',
      homeCity: 'West Palm Beach',
      ambiguousTimeDefaultMeridiem: 'PM',
      family: [{ id: 'member-jake', name: 'Jake' }],
      events: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Jake | Feed Milo',
          start_time: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          end_time: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString(),
          updated_at: now.toISOString(),
          location_name: null,
          members: ['Jake'],
          category: 'appointment',
        },
      ],
    }

    const results: RegressionCaseResult[] = []
    try {
      for (const testCase of REGRESSION_CASES) {
        const started = performance.now()
        const correlationId = `${traceId}:${testCase.id}:${Date.now().toString(36)}`
        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: {
            messages: [{ role: 'user', content: testCase.phrase }],
            context: syntheticContext,
            correlation_id: correlationId,
            trace_id: traceId,
            turn_id: `turn-${testCase.id}`,
            lane: 'regression',
            dry_run: true,
          },
        })
        const latencyMs = Math.round(performance.now() - started)
        const actualType = typeof data?.type === 'string' ? data.type : 'unknown'
        const actualTool = typeof data?.tool === 'string' ? data.tool : null
        const invokeError = error?.message
          ?? (actualType === 'error' ? (typeof data?.message === 'string' ? data.message : 'assistant_error') : undefined)
        const pass = !invokeError && actualType === 'tool_action' && actualTool === testCase.expectedTool

        const result: RegressionCaseResult = {
          id: testCase.id,
          phrase: testCase.phrase,
          expectedTool: testCase.expectedTool,
          actualType,
          actualTool,
          latencyMs,
          pass,
          error: invokeError ?? (pass ? undefined : `expected ${testCase.expectedTool}, got ${actualType}:${actualTool ?? 'none'}`),
        }
        results.push(result)
        setRegressionResults([...results])
      }

      const passCount = results.filter((r) => r.pass).length
      const avgLatencyMs = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length)
        : 0
      const run: RegressionRun = {
        id: `run-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        scorePct: results.length > 0 ? Math.round((passCount / results.length) * 100) : 0,
        passCount,
        totalCount: results.length,
        avgLatencyMs,
        results,
      }
      const nextHistory = [run, ...regressionHistory].slice(0, 25)
      setRegressionHistory(nextHistory)
      localStorage.setItem(AI_REGRESSION_HISTORY_KEY, JSON.stringify(nextHistory))
    } catch (err) {
      setRegressionError((err as Error).message ?? 'Failed to run regression harness')
    } finally {
      setRegressionRunning(false)
    }
  }

  const vendor = VENDORS[config.provider]
  const models = vendor?.models ?? []

  function setWakeWordSensitivity(next: number) {
    updateScreensaver({ wakeWordSensitivity: next })
    fetch('http://127.0.0.1:8766/wake-sensitivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: next }),
    }).catch(() => {})
  }

  function setVoiceDebugLevel(debugLevel: VoiceDebugLevel) {
    const next = writeVoiceRuntimeConfig({ debugLevel })
    setVoiceRuntime(next)
  }

  function setVoiceAuditEnabled(auditEnabled: boolean) {
    const next = writeVoiceRuntimeConfig({ auditEnabled })
    setVoiceRuntime(next)
  }

  function setVoiceCoreV2Enabled(coreV2Enabled: boolean) {
    const next = writeVoiceRuntimeConfig({ coreV2Enabled })
    setVoiceRuntime(next)
  }

  if (isLoading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  return (
    <>
      <h1 className="font-display text-display-md text-casa-navy mb-1">AI Settings</h1>
      <p className="text-body text-casa-muted mb-6">
        Choose your AI vendor and model. A fast, low-cost model is recommended — briefings don't need heavy reasoning.
      </p>

      <div className="space-y-4">
        {/* Vendor */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <label className="block text-body-sm font-semibold text-casa-navy">AI Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(VENDORS).map(([key, v]) => (
              <button
                key={key}
                onClick={() => handleProviderChange(key)}
                className={cn(
                  'py-2 px-3 rounded-button border text-body-sm font-medium transition-all',
                  config.provider === key
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white border-casa-border text-casa-navy hover:bg-casa-bg',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <label className="block text-body-sm font-semibold text-casa-navy">Model</label>
          <div className="space-y-2">
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => handleModelChange(m.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-button border text-left transition-all',
                  config.model === m.id
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white border-casa-border text-casa-navy hover:bg-casa-bg',
                )}
              >
                <span className="text-body-sm font-medium">{m.label}</span>
                {m.fast && (
                  <span className={cn(
                    'text-caption px-1.5 py-0.5 rounded font-semibold',
                    config.model === m.id ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700',
                  )}>
                    ⚡ Fast
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-2">
          <label className="block text-body-sm font-semibold text-casa-navy">
            API Key <span className="text-casa-muted font-normal">({vendor?.label})</span>
          </label>
          <input
            type="password"
            value={config.api_key}
            onChange={e => { setConfig(c => ({ ...c, api_key: e.target.value })); setSaveStatus('idle'); setTestStatus('idle') }}
            placeholder="Paste your API key here"
            className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20 font-mono"
          />
          <p className="text-caption text-casa-muted">Stored securely server-side. Never sent to the browser.</p>
        </div>

        {/* Custom AI rules — persistent across all chats */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-2">
          <label className="block text-body-sm font-semibold text-casa-navy">
            Your Custom Rules
          </label>
          <p className="text-caption text-casa-muted">
            Plain-English rules the AI applies to every chat. Examples: "Default to mornings before 11am", "Never schedule during 5–7pm dinner", "Soccer is always at Phipps Park".
          </p>
          <textarea
            value={customInstructions}
            onChange={(e) => { setCustomInstructions(e.target.value); setSaveStatus('idle') }}
            rows={6}
            placeholder="One rule per line, in your own words. Saved instantly to every conversation."
            className="w-full rounded-button border border-casa-border bg-white px-3 py-2 text-body-sm text-casa-navy focus:outline-none focus:border-casa-gold resize-y font-mono"
          />
        </div>

        {/* Wake Word Sensitivity */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Mic size={15} className="text-casa-gold" />
            <label className="text-body-sm font-semibold text-casa-navy">Wake Word — "Alexa"</label>
          </div>

          <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3 space-y-3">
            <p className="text-body-sm font-semibold text-casa-navy">Voice Runtime Controls</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setVoiceDebugLevel('off')}
                className={cn(
                  'rounded-button border px-2.5 py-2 text-caption font-semibold transition-colors',
                  voiceRuntime.debugLevel === 'off'
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-navy border-casa-border hover:bg-casa-bg',
                )}
              >
                Debug Off
              </button>
              <button
                type="button"
                onClick={() => setVoiceDebugLevel('minimal')}
                className={cn(
                  'rounded-button border px-2.5 py-2 text-caption font-semibold transition-colors',
                  voiceRuntime.debugLevel === 'minimal'
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-navy border-casa-border hover:bg-casa-bg',
                )}
              >
                Debug Minimal
              </button>
              <button
                type="button"
                onClick={() => setVoiceDebugLevel('verbose')}
                className={cn(
                  'rounded-button border px-2.5 py-2 text-caption font-semibold transition-colors',
                  voiceRuntime.debugLevel === 'verbose'
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-navy border-casa-border hover:bg-casa-bg',
                )}
              >
                Debug Verbose
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setVoiceAuditEnabled(!voiceRuntime.auditEnabled)}
                className={cn(
                  'rounded-button border px-2.5 py-2 text-caption font-semibold transition-colors',
                  voiceRuntime.auditEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-casa-navy border-casa-border hover:bg-casa-bg',
                )}
              >
                Audit Trail: {voiceRuntime.auditEnabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                type="button"
                onClick={() => setVoiceCoreV2Enabled(!voiceRuntime.coreV2Enabled)}
                className={cn(
                  'rounded-button border px-2.5 py-2 text-caption font-semibold transition-colors',
                  voiceRuntime.coreV2Enabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-casa-navy border-casa-border hover:bg-casa-bg',
                )}
              >
                Voice Core V2: {voiceRuntime.coreV2Enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <p className="text-caption text-casa-muted">
              Audit entries on this device: <span className="font-semibold text-casa-navy">{auditEntries}</span>
            </p>
          </div>

          {/* Voice Quality Telemetry */}
          <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
            <div className="flex items-center gap-2">
              <Mic size={15} className="text-casa-gold" />
              <label className="text-body-sm font-semibold text-casa-navy">Voice Quality Telemetry</label>
            </div>
            <p className="text-caption text-casa-muted">
              Local on-device counters to tune wake reliability and auto-dismiss behavior.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-caption">
              <Metric label="Wake starts" value={voiceTelemetry.counts.wake_session_started ?? 0} />
              <Metric label="Wake success" value={voiceTelemetry.counts.wake_session_success ?? 0} />
              <Metric label="Wake misfires" value={voiceTelemetry.counts.wake_misfire_autodismiss ?? 0} />
              <Metric label="Inactivity closes" value={voiceTelemetry.counts.inactivity_autodismiss ?? 0} />
              <Metric label="Bridge offline" value={voiceTelemetry.counts.bridge_offline ?? 0} />
              <Metric label="Retries tapped" value={voiceTelemetry.counts.retry_last_clicked ?? 0} />
            </div>
            <p className="text-caption text-casa-muted">
              Last updated: {voiceTelemetry.updatedAt ? new Date(voiceTelemetry.updatedAt).toLocaleString() : '—'}
            </p>
          </div>

          {/* Expert AI Optimization Dashboard */}
          <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge size={15} className="text-casa-gold" />
                <label className="text-body-sm font-semibold text-casa-navy">AI Optimization Dashboard (24h)</label>
              </div>
              <button
                type="button"
                onClick={() => void loadForensics()}
                className="inline-flex items-center gap-1.5 rounded-button border border-casa-border bg-white px-2.5 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg"
              >
                <RefreshCw size={12} className={cn(forensicsLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>
            <p className="text-caption text-casa-muted">
              End-to-end quality signals from centralized AI traces: capture quality, completion, latency, action reliability, and state-machine stability.
            </p>
            {forensicsError ? (
              <div className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-caption text-casa-error">
                Could not load forensic metrics: {forensicsError}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-caption">
                <Metric label="Traces" value={forensics.totalTraces} />
                <Metric label="Completion %" value={Math.round(forensics.completionRate)} />
                <Metric label="Final transcript %" value={Math.round(forensics.finalTranscriptRate)} />
                <Metric label="Active devices" value={forensics.activeDevices} />
                <Metric label="No-final turns" value={forensics.noFinalCount} />
                <Metric label="Listening stalls" value={forensics.stallCount} />
                <Metric label="Invalid transitions" value={forensics.invalidTransitionCount} />
                <Metric label="Action failure %" value={Math.round(forensics.actionFailureRate)} />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption">
              <div className="rounded-button border border-casa-border bg-casa-bg/60 px-2.5 py-2">
                <p className="text-casa-muted">LLM latency P95/P99 (server)</p>
                <p className="text-body-sm font-semibold text-casa-navy tabular-nums">
                  {forensics.llmP95Ms !== null ? `${Math.round(forensics.llmP95Ms)}ms` : '—'} / {forensics.llmP99Ms !== null ? `${Math.round(forensics.llmP99Ms)}ms` : '—'}
                </p>
              </div>
              <div className="rounded-button border border-casa-border bg-casa-bg/60 px-2.5 py-2">
                <p className="text-casa-muted">LLM latency P95/P99 (this device)</p>
                <p className="text-body-sm font-semibold text-casa-navy tabular-nums">
                  {localLatencyRollup?.p95 ? `${Math.round(localLatencyRollup.p95)}ms` : '—'} / {localLatencyRollup?.p99 ? `${Math.round(localLatencyRollup.p99)}ms` : '—'}
                  {localLatencyRollup?.sampleCount ? ` · n=${localLatencyRollup.sampleCount}` : ''}
                </p>
              </div>
            </div>
            <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3">
              <p className="text-caption font-semibold text-casa-navy mb-1">Expert roadmap progress</p>
              <ul className="space-y-1 text-caption text-casa-muted">
                <li className="flex items-start gap-1.5"><Activity size={12} className="mt-0.5 text-emerald-600" /> Trace completeness + outcome diagnostics: <span className="font-semibold text-casa-navy">Live</span></li>
                <li className="flex items-start gap-1.5"><BarChart3 size={12} className="mt-0.5 text-emerald-600" /> SLO surface in Settings: <span className="font-semibold text-casa-navy">Live</span></li>
                <li className="flex items-start gap-1.5"><BarChart3 size={12} className="mt-0.5 text-emerald-600" /> Synthetic phrase regression harness: <span className="font-semibold text-casa-navy">Live</span></li>
                <li className="flex items-start gap-1.5"><Activity size={12} className="mt-0.5 text-casa-muted" /> Automated anomaly scoring + alert routing: <span className="font-semibold text-casa-navy">Next</span></li>
              </ul>
            </div>
            <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption font-semibold text-casa-navy">Synthetic Phrase Regression Harness</p>
                <button
                  type="button"
                  onClick={() => void runSyntheticRegressionHarness()}
                  disabled={regressionRunning}
                  className="inline-flex items-center gap-1.5 rounded-button border border-casa-border bg-white px-2.5 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg disabled:opacity-50"
                >
                  <FlaskConical size={12} className={cn(regressionRunning && 'animate-spin')} />
                  {regressionRunning ? 'Running…' : 'Run 4-case pack'}
                </button>
              </div>
              <p className="text-caption text-casa-muted">
                Dry-run evaluation of parser and tool routing quality without creating/updating real data.
              </p>
              {regressionError && (
                <div className="rounded-button border border-red-200 bg-red-50 px-2.5 py-2 text-caption text-casa-error">
                  {regressionError}
                </div>
              )}
              {regressionResults.length > 0 && (
                <div className="rounded-button border border-casa-border bg-white overflow-hidden">
                  {regressionResults.map((result) => (
                    <div key={result.id} className="flex items-center justify-between gap-2 border-b last:border-b-0 border-casa-border px-2.5 py-2 text-caption">
                      <div className="min-w-0">
                        <p className="font-semibold text-casa-navy truncate">{result.phrase}</p>
                        <p className="text-casa-muted">expected: {result.expectedTool} · actual: {result.actualType}{result.actualTool ? `/${result.actualTool}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('font-semibold', result.pass ? 'text-emerald-700' : 'text-casa-error')}>{result.pass ? 'PASS' : 'FAIL'}</p>
                        <p className="text-casa-muted tabular-nums">{result.latencyMs}ms</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {regressionHistory.length > 0 && (
                <div className="rounded-button border border-casa-border bg-white px-2.5 py-2 text-caption text-casa-muted">
                  Latest score: <span className="font-semibold text-casa-navy">{regressionHistory[0].scorePct}%</span>
                  {' · '}
                  {regressionHistory[0].passCount}/{regressionHistory[0].totalCount} passing
                  {' · '}
                  avg {regressionHistory[0].avgLatencyMs}ms
                  <br />
                  Previous: {regressionHistory.slice(1, 4).map((run) => `${run.scorePct}%`).join(' · ') || '—'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/settings/status" className="rounded-button border border-casa-border bg-white px-3 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg">
                Open Status Dashboard
              </Link>
              <Link to="/settings/analytics" className="rounded-button border border-casa-border bg-white px-3 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg">
                Open Data & Analytics
              </Link>
            </div>
            <p className="text-caption text-casa-muted">
              Refreshed: {new Date(forensics.refreshedAt).toLocaleString()}
            </p>
          </div>
          <p className="text-caption text-casa-muted">
            How confidently the mic must hear "Alexa" before activating.{' '}
            Lower = triggers more easily (more false positives). Higher = requires a clearer utterance.
          </p>
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <p className="text-body-sm font-medium text-casa-navy">Sensitivity</p>
              <p className="text-caption text-casa-muted mt-0.5">
                {screensaverSettings.wakeWordSensitivity <= 0.15 ? 'Very sensitive — fires easily' :
                 screensaverSettings.wakeWordSensitivity <= 0.25 ? 'Balanced (default)' :
                 screensaverSettings.wakeWordSensitivity <= 0.35 ? 'Slightly strict — speak clearly' :
                 screensaverSettings.wakeWordSensitivity <= 0.45 ? 'Strict — speak clearly' :
                 screensaverSettings.wakeWordSensitivity <= 0.70 ? 'Very strict — nearly shout-level' :
                 'Maximum strictness — only very clear wake words'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const next = Math.max(0.10, Math.round((screensaverSettings.wakeWordSensitivity - 0.05) * 100) / 100)
                  setWakeWordSensitivity(next)
                }}
                className="w-8 h-8 rounded-button border border-casa-border bg-white text-casa-navy font-semibold text-lg flex items-center justify-center hover:bg-casa-bg active:scale-95 transition-all"
              >−</button>
              <span className="w-14 text-center text-body-sm font-semibold text-casa-navy tabular-nums">
                {Math.round(screensaverSettings.wakeWordSensitivity * 100)}%
              </span>
              <button
                onClick={() => {
                  const next = Math.min(0.90, Math.round((screensaverSettings.wakeWordSensitivity + 0.05) * 100) / 100)
                  setWakeWordSensitivity(next)
                }}
                className="w-8 h-8 rounded-button border border-casa-border bg-white text-casa-navy font-semibold text-lg flex items-center justify-center hover:bg-casa-bg active:scale-95 transition-all"
              >+</button>
            </div>
          </div>
        </div>

        {/* Home Address — managed in Home settings */}
        <Link
          to="/settings/home"
          className="flex items-center gap-3 bg-casa-bg/60 rounded-card border border-casa-border/50 p-4 hover:bg-casa-bg transition-colors"
        >
          <Home size={16} className="text-casa-gold shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-casa-navy">Home Address</p>
            <p className="text-caption text-casa-muted mt-0.5">Manage in Home settings →</p>
          </div>
        </Link>

        {/* Test result */}
        {testStatus !== 'idle' && (
          <div className={cn(
            'flex items-start gap-2 px-4 py-3 rounded-button border text-body-sm',
            testStatus === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-casa-error',
          )}>
            {testStatus === 'ok' ? <CheckCircle size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
            <span>{testStatus === 'testing' ? 'Testing…' : testMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleTest}
            disabled={!config.api_key || testStatus === 'testing'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-bg disabled:opacity-40 transition-colors"
          >
            <FlaskConical size={14} className={cn(testStatus === 'testing' && 'animate-spin')} />
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {saveStatus === 'saving' && (
          <p className="text-caption text-casa-muted text-right">Saving…</p>
        )}
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-button border border-casa-border bg-casa-bg/60 px-2.5 py-2">
      <p className="text-casa-muted">{label}</p>
      <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{value}</p>
    </div>
  )
}
