import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Monitor, Clock, Eye, Sunset, Sliders, Cpu, Palette, Image, Type, Sparkles, LayoutGrid, Sun, Moon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { SettingsPageHeader, SettingsToggle as Toggle } from '../components/settings'
import { Button, Card, SectionHeader as SharedSectionHeader } from '../components/ui'
import { useTheme, PRESETS, type ThemeColors } from '../contexts/ThemeContext'
import { DEFAULT_FONT_SCALE, MAX_FONT_SCALE, MIN_FONT_SCALE } from '../design-system/tokens.mjs'
import { useAppStore } from '../stores/appStore'
import { useHeroTheme } from '../hooks/useHeroTheme'
import {
  useRoomTone,
  getZoneForHour,
  ZONE_LABELS,
  ZONE_COLORS,
  DISPLAY_DEFAULTS,
  type DisplayConfig,
  type RoomToneZone,
} from '../hooks/useRoomTone'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'

// ── Shared sub-components ──────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <SharedSectionHeader icon={Icon} title={label} compact className="mb-2" />
}

// ── Room Tone Preview ──────────────────────────────────────────────

const ZONES_IN_ORDER: RoomToneZone[] = ['day', 'afternoon', 'evening', 'night', 'late-night']

const ZONE_FILTER: Record<RoomToneZone, string> = {
  'day':        'sepia(0) brightness(1)',
  'afternoon':  'sepia(0.05) brightness(0.98)',
  'evening':    'sepia(0.18) brightness(0.92) saturate(0.95)',
  'night':      'sepia(0.30) brightness(0.70) saturate(0.85)',
  'late-night': 'sepia(0.40) brightness(0.45) saturate(0.75)',
  'manual':     'sepia(0.15) brightness(0.80)',
}

