import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, CheckCircle, AlertCircle, Home, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'

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

export default function AISettingsPage() {
  const [config, setConfig] = useState<LLMConfig>({ provider: 'gemini', model: 'gemini-2.0-flash', api_key: '' })
  const [customInstructions, setCustomInstructions] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const hydratedRef = useRef(false)
  const { settings: screensaverSettings, update: updateScreensaver } = useScreensaverSettings()

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

  async function handleSave() {
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
  }

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
  }, [config, customInstructions, isLoading])

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
                 'Very strict — nearly shout-level'}
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
                  const next = Math.min(0.60, Math.round((screensaverSettings.wakeWordSensitivity + 0.05) * 100) / 100)
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
