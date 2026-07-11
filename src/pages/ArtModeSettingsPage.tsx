import { useEffect, useRef, useState } from 'react'
import { Image, Clock, Sun, Palette, Monitor, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import { useArtFeedPrefs, MEDIA_OPTIONS } from '../hooks/useArtFeedPrefs'
import { cn } from '../utils/cn'
import { SettingsPageHeader, SettingsToggle as Toggle } from '../components/settings'
import { Button, Checkbox, IconButton, SectionHeader as SharedSectionHeader } from '../components/ui'

const COASTAL_STARTER_ARTISTS = [
  'Winslow Homer',
  'Martin Johnson Heade',
  'Claude Monet',
  'Childe Hassam',
  'William Trost Richards',
  'Emil Carlsen',
  'John Singer Sargent',
]

const COASTAL_STARTER_KEYWORDS = [
  'West Palm Beach',
  'Tropical',
  'Coastal',
  'Beach',
  'Sunshine',
  'Palm trees',
  'Caribbean',
  'Ocean',
  'Seascape',
  'Florida',
]

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <SharedSectionHeader icon={Icon} title={label} compact className="mb-2" />
}

function StepPicker({ value, onChange, min, max, step = 1, unit }: {
  value: number; onChange: (v: number) => void
  min: number; max: number; step?: number; unit: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={() => onChange(Math.max(min, value - step))}
        className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold font-display text-heading flex items-center justify-center active:scale-95 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-casa-gold"
        aria-label={`Decrease ${unit}`}
      >−</Button>
      <div className="min-w-[5rem] text-center">
        <span className="font-display text-display-sm text-casa-navy">{value}</span>
        <span className="text-caption text-casa-muted ml-1">{unit}</span>
      </div>
      <Button
        onClick={() => onChange(Math.min(max, value + step))}
        className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold font-display text-heading flex items-center justify-center active:scale-95 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-casa-gold"
        aria-label={`Increase ${unit}`}
      >+</Button>
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

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  maxTags,
}: {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder: string
  maxTags: number
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const commitInput = () => {
    const val = input.trim()
    if (!val || tags.includes(val) || tags.length >= maxTags) {
      setInput('')
      return
    }
    onAdd(val)
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-casa-navy text-white text-caption px-2.5 py-1 rounded-full"
          >
            {tag}
            <Button
              type="button"
              onClick={() => onRemove(tag)}
              className="hover:text-red-200 transition-colors"
            >
              <X size={11} />
            </Button>
          </span>
        ))}
      </div>
      {tags.length < maxTags && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commitInput()
              }
            }}
            placeholder={placeholder}
            className="flex-1 text-body-sm bg-casa-bg border border-casa-border rounded-xl px-3 py-2 text-casa-navy placeholder:text-casa-muted focus:outline-none focus:border-casa-navy/40"
          />
          <IconButton
            type="button"
            onClick={commitInput}
            disabled={!input.trim()}
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            aria-label="Add artist"
          />
        </div>
      )}
      {tags.length >= maxTags && (
        <p className="text-caption text-casa-muted">Maximum {maxTags} entries reached.</p>
      )}
    </div>
  )
}

