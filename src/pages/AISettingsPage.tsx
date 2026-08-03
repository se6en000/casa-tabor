import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, CheckCircle, AlertCircle, Home, Mic, Activity, RefreshCw, Gauge, BarChart3, Minus, Plus } from 'lucide-react'
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
import { Button, Chip, IconButton, SegmentedControl, SkeletonRow, Switch } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import type { AIMemoryObservation } from '../types'

interface LLMConfig {
  provider: string
  model: string
  api_key: string
}

interface AIMemoryCaptureConfig {
  enabled: boolean
  passiveSignalsEnabled: boolean
  autoCaptureBugs: boolean
}

type ModelOption = {
  id: string
  label: string
  group?: 'Recommended' | 'Advanced / Preview' | 'Latest aliases' | 'Legacy'
  speed?: 'Fastest' | 'Fast' | 'Balanced'
  reasoning?: 'Everyday' | 'Advanced' | 'Deep'
  description?: string
  fast?: boolean
}

const VENDORS: Record<string, { label: string; models: ModelOption[] }> = {
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', group: 'Recommended', speed: 'Fast', reasoning: 'Advanced', description: 'Best production balance for Casa voice, tools, and everyday planning.' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', group: 'Recommended', speed: 'Fastest', reasoning: 'Everyday', description: 'Lowest latency and cost for simple household requests.' },
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

const PROVIDER_OPTIONS = [
  { value: 'gemini', label: VENDORS.gemini.label },
  { value: 'openai', label: VENDORS.openai.label },
  { value: 'anthropic', label: VENDORS.anthropic.label },
] as const

const VOICE_DEBUG_OPTIONS = [
  { value: 'off', label: 'Debug Off' },
  { value: 'minimal', label: 'Debug Minimal' },
  { value: 'verbose', label: 'Debug Verbose' },
] as const

const DEFAULT_FAST_MODEL: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
}

const VOICE_TELEMETRY_KEY = 'casa-voice-telemetry'
const AI_LATENCY_METRICS_KEY = 'casa-ai-latency-rollup'
const AI_REGRESSION_HISTORY_KEY = 'casa-ai-regression-history-v1'
const DEFAULT_MEMORY_CAPTURE_CONFIG: AIMemoryCaptureConfig = {
  enabled: false,
  passiveSignalsEnabled: false,
  autoCaptureBugs: false,
}

type ForensicsSnapshot = {
  windowHours: number
  totalTraces: number
  startedTraceCount: number
  terminalTraceCount: number
  completionRate: number
  terminalRate: number
  finalTranscriptRate: number
  noFinalCount: number
  serverOnlySessions: number
  missingTerminalSessions: number
  stallCount: number
  invalidTransitionCount: number
  actionFailureRate: number
  llmP95Ms: number | null
  llmP99Ms: number | null
  wakeToDrawerP95Ms: number | null
  asrP95Ms: number | null
  firstTokenP95Ms: number | null
  activeDevices: number
  refreshedAt: string
}

