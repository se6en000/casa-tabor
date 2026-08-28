import { useEffect, useRef, useState } from 'react'
import { Image, Sun, Palette, Monitor, Plus, Minus, X, ChevronDown, ChevronUp, Upload, Crop } from 'lucide-react'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import { useArtFeedPrefs, MEDIA_OPTIONS } from '../hooks/useArtFeedPrefs'
import { usePersonalArtMode, type PersonalArtwork } from '../hooks/usePersonalArtMode'
import type { ArtSourceMode } from '../lib/artModeLibrary'
import { cn } from '../utils/cn'
import { SettingsPageHeader, SettingsToggle as Toggle, ArtworkCropModal, PersonalArtworkCard } from '../components/settings'
import { Alert, Button, Checkbox, EmptyState, IconButton, Modal, SegmentedControl, SectionHeader as SharedSectionHeader, Input } from '../components/ui'

const ART_FEED_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto Gallery' },
  { value: 'curated', label: 'Curated Gallery' },
] as const

const ART_SOURCE_OPTIONS = [
  { value: 'casa', label: 'Casa Gallery' },
  { value: 'personal', label: 'Personal only' },
  { value: 'mixed', label: 'Mix both' },
] as const

const PLAQUE_OPTIONS = [
  { value: 'fade', label: '5s on change' },
  { value: 'always', label: 'Always visible' },
  { value: 'hidden', label: 'Hidden' },
] as const