export default function ArtModeSettingsPage() {
  const { settings, update: updateScreensaver } = useScreensaverSettings()
  const { prefs, update: updatePrefs } = useArtFeedPrefs()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [yearFromInput, setYearFromInput] = useState('')
  const [yearToInput, setYearToInput] = useState('')

  const curatedMode = prefs.feedMode === 'curated'

  useEffect(() => {
    setYearFromInput(prefs.yearFrom != null ? String(prefs.yearFrom) : '')
  }, [prefs.yearFrom])

  useEffect(() => {
    setYearToInput(prefs.yearTo != null ? String(prefs.yearTo) : '')
  }, [prefs.yearTo])

  const setFeedMode = (mode: 'auto' | 'curated') => {
    updatePrefs({ feedMode: mode })
    if (mode === 'auto') setAdvancedOpen(false)
  }

  const toggleMediaType = (id: string) => {
    const next = prefs.mediaTypes.includes(id)
      ? prefs.mediaTypes.filter(m => m !== id)
      : [...prefs.mediaTypes, id]
    updatePrefs({ mediaTypes: next })
  }

  const applyCoastalStarterTheme = () => {
    updatePrefs({
      feedMode: 'curated',
      artists: uniqueTrimmed(COASTAL_STARTER_ARTISTS).slice(0, 10),
      keywords: uniqueTrimmed(COASTAL_STARTER_KEYWORDS).slice(0, 10),
    })
  }

  const commitYear = (key: 'yearFrom' | 'yearTo', raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      updatePrefs({ [key]: null })
      return
    }
    const parsed = parseInt(trimmed, 10)
    updatePrefs({ [key]: Number.isFinite(parsed) ? parsed : null })
  }

  return (
    <>
      <div className="mb-6">
        <SettingsPageHeader icon={Image} title="Art Mode" description="Simple gallery controls first, curation when you want it" />
      </div>

      <div className="space-y-4">
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <SectionHeader icon={Monitor} label="Mode" />
          <Toggle
            checked={settings.enabled}
            onChange={v => updateScreensaver({ enabled: v })}
            label="Art Mode screensaver"
            desc="Show artwork when the display is idle."
          />

          {settings.enabled && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => setFeedMode('auto')}
                className={cn(
                  'px-3 py-2 rounded-xl border text-body-sm font-semibold transition-colors',
                  !curatedMode
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
                )}
              >
                Auto Gallery (Recommended)
              </Button>
              <Button
                type="button"
                onClick={() => setFeedMode('curated')}
                className={cn(
                  'px-3 py-2 rounded-xl border text-body-sm font-semibold transition-colors',
                  curatedMode
                    ? 'bg-casa-navy text-white border-casa-navy'
                    : 'bg-white text-casa-muted border-casa-border hover:border-casa-navy/40 hover:text-casa-navy'
                )}
              >
                Curated Gallery
              </Button>
            </div>
          )}

          <Button
            type="button"
            onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
            disabled={!settings.enabled}
            className={cn(
              'mt-4 w-full py-2.5 rounded-xl text-body-sm font-semibold transition-all',
              settings.enabled
                ? 'bg-casa-gold text-white hover:bg-casa-gold/90 active:scale-95'
                : 'bg-casa-border text-casa-muted cursor-not-allowed'
            )}
          >
            ▶ Preview Art Mode
          </Button>
        </div>

        {settings.enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Clock} label="Playback" />
            <Row label="Start art mode after" desc="Idle delay before artwork appears">
              <StepPicker
                value={settings.screensaverMins}
                onChange={v => updateScreensaver({ screensaverMins: v })}
                min={1} max={60} unit="min"
              />
            </Row>
            <Row label="Rotate artwork every" desc="How long each artwork stays on screen">
              <StepPicker
                value={settings.rotationMins}
                onChange={v => updateScreensaver({ rotationMins: v })}
                min={1} max={60} unit="min"
              />
            </Row>
            <Toggle
              checked={settings.displaySleepEnabled}
              onChange={v => updateScreensaver({ displaySleepEnabled: v })}
              label="Monitor sleep in Art Mode"
              desc="Turn the display off after prolonged idle."
            />
            {settings.displaySleepEnabled && (
              <Row label="Sleep display after" desc="Must stay longer than art mode delay">
                <StepPicker
                  value={settings.displayOffMins}
                  onChange={v => updateScreensaver({ displayOffMins: Math.max(settings.screensaverMins + 1, v) })}
                  min={2} max={120} unit="min"
                />
              </Row>
            )}
          </div>
        )}

        {settings.enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Sun} label="Look & Feel" />
            <Row label="Dim below ambient" desc="Keeps artwork feeling like wall art, not a bright dashboard">
              <StepPicker
                value={settings.artDimOffset}
                onChange={v => updateScreensaver({ artDimOffset: v })}
                min={5} max={80} step={5} unit="%"
              />
            </Row>
            <Row label="Minimum art width" desc="Portrait works won’t render smaller than this">
              <StepPicker
                value={settings.minArtWidthVw}
                onChange={v => updateScreensaver({ minArtWidthVw: v })}
                min={30} max={90} step={5} unit="vw"
              />
            </Row>
          </div>
        )}

        {settings.enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Palette} label="Collection" />
            {!curatedMode && (
              <p className="text-caption text-casa-muted">
                Auto Gallery uses balanced, modern-leaning public-domain pulls across Met, Art Institute, and Europeana.
              </p>
            )}

            {curatedMode && (
              <>
                <div className="rounded-xl border border-casa-border bg-casa-bg p-3 mb-4">
                  <p className="text-body-sm font-semibold text-casa-navy">Starter themes</p>
                  <p className="text-caption text-casa-muted mt-0.5 mb-2">Quickly prefill a coastal modern vibe, then tweak it.</p>
                  <Button
                    type="button"
                    onClick={applyCoastalStarterTheme}
                    className="px-3.5 py-2 rounded-xl bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 transition-colors"
                  >
                    Load West Palm Coastal Starter
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-body-sm font-semibold text-casa-navy mb-1">Artists</p>
                    <TagInput
                      tags={prefs.artists}
                      onAdd={name => updatePrefs({ artists: [...prefs.artists, name] })}
                      onRemove={name => updatePrefs({ artists: prefs.artists.filter(a => a !== name) })}
                      placeholder="e.g. David Hockney"
                      maxTags={10}
                    />
                  </div>

                  <div>
                    <p className="text-body-sm font-semibold text-casa-navy mb-1">Subjects / Keywords</p>
                    <TagInput
                      tags={prefs.keywords}
                      onAdd={keyword => updatePrefs({ keywords: [...prefs.keywords, keyword] })}
                      onRemove={keyword => updatePrefs({ keywords: prefs.keywords.filter(k => k !== keyword) })}
                      placeholder="e.g. abstract, city, neon, coastal"
                      maxTags={10}
                    />
                  </div>

                  <div>
                    <p className="text-body-sm font-semibold text-casa-navy mb-2">Media Types</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MEDIA_OPTIONS.map(opt => {
                        const checked = prefs.mediaTypes.includes(opt.id)
                        return (
                          <Checkbox
                            key={opt.id}
                            checked={checked}
                            onChange={() => toggleMediaType(opt.id)}
                            label={opt.label}
                            className="rounded-button border border-casa-border bg-casa-bg px-3"
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => setAdvancedOpen(v => !v)}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-casa-border text-casa-muted hover:text-casa-navy hover:border-casa-navy/40 transition-colors"
                >
                  Advanced filters {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>

                {advancedOpen && (
                  <div className="mt-4 pt-4 border-t border-casa-border space-y-4">
                    <div>
                      <p className="text-body-sm font-semibold text-casa-navy mb-1">Source galleries</p>
                      <Toggle
                        checked={prefs.useMet}
                        onChange={v => updatePrefs({ useMet: v })}
                        label="The Metropolitan Museum of Art"
                        desc="Classic + modern public-domain collection."
                      />
                      <Toggle
                        checked={prefs.useArtic}
                        onChange={v => updatePrefs({ useArtic: v })}
                        label="Art Institute of Chicago"
                        desc="Strong modern and contemporary depth."
                      />
                      <Toggle
                        checked={prefs.useEuropeana}
                        onChange={v => updatePrefs({ useEuropeana: v })}
                        label="Europeana partner galleries"
                        desc="Broader modern-leaning European institutions."
                      />
                      {!prefs.useMet && !prefs.useArtic && !prefs.useEuropeana && (
                        <p className="text-caption text-amber-700 mt-1">Enable at least one source gallery.</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-caption text-casa-muted block mb-1">From year</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="e.g. 1900"
                          value={yearFromInput}
                          onChange={e => setYearFromInput(e.target.value)}
                          onBlur={() => commitYear('yearFrom', yearFromInput)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              commitYear('yearFrom', yearFromInput)
                              ;(e.currentTarget as HTMLInputElement).blur()
                            }
                          }}
                          className="w-full text-body-sm bg-casa-bg border border-casa-border rounded-xl px-3 py-2 text-casa-navy placeholder:text-casa-muted focus:outline-none focus:border-casa-navy/40"
                        />
                      </div>
                      <span className="text-casa-muted text-body-sm mt-5">→</span>
                      <div className="flex-1">
                        <label className="text-caption text-casa-muted block mb-1">To year</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="e.g. 2020"
                          value={yearToInput}
                          onChange={e => setYearToInput(e.target.value)}
                          onBlur={() => commitYear('yearTo', yearToInput)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              commitYear('yearTo', yearToInput)
                              ;(e.currentTarget as HTMLInputElement).blur()
                            }
                          }}
                          className="w-full text-body-sm bg-casa-bg border border-casa-border rounded-xl px-3 py-2 text-casa-navy placeholder:text-casa-muted focus:outline-none focus:border-casa-navy/40"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-body-sm font-semibold text-casa-navy mb-1">Culture / Origin</p>
                      <TagInput
                        tags={prefs.cultures}
                        onAdd={c => updatePrefs({ cultures: [...prefs.cultures, c] })}
                        onRemove={c => updatePrefs({ cultures: prefs.cultures.filter(x => x !== c) })}
                        placeholder="e.g. American, Japanese, French"
                        maxTags={4}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {settings.enabled && (
          <div className="rounded-2xl border border-casa-border bg-casa-bg px-4 py-3 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-caption text-casa-muted">🖼 Art after <span className="text-casa-navy font-medium">{settings.screensaverMins}m</span></span>
            <span className="text-caption text-casa-muted">🎨 Rotates every <span className="text-casa-navy font-medium">{settings.rotationMins}m</span></span>
            {settings.displaySleepEnabled && (
              <span className="text-caption text-casa-muted">😴 Sleep after <span className="text-casa-navy font-medium">{settings.displayOffMins}m</span></span>
            )}
            <span className="text-caption text-casa-muted">🗣 “Alexa” or tap to wake</span>
          </div>
        )}
      </div>
    </>
  )
}
