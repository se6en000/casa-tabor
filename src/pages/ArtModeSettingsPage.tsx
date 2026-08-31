import { useEffect, useRef, useState } from 'react'
import { Image, Sun, Palette, Monitor, Plus, Minus, X, ChevronDown, ChevronUp, Upload, Crop, Sparkles, Trash2 } from 'lucide-react'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import { useRoomTone } from '../hooks/useRoomTone'
import { useArtFeedPrefs, MEDIA_OPTIONS } from '../hooks/useArtFeedPrefs'
import { usePersonalArtMode, type PersonalArtwork } from '../hooks/usePersonalArtMode'
import {
  type ArtSourceMode,
  SIGNATURE_STYLE_OPTIONS,
  SIGNATURE_OPACITY_OPTIONS,
  SIGNATURE_SIZE_OPTIONS,
  SIGNATURE_STYLES,
  SIGNATURE_SIZE_SCALES,
  getSignatureInkStyle,
  type SignatureStyle,
  type SignaturePosition,
  type SignatureColor,
  type SignatureSize,
  buildTwoRowSignatureInscription,
} from '../lib/artModeLibrary'
import { cn } from '../utils/cn'
import { SettingsPageHeader, SettingsToggle as Toggle, ArtworkCropModal, PersonalArtworkCard } from '../components/settings'
import { ArtworkProvenanceCard } from '../components/shared/ArtworkProvenanceCard'
import { Alert, Button, Checkbox, EmptyState, IconButton, Modal, SegmentedControl, SectionHeader as SharedSectionHeader, Input, Textarea } from '../components/ui'

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

