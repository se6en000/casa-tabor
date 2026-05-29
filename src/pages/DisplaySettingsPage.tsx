import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Save, CheckCircle, Monitor, Clock, Eye, Sunset, Sliders, Cpu } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
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
      style={{ filter, transition: 'filter 1.5s ease-in-out' }}
    >
      {/* Simulated screen content */}
      <div className="bg-[#FAF8F5] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-display text-[#1B2A4A] text-xl font-semibold">Thursday</div>
            <div className="text-[#8C8C8C] text-xs mt-0.5">May 28 · 7:00 PM</div>
          </div>
          <div className="text-right">
            <div className="text-[#8C8C8C] text-xs">72°F · Partly Cloudy</div>
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
              <span className="text-[#2D2D2D] text-xs flex-1 truncate">{e.label}</span>
              <span className="text-[#8C8C8C] text-xs">{e.time}</span>
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
          className="w-7 h-7 rounded-full border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 transition-colors text-sm"
        >−</button>
        <span className="w-16 text-center text-body-sm font-medium text-casa-navy tabular-nums">{display}</span>
        <button
          type="button"
          onClick={() => onChange((value + 1) % 24)}
          className="w-7 h-7 rounded-full border border-casa-border flex items-center justify-center text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 transition-colors text-sm"
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
      <div className="flex justify-between text-[10px] text-casa-muted mt-1 px-0.5">
        <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────

export default function DisplaySettingsPage() {
  const qc = useQueryClient()
  const { cfg: liveCfg, currentZone } = useRoomTone()
  const [config, setConfig] = useState<DisplayConfig>(DISPLAY_DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [previewZone, setPreviewZone] = useState<RoomToneZone>('day')

  useEffect(() => {
    setConfig({ ...DISPLAY_DEFAULTS, ...liveCfg })
    setPreviewZone(currentZone === 'manual' ? 'evening' : currentZone)
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const set = <K extends keyof DisplayConfig>(key: K, value: DisplayConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }))

  const enableManualOverride = (on: boolean) => {
    const expires = on ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null
    setConfig(prev => ({ ...prev, manual_override: on, override_expires_at: expires }))
  }

  // Live preview filter
  const previewFilter = config.manual_override
    ? `sepia(${config.manual_warmth.toFixed(2)}) brightness(${config.manual_brightness.toFixed(2)})`
    : ZONE_FILTER[previewZone]

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-caption text-casa-muted hover:text-casa-navy mb-6 transition-colors">
        <ChevronLeft size={15} /> Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-full bg-casa-bg border border-casa-border flex items-center justify-center text-casa-gold">
          <Monitor size={18} />
        </span>
        <div>
          <h1 className="font-display text-display-sm text-casa-navy">Display & Room Tone</h1>
          <p className="text-caption text-casa-muted">Warm screen adaptive display — feels like a painting, not a monitor</p>
        </div>
      </div>

      <div className="space-y-4">

        {/* ── Room Tone Master ─────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sunset} label="Room Tone" />
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
              <HourPicker label="☀️  Day begins" value={config.schedule_day_hour} onChange={v => set('schedule_day_hour', v)} />
              <HourPicker label="🌤  Afternoon begins" value={config.schedule_afternoon_hour} onChange={v => set('schedule_afternoon_hour', v)} />
              <HourPicker label="🌇  Evening begins" value={config.schedule_evening_hour} onChange={v => set('schedule_evening_hour', v)} />
              <HourPicker label="🌙  Night begins" value={config.schedule_night_hour} onChange={v => set('schedule_night_hour', v)} />
              <HourPicker label="🕯  Late Night begins" value={config.schedule_late_night_hour} onChange={v => set('schedule_late_night_hour', v)} />
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
                    style={{ background: `linear-gradient(to right, #FAF8F5, #D4845A ${config.manual_warmth * 200}%, #E8E2D9 ${config.manual_warmth * 200}%)` }}
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

        {/* ── Sensor Status ─────────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Cpu} label="Sensor Array" />
          <p className="text-caption text-casa-muted mb-3">
            When the Pi sensor array is connected, it will replace the time schedule with real-time lux + color temperature readings.
          </p>
          <div className="space-y-2">
            {[
              { name: 'AS7343 — 14-channel spectral (color temp)', status: 'not connected' },
              { name: 'LTR390 — Precision lux + UV index',         status: 'not connected' },
              { name: 'APDS9960 — Proximity wake detection',       status: 'not connected' },
            ].map(s => (
              <div key={s.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-casa-bg border border-casa-divider">
                <span className="text-caption text-casa-navy">{s.name}</span>
                <span className="text-caption text-casa-muted italic">{s.status}</span>
              </div>
            ))}
          </div>
          <p className="text-caption text-casa-muted mt-3">
            Using <span className="font-medium text-casa-navy">time-of-day schedule</span> as proxy until sensors are wired.
          </p>
        </div>

        {/* ── Home Screen visibility ───────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Eye} label="Home Screen Sections" />
          <div className="divide-y divide-casa-divider">
            <Toggle checked={config.show_weather} onChange={v => set('show_weather', v)} label="Weather" desc="Current conditions at the top" />
            <Toggle checked={config.show_briefing_on_home} onChange={v => set('show_briefing_on_home', v)} label="Daily Briefing" desc="AI briefing card" />
            <Toggle checked={config.show_conflicts} onChange={v => set('show_conflicts', v)} label="Conflict Alerts" desc="Scheduling conflicts & logistics gaps" />
            <Toggle checked={config.show_prep_alerts} onChange={v => set('show_prep_alerts', v)} label="Prep Alerts" desc="Upcoming birthdays, deadlines, and to-dos" />
          </div>
        </div>

        {/* ── Clock ────────────────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Clock} label="Clock & Calendar" />
          <div className="space-y-4 mt-1">
            <div>
              <label className="block text-body-sm font-medium text-casa-navy mb-2">
                Events ahead <span className="text-casa-muted font-normal">({config.calendar_days_ahead} days)</span>
              </label>
              <input type="range" min={1} max={30} value={config.calendar_days_ahead}
                onChange={e => set('calendar_days_ahead', Number(e.target.value))}
                className="w-full accent-casa-navy"
              />
              <div className="flex justify-between text-caption text-casa-muted mt-1">
                <span>1 day</span><span>30 days</span>
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-casa-navy mb-2">Clock Format</label>
              <div className="flex gap-2">
                {(['12h', '24h'] as const).map(fmt => (
                  <button key={fmt} type="button" onClick={() => set('clock_format', fmt)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-body-sm font-medium border transition-colors',
                      config.clock_format === fmt
                        ? 'bg-casa-navy text-white border-casa-navy'
                        : 'bg-white text-casa-navy border-casa-border hover:border-casa-navy/40'
                    )}
                  >
                    {fmt === '12h' ? '12-hour (3:00 PM)' : '24-hour (15:00)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Save */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-body-sm font-semibold transition-colors',
            saved ? 'bg-green-100 text-green-700' : 'bg-casa-navy text-white hover:bg-casa-navy/90'
          )}
        >
          {saved ? <><CheckCircle size={16} /> Saved</> : <><Save size={16} /> {saveMutation.isPending ? 'Saving…' : 'Save'}</>}
        </button>
      </div>
    </div>
  )
}