function WarmthPreview({ filter }: { filter: string }) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-casa-border/50 shadow-sm"
      style={{ filter, transition: 'filter 0.3s ease-out' }}
    >
      {/* Simulated screen content */}
      <div className="bg-casa-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-casa-navy text-heading font-semibold">Thursday</div>
            <div className="text-casa-muted text-caption mt-0.5">May 28 · 7:00 PM</div>
          </div>
          <div className="text-right">
            <div className="text-casa-muted text-caption">72°F · Partly Cloudy</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { color: 'var(--color-member-kelly)', label: 'Kelly | Dinner with parents', time: '7:30 PM' },
            { color: 'var(--color-member-liv)', label: 'Liv | Soccer practice', time: '8:00 PM' },
            { color: 'var(--color-member-owen)', label: 'Owen | Bedtime', time: '9:00 PM' },
          ].map(e => (
            <div key={e.label} className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-casa-bg border border-casa-border">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
              <span className="text-casa-text text-caption flex-1 truncate">{e.label}</span>
              <span className="text-casa-muted text-caption">{e.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Hour Picker row ────────────────────────────────────────────────

function HourPicker({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const display = value === 0 ? '12 AM' : value < 12 ? `${value} AM` : value === 12 ? '12 PM' : `${value - 12} PM`
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-body-sm text-casa-navy">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => onChange((value - 1 + 24) % 24)}
          className="size-control rounded-button border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 outline-none transition-colors text-body-sm focus-visible:ring-2 focus-visible:ring-casa-gold"
          aria-label={`Move ${label} one hour earlier`}
        >−</Button>
        <span className="w-16 text-center text-body-sm font-medium text-casa-navy tabular-nums">{display}</span>
        <Button
          type="button"
          onClick={() => onChange((value + 1) % 24)}
          className="size-control rounded-button border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 outline-none transition-colors text-body-sm focus-visible:ring-2 focus-visible:ring-casa-gold"
          aria-label={`Move ${label} one hour later`}
        >+</Button>
      </div>
    </div>
  )
}

// ── 24h timeline strip ─────────────────────────────────────────────

function DayTimeline({ cfg }: { cfg: DisplayConfig }) {
  const now = new Date().getHours()
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div className="mt-3">
      <div className="flex h-5 rounded-full overflow-hidden border border-casa-border/60">
        {hours.map(h => {
          const zone = getZoneForHour(h, { ...cfg, manual_override: false })
          const bg = ZONE_COLORS[zone]
          const isNow = h === now
          return (
            <div
              key={h}
              title={`${h}:00 — ${ZONE_LABELS[zone]}`}
              style={{ background: bg, flex: 1, position: 'relative' }}
              className="transition-all"
            >
              {isNow && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-casa-gold ring-1 ring-white" />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-caption text-casa-muted mt-1 px-0.5">
        <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────

function SliderRow({ label, desc, value, min, max, onChange, unit = '%' }: {
  label: string; desc: string; value: number; min: number; max: number
  onChange: (v: number) => void; unit?: string
}) {
  return (
    <div className="py-3 border-t border-casa-divider">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-body-sm font-semibold text-casa-navy">{label}</p>
          <p className="text-caption text-casa-muted">{desc}</p>
        </div>
        <span className="text-body-sm font-semibold text-casa-navy tabular-nums w-14 text-right">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-casa-gold"
      />
    </div>
  )
}

export default function DisplaySettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { cfg: liveCfg, currentZone, sensorData } = useRoomTone()
  const { settings } = useScreensaverSettings()
  const {
    dayColors,
    autoMidnight,
    forceMidnight,
    setAutoMidnight,
    setForceMidnight,
    fontScale,
    setFontScale,
    applyDayPreset,
  } = useTheme()
  const { experienceMode, setExperienceMode } = useAppStore()
  const {
    preference: heroPreference,
    dayTheme: heroDayTheme,
    nightTheme: heroNightTheme,
    setPreference: setHeroPreference,
    setDayTheme: setHeroDayTheme,
    setNightTheme: setHeroNightTheme,
  } = useHeroTheme()
  const [config, setConfig] = useState<DisplayConfig>(DISPLAY_DEFAULTS)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [previewZone, setPreviewZone] = useState<RoomToneZone>('day')
  // Track whether config has been user-modified (vs just loaded from DB)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setConfig({ ...DISPLAY_DEFAULTS, ...liveCfg })
    setPreviewZone(currentZone === 'manual' ? 'evening' : currentZone)
    setDirty(false)
  }, [liveCfg, currentZone])

  const saveMutation = useMutation({
    mutationFn: async (cfg: DisplayConfig) => {
      const { error } = await supabase.from('settings').upsert(
        { key: 'display_config', value: cfg, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'display_config'] })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
      setDirty(false)
    },
  })

  // Auto-save: debounce 600ms after any user change
  useEffect(() => {
    if (!dirty) return
    setSaveState('saving')
    const t = setTimeout(() => { saveMutation.mutate(config) }, 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, dirty])

  const set = <K extends keyof DisplayConfig>(key: K, value: DisplayConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const enableManualOverride = (on: boolean) => {
    const expires = on ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null
    setConfig(prev => ({ ...prev, manual_override: on, override_expires_at: expires }))
    setDirty(true)
  }

  // Live preview filter
  const previewFilter = config.manual_override
    ? `sepia(${config.manual_warmth.toFixed(2)}) brightness(${config.manual_brightness.toFixed(2)})`
    : ZONE_FILTER[previewZone]

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <SettingsPageHeader icon={Monitor} title="Appearance & Display" description="Choose Casa’s look, text size, room tone, sensors, and art behavior" />
      </div>

      <div className="space-y-4">

        {/* ── UX EXPERIENCE ARCHITECTURE TOGGLE ── */}
        <Card padding="sm" className="border-2 border-casa-gold/40 bg-gradient-to-r from-casa-surface to-casa-gold/5">
          <SectionHeader icon={Sparkles} label="Experience Architecture" />
          <p className="mb-3 text-body-sm text-casa-text-secondary">
            Switch between the next-generation Living Canvas OS (Calm Ambient Kiosk + Turbo 3-Pane) and Classic multi-tab view.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={() => setExperienceMode('living_canvas')}
              aria-pressed={experienceMode === 'living_canvas'}
              className={cn(
                'h-auto min-h-control-lg items-start rounded-card border-2 p-3 text-left transition-all',
                experienceMode === 'living_canvas'
                  ? 'border-casa-navy bg-casa-surface shadow-card-hover'
                  : 'border-casa-border bg-casa-surface/60 opacity-80 hover:opacity-100'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-body-sm font-bold text-casa-navy flex items-center gap-1.5">
                    <Sparkles size={14} className="text-casa-gold" />
                    Living Canvas
                  </span>
                  {experienceMode === 'living_canvas' && (
                    <span className="text-caption uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-casa-gold/20 text-casa-navy">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-caption text-casa-text-secondary">
                  Calm Ambient entry for wall mounts, 1-tap expandable Turbo 3-pane triage canvas, and persistent AI sidecar.
                </p>
              </div>
            </Button>

            <Button
              variant="secondary"
              onClick={() => setExperienceMode('classic')}
              aria-pressed={experienceMode === 'classic'}
              className={cn(
                'h-auto min-h-control-lg items-start rounded-card border-2 p-3 text-left transition-all',
                experienceMode === 'classic'
                  ? 'border-casa-navy bg-casa-surface shadow-card-hover'
                  : 'border-casa-border bg-casa-surface/60 opacity-80 hover:opacity-100'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-body-sm font-bold text-casa-navy flex items-center gap-1.5">
                    <LayoutGrid size={14} className="text-casa-muted" />
                    Classic Mode
                  </span>
                  {experienceMode === 'classic' && (
                    <span className="text-caption uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-casa-border text-casa-navy">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-caption text-casa-text-secondary">
                  Traditional sidebar navigation with standalone Briefing, Action Hub, and Home pages.
                </p>
              </div>
            </Button>
          </div>
        </Card>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 1. THEME & COLORS ──────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        
        {/* Section header with icon */}
        <div className="mt-6 mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-casa-border" />
          <span className="flex items-center gap-2 px-1">
            <Palette size={15} className="text-casa-gold" />
            <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Appearance</span>
          </span>
          <div className="flex-1 h-px bg-casa-border" />
        </div>

        {/* Preset palettes */}
        <Card padding="sm">
          <SectionHeader icon={Palette} label="Casa Palettes" />
          <p className="mb-4 text-body-sm text-casa-text-secondary">
            Curated, room-friendly palettes with complete semantic colors for every Casa component.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PRESETS.map(preset => {
              const active = Object.entries(preset.colors).every(
                ([k, v]) => dayColors[k as keyof ThemeColors] === v
              )
              return (
                <Button
                  key={preset.id}
                  variant="secondary"
                  onClick={() => applyDayPreset(preset)}
                  aria-pressed={active}
                  className={cn(
                    'h-auto min-h-control-lg items-start rounded-card border-2 p-3 text-left transition-all',
                    active
                      ? 'border-casa-navy shadow-card-hover'
                      : 'border-casa-border'
                  )}
                  style={{ background: preset.colors['casa-surface'] }}
                >
                  <div className="flex w-full items-start gap-3">
                    <div className="flex shrink-0 -space-x-1">
                      <span className="size-6 rounded-full border border-white" style={{ background: preset.colors['casa-navy'] }} />
                      <span className="size-6 rounded-full border border-white" style={{ background: preset.colors['casa-gold'] }} />
                      <span className="size-6 rounded-full border" style={{ background: preset.colors['casa-bg'], borderColor: preset.colors['casa-border'] }} />
                    </div>
                    <span className="min-w-0">
                      <span className="block text-body-sm font-bold" style={{ color: preset.colors['casa-navy'] }}>
                        {preset.label}
                      </span>
                      <span className="mt-0.5 block text-caption" style={{ color: preset.colors['casa-text-secondary'] }}>
                        {preset.description}
                      </span>
                    </span>
                  </div>
                </Button>
              )
            })}
          </div>
        </Card>

        <Card padding="sm">
          <SectionHeader icon={Type} label="Text Size" />
          <div className="flex items-start justify-between gap-4">
            <p className="text-body-sm text-casa-text-secondary">
              Scales every semantic text role while preserving Casa’s hierarchy.
            </p>
            <span className="shrink-0 text-body font-bold tabular-nums text-casa-navy">
              {Math.round(fontScale * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step={0.01}
            value={fontScale}
            aria-label="Global text size"
            onChange={event => setFontScale(Number(event.target.value))}
            className="mt-4 w-full accent-casa-gold"
          />
          <div className="mt-1 flex justify-between text-caption text-casa-muted">
            <span>{Math.round(MIN_FONT_SCALE * 100)}%</span>
            <span>Default 100%</span>
            <span>{Math.round(MAX_FONT_SCALE * 100)}%</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[0.9, DEFAULT_FONT_SCALE, 1.15, 1.25].map(scale => (
              <Button
                key={scale}
                size="sm"
                variant={Math.abs(fontScale - scale) < 0.005 ? 'strong' : 'secondary'}
                aria-pressed={Math.abs(fontScale - scale) < 0.005}
                onClick={() => setFontScale(scale)}
              >
                {Math.round(scale * 100)}%
              </Button>
            ))}
          </div>
        </Card>

        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sunset} label="Midnight Gallery Activation" />
          <Toggle
            checked={autoMidnight}
            onChange={setAutoMidnight}
            label="Auto-switch at night"
            desc="Automatically switch to Midnight Gallery during Night and Late-night zones."
          />
          <Toggle
            checked={forceMidnight}
            onChange={setForceMidnight}
            label="Manual override: force Midnight Gallery"
            desc="Keep Midnight Gallery on all day until you turn this off."
          />
        </div>

        {/* ── HERO COMPONENT AESTHETIC & DAYPART MODE ── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sparkles} label="Hero Component Aesthetic" />
          <p className="mb-4 text-body-sm text-casa-text-secondary">
            Choose whether the Active Morning Departures and Tomorrow Morning Readiness hero cards display in deep Obsidian Navy or warm Belgian Linen, or automatically transition according to your daypart schedule.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                variant={heroPreference === 'auto' ? 'strong' : 'secondary'}
                onClick={() => setHeroPreference('auto')}
                className={cn(
                  'h-auto min-h-control-lg flex-col items-start p-3 text-left transition-all',
                  heroPreference === 'auto' ? 'border-2 border-casa-navy shadow-card-hover' : 'border-casa-border',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sun size={15} className="text-casa-gold" />
                  <span className="text-body-sm font-bold">Auto Daypart</span>
                </div>
                <span className="text-caption text-casa-text-secondary font-normal">
                  Transitions between daytime &amp; evening themes based on time.
                </span>
              </Button>

              <Button
                variant={heroPreference === 'navy' ? 'strong' : 'secondary'}
                onClick={() => setHeroPreference('navy')}
                className={cn(
                  'h-auto min-h-control-lg flex-col items-start p-3 text-left transition-all',
                  heroPreference === 'navy' ? 'border-2 border-casa-navy shadow-card-hover' : 'border-casa-border',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Moon size={15} className="text-amber-400" />
                  <span className="text-body-sm font-bold">Always Navy</span>
                </div>
                <span className="text-caption text-casa-text-secondary font-normal">
                  Obsidian Navy finish active 24/7 across all dayparts.
                </span>
              </Button>

              <Button
                variant={heroPreference === 'linen' ? 'strong' : 'secondary'}
                onClick={() => setHeroPreference('linen')}
                className={cn(
                  'h-auto min-h-control-lg flex-col items-start p-3 text-left transition-all',
                  heroPreference === 'linen' ? 'border-2 border-casa-navy shadow-card-hover' : 'border-casa-border',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sun size={15} className="text-amber-600" />
                  <span className="text-body-sm font-bold">Always Linen</span>
                </div>
                <span className="text-caption text-casa-text-secondary font-normal">
                  Warm Belgian Linen finish active 24/7 across all dayparts.
                </span>
              </Button>
            </div>

            {heroPreference === 'auto' && (
              <div className="p-4 rounded-xl bg-casa-surface-subtle border border-casa-border grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-caption font-bold uppercase tracking-wider text-casa-navy mb-2">
                    Daytime (6:00 AM – 7:00 PM)
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-body-sm text-casa-navy cursor-pointer">
                      <input
                        type="radio"
                        name="hero-day-theme"
                        checked={heroDayTheme === 'linen'}
                        onChange={() => setHeroDayTheme('linen')}
                        className="accent-casa-gold"
                      />
                      <span>Belgian Linen</span>
                    </label>
                    <label className="flex items-center gap-2 text-body-sm text-casa-navy cursor-pointer">
                      <input
                        type="radio"
                        name="hero-day-theme"
                        checked={heroDayTheme === 'navy'}
                        onChange={() => setHeroDayTheme('navy')}
                        className="accent-casa-gold"
                      />
                      <span>Obsidian Navy</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-caption font-bold uppercase tracking-wider text-casa-navy mb-2">
                    Nighttime (7:00 PM – 6:00 AM)
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-body-sm text-casa-navy cursor-pointer">
                      <input
                        type="radio"
                        name="hero-night-theme"
                        checked={heroNightTheme === 'navy'}
                        onChange={() => setHeroNightTheme('navy')}
                        className="accent-casa-gold"
                      />
                      <span>Obsidian Navy</span>
                    </label>
                    <label className="flex items-center gap-2 text-body-sm text-casa-navy cursor-pointer">
                      <input
                        type="radio"
                        name="hero-night-theme"
                        checked={heroNightTheme === 'linen'}
                        onChange={() => setHeroNightTheme('linen')}
                        className="accent-casa-gold"
                      />
                      <span>Belgian Linen</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 2. DISPLAY SETTINGS ────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        
        <div className="mt-8 mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-casa-border" />
          <span className="flex items-center gap-2 px-1">
            <Sunset size={15} className="text-casa-gold" />
            <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Display Settings</span>
          </span>
          <div className="flex-1 h-px bg-casa-border" />
        </div>

        {/* Room Tone Master */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sunset} label="Adaptive Room Tone" />
          <Toggle
            checked={config.room_tone_enabled}
            onChange={v => set('room_tone_enabled', v)}
            label="Adaptive warm display"
            desc="Shifts the screen to warm amber tones as daylight fades — like a painting illuminated by the room's own light"
          />

          {/* Live status badge */}
          {config.room_tone_enabled && (
            <div className="mt-2 mb-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-casa-gold animate-pulse" />
              <span className="text-caption text-casa-muted">
                Now: <span className="text-casa-navy font-medium">{ZONE_LABELS[currentZone]}</span>
              </span>
            </div>
          )}
        </div>

        {/* ── Preview + Zone selector ──────────────────── */}
        {config.room_tone_enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Eye} label="Preview" />

            {/* Zone tabs */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {ZONES_IN_ORDER.map(z => (
                <Button
                  key={z}
                  variant={previewZone === z ? 'strong' : 'secondary'}
                  size="sm"
                  onClick={() => setPreviewZone(z)}
                  aria-pressed={previewZone === z}
                >
                  {z.charAt(0).toUpperCase() + z.slice(1).replace('-', ' ')}
                </Button>
              ))}
            </div>

            <WarmthPreview filter={previewFilter} />

            {/* 24h timeline */}
            <DayTimeline cfg={config} />
          </div>
        )}

        {/* ── Schedule ─────────────────────────────────── */}
        {config.room_tone_enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Clock} label="Warmth Schedule" />
            <p className="text-caption text-casa-muted mb-3">
              Adjust when each warmth zone begins. The Pi sensor array will override these with real lux/CCT readings once connected.
            </p>
            <div className="divide-y divide-casa-divider">
              <HourPicker label="Day begins" value={config.schedule_day_hour} onChange={v => set('schedule_day_hour', v)} />
              <HourPicker label="Afternoon begins" value={config.schedule_afternoon_hour} onChange={v => set('schedule_afternoon_hour', v)} />
              <HourPicker label="Evening begins" value={config.schedule_evening_hour} onChange={v => set('schedule_evening_hour', v)} />
              <HourPicker label="Night begins" value={config.schedule_night_hour} onChange={v => set('schedule_night_hour', v)} />
              <HourPicker label="Late Night begins" value={config.schedule_late_night_hour} onChange={v => set('schedule_late_night_hour', v)} />
            </div>
          </div>
        )}

        {/* ── Manual Override ───────────────────────────── */}
        {config.room_tone_enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Sliders} label="Manual Override" />
            <Toggle
              checked={config.manual_override}
              onChange={enableManualOverride}
              label="Lock warmth & brightness"
              desc="Hold the display at a specific setting. Auto-expires after 2 hours."
            />
            {config.manual_override && (
              <div className="mt-4 space-y-5 pt-4 border-t border-casa-divider">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-body-sm font-medium text-casa-navy">Warmth</label>
                    <span className="text-caption text-casa-muted">{Math.round(config.manual_warmth * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={0.5} step={0.01}
                    value={config.manual_warmth}
                    onChange={e => set('manual_warmth', Number(e.target.value))}
                    className="w-full accent-casa-gold"
                    style={{ background: `linear-gradient(to right, var(--color-casa-surface), var(--color-casa-gold) ${config.manual_warmth * 200}%, var(--color-casa-border) ${config.manual_warmth * 200}%)` }}
                  />
                  <div className="flex justify-between text-caption text-casa-muted mt-1">
                    <span>Cool (daylight)</span><span>Warm (candlelight)</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-body-sm font-medium text-casa-navy">Brightness</label>
                    <span className="text-caption text-casa-muted">{Math.round(config.manual_brightness * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0.15} max={1} step={0.01}
                    value={config.manual_brightness}
                    onChange={e => set('manual_brightness', Number(e.target.value))}
                    className="w-full accent-casa-navy"
                  />
                  <div className="flex justify-between text-caption text-casa-muted mt-1">
                    <span>Dark</span><span>Full brightness</span>
                  </div>
                </div>
                {config.override_expires_at && (
                  <p className="text-caption text-casa-muted">
                    Auto-clears at{' '}
                    {new Date(config.override_expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 3. SENSOR ARRAY ────────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        
        <div className="mt-8 mb-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-casa-border" />
          <span className="flex items-center gap-2 px-1">
            <Cpu size={15} className="text-casa-gold" />
            <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Sensor Array</span>
          </span>
          <div className="flex-1 h-px bg-casa-border" />
        </div>
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Cpu} label="Sensor Array" />

          <Toggle
            checked={config.sensor_push_enabled}
            onChange={v => set('sensor_push_enabled', v)}
            label="Live sensor push"
            desc="Pi bridge streams readings to Supabase. Turn off to stop recording when not needed."
          />

          {/* Keep live sensor feedback directly under the toggle */}
          {config.sensor_push_enabled && sensorData ? (
            <div className="mt-3 pt-3 border-t border-casa-divider">
              {/* Live readings grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">Color Temp</p>
                  <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{Math.round(sensorData.cct).toLocaleString()} K</p>
                  <p className="text-caption text-casa-muted mt-0.5">
                    {sensorData.cct < 3000 ? 'Warm candlelight' : sensorData.cct < 4000 ? 'Warm white' : sensorData.cct < 5500 ? 'Natural daylight' : 'Cool daylight'}
                  </p>
                </div>
                <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">Illuminance</p>
                  <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{sensorData.lux.toFixed(1)} lux</p>
                  <p className="text-caption text-casa-muted mt-0.5">
                    {sensorData.lux < 5 ? 'Very dark' : sensorData.lux < 30 ? 'Dim room' : sensorData.lux < 200 ? 'Indoor lit' : 'Bright / daylight'}
                  </p>
                </div>
                {sensorData.brightness != null && (
                  <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                    <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">DDC Brightness</p>
                    <p className="text-body-sm font-semibold text-casa-navy tabular-nums mb-1">{sensorData.brightness}%</p>
                    <div className="h-1.5 w-full rounded-full bg-casa-border overflow-hidden">
                      <div className="h-full rounded-full bg-casa-gold transition-all duration-700" style={{ width: `${sensorData.brightness}%` }} />
                    </div>
                  </div>
                )}
                {sensorData.rgb && (
                  <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                    <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">Monitor RGB Gains</p>
                    <div className="flex gap-2 mt-1">
                      {(['R', 'G', 'B'] as const).map((ch, i) => {
                        const val = sensorData.rgb![i]
                        const color = ch === 'R' ? 'var(--color-casa-error)' : ch === 'G' ? 'var(--color-casa-success)' : 'var(--color-casa-info)'
                        return (
                          <div key={ch} className="flex-1 text-center">
                            <div className="text-caption font-bold mb-0.5" style={{ color }}>{ch}</div>
                            <div className="text-body-sm font-semibold text-casa-navy tabular-nums">{val}</div>
                            <div className="h-1 rounded-full bg-casa-border overflow-hidden mt-1">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, background: color }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sensor rows */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-casa-bg border border-casa-divider">
                  <span className="text-caption text-casa-navy">AS7343 — 14-channel spectral (color temp)</span>
                  <span className="flex items-center gap-1.5 text-caption text-emerald-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    live
                  </span>
                </div>
                {(['LTR390 — Precision lux + UV index', 'APDS9960 — Proximity wake detection'] as const).map(name => (
                  <div key={name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-casa-bg border border-casa-divider">
                    <span className="text-caption text-casa-navy">{name}</span>
                    <span className="text-caption text-casa-muted italic">not connected</span>
                  </div>
                ))}
              </div>
              <p className="text-caption text-casa-muted">
                Sensor active — real-time readings overriding time-of-day schedule.
              </p>
            </div>
          ) : config.sensor_push_enabled ? (
            <div className="mt-3 pt-3 border-t border-casa-divider">
              <div className="space-y-2">
                {['AS7343 — 14-channel spectral (color temp)', 'LTR390 — Precision lux + UV index', 'APDS9960 — Proximity wake detection'].map(name => (
                  <div key={name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-casa-bg border border-casa-divider">
                    <span className="text-caption text-casa-navy">{name}</span>
                    <span className="text-caption text-casa-muted italic">not connected</span>
                  </div>
                ))}
              </div>
              <p className="text-caption text-casa-muted mt-3">
                Push enabled — waiting for Pi bridge. Using <span className="font-medium text-casa-navy">time-of-day schedule</span> as proxy.
              </p>
            </div>
          ) : null}

          <SliderRow
            label="Min Brightness"
            desc="Floor when room is very dark (lux < 1). DDC scale 0–100."
            value={config.brightness_min}
            min={0}
            max={40}
            onChange={v => set('brightness_min', v)}
          />
          <SliderRow
            label="Max Brightness"
            desc="Ceiling for full daylight. DDC scale 0–100."
            value={config.brightness_max}
            min={50}
            max={100}
            onChange={v => set('brightness_max', v)}
          />

          <Toggle
            checked={config.auto_sleep_enabled}
            onChange={v => set('auto_sleep_enabled', v)}
            label="Auto-sleep display"
            desc="Blanks the monitor when the room is very dark. Wakes on ambient light."
          />
          {config.auto_sleep_enabled && (
            <>
              <SliderRow
                label="Sleep threshold"
                desc={`Room must drop below ${(config.sleep_lux_threshold).toFixed(1)} lux for ${config.sleep_delay_s}s to sleep.`}
                value={Math.round(config.sleep_lux_threshold * 10)}
                min={1}
                max={30}
                unit=" ×0.1lux"
                onChange={v => set('sleep_lux_threshold', v / 10)}
              />
              <SliderRow
                label="Wake threshold"
                desc={`Wakes when lux rises above ${(config.wake_lux_threshold).toFixed(1)}.`}
                value={Math.round(config.wake_lux_threshold * 10)}
                min={5}
                max={100}
                unit=" ×0.1lux"
                onChange={v => set('wake_lux_threshold', v / 10)}
              />
              <SliderRow
                label="Sleep delay"
                desc="Seconds in darkness before sleeping."
                value={config.sleep_delay_s}
                min={5}
                max={120}
                unit="s"
                onChange={v => set('sleep_delay_s', v)}
              />
            </>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 4. ART MODE ────────────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        
        <div className="mt-8 mb-4 flex items-center gap-3">
         <div className="flex-1 h-px bg-casa-border" />
         <span className="flex items-center gap-2 px-1">
           <Image size={15} className="text-casa-gold" />
           <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Art Mode</span>
         </span>
         <div className="flex-1 h-px bg-casa-border" />
        </div>

        <Card padding="md" className="space-y-4">
          <SectionHeader icon={Image} label="Art Mode Screensaver & Gallery" />
          <p className="text-body-sm text-casa-text-secondary">
            Display museum-grade paintings and personal family photos on idle wall mounts, with automatic color-matched linen mats and ambient dimming.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-casa-divider">
            <div className="flex items-center gap-2">
              <span className="text-caption text-casa-muted">
                Status: <span className="font-semibold text-casa-navy">{settings.enabled ? 'Active' : 'Disabled'}</span>
              </span>
              {settings.enabled && (
                <span className="text-caption text-casa-muted">
                  · {settings.screensaverMins}m idle delay · rotates every {settings.rotationMins}m
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
              >
                Preview Art Mode
              </Button>
              <Button
                variant="strong"
                size="sm"
                onClick={() => navigate('/settings/art-mode')}
              >
                Configure Art Mode
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Auto-save status */}
      <div className="mt-6 flex justify-end h-8 items-center">
        {saveState === 'saving' && (
          <span className="text-caption text-casa-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-casa-gold animate-pulse" />
            Saving…
          </span>
        )}
        {saveState === 'saved' && (
          <span className="text-caption text-emerald-600 flex items-center gap-1.5">
            <CheckCircle size={13} /> Saved
          </span>
        )}
      </div>
    </>
  )
}
