import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Save, FlaskConical, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

interface LLMConfig {
  provider: string
  model: string
  api_key: string
}

interface HomeConfig {
  address: string
  city: string
  state: string
  zip: string
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
  const [home, setHome] = useState<HomeConfig>({ address: '', city: '', state: '', zip: '' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'llm_config').single(),
      supabase.from('settings').select('value').eq('key', 'home_config').single(),
    ]).then(([llmRes, homeRes]) => {
      if (llmRes.data?.value) setConfig(llmRes.data.value as LLMConfig)
      if (homeRes.data?.value) setHome(homeRes.data.value as HomeConfig)
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
    const [r1, r2] = await Promise.all([
      supabase.from('settings').upsert({ key: 'llm_config', value: config, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
      supabase.from('settings').upsert({ key: 'home_config', value: home, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
    ])
    setSaveStatus(r1.error || r2.error ? 'error' : 'saved')
    if (!r1.error && !r2.error) setTimeout(() => setSaveStatus('idle'), 3000)
  }

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

  if (isLoading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Settings
      </Link>

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

        {/* Home Address */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div>
            <label className="block text-body-sm font-semibold text-casa-navy">Home Address</label>
            <p className="text-caption text-casa-muted mt-0.5">Sent with every AI enrichment so it knows your location.</p>
          </div>
          <input
            type="text"
            value={home.address}
            onChange={e => setHome(h => ({ ...h, address: e.target.value }))}
            placeholder="Street address"
            className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={home.city}
              onChange={e => setHome(h => ({ ...h, city: e.target.value }))}
              placeholder="City"
              className="col-span-1 px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
            <input
              type="text"
              value={home.state}
              onChange={e => setHome(h => ({ ...h, state: e.target.value }))}
              placeholder="State"
              className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
            <input
              type="text"
              value={home.zip}
              onChange={e => setHome(h => ({ ...h, zip: e.target.value }))}
              placeholder="ZIP"
              className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
          </div>
        </div>

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
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            <Save size={14} />
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
