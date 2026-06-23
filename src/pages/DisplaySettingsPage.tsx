import { useState, useEffect } from 'react'
import { CheckCircle, Monitor, Clock, Eye, Sunset, Cpu, Palette, RotateCcw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import {
  useTheme,
  PRESETS,
  DEFAULTS,
  MIDNIGHT_GALLERY_DEFAULTS,
  DISPLAY_FONT_OPTIONS,
  BODY_FONT_OPTIONS,
  type ThemeColors,
} from '../contexts/ThemeContext'
import {
  useRoomTone,
  getZoneForHour,
  ZONE_LABELS,
  ZONE_COLORS,
  DISPLAY_DEFAULTS,
  type DisplayConfig,
  type RoomToneZone,
} from '../hooks/useRoomTone'


// ── Shared sub-components ──────────────────────────────────────────

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; desc: string }[] = [
  { key: 'casa-gold',    label: 'Accent Color',       desc: 'Icons, highlights, buttons, badges' },
  { key: 'casa-navy',    label: 'Primary Color',      desc: 'Navigation, headers, dark elements' },
  { key: 'casa-bg',      label: 'Background',         desc: 'Main page background' },
  { key: 'casa-surface', label: 'Surface Base',       desc: 'Base surface tone for panels and overlays' },
  { key: 'casa-rail',    label: 'Side Rails',         desc: 'Left and right rail background color' },
  { key: 'casa-main',    label: 'Center Rail',        desc: 'Main center content background color' },
  { key: 'casa-card',    label: 'Cards',              desc: 'Event cards and list card backgrounds' },
  { key: 'casa-text',    label: 'Body Text',          desc: 'Primary text color' },
  { key: 'casa-border',  label: 'Borders & Dividers', desc: 'Card borders, divider lines' },
]

