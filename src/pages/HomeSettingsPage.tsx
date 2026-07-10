import { useState, useEffect, useRef } from 'react'
import { Home } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Alert, Card, Field, Input, SkeletonRow, Text } from '../components/ui'
import { SettingsPageHeader, SettingsToggle } from '../components/settings'

interface HomeConfig {
  address: string
  city: string
  state: string
  zip: string
}

interface HomeScreenLayout {
  show_home_hero: boolean
  show_weather: boolean
  show_briefing: boolean
  show_conflicts: boolean
  show_prep: boolean
}

export default function HomeSettingsPage() {
  const [home, setHome] = useState<HomeConfig>({ address: '', city: '', state: '', zip: '' })
  const [homeScreenLayout, setHomeScreenLayout] = useState<HomeScreenLayout>({
    show_home_hero: true,
    show_weather: true,
    show_briefing: true,
    show_conflicts: true,
    show_prep: true,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const hydratedRef = useRef(false)
  const qc = useQueryClient()

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'home_config').single(),
      supabase.from('settings').select('value').eq('key', 'display_config').single(),
    ]).then(([homeRes, displayRes]) => {
      if (homeRes.data?.value) setHome(homeRes.data.value as HomeConfig)
      if (displayRes.data?.value) {
        const cfg = displayRes.data.value as Partial<HomeScreenLayout>
        setHomeScreenLayout({
          show_home_hero: cfg.show_home_hero ?? true,
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
            show_home_hero: homeScreenLayout.show_home_hero,
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
    if (!hasError) qc.invalidateQueries({ queryKey: ['settings', 'display_config'] })
    if (!hasError) setTimeout(() => setSaveStatus('idle'), 3000)
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
  }, [home, homeScreenLayout, isLoading])

  const fullAddress = [home.address, home.city, home.state, home.zip].filter(Boolean).join(', ')

  if (isLoading) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

  return (
    <>
      <SettingsPageHeader
        icon={Home}
        title="Home & Profile"
        description="Your address powers drive times, AI enrichment, and travel planning. Choose what appears on Home below."
      />

      <div className="mt-6 space-y-4">

        {/* Home Address */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Home size={16} className="text-casa-gold shrink-0" />
            <div>
              <label className="block text-body-sm font-semibold text-casa-navy">Home Address</label>
              <p className="text-caption text-casa-muted mt-0.5">
                Used everywhere: drive time to events, airport runs, travel briefings, and AI enrichment.
              </p>
            </div>
          </div>

          <Field label="Street address">
          <Input
            type="text"
            value={home.address}
            onChange={e => { setHome(h => ({ ...h, address: e.target.value })); setSaveStatus('idle') }}
            placeholder="Street address"
          />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City" className="col-span-1">
            <Input
              type="text"
              value={home.city}
              onChange={e => { setHome(h => ({ ...h, city: e.target.value })); setSaveStatus('idle') }}
              placeholder="City"
            />
            </Field>
            <Field label="State">
            <Input
              type="text"
              value={home.state}
              onChange={e => { setHome(h => ({ ...h, state: e.target.value })); setSaveStatus('idle') }}
              placeholder="State"
            />
            </Field>
            <Field label="ZIP">
            <Input
              type="text"
              value={home.zip}
              onChange={e => { setHome(h => ({ ...h, zip: e.target.value })); setSaveStatus('idle') }}
              placeholder="ZIP"
            />
            </Field>
          </div>

          {fullAddress && (
            <Text role="caption" muted className="rounded-button border border-casa-border/50 bg-casa-bg/60 px-3 py-2">
              Saved location: {fullAddress}
            </Text>
          )}
        </Card>

        {/* Home Screen Layout */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Home size={16} className="text-casa-gold shrink-0" />
            <div>
              <label className="block text-body-sm font-semibold text-casa-navy">Home Screen Layout</label>
              <p className="text-caption text-casa-muted mt-0.5">Choose what displays on your main Casa Tabor screen</p>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-casa-border">
            {/* Hero card toggle */}
            <SettingsToggle checked={homeScreenLayout.show_home_hero} onChange={value => { setHomeScreenLayout(prev => ({ ...prev, show_home_hero: value })); setSaveStatus('idle') }} label="Homepage Hero" desc="Large up-next summary card on desktop" />

            {/* Weather toggle */}
            <SettingsToggle checked={homeScreenLayout.show_weather} onChange={value => { setHomeScreenLayout(prev => ({ ...prev, show_weather: value })); setSaveStatus('idle') }} label="Weather" desc="Current conditions at the top" />

            {/* Daily Briefing toggle */}
            <SettingsToggle checked={homeScreenLayout.show_briefing} onChange={value => { setHomeScreenLayout(prev => ({ ...prev, show_briefing: value })); setSaveStatus('idle') }} label="Daily Briefing" desc="AI briefing card" />

            {/* Conflict Alerts toggle */}
            <SettingsToggle checked={homeScreenLayout.show_conflicts} onChange={value => { setHomeScreenLayout(prev => ({ ...prev, show_conflicts: value })); setSaveStatus('idle') }} label="Conflict Alerts" desc="Scheduling conflicts and logistics gaps" />

            {/* Prep Alerts toggle */}
            <SettingsToggle checked={homeScreenLayout.show_prep} onChange={value => { setHomeScreenLayout(prev => ({ ...prev, show_prep: value })); setSaveStatus('idle') }} label="Prep Alerts" desc="Upcoming birthdays, deadlines, and to-dos" />
          </div>
        </Card>

        {/* Save status */}
        {saveStatus === 'error' && (
          <Alert tone="danger" title="Could not save">Please try again.</Alert>
        )}
        {saveStatus === 'saved' && (
          <Alert tone="success" title="Home settings saved" />
        )}

        {saveStatus === 'saving' && (
          <p className="text-caption text-casa-muted text-right">Saving…</p>
        )}
      </div>
    </>
  )
}
