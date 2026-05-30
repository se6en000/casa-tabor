/**
 * ThemeSettingsPage — live color customization for Casa Tabor.
 * All changes apply instantly; no save button required.
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Palette } from 'lucide-react'
import { useTheme, PRESETS, DEFAULTS, type ThemeColors } from '../contexts/ThemeContext'
import { cn } from '../utils/cn'

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; desc: string }[] = [
  { key: 'casa-gold',    label: 'Accent Color',       desc: 'Icons, highlights, buttons, badges' },
  { key: 'casa-navy',    label: 'Primary Color',      desc: 'Navigation, headers, dark elements' },
  { key: 'casa-bg',      label: 'Background',         desc: 'Main page background' },
  { key: 'casa-surface', label: 'Card / Panel',       desc: 'Cards, panels, input backgrounds' },
  { key: 'casa-text',    label: 'Body Text',          desc: 'Primary text color' },
  { key: 'casa-border',  label: 'Borders & Dividers', desc: 'Card borders, divider lines' },
]

export default function ThemeSettingsPage() {
  const navigate = useNavigate()
  const { colors, setColor, applyPreset, resetToDefaults, isDefault } = useTheme()

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="max-w-2xl mx-auto p-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-casa-muted hover:text-casa-navy text-sm transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="flex items-center gap-3 mb-1">
        <Palette size={22} className="text-casa-gold" />
        <h1 className="font-display text-display-md text-casa-navy">Theme & Colors</h1>
      </div>
      <p className="text-casa-muted text-sm mb-8">
        Changes apply instantly — no save needed. Your theme persists across sessions.
      </p>

      {/* Preset palettes */}
      <section className="mb-8">
        <h2 className="font-display text-heading text-casa-navy mb-3">Presets</h2>
        <div className="grid grid-cols-3 gap-3">
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
                <p className="text-[11px] font-semibold" style={{ color: preset.colors['casa-navy'] }}>
                  {preset.emoji} {preset.label}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Individual color pickers */}
      <section className="mb-8">
        <h2 className="font-display text-heading text-casa-navy mb-3">Custom Colors</h2>
        <div className="bg-casa-surface rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
          {COLOR_FIELDS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-4 px-4 py-3.5">
              {/* Color swatch + picker */}
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
                <p className="text-sm font-semibold text-casa-navy leading-tight">{label}</p>
                <p className="text-xs text-casa-muted mt-0.5">{desc}</p>
              </div>

              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-casa-muted bg-casa-bg px-2 py-1 rounded-md">
                  {colors[key].toUpperCase()}
                </code>
                {colors[key] !== DEFAULTS[key] && (
                  <button
                    onClick={() => setColor(key, DEFAULTS[key])}
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
      </section>

      {/* Live preview strip */}
      <section className="mb-8">
        <h2 className="font-display text-heading text-casa-navy mb-3">Preview</h2>
        <div className="rounded-2xl overflow-hidden border border-casa-border shadow-sm">
          {/* Header bar */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: colors['casa-navy'] }}>
            <span className="font-display text-sm font-semibold text-white">Casa Tabor</span>
            <div className="w-2 h-2 rounded-full" style={{ background: colors['casa-gold'] }} />
          </div>
          {/* Card */}
          <div className="p-4" style={{ background: colors['casa-bg'] }}>
            <div className="rounded-xl p-3 border" style={{ background: colors['casa-surface'], borderColor: colors['casa-border'] }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: colors['casa-gold'] }}>J</div>
                <span className="text-sm font-semibold" style={{ color: colors['casa-navy'] }}>Jake's Event</span>
              </div>
              <p className="text-xs" style={{ color: colors['casa-text'] }}>Thursday · 3:00 PM – 4:00 PM</p>
              <div className="mt-2 pt-2 border-t" style={{ borderColor: colors['casa-border'] }}>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: colors['casa-gold'] }}>Work</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reset to defaults */}
      {!isDefault && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">Custom theme active</p>
            <p className="text-xs text-amber-600 mt-0.5">Restore original Casa Tabor colors</p>
          </div>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 bg-white border border-amber-300 text-amber-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm"
          >
            <RotateCcw size={14} />
            Reset to defaults
          </button>
        </div>
      )}
    </div>
    </div>
  )
}
