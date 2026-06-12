import { useState, useEffect } from 'react'
import { CheckCircle, Monitor, Clock, Eye, Sunset, Sliders, Cpu, Palette, Image, ToggleLeft, Sun } from 'lucide-react'
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
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'

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

// ── Screensaver helper components ─────────────────────────────────

function StepPicker({ value, onChange, min, max, step = 1, unit }: {
  value: number; onChange: (v: number) => void
  min: number; max: number; step?: number; unit: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-9 h-9 rounded-full bg-casa-bg border border-casa-border text-casa-navy font-semibold font-display text-heading flex items-center justify-center active:scale-95 transition-transform"
      >−</button>
      <div className="min-w-[5rem] text-center">
        <span className="font-display text-display-sm text-casa-navy">{value}</span>
        <span className="text-caption text-casa-muted ml-1">{unit}</span>
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-9 h-9 rounded-full bg-casa-bg border border-casa-border text-casa-navy font-semibold font-display text-heading flex items-center justify-center active:scale-95 transition-transform"
      >+</button>
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-casa-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-medium text-casa-navy">{label}</p>
        {desc && <p className="text-caption text-casa-muted mt-0.5">{desc}</p>}
      </div>
      {children}
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
  const qc = useQueryClient()
  const { cfg: liveCfg, currentZone, sensorData } = useRoomTone()
  const { settings, update: updateScreensaver } = useScreensaverSettings()
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

          {/* Push toggle — always visible */}
          <Toggle
            checked={config.sensor_push_enabled}
            onChange={v => set('sensor_push_enabled', v)}
            label="Live sensor push"
            desc="Pi bridge streams readings to Supabase. Turn off to stop recording when not needed."
          />

          {/* Brightness range */}
          <SliderRow
            label="Min Brightness"
            desc="Floor when room is very dark (lux < 1). DDC scale 0–100."
            value={config.brightness_min}
            min={0} max={40}
            onChange={v => set('brightness_min', v)}
          />
          <SliderRow
            label="Max Brightness"
            desc="Ceiling for full daylight. DDC scale 0–100."
            value={config.brightness_max}
            min={50} max={100}
            onChange={v => set('brightness_max', v)}
          />

          {/* Auto-sleep */}
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
                min={1} max={30}
                unit=" ×0.1lux"
                onChange={v => set('sleep_lux_threshold', v / 10)}
              />
              <SliderRow
                label="Wake threshold"
                desc={`Wakes when lux rises above ${(config.wake_lux_threshold).toFixed(1)}.`}
                value={Math.round(config.wake_lux_threshold * 10)}
                min={5} max={100}
                unit=" ×0.1lux"
                onChange={v => set('wake_lux_threshold', v / 10)}
              />
              <SliderRow
                label="Sleep delay"
                desc="Seconds in darkness before sleeping."
                value={config.sleep_delay_s}
                min={5} max={120}
                unit="s"
                onChange={v => set('sleep_delay_s', v)}
              />
            </>
          )}

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
                        const color = ch === 'R' ? '#E05050' : ch === 'G' ? '#4CAF72' : '#5080E0'
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
          ) : (
            <p className="text-caption text-casa-muted mt-2">
              Push off — using <span className="font-medium text-casa-navy">time-of-day schedule</span>.
            </p>
          )}
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

      {/* ── Art Mode & Sleep divider ──────────────────── */}
      <div className="mt-8 mb-2 flex items-center gap-3">
        <div className="flex-1 h-px bg-casa-border" />
        <span className="flex items-center gap-2 px-1">
          <Sunset size={15} className="text-casa-gold" />
          <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Art Mode &amp; Sleep</span>
        </span>
        <div className="flex-1 h-px bg-casa-border" />
      </div>

      <div className="space-y-4">

        {/* ── Master toggles ──────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={ToggleLeft} label="Enable / Disable" />
          <Toggle
            checked={settings.enabled}
            onChange={v => updateScreensaver({ enabled: v })}
            label="Art Mode Screensaver"
            desc="Show artwork after idle timeout"
          />
          <div className={cn('transition-opacity', !settings.enabled && 'opacity-40 pointer-events-none')}>
            <Toggle
              checked={settings.displaySleepEnabled}
              onChange={v => updateScreensaver({ displaySleepEnabled: v })}
              label="Monitor Sleep"
              desc="Turn off display after a longer idle period"
            />
          </div>
        </div>

        {/* ── Timing ──────────────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Clock} label="Timers" />
          <Row label="Art mode after" desc="How long before artwork appears">
            <StepPicker
              value={settings.screensaverMins}
              onChange={v => updateScreensaver({ screensaverMins: v })}
              min={1} max={60} unit="min"
            />
          </Row>
          <Row label="Display off after" desc="How long before monitor turns off (must be > art mode)">
            <StepPicker
              value={settings.displayOffMins}
              onChange={v => updateScreensaver({ displayOffMins: Math.max(settings.screensaverMins + 1, v) })}
              min={2} max={120} unit="min"
            />
          </Row>
          <Row label="Painting rotation" desc="How long each artwork is shown">
            <StepPicker
              value={settings.rotationMins}
              onChange={v => updateScreensaver({ rotationMins: v })}
              min={1} max={60} unit="min"
            />
          </Row>
        </div>

        {/* ── Art size ────────────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Image} label="Artwork Size" />
          <Row label="Minimum art width" desc="Portrait paintings won't be smaller than this">
            <StepPicker
              value={settings.minArtWidthVw}
              onChange={v => updateScreensaver({ minArtWidthVw: v })}
              min={30} max={90} step={5} unit="vw"
            />
          </Row>
        </div>

        {/* ── Current Schedule preview ─────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Monitor} label="Current Schedule" />
          <div className="space-y-2 text-body-sm text-casa-muted">
            {settings.enabled ? (
              <>
                <p>🖼 Art mode starts after <span className="text-casa-navy font-medium">{settings.screensaverMins} min</span> idle</p>
                <p>🎨 Painting rotates every <span className="text-casa-navy font-medium">{settings.rotationMins} min</span></p>
                {settings.displaySleepEnabled && (
                  <p>😴 Monitor sleeps after <span className="text-casa-navy font-medium">{settings.displayOffMins} min</span> idle</p>
                )}
                <p>🗣 Say <span className="text-casa-navy font-medium">"Alexa"</span> or tap screen to wake</p>
              </>
            ) : (
              <p className="text-casa-muted">Art mode is disabled — screen will stay on.</p>
            )}
          </div>
        </div>

        {/* ── Display Brightness in Art Mode ───────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Sun} label="Display Brightness in Art Mode" />
          <p className="text-caption text-casa-muted mb-4">
            Monitor dims to <span className="font-medium text-casa-navy">{settings.artDimOffset}% below</span> the ambient light level — so the painting feels lit by the room, not glowing.
            Higher = darker relative to surroundings.
          </p>
          <Row label="Dim below ambient" desc="Relative to current room lux reading">
            <StepPicker
              value={settings.artDimOffset}
              onChange={v => updateScreensaver({ artDimOffset: v })}
              min={5} max={80} step={5} unit="%"
            />
          </Row>
          <p className="text-caption text-casa-muted mt-2">
            Example: room at 300 lux → auto brightness 70 → art mode at {settings.artDimOffset}% below = {Math.round(70 * (1 - settings.artDimOffset / 100))}
          </p>
        </div>

        {/* ── Mat Style ───────────────────────────────── */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Palette} label="Mat Style" />
          <p className="text-body-sm text-casa-muted">
            Adaptive linen mat with subtle canvas grain texture. Each painting gets a complementary mat color extracted from the artwork itself — warm neutrals for bright pieces, cooler tones for darker works. Includes realistic bevel shadow, vignetting, and lighting simulation for museum-quality presentation.
          </p>
          <div className="mt-3 flex items-center gap-2 text-caption text-casa-muted">
            <span className="text-casa-gold">✓</span> Adaptive color from artwork
          </div>
          <div className="flex items-center gap-2 text-caption text-casa-muted mt-1">
            <span className="text-casa-gold">✓</span> Paper texture grain overlay
          </div>
          <div className="flex items-center gap-2 text-caption text-casa-muted mt-1">
            <span className="text-casa-gold">✓</span> Realistic frame effect
          </div>
          <div className="flex items-center gap-2 text-caption text-casa-muted mt-1">
            <span className="text-casa-gold">✓</span> Gallery label auto-fades after a few seconds
          </div>
          <button
            type="button"
            onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
            className="mt-4 px-4 py-2 rounded-lg text-body-sm font-medium bg-casa-gold text-white hover:bg-casa-gold/90 transition-colors"
          >
            Preview Art Mode
          </button>
        </div>

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
