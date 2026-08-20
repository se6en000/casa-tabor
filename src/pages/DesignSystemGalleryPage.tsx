import { useEffect, useMemo, useState } from 'react'
import {
  Palette,
  Ruler,
  Layers,
  Smartphone,
  Tablet,
  Monitor,
  CheckCircle2,
  Inbox,
  WifiOff,
  Sparkles,
  Zap,
  Calendar,
  MapPin,
  Car,
  Utensils,
  Sun,
  AlertTriangle,
  Navigation,
  Edit3,
  Bell,
  ChevronRight,
  Check,
  Search,
  Maximize2,
  SlidersHorizontal,
  Volume2,
  Clock,
  ShieldCheck,
  FileText,
  Activity,
  Layers as LayersIcon,
  Lock,
  Gift,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { DEVICE_MATRIX, closestDeviceProfile } from '../lib/deviceMatrix.mjs'
import { COMPONENT_MANIFEST, DESIGN_SYSTEM_VERSION } from '../design-system/documentation.mjs'
import { ROOM_TONE_COLORS, DEFAULT_THEME_COLORS } from '../design-system/tokens.mjs'
import {
  Button,
  Checkbox,
  Combobox,
  ConfirmationDialog,
  ContentSection,
  Card,
  CalendarPill,
  Chip,
  DateTimeDial,
  DisclosureSection,
  EmptyState,
  Field,
  Heading,
  IconButton,
  Input,
  LiveTranscript,
  Modal,
  MasterDetailLayout,
  PageFeedback,
  PageHeader,
  PersonAvatarStack,
  Progress,
  Radio,
  Select,
  Sheet,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonRow,
  Switch,
  Text,
  Textarea,
  Toast,
  ThreeRailLayout,
  WorkflowActions,
  Alert,
  StatusDot,
  HeroCard,
  JourneyProgressBar,
  WidgetContainer,
  ScheduleStreamItem,
  ActionCard,
} from '../components/ui'

// ── Typography Specimen Tokens ──────────────────────────────────────────────
const TYPE_ROLES: { className: string; role: string; token: string; specs: string }[] = [
  { className: 'text-display-xl font-display', role: 'Display XL', token: '--text-display-xl', specs: '52-76px · Cormorant · Line 1.1' },
  { className: 'text-display-lg font-display', role: 'Display Large', token: '--text-display-lg', specs: '40-60px · Cormorant · Line 1.15' },
  { className: 'text-display-md font-display', role: 'Display Medium', token: '--text-display-md', specs: '32-46px · Cormorant · Line 1.2' },
  { className: 'text-display-sm font-display', role: 'Display Small', token: '--text-display-sm', specs: '26-38px · Cormorant · Line 1.25' },
  { className: 'text-heading font-display', role: 'Heading', token: '--text-heading', specs: '23-32px · Cormorant · Line 1.3' },
  { className: 'text-body-lg', role: 'Body Large', token: '--text-body-lg', specs: '19-26px · DM Sans · Line 1.5' },
  { className: 'text-body', role: 'Body', token: '--text-body', specs: '17-23px · DM Sans · Line 1.5' },
  { className: 'text-body-sm', role: 'Body Small', token: '--text-body-sm', specs: '15-21px · DM Sans · Line 1.45' },
  { className: 'text-caption', role: 'Caption', token: '--text-caption', specs: '14-18px · DM Sans · Line 1.4' },
]

const FONT_FAMILIES: { className: string; label: string; token: string; sample: string; usage: string }[] = [
  {
    className: 'font-display',
    label: 'Display Serif',
    token: '--font-display (Cormorant Garamond)',
    sample: 'Warm Palm Beach Hospitality & Heritage',
    usage: 'Used for large headlines, hero titles, and editorial headers.',
  },
  {
    className: 'font-body',
    label: 'Body Sans',
    token: '--font-body (DM Sans)',
    sample: 'Ultra-legible touch interfaces, labels, and content.',
    usage: 'Used for all core UI controls, body copy, and dialog text.',
  },
  {
    className: 'font-mono',
    label: 'Technical Mono',
    token: '--font-mono (JetBrains Mono)',
    sample: '10:45 AM · 88°F · 239 Cocoanut Row · 1.75×',
    usage: 'Used for timestamps, temperatures, metrics, and tokens.',
  },
]

// ── Color Swatches ──────────────────────────────────────────────────────────
const CORE_PALETTE = [
  { name: 'Canvas Background', token: '--color-casa-bg', cssClass: 'bg-casa-bg', hex: DEFAULT_THEME_COLORS['casa-bg'], desc: 'Warm alabaster base for all pages' },
  { name: 'Background Inset', token: '--color-casa-bg-2', cssClass: 'bg-casa-bg-2', hex: DEFAULT_THEME_COLORS['casa-bg-2'], desc: 'Recessed sections & grouped wells' },
  { name: 'Pure Surface', token: '--color-casa-surface', cssClass: 'bg-casa-surface', hex: DEFAULT_THEME_COLORS['casa-surface'], desc: 'Elevated cards, dialogs, and sheets' },
  { name: 'Command Navy', token: '--color-casa-navy', cssClass: 'bg-casa-navy', hex: DEFAULT_THEME_COLORS['casa-navy'], desc: 'Primary brand authority and contrast' },
  { name: 'Palm Beach Gold', token: '--color-casa-gold', cssClass: 'bg-casa-gold', hex: DEFAULT_THEME_COLORS['casa-gold'], desc: 'Warm sunlit accent & Copilot AI' },
  { name: 'Primary Text', token: '--color-casa-text', cssClass: 'bg-casa-text', hex: DEFAULT_THEME_COLORS['casa-text'], desc: 'Deep charcoal high-contrast text' },
  { name: 'Secondary Text', token: '--color-casa-text-secondary', cssClass: 'bg-casa-text-secondary', hex: DEFAULT_THEME_COLORS['casa-text-secondary'], desc: 'Subheadings, meta, and explanations' },
  { name: 'Border Subtle', token: '--color-casa-border', cssClass: 'bg-casa-border', hex: DEFAULT_THEME_COLORS['casa-border'], desc: 'Architectural separation lines' },
]

const SEMANTIC_PALETTE = [
  { name: 'Emerald Success', token: '--color-casa-success', cssClass: 'bg-casa-success', hex: DEFAULT_THEME_COLORS['casa-success'], desc: 'Confirmed actions, active transit, synced' },
  { name: 'Amber Warning', token: '--color-casa-warning', cssClass: 'bg-casa-warning', hex: DEFAULT_THEME_COLORS['casa-warning'], desc: 'Schedule conflicts, ride needed, triage' },
  { name: 'Crimson Error', token: '--color-casa-error', cssClass: 'bg-casa-error', hex: DEFAULT_THEME_COLORS['casa-error'], desc: 'Destructive alerts, connection failure' },
  { name: 'Cyan Info', token: '--color-casa-info', cssClass: 'bg-casa-info', hex: DEFAULT_THEME_COLORS['casa-info'], desc: 'Suggestions, weather, household facts' },
]

const FAMILY_PALETTE = [
  { name: 'Jake', token: '--color-family-jake', cssClass: 'bg-family-jake', desc: 'Dad · Navy Blue' },
  { name: 'Kelly', token: '--color-family-kelly', cssClass: 'bg-family-kelly', desc: 'Mom · Terracotta Sunset' },
  { name: 'Liv', token: '--color-family-liv', cssClass: 'bg-family-liv', desc: 'Daughter · Sage Emerald' },
  { name: 'Emme', token: '--color-family-emme', cssClass: 'bg-family-emme', desc: 'Daughter · Rose Petal' },
  { name: 'Owen', token: '--color-family-owen', cssClass: 'bg-family-owen', desc: 'Son · Golden Mustard' },
]

const RADII_TOKENS = [
  { label: 'Button', token: '--radius-button', value: '0.5rem (8px)', cssClass: 'rounded-button' },
  { label: 'Card', token: '--radius-card', value: '0.75rem (12px)', cssClass: 'rounded-card' },
  { label: 'Widget / Bento', token: '--radius-widget', value: '1.25rem (20px)', cssClass: 'rounded-widget' },
  { label: 'Container / Hero', token: '--radius-container', value: '1.5rem (24px)', cssClass: 'rounded-container' },
  { label: 'Modal / Sheet', token: '--radius-modal', value: '1rem (16px)', cssClass: 'rounded-modal' },
  { label: 'Pill Capsule', token: '--radius-pill', value: '9999px (Full)', cssClass: 'rounded-pill' },
]

const SHADOW_TOKENS = [
  { label: 'Card Elevation', token: '--shadow-card', cssClass: 'shadow-card', desc: 'Standard 1-level elevated surface' },
  { label: 'Card Hover / Press', token: '--shadow-card-hover', cssClass: 'shadow-card-hover', desc: 'Interactive focus & lift' },
  { label: 'Widget Bento', token: '--shadow-widget', cssClass: 'shadow-widget', desc: 'Deep soft ambient room elevation' },
  { label: 'Hero Dark', token: '--shadow-hero-dark', cssClass: 'shadow-hero-dark', desc: 'High-contrast luxury navy depth' },
  { label: 'Modal Layer', token: '--shadow-modal', cssClass: 'shadow-modal', desc: 'Overlay focal backdrop separation' },
  { label: 'FAB / Trigger', token: '--shadow-fab', cssClass: 'shadow-fab', desc: 'Floating action button depth' },
]

type SectionCategory = 'all' | 'foundations' | 'controls' | 'selection' | 'data' | 'living-canvas' | 'feedback' | 'layouts' | 'matrix'

function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [isFinePointer, setIsFinePointer] = useState(false)
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const onMq = () => setIsFinePointer(mq.matches)
    onMq()
    mq.addEventListener('change', onMq)
    return () => {
      window.removeEventListener('resize', onResize)
      mq.removeEventListener('change', onMq)
    }
  }, [])
  return { ...size, isFinePointer }
}