const ASPECT_RATIO_OPTIONS = [
  { value: 'mixed', label: 'Mixed (16:9 & 1:1 Pairs)' },
  { value: 'diptych_only', label: '1:1 Diptychs Only' },
  { value: 'single_only', label: '16:9 Single Only' },
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
    analyzeArtwork,
    uploading,
    updating,
    cropping,
    deleting,
    analyzing: aiAnalyzing,
  } = usePersonalArtMode()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [yearFromInput, setYearFromInput] = useState('')
  const [yearToInput, setYearToInput] = useState('')
  const [libraryMessage, setLibraryMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [artworkToDelete, setArtworkToDelete] = useState<PersonalArtwork | null>(null)
  const [artworkToEdit, setArtworkToEdit] = useState<PersonalArtwork | null>(null)
  const [artworkToCrop, setArtworkToCrop] = useState<PersonalArtwork | null>(null)
  const [provenancePreviewArtwork, setProvenancePreviewArtwork] = useState<PersonalArtwork | null>(null)
  const [aiHint, setAiHint] = useState('')
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [editTab, setEditTab] = useState<'story' | 'signature'>('story')
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editDateTaken, setEditDateTaken] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSubjects, setEditSubjects] = useState('')
  const [editMedium, setEditMedium] = useState('Color photograph')
  const [editFunFact, setEditFunFact] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)
  const [editSignatureEnabled, setEditSignatureEnabled] = useState(false)
  const [editSignatureText, setEditSignatureText] = useState('')
  const [editSignatureStyle, setEditSignatureStyle] = useState<SignatureStyle>('fountain')
  const [editSignaturePosition, setEditSignaturePosition] = useState<SignaturePosition>('bottom-right')
  const [editSignatureColor, setEditSignatureColor] = useState<SignatureColor>('auto')
  const [editSignatureSize, setEditSignatureSize] = useState<SignatureSize>('md')
  const [editSignatureOpacity, setEditSignatureOpacity] = useState<number>(0.55)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { sensorData } = useRoomTone()
  const disabledArtworkIds = settings.disabledArtworkIds ?? []
  const isArtworkDisabled = (id: string) => disabledArtworkIds.includes(id)
  const toggleArtworkDisabled = (id: string) => {
    const isCurrentlyDisabled = disabledArtworkIds.includes(id)
    const nextDisabled = isCurrentlyDisabled
      ? disabledArtworkIds.filter(x => x !== id)
      : [...disabledArtworkIds, id]
    updateScreensaver({ disabledArtworkIds: nextDisabled })
  }

  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      fetch('http://127.0.0.1:8765/display/art-mode-off', { method: 'POST' }).catch(() => {})
    }
  }, [])

  const handleDimOffsetChange = (v: number) => {
    updateScreensaver({ artDimOffset: v })
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    // Momentarily preview dimmed art level on physical screen for 3.5s, then return to bright active mode
    fetch('http://127.0.0.1:8765/display/art-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dim_offset: v / 100 }),
    }).catch(() => {})

    previewTimerRef.current = setTimeout(() => {
      fetch('http://127.0.0.1:8765/display/art-mode-off', { method: 'POST' }).catch(() => {})
    }, 3500)
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

  const handleUpload = async (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return
    setLibraryMessage(null)
    const fileList = Array.from(files)
    let uploadedCount = 0
    let lastError: string | null = null

    for (const file of fileList) {
      try {
        await uploadArtwork(file)
        uploadedCount++
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Artwork could not be uploaded.'
      }
    }

    if (uploadedCount > 0) {
      setLibraryMessage({
        tone: 'success',
        text: fileList.length === 1
          ? `Added "${fileList[0].name}" to your personal gallery.`
          : `Successfully added ${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} to your gallery.`,
      })
    } else if (lastError) {
      setLibraryMessage({ tone: 'danger', text: lastError })
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenEdit = (item: PersonalArtwork) => {
    setArtworkToEdit(item)
    setEditTab('story')
    setAiHint('')
    setAiMessage(null)
    setEditTitle(item.title)
    setEditArtist(item.artist || '')
    setEditLocation(item.location || '')
    setEditDateTaken(item.dateTaken || '')
    setEditDescription(item.description || '')
    setEditSubjects(item.subjects || '')
    setEditMedium(item.medium || 'Color photograph')
    setEditFunFact(item.funFact || '')
    setEditEnabled(!disabledArtworkIds.includes(item.id))
    setEditSignatureEnabled(item.signatureEnabled != null ? Boolean(item.signatureEnabled) : true)
    setEditSignatureText(item.signatureText || item.artist || '')
    setEditSignatureStyle(item.signatureStyle || 'draft')
    setEditSignaturePosition(item.signaturePosition || 'bottom-right')
    setEditSignatureColor(item.signatureColor || 'light')
    setEditSignatureSize(item.signatureSize || 'sm')
    setEditSignatureOpacity(item.signatureOpacity != null ? item.signatureOpacity : 0.55)
  }

  const handleAIAnalyze = async () => {
    if (!artworkToEdit && !editTitle && !aiHint) return
    setAiMessage(null)
    try {
      let fileBase64: string | undefined
      let mimeType: string | undefined

      if (artworkToEdit?.imageUrl && typeof window !== 'undefined') {
        try {
          const img = new window.Image()
          img.crossOrigin = 'anonymous'
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('Image load failed'))
            img.src = artworkToEdit.imageUrl
          })

          const maxDim = 1200
          let w = img.naturalWidth || img.width
          let h = img.naturalHeight || img.height
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w)
              w = maxDim
            } else {
              w = Math.round((w * maxDim) / h)
              h = maxDim
            }
          }

          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
            fileBase64 = dataUrl.split(',')[1]
            mimeType = 'image/jpeg'
          }
        } catch {
          // If canvas extraction fails, fallback to passing URL
        }
      }

      const analysis = await analyzeArtwork({
        imageUrl: artworkToEdit?.imageUrl,
        fileBase64,
        mimeType,
        hint: aiHint.trim() || undefined,
        currentTitle: editTitle.trim() || undefined,
        currentArtist: editArtist.trim() || undefined,
      })

      const title = analysis.title || editTitle
      const artist = analysis.artist || editArtist
      const location = analysis.location || editLocation
      const dateTaken = analysis.date_taken || editDateTaken

      if (analysis.title) setEditTitle(analysis.title)
      if (analysis.artist) setEditArtist(analysis.artist)
      if (analysis.location) setEditLocation(analysis.location)
      if (analysis.date_taken) setEditDateTaken(analysis.date_taken)
      if (analysis.medium) setEditMedium(analysis.medium)
      if (analysis.subjects) setEditSubjects(analysis.subjects)
      if (analysis.description) setEditDescription(analysis.description)
      if (analysis.fun_fact) setEditFunFact(analysis.fun_fact)

      // Auto-fill the 2-row signature inscription to match the plaque preview format
      const twoRowSig = buildTwoRowSignatureInscription({
        title,
        artist,
        location,
        dateTaken,
      })
      setEditSignatureText(twoRowSig)
      setEditSignatureEnabled(true)

      setAiMessage(`Curated as "${title}"`)
    } catch (err) {
      setAiMessage(err instanceof Error ? `AI curation failed: ${err.message}` : 'AI curation failed')
    }
  }

  const handleSaveEdit = async () => {
    if (!artworkToEdit) return
    setLibraryMessage(null)
    try {
      await updateArtwork({
        id: artworkToEdit.id,
        title: editTitle,
        artist: editArtist,
        location: editLocation,
        dateTaken: editDateTaken,
        description: editDescription,
        subjects: editSubjects,
        medium: editMedium,
        funFact: editFunFact,
        signatureEnabled: editSignatureEnabled,
        signatureText: editSignatureText,
        signatureStyle: editSignatureStyle,
        signaturePosition: editSignaturePosition,
        signatureColor: editSignatureColor,
        signatureSize: editSignatureSize,
        signatureOpacity: editSignatureOpacity,
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

  const handleSaveCrop = async (croppedFile: File, aspectFormat: 'square_1_1' | 'widescreen_16_9') => {
    if (!artworkToCrop) return
    setLibraryMessage(null)
    try {
      const result = await cropArtwork({
        id: artworkToCrop.id,
        file: croppedFile,
        oldStoragePath: artworkToCrop.storagePath,
        title: artworkToCrop.title,
        artist: artworkToCrop.artist,
        aspectFormat,
      })

      // If we are currently editing this artwork, update the active editor state with the new cropped image so the live canvas preview updates instantly!
      if (artworkToEdit && artworkToEdit.id === artworkToCrop.id) {
        const previewUrl = URL.createObjectURL(croppedFile)
        setArtworkToEdit({
          ...artworkToEdit,
          imageUrl: previewUrl,
          aspectFormat,
          storagePath: result?.storagePath || artworkToCrop.storagePath,
        })
      }

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
                <Row
                  label="Dim below ambient"
                  desc={
                    sensorData?.lux != null
                      ? `Dims idle screensaver to feel like wall art (${Math.round(sensorData.lux)} lx ambient · previews for 3.5s)`
                      : "Dims idle screensaver to feel like wall art, returning to bright dashboard when touched"
                  }
                >
                  <StepPicker
                    value={settings.artDimOffset}
                    onChange={handleDimOffsetChange}
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
                <div className="pt-4 border-t border-casa-border">
                  <div className="mb-2.5">
                    <p className="text-body-sm font-medium text-casa-navy">Presentation layout</p>
                    <p className="text-caption text-casa-muted mt-0.5">Display 1:1 square artwork as side-by-side diptych pairs on widescreen displays.</p>
                  </div>
                  <SegmentedControl
                    aria-label="Presentation layout"
                    value={settings.aspectRatioMode ?? 'mixed'}
                    options={ASPECT_RATIO_OPTIONS}
                    onChange={v => updateScreensaver({ aspectRatioMode: v })}
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
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={event => void handleUpload(event.target.files)}
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

      {/* Edit Artwork Details & Provenance Studio Modal */}
      <Modal
        open={artworkToEdit !== null}
        onClose={() => setArtworkToEdit(null)}
        title="Edit Artwork & Provenance"
        size="xl"
        panelClassName="max-w-5xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden"
        contentClassName="p-0 flex-1 overflow-hidden flex flex-col"
        closeDisabled={updating}
      >
        {/* Scrollable Studio Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Live Canvas Preview & Metadata Overview */}
            <div className="md:col-span-5 flex flex-col gap-4">
              {artworkToEdit && (
                <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-stone-900 border border-casa-border shadow-md group shrink-0">
                  <img
                    src={artworkToEdit.imageUrl}
                    alt={artworkToEdit.title}
                    className="w-full h-full object-cover"
                  />

                  {/* Live Handwritten Signature Overlay */}
                  {editSignatureEnabled && (editSignatureText || editArtist || artworkToEdit.title) && (() => {
                    const isBottomLeft = editSignaturePosition === 'bottom-left'
                    const sigStyle = SIGNATURE_STYLES[editSignatureStyle] || SIGNATURE_STYLES.draft
                    const inkStyle = getSignatureInkStyle(
                      editSignatureColor,
                      '',
                      editSignatureOpacity
                    )
                    const sizeScale = SIGNATURE_SIZE_SCALES[editSignatureSize] || 1.0

                    return (
                      <div
                        className={cn(
                          'absolute pointer-events-none select-none z-10 leading-tight pt-2 pb-2 max-w-[78%] whitespace-pre-line overflow-visible transition-all duration-200',
                          isBottomLeft
                            ? 'bottom-2 sm:bottom-3 left-3 sm:left-5 text-left rotate-[0.8deg]'
                            : 'bottom-2 sm:bottom-3 right-3 sm:right-5 text-right -rotate-[1.2deg]'
                        )}
                        style={{
                          fontFamily: sigStyle.fontFamily,
                          fontSize: `clamp(${sigStyle.baseFontSizeRem * 0.75 * sizeScale}rem, ${1.8 * sizeScale}vw, ${sigStyle.baseFontSizeRem * 1.4 * sizeScale}rem)`,
                          fontWeight: sigStyle.weight,
                          color: inkStyle.color,
                          textShadow: inkStyle.textShadow,
                          mixBlendMode: inkStyle.blendMode || 'normal',
                          filter: 'blur(0.15px) contrast(1.05)',
                          textRendering: 'geometricPrecision',
                          letterSpacing: '0.01em',
                        }}
                      >
                        {editSignatureText || editArtist || artworkToEdit.title}
                      </div>
                    )
                  })()}

                  {/* Cold-Press Watercolor Paper Grain & Canvas Tooth Overlay */}
                  <div className="paper-grain-overlay z-15 opacity-55" />

                  {/* Top-Left: Aspect Ratio Badge */}
                  <div className="absolute top-2.5 left-2.5 z-20">
                    {artworkToEdit.aspectFormat === 'square_1_1' || artworkToEdit.storagePath.includes('_1x1') ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-950/85 backdrop-blur-xs border border-emerald-500/40 text-emerald-300 text-3xs font-semibold shadow-xs flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        1:1 Square (Diptych)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-casa-navy/85 backdrop-blur-xs border border-white/20 text-stone-200 text-3xs font-medium shadow-xs">
                        16:9 Widescreen
                      </span>
                    )}
                  </div>

                  {/* Top-Right: Crop / Frame Action */}
                  <div className="absolute top-2.5 right-2.5 z-20">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Crop size={14} />}
                      className="bg-white/90 backdrop-blur-xs hover:bg-white text-casa-navy shadow-xs font-semibold"
                      onClick={() => {
                        handleOpenCrop(artworkToEdit)
                      }}
                    >
                      Crop / Frame
                    </Button>
                  </div>

                  {/* Live Preview Watermark Label */}
                  <div className="absolute bottom-2.5 left-2.5 z-10 pointer-events-none">
                    <span className="px-2 py-0.5 rounded-full bg-casa-navy/70 backdrop-blur-xs text-white text-3xs font-medium uppercase tracking-wider">
                      Live Canvas Preview
                    </span>
                  </div>
                </div>
              )}

              {/* Provenance Live Preview Pill */}
              <div className="rounded-2xl border border-casa-border bg-casa-surface/60 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-casa-border/60 pb-2">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-casa-muted flex items-center gap-1">
                    <Sparkles size={12} className="text-casa-gold" />
                    Plaque Preview
                  </span>
                  <span className="text-3xs text-casa-muted">Screensaver bottom-right</span>
                </div>
                <div>
                  <p className="font-serif italic text-body-sm text-casa-navy truncate font-medium">
                    {editTitle.trim() || 'Untitled Artwork'}
                  </p>
                  <p className="text-caption text-casa-muted uppercase tracking-wider text-2xs truncate mt-0.5">
                    {editArtist.trim() || 'Personal Collection'}
                    {editLocation.trim() && ` · ${editLocation.trim().split(',')[0]}`}
                    {editDateTaken.trim() && ` (${editDateTaken.trim()})`}
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <Toggle
                  checked={editEnabled}
                  onChange={setEditEnabled}
                  label="Active on this device"
                  desc="Include this photo during Art Mode rotation on this kiosk."
                />
              </div>
            </div>

            {/* Right Column: Tabbed Editorial Studio */}
            <div className="md:col-span-7 flex flex-col gap-4">
              {/* Studio Tabs Header */}
              <div>
                <SegmentedControl
                  aria-label="Studio Mode"
                  value={editTab}
                  options={[
                    { value: 'story', label: 'Story & Provenance' },
                    { value: 'signature', label: 'Signature Studio' },
                  ]}
                  onChange={(val) => setEditTab(val as 'story' | 'signature')}
                  fullWidth
                />
              </div>

              {/* Tab 1: Story & Provenance Fields */}
              {editTab === 'story' && (
                <div className="space-y-3.5">
                  {/* AI Curate with Gemini Vision */}
                  <div className="rounded-2xl border border-casa-gold/35 bg-casa-gold/5 dark:bg-amber-500/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        <Sparkles size={13} className="text-casa-gold shrink-0" />
                        <span>AI Curate with Gemini Vision</span>
                      </div>
                      {aiMessage && (
                        <span className="text-3xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 truncate max-w-[220px]">
                          {aiMessage}
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-casa-muted leading-tight">
                      Let Gemini analyze the photo to automatically detect the artwork, artist, date, location, subjects, and backstory. Add an optional hint to guide the archivist.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={aiHint}
                        onChange={e => setAiHint(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void handleAIAnalyze()
                          }
                        }}
                        placeholder="e.g. Slim Aarons 1970, Capri vacation, Dad in 1982..."
                        className="flex-1 text-body-sm"
                        disabled={aiAnalyzing}
                      />
                      <Button
                        type="button"
                        variant="strong"
                        size="sm"
                        leadingIcon={<Sparkles size={14} />}
                        loading={aiAnalyzing}
                        onClick={() => void handleAIAnalyze()}
                        className="shrink-0"
                      >
                        {aiAnalyzing ? 'Analyzing...' : 'Auto-Fill Details'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Artwork Title *
                      </label>
                      <Input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        placeholder="e.g. Poolside Gossip"
                        className="w-full"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Photographer / Artist
                      </label>
                      <Input
                        type="text"
                        value={editArtist}
                        onChange={e => setEditArtist(e.target.value)}
                        placeholder="e.g. Slim Aarons"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Year / Date Taken
                      </label>
                      <Input
                        type="text"
                        value={editDateTaken}
                        onChange={e => setEditDateTaken(e.target.value)}
                        placeholder="e.g. January 1970"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Location / Setting
                      </label>
                      <Input
                        type="text"
                        value={editLocation}
                        onChange={e => setEditLocation(e.target.value)}
                        placeholder="e.g. Palm Springs, California"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Medium / Format
                      </label>
                      <Input
                        type="text"
                        value={editMedium}
                        onChange={e => setEditMedium(e.target.value)}
                        placeholder="e.g. 35mm Kodachrome Slide"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-caption font-medium text-casa-navy block mb-1">
                        Key Figures & Subjects
                      </label>
                      <Input
                        type="text"
                        value={editSubjects}
                        onChange={e => setEditSubjects(e.target.value)}
                        placeholder="e.g. Nelda Linsk, Helen Dzo Dzo"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-caption font-medium text-casa-navy block mb-1">
                      Historical Background & Story
                    </label>
                    <Textarea
                      rows={3}
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Describe the moment, historical significance, or backstory..."
                      className="w-full text-body-sm"
                    />
                  </div>

                  <div>
                    <label className="text-caption font-medium text-casa-navy block mb-1">
                      Insider Trivia / Fun Facts
                    </label>
                    <Textarea
                      rows={2}
                      value={editFunFact}
                      onChange={e => setEditFunFact(e.target.value)}
                      placeholder="Interesting trivia or backstory for curious viewers..."
                      className="w-full text-body-sm"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Handwritten Signature Studio */}
              {editTab === 'signature' && (
                <div className="space-y-3.5">
                  <div className="rounded-2xl border border-casa-border bg-casa-surface-2/30 p-4">
                    <Toggle
                      checked={editSignatureEnabled}
                      onChange={checked => {
                        setEditSignatureEnabled(checked)
                        if (checked && !editSignatureText) {
                          setEditSignatureText(editArtist.trim() || artworkToEdit?.title || '')
                        }
                      }}
                      label="Artist signature overlay"
                      desc="Overlay handwritten artist signature or inscription on the image."
                    />
                  </div>

                  {editSignatureEnabled && (
                    <div className="space-y-3.5">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-caption font-medium text-casa-navy block">
                            Signature / Inscription Text
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            leadingIcon={<Sparkles size={11} className="text-casa-gold" />}
                            onClick={() => {
                              const line1 = editTitle.trim() || 'Untitled Artwork'
                              const line2Parts = [
                                editArtist.trim() || 'Personal Collection',
                                editLocation.trim() ? editLocation.trim().split(',')[0] : null,
                                editDateTaken.trim() ? `(${editDateTaken.trim()})` : null,
                              ].filter(Boolean)
                              setEditSignatureText(`${line1}\n${line2Parts.join(' · ')}`)
                            }}
                            className="text-3xs text-casa-gold hover:text-amber-700 h-auto py-0.5 px-1.5"
                          >
                            Insert 2-Row Plaque Inscription
                          </Button>
                        </div>
                        <Textarea
                          rows={2}
                          value={editSignatureText}
                          onChange={e => setEditSignatureText(e.target.value)}
                          placeholder={'e.g. Riviera Rendezvous on a Riva\nSlim Aarons · Capri (circa 1960s)'}
                          className="w-full text-body-sm font-sans"
                        />
                        <p className="text-caption text-casa-muted mt-1">
                          Supports 2 rows: Line 1 for artwork title, Line 2 for artist, location & date.
                        </p>
                      </div>

                      {/* Visual Handwriting Font Selector */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <label className="text-caption font-medium text-casa-navy block">
                            Handwriting Style
                          </label>
                          <span className="text-3xs text-casa-muted">
                            Select regular print or script style
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {SIGNATURE_STYLE_OPTIONS.map(opt => {
                            const isSelected = editSignatureStyle === opt.value
                            const styleDef = SIGNATURE_STYLES[opt.value]
                            const previewSample = editSignatureText
                              ? editSignatureText.split('\n')[0]
                              : editArtist || artworkToEdit?.title || styleDef.sample

                            return (
                              <Button
                                key={opt.value}
                                type="button"
                                variant={isSelected ? 'strong' : 'secondary'}
                                align="start"
                                contentClassName="w-full flex-col items-start gap-1"
                                onClick={() => setEditSignatureStyle(opt.value)}
                                className={cn(
                                  'p-3 h-auto min-h-[60px] rounded-2xl transition-all cursor-pointer text-left',
                                  isSelected && 'border-casa-gold ring-1 ring-casa-gold/40'
                                )}
                              >
                                <div className="flex items-center justify-between gap-1 w-full">
                                  <span className="text-caption font-semibold truncate">
                                    {styleDef.label}
                                  </span>
                                  <span
                                    className={cn(
                                      'text-3xs uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                                      styleDef.category === 'print'
                                        ? isSelected
                                          ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/40'
                                          : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                                        : isSelected
                                        ? 'bg-white/20 text-white border border-white/20'
                                        : 'bg-casa-surface-2 text-casa-muted border border-casa-border'
                                    )}
                                  >
                                    {styleDef.category === 'print'
                                      ? 'Regular Print'
                                      : styleDef.category === 'calligraphy'
                                      ? 'Calligraphy'
                                      : 'Script'}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    'text-body-sm truncate py-0.5 leading-snug w-full text-left',
                                    isSelected ? 'text-white/95' : 'text-casa-navy'
                                  )}
                                  style={{
                                    fontFamily: styleDef.fontFamily,
                                    fontWeight: styleDef.weight,
                                  }}
                                >
                                  {previewSample}
                                </div>
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Live Inscription Specimen Preview Box */}
                      <div className="rounded-2xl border border-casa-border bg-stone-100/80 dark:bg-stone-900/60 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-casa-border/50 pb-1.5">
                          <span className="text-2xs font-semibold uppercase tracking-wider text-casa-muted flex items-center gap-1.5">
                            <Sparkles size={12} className="text-casa-gold" />
                            Live Inscription Specimen
                          </span>
                          <span className="text-3xs font-mono text-casa-muted">
                            {SIGNATURE_STYLES[editSignatureStyle]?.label} · {editSignatureSize.toUpperCase()} (
                            {Math.round((SIGNATURE_SIZE_SCALES[editSignatureSize] || 1.0) * 100)}%)
                          </span>
                        </div>
                        <div className="py-2.5 px-3 rounded-lg bg-white/80 dark:bg-black/40 border border-casa-border/40 overflow-hidden">
                          <div
                            className={cn(
                              'leading-tight whitespace-pre-line transition-all duration-150',
                              editSignaturePosition === 'bottom-left' ? 'text-left' : 'text-right'
                            )}
                            style={{
                              fontFamily: SIGNATURE_STYLES[editSignatureStyle]?.fontFamily,
                              fontWeight: SIGNATURE_STYLES[editSignatureStyle]?.weight,
                              fontSize: `${(SIGNATURE_STYLES[editSignatureStyle]?.baseFontSizeRem || 1.1) * (SIGNATURE_SIZE_SCALES[editSignatureSize] || 1.0)}rem`,
                              color: getSignatureInkStyle(editSignatureColor, '', editSignatureOpacity).color,
                              textShadow: getSignatureInkStyle(editSignatureColor, '', editSignatureOpacity).textShadow,
                              mixBlendMode: getSignatureInkStyle(editSignatureColor, '', editSignatureOpacity).blendMode || 'normal',
                            }}
                          >
                            {editSignatureText || editArtist || artworkToEdit?.title || 'Artist Signature'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-caption font-medium text-casa-navy block mb-1">
                          Signature Placement
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={editSignaturePosition === 'bottom-right' ? 'strong' : 'secondary'}
                            onClick={() => setEditSignaturePosition('bottom-right')}
                            className="w-full justify-center text-body-sm"
                          >
                            ↘ Bottom Right
                          </Button>
                          <Button
                            type="button"
                            variant={editSignaturePosition === 'bottom-left' ? 'strong' : 'secondary'}
                            onClick={() => setEditSignaturePosition('bottom-left')}
                            className="w-full justify-center text-body-sm"
                          >
                            ↙ Bottom Left
                          </Button>
                        </div>
                      </div>

                      <div>
                        <label className="text-caption font-medium text-casa-navy block mb-1">
                          Signature Size
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                          {SIGNATURE_SIZE_OPTIONS.map(sizeOpt => (
                            <Button
                              key={sizeOpt.value}
                              type="button"
                              variant={editSignatureSize === sizeOpt.value ? 'strong' : 'secondary'}
                              onClick={() => setEditSignatureSize(sizeOpt.value as SignatureSize)}
                              className="w-full justify-center text-caption py-2 px-1 flex flex-col items-center gap-0.5 h-auto min-h-[44px]"
                            >
                              <span className="truncate font-semibold">
                                {sizeOpt.label === 'Extra Small'
                                  ? 'Extra Small'
                                  : sizeOpt.label === 'Extra Large'
                                  ? 'Extra Large'
                                  : sizeOpt.label}
                              </span>
                              <span className="text-3xs opacity-75 font-mono">
                                {Math.round(SIGNATURE_SIZE_SCALES[sizeOpt.value] * 100)}%
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-caption font-medium text-casa-navy block mb-1">
                          Ink Tone & Contrast
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { value: 'auto', label: 'Auto Contrast', swatch: 'bg-stone-500' },
                            { value: 'dark', label: 'Charcoal Ink', swatch: 'bg-stone-900' },
                            { value: 'sepia', label: 'Warm Umber', swatch: 'bg-amber-950' },
                            { value: 'light', label: 'White Gesso', swatch: 'bg-stone-100 border border-stone-300' },
                          ].map(tone => (
                            <Button
                              key={tone.value}
                              type="button"
                              variant={editSignatureColor === tone.value ? 'strong' : 'secondary'}
                              onClick={() => setEditSignatureColor(tone.value as SignatureColor)}
                              leadingIcon={<span className={cn('size-2.5 rounded-full shrink-0', tone.swatch)} />}
                              className="w-full justify-center text-caption py-2 px-2.5"
                            >
                              <span className="truncate">{tone.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-caption font-medium text-casa-navy block mb-1">
                          Ink Density & Translucency
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {SIGNATURE_OPACITY_OPTIONS.map(opOpt => (
                            <Button
                              key={opOpt.value}
                              type="button"
                              variant={editSignatureOpacity === opOpt.value ? 'strong' : 'secondary'}
                              onClick={() => setEditSignatureOpacity(opOpt.value)}
                              className="w-full justify-center text-caption py-2 px-1"
                            >
                              <span className="truncate">{opOpt.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pinned Sticky Action Footer */}
        <div className="flex items-center justify-between gap-2.5 px-5 sm:px-6 py-3.5 border-t border-casa-border bg-casa-surface shrink-0 z-10">
          <Button
            variant="danger"
            onClick={() => {
              const target = artworkToEdit
              setArtworkToEdit(null)
              setArtworkToDelete(target)
            }}
            disabled={updating}
            leadingIcon={<Trash2 size={15} />}
          >
            Delete from Gallery
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setArtworkToEdit(null)} disabled={updating}>
              Cancel
            </Button>
            <Button variant="strong" loading={updating} onClick={() => void handleSaveEdit()}>
              Save Details
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Provenance Peek Modal */}
      <Modal
        open={provenancePreviewArtwork !== null}
        onClose={() => setProvenancePreviewArtwork(null)}
        title="Artwork Provenance"
        size="md"
        panelClassName="max-w-lg p-0 bg-transparent border-0 shadow-none overflow-visible"
        contentClassName="p-0"
      >
        {provenancePreviewArtwork && (
          <ArtworkProvenanceCard
            title={provenancePreviewArtwork.title}
            artist={provenancePreviewArtwork.artist}
            location={provenancePreviewArtwork.location}
            dateTaken={provenancePreviewArtwork.dateTaken}
            description={provenancePreviewArtwork.description}
            subjects={provenancePreviewArtwork.subjects}
            medium={provenancePreviewArtwork.medium}
            funFact={provenancePreviewArtwork.funFact}
            imageUrl={provenancePreviewArtwork.imageUrl}
            onClose={() => setProvenancePreviewArtwork(null)}
          />
        )}
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