function Toggle({ checked, onChange, label, desc, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', disabled && 'opacity-40 pointer-events-none')}>
      <div>
        <p className="text-body-sm font-medium text-casa-navy">{label}</p>
        {desc && <p className="text-caption text-casa-muted mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
          checked ? 'bg-casa-navy' : 'bg-casa-border'
        )}
      >
        <span className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
          checked ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={15} className="text-casa-gold" />
      <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">{label}</p>
    </div>
  )
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
      <div className="bg-[#FAF8F5] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-[#1B2A4A] text-heading font-semibold">Thursday</div>
            <div className="text-[#8C8C8C] text-caption mt-0.5">May 28 · 7:00 PM</div>
          </div>
          <div className="text-right">
            <div className="text-[#8C8C8C] text-caption">72°F · Partly Cloudy</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { color: '#C4693A', label: 'Kelly | Dinner with parents', time: '7:30 PM' },
            { color: '#6A9E7F', label: 'Liv | Soccer practice', time: '8:00 PM' },
            { color: '#D4A44C', label: 'Owen | Bedtime', time: '9:00 PM' },
          ].map(e => (
            <div key={e.label} className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-white border border-[#E8E2D9]">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
              <span className="text-[#2D2D2D] text-caption flex-1 truncate">{e.label}</span>
              <span className="text-[#8C8C8C] text-caption">{e.time}</span>
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
        <button
          type="button"
          onClick={() => onChange((value - 1 + 24) % 24)}
          className="w-7 h-7 rounded-full border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 transition-colors text-body-sm"
        >−</button>
        <span className="w-16 text-center text-body-sm font-medium text-casa-navy tabular-nums">{display}</span>
        <button
          type="button"
          onClick={() => onChange((value + 1) % 24)}
          className="w-7 h-7 rounded-full border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 transition-colors text-body-sm"
        >+</button>
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

function SliderRow({ label, desc, value, min, max, onChange, unit = '%', disabled = false }: {
  label: string; desc: string; value: number; min: number; max: number
  onChange: (v: number) => void; unit?: string; disabled?: boolean
}) {
  return (
    <div className={cn('py-3 border-t border-casa-divider', disabled && 'opacity-45')}>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-body-sm font-semibold text-casa-navy">{label}</p>
          <p className="text-caption text-casa-muted">{desc}</p>
        </div>
        <span className="text-body-sm font-semibold text-casa-navy tabular-nums w-14 text-right">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-casa-gold"
      />
    </div>
  )
}

export default function DisplaySettingsPage() {
  const qc = useQueryClient()
  const { cfg: liveCfg, currentZone, sensorData } = useRoomTone()
  const {
    colors,
    activeTarget,
    autoMidnight,
    forceMidnight,
    setAutoMidnight,
    setForceMidnight,
    setActiveTarget,
    setColor,
    applyPreset,
    resetToDefaults,
    typography,
    setDisplayFont,
    setBodyFont,
    setHeadingScale,
    setBodyScale,
    resetTypography,
    isTypographyDefault,
    isDefault,
  } = useTheme()
  const [config, setConfig] = useState<DisplayConfig>(DISPLAY_DEFAULTS)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [previewZone, setPreviewZone] = useState<RoomToneZone>('day')
  // Track whether config has been user-modified (vs just loaded from DB)
  const [dirty, setDirty] = useState(false)
  const [appearanceAdvancedOpen, setAppearanceAdvancedOpen] = useState(false)
  const [ambientAdvancedOpen, setAmbientAdvancedOpen] = useState(false)

  useEffect(() => {
    const merged = { ...DISPLAY_DEFAULTS, ...liveCfg }
    const normalized = merged.ambient_auto_mode
      ? {
          ...merged,
          room_tone_enabled: true,
          sensor_push_enabled: true,
          manual_override: false,
          override_expires_at: null,
        }
      : merged
    setConfig(normalized)
    setPreviewZone(currentZone === 'manual' ? 'evening' : currentZone)
    const needsPersist = JSON.stringify(normalized) !== JSON.stringify(merged)
    setDirty(needsPersist)
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

  const disableAdvancedOverrides = () => {
    setConfig(prev => ({
      ...prev,
      ambient_auto_mode: true,
      room_tone_enabled: true,
      sensor_push_enabled: true,
      manual_override: false,
      override_expires_at: null,
      brightness_min: DISPLAY_DEFAULTS.brightness_min,
      brightness_max: DISPLAY_DEFAULTS.brightness_max,
      cct_bias_k: DISPLAY_DEFAULTS.cct_bias_k,
      zone_cct_bias_day: DISPLAY_DEFAULTS.zone_cct_bias_day,
      zone_cct_bias_afternoon: DISPLAY_DEFAULTS.zone_cct_bias_afternoon,
      zone_cct_bias_evening: DISPLAY_DEFAULTS.zone_cct_bias_evening,
      zone_cct_bias_night: DISPLAY_DEFAULTS.zone_cct_bias_night,
      zone_cct_bias_late_night: DISPLAY_DEFAULTS.zone_cct_bias_late_night,
      rgb_trim_r: DISPLAY_DEFAULTS.rgb_trim_r,
      rgb_trim_g: DISPLAY_DEFAULTS.rgb_trim_g,
      rgb_trim_b: DISPLAY_DEFAULTS.rgb_trim_b,
      auto_sleep_enabled: DISPLAY_DEFAULTS.auto_sleep_enabled,
      sleep_lux_threshold: DISPLAY_DEFAULTS.sleep_lux_threshold,
      wake_lux_threshold: DISPLAY_DEFAULTS.wake_lux_threshold,
      sleep_delay_s: DISPLAY_DEFAULTS.sleep_delay_s,
    }))
    setDirty(true)
  }

  const setAmbientMode = (mode: 'auto' | 'manual' | 'custom') => {
    if (mode === 'auto') {
      disableAdvancedOverrides()
      return
    }

    if (mode === 'manual') {
      setConfig(prev => ({
        ...prev,
        ambient_auto_mode: false,
        room_tone_enabled: true,
        sensor_push_enabled: true,
        manual_override: true,
        override_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      }))
      setDirty(true)
      return
    }

    setConfig(prev => ({
      ...prev,
      ambient_auto_mode: false,
      room_tone_enabled: true,
      manual_override: false,
      override_expires_at: null,
    }))
    setDirty(true)
  }

  const applyWarmthScenario = (scenario: 'balanced' | 'golden-hour' | 'movie-night' | 'night-owl') => {
    if (scenario === 'balanced') {
      setConfig(prev => ({
        ...prev,
        cct_bias_k: 0,
        zone_cct_bias_day: 0,
        zone_cct_bias_afternoon: 0,
        zone_cct_bias_evening: -250,
        zone_cct_bias_night: -500,
        zone_cct_bias_late_night: -800,
        rgb_trim_r: 0,
        rgb_trim_g: 0,
        rgb_trim_b: 0,
      }))
    }
    if (scenario === 'golden-hour') {
      setConfig(prev => ({
        ...prev,
        cct_bias_k: -220,
        zone_cct_bias_day: -80,
        zone_cct_bias_afternoon: -180,
        zone_cct_bias_evening: -420,
        zone_cct_bias_night: -650,
        zone_cct_bias_late_night: -950,
        rgb_trim_r: 2,
        rgb_trim_g: 0,
        rgb_trim_b: -2,
      }))
    }
    if (scenario === 'movie-night') {
      setConfig(prev => ({
        ...prev,
        cct_bias_k: -320,
        zone_cct_bias_day: -50,
        zone_cct_bias_afternoon: -120,
        zone_cct_bias_evening: -500,
        zone_cct_bias_night: -780,
        zone_cct_bias_late_night: -1100,
        rgb_trim_r: 3,
        rgb_trim_g: -1,
        rgb_trim_b: -4,
      }))
    }
    if (scenario === 'night-owl') {
      setConfig(prev => ({
        ...prev,
        cct_bias_k: -120,
        zone_cct_bias_day: 0,
        zone_cct_bias_afternoon: -80,
        zone_cct_bias_evening: -220,
        zone_cct_bias_night: -350,
        zone_cct_bias_late_night: -450,
        rgb_trim_r: 1,
        rgb_trim_g: 0,
        rgb_trim_b: -1,
      }))
    }
    setDirty(true)
  }

  // Live preview filter
  const previewFilter = config.manual_override
    ? `sepia(${config.manual_warmth.toFixed(2)}) brightness(${config.manual_brightness.toFixed(2)})`
    : ZONE_FILTER[previewZone]

  const ambientMode: 'auto' | 'manual' | 'custom' = config.ambient_auto_mode
    ? 'auto'
    : config.manual_override
      ? 'manual'
      : 'custom'

  useEffect(() => {
    if (ambientMode !== 'custom' || !config.room_tone_enabled) setAmbientAdvancedOpen(false)
  }, [ambientMode, config.room_tone_enabled])

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-full bg-casa-bg border border-casa-border flex items-center justify-center text-casa-gold">
          <Monitor size={18} />
        </span>
        <div>
          <h1 className="font-display text-display-sm text-casa-navy">Display Settings</h1>
          <p className="text-caption text-casa-muted">Simple by default, advanced only when needed</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Palette} label="Appearance" />
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setActiveTarget('day')}
              className={cn(
                'px-3 py-1.5 rounded-full text-caption font-medium border transition-colors',
                activeTarget === 'day'
                  ? 'bg-casa-navy text-white border-casa-navy'
                  : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
              )}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setActiveTarget('midnight')}
              className={cn(
                'px-3 py-1.5 rounded-full text-caption font-medium border transition-colors',
                activeTarget === 'midnight'
                  ? 'bg-casa-navy text-white border-casa-navy'
                  : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
              )}
            >
              Midnight
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PRESETS.map(preset => {
              const active = Object.entries(preset.colors).every(
                ([k, v]) => colors[k as keyof ThemeColors] === v
              )
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'rounded-2xl border-2 p-3 text-left transition-all hover:shadow-md',
                    active
                      ? 'border-casa-gold shadow-md'
                      : 'border-casa-border hover:border-casa-gold/40'
                  )}
                  style={{ background: preset.colors['casa-surface'] }}
                >
                  {/* Mini color preview */}
                  <div className="flex gap-1 mb-2">
                    <div className="w-5 h-5 rounded-full" style={{ background: preset.colors['casa-navy'] }} />
                    <div className="w-5 h-5 rounded-full" style={{ background: preset.colors['casa-gold'] }} />
                    <div className="w-5 h-5 rounded-full border" style={{ background: preset.colors['casa-bg'], borderColor: preset.colors['casa-border'] }} />
                  </div>
                  <p className="text-caption font-semibold" style={{ color: preset.colors['casa-navy'] }}>
                    {preset.emoji} {preset.label}
                  </p>
                </button>
              )
            })}
          </div>
          <Toggle
            checked={autoMidnight}
            onChange={setAutoMidnight}
            label="Auto Midnight Gallery"
            desc="Switches to the Midnight palette at night."
          />
          <Toggle
            checked={forceMidnight}
            onChange={setForceMidnight}
            label="Force Midnight now"
            desc="Keeps Midnight palette on all day."
          />
          <SliderRow
            label="Header text size"
            desc="Scales display + heading typography across the app"
            value={typography.headingScale}
            min={85}
            max={120}
            onChange={setHeadingScale}
          />
          <SliderRow
            label="Body text size"
            desc="Scales body, small body, and caption text"
            value={typography.bodyScale}
            min={85}
            max={120}
            onChange={setBodyScale}
          />
          <button
            type="button"
            onClick={() => setAppearanceAdvancedOpen(v => !v)}
            className="mt-3 px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors"
          >
            {appearanceAdvancedOpen ? 'Hide advanced appearance' : 'Show advanced appearance'}
          </button>

          {appearanceAdvancedOpen && (
            <div className="mt-4 pt-4 border-t border-casa-divider space-y-4">
              <div>
                <p className="text-body-sm font-semibold text-casa-navy mb-2">Header font</p>
                <div className="flex flex-wrap gap-2">
                  {DISPLAY_FONT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDisplayFont(option.css)}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-caption font-medium transition-colors',
                        typography.displayFont === option.css
                          ? 'bg-casa-navy text-white border-casa-navy'
                          : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-body-sm font-semibold text-casa-navy mb-2">Body font</p>
                <div className="flex flex-wrap gap-2">
                  {BODY_FONT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setBodyFont(option.css)}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-caption font-medium transition-colors',
                        typography.bodyFont === option.css
                          ? 'bg-casa-navy text-white border-casa-navy'
                          : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-casa-divider">
                {COLOR_FIELDS.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center gap-4 px-0 py-3.5">
                    <label className="relative cursor-pointer flex-shrink-0">
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-casa-border shadow-sm transition-transform hover:scale-105"
                        style={{ background: colors[key] }}
                      />
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={e => setColor(key, e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold text-casa-navy leading-tight">{label}</p>
                      <p className="text-caption text-casa-muted mt-0.5">{desc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-caption font-mono text-casa-muted bg-casa-bg px-2 py-1 rounded-md">
                        {colors[key].toUpperCase()}
                      </code>
                      {colors[key] !== (activeTarget === 'midnight' ? MIDNIGHT_GALLERY_DEFAULTS[key] : DEFAULTS[key]) && (
                        <button
                          onClick={() => setColor(key, activeTarget === 'midnight' ? MIDNIGHT_GALLERY_DEFAULTS[key] : DEFAULTS[key])}
                          title="Reset this color"
                          className="text-casa-muted hover:text-casa-gold transition-colors"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!isDefault || !isTypographyDefault) && (
            <div className="mt-4 pt-4 border-t border-casa-divider flex flex-wrap gap-2">
              {!isDefault && (
                <button
                  onClick={resetToDefaults}
                  className="inline-flex items-center gap-2 bg-white border border-casa-border text-casa-navy text-body-sm font-semibold px-3 py-1.5 rounded-xl hover:bg-casa-bg transition-colors"
                >
                  <RotateCcw size={13} />
                  Reset palette defaults
                </button>
              )}
              {!isTypographyDefault && (
                <button
                  type="button"
                  onClick={resetTypography}
                  className="inline-flex items-center gap-2 bg-white border border-casa-border text-casa-navy text-body-sm font-semibold px-3 py-1.5 rounded-xl hover:bg-casa-bg transition-colors"
                >
                  <RotateCcw size={13} />
                  Reset typography defaults
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sunset} label="Ambient Behavior" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            {(['auto', 'manual', 'custom'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setAmbientMode(mode)}
                className={cn(
                  'px-3 py-2 rounded-xl border text-body-sm font-semibold transition-colors',
                  ambientMode === mode
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
                )}
              >
                {mode === 'auto' ? 'Auto (Recommended)' : mode === 'manual' ? 'Manual Hold' : 'Custom Tuning'}
              </button>
            ))}
          </div>
          <p className="text-caption text-casa-muted">
            Active mode: <span className="font-semibold text-casa-navy">{ambientMode === 'auto' ? 'Auto' : ambientMode === 'manual' ? 'Manual Hold' : 'Custom Tuning'}</span>
          </p>

          {ambientMode === 'auto' && (
            <div className="mt-3 rounded-xl bg-casa-bg border border-casa-divider p-3">
              <p className="text-body-sm font-semibold text-casa-navy">Ambient automation is fully managed</p>
              <p className="text-caption text-casa-muted mt-0.5">Warmth, sensor push, and safety limits are locked to recommended defaults.</p>
              {sensorData && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg border border-casa-divider bg-white px-3 py-2">
                    <p className="text-caption text-casa-muted uppercase tracking-wide">Color Temp</p>
                    <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{Math.round(sensorData.cct).toLocaleString()} K</p>
                  </div>
                  <div className="rounded-lg border border-casa-divider bg-white px-3 py-2">
                    <p className="text-caption text-casa-muted uppercase tracking-wide">Illuminance</p>
                    <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{sensorData.lux.toFixed(1)} lux</p>
                  </div>
                </div>
              )}
            </div>
          )}
          {ambientMode === 'manual' && (
            <div className="mt-3 pt-3 border-t border-casa-divider space-y-5">
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
                />
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
              </div>
              {config.override_expires_at && (
                <p className="text-caption text-casa-muted">
                  Auto-clears at {new Date(config.override_expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {ambientMode === 'custom' && (
            <div className="mt-3 pt-3 border-t border-casa-divider">
              <Toggle
                checked={config.room_tone_enabled}
                onChange={v => set('room_tone_enabled', v)}
                label="Adaptive warm display"
                desc="Enable ambient warmth response."
              />

              {config.room_tone_enabled && (
                <>
                  <div className="mt-3">
                    <SectionHeader icon={Eye} label="Preview" />
                    <div className="flex gap-1.5 flex-wrap mb-4">
                      {ZONES_IN_ORDER.map(z => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setPreviewZone(z)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-caption font-medium border transition-colors',
                            previewZone === z
                              ? 'bg-casa-navy text-white border-casa-navy'
                              : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
                          )}
                        >
                          {z.charAt(0).toUpperCase() + z.slice(1).replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                    <WarmthPreview filter={previewFilter} />
                    <DayTimeline cfg={config} />
                  </div>

                  <div className="mt-4 pt-4 border-t border-casa-divider">
                    <SectionHeader icon={Clock} label="Schedule" />
                    <div className="divide-y divide-casa-divider">
                      <HourPicker label="☀️ Day begins" value={config.schedule_day_hour} onChange={v => set('schedule_day_hour', v)} />
                      <HourPicker label="🌤 Afternoon begins" value={config.schedule_afternoon_hour} onChange={v => set('schedule_afternoon_hour', v)} />
                      <HourPicker label="🌇 Evening begins" value={config.schedule_evening_hour} onChange={v => set('schedule_evening_hour', v)} />
                      <HourPicker label="🌙 Night begins" value={config.schedule_night_hour} onChange={v => set('schedule_night_hour', v)} />
                      <HourPicker label="🕯 Late night begins" value={config.schedule_late_night_hour} onChange={v => set('schedule_late_night_hour', v)} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAmbientAdvancedOpen(v => !v)}
                    className="mt-4 px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors"
                  >
                    {ambientAdvancedOpen ? 'Hide advanced ambient controls' : 'Show advanced ambient controls'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {ambientMode === 'custom' && config.room_tone_enabled && ambientAdvancedOpen && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Cpu} label="Advanced & Diagnostics" />
            <Toggle
              checked={config.sensor_push_enabled}
              onChange={v => set('sensor_push_enabled', v)}
              label="Live sensor push"
              desc="Pi bridge streams readings to Supabase."
            />

            {config.sensor_push_enabled && sensorData && (
              <div className="mt-3 pt-3 border-t border-casa-divider">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                    <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">Color Temp</p>
                    <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{Math.round(sensorData.cct).toLocaleString()} K</p>
                  </div>
                  <div className="rounded-xl bg-casa-bg border border-casa-divider px-3 py-2.5">
                    <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-0.5">Illuminance</p>
                    <p className="text-body-sm font-semibold text-casa-navy tabular-nums">{sensorData.lux.toFixed(1)} lux</p>
                  </div>
                </div>
              </div>
            )}

            <SliderRow
              label="Min Brightness"
              desc="Floor when room is very dark (DDC 0–100)."
              value={config.brightness_min}
              min={0}
              max={40}
              onChange={v => set('brightness_min', v)}
            />
            <SliderRow
              label="Max Brightness"
              desc="Ceiling for daylight (DDC 0–100)."
              value={config.brightness_max}
              min={50}
              max={100}
              onChange={v => set('brightness_max', v)}
            />

            <div className="pt-3 border-t border-casa-divider">
              <p className="text-body-sm font-semibold text-casa-navy">Warmth scenarios</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => applyWarmthScenario('balanced')} className="px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors">Balanced</button>
                <button type="button" onClick={() => applyWarmthScenario('golden-hour')} className="px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors">Golden hour</button>
                <button type="button" onClick={() => applyWarmthScenario('movie-night')} className="px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors">Movie night</button>
                <button type="button" onClick={() => applyWarmthScenario('night-owl')} className="px-3 py-1.5 rounded-full border text-caption font-medium bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy transition-colors">Night owl</button>
              </div>
            </div>

            <SliderRow label="Global warmth bias" desc="DDC CCT shift in Kelvin." value={config.cct_bias_k} min={-1500} max={800} unit="K" onChange={v => set('cct_bias_k', v)} />
            <SliderRow label="Day bias" desc="Daylight condition bias." value={config.zone_cct_bias_day} min={-1200} max={800} unit="K" onChange={v => set('zone_cct_bias_day', v)} />
            <SliderRow label="Afternoon bias" desc="Afternoon condition bias." value={config.zone_cct_bias_afternoon} min={-1200} max={800} unit="K" onChange={v => set('zone_cct_bias_afternoon', v)} />
            <SliderRow label="Evening bias" desc="Evening condition bias." value={config.zone_cct_bias_evening} min={-1600} max={600} unit="K" onChange={v => set('zone_cct_bias_evening', v)} />
            <SliderRow label="Night bias" desc="Night condition bias." value={config.zone_cct_bias_night} min={-1800} max={400} unit="K" onChange={v => set('zone_cct_bias_night', v)} />
            <SliderRow label="Late-night bias" desc="Late-night condition bias." value={config.zone_cct_bias_late_night} min={-2200} max={300} unit="K" onChange={v => set('zone_cct_bias_late_night', v)} />
            <SliderRow label="Red channel trim" desc="Fine trim for red gain." value={config.rgb_trim_r} min={-15} max={15} unit="" onChange={v => set('rgb_trim_r', v)} />
            <SliderRow label="Green channel trim" desc="Fine trim for green gain." value={config.rgb_trim_g} min={-15} max={15} unit="" onChange={v => set('rgb_trim_g', v)} />
            <SliderRow label="Blue channel trim" desc="Fine trim for blue gain." value={config.rgb_trim_b} min={-15} max={15} unit="" onChange={v => set('rgb_trim_b', v)} />

            <Toggle
              checked={config.auto_sleep_enabled}
              onChange={v => set('auto_sleep_enabled', v)}
              label="Auto-sleep display"
              desc="Blank display in very dark rooms and wake on light."
            />
            {config.auto_sleep_enabled && (
              <>
                <SliderRow
                  label="Sleep threshold"
                  desc={`Room must drop below ${(config.sleep_lux_threshold).toFixed(1)} lux for ${config.sleep_delay_s}s.`}
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
        )}
      </div>

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