const EMPTY_FORENSICS: ForensicsSnapshot = {
  windowHours: 24,
  totalTraces: 0,
  startedTraceCount: 0,
  terminalTraceCount: 0,
  completionRate: 0,
  terminalRate: 0,
  finalTranscriptRate: 0,
  noFinalCount: 0,
  serverOnlySessions: 0,
  missingTerminalSessions: 0,
  stallCount: 0,
  invalidTransitionCount: 0,
  actionFailureRate: 0,
  llmP95Ms: null,
  llmP99Ms: null,
  wakeToDrawerP95Ms: null,
  asrP95Ms: null,
  firstTokenP95Ms: null,
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
  const [memoryCapture, setMemoryCapture] = useState<AIMemoryCaptureConfig>(DEFAULT_MEMORY_CAPTURE_CONFIG)
  const [memoryObservations, setMemoryObservations] = useState<AIMemoryObservation[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState<string | null>(null)
  const [newObservationTitle, setNewObservationTitle] = useState('')
  const [newObservationDetails, setNewObservationDetails] = useState('')
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

  const loadMemoryObservations = useCallback(async () => {
    setMemoryLoading(true)
    setMemoryError(null)
    const obs = await supabase
      .from('ai_memory_observations')
      .select('*')
      .order('observed_at', { ascending: false })
      .limit(12)
    if (obs.error) setMemoryError(obs.error.message)
    else setMemoryObservations((obs.data ?? []) as AIMemoryObservation[])
    setMemoryLoading(false)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'ai_custom_instructions').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'ai_memory_capture_config').maybeSingle(),
    ]).then(([cfg, ci, memoryCfg]) => {
      if (cfg.data?.value) setConfig(cfg.data.value as LLMConfig)
      const ciVal = (ci.data?.value as { text?: string } | null)?.text
      if (ciVal) setCustomInstructions(ciVal)
      if (memoryCfg.data?.value && typeof memoryCfg.data.value === 'object') {
        setMemoryCapture({
          ...DEFAULT_MEMORY_CAPTURE_CONFIG,
          ...(memoryCfg.data.value as Partial<AIMemoryCaptureConfig>),
        })
      }
      setIsLoading(false)
      void loadMemoryObservations()
    })
  }, [loadMemoryObservations])

  const loadForensics = useCallback(async () => {
    setForensicsLoading(true)
    setForensicsError(null)
    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('ai_drawer_debug_events')
        .select('event,session_id,device_id,payload,detail,elapsed_ms')
        .gte('received_at', sinceIso)
        .order('received_at', { ascending: false })
        .limit(4000)

      if (error) throw error

      const rows = data ?? []
      const sessions = new Map<string, { hasFinal: boolean; hasSend: boolean; hasStart: boolean; hasTerminal: boolean; hasServer: boolean }>()
      const devices = new Set<string>()
      const llmMs: number[] = []
      const wakeToDrawerMs: number[] = []
      const asrMs: number[] = []
      const firstTokenMs: number[] = []
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
          if (!sessions.has(sid)) sessions.set(sid, { hasFinal: false, hasSend: false, hasStart: false, hasTerminal: false, hasServer: false })
          const entry = sessions.get(sid)!
          if (row.event === 'trace_started' || row.event === 'drawer_opened') entry.hasStart = true
          if (row.event === 'turn_completed' || row.event === 'turn_failed' || row.event === 'turn_aborted' || row.event === 'turn_timeout' || row.event === 'asr_no_final' || row.event === 'trace_outcome') entry.hasTerminal = true
          if (typeof row.event === 'string' && row.event.startsWith('server_')) entry.hasServer = true
          if (row.event === 'speech_trigger_final' || row.event === 'asr_final') entry.hasFinal = true
          if (row.event === 'voice_final' && typeof row.detail === 'string' && row.detail !== '__SEND__') entry.hasFinal = true
          if (row.event === 'send_current_input' || row.event === 'assistant_invoke_started' || row.event === 'assistant_fast_path_matched') entry.hasSend = true
        }

        const payload = row.payload as Record<string, unknown> | null
        if (row.event === 'drawer_opened' && typeof payload?.wake_to_drawer_ms === 'number') {
          wakeToDrawerMs.push(payload.wake_to_drawer_ms)
        }
        if (row.event === 'asr_final' && typeof payload?.asr_elapsed_ms === 'number') {
          asrMs.push(payload.asr_elapsed_ms)
        }
        if (row.event === 'assistant_first_token' && typeof row.elapsed_ms === 'number') {
          firstTokenMs.push(row.elapsed_ms)
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
      const startedTraceCount = traceValues.filter((s) => s.hasStart).length
      const terminalTraceCount = traceValues.filter((s) => s.hasTerminal).length
      const serverOnlySessions = traceValues.filter((s) => s.hasServer && !s.hasStart).length
      const missingTerminalSessions = traceValues.filter((s) => s.hasStart && !s.hasTerminal).length
      const noFinalCount = totalTraces > 0 ? totalTraces - finalCount : noFinalFromOutcome
      const actionFailureRate = actionStartCount > 0 ? (actionErrorCount / actionStartCount) * 100 : 0

      setForensics({
        windowHours: 24,
        totalTraces,
        startedTraceCount,
        terminalTraceCount,
        completionRate: totalTraces > 0 ? (completionCount / totalTraces) * 100 : 0,
        terminalRate: startedTraceCount > 0 ? (terminalTraceCount / startedTraceCount) * 100 : 0,
        finalTranscriptRate: totalTraces > 0 ? (finalCount / totalTraces) * 100 : 0,
        noFinalCount,
        serverOnlySessions,
        missingTerminalSessions,
        stallCount,
        invalidTransitionCount,
        actionFailureRate,
        llmP95Ms: percentile(llmMs, 95),
        llmP99Ms: percentile(llmMs, 99),
        wakeToDrawerP95Ms: percentile(wakeToDrawerMs, 95),
        asrP95Ms: percentile(asrMs, 95),
        firstTokenP95Ms: percentile(firstTokenMs, 95),
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
    const [a, b, c] = await Promise.all([
      supabase.from('settings').upsert(
        { key: 'llm_config', value: config, updated_at: updatedAt },
        { onConflict: 'key' }
      ),
      supabase.from('settings').upsert(
        { key: 'ai_custom_instructions', value: { text: customInstructions.trim() }, updated_at: updatedAt },
        { onConflict: 'key' }
      ),
      supabase.from('settings').upsert(
        { key: 'ai_memory_capture_config', value: memoryCapture, updated_at: updatedAt },
        { onConflict: 'key' }
      ),
    ])
    setSaveStatus(a.error || b.error || c.error ? 'error' : 'saved')
    if (!a.error && !b.error && !c.error) setTimeout(() => setSaveStatus('idle'), 3000)
  }, [config, customInstructions, memoryCapture])

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
  }, [config, customInstructions, memoryCapture, isLoading, handleSave])

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
      currentDate: now.toISOString(),
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
  const modelGroups = Array.from(new Set(models.map(model => model.group).filter(Boolean))) as NonNullable<ModelOption['group']>[]

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

  async function addObservation() {
    const title = newObservationTitle.trim()
    if (!title) return
    setMemoryError(null)
    const { error } = await supabase.from('ai_memory_observations').insert({
      title,
      details: newObservationDetails.trim() || null,
      category: 'operational',
      source: 'user',
      status: 'review',
      confidence: null,
    })
    if (error) {
      setMemoryError(error.message)
      return
    }
    setNewObservationTitle('')
    setNewObservationDetails('')
    await loadMemoryObservations()
  }

  async function updateObservationStatus(id: string, status: AIMemoryObservation['status']) {
    setMemoryError(null)
    const { error } = await supabase
      .from('ai_memory_observations')
      .update({ status })
      .eq('id', id)
    if (error) {
      setMemoryError(error.message)
      return
    }
    setMemoryObservations((rows) => rows.map((row) => (row.id === id ? { ...row, status } : row)))
  }


  if (isLoading) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

  return (
    <>
      <SettingsPageHeader title="AI Settings" description="Choose the provider, model, and voice runtime. Fast, low-cost models work best for briefings." />

      <div className="mt-6 space-y-4">
        {/* Vendor */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <p className="text-body-sm font-semibold text-casa-navy">AI Provider</p>
          <SegmentedControl
            aria-label="AI provider"
            value={config.provider}
            options={PROVIDER_OPTIONS}
            onChange={handleProviderChange}
            fullWidth
          />
        </div>

        {/* Model */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <label className="block text-body-sm font-semibold text-casa-navy">Model</label>
          {config.provider === 'gemini' && (
            <p className="text-caption text-casa-muted">
              Models shown here support Casa's conversational API and tool contract. Image, TTS, robotics, and computer-use models are intentionally excluded.
            </p>
          )}
          <div className="space-y-4">
            {(modelGroups.length > 0 ? modelGroups : [undefined]).map(group => (
              <div key={group ?? 'models'} className="space-y-2">
                {group && <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">{group}</p>}
                {models.filter(model => model.group === group || !group).map(m => (
                  <Button
                    key={m.id}
                    variant={config.model === m.id ? 'strong' : 'secondary'}
                    onClick={() => handleModelChange(m.id)}
                    fullWidth
                    align="between"
                    aria-pressed={config.model === m.id}
                    className="h-auto min-h-control py-3"
                  >
                    <span className="min-w-0 text-left">
                      <span className="block text-body-sm font-medium">{m.label}</span>
                      {m.description && <span className="mt-0.5 block text-caption font-normal opacity-80">{m.description}</span>}
                    </span>
                    {(m.speed || m.reasoning) && (
                      <span className="ml-3 flex shrink-0 flex-wrap justify-end gap-1">
                        {m.speed && <Chip size="sm" tone={m.speed === 'Fastest' ? 'success' : 'neutral'}>{m.speed}</Chip>}
                        {m.reasoning && <Chip size="sm" tone={m.reasoning === 'Deep' ? 'accent' : 'info'}>{m.reasoning}</Chip>}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
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

        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-casa-navy">AI Memory</p>
            <Button variant="secondary" size="sm" onClick={() => void loadMemoryObservations()} leadingIcon={<RefreshCw size={14} />}>
              Refresh
            </Button>
          </div>
          <p className="text-caption text-casa-muted">
            Memory is explicit and reviewable: no hidden spying. Casa only keeps observations you approve.
          </p>
          <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3 space-y-3">
            <Switch
              label="Enable AI memory capture"
              description="Allow Casa to store approved habits/preferences and operational observations."
              checked={memoryCapture.enabled}
              onCheckedChange={(enabled) => setMemoryCapture((current) => ({ ...current, enabled }))}
            />
            <Switch
              label="Allow passive signal suggestions"
              description="Surface suggested observations from app activity for your review."
              checked={memoryCapture.passiveSignalsEnabled}
              onCheckedChange={(passiveSignalsEnabled) => setMemoryCapture((current) => ({ ...current, passiveSignalsEnabled }))}
            />
          </div>
          <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3 space-y-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">New learning observation</p>
            <input
              value={newObservationTitle}
              onChange={(e) => setNewObservationTitle(e.target.value)}
              placeholder="Example: Owen focuses better after snack + 20 min reset"
              className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
            <textarea
              value={newObservationDetails}
              onChange={(e) => setNewObservationDetails(e.target.value)}
              rows={3}
              placeholder="Optional detail/context"
              className="w-full rounded-button border border-casa-border bg-white px-3 py-2 text-body-sm text-casa-navy focus:outline-none focus:border-casa-gold resize-y"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!newObservationTitle.trim()}
              onClick={() => void addObservation()}
            >
              Save observation
            </Button>
            {memoryError && <p className="text-caption text-casa-error">{memoryError}</p>}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {memoryLoading ? (
                <SkeletonRow />
              ) : memoryObservations.length === 0 ? (
                <p className="text-caption text-casa-muted">No observations yet.</p>
              ) : memoryObservations.map((observation) => (
                <div key={observation.id} className="rounded-button border border-casa-border bg-white p-2.5 space-y-1">
                  <p className="text-body-sm font-semibold text-casa-navy">{observation.title}</p>
                  {observation.details && <p className="text-caption text-casa-muted">{observation.details}</p>}
                  <div className="flex items-center gap-1.5">
                    <Chip size="sm" tone="neutral">{observation.status}</Chip>
                    <Button variant="ghost" size="sm" onClick={() => void updateObservationStatus(observation.id, 'active')}>Active</Button>
                    <Button variant="ghost" size="sm" onClick={() => void updateObservationStatus(observation.id, 'archived')}>Archive</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3">
            <p className="text-caption text-casa-muted">
              Bug intake/triage has moved to its own menu for cleaner workflow.
            </p>
            <Link to="/settings/bug-tracker" className="inline-flex mt-2 rounded-button border border-casa-border bg-white px-3 py-1.5 text-caption font-semibold text-casa-navy hover:bg-casa-bg">
              Open Bug Tracker
            </Link>
          </div>
        </div>

        {/* Wake Word Sensitivity */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Mic size={15} className="text-casa-gold" />
            <label className="text-body-sm font-semibold text-casa-navy">Wake Word — "Alexa"</label>
          </div>

          {/* Enable / disable wake word */}
          <Switch
            label="Listen for wake word"
            description={screensaverSettings.wakeWordEnabled
              ? 'Say "Alexa" to open the AI assistant'
              : 'Wake word disabled — use the ✨ button to open'}
            checked={screensaverSettings.wakeWordEnabled}
            onCheckedChange={(wakeWordEnabled) => updateScreensaver({ wakeWordEnabled })}
          />

          <div className="rounded-card border border-casa-border bg-casa-bg/60 p-3 space-y-3">
            <p className="text-body-sm font-semibold text-casa-navy">Voice Runtime Controls</p>
            <SegmentedControl
              aria-label="Voice debug level"
              value={voiceRuntime.debugLevel}
              options={VOICE_DEBUG_OPTIONS}
              onChange={setVoiceDebugLevel}
              fullWidth
            />
            <Switch
              label="Audit trail"
              description="Keep local diagnostic entries for voice reliability analysis."
              checked={voiceRuntime.auditEnabled}
              onCheckedChange={setVoiceAuditEnabled}
            />
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
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void loadForensics()}
                leadingIcon={<RefreshCw size={14} className={cn(forensicsLoading && 'animate-spin')} />}
              >
                Refresh
              </Button>
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
                <Metric label="Trace starts" value={forensics.startedTraceCount} />
                <Metric label="Terminal %" value={Math.round(forensics.terminalRate)} />
                <Metric label="Completion %" value={Math.round(forensics.completionRate)} />
                <Metric label="Final transcript %" value={Math.round(forensics.finalTranscriptRate)} />
                <Metric label="Active devices" value={forensics.activeDevices} />
                <Metric label="No-final turns" value={forensics.noFinalCount} />
                <Metric label="Server-only sessions" value={forensics.serverOnlySessions} />
                <Metric label="Missing terminal" value={forensics.missingTerminalSessions} />
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
            <div className="rounded-button border border-casa-border bg-casa-bg/60 px-2.5 py-2 text-caption">
              <p className="text-casa-muted">Voice pipeline P95 · wake / ASR / first token</p>
              <p className="text-body-sm font-semibold text-casa-navy tabular-nums">
                {forensics.wakeToDrawerP95Ms !== null ? `${Math.round(forensics.wakeToDrawerP95Ms)}ms` : '—'} /{' '}
                {forensics.asrP95Ms !== null ? `${Math.round(forensics.asrP95Ms)}ms` : '—'} /{' '}
                {forensics.firstTokenP95Ms !== null ? `${Math.round(forensics.firstTokenP95Ms)}ms` : '—'}
              </p>
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void runSyntheticRegressionHarness()}
                  disabled={regressionRunning}
                  leadingIcon={<FlaskConical size={14} className={cn(regressionRunning && 'animate-spin')} />}
                >
                  {regressionRunning ? 'Running…' : 'Run 4-case pack'}
                </Button>
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
          {screensaverSettings.wakeWordEnabled && (
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
              <IconButton
                onClick={() => {
                  const next = Math.max(0.10, Math.round((screensaverSettings.wakeWordSensitivity - 0.05) * 100) / 100)
                  setWakeWordSensitivity(next)
                }}
                variant="secondary"
                icon={<Minus size={18} />}
                aria-label="Decrease wake word sensitivity"
              />
              <span className="w-14 text-center text-body-sm font-semibold text-casa-navy tabular-nums">
                {Math.round(screensaverSettings.wakeWordSensitivity * 100)}%
              </span>
              <IconButton
                onClick={() => {
                  const next = Math.min(0.90, Math.round((screensaverSettings.wakeWordSensitivity + 0.05) * 100) / 100)
                  setWakeWordSensitivity(next)
                }}
                variant="secondary"
                icon={<Plus size={18} />}
                aria-label="Increase wake word sensitivity"
              />
            </div>
          </div>
          )}
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
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={!config.api_key || testStatus === 'testing'}
            leadingIcon={<FlaskConical size={14} className={cn(testStatus === 'testing' && 'animate-spin')} />}
          >
            {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
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