export default function DesignSystemGalleryPage() {
  const { width, height, isFinePointer } = useViewport()

  // ── Navigation & Category State ──────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<SectionCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Interactive Component States ──────────────────────────────────────────
  const [selectedRoomTone, setSelectedRoomTone] = useState<keyof typeof ROOM_TONE_COLORS>('day')
  const [switchOn, setSwitchOn] = useState(true)
  const [switchSecondaryOn, setSwitchSecondaryOn] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(true)
  const [radioSelected, setRadioSelected] = useState('first')
  const [calendarViewSegment, setCalendarViewSegment] = useState<'day' | 'stacked' | 'week' | 'month'>('day')
  const [ambientModeSegment, setAmbientModeSegment] = useState<'calm' | 'turbo'>('calm')
  const [mealScopeSegment, setMealScopeSegment] = useState<'tonight' | 'plan'>('tonight')
  const [comboboxValue, setComboboxValue] = useState('produce')
  const [dialStart, setDialStart] = useState('2026-08-14T15:00')
  const [dialEnd, setDialEnd] = useState('2026-08-14T16:30')
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const [highlightedStreamId, setHighlightedStreamId] = useState<string | null>('gymnastics')
  const [heroJourneyPhase, setHeroJourneyPhase] = useState<'prep' | 'leave-now' | 'en-route' | 'in-session'>('prep')

  // ── Overlays & Dialogs ───────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('Changes saved successfully')

  const density = document.documentElement.dataset.density ?? 'touch'
  const closest = useMemo(
    () => closestDeviceProfile(width, height, isFinePointer ? 'fine-pointer' : 'touch'),
    [width, height, isFinePointer],
  )

  const sampleFamilyMembers = useMemo(
    () => [
      { id: 'jake', name: 'Jake', color: 'var(--color-family-jake)' },
      { id: 'kelly', name: 'Kelly', color: 'var(--color-family-kelly)' },
      { id: 'liv', name: 'Liv', color: 'var(--color-family-liv)' },
      { id: 'emme', name: 'Emme', color: 'var(--color-family-emme)' },
      { id: 'owen', name: 'Owen', color: 'var(--color-family-owen)' },
    ],
    [],
  )

  const shouldShowSection = (section: SectionCategory) => {
    if (activeCategory === 'all') return true
    return activeCategory === section
  }

  return (
    <div className="space-y-10 pb-20">
      {/* ════════════════════════════════════════════════════════════════════════
          🏛️ HERO: CASA TABOR DESIGN SYSTEM CANONICAL HEADER
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 sm:p-8 shadow-widget relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-navy text-casa-gold text-caption font-bold tracking-wide uppercase shadow-2xs">
                <Sparkles size={13} className="text-casa-gold" />
                Living Canvas v{DESIGN_SYSTEM_VERSION}
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-casa-bg border border-casa-border text-casa-navy text-caption font-semibold">
                <LayersIcon size={13} className="text-casa-gold" />
                {COMPONENT_MANIFEST.length} Registered Components
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 text-caption font-semibold">
                <ShieldCheck size={13} className="text-emerald-700" />
                100% Token Compliant
              </span>
            </div>

            <h1 className="font-display text-display-md sm:text-display-lg font-bold text-casa-navy tracking-tight leading-none">
              Casa Tabor Design System
            </h1>

            <p className="text-body text-casa-text-secondary leading-relaxed">
              The unified design system powering Casa Tabor across wall-mounted touch kiosks, kitchen smart displays, iPad tablets, desktop workstations, and mobile phones. Built on high-contrast residential typography, ambient circadian light shifts, and strict 44px+ touch geometry.
            </p>

            <div className="pt-1 flex items-center gap-2 text-caption text-casa-muted">
              <Lock size={13} className="text-casa-gold" />
              <span>Developer reference: This gallery is a read-only QA surface. Household appearance and text-size controls live in Appearance & Display.</span>
            </div>
          </div>

          {/* Live Viewport & Touch Diagnostics Panel */}
          <div className="rounded-widget border border-casa-border bg-casa-bg p-4.5 min-w-[280px] sm:min-w-[320px] shadow-2xs space-y-2.5 self-start lg:self-auto">
            <div className="flex items-center justify-between">
              <span className="text-caption font-bold uppercase tracking-widest text-casa-navy flex items-center gap-1.5">
                <Activity size={14} className="text-casa-gold" />
                Live Viewport Telemetry
              </span>
              <StatusDot variant="active" size="sm" />
            </div>

            <div className="space-y-1.5 pt-1 text-caption">
              <div className="flex items-center justify-between">
                <span className="text-casa-text-secondary">Resolution:</span>
                <span className="font-mono font-bold text-casa-navy">{width} × {height} px</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-casa-text-secondary">Input & Pointer:</span>
                <span className="font-medium text-casa-navy">{isFinePointer ? 'Fine Mouse / Trackpad' : 'Touch Screen Pointer'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-casa-text-secondary">Density Engine:</span>
                <span className="font-mono font-semibold text-casa-gold uppercase">{density}</span>
              </div>
              <div className="flex items-center justify-between border-t border-casa-border/60 pt-1.5">
                <span className="text-casa-text-secondary">Nearest Matrix Profile:</span>
                <span className="font-semibold text-casa-navy">{closest.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Category Navigation Bar ── */}
        <div className="mt-6 pt-5 border-t border-casa-border/60 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {[
              { id: 'all', label: 'All Catalog' },
              { id: 'foundations', label: 'Foundations & Tokens' },
              { id: 'controls', label: 'Buttons & Inputs' },
              { id: 'selection', label: 'Selection & Tabs' },
              { id: 'data', label: 'Data & Badges' },
              { id: 'living-canvas', label: 'Living Canvas Widgets' },
              { id: 'feedback', label: 'Feedback & Dialogs' },
              { id: 'layouts', label: 'Layouts' },
              { id: 'matrix', label: 'Device Matrix' },
            ].map((cat) => (
              <Button
                key={cat.id}
                size="sm"
                variant={activeCategory === cat.id ? 'strong' : 'ghost'}
                onClick={() => setActiveCategory(cat.id as SectionCategory)}
                className={cn(
                  'rounded-pill text-caption font-semibold px-3.5 whitespace-nowrap min-h-control-sm transition-all',
                  activeCategory === cat.id
                    ? 'bg-casa-navy text-white shadow-2xs'
                    : 'text-casa-text-secondary hover:text-casa-navy hover:bg-casa-bg',
                )}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <div className="relative min-w-[200px] hidden sm:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted z-10" />
            <Input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 rounded-pill"
            />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ☀️ FOUNDATIONS 1: CIRCADIAN ROOM TONE & DYNAMIC LIGHTING
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('foundations') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Sun}
            title="Circadian Lighting & Room Tone System"
            description="Dynamic background and temperature adjustment designed for living rooms and kitchen kiosks throughout the day."
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-bold text-casa-muted uppercase tracking-wider mr-2">
              Select Circadian Phase:
            </span>
            {(Object.keys(ROOM_TONE_COLORS) as (keyof typeof ROOM_TONE_COLORS)[]).map((tone) => (
              <Button
                key={tone}
                size="sm"
                variant={selectedRoomTone === tone ? 'primary' : 'secondary'}
                onClick={() => setSelectedRoomTone(tone)}
                className="capitalize rounded-pill min-h-control px-4 font-semibold"
              >
                {tone.replace('-', ' ')}
              </Button>
            ))}
          </div>

          {/* Dynamic Interactive Preview Canvas */}
          <div
            className="rounded-widget p-6 sm:p-8 border border-casa-border/80 transition-colors duration-700 space-y-4 shadow-sm"
            style={{ backgroundColor: ROOM_TONE_COLORS[selectedRoomTone] }}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                  Live Ambient Surface Simulation
                </span>
                <h3 className="font-display text-display-sm font-bold text-casa-navy capitalize mt-0.5">
                  {selectedRoomTone.replace('-', ' ')} Tone Profile
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-caption font-mono font-bold px-3.5 py-1.5 rounded-full bg-casa-surface border border-casa-border text-casa-navy shadow-xs">
                  {ROOM_TONE_COLORS[selectedRoomTone]}
                </span>
                <span className="text-caption font-semibold px-3.5 py-1.5 rounded-full bg-casa-surface border border-casa-border text-casa-navy shadow-xs">
                  Token: <code>--color-room-tone-{selectedRoomTone}</code>
                </span>
              </div>
            </div>

            <p className="text-body text-casa-navy max-w-2xl leading-relaxed">
              Room Tone automatically softens screen glare and filters out harsh blue light during early morning breakfast routines and late evening family wind-downs. Contrast ratios remain certified above WCAG AA against all text elements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-card bg-casa-surface border border-casa-border shadow-xs">
                <span className="text-caption font-bold text-casa-navy block">Kitchen Island Kiosk</span>
                <span className="text-caption text-casa-text-secondary mt-0.5 block">Warm natural illumination</span>
              </div>
              <div className="p-3.5 rounded-card bg-casa-surface border border-casa-border shadow-xs">
                <span className="text-caption font-bold text-casa-navy block">Living Canvas Ambient Mode</span>
                <span className="text-caption text-casa-text-secondary mt-0.5 block">Subtle gallery artwork backdrop</span>
              </div>
              <div className="p-3.5 rounded-card bg-casa-surface border border-casa-border shadow-xs">
                <span className="text-caption font-bold text-casa-navy block">Night-Time Dimming</span>
                <span className="text-caption text-casa-text-secondary mt-0.5 block">Low-lumen non-intrusive wake</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          🎨 FOUNDATIONS 2: COLOR PALETTE & SEMANTIC DESIGN TOKENS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('foundations') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Palette}
            title="Color Palette & Token System"
            description="Strictly standardized tokens. Every color serves a designated visual and accessibility purpose with guaranteed high contrast."
          />

          <div className="space-y-6">
            {/* Core Architectural Palette */}
            <div>
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted mb-3">
                Core Architectural Tokens
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {CORE_PALETTE.map((c) => (
                  <div key={c.name} className="rounded-widget border border-casa-border bg-casa-bg p-3.5 space-y-2.5">
                    <div className={cn('h-14 w-full rounded-button border border-casa-border/60 shadow-2xs', c.cssClass)} />
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm font-bold text-casa-navy">{c.name}</span>
                        <span className="text-caption font-mono text-casa-muted">{c.hex}</span>
                      </div>
                      <span className="text-caption font-mono text-casa-gold block mt-0.5">{c.token}</span>
                      <p className="text-caption text-casa-text-secondary mt-1">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Semantic Feedback Palette */}
            <div>
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted mb-3">
                Semantic Status Tokens
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {SEMANTIC_PALETTE.map((c) => (
                  <div key={c.name} className="rounded-widget border border-casa-border bg-casa-bg p-3.5 space-y-2.5">
                    <div className={cn('h-12 w-full rounded-button border border-black/10 shadow-2xs', c.cssClass)} />
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm font-bold text-casa-navy">{c.name}</span>
                        <span className="text-caption font-mono text-casa-muted">{c.hex}</span>
                      </div>
                      <span className="text-caption font-mono text-casa-gold block mt-0.5">{c.token}</span>
                      <p className="text-caption text-casa-text-secondary mt-1">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Family Member Identity Palette */}
            <div>
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted mb-3">
                Family Member Identity Tokens
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {FAMILY_PALETTE.map((f) => (
                  <div key={f.name} className="rounded-widget border border-casa-border bg-casa-bg p-3 space-y-2 text-center">
                    <div className={cn('h-10 w-full rounded-button border border-black/10 shadow-2xs mx-auto', f.cssClass)} />
                    <div>
                      <span className="text-body-sm font-bold text-casa-navy block">{f.name}</span>
                      <span className="text-caption font-mono text-casa-gold block">{f.token}</span>
                      <span className="text-caption text-casa-muted block mt-0.5">{f.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          🔤 FOUNDATIONS 3: FLUID TYPOGRAPHY HIERARCHY
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('foundations') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={FileText}
            title="Fluid Typography System"
            description="Editorial serif headings paired with clean geometric body sans and technical mono. Automatically scales via clamp() from phone to 1080p kiosk."
          />

          {/* Font Families Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FONT_FAMILIES.map((f) => (
              <div key={f.label} className="rounded-widget border border-casa-border bg-casa-bg p-4.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm font-bold text-casa-navy">{f.label}</span>
                  <span className="text-caption font-mono text-casa-gold">{f.token}</span>
                </div>
                <p className={cn(f.className, 'text-display-xs text-casa-navy leading-snug py-1')}>
                  {f.sample}
                </p>
                <p className="text-caption text-casa-text-secondary border-t border-casa-border/60 pt-2">
                  {f.usage}
                </p>
              </div>
            ))}
          </div>

          {/* Type Specimen Hierarchy */}
          <div className="space-y-3 pt-2">
            <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
              Semantic Type Hierarchy & Responsive Roles
            </h3>

            <div className="divide-y divide-casa-border/60 rounded-widget border border-casa-border bg-casa-bg p-4 sm:p-5">
              {TYPE_ROLES.map((t) => (
                <div key={t.role} className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className={cn(t.className, 'text-casa-navy leading-tight truncate')}>
                      {t.role === 'Display XL' ? (
                        <>Good evening, <span className="italic font-normal">Tabor Family</span></>
                      ) : t.role === 'Display Large' ? (
                        'Living Canvas & Daily Briefing'
                      ) : t.role === 'Display Medium' ? (
                        'Household Agenda & Schedule Stream'
                      ) : t.role === 'Display Small' ? (
                        'Owen & Emme School Transit Details'
                      ) : t.role === 'Heading' ? (
                        'Tonight’s Dinner: Lemon Herb Roast Chicken'
                      ) : (
                        'The quick brown fox jumps over the lazy dog — 10:45 AM'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-caption font-mono">
                    <span className="font-semibold text-casa-navy">{t.role}</span>
                    <span className="text-casa-gold">{t.token}</span>
                    <span className="text-casa-muted hidden lg:inline">{t.specs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          📐 FOUNDATIONS 4: TOUCH TARGETS, RADII & ELEVATION
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('foundations') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Ruler}
            title="Geometry, Radii & Elevation Tokens"
            description="Strict touch target constraints ensuring effortless operation from 8 feet away on wall kiosks and thumb-friendly mobile reach."
          />

          {/* Touch Target Rules */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-widget border border-casa-border bg-casa-bg p-4.5 flex items-center gap-4">
              <div className="size-control-sm rounded-full bg-casa-accent-subtle border-2 border-casa-gold flex items-center justify-center font-bold text-casa-navy shrink-0">
                36px
              </div>
              <div>
                <span className="text-body-sm font-bold text-casa-navy block">Control Small (Compact)</span>
                <span className="text-caption text-casa-text-secondary mt-0.5 block">Secondary compact density and dense ribbons</span>
              </div>
            </div>

            <div className="rounded-widget border border-casa-border bg-casa-bg p-4.5 flex items-center gap-4">
              <div className="size-control-md rounded-full bg-casa-info-soft border-2 border-casa-info flex items-center justify-center font-bold text-casa-info-strong shrink-0">
                40px
              </div>
              <div>
                <span className="text-body-sm font-bold text-casa-navy block">Control Medium (Standard)</span>
                <span className="text-caption text-casa-text-secondary mt-0.5 block">Desktop & tablet standard controls</span>
              </div>
            </div>

            <div className="rounded-widget border-2 border-emerald-500/50 bg-emerald-500/5 p-4.5 flex items-center gap-4">
              <div className="size-control rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center shrink-0 shadow-sm">
                44+
              </div>
              <div>
                <span className="text-body-sm font-bold text-emerald-950 block">P0 Touch Standard (44-48px)</span>
                <span className="text-caption text-emerald-900 mt-0.5 block">Mandatory minimum target for mobile thumbs & kiosks</span>
              </div>
            </div>
          </div>

          {/* Radii & Shadows Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Radii */}
            <div className="space-y-3">
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                Corner Radii Hierarchy
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {RADII_TOKENS.map((r) => (
                  <div key={r.label} className="rounded-widget border border-casa-border bg-casa-bg p-3 text-center space-y-2">
                    <div className={cn('h-12 w-full bg-casa-surface border border-casa-border/80 shadow-2xs mx-auto', r.cssClass)} />
                    <div>
                      <span className="text-caption font-bold text-casa-navy block">{r.label}</span>
                      <span className="text-caption font-mono text-casa-gold block">{r.token}</span>
                      <span className="text-caption text-casa-muted block">{r.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shadows */}
            <div className="space-y-3">
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                Elevation & Shadow Tokens
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SHADOW_TOKENS.map((s) => (
                  <div key={s.label} className="rounded-widget border border-casa-border bg-casa-bg p-3 text-center space-y-2">
                    <div className={cn('h-12 w-full bg-casa-surface rounded-card border border-casa-border/40 mx-auto', s.cssClass)} />
                    <div>
                      <span className="text-caption font-bold text-casa-navy block">{s.label}</span>
                      <span className="text-caption font-mono text-casa-gold block">{s.token}</span>
                      <span className="text-caption text-casa-muted block line-clamp-1">{s.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ⚡ CONTROLS 1: BUTTONS & ICON BUTTONS SHOWCASE
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('controls') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Zap}
            title="Buttons & Interactive Action Triggers"
            description="Full interactive button variants, icon buttons, loading states, and alignment contracts."
          />

          <div className="space-y-6">
            {/* Primary & Variant Matrix */}
            <div className="space-y-3">
              <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                Standard Button Variants
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => { setToastMessage('Primary gold action triggered'); setToastOpen(true); }}>
                  <Sparkles size={16} />
                  <span>Primary (Gold)</span>
                </Button>

                <Button variant="strong" onClick={() => { setToastMessage('Strong navy action triggered'); setToastOpen(true); }}>
                  <Zap size={16} />
                  <span>Strong (Navy)</span>
                </Button>

                <Button variant="secondary" onClick={() => { setToastMessage('Secondary action triggered'); setToastOpen(true); }}>
                  Secondary Action
                </Button>

                <Button variant="subtle" onClick={() => { setToastMessage('Subtle utility triggered'); setToastOpen(true); }}>
                  Subtle Utility
                </Button>

                <Button variant="ghost" onClick={() => { setToastMessage('Ghost action triggered'); setToastOpen(true); }}>
                  Ghost Button
                </Button>

                <Button variant="danger" onClick={() => setConfirmationOpen(true)}>
                  Danger Action
                </Button>

                <Button loading>
                  Saving Changes
                </Button>

                <Button disabled>
                  Disabled State
                </Button>
              </div>
            </div>

            {/* Icon Buttons & Pill Triggers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-casa-border/60">
              <div className="space-y-3">
                <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                  Square & Round Icon Buttons (44px Minimum)
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <IconButton
                    icon={<Sparkles size={18} />}
                    aria-label="Launch AI Copilot"
                    variant="primary"
                    onClick={() => { setToastMessage('Copilot summoned'); setToastOpen(true); }}
                  />
                  <IconButton
                    icon={<Calendar size={18} />}
                    aria-label="Open Schedule"
                    variant="strong"
                    onClick={() => { setToastMessage('Schedule calendar opened'); setToastOpen(true); }}
                  />
                  <IconButton
                    icon={<Navigation size={18} />}
                    aria-label="Calculate directions"
                    variant="secondary"
                    onClick={() => { setToastMessage('Directions calculated'); setToastOpen(true); }}
                  />
                  <IconButton
                    icon={<Edit3 size={18} />}
                    aria-label="Edit event details"
                    variant="ghost"
                    onClick={() => { setToastMessage('Edit dialog activated'); setToastOpen(true); }}
                  />
                  <IconButton
                    icon={<AlertTriangle size={18} />}
                    aria-label="Delete event"
                    variant="danger"
                    onClick={() => setConfirmationOpen(true)}
                  />
                </div>
              </div>

              {/* Action Trigger Pills */}
              <div className="space-y-3">
                <h3 className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                  PillButton Workflow Triggers
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="primary"
                    className="rounded-pill px-4.5 font-bold shadow-xs"
                    onClick={() => { setToastMessage('Copilot Drawer Opened'); setToastOpen(true); }}
                  >
                    <Sparkles size={15} />
                    <span>Copilot Assistant</span>
                  </Button>
                  <Button
                    variant="strong"
                    className="rounded-pill px-4.5 font-bold shadow-xs"
                    onClick={() => setModalOpen(true)}
                  >
                    <Calendar size={15} />
                    <span>Add New Event</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-pill px-4 font-semibold"
                    onClick={() => setSheetOpen(true)}
                  >
                    <span>Quick Filter</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          📝 CONTROLS 2: FORMS, FIELDS, INPUTS & COMBOBOX
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('controls') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Edit3}
            title="Form Controls & Inputs"
            description="Accessible input wrappers automatically binding label, helper text, and validation states."
          />

          <div className="space-y-4">
            <Heading role="heading">Select and combobox</Heading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
              <Field label="Household Event Title" hint="Visible across all family devices in real-time.">
                <Input placeholder="e.g. Owen Pediatrician Checkup" />
              </Field>

              <Field label="Required Field (Validated)" error="Please provide a valid location or address.">
                <Input placeholder="Location required" />
              </Field>

              <Field label="Native select" hint="Use for short, stable option lists.">
                <Select defaultValue="transit">
                  <option value="transit">School Transit & Carpool</option>
                  <option value="medical">Doctor & Healthcare</option>
                  <option value="sports">Athletics & Practice</option>
                  <option value="household">Household Maintenance</option>
                </Select>
              </Field>

              <Combobox
                label="Searchable combobox"
                value={comboboxValue}
                onChange={setComboboxValue}
                options={[
                  { value: 'produce', label: 'Fresh Produce & Fruit' },
                  { value: 'dairy', label: 'Dairy, Milk & Eggs' },
                  { value: 'bakery', label: 'Artisan Bakery & Bread' },
                  { value: 'pantry', label: 'Pantry Staples & Spices' },
                  { value: 'meat', label: 'Butcher & Seafood' },
                ]}
              />

              <Field label="Preparation & Coordination Notes" className="md:col-span-2">
                <Textarea rows={2} placeholder="Add packing list, gate codes, or driver handoff details..." />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          🎛️ SELECTION & NAVIGATION: SEGMENTED CONTROLS, SWITCHES & RADIOS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('selection') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={SlidersHorizontal}
            title="Selection controls"
            description="Canonical selection primitives: SegmentedControl for mutual view switching, Switch for binary toggles, Checkbox for multi-select, and Radio for option groups."
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Segmented Controls */}
            <div className="rounded-widget border border-casa-border bg-casa-bg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                    SegmentedControl (The Switcher)
                  </span>
                  <h3 className="font-display text-body-lg font-bold text-casa-navy">
                    Recessed Track + Sliding Thumb
                  </h3>
                </div>
                <span className="text-caption font-mono text-casa-muted">role="radiogroup"</span>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                    Calendar View Controller
                  </label>
                  <SegmentedControl
                    aria-label="Calendar view selector"
                    value={calendarViewSegment}
                    onChange={setCalendarViewSegment}
                    options={[
                      { value: 'day', label: 'Day' },
                      { value: 'stacked', label: 'Stacked' },
                      { value: 'week', label: 'Week' },
                      { value: 'month', label: 'Month' },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                    Global Ambient Mode
                  </label>
                  <div className="max-w-xs">
                    <SegmentedControl
                      aria-label="Ambient mode selector"
                      value={ambientModeSegment}
                      onChange={setAmbientModeSegment}
                      options={[
                        { value: 'calm', label: 'Calm Living', icon: <Sun size={14} className="text-amber-600" /> },
                        { value: 'turbo', label: 'Turbo Kiosk', icon: <Zap size={14} className="text-casa-gold" /> },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                    Kitchen Scope Selector
                  </label>
                  <SegmentedControl
                    aria-label="Kitchen scope selector"
                    value={mealScopeSegment}
                    onChange={setMealScopeSegment}
                    options={[
                      { value: 'tonight', label: 'Cook Tonight' },
                      { value: 'plan', label: 'Plan the Week', icon: <Sparkles size={14} className="text-casa-gold" /> },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Binary Switches & Checkboxes */}
            <div className="rounded-widget border border-casa-border bg-casa-bg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                    Binary & Option Controls
                  </span>
                  <h3 className="font-display text-body-lg font-bold text-casa-navy">
                    Switches, Checkboxes & Radios
                  </h3>
                </div>
                <span className="text-caption font-mono text-casa-muted">Native Tactile Feedback</span>
              </div>

              <div className="divide-y divide-casa-border/70">
                <Switch
                  label="Circadian Ambient Shift"
                  description="Subtly warms screen temperature at sunrise & sunset."
                  checked={switchOn}
                  onCheckedChange={setSwitchOn}
                />

                <Switch
                  label="Copilot Voice Synthesis"
                  description="Plays spoken responses during active morning briefings."
                  checked={switchSecondaryOn}
                  onCheckedChange={setSwitchSecondaryOn}
                />

                <div className="py-2.5">
                  <Checkbox
                    label="Sync Google Family Calendars"
                    description="Automatically extracts school and sports invites."
                    checked={checkboxChecked}
                    onChange={(e) => setCheckboxChecked(e.target.checked)}
                  />
                </div>

                <div className="pt-3 space-y-1.5">
                  <span className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                    Default Notification Mode (Radio Group)
                  </span>
                  <div className="space-y-1">
                    <Radio
                      label="Visual Ambient Only (Low Anxiety)"
                      name="notif-mode"
                      value="first"
                      checked={radioSelected === 'first'}
                      onChange={() => setRadioSelected('first')}
                    />
                    <Radio
                      label="Chime & Spoken Alert"
                      name="notif-mode"
                      value="second"
                      checked={radioSelected === 'second'}
                      onChange={() => setRadioSelected('second')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          🏷️ DATA DISPLAY: CHIPS, BADGES, AVATARS & STATUS DOTS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('data') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={CheckCircle2}
            title="Data Display, Badges & Live Status Indicators"
            description="Categorical status badges, filter chips with selection states, and live pulsing status dots."
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Static Badges vs Interactive Action Pills */}
            <div className="space-y-4">
              <Card tone="subtle" padding="sm" className="space-y-3">
                <Heading role="heading">Static badges</Heading>
                <Text role="body-sm" muted>
                  Read-only labels for status, counts, categories, or metadata. They render as text, not buttons.
                </Text>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip size="sm">Small badge</Chip>
                  <Chip>Medium badge</Chip>
                  <Chip tone="success">Complete</Chip>
                  <Chip tone="info">Suggested</Chip>
                  <Chip tone="warning">Due soon</Chip>
                  <Chip tone="danger">Blocked</Chip>
                </div>
                <Text role="caption" muted className="font-mono">{'<Chip>Suggested</Chip>'}</Text>

                <div className="pt-2 border-t border-casa-border/60">
                  <span className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                    Dense Calendar Metadata
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalendarPill color="var(--color-family-jake)">Jake</CalendarPill>
                    <CalendarPill color="var(--color-family-kelly)">Kelly</CalendarPill>
                    <CalendarPill>+2</CalendarPill>
                  </div>
                </div>
              </Card>

              <Card tone="surface" padding="sm" className="space-y-3">
                <Heading role="heading">Interactive action pills</Heading>
                <Text role="body-sm" muted>
                  Tappable filters or compact actions with pressed, focus, and disabled states.
                </Text>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip size="sm" onClick={() => undefined}>Small action</Chip>
                  <Chip onClick={() => undefined}>Add item</Chip>
                  <Chip tone="accent" selected onClick={() => undefined}>Selected filter</Chip>
                  <Chip onClick={() => undefined} disabled>Disabled</Chip>
                </div>
                <Text role="caption" muted className="font-mono">{'<Chip onClick={...}>Add item</Chip>'}</Text>
              </Card>
            </div>

            {/* StatusDot Live Indicators & Avatar Stacks */}
            <div className="rounded-widget border border-casa-border bg-casa-bg p-5 space-y-4">
              <div>
                <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                  Live Animated Status & Avatars
                </span>
                <h3 className="font-display text-body-lg font-bold text-casa-navy mt-0.5">
                  StatusDots & PersonAvatarStack
                </h3>
              </div>

              {/* StatusDots */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-card bg-casa-surface border border-casa-border flex items-center gap-2.5">
                  <StatusDot variant="active" size="md" />
                  <div>
                    <span className="text-caption font-bold text-casa-navy block">active</span>
                    <span className="text-caption text-casa-muted block">Happening now</span>
                  </div>
                </div>

                <div className="p-3 rounded-card bg-casa-surface border border-casa-border flex items-center gap-2.5">
                  <StatusDot variant="warning" size="md" />
                  <div>
                    <span className="text-caption font-bold text-amber-900 block">warning</span>
                    <span className="text-caption text-casa-muted block">Action required</span>
                  </div>
                </div>

                <div className="p-3 rounded-card bg-casa-surface border border-casa-border flex items-center gap-2.5">
                  <StatusDot variant="gold" size="md" />
                  <div>
                    <span className="text-caption font-bold text-casa-gold block">gold</span>
                    <span className="text-caption text-casa-muted block">AI Copilot Sync</span>
                  </div>
                </div>

                <div className="p-3 rounded-card bg-casa-surface border border-casa-border flex items-center gap-2.5">
                  <StatusDot variant="info" size="md" />
                  <div>
                    <span className="text-caption font-bold text-casa-info-strong block">info</span>
                    <span className="text-caption text-casa-muted block">System notice</span>
                  </div>
                </div>
              </div>

              {/* Person Avatar Stacks */}
              <div className="pt-3 border-t border-casa-border/60 space-y-2">
                <span className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                  PersonAvatarStack
                </span>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <PersonAvatarStack people={sampleFamilyMembers} max={3} size="md" />
                    <span className="text-caption font-medium text-casa-navy">Whole Family (5 members)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ✨ LIVING CANVAS: HEROCARD, BENTO WIDGETS, SCHEDULE & TRIAGE
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('living-canvas') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Sparkles}
            title="Living Canvas & Specialized Widget Ecosystem"
            description="Hero focus spotlights, synchronized agenda streams with real-time hover sync, and 1-click triage action cards."
          />

          {/* Hero Focus Card Spotlight */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                  HeroCard — The Flagship Centerpiece
                </span>
                <p className="text-caption text-casa-muted mt-0.5">
                  Option A: Dual-Phase Journey & Departure Bar with At-Home Buffer and Transit Gate
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <SegmentedControl
                  aria-label="Journey phase selector"
                  value={heroJourneyPhase}
                  onChange={(val) => setHeroJourneyPhase(val as typeof heroJourneyPhase)}
                  options={[
                    { value: 'prep', label: '1. Prep (18m)' },
                    { value: 'leave-now', label: '2. Leave Now' },
                    { value: 'en-route', label: '3. En Route' },
                    { value: 'in-session', label: '4. Happening' },
                  ]}
                />
              </div>
            </div>

            {(() => {
              const mockStartTime = new Date(Date.now() + 35 * 60 * 1000)
              const mockEndTime = new Date(Date.now() + 95 * 60 * 1000)
              const mockDriveMins = 25
              const mockLeaveTime = new Date(mockStartTime.getTime() - mockDriveMins * 60 * 1000)

              // Dynamic mock values based on active phase
              let mockNow = new Date()
              let statusLabel = 'LEAVE IN 18 MIN (3:05 PM)'
              let statusVar: 'active' | 'warning' | 'gold' | 'neutral' | 'info' = 'active'

              if (heroJourneyPhase === 'prep') {
                mockNow = new Date(mockLeaveTime.getTime() - 18 * 60 * 1000)
                statusLabel = 'PREPARE TO LEAVE · 18M BUFFER'
                statusVar = 'warning'
              } else if (heroJourneyPhase === 'leave-now') {
                mockNow = new Date(mockLeaveTime.getTime() + 1 * 60 * 1000)
                statusLabel = '🚗 TIME TO LEAVE NOW'
                statusVar = 'gold'
              } else if (heroJourneyPhase === 'en-route') {
                mockNow = new Date(mockLeaveTime.getTime() + 15 * 60 * 1000)
                statusLabel = 'EN ROUTE · 25M DRIVE'
                statusVar = 'gold'
              } else if (heroJourneyPhase === 'in-session') {
                mockNow = new Date(mockStartTime.getTime() + 20 * 60 * 1000)
                statusLabel = 'HAPPENING NOW'
                statusVar = 'active'
              }

              return (
                <HeroCard
                  statusText={statusLabel}
                  statusVariant={statusVar}
                  timeBadge="3:30 PM – 4:30 PM"
                  title="Owen Dentist"
                  subtitle={
                    <>
                      <MapPin size={15} className="text-casa-gold shrink-0" />
                      <span>Wanuck, Hier & Associates · 1232 W Indiantown Rd, Jupiter, FL</span>
                    </>
                  }
                  prepSummary={
                    <div className="flex items-center gap-2 text-slate-300/90 text-caption">
                      <Gift size={15} className="text-casa-gold shrink-0" />
                      <span className="font-semibold text-white/90 shrink-0">Bring:</span>
                      <span className="text-white/75 truncate">New patient forms · Dental retainer case</span>
                    </div>
                  }
                  timeline={
                    <JourneyProgressBar
                      now={mockNow}
                      leaveAt={mockLeaveTime}
                      startTime={mockStartTime}
                      endTime={mockEndTime}
                      driveTimeMins={mockDriveMins}
                      showLabels={true}
                      originName="Prep to Leave"
                      destinationName="Dentist"
                      returnDestinationName="Home"
                    />
                  }
                  avatars={
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-white/10 text-white"
                        style={{ borderLeft: '3px solid var(--color-family-owen)' }}
                      >
                        Owen
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-casa-gold/25 text-casa-gold border border-casa-gold/50 shadow-sm ring-1 ring-casa-gold/30"
                      >
                        <Car size={12} className="text-casa-gold shrink-0 animate-pulse" />
                        <span>Kelly</span>
                        <span className="text-2xs uppercase tracking-wider font-bold opacity-80">(Driver)</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-caption text-white/80 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                        <Car size={13} className="text-casa-gold shrink-0" />
                        <span>Kelly driving · </span>
                        {heroJourneyPhase === 'in-session' ? (
                          <span>25m return drive</span>
                        ) : (
                          <>
                            <span>25m drive</span>
                            <span className="text-casa-gold font-bold">· Leave 3:05 PM</span>
                          </>
                        )}
                      </span>
                    </div>
                  }
                  actions={
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-casa-gold hover:bg-amber-400 text-slate-950 text-caption font-bold shadow-sm transition-all min-h-control"
                        onClick={() => {
                          window.open('https://www.google.com/maps/search/?api=1&query=Wanuck+Hier+Associates+Jupiter+FL', '_blank')
                        }}
                      >
                        <Navigation size={14} />
                        <span>Directions</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-caption font-semibold transition-all min-h-control"
                        onClick={() => {
                          setToastMessage('Event inspection modal opened');
                          setToastOpen(true);
                        }}
                      >
                        <span>View Details</span>
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  }
                  onClick={() => { setToastMessage('Hero card details inspected'); setToastOpen(true); }}
                />
              )
            })()}
          </div>

          {/* Ambient & Stylish Card: Tonight's Kitchen */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                Card tone="ambient" / "stylish" — Tonight's Kitchen Ambience
              </span>
              <span className="text-caption text-casa-muted">Residential Warmth & Ambient Culinary Glow</span>
            </div>

            <Card tone="ambient" padding="lg" className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-casa-gold/20 flex items-center justify-center text-casa-navy">
                    <Utensils size={18} className="text-casa-gold" />
                  </div>
                  <div>
                    <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                      Tonight's Kitchen · Palm Beach Table
                    </span>
                    <h3 className="font-display text-display-xs sm:text-display-sm font-bold text-casa-navy leading-none mt-0.5">
                      Lemon Herb Butter Roast Chicken
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-caption font-mono font-bold px-3 py-1 rounded-full bg-casa-surface border border-casa-border text-casa-navy shadow-2xs">
                    6:30 PM Dinner
                  </span>
                  <span className="text-caption font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-900 border border-amber-500/20">
                    Prep at 5:00 PM
                  </span>
                </div>
              </div>

              <p className="text-body text-casa-text-secondary leading-relaxed max-w-3xl">
                Crispy seasoned chicken paired with fresh roasted rosemary potatoes and tender asparagus spears. Seasoning and garlic marinade prepped by Kelly.
              </p>

              <div className="pt-3 border-t border-casa-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip size="sm" tone="accent">
                    <Sparkles size={12} className="text-casa-gold" />
                    Family Favorite
                  </Chip>
                  <Chip size="sm" tone="neutral">
                    <Clock size={12} className="text-casa-muted" />
                    45 min bake
                  </Chip>
                  <Chip size="sm" tone="success">
                    <Check size={12} />
                    All ingredients in pantry
                  </Chip>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="rounded-pill px-4 font-bold"
                    onClick={() => { setToastMessage('Recipe view opened'); setToastOpen(true); }}
                  >
                    View Recipe & Timers
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-pill px-3.5 font-semibold"
                    onClick={() => { setToastMessage('Preheat timer started (375°F)'); setToastOpen(true); }}
                  >
                    Preheat 375°F
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Synchronized 3-Pane Stream & Attention Hub */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            {/* Timeline Stream */}
            <div className="lg:col-span-6 space-y-3">
              <WidgetContainer
                icon={<Calendar size={18} className="text-casa-navy" />}
                title="Today's Timeline Stream"
                badge={<Chip size="sm" tone="accent">3 Events</Chip>}
              >
                <div className="space-y-2.5 mt-1">
                  <ScheduleStreamItem
                    timeText="3:30 PM – 4:30 PM"
                    title="Gymnastics Practice — Emme"
                    location="North Star Athletic Center"
                    members={[
                      { id: 'kelly', name: 'Kelly', color: 'var(--color-family-kelly)' },
                      { id: 'emme', name: 'Emme', color: 'var(--color-family-emme)' },
                    ]}
                    isHighlighted={highlightedStreamId === 'gymnastics'}
                    onMouseEnter={() => setHighlightedStreamId('gymnastics')}
                    onClick={() => setHighlightedStreamId('gymnastics')}
                  />
                  <ScheduleStreamItem
                    timeText="5:15 PM – 6:30 PM"
                    title="Soccer Pickup & Practice — Owen"
                    location="Community Soccer Complex (Field 3)"
                    members={[
                      { id: 'jake', name: 'Jake', color: 'var(--color-family-jake)' },
                      { id: 'owen', name: 'Owen', color: 'var(--color-family-owen)' },
                    ]}
                    isHighlighted={highlightedStreamId === 'soccer'}
                    onMouseEnter={() => setHighlightedStreamId('soccer')}
                    onClick={() => setHighlightedStreamId('soccer')}
                  />
                  <ScheduleStreamItem
                    timeText="7:00 PM – 8:00 PM"
                    title="Family Dinner & Homework Sync"
                    location="Kitchen / Dining Room"
                    members={sampleFamilyMembers.slice(0, 3)}
                    isHighlighted={highlightedStreamId === 'dinner'}
                    onMouseEnter={() => setHighlightedStreamId('dinner')}
                    onClick={() => setHighlightedStreamId('dinner')}
                  />
                </div>
              </WidgetContainer>
            </div>

            {/* Attention Hub Action Cards */}
            <div className="lg:col-span-6 space-y-3">
              <WidgetContainer
                icon={<Zap size={18} className="text-amber-500" />}
                title="Attention Hub (1-Click Triage)"
                badge={<span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">2 Actionable</span>}
              >
                <div className="space-y-3 mt-1">
                  <ActionCard
                    category="RIDE NEEDED · 5:15 PM"
                    icon={<AlertTriangle size={15} className="text-amber-600 shrink-0" />}
                    description="Owen's soccer pickup overlaps with Liv's robotics meet. Driver coordination required."
                    actions={
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => { setToastMessage('Jake assigned to drive Owen'); setToastOpen(true); }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-sm transition-all min-h-control"
                        >
                          Assign Jake (Driver)
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setToastMessage('Kelly assigned to drive Owen'); setToastOpen(true); }}
                          className="px-3.5 py-2 rounded-xl bg-casa-navy text-white hover:bg-slate-800 text-caption font-bold shadow-sm transition-all min-h-control"
                        >
                          Assign Kelly
                        </Button>
                      </>
                    }
                  />

                  <ActionCard
                    category="PREP ALERT · DINNER"
                    tone="accent"
                    icon={<Sparkles size={15} className="text-casa-gold shrink-0" />}
                    description="Preheat oven to 375°F for Lemon Herb Chicken at 5:00 PM."
                    actions={
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setToastMessage('Oven preheat step marked done'); setToastOpen(true); }}
                        className="px-3.5 py-2 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-gold text-casa-navy text-caption font-bold shadow-sm transition-all min-h-control"
                      >
                        Mark Done
                      </Button>
                    }
                  />
                </div>
              </WidgetContainer>
            </div>
          </div>

          {/* Progressive Touch Time Dial & Live Voice Transcript */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-casa-border/60">
            {/* DateTimeDial */}
            <Card padding="md" tone="subtle" className="space-y-3">
              <Heading role="heading">Progressive Touch Time Dial (DateTimeDial)</Heading>
              <Text role="body-sm" muted className="mb-2">
                Replaces cluttered native pickers with fluid touch wheels for rapid event scheduling.
              </Text>
              <DateTimeDial
                startValue={dialStart}
                endValue={dialEnd}
                onStartChange={setDialStart}
                onEndChange={setDialEnd}
              />
              <DisclosureSection
                title="Additional Location & Gate Details"
                summary="Pickup · 2 completed"
                open={disclosureOpen}
                onOpenChange={setDisclosureOpen}
                className="mt-3 rounded-card border border-casa-border bg-casa-surface"
              >
                <Field label="Gate Code / Instructions">
                  <Input placeholder="Gate Code: 4829" />
                </Field>
              </DisclosureSection>
            </Card>

            {/* LiveVoiceTranscript */}
            <Card padding="md" tone="surface" className="space-y-3">
              <div className="flex items-center justify-between">
                <Heading role="heading">Voice Intelligence (LiveTranscript)</Heading>
                <span className="flex items-center gap-1.5 text-caption font-bold text-emerald-800 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  <Volume2 size={13} className="text-emerald-700" />
                  Listening 48dB
                </span>
              </div>
              <Text role="body-sm" muted className="mb-2">
                Real-time speech-to-text transcript widget streaming interim and committed natural language.
              </Text>
              <div className="rounded-widget border border-casa-border bg-casa-bg p-4 shadow-2xs">
                <LiveTranscript
                  committed="Add organic milk and free-range eggs"
                  interim="for tomorrow morning breakfast"
                  phase="listening"
                  volume={52}
                  className="rounded-none border-0 bg-transparent p-0 shadow-none"
                />
                <div className="mt-3.5 flex justify-between gap-3 pt-3 border-t border-casa-border/60">
                  <Button size="sm" variant="subtle" onClick={() => { setToastMessage('Switched to keyboard entry'); setToastOpen(true); }}>
                    Type Instead
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => { setToastMessage('Voice command processed'); setToastOpen(true); }}>
                    Confirm Item
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          📢 FEEDBACK & OVERLAYS: ALERTS, SKELETONS, EMPTY STATES & DIALOGS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('feedback') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Bell}
            title="Alerts and banners"
            description="Accessible banners, progress indicators, skeleton shimmers, empty states, and modal sheets."
          />

          {/* Alerts & Banners */}
          <div className="space-y-3">
            <Heading role="heading">Alerts and banners</Heading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Alert tone="info" title="Sync in Progress">
                Household calendar events are backed up to local cache.
              </Alert>
              <Alert tone="success" title="Grocery Order Placed">
                Publix delivery scheduled for 5:30 PM today.
              </Alert>
              <Alert tone="warning" title="Driver Unassigned">
                Owen soccer pickup at 5:15 PM has no confirmed driver.
              </Alert>
              <Alert tone="danger" title="Connection Offline" onDismiss={() => undefined}>
                Retrying cloud sync automatically in 15 seconds.
              </Alert>
            </div>
          </div>

          {/* Progress & Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2 border-t border-casa-border/60">
            <Card padding="sm" className="space-y-3">
              <Heading role="heading">Progress</Heading>
              <Progress label="Dinner Prep Progress" value={4} max={5} showValue />
              <Progress label="Syncing Living Canvas..." />
            </Card>

            <Card padding="sm" className="space-y-3">
              <Heading role="heading">Skeleton loading</Heading>
              <SkeletonRow />
              <Skeleton className="h-16 w-full rounded-card" />
            </Card>

            <Card padding="sm" className="space-y-3">
              <Heading role="heading">Toast / action confirmation</Heading>
              <Text role="body-sm" muted>
                Use for brief outcomes without moving page content; optional action supports Undo.
              </Text>
              <div className="flex flex-col gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => { setToastMessage('Item removed'); setToastOpen(true); }}>
                  Show Confirmation Toast
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>
                  Launch Accessible Modal
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)}>
                  Launch Slide-Out Sheet
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmationOpen(true)}>
                  Launch Confirmation Dialog
                </Button>
              </div>
            </Card>
          </div>

          {/* Empty States */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-casa-border/60">
            <EmptyState
              icon={<Inbox size={36} className="text-casa-gold" />}
              title="Nothing here yet"
              description="Explain what belongs here and offer one useful next action."
              action={<Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>Add Item</Button>}
            />
            <EmptyState
              tone="error"
              icon={<WifiOff size={36} />}
              title="Could not load"
              description="Name the failed operation and provide a truthful recovery action."
              action={<Button size="sm" variant="secondary" onClick={() => { setToastMessage('Retrying connection...'); setToastOpen(true); }}>Retry</Button>}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          📐 LAYOUTS: STRUCTURAL COMPOSITION PATTERNS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('layouts') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={Layers}
            title="Structural Layouts & Composition Patterns"
            description="Three-rail panoramic views, master-detail panes, and structured content sections."
          />

          <div className="space-y-4">
            <PageHeader
              eyebrow="Composition patterns"
              title="Predictable page assembly"
              description="These patterns combine tokens and primitives without changing their accessibility contracts."
              actions={<Button size="sm" variant="secondary" onClick={() => setConfirmationOpen(true)}>Open confirmation</Button>}
            />

            <ThreeRailLayout
              className="h-32 rounded-card border border-casa-border"
              navigation={<div className="h-full bg-casa-bg p-3 text-caption font-semibold text-casa-text-secondary">20% Navigation</div>}
              primary={<div className="h-full bg-casa-surface p-3 text-caption font-semibold text-casa-navy">55% Living Agenda Stream</div>}
              secondary={<div className="h-full bg-casa-bg-2 p-3 text-caption font-semibold text-casa-text-secondary">25% Attention Hub Context</div>}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <ContentSection title="Dense list section" description="Shared header, surface, divider, and density rhythm." density="dense">
                <div className="py-2.5 text-body-sm flex justify-between items-center">
                  <span className="font-medium text-casa-navy">Circadian Auto-Shift</span>
                  <span className="text-caption font-bold text-emerald-700">Enabled</span>
                </div>
                <div className="py-2.5 text-body-sm flex justify-between items-center border-t border-casa-border/60">
                  <span className="font-medium text-casa-navy">Touch Haptic Feedback</span>
                  <span className="text-caption font-bold text-casa-muted">Default</span>
                </div>
              </ContentSection>

              <MasterDetailLayout
                className="h-44 rounded-card border border-casa-border"
                showDetailOnMobile={false}
                master={<div className="p-3 text-body-sm font-semibold text-casa-navy">Master Navigation List</div>}
                detail={<div className="p-3 text-body-sm text-casa-text-secondary">Detail Workspace Content</div>}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 pt-2">
              <PageFeedback state="loading" title="Loading household data" rows={2} />
              <PageFeedback state="empty" title="No saved places" description="Add a place to make planning faster." />
              <PageFeedback state="success" title="Settings saved" description="Your changes are active on this device." />
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          📱 DEVICE MATRIX: OMNICHANNEL VALIDATION CONTRACTS
         ════════════════════════════════════════════════════════════════════════ */}
      {shouldShowSection('matrix') && (
        <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
          <SectionHeader
            icon={width >= 1024 ? Monitor : width >= 768 ? Tablet : Smartphone}
            title="Omnichannel Device Validation Matrix"
            description="Required viewport surfaces (src/lib/deviceMatrix.mjs) ensuring 100% adherence to touch targets, rem scaling, and 3-click navigation."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEVICE_MATRIX.map((d) => {
              const isCurrent = d.id === closest.id
              return (
                <div
                  key={d.id}
                  className={cn(
                    'rounded-widget border p-5 space-y-3 transition-all',
                    isCurrent
                      ? 'border-2 border-casa-gold bg-casa-accent-subtle/40 shadow-sm'
                      : 'border-casa-border bg-casa-bg',
                  )}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {d.id.includes('phone') ? (
                        <Smartphone size={18} className="text-casa-navy" />
                      ) : d.id.includes('tablet') ? (
                        <Tablet size={18} className="text-casa-navy" />
                      ) : d.id.includes('kiosk') ? (
                        <Maximize2 size={18} className="text-casa-gold" />
                      ) : (
                        <Monitor size={18} className="text-casa-navy" />
                      )}
                      <span className="text-body-sm font-bold text-casa-navy">
                        {d.label}
                      </span>
                    </div>

                    {isCurrent ? (
                      <span className="text-caption font-bold text-casa-navy px-2.5 py-0.5 rounded-full bg-casa-gold border border-casa-gold/60 shadow-2xs">
                        Active Viewport
                      </span>
                    ) : (
                      <span className="text-caption font-mono text-casa-muted">
                        {d.width}×{d.height}
                      </span>
                    )}
                  </div>

                  <p className="text-caption text-casa-text-secondary leading-relaxed">
                    {d.context}
                  </p>

                  <div className="border-t border-casa-border/60 pt-2.5 space-y-1.5">
                    <span className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                      Certified Acceptance Criteria
                    </span>
                    <ul className="space-y-1">
                      {d.acceptance.map((a) => (
                        <li key={a} className="text-caption text-casa-navy flex items-start gap-1.5">
                          <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          🪟 LIVE DIALOGS & TOAST OVERLAYS (WIRED)
         ════════════════════════════════════════════════════════════════════════ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Accessible Modal Dialog" size="lg">
        <div className="space-y-4">
          <Text role="body-sm" muted>
            Focus is safely trapped within the dialog boundary. Pressing Escape or tapping outside gracefully dismisses the overlay and returns focus to the origin trigger.
          </Text>
          <Field label="Sample Quick Item">
            <Input placeholder="Type item name..." defaultValue="Family Weekend Tennis" />
          </Field>
          <Button fullWidth variant="strong" onClick={() => setModalOpen(false)}>
            Save & Dismiss Dialog
          </Button>
        </div>
      </Modal>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Slide-Over Sheet Panel">
        <div className="space-y-4">
          <Text role="body-sm" muted>
            Slide-over sheet shares the same accessible focus and backdrop dimming contract. Ideal for filtering, detailed event inspectors, or settings editors.
          </Text>
          <Field label="Filter by Person">
            <Select defaultValue="all">
              <option value="all">Entire Family</option>
              <option value="jake">Jake</option>
              <option value="kelly">Kelly</option>
              <option value="liv">Liv</option>
              <option value="emme">Emme</option>
              <option value="owen">Owen</option>
            </Select>
          </Field>
          <WorkflowActions className="mt-6">
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Apply Filters
            </Button>
          </WorkflowActions>
        </div>
      </Sheet>

      <ConfirmationDialog
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={() => {
          setConfirmationOpen(false)
          setToastMessage('Item permanently deleted')
          setToastOpen(true)
        }}
        title="Remove this calendar event?"
        description="This action cannot be undone. All assigned drivers and travel routes will be cleared."
        confirmLabel="Remove Event"
        destructive
      />

      <Toast
        open={toastOpen}
        tone="success"
        message={toastMessage}
        actionLabel="Undo"
        onAction={() => setToastOpen(false)}
        onClose={() => setToastOpen(false)}
      />
    </div>
  )
}
