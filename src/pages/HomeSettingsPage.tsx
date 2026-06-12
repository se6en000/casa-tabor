import { useState, useEffect } from 'react'
import { Save, Home, CheckCircle, AlertCircle, Cloud, BookOpen, AlertTriangle, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

interface HomeConfig {
  address: string
  city: string
  state: string
  zip: string
}

export default function HomeSettingsPage() {
  const [home, setHome] = useState<HomeConfig>({ address: '', city: '', state: '', zip: '' })
  const [homeScreenLayout, setHomeScreenLayout] = useState({
    show_weather: true,
    show_briefing: true,
    show_conflicts: true,
    show_prep: true,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'home_config').single(),
      supabase.from('settings').select('value').eq('key', 'display_config').single(),
    ]).then(([homeRes, displayRes]) => {
      if (homeRes.data?.value) setHome(homeRes.data.value as HomeConfig)
      if (displayRes.data?.value) {
        const cfg = displayRes.data.value as any
        setHomeScreenLayout({
          show_weather: cfg.show_weather ?? true,
          show_briefing: cfg.show_briefing ?? true,
          show_conflicts: cfg.show_conflicts ?? true,
          show_prep: cfg.show_prep ?? true,
        })
      }
      setIsLoading(false)
    })
  }, [])

  async function handleSave() {
    setSaveStatus('saving')
    
    // Save home address
    const { error: homeError } = await supabase.from('settings').upsert(
      { key: 'home_config', value: home, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

    // Save home screen layout toggles to display_config
    const { error: layoutError } = await supabase.from('settings').select('value').eq('key', 'display_config').single().then(async ({ data }) => {
      const currentCfg = data?.value ?? {}
      return supabase.from('settings').upsert(
        {
          key: 'display_config',
          value: {
            ...currentCfg,
            show_weather: homeScreenLayout.show_weather,
            show_briefing: homeScreenLayout.show_briefing,
            show_conflicts: homeScreenLayout.show_conflicts,
            show_prep: homeScreenLayout.show_prep,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )
    })

    const hasError = homeError || layoutError
    setSaveStatus(hasError ? 'error' : 'saved')
    if (!hasError) setTimeout(() => setSaveStatus('idle'), 3000)
  }

  const fullAddress = [home.address, home.city, home.state, home.zip].filter(Boolean).join(', ')

  if (isLoading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  return (
    <>
      <h1 className="font-display text-display-md text-casa-navy mb-1">Home & Profile</h1>
      <p className="text-body-sm text-casa-muted mb-6">Your home address is used for drive time estimates, AI event enrichment, and travel planning. Configure what appears on your home screen below.</p>

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

        {/* Home Screen Layout */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Home size={16} className="text-casa-gold shrink-0" />
            <div>
              <label className="block text-body-sm font-semibold text-casa-navy">Home Screen Layout</label>
              <p className="text-caption text-casa-muted mt-0.5">Choose what displays on your main Casa Tabor screen</p>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-casa-border">
            {/* Weather toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <Cloud size={16} className="text-casa-gold mt-0.5 shrink-0" />
                <div>
                  <p className="text-body-sm font-medium text-casa-navy">Weather</p>
                  <p className="text-caption text-casa-muted">Current conditions at the top</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHomeScreenLayout(prev => ({ ...prev, show_weather: !prev.show_weather }))
                  setSaveStatus('idle')
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
                  homeScreenLayout.show_weather ? 'bg-casa-navy' : 'bg-casa-border'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
                  homeScreenLayout.show_weather ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {/* Daily Briefing toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <BookOpen size={16} className="text-casa-gold mt-0.5 shrink-0" />
                <div>
                  <p className="text-body-sm font-medium text-casa-navy">Daily Briefing</p>
                  <p className="text-caption text-casa-muted">AI briefing card</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHomeScreenLayout(prev => ({ ...prev, show_briefing: !prev.show_briefing }))
                  setSaveStatus('idle')
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
                  homeScreenLayout.show_briefing ? 'bg-casa-navy' : 'bg-casa-border'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
                  homeScreenLayout.show_briefing ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {/* Conflict Alerts toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-casa-gold mt-0.5 shrink-0" />
                <div>
                  <p className="text-body-sm font-medium text-casa-navy">Conflict Alerts</p>
                  <p className="text-caption text-casa-muted">Scheduling conflicts & logistics gaps</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHomeScreenLayout(prev => ({ ...prev, show_conflicts: !prev.show_conflicts }))
                  setSaveStatus('idle')
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
                  homeScreenLayout.show_conflicts ? 'bg-casa-navy' : 'bg-casa-border'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
                  homeScreenLayout.show_conflicts ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {/* Prep Alerts toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <CheckSquare size={16} className="text-casa-gold mt-0.5 shrink-0" />
                <div>
                  <p className="text-body-sm font-medium text-casa-navy">Prep Alerts</p>
                  <p className="text-caption text-casa-muted">Upcoming birthdays, deadlines, to-dos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHomeScreenLayout(prev => ({ ...prev, show_prep: !prev.show_prep }))
                  setSaveStatus('idle')
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
                  homeScreenLayout.show_prep ? 'bg-casa-navy' : 'bg-casa-border'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
                  homeScreenLayout.show_prep ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          </div>
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
            <span>Saved! Your home settings are updated.</span>
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
    </>
  )
}