const MAT_PRESET_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'warm_linen', label: 'Warm Linen' },
  { value: 'travertine', label: 'Travertine' },
  { value: 'coastal_mist', label: 'Coastal Mist' },
  { value: 'french_ivory', label: 'French Ivory' },
  { value: 'charcoal', label: 'Charcoal' },
] as const

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
      <IconButton
        onClick={() => onChange(Math.max(min, value - step))}
        variant="secondary"
        icon={<Minus size={18} />}
        aria-label={`Decrease ${unit}`}
      />
      <div className="min-w-[5rem] text-center">
        <span className="font-display text-display-sm text-casa-navy">{value}</span>
        <span className="text-caption text-casa-muted ml-1">{unit}</span>
      </div>
      <IconButton
        onClick={() => onChange(Math.min(max, value + step))}
        variant="secondary"
        icon={<Plus size={18} />}
        aria-label={`Increase ${unit}`}
      />
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
          <Input
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
            className="flex-1"
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
  const {
    artworks: personalArtwork,
    sourceMode,
    loading: personalArtworkLoading,
    error: personalArtworkLoadError,
    setSourceMode,
    uploadArtwork,
    updateArtwork,
    cropArtwork,
    deleteArtwork,
    uploading,
    updating,
    cropping,
    deleting,
  } = usePersonalArtMode()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [yearFromInput, setYearFromInput] = useState('')
  const [yearToInput, setYearToInput] = useState('')
  const [libraryMessage, setLibraryMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [artworkToDelete, setArtworkToDelete] = useState<PersonalArtwork | null>(null)
  const [artworkToEdit, setArtworkToEdit] = useState<PersonalArtwork | null>(null)
  const [artworkToCrop, setArtworkToCrop] = useState<PersonalArtwork | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const disabledArtworkIds = settings.disabledArtworkIds ?? []
  const isArtworkDisabled = (id: string) => disabledArtworkIds.includes(id)
  const toggleArtworkDisabled = (id: string) => {
    const isCurrentlyDisabled = disabledArtworkIds.includes(id)
    const nextDisabled = isCurrentlyDisabled
      ? disabledArtworkIds.filter(x => x !== id)
      : [...disabledArtworkIds, id]
    updateScreensaver({ disabledArtworkIds: nextDisabled })
  }

  const curatedMode = prefs.feedMode === 'curated'
  const includesCasaGallery = sourceMode !== 'personal'
  const includesPersonalArtwork = sourceMode !== 'casa'

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

  const handleSourceChange = async (mode: ArtSourceMode) => {
    setLibraryMessage(null)
    try {
      await setSourceMode(mode)
    } catch (error) {
      setLibraryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Art Mode source could not be changed.',
      })
    }
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setLibraryMessage(null)
    try {
      await uploadArtwork(file)
      setLibraryMessage({ tone: 'success', text: `${file.name} is now in your personal gallery.` })
    } catch (error) {
      setLibraryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Artwork could not be uploaded.',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleOpenEdit = (item: PersonalArtwork) => {
    setArtworkToEdit(item)
    setEditTitle(item.title)
    setEditArtist(item.artist || '')
    setEditEnabled(!disabledArtworkIds.includes(item.id))
  }

  const handleSaveEdit = async () => {
    if (!artworkToEdit) return
    setLibraryMessage(null)
    try {
      await updateArtwork({
        id: artworkToEdit.id,
        title: editTitle,
        artist: editArtist,
      })

      // Sync disabled status for this device
      const isCurrentlyDisabled = disabledArtworkIds.includes(artworkToEdit.id)
      if (editEnabled && isCurrentlyDisabled) {
        updateScreensaver({ disabledArtworkIds: disabledArtworkIds.filter(id => id !== artworkToEdit.id) })
      } else if (!editEnabled && !isCurrentlyDisabled) {
        updateScreensaver({ disabledArtworkIds: [...disabledArtworkIds, artworkToEdit.id] })
      }

      setLibraryMessage({ tone: 'success', text: `Details updated for "${editTitle.trim() || 'Untitled'}".` })
      setArtworkToEdit(null)
    } catch (error) {
      setLibraryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Artwork details could not be updated.',
      })
    }
  }

  const handleOpenCrop = (item: PersonalArtwork) => {
    setArtworkToCrop(item)
  }

  const handleSaveCrop = async (croppedFile: File) => {
    if (!artworkToCrop) return
    setLibraryMessage(null)
    try {
      await cropArtwork({
        id: artworkToCrop.id,
        file: croppedFile,
        oldStoragePath: artworkToCrop.storagePath,
        title: artworkToCrop.title,
        artist: artworkToCrop.artist,
      })
      setLibraryMessage({
        tone: 'success',
        text: `"${artworkToCrop.title}" cropped to 16:9 widescreen format.`,
      })
      setArtworkToCrop(null)
    } catch (error) {
      setLibraryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Cropped artwork could not be saved.',
      })
    }
  }

  const confirmDelete = async () => {
    if (!artworkToDelete) return
    setLibraryMessage(null)
    try {
      await deleteArtwork(artworkToDelete)
      setLibraryMessage({ tone: 'success', text: `${artworkToDelete.title} was removed.` })
      setArtworkToDelete(null)
    } catch (error) {
      setLibraryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Artwork could not be removed.',
      })
      setArtworkToDelete(null)
    }
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

      <div className="space-y-5">
        {/* Top 2-Column Responsive Layout for Mode/Playback & Look/Feel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Mode & Playback */}
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5 flex flex-col justify-between">
            <div>
              <SectionHeader icon={Monitor} label="Mode & Playback" />
              <Toggle
                checked={settings.enabled}
                onChange={v => updateScreensaver({ enabled: v })}
                label="Art Mode screensaver"
                desc="Show artwork when the display is idle."
              />

              {settings.enabled && (
                <>
                  <SegmentedControl
                    aria-label="Art Mode source"
                    value={sourceMode}
                    options={ART_SOURCE_OPTIONS}
                    onChange={mode => void handleSourceChange(mode)}
                    fullWidth
                    className="mt-2.5"
                  />

                  <Button
                    type="button"
                    onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
                    disabled={!settings.enabled || personalArtworkLoading || (sourceMode === 'personal' && personalArtwork.length === 0)}
                    className={cn(
                      'mt-3.5 w-full py-2.5 rounded-xl text-body-sm font-semibold transition-all',
                      settings.enabled
                        ? 'bg-casa-gold text-white hover:bg-casa-gold/90 active:scale-95'
                        : 'bg-casa-border text-casa-muted cursor-not-allowed'
                    )}
                  >
                    ▶ Preview Art Mode
                  </Button>

                  <div className="mt-4 pt-4 border-t border-casa-border space-y-1">
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
                      checked={settings.shuffle}
                      onChange={v => updateScreensaver({ shuffle: v })}
                      label="Shuffle artwork"
                      desc="Randomize playback order instead of sequential rotation."
                    />
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
                </>
              )}
            </div>
          </div>

          {/* Card 2: Look & Feel */}
          {settings.enabled ? (
            <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5 flex flex-col justify-between">
              <div>
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
                <div className="pt-4 border-t border-casa-border">
                  <div className="mb-2.5">
                    <p className="text-body-sm font-medium text-casa-navy">Matboard tone</p>
                    <p className="text-caption text-casa-muted mt-0.5">Archival cotton rag mat color surrounding the artwork.</p>
                  </div>
                  <SegmentedControl
                    aria-label="Matboard tone"
                    value={settings.matPreset ?? 'auto'}
                    options={MAT_PRESET_OPTIONS}
                    onChange={v => updateScreensaver({ matPreset: v })}
                    fullWidth
                  />
                </div>
                <div className="pt-4 border-t border-casa-border">
                  <div className="mb-2.5">
                    <p className="text-body-sm font-medium text-casa-navy">Artwork details plaque</p>
                    <p className="text-caption text-casa-muted mt-0.5">Show title and artist credit on screen.</p>
                  </div>
                  <SegmentedControl
                    aria-label="Artwork details plaque"
                    value={settings.plaqueMode ?? 'fade'}
                    options={PLAQUE_OPTIONS}
                    onChange={v => updateScreensaver({ plaqueMode: v })}
                    fullWidth
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex bg-casa-surface-2 rounded-card border border-dashed border-casa-border p-5 text-center flex-col items-center justify-center">
              <p className="text-body-sm text-casa-muted">Enable Art Mode screensaver to configure playback, matting, and display settings.</p>
            </div>
          )}
        </div>

        {/* Card 3: Collection & Gallery Studio (Full Width) */}
        {settings.enabled && (
          <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
            <SectionHeader icon={Palette} label="Collection" />
            {libraryMessage && (
              <Alert tone={libraryMessage.tone} title={libraryMessage.tone === 'success' ? 'Personal gallery updated' : 'Personal gallery error'} onDismiss={() => setLibraryMessage(null)} className="mb-4">
                {libraryMessage.text}
              </Alert>
            )}
            {personalArtworkLoadError && (
              <Alert tone="danger" title="Personal gallery unavailable" className="mb-4">
                Personal artwork could not be loaded. Casa Gallery remains available.
              </Alert>
            )}

            {includesPersonalArtwork && (
              <div className={cn(includesCasaGallery && 'mb-5 border-b border-casa-border pb-5')}>
                <div className="mb-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-body-sm font-semibold text-casa-navy">Personal gallery</p>
                      {personalArtwork.length > 0 && (
                        <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-navy">
                          {personalArtwork.length} {personalArtwork.length === 1 ? 'artwork' : 'artworks'}
                          {disabledArtworkIds.length > 0 && ` (${personalArtwork.length - personalArtwork.filter(a => disabledArtworkIds.includes(a.id)).length} active)`}
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-casa-muted">Shared across the kiosk, mobile, and web.</p>
                  </div>
                  <Button
                    variant="strong"
                    size="sm"
                    leadingIcon={<Upload size={16} />}
                    loading={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={event => void handleUpload(event.target.files?.[0])}
                  />
                </div>

                {personalArtworkLoading ? (
                  <p className="text-caption text-casa-muted py-4">Loading personal artwork…</p>
                ) : personalArtwork.length === 0 ? (
                  <EmptyState
                    icon={<Image size={28} />}
                    title="No personal artwork yet"
                    description="Upload a JPG, PNG, or WebP image up to 20 MB. Personal-only Art Mode stays empty until you add one."
                    action={(
                      <Button
                        variant="secondary"
                        leadingIcon={<Upload size={16} />}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose an image
                      </Button>
                    )}
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
                    {personalArtwork.map(item => (
                      <PersonalArtworkCard
                        key={item.id}
                        artwork={item}
                        isDisabled={isArtworkDisabled(item.id)}
                        onToggleDisabled={toggleArtworkDisabled}
                        onCrop={handleOpenCrop}
                        onEdit={handleOpenEdit}
                        onDelete={setArtworkToDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {includesCasaGallery && (
              <SegmentedControl
                aria-label="Art feed mode"
                value={prefs.feedMode}
                options={ART_FEED_MODE_OPTIONS}
                onChange={setFeedMode}
                fullWidth
                className="mb-4"
              />
            )}

            {includesCasaGallery && !curatedMode && (
              <p className="text-caption text-casa-muted">
                Auto Gallery uses balanced, modern-leaning public-domain pulls across Met, Art Institute, and Europeana.
              </p>
            )}

            {includesCasaGallery && curatedMode && (
              <>
                <div className="rounded-xl border border-casa-border bg-casa-bg p-3 mb-4">
                  <p className="text-body-sm font-semibold text-casa-navy">Starter themes</p>
                  <p className="text-caption text-casa-muted mt-0.5 mb-2">Quickly prefill a coastal modern vibe, then tweak it.</p>
                  <Button
                    variant="strong"
                    onClick={applyCoastalStarterTheme}
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
                  variant="subtle"
                  fullWidth
                  onClick={() => setAdvancedOpen(v => !v)}
                  className="mt-4"
                  aria-expanded={advancedOpen}
                  trailingIcon={advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                >
                  Advanced filters
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
                        <Input
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
                        />
                      </div>
                      <span className="text-casa-muted text-body-sm mt-5">→</span>
                      <div className="flex-1">
                        <label className="text-caption text-casa-muted block mb-1">To year</label>
                        <Input
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

      {/* Edit Artwork Details Modal */}
      <Modal
        open={artworkToEdit !== null}
        onClose={() => setArtworkToEdit(null)}
        title="Edit Artwork Details"
        size="sm"
        closeDisabled={updating}
      >
        <div className="space-y-4 py-3">
          {artworkToEdit && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-casa-border bg-casa-bg p-2.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <img
                  src={artworkToEdit.imageUrl}
                  alt={artworkToEdit.title}
                  className="h-14 w-14 rounded-md object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-caption text-casa-muted">Artwork preview</p>
                  <p className="text-body-sm font-medium text-casa-navy truncate">{artworkToEdit.title}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<Crop size={14} />}
                onClick={() => {
                  const target = artworkToEdit
                  setArtworkToEdit(null)
                  handleOpenCrop(target)
                }}
              >
                Crop to 16:9
              </Button>
            </div>
          )}

          <div>
            <label className="text-caption font-medium text-casa-navy block mb-1">Artwork Title</label>
            <Input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="e.g. Highland Cattle with Espresso"
              className="w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="text-caption font-medium text-casa-navy block mb-1">Artist Name (Optional)</label>
            <Input
              type="text"
              value={editArtist}
              onChange={e => setEditArtist(e.target.value)}
              placeholder="e.g. Dwight Smith"
              className="w-full"
            />
            <p className="text-caption text-casa-muted mt-1">Leaves as &ldquo;Personal collection&rdquo; if left blank.</p>
          </div>

          <div className="pt-2 border-t border-casa-border">
            <Toggle
              checked={editEnabled}
              onChange={setEditEnabled}
              label="Active on this device"
              desc="When turned off, this photo is skipped during shuffle and playback on this kiosk."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setArtworkToEdit(null)} disabled={updating}>
            Cancel
          </Button>
          <Button variant="strong" loading={updating} onClick={() => void handleSaveEdit()}>
            Save Details
          </Button>
        </div>
      </Modal>

      {/* Delete Artwork Modal */}
      <Modal
        open={artworkToDelete !== null}
        onClose={() => setArtworkToDelete(null)}
        title="Remove artwork?"
        size="sm"
        closeDisabled={deleting}
      >
        <p className="text-body-sm text-casa-muted py-4">
          {artworkToDelete?.title} will be removed from every device using this personal gallery.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setArtworkToDelete(null)} disabled={deleting}>
            Keep it
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
            Remove
          </Button>
        </div>
      </Modal>

      {/* 16:9 Crop Artwork Modal */}
      <ArtworkCropModal
        open={artworkToCrop !== null}
        artwork={artworkToCrop}
        onClose={() => setArtworkToCrop(null)}
        onSaveCrop={handleSaveCrop}
        saving={cropping}
      />
    </>
  )
}
