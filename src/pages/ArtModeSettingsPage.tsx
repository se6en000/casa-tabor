import { useState, useRef } from 'react'
import { Image, Clock, Eye, Sun, ToggleLeft, Palette, Monitor, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import { useArtFeedPrefs, MEDIA_OPTIONS } from '../hooks/useArtFeedPrefs'
import { cn } from '../utils/cn'

// ── Shared helpers ──────────────────────────────────────────────────────────

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

function DividerLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mt-8 mb-4 flex items-center gap-3">
      <div className="flex-1 h-px bg-casa-border" />
      <span className="flex items-center gap-2 px-1">
        <Icon size={15} className="text-casa-gold" />
        <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">{label}</span>
      </span>
      <div className="flex-1 h-px bg-casa-border" />
    </div>
  )
}

// ── Tag input for artists / cultures ───────────────────────────────────────

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
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="hover:text-red-200 transition-colors"
            >
              <X size={11} />
            </button>
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
          <button
            type="button"
            onClick={commitInput}
            disabled={!input.trim()}
            className="px-3 py-2 rounded-xl bg-casa-bg border border-casa-border text-casa-navy disabled:opacity-40 hover:border-casa-navy/40 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
      {tags.length >= maxTags && (
        <p className="text-caption text-casa-muted">Maximum {maxTags} entries reached.</p>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ArtModeSettingsPage() {
  const { settings, update: updateScreensaver } = useScreensaverSettings()
  const { prefs, update: updatePrefs } = useArtFeedPrefs()
  const [feedExpanded, setFeedExpanded] = useState(true)

  const toggleMediaType = (id: string) => {
    const next = prefs.mediaTypes.includes(id)
      ? prefs.mediaTypes.filter(m => m !== id)
      : [...prefs.mediaTypes, id]
    updatePrefs({ mediaTypes: next })
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-full bg-casa-bg border border-casa-border flex items-center justify-center text-casa-gold">
          <Image size={18} />
        </span>
        <div>
          <h1 className="font-display text-display-sm text-casa-navy">Art Mode</h1>
          <p className="text-caption text-casa-muted">Screensaver timing, artwork sources, and feed preferences</p>
        </div>
      </div>

      <div className="space-y-4">

        {/* ── SCREENSAVER ─────────────────────────────────────────────────── */}

        <DividerLabel icon={ToggleLeft} label="Screensaver" />

        {/* Enable / Disable */}
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

        {settings.enabled && (
          <div className="space-y-4">

            {/* Timers */}
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

            {/* Art size */}
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

            {/* Display brightness */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Sun} label="Display Brightness in Art Mode" />
              <p className="text-caption text-casa-muted mb-4">
                Monitor dims to <span className="font-medium text-casa-navy">{settings.artDimOffset}% below</span> the ambient light level — so the painting feels lit by the room, not glowing.
              </p>
              <Row label="Dim below ambient" desc="Relative to current room lux reading">
                <StepPicker
                  value={settings.artDimOffset}
                  onChange={v => updateScreensaver({ artDimOffset: v })}
                  min={5} max={80} step={5} unit="%"
                />
              </Row>
            </div>

            {/* Mat style */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Palette} label="Mat Style" />
              <p className="text-body-sm text-casa-muted">
                Adaptive linen mat with subtle canvas grain texture. Each painting gets a complementary mat color extracted from the artwork itself — warm neutrals for bright pieces, cooler tones for darker works. Includes realistic bevel shadow, vignetting, and lighting simulation for museum-quality presentation.
              </p>
              <div className="mt-3 space-y-1">
                {['Adaptive color from artwork', 'Paper texture grain overlay', 'Realistic frame effect', 'Gallery label auto-fades after a few seconds'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-caption text-casa-muted">
                    <span className="text-casa-gold">✓</span> {f}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
                className="mt-4 px-4 py-2 rounded-lg text-body-sm font-medium bg-casa-gold text-white hover:bg-casa-gold/90 transition-colors"
              >
                Preview Art Mode
              </button>
            </div>

            {/* Schedule summary */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Monitor} label="Current Schedule" />
              <div className="space-y-2 text-body-sm text-casa-muted">
                <p>🖼 Art mode starts after <span className="text-casa-navy font-medium">{settings.screensaverMins} min</span> idle</p>
                <p>🎨 Painting rotates every <span className="text-casa-navy font-medium">{settings.rotationMins} min</span></p>
                {settings.displaySleepEnabled && (
                  <p>😴 Monitor sleeps after <span className="text-casa-navy font-medium">{settings.displayOffMins} min</span> idle</p>
                )}
                <p>🗣 Say <span className="text-casa-navy font-medium">"Alexa"</span> or tap screen to wake</p>
              </div>
            </div>

          </div>
        )}

        {/* ── ART FEED ─────────────────────────────────────────────────────── */}

        <button
          type="button"
          onClick={() => setFeedExpanded(v => !v)}
          className="mt-8 w-full flex items-center gap-3"
        >
          <div className="flex-1 h-px bg-casa-border" />
          <span className="flex items-center gap-2 px-1">
            <Eye size={15} className="text-casa-gold" />
            <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Art Feed</span>
            {feedExpanded ? <ChevronUp size={13} className="text-casa-muted" /> : <ChevronDown size={13} className="text-casa-muted" />}
          </span>
          <div className="flex-1 h-px bg-casa-border" />
        </button>

        {feedExpanded && (
          <div className="space-y-4">

            <p className="text-caption text-casa-muted px-1">
              Artwork is fetched live from the <span className="text-casa-navy font-medium">Met Museum</span> and <span className="text-casa-navy font-medium">Art Institute of Chicago</span> open-access APIs. All works are public domain. Changes take effect on the next artwork rotation cycle.
            </p>

            {/* Museum sources */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Monitor} label="Museum Sources" />
              <Toggle
                checked={prefs.useMet}
                onChange={v => updatePrefs({ useMet: v })}
                label="The Metropolitan Museum of Art"
                desc="Large collection — over 470,000 public domain works"
              />
              <Toggle
                checked={prefs.useArtic}
                onChange={v => updatePrefs({ useArtic: v })}
                label="Art Institute of Chicago"
                desc="Strong American and impressionist collections"
              />
            </div>

            {/* Artists */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Eye} label="Artists" />
              <p className="text-caption text-casa-muted mb-3">
                Add up to 10 artists. Searches both museums for their works. Leave empty to use our curated feed.
              </p>
              <TagInput
                tags={prefs.artists}
                onAdd={name => updatePrefs({ artists: [...prefs.artists, name] })}
                onRemove={name => updatePrefs({ artists: prefs.artists.filter(a => a !== name) })}
                placeholder="e.g. Winslow Homer"
                maxTags={10}
              />
              {prefs.artists.length === 0 && (
                <p className="text-caption text-casa-muted mt-3 italic">Using curated tropical & coastal art feed.</p>
              )}
            </div>

            {/* Media types */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Palette} label="Media Types" />
              <p className="text-caption text-casa-muted mb-3">
                Filter artworks to specific mediums. Leave all unchecked to allow any painted medium.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MEDIA_OPTIONS.map(opt => {
                  const checked = prefs.mediaTypes.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleMediaType(opt.id)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors',
                        checked
                          ? 'bg-casa-navy/5 border-casa-navy text-casa-navy'
                          : 'bg-casa-bg border-casa-border text-casa-muted hover:border-casa-navy/30 hover:text-casa-navy'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded flex items-center justify-center shrink-0 border',
                        checked ? 'bg-casa-navy border-casa-navy' : 'border-casa-border'
                      )}>
                        {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                      </div>
                      <span className="text-body-sm font-medium leading-tight">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time period */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Clock} label="Time Period" />
              <p className="text-caption text-casa-muted mb-3">
                Limit artworks to a specific era. Leave blank for no restriction.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-caption text-casa-muted block mb-1">From year</label>
                  <input
                    type="number"
                    min={1000}
                    max={2000}
                    placeholder="e.g. 1800"
                    value={prefs.yearFrom ?? ''}
                    onChange={e => updatePrefs({ yearFrom: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full text-body-sm bg-casa-bg border border-casa-border rounded-xl px-3 py-2 text-casa-navy placeholder:text-casa-muted focus:outline-none focus:border-casa-navy/40"
                  />
                </div>
                <span className="text-casa-muted text-body-sm mt-5">→</span>
                <div className="flex-1">
                  <label className="text-caption text-casa-muted block mb-1">To year</label>
                  <input
                    type="number"
                    min={1000}
                    max={2024}
                    placeholder="e.g. 1930"
                    value={prefs.yearTo ?? ''}
                    onChange={e => updatePrefs({ yearTo: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full text-body-sm bg-casa-bg border border-casa-border rounded-xl px-3 py-2 text-casa-navy placeholder:text-casa-muted focus:outline-none focus:border-casa-navy/40"
                  />
                </div>
              </div>
              {(prefs.yearFrom !== null || prefs.yearTo !== null) && (
                <button
                  type="button"
                  onClick={() => updatePrefs({ yearFrom: null, yearTo: null })}
                  className="mt-2 text-caption text-casa-muted hover:text-casa-navy transition-colors"
                >
                  Clear range
                </button>
              )}
            </div>

            {/* Culture */}
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
              <SectionHeader icon={Eye} label="Culture / Origin" />
              <p className="text-caption text-casa-muted mb-3">
                Filter by cultural origin (e.g. "American", "French", "Dutch"). Leave empty for any.
              </p>
              <TagInput
                tags={prefs.cultures}
                onAdd={c => updatePrefs({ cultures: [...prefs.cultures, c] })}
                onRemove={c => updatePrefs({ cultures: prefs.cultures.filter(x => x !== c) })}
                placeholder="e.g. American"
                maxTags={4}
              />

              {/* Quick culture chips */}
              {prefs.cultures.length === 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['American', 'French', 'British', 'Dutch', 'Italian'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updatePrefs({ cultures: [c] })}
                      className="text-caption px-2.5 py-1 rounded-full border border-casa-border text-casa-muted hover:border-casa-navy/30 hover:text-casa-navy transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Feed summary */}
            <div className="rounded-2xl border border-casa-border bg-casa-bg px-4 py-3">
              <p className="text-caption font-semibold text-casa-navy mb-1">Current Feed Config</p>
              <div className="space-y-1 text-caption text-casa-muted">
                <p>
                  🎨 Artists: <span className="text-casa-navy font-medium">
                    {prefs.artists.length > 0 ? prefs.artists.join(', ') : 'Curated tropical & coastal'}
                  </span>
                </p>
                <p>
                  🖌 Media: <span className="text-casa-navy font-medium">
                    {prefs.mediaTypes.length > 0
                      ? prefs.mediaTypes.map(id => MEDIA_OPTIONS.find(o => o.id === id)?.label).filter(Boolean).join(', ')
                      : 'Any painted medium'}
                  </span>
                </p>
                {(prefs.yearFrom !== null || prefs.yearTo !== null) && (
                  <p>
                    📅 Period: <span className="text-casa-navy font-medium">
                      {prefs.yearFrom ?? '–'} → {prefs.yearTo ?? 'present'}
                    </span>
                  </p>
                )}
                {prefs.cultures.length > 0 && (
                  <p>
                    🌍 Culture: <span className="text-casa-navy font-medium">{prefs.cultures.join(', ')}</span>
                  </p>
                )}
                <p>
                  🏛 Sources: <span className="text-casa-navy font-medium">
                    {[prefs.useMet && 'Met Museum', prefs.useArtic && 'Art Institute of Chicago'].filter(Boolean).join(' · ') || 'None (enable at least one)'}
                  </span>
                </p>
              </div>
            </div>

          </div>
        )}

      </div>
    </>
  )
}
