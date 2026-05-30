import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Save, Home, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

interface HomeConfig {
  address: string
  city: string
  state: string
  zip: string
}

export default function ProfileSettingsPage() {
  const [home, setHome] = useState<HomeConfig>({ address: '', city: '', state: '', zip: '' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'home_config').single().then(({ data }) => {
      if (data?.value) setHome(data.value as HomeConfig)
      setIsLoading(false)
    })
  }, [])

  async function handleSave() {
    setSaveStatus('saving')
    const { error } = await supabase.from('settings').upsert(
      { key: 'home_config', value: home, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    setSaveStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setSaveStatus('idle'), 3000)
  }

  const fullAddress = [home.address, home.city, home.state, home.zip].filter(Boolean).join(', ')

  if (isLoading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Settings
      </Link>

      <h1 className="font-display text-display-md text-casa-navy mb-1">Profile & Home</h1>
      <p className="text-body-sm text-casa-muted mb-6">Your home address is used for drive time estimates, AI event enrichment, and travel planning.</p>

      <div className="space-y-4">

        {/* Home Address */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Home size={16} className="text-casa-gold shrink-0" />
            <div>
              <label className="block text-body-sm font-semibold text-casa-navy">Home Address</label>
              <p className="text-caption text-casa-muted mt-0.5">
                Used everywhere: drive time to events, airport runs, travel briefings, and AI enrichment.
              </p>
            </div>
          </div>

          <input
            type="text"
            value={home.address}
            onChange={e => { setHome(h => ({ ...h, address: e.target.value })); setSaveStatus('idle') }}
            placeholder="Street address"
            className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={home.city}
              onChange={e => { setHome(h => ({ ...h, city: e.target.value })); setSaveStatus('idle') }}
              placeholder="City"
              className="col-span-1 px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
            <input
              type="text"
              value={home.state}
              onChange={e => { setHome(h => ({ ...h, state: e.target.value })); setSaveStatus('idle') }}
              placeholder="State"
              className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
            <input
              type="text"
              value={home.zip}
              onChange={e => { setHome(h => ({ ...h, zip: e.target.value })); setSaveStatus('idle') }}
              placeholder="ZIP"
              className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
            />
          </div>

          {fullAddress && (
            <p className="text-caption text-casa-muted bg-casa-bg/60 px-3 py-2 rounded-button border border-casa-border/50">
              📍 {fullAddress}
            </p>
          )}
        </div>

        {/* Save status */}
        {saveStatus === 'error' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-button border text-body-sm bg-red-50 border-red-200 text-casa-error">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>Failed to save. Please try again.</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-button border text-body-sm bg-emerald-50 border-emerald-200 text-emerald-800">
            <CheckCircle size={15} className="mt-0.5 shrink-0" />
            <span>Saved! All features will use this address.</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-button text-body-sm font-semibold transition-all',
              'bg-casa-navy text-white hover:brightness-110 disabled:opacity-50'
            )}
          >
            <Save size={14} />
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}
