import { useEffect, useMemo, useState } from 'react'
import {
  Type,
  Palette,
  Ruler,
  Layers,
  Smartphone,
  Tablet,
  Monitor,
  CheckCircle2,
  Inbox,
  WifiOff,
  Lock,
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
  Check,
  Layers as LayersIcon,
  SlidersHorizontal,
  ChevronRight,
  X,
  Leaf,
  RotateCcw,
  Flame,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { DEVICE_MATRIX, closestDeviceProfile } from '../lib/deviceMatrix.mjs'
import { COMPONENT_MANIFEST, DESIGN_SYSTEM_VERSION } from '../design-system/documentation.mjs'
import { ROOM_TONE_COLORS } from '../design-system/tokens.mjs'
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
  PageShell,
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
  WidgetContainer,
  ScheduleStreamItem,
  ActionCard,
} from '../components/ui'

// ── Design System Gallery (v2.0 Living Canvas Edition) ───────────────────────
// Renders the complete Casa Tabor living canvas design system:
// 1. Interactive Calendar Card Design Options (A: Editorial Luxury, B: Modern Architectural, C: Bento Ambient)
// 2. Multi-Day Stacked View and Ambient Reminder Mocks
// 3. Hero Focus Cards (luxury dark gradients with ambient gold reflection)
// 4. Living Canvas Bento Widgets & 3-Pane synchronized stream components
// 5. StatusDot live indicators & micro-caps metadata typography
// 6. Room Tone & Theme matrix previews
// 7. Shared UI primitives, accessible dialogs, and validation device matrix.
//
// Access: Settings → System → Design System, or /settings/design-system.

const TYPE_ROLES: { className: string; role: string; token: string }[] = [
  { className: 'text-display-xl font-display', role: 'Display XL', token: '--text-display-xl' },
  { className: 'text-display-lg font-display', role: 'Display Large', token: '--text-display-lg' },
  { className: 'text-display-md font-display', role: 'Display Medium', token: '--text-display-md' },
  { className: 'text-display-sm font-display', role: 'Display Small', token: '--text-display-sm' },
  { className: 'text-heading font-display', role: 'Heading', token: '--text-heading' },
  { className: 'text-body-lg', role: 'Body Large', token: '--text-body-lg' },
  { className: 'text-body', role: 'Body', token: '--text-body' },
  { className: 'text-body-sm', role: 'Body Small', token: '--text-body-sm' },
  { className: 'text-caption', role: 'Caption', token: '--text-caption' },
]

const FONT_FAMILIES: { className: string; label: string; token: string; sample: string }[] = [
  { className: 'font-display', label: 'Display (Cormorant)', token: '--font-display', sample: 'Cormorant Garamond, Georgia, serif' },
  { className: 'font-body', label: 'Body (DM Sans)', token: '--font-body', sample: 'DM Sans, system-ui, sans-serif' },
  { className: 'font-mono', label: 'Mono (JetBrains)', token: '--font-mono', sample: 'JetBrains Mono, monospace' },
]

const CORE_COLORS: { className: string; label: string; token: string }[] = [
  { className: 'bg-casa-bg', label: 'Background', token: '--color-casa-bg' },
  { className: 'bg-casa-bg-2', label: 'Background 2', token: '--color-casa-bg-2' },
  { className: 'bg-casa-surface', label: 'Surface', token: '--color-casa-surface' },
  { className: 'bg-casa-navy', label: 'Navy (primary)', token: '--color-casa-navy' },
  { className: 'bg-casa-gold', label: 'Gold (accent)', token: '--color-casa-gold' },
  { className: 'bg-casa-text', label: 'Text', token: '--color-casa-text' },
  { className: 'bg-casa-muted', label: 'Muted', token: '--color-casa-muted' },
  { className: 'bg-casa-border', label: 'Border', token: '--color-casa-border' },
]

const SEMANTIC_COLORS: { className: string; label: string; token: string }[] = [
  { className: 'bg-casa-error', label: 'Error', token: '--color-casa-error' },
  { className: 'bg-casa-success', label: 'Success', token: '--color-casa-success' },
  { className: 'bg-casa-warning', label: 'Warning', token: '--color-casa-warning' },
  { className: 'bg-casa-info', label: 'Info', token: '--color-casa-info' },
]

const FAMILY_COLORS: { className: string; label: string; token: string }[] = [
  { className: 'bg-family-jake', label: 'Jake', token: '--color-family-jake' },
  { className: 'bg-family-kelly', label: 'Kelly', token: '--color-family-kelly' },
  { className: 'bg-family-liv', label: 'Liv', token: '--color-family-liv' },
  { className: 'bg-family-emme', label: 'Emme', token: '--color-family-emme' },
  { className: 'bg-family-owen', label: 'Owen', token: '--color-family-owen' },
]

const RADII: { className: string; label: string; token: string }[] = [
  { className: 'rounded-button', label: 'Button', token: '--radius-button (0.5rem)' },
  { className: 'rounded-card', label: 'Card', token: '--radius-card (0.75rem)' },
  { className: 'rounded-widget', label: 'Widget / Item', token: '--radius-widget (1.25rem)' },
  { className: 'rounded-container', label: 'Container / Hero', token: '--radius-container (1.5rem)' },
  { className: 'rounded-modal', label: 'Modal', token: '--radius-modal (1rem)' },
  { className: 'rounded-pill', label: 'Pill', token: '--radius-pill (9999px)' },
]

const SHADOWS: { className: string; label: string; token: string }[] = [
  { className: 'shadow-card', label: 'Card', token: '--shadow-card' },
  { className: 'shadow-card-hover', label: 'Card hover', token: '--shadow-card-hover' },
  { className: 'shadow-widget', label: 'Widget Bento', token: '--shadow-widget' },
  { className: 'shadow-hero-dark', label: 'Hero Dark', token: '--shadow-hero-dark' },
  { className: 'shadow-modal', label: 'Modal', token: '--shadow-modal' },
  { className: 'shadow-fab', label: 'FAB', token: '--shadow-fab' },
]

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
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const [segment, setSegment] = useState<'first' | 'second' | 'third'>('first')
  const [switchOn, setSwitchOn] = useState(true)
  const [checked, setChecked] = useState(true)
  const [radio, setRadio] = useState('first')
  const [comboValue, setComboValue] = useState('produce')
  const [toastOpen, setToastOpen] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [dialStart, setDialStart] = useState('2026-07-10T15:00')
  const [dialEnd, setDialEnd] = useState('2026-07-10T16:00')
  const [highlightedStreamId, setHighlightedStreamId] = useState<string | null>('gymnastics')
  const [selectedRoomTone, setSelectedRoomTone] = useState<keyof typeof ROOM_TONE_COLORS>('day')
  const [activeCardOption, setActiveCardOption] = useState<'optionA' | 'optionB' | 'optionC'>('optionA')
  const [reminderCompleted, setReminderCompleted] = useState(false)

  // ── Capsule & Pill Matrix State ──────────────────────────────────────────
  const [pillGalleryTab, setPillGalleryTab] = useState<'archetypes' | 'track_colors' | 'before_after' | 'contract'>('track_colors')
  const [demoViewSegment, setDemoViewSegment] = useState<'day' | 'stacked' | 'week' | 'month'>('day')
  const [demoModeSegment, setDemoModeSegment] = useState<'calm' | 'turbo'>('calm')
  const [demoCookSegment, setDemoCookSegment] = useState<'tonight' | 'plan'>('tonight')
  const [demoFilterChips, setDemoFilterChips] = useState<string[]>(['quick', 'favorite'])
  const [demoPillFeedback, setDemoPillFeedback] = useState<string | null>(null)
  const [trackLabView, setTrackLabView] = useState<'day' | 'stacked' | 'week' | 'month'>('day')
  const [trackLabMode, setTrackLabMode] = useState<'calm' | 'turbo'>('calm')
  const [trackLabSurface, setTrackLabSurface] = useState<'card' | 'bg'>('card')

  const toggleDemoFilter = (id: string) => {
    setDemoFilterChips((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const density = document.documentElement.dataset.density ?? 'touch'
  const closest = useMemo(
    () => closestDeviceProfile(width, height, isFinePointer ? 'fine-pointer' : 'touch'),
    [width, height, isFinePointer],
  )

  const samplePeople = useMemo(
    () => [
      { id: 'jake', name: 'Jake', color: 'var(--color-family-jake)' },
      { id: 'kelly', name: 'Kelly', color: 'var(--color-family-kelly)' },
      { id: 'liv', name: 'Liv', color: 'var(--color-family-liv)' },
    ],
    [],
  )

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header ── */}
      <div className="rounded-container border border-casa-border bg-casa-surface p-5 shadow-widget">
        <SectionHeader
          icon={Palette}
          title="Design System Gallery"
          description="Casa’s token contract, reusable components, and live capability-based density."
          action={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-gold/20 text-casa-navy text-caption font-bold border border-casa-gold/30">
                <Sparkles size={13} className="text-casa-gold" />
                v{DESIGN_SYSTEM_VERSION} Living Canvas
              </span>
              <Chip size="sm" tone="accent">{COMPONENT_MANIFEST.length} components</Chip>
            </div>
          }
        />
        <div className="mt-3.5 rounded-button border border-casa-border bg-casa-bg px-3.5 py-2.5 text-body-sm text-casa-text-secondary flex items-center justify-between flex-wrap gap-2">
          <div>
            Live viewport: <span className="font-semibold text-casa-navy">{width}×{height}</span>{' '}
            ({isFinePointer ? 'fine-pointer' : 'touch'}, <span className="font-semibold text-casa-navy">{density}</span> density)
            {' '}— nearest validation-matrix profile:{' '}
            <span className="font-semibold text-casa-navy">{closest.label}</span>
          </div>
          <div className="flex items-center gap-1.5 text-caption font-bold text-casa-gold">
            <StatusDot variant="gold" size="sm" />
            <span>Fluid Kiosk Scaling (1.75× @ 1920px)</span>
          </div>
        </div>
      </div>

      <Card className="space-y-3" padding="sm" tone="subtle">
        <SectionHeader
          icon={Lock}
          title="Developer reference"
          description="This gallery is a read-only QA surface. Household appearance and text-size controls live in Appearance & Display."
        />
      </Card>

      {/* ════════════════════════════════════════════════════════════════════════
          💎 SHOWCASE: PILLS, SWITCHES & CHIPS STANDARDIZATION MATRIX (CONTRACT V2.0)
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-container border-2 border-casa-gold/60 bg-gradient-to-b from-casa-surface via-casa-surface to-casa-accent-subtle/30 p-6 shadow-widget space-y-6">
        {/* Section Header & Interactive Navigation Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-casa-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-casa-navy text-casa-gold text-caption font-bold uppercase tracking-wider">
                Design System Standard
              </span>
              <h2 className="font-display text-display-sm font-bold text-casa-navy">
                Pills, Switches & Chips Standardization Matrix
              </h2>
            </div>
            <p className="text-body-sm text-casa-text-secondary mt-1 max-w-2xl">
              Eliminating pill ambiguity across Casa Tabor. Enforcing 4 strict, non-overlapping component archetypes with distinct tactile cues and accessibility contracts.
            </p>
          </div>

          {/* Sub-tab Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-pill bg-casa-bg border border-casa-border self-start lg:self-auto shadow-2xs flex-wrap">
            <Button
              size="sm"
              variant={pillGalleryTab === 'track_colors' ? 'strong' : 'ghost'}
              onClick={() => setPillGalleryTab('track_colors')}
              className={cn(
                'rounded-pill text-caption font-bold min-h-control-sm px-3.5',
                pillGalleryTab === 'track_colors' ? 'bg-casa-gold text-casa-navy font-bold' : 'text-casa-text-secondary hover:text-casa-navy',
              )}
            >
              <Palette size={13} />
              <span>Track Color Lab (4 Options)</span>
            </Button>
            <Button
              size="sm"
              variant={pillGalleryTab === 'archetypes' ? 'strong' : 'ghost'}
              onClick={() => setPillGalleryTab('archetypes')}
              className={cn(
                'rounded-pill text-caption font-bold min-h-control-sm px-3.5',
                pillGalleryTab === 'archetypes' ? 'bg-casa-navy text-white' : 'text-casa-text-secondary hover:text-casa-navy',
              )}
            >
              <LayersIcon size={13} />
              <span>4 Canonical Archetypes</span>
            </Button>
            <Button
              size="sm"
              variant={pillGalleryTab === 'before_after' ? 'strong' : 'ghost'}
              onClick={() => setPillGalleryTab('before_after')}
              className={cn(
                'rounded-pill text-caption font-bold min-h-control-sm px-3.5',
                pillGalleryTab === 'before_after' ? 'bg-casa-navy text-white' : 'text-casa-text-secondary hover:text-casa-navy',
              )}
            >
              <SlidersHorizontal size={13} />
              <span>Before vs After Audit</span>
            </Button>
            <Button
              size="sm"
              variant={pillGalleryTab === 'contract' ? 'strong' : 'ghost'}
              onClick={() => setPillGalleryTab('contract')}
              className={cn(
                'rounded-pill text-caption font-bold min-h-control-sm px-3.5',
                pillGalleryTab === 'contract' ? 'bg-casa-navy text-white' : 'text-casa-text-secondary hover:text-casa-navy',
              )}
            >
              <ShieldCheck size={13} />
              <span>Rules & Specs Matrix</span>
            </Button>
          </div>
        </div>

        {/* ── TAB 0: TRACK COLOR COMPARISON LAB ── */}
        {pillGalleryTab === 'track_colors' && (
          <div className="space-y-6">
            {/* Context Controls Bar */}
            <div className="p-4 rounded-widget bg-casa-bg border border-casa-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                  <Palette size={16} className="text-casa-gold" />
                  <span>Switch Track Color Laboratory</span>
                </h3>
                <p className="text-caption text-casa-text-secondary mt-0.5">
                  Test and compare 4 distinct track color recipes against different parent card surfaces in real-time.
                </p>
              </div>

              {/* Surface Switcher */}
              <div className="flex items-center gap-2">
                <span className="text-caption font-bold text-casa-muted uppercase tracking-wider">Surface Context:</span>
                <div className="flex items-center gap-1 p-1 rounded-pill bg-casa-surface border border-casa-border shadow-2xs">
                  <Button
                    size="sm"
                    variant={trackLabSurface === 'card' ? 'primary' : 'ghost'}
                    onClick={() => setTrackLabSurface('card')}
                    className="rounded-pill text-caption font-semibold min-h-control-sm px-3"
                  >
                    White Card Surface
                  </Button>
                  <Button
                    size="sm"
                    variant={trackLabSurface === 'bg' ? 'primary' : 'ghost'}
                    onClick={() => setTrackLabSurface('bg')}
                    className="rounded-pill text-caption font-semibold min-h-control-sm px-3"
                  >
                    Canvas Background
                  </Button>
                </div>
              </div>
            </div>

            {/* 5 Side-by-Side Interactive Track Options */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. CURRENT BASELINE */}
              <div
                className={cn(
                  'rounded-widget border border-casa-border/80 p-5 shadow-sm space-y-4 transition-colors',
                  trackLabSurface === 'card' ? 'bg-casa-surface' : 'bg-casa-bg',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-stone-400" />
                      <h4 className="font-display text-body-lg font-bold text-casa-navy">
                        Current Baseline: Dusty Sand / Putty
                      </h4>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Current token (<code>--color-casa-toggle-track</code>)
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-900 border border-amber-500/20 text-caption font-bold shrink-0">
                    ⚠️ Current Baseline
                  </span>
                </div>

                {/* Live Custom Segmented Switch (Current Baseline) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Calendar View
                    </label>
                    <SegmentedControl
                      aria-label="Baseline calendar view"
                      value={trackLabView}
                      onChange={setTrackLabView}
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
                      Ambient Mode
                    </label>
                    <div className="max-w-xs">
                      <SegmentedControl
                        aria-label="Baseline ambient mode"
                        value={trackLabMode}
                        onChange={setTrackLabMode}
                        options={[
                          { value: 'calm', label: 'Calm', icon: <Leaf size={14} className="text-emerald-700" /> },
                          { value: 'turbo', label: 'Turbo', icon: <Flame size={14} className="text-amber-700" /> },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-stone-100/60 border border-stone-200/80 text-caption text-casa-text-secondary space-y-1">
                  <p className="font-semibold text-casa-navy">Visual Critique:</p>
                  <p>• Dusty yellow-brown undertone makes white card backgrounds look discolored or like unbleached cardboard.</p>
                  <p>• Inactive text contrast is muted, leading to low glanceability from 8 feet away on wall kiosks.</p>
                </div>
              </div>

              {/* 2. OPTION A: CLEAN ALABASTER TRENCH (RECOMMENDED) */}
              <div
                className={cn(
                  'rounded-widget border-2 border-emerald-500/50 p-5 shadow-sm space-y-4 transition-colors',
                  trackLabSurface === 'card' ? 'bg-casa-surface' : 'bg-casa-bg',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h4 className="font-display text-body-lg font-bold text-casa-navy">
                        Option A: Clean Alabaster Trench
                      </h4>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Neutral architectural alabaster (<code>bg-stone-100</code>) + crisp slate text
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 border border-emerald-500/30 text-caption font-bold shrink-0">
                    🌟 Recommended · Modern
                  </span>
                </div>

                {/* Live Custom Segmented Switch (Option A) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Calendar View
                    </label>
                    <SegmentedControl
                      aria-label="Option A calendar view"
                      value={trackLabView}
                      onChange={setTrackLabView}
                      className="bg-stone-100 border-stone-300/80 [&_.casa-segmented-control-thumb]:bg-white [&_.casa-segmented-control-thumb]:ring-1 [&_.casa-segmented-control-thumb]:ring-black/5 [&_button]:text-slate-500 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
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
                      Ambient Mode
                    </label>
                    <div className="max-w-xs">
                      <SegmentedControl
                        aria-label="Option A ambient mode"
                        value={trackLabMode}
                        onChange={setTrackLabMode}
                        className="bg-stone-100 border-stone-300/80 [&_.casa-segmented-control-thumb]:bg-white [&_.casa-segmented-control-thumb]:ring-1 [&_.casa-segmented-control-thumb]:ring-black/5 [&_button]:text-slate-500 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
                        options={[
                          { value: 'calm', label: 'Calm', icon: <Leaf size={14} className="text-emerald-700" /> },
                          { value: 'turbo', label: 'Turbo', icon: <Flame size={14} className="text-amber-700" /> },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-emerald-500/10 border border-emerald-500/20 text-caption text-emerald-900 space-y-1">
                  <p className="font-semibold text-emerald-950">Why This Excels:</p>
                  <p>• Apple/Linear-grade clean architectural recess with zero yellow/cardboard dinginess.</p>
                  <p>• Crisp slate text gives <strong>5.2:1 contrast</strong> for instant glanceability across the room.</p>
                  <p>• The pure white active thumb sits naturally like a physical pill inside a carved groove.</p>
                </div>
              </div>

              {/* 3. OPTION B: CHAMPAGNE SILK INSET */}
              <div
                className={cn(
                  'rounded-widget border-2 border-casa-gold/60 p-5 shadow-sm space-y-4 transition-colors',
                  trackLabSurface === 'card' ? 'bg-casa-surface' : 'bg-casa-bg',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-casa-gold" />
                      <h4 className="font-display text-body-lg font-bold text-casa-navy">
                        Option B: Champagne Silk Inset
                      </h4>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Luminous sunlit champagne (<code>bg-amber-50/80</code>) + warm gold border
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-casa-gold/20 text-casa-navy border border-casa-gold/30 text-caption font-bold shrink-0">
                    ✨ Warm Palm Beach Luxury
                  </span>
                </div>

                {/* Live Custom Segmented Switch (Option B) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Calendar View
                    </label>
                    <SegmentedControl
                      aria-label="Option B calendar view"
                      value={trackLabView}
                      onChange={setTrackLabView}
                      className="bg-amber-50/80 border-amber-200/80 [&_.casa-segmented-control-thumb]:bg-white [&_.casa-segmented-control-thumb]:ring-1 [&_.casa-segmented-control-thumb]:ring-amber-300/80 [&_button]:text-amber-900/70 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
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
                      Ambient Mode
                    </label>
                    <div className="max-w-xs">
                      <SegmentedControl
                        aria-label="Option B ambient mode"
                        value={trackLabMode}
                        onChange={setTrackLabMode}
                        className="bg-amber-50/80 border-amber-200/80 [&_.casa-segmented-control-thumb]:bg-white [&_.casa-segmented-control-thumb]:ring-1 [&_.casa-segmented-control-thumb]:ring-amber-300/80 [&_button]:text-amber-900/70 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
                        options={[
                          { value: 'calm', label: 'Calm', icon: <Leaf size={14} className="text-emerald-700" /> },
                          { value: 'turbo', label: 'Turbo', icon: <Flame size={14} className="text-amber-700" /> },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-amber-500/10 border border-amber-500/20 text-caption text-amber-950 space-y-1">
                  <p className="font-semibold text-casa-navy">Why This Excels:</p>
                  <p>• Preserves Casa Tabor's warm residential tone, but replaces dirty gray-brown with sunlit golden warmth.</p>
                  <p>• Pairs beautifully with the gold Copilot button and circadian evening lighting shifts.</p>
                </div>
              </div>

              {/* 4. OPTION C: COMMAND NAVY INSET */}
              <div
                className={cn(
                  'rounded-widget border border-casa-border/80 p-5 shadow-sm space-y-4 transition-colors',
                  trackLabSurface === 'card' ? 'bg-casa-surface' : 'bg-casa-bg',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-casa-navy" />
                      <h4 className="font-display text-body-lg font-bold text-casa-navy">
                        Option C: Command Navy Inset
                      </h4>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      High-contrast luxury navy (<code>bg-casa-navy</code>) + gold active thumb
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-casa-navy text-white text-caption font-bold shrink-0">
                    ⚓ Kiosk 8-Foot Power
                  </span>
                </div>

                {/* Live Custom Segmented Switch (Option C) */}
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Calendar View
                    </label>
                    <SegmentedControl
                      aria-label="Option C calendar view"
                      value={trackLabView}
                      onChange={setTrackLabView}
                      className="bg-casa-navy border-casa-navy [&_.casa-segmented-control-thumb]:bg-casa-gold [&_button]:text-white/70 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
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
                      Ambient Mode
                    </label>
                    <div className="max-w-xs">
                      <SegmentedControl
                        aria-label="Option C ambient mode"
                        value={trackLabMode}
                        onChange={setTrackLabMode}
                        className="bg-casa-navy border-casa-navy [&_.casa-segmented-control-thumb]:bg-casa-gold [&_button]:text-white/70 [&_button[aria-checked=true]]:text-casa-navy [&_button[aria-checked=true]]:font-bold"
                        options={[
                          { value: 'calm', label: 'Calm', icon: <Leaf size={14} className="text-emerald-400" /> },
                          { value: 'turbo', label: 'Turbo', icon: <Flame size={14} className="text-amber-400" /> },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-casa-navy/5 border border-casa-navy/10 text-caption text-casa-text-secondary space-y-1">
                  <p className="font-semibold text-casa-navy">Why This Excels:</p>
                  <p>• Maximum distance scannability for large wall kiosks across a kitchen or living room.</p>
                  <p>• Graphic authority that anchors the calendar navigation firmly at the top of the screen.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 1: 4 CANONICAL ARCHETYPES (INTERACTIVE LAB) ── */}
        {pillGalleryTab === 'archetypes' && (
          <div className="space-y-6">
            {/* Feedback Alert if an action was triggered */}
            {demoPillFeedback && (
              <div className="p-3 rounded-widget bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 text-body-sm flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 size={16} className="text-emerald-700" />
                  <span>{demoPillFeedback}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDemoPillFeedback(null)}
                  className="text-caption font-bold text-emerald-800 hover:underline min-h-control-sm px-2 py-0.5"
                >
                  Dismiss
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Archetype 1: SegmentedControl */}
              <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-casa-navy" />
                      <h3 className="font-display text-body-lg font-bold text-casa-navy">
                        1. SegmentedControl (The Switcher)
                      </h3>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Mutually exclusive view or mode switcher on a single recessed track. Exactly one item active.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-caption font-mono text-casa-navy font-semibold shrink-0">
                    Track + Thumb
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Calendar View Controller
                    </label>
                    <SegmentedControl
                      aria-label="Demo view switcher"
                      value={demoViewSegment}
                      onChange={setDemoViewSegment}
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
                    <SegmentedControl
                      aria-label="Demo mode switcher"
                      value={demoModeSegment}
                      onChange={setDemoModeSegment}
                      options={[
                        { value: 'calm', label: 'Calm', icon: <Leaf size={14} className="text-emerald-700" /> },
                        { value: 'turbo', label: 'Turbo', icon: <Flame size={14} className="text-amber-700" /> },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block mb-1.5">
                      Meal Hub Section Scope
                    </label>
                    <SegmentedControl
                      aria-label="Demo cook switcher"
                      value={demoCookSegment}
                      onChange={setDemoCookSegment}
                      options={[
                        { value: 'tonight', label: 'Cook tonight' },
                        { value: 'plan', label: 'Plan the week', icon: <Sparkles size={14} className="text-casa-gold" /> },
                      ]}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-button bg-casa-bg border border-casa-border/80 text-caption text-casa-text-secondary space-y-1">
                  <div className="font-semibold text-casa-navy flex items-center justify-between">
                    <span>Active Selection Contract:</span>
                    <span className="font-mono text-casa-gold">View: {demoViewSegment} · Mode: {demoModeSegment}</span>
                  </div>
                  <p>• <strong>Container:</strong> Recessed track (<code>bg-casa-toggle-track</code>) with 9999px pill radius.</p>
                  <p>• <strong>Indicator:</strong> Elevated floating thumb with micro-shadow (<code>shadow-card</code>).</p>
                  <p>• <strong>Keyboard/A11y:</strong> Arrow-key navigable, <code>role="radiogroup"</code>.</p>
                </div>
              </div>

              {/* Archetype 2: FilterChip */}
              <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-casa-gold" />
                      <h3 className="font-display text-body-lg font-bold text-casa-navy">
                        2. FilterChip (Selectable Tag / Filter)
                      </h3>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Standalone multi-select or single-select filter pills that flow in ribbons.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-caption font-mono text-casa-navy font-semibold shrink-0">
                    Standalone Tag
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                    Dinner Prep Filters (Tap to toggle multi-selection)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'quick', label: 'Something quick', icon: <Zap size={13} /> },
                      { id: 'favorite', label: 'Family favorite', icon: <Sparkles size={13} /> },
                      { id: 'new', label: 'Something new' },
                      { id: 'fancy', label: 'A little fancy' },
                      { id: 'pantry', label: 'Use up the pantry' },
                    ].map((chip) => {
                      const isSelected = demoFilterChips.includes(chip.id)
                      return (
                        <Chip
                          key={chip.id}
                          selected={isSelected}
                          tone={isSelected ? 'accent' : 'neutral'}
                          icon={isSelected ? <Check size={14} className="stroke-[2.5]" /> : chip.icon}
                          onClick={() => toggleDemoFilter(chip.id)}
                        >
                          {chip.label}
                        </Chip>
                      )
                    })}
                  </div>

                  {/* Dismissible Chip Demo */}
                  <div className="pt-2">
                    <span className="text-caption text-casa-muted block mb-1.5">Dismissible Tag Variation:</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-casa-accent-subtle border border-casa-accent-soft-border text-caption font-semibold text-casa-navy">
                        <span>Allergen: Peanut-Free</span>
                        <IconButton
                          size="sm"
                          icon={<X size={13} />}
                          aria-label="Remove filter"
                          variant="ghost"
                          onClick={() => setDemoPillFeedback('Peanut-Free filter cleared')}
                          className="size-control-sm min-h-0 min-w-0 p-0 text-casa-text-secondary hover:text-casa-error"
                        />
                      </span>
                      <span className="text-caption text-casa-muted">
                        Active filters: <strong>{demoFilterChips.length}</strong> selected
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-casa-bg border border-casa-border/80 text-caption text-casa-text-secondary space-y-1">
                  <div className="font-semibold text-casa-navy">FilterChip Contract:</div>
                  <p>• <strong>Unselected:</strong> Subtle 1px neutral border, neutral background, muted text.</p>
                  <p>• <strong>Selected:</strong> Branded warm gold tint (<code>bg-casa-accent-soft</code>), active gold border + checkmark.</p>
                  <p>• <strong>A11y:</strong> Renders <code>&lt;button aria-pressed="..."&gt;</code>, keyboard focusable.</p>
                </div>
              </div>

              {/* Archetype 3: PillButton (CTA / Trigger) */}
              <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <h3 className="font-display text-body-lg font-bold text-casa-navy">
                        3. PillButton (Action Trigger / CTA)
                      </h3>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Primary or prominent standalone capsule triggers that launch workflows or open sidecars.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-caption font-mono text-casa-navy font-semibold shrink-0">
                    Action Verb
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                    Interactive Action Triggers
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Primary Copilot CTA */}
                    <Button
                      variant="primary"
                      onClick={() => setDemoPillFeedback('AI Copilot Assistant drawer summoned')}
                      className="rounded-pill px-4 text-body-sm font-bold min-h-control"
                    >
                      <Sparkles size={16} />
                      <span>Copilot</span>
                    </Button>

                    {/* Primary Navy Action */}
                    <Button
                      variant="strong"
                      onClick={() => setDemoPillFeedback('Quick Add Event dialog opened')}
                      className="rounded-pill px-4 text-body-sm font-semibold min-h-control"
                    >
                      <Zap size={15} className="text-casa-gold" />
                      <span>Add Event</span>
                    </Button>

                    {/* Outlined Secondary Action */}
                    <Button
                      variant="secondary"
                      onClick={() => setDemoPillFeedback('Route directions calculating')}
                      className="rounded-pill px-3.5 text-body-sm font-semibold min-h-control"
                    >
                      <Navigation size={14} className="text-casa-gold" />
                      <span>Get Directions</span>
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-casa-bg border border-casa-border/80 text-caption text-casa-text-secondary space-y-1">
                  <div className="font-semibold text-casa-navy">PillButton Contract:</div>
                  <p>• <strong>Visual Weight:</strong> High contrast solid background or distinct verb action.</p>
                  <p>• <strong>Iconography:</strong> Leads with an action icon (e.g. <code>✨ Copilot</code>, <code>⚡ Add</code>).</p>
                  <p>• <strong>Rule:</strong> Never use the unselected ghost look of a filter chip for primary CTAs.</p>
                </div>
              </div>

              {/* Archetype 4: StatusBadge */}
              <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h3 className="font-display text-body-lg font-bold text-casa-navy">
                        4. StatusBadge (Diagnostic & Alert Indicator)
                      </h3>
                    </div>
                    <p className="text-caption text-casa-text-secondary mt-1">
                      Informational tags, live status indicators, or tap-to-inspect alert counters.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-casa-bg border border-casa-border text-caption font-mono text-casa-navy font-semibold shrink-0">
                    Informational
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                    Diagnostic & Triage Badges
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Interactive Triage Alert with Explicit Chevron */}
                    <Button
                      variant="subtle"
                      onClick={() => setDemoPillFeedback('Triage Alerts drawer opened (7 items pending)')}
                      className="rounded-pill bg-amber-500/15 border-amber-500/30 hover:border-amber-500/60 text-amber-950 font-bold text-body-sm min-h-control px-3.5"
                    >
                      <Bell size={15} className="text-amber-700" />
                      <span>7 Triage Alerts</span>
                      <ChevronRight size={14} className="text-amber-800" />
                    </Button>

                    {/* Live System Indicator */}
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 font-semibold text-caption">
                      <StatusDot variant="active" size="sm" />
                      <span>Live Sync Active</span>
                    </span>

                    {/* Metadata Context Badge */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-casa-bg border border-casa-border text-casa-navy font-medium text-caption">
                      <Car size={13} className="text-casa-gold" />
                      <span>Owen & Emme Transit</span>
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-button bg-casa-bg border border-casa-border/80 text-caption text-casa-text-secondary space-y-1">
                  <div className="font-semibold text-casa-navy">StatusBadge Contract:</div>
                  <p>• <strong>Scale:</strong> Compact padding, semantic color tinting (Amber warning, Emerald success).</p>
                  <p>• <strong>Affordance:</strong> If tap-interactive, MUST include an explicit trailing chevron (<code>›</code>).</p>
                  <p>• <strong>Non-interactive:</strong> Renders as semantic <code>&lt;span&gt;</code> with live status dot.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: BEFORE VS AFTER SCREEN AUDIT ── */}
        {pillGalleryTab === 'before_after' && (
          <div className="space-y-6">
            <div className="p-4 rounded-widget bg-casa-bg border border-casa-border text-body-sm text-casa-text-secondary">
              <strong className="text-casa-navy">Omnichannel Audit Summary:</strong> Below are real interface fragments showing the confusion created by applying the same generic beige capsule to every component, contrasted with the clean, standardized contract.
            </div>

            {/* Case Study 1: Header / Top Bar Controls */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-casa-border/50 pb-2.5">
                <div>
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">Case Study 1</span>
                  <h3 className="font-display text-body-lg font-bold text-casa-navy">
                    Top Navigation & Header Controls
                  </h3>
                </div>
                <span className="text-caption text-casa-muted">Header Right Tool Cluster</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BEFORE */}
                <div className="rounded-card border-2 border-dashed border-casa-error/40 bg-casa-error/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-casa-error/20 text-casa-error text-caption font-bold uppercase">
                      Before: Ambiguous Pill Soup
                    </span>
                    <span className="text-caption text-casa-error font-medium">3 competing pill types</span>
                  </div>
                  <div className="p-4 rounded-button bg-casa-bg border border-casa-border flex items-center justify-between flex-wrap gap-2">
                    <span className="text-body-sm text-casa-muted font-medium">2:04 PM</span>
                    <div className="flex items-center gap-2">
                      {/* Ambiguous icon capsule */}
                      <div className="px-3 py-1.5 rounded-pill bg-white border border-casa-border text-casa-muted text-caption flex items-center gap-2">
                        <RotateCcw size={14} />
                        <span className="w-px h-3 bg-casa-border" />
                        <Utensils size={14} />
                      </div>
                      {/* Flat ambiguous copilot */}
                      <div className="px-4 py-1.5 rounded-pill bg-casa-accent-subtle border border-casa-accent-soft-border text-caption font-bold text-casa-navy flex items-center gap-1.5">
                        <Sparkles size={14} />
                        <span>Copilot</span>
                      </div>
                      {/* Floating alert pill */}
                      <div className="px-3 py-1.5 rounded-pill bg-amber-50 border border-amber-200 text-caption font-medium text-amber-900 flex items-center gap-1">
                        <Bell size={13} />
                        <span>7 Alerts</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-caption text-casa-error leading-relaxed">
                    ⚠️ <strong>Problem:</strong> Is the icon capsule a switch or two buttons? Is Copilot a selected filter or an action? Everything has the exact same radius and weight.
                  </p>
                </div>

                {/* AFTER */}
                <div className="rounded-card border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 text-caption font-bold uppercase">
                      After: Standardized Contracts
                    </span>
                    <span className="text-caption text-emerald-800 font-medium">Distinct tactile affordances</span>
                  </div>
                  <div className="p-4 rounded-button bg-casa-bg border border-casa-border flex items-center justify-between flex-wrap gap-2">
                    <span className="text-body-sm text-casa-navy font-bold font-mono">2:04 PM</span>
                    <div className="flex items-center gap-2">
                      {/* Discrete square icon buttons */}
                      <IconButton
                        size="sm"
                        variant="secondary"
                        icon={<RotateCcw size={14} />}
                        aria-label="Refresh header view"
                        className="rounded-button"
                      />
                      {/* High-visibility solid gold CTA */}
                      <Button size="sm" variant="primary" className="rounded-pill px-3.5 font-bold">
                        <Sparkles size={14} />
                        <span>Copilot</span>
                      </Button>
                      {/* Distinct alert badge with tap chevron */}
                      <Button size="sm" variant="subtle" className="rounded-pill bg-amber-500/15 border-amber-400 text-amber-950 font-bold px-3">
                        <Bell size={13} className="text-amber-700" />
                        <span>7 Alerts</span>
                        <ChevronRight size={12} />
                      </Button>
                    </div>
                  </div>
                  <p className="text-caption text-emerald-800 leading-relaxed">
                    ✅ <strong>Benefit:</strong> Instant glanceability. Tools are square buttons, Copilot is the primary hero action, and alerts have an explicit tap-to-expand chevron.
                  </p>
                </div>
              </div>
            </div>

            {/* Case Study 2: Meal Hub View Switch vs Query Filters */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-casa-border/50 pb-2.5">
                <div>
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">Case Study 2</span>
                  <h3 className="font-display text-body-lg font-bold text-casa-navy">
                    Meal Hub View Switcher vs. Recipe Query Filters
                  </h3>
                </div>
                <span className="text-caption text-casa-muted">Cook Tonight vs Plan</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BEFORE */}
                <div className="rounded-card border-2 border-dashed border-casa-error/40 bg-casa-error/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-casa-error/20 text-casa-error text-caption font-bold uppercase">
                      Before: Stacked Competing Pills
                    </span>
                  </div>
                  <div className="p-4 rounded-button bg-casa-bg border border-casa-border space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-pill bg-white border border-casa-border text-caption font-bold text-casa-navy">Cook tonight</span>
                      <span className="px-3 py-1 rounded-pill text-caption text-casa-muted">Plan the week</span>
                    </div>
                    <div className="text-caption font-display font-bold text-casa-navy">What are we feeling tonight?</div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-3 py-1 rounded-pill bg-amber-100 border border-amber-300 text-caption font-bold text-casa-navy">Something quick</span>
                      <span className="px-3 py-1 rounded-pill bg-white border border-casa-border text-caption text-casa-text-secondary">Family favorite</span>
                      <span className="px-3 py-1 rounded-pill bg-white border border-casa-border text-caption text-casa-text-secondary">Something new</span>
                    </div>
                  </div>
                  <p className="text-caption text-casa-error leading-relaxed">
                    ⚠️ <strong>Problem:</strong> Two rows of nearly identical rounded pills sitting on top of each other. Users cannot tell which row changes the view and which filters recipes.
                  </p>
                </div>

                {/* AFTER */}
                <div className="rounded-card border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 text-caption font-bold uppercase">
                      After: Structural Separation
                    </span>
                  </div>
                  <div className="p-4 rounded-button bg-casa-bg border border-casa-border space-y-3">
                    {/* Proper Segmented Track */}
                    <div className="max-w-xs">
                      <SegmentedControl
                        aria-label="Demo cook scope"
                        value="tonight"
                        onChange={() => undefined}
                        options={[
                          { value: 'tonight', label: 'Cook tonight' },
                          { value: 'plan', label: 'Plan the week', icon: <Sparkles size={13} className="text-casa-gold" /> },
                        ]}
                      />
                    </div>
                    <div className="text-caption font-display font-bold text-casa-navy pt-1">What are we feeling tonight?</div>
                    {/* Standalone Filter Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <Chip
                        selected
                        tone="accent"
                        icon={<Check size={12} className="stroke-[3]" />}
                        onClick={() => undefined}
                      >
                        Something quick
                      </Chip>
                      <Chip
                        tone="neutral"
                        onClick={() => undefined}
                      >
                        Family favorite
                      </Chip>
                      <Chip
                        tone="neutral"
                        onClick={() => undefined}
                      >
                        Something new
                      </Chip>
                    </div>
                  </div>
                  <p className="text-caption text-emerald-800 leading-relaxed">
                    ✅ <strong>Benefit:</strong> Clear cognitive hierarchy: the track switches the view mode, while the standalone chips clearly act as recipe filters.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: RULES & SPECS MATRIX ── */}
        {pillGalleryTab === 'contract' && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-casa-navy text-casa-navy font-bold text-caption uppercase tracking-wider">
                    <th className="py-2.5 pr-4">Archetype</th>
                    <th className="py-2.5 px-4">Primary UX Job</th>
                    <th className="py-2.5 px-4">HTML & ARIA Contract</th>
                    <th className="py-2.5 px-4">Visual Tokens</th>
                    <th className="py-2.5 px-4">Min Touch Target</th>
                    <th className="py-2.5 pl-4">Strict DO NOT Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-casa-border/70 text-casa-text-secondary text-caption">
                  <tr className="hover:bg-casa-bg/60">
                    <td className="py-3 pr-4 font-bold text-casa-navy whitespace-nowrap">
                      SegmentedControl
                    </td>
                    <td className="py-3 px-4">Mutually exclusive view or mode switching (e.g. Day/Week/Month).</td>
                    <td className="py-3 px-4 font-mono">role="radiogroup" + role="radio"</td>
                    <td className="py-3 px-4">Recessed track (<code>bg-casa-toggle-track</code>) + active elevated white thumb.</td>
                    <td className="py-3 px-4 font-semibold text-casa-navy">44px mobile / 48px kiosk</td>
                    <td className="py-3 pl-4 text-casa-error font-medium">Never render standalone options without the surrounding track.</td>
                  </tr>
                  <tr className="hover:bg-casa-bg/60">
                    <td className="py-3 pr-4 font-bold text-casa-navy whitespace-nowrap">
                      FilterChip
                    </td>
                    <td className="py-3 px-4">Filtering lists, search tokens, multi-select modifiers.</td>
                    <td className="py-3 px-4 font-mono">&lt;button aria-pressed="..."&gt;</td>
                    <td className="py-3 px-4">Unselected: 1px border. Selected: <code>bg-casa-accent-soft</code> + gold ring + check.</td>
                    <td className="py-3 px-4 font-semibold text-casa-navy">44px mobile / 48px kiosk</td>
                    <td className="py-3 pl-4 text-casa-error font-medium">Never place directly adjacent to a SegmentedControl without a section header.</td>
                  </tr>
                  <tr className="hover:bg-casa-bg/60">
                    <td className="py-3 pr-4 font-bold text-casa-navy whitespace-nowrap">
                      PillButton (CTA)
                    </td>
                    <td className="py-3 px-4">Triggering modals, sidecars (Copilot), or primary workflows.</td>
                    <td className="py-3 px-4 font-mono">&lt;button type="button"&gt;</td>
                    <td className="py-3 px-4">Solid brand fill (<code>bg-casa-gold</code> or <code>bg-casa-navy</code>) + action verb/icon.</td>
                    <td className="py-3 px-4 font-semibold text-casa-navy">44px mobile / 48px kiosk</td>
                    <td className="py-3 pl-4 text-casa-error font-medium">Never use the unselected beige border style of a filter chip for primary CTAs.</td>
                  </tr>
                  <tr className="hover:bg-casa-bg/60">
                    <td className="py-3 pr-4 font-bold text-casa-navy whitespace-nowrap">
                      StatusBadge
                    </td>
                    <td className="py-3 px-4">Glanceable system status, alerts count, diagnostic states.</td>
                    <td className="py-3 px-4 font-mono">&lt;span&gt; or &lt;button&gt; (if drawer)</td>
                    <td className="py-3 px-4">Semantic tint (amber-500/15, emerald-500/10) + trailing chevron (<code>›</code>) if tappable.</td>
                    <td className="py-3 px-4 font-semibold text-casa-navy">32px badge (44px tap zone)</td>
                    <td className="py-3 pl-4 text-casa-error font-medium">Never leave a tappable alert badge without an explicit chevron affordance.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3.5 rounded-button bg-casa-accent-soft border border-casa-accent-soft-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-casa-navy shrink-0" />
                <span className="text-caption font-semibold text-casa-navy">
                  Contract verification: Automated design system linting ensures all 4 archetypes enforce 44px+ touch targets and semantic ARIA states.
                </span>
              </div>
              <span className="text-caption font-bold text-casa-gold uppercase tracking-wider shrink-0">
                100% Compliant
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ✨ NEW SECTION: CALENDAR CARD POLISH OPTIONS (INTERACTIVE LAB)
         ════════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-container border-2 border-casa-gold/40 bg-gradient-to-b from-casa-surface to-casa-accent-subtle/20 p-6 shadow-widget space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-casa-border/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-casa-gold text-casa-navy text-caption font-bold uppercase tracking-wider">
                Live Prototype
              </span>
              <h2 className="font-display text-display-sm font-bold text-casa-navy">
                Calendar Card Polish Options
              </h2>
            </div>
            <p className="text-body-sm text-casa-text-secondary mt-1">
              Select an option below to preview how Day View cards look when elevated to the new design system.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={activeCardOption === 'optionA' ? 'primary' : 'secondary'}
              onClick={() => setActiveCardOption('optionA')}
              className="min-h-control"
            >
              Option A · Editorial Luxury
            </Button>
            <Button
              size="sm"
              variant={activeCardOption === 'optionB' ? 'primary' : 'secondary'}
              onClick={() => setActiveCardOption('optionB')}
              className="min-h-control"
            >
              Option B · Architectural
            </Button>
            <Button
              size="sm"
              variant={activeCardOption === 'optionC' ? 'primary' : 'secondary'}
              onClick={() => setActiveCardOption('optionC')}
              className="min-h-control"
            >
              Option C · Bento Ambient
            </Button>
          </div>
        </div>

        {/* ── OPTION A: Editorial Luxury (Recommended) ── */}
        {activeCardOption === 'optionA' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                Option A: Editorial Luxury (Cormorant Garamond + Top Metadata Band + Responsibility Rail)
              </span>
              <span className="text-caption text-casa-muted font-medium">Recommended for Calm consistency</span>
            </div>

            {/* Event Card 1 (Now / School Pickup) */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm hover:shadow-card-hover hover:border-casa-gold/60 transition-all space-y-4">
              {/* Top Metadata Band */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <StatusDot variant="active" size="md" />
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-navy">
                    Happening Soon · School Transit
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-caption font-mono font-semibold px-3 py-1 rounded-full bg-casa-bg border border-casa-border text-casa-navy">
                    2:00 PM – 2:15 PM
                  </span>
                  <span className="text-caption font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 flex items-center gap-1">
                    <Car size={13} />
                    <span>Leave by 1:43 PM</span>
                  </span>
                </div>
              </div>

              {/* Title & Location */}
              <div>
                <h3 className="font-display text-display-xs sm:text-display-sm font-bold text-casa-navy leading-snug">
                  Owen & Emme Picked up by Giselle
                </h3>
                <div className="mt-2 flex items-center gap-2 text-body-sm text-casa-text-secondary">
                  <MapPin size={15} className="text-casa-gold shrink-0" />
                  <span className="font-medium">Palm Beach Public Elementary School</span>
                  <span className="text-casa-muted">· 239 Cocoanut Row</span>
                </div>
                <p className="mt-1.5 text-caption text-casa-muted leading-relaxed">
                  Giselle will pick up Owen and Emme from school. Ensure children have their school materials ready.
                </p>
              </div>

              {/* Bottom Responsibility & Actions Rail */}
              <div className="pt-3.5 border-t border-casa-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-navy text-white text-caption font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Giselle · Driver & Stay</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-casa-bg border border-casa-border text-caption font-medium text-casa-text-secondary">
                    <span>Passengers:</span>
                    <span className="font-semibold text-casa-navy">Owen, Emme</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-semibold min-h-control"
                  >
                    <Navigation size={13} />
                    <span>Directions</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-medium min-h-control"
                  >
                    <Edit3 size={13} />
                    <span>Edit</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Event Card 2 (Gym / Personal) */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm hover:shadow-card-hover transition-all space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-muted">
                    Personal Wellness · Fitness
                  </span>
                </div>
                <span className="text-caption font-mono font-semibold px-3 py-1 rounded-full bg-casa-bg border border-casa-border text-casa-navy">
                  6:00 AM – 7:00 AM
                </span>
              </div>

              <div>
                <h3 className="font-display text-display-xs sm:text-display-sm font-bold text-casa-navy leading-snug">
                  Hit the Gym
                </h3>
                <div className="mt-2 flex items-center gap-2 text-body-sm text-casa-text-secondary">
                  <MapPin size={15} className="text-casa-gold shrink-0" />
                  <span className="font-medium">Home Gym · Garage Studio</span>
                </div>
              </div>

              <div className="pt-3.5 border-t border-casa-border/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-accent-subtle border border-casa-accent-soft-border text-caption font-semibold text-casa-navy">
                    <span>Jake · Solo</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="min-h-control text-caption font-medium">
                  Edit Details
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── OPTION B: Modern Architectural (High-Contrast Time Column) ── */}
        {activeCardOption === 'optionB' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-caption font-bold uppercase tracking-widest text-casa-navy">
                Option B: Modern Architectural (Two-Column Time Anchor + Bold Sans Geometry)
              </span>
              <span className="text-caption text-casa-muted font-medium">High structural scannability</span>
            </div>

            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-5 shadow-sm hover:shadow-card-hover transition-all flex flex-col md:flex-row gap-5 items-start">
              {/* Left Column: Big Time Anchor */}
              <div className="md:w-36 flex-shrink-0 flex md:flex-col justify-between items-baseline md:items-start border-b md:border-b-0 md:border-r border-casa-border/60 pb-3 md:pb-0 md:pr-4">
                <div>
                  <span className="font-mono text-display-sm font-bold text-casa-navy leading-none">2:00</span>
                  <span className="text-caption font-mono text-casa-muted ml-1 uppercase">PM</span>
                </div>
                <span className="text-caption font-mono text-casa-muted mt-1">15 min duration</span>
                <span className="mt-3 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-800 text-caption font-bold flex items-center gap-1">
                  <Car size={12} />
                  <span>Leave 1:43</span>
                </span>
              </div>

              {/* Right Column: Content & Actions */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">
                    School Transit
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-family-jake" title="Jake" />
                    <span className="w-2.5 h-2.5 rounded-full bg-family-liv" title="Liv" />
                  </div>
                </div>

                <h3 className="text-heading font-bold text-casa-navy leading-snug">
                  Owen & Emme Picked up by Giselle
                </h3>

                <div className="flex items-center gap-2 text-body-sm text-casa-text-secondary">
                  <MapPin size={14} className="text-casa-gold" />
                  <span>Palm Beach Public Elementary School</span>
                </div>

                <div className="pt-3 border-t border-casa-border/40 flex items-center justify-between">
                  <span className="text-caption font-semibold text-casa-navy">Driver: Giselle (Vehicle 1)</span>
                  <Button size="sm" variant="secondary" className="min-h-control text-caption">View Route</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── OPTION C: Bento Ambient (Living Canvas Warm Gradient) ── */}
        {activeCardOption === 'optionC' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                Option C: Bento Ambient (Warm Living Canvas Card with Halos)
              </span>
              <span className="text-caption text-casa-muted font-medium">Softest touch aesthetic</span>
            </div>

            <div className="rounded-container bg-gradient-to-br from-casa-surface via-casa-surface to-casa-accent-subtle/30 border border-casa-accent-soft-border/50 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot variant="gold" size="md" />
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                    Household Logistics
                  </span>
                </div>
                <span className="text-caption font-mono font-bold px-3 py-1 rounded-full bg-casa-surface border border-casa-accent-soft-border text-casa-navy">
                  2:00 PM – 2:15 PM
                </span>
              </div>

              <div>
                <h3 className="font-display text-display-xs font-bold text-casa-navy">
                  Owen & Emme Picked up by Giselle
                </h3>
                <p className="text-body-sm text-casa-text-secondary mt-1">
                  Palm Beach Public Elementary School · Palm Beach, FL
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-casa-accent-soft-border/40">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-casa-surface border border-casa-border text-caption font-semibold text-casa-navy shadow-2xs">
                    🚗 Giselle Driving
                  </span>
                  <span className="text-caption text-casa-muted">Owen, Emme</span>
                </div>
                <Button size="sm" variant="primary" className="bg-casa-gold text-casa-navy font-bold min-h-control">
                  Start Navigation
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Multi-Day Stacked View Mocks (Stream) ── */}
        <div className="pt-4 border-t border-casa-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-body-lg font-bold text-casa-navy flex items-center gap-2">
              <LayersIcon size={18} className="text-casa-gold" />
              <span>Multi-Day Stacked & Column Card Mocks</span>
            </h3>
            <span className="text-caption text-casa-muted">Compact multi-column tiles</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Day 1 Tile */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption font-bold text-casa-navy">11:30 AM – 12:30 PM</span>
                <span className="w-2.5 h-2.5 rounded-full bg-family-jake" />
              </div>
              <h4 className="text-body-sm font-semibold text-casa-navy leading-tight line-clamp-2">
                Pick up a coffee & team sync
              </h4>
              <div className="flex items-center justify-between pt-2 border-t border-casa-border/40 text-caption text-casa-muted">
                <span>At Home</span>
                <span className="font-semibold text-casa-navy">Jake</span>
              </div>
            </div>

            {/* Day 2 Tile */}
            <div className="rounded-widget border border-casa-navy bg-casa-navy text-white p-4 shadow-md space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption font-bold text-casa-gold">2:00 PM – 2:15 PM</span>
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-family-liv" />
                  <span className="w-2 h-2 rounded-full bg-family-emme" />
                </div>
              </div>
              <h4 className="text-body-sm font-semibold text-white leading-tight line-clamp-2">
                Owen & Emme School Pickup
              </h4>
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-caption text-white/70">
                <span>Palm Beach Public</span>
                <span className="font-bold text-casa-gold">Giselle Drives</span>
              </div>
            </div>

            {/* Day 3 Tile */}
            <div className="rounded-widget border border-casa-border/80 bg-casa-surface p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption font-bold text-casa-navy">7:00 PM – 7:30 PM</span>
                <span className="w-2.5 h-2.5 rounded-full bg-family-owen" />
              </div>
              <h4 className="text-body-sm font-semibold text-casa-navy leading-tight line-clamp-2">
                Take out the Trash & Recycling
              </h4>
              <div className="flex items-center justify-between pt-2 border-t border-casa-border/40 text-caption text-casa-muted">
                <span>Household</span>
                <span className="font-semibold text-casa-navy">Owen</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ambient Reminder & Task Pill Mock ── */}
        <div className="pt-4 border-t border-casa-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-body-lg font-bold text-casa-navy flex items-center gap-2">
              <Bell size={18} className="text-amber-600" />
              <span>Ambient Reminder & Task Pill Mocks</span>
            </h3>
            <span className="text-caption text-casa-muted">Low-anxiety warm task banner</span>
          </div>

          <div className="p-3.5 rounded-widget bg-amber-50/70 border border-amber-300/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconButton
                size="sm"
                variant={reminderCompleted ? 'primary' : 'secondary'}
                icon={<Check size={14} strokeWidth={3} />}
                onClick={() => setReminderCompleted(!reminderCompleted)}
                aria-label="Toggle task completion"
                className={cn(
                  'rounded-full min-h-control min-w-control',
                  reminderCompleted
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'border-amber-400 bg-white hover:border-amber-600',
                )}
              />

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-caption font-mono font-bold text-amber-900">9:00 AM</span>
                  <span className={cn('text-body-sm font-semibold text-casa-navy', reminderCompleted && 'line-through text-casa-muted')}>
                    Ask Dr. Hanna for a full blood panel test
                  </span>
                </div>
                <p className="text-caption text-amber-900/80 mt-0.5">
                  Fasting required 12 hours prior. Call office before arrival.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-caption font-bold px-2.5 py-1 rounded-full bg-casa-surface border border-amber-200 text-casa-navy">
                Jake
              </span>
              <Button size="sm" variant="ghost" className="text-amber-900 hover:bg-amber-100 min-h-control text-caption font-semibold">
                Snooze 1h
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Living Canvas & Hero Focus ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
        <SectionHeader
          icon={Sparkles}
          title="Living Canvas & Hero Focus Primitives"
          description="High-priority hero cards with dark luxury navy gradients, ambient gold glows, and warm dinner cards."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Hero Next Up Card (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-start">
            <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2.5">
              HeroCard (Next Up Spotlight)
            </Text>
            <HeroCard
              statusText="Starts in 15 min"
              statusVariant="active"
              timeBadge="3:30 PM"
              title="Pediatrician Checkup — Dr. Davis"
              subtitle={
                <>
                  <MapPin size={15} className="text-casa-gold shrink-0" />
                  <span>Valley Pediatrics · 1420 Main St, Suite 200</span>
                </>
              }
              avatars={
                <div className="flex items-center gap-2.5">
                  <PersonAvatarStack people={samplePeople} max={2} size="md" />
                  <span className="text-caption text-white/70 font-medium">Jake driving Owen</span>
                </div>
              }
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-caption font-bold shadow-sm transition-all min-h-control"
                    aria-label="Mark completed"
                  >
                    <CheckCircle2 size={15} />
                    <span>Check In</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-caption font-semibold transition-all min-h-control"
                  >
                    <Car size={15} />
                    <span>Navigate (12m)</span>
                  </Button>
                </div>
              }
              onClick={() => setToastOpen(true)}
            />
          </div>

          {/* Ambient Dinner & Bento Summary Card (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div>
              <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2.5">
                Card tone="ambient" (Tonight's Dinner)
              </Text>
              <Card tone="ambient" padding="md" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-casa-gold/20 flex items-center justify-center text-casa-navy">
                      <Utensils size={16} />
                    </div>
                    <div>
                      <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                        Tonight's Dinner
                      </span>
                      <h3 className="font-display text-heading font-bold text-casa-navy leading-none mt-0.5">
                        Lemon Herb Roast Chicken
                      </h3>
                    </div>
                  </div>
                  <span className="text-caption font-mono font-semibold px-2.5 py-1 rounded-full bg-casa-surface border border-casa-border">
                    6:30 PM
                  </span>
                </div>
                <p className="text-body-sm text-casa-text-secondary leading-relaxed">
                  Served with roasted asparagus and garlic baby potatoes. Kelly prep covers seasoning at 5:00 PM.
                </p>
                <div className="flex items-center gap-2 pt-2 border-t border-casa-gold/20">
                  <Chip size="sm" tone="accent">Recipe saved</Chip>
                  <Chip size="sm" tone="neutral">Cook time: 45m</Chip>
                </div>
              </Card>
            </div>

            {/* Micro-Caps & Status Badge Row */}
            <div className="rounded-widget border border-casa-border bg-casa-bg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <StatusDot variant="gold" size="md" />
                <span className="text-caption font-bold uppercase tracking-widest text-casa-navy">
                  Ambient Intelligence Active
                </span>
              </div>
              <span className="text-caption font-mono text-casa-muted">Living Canvas Sync</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: 3-Pane Synchronized Widgets & Triage ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
        <SectionHeader
          icon={Zap}
          title="Synchronized 3-Pane Living Canvas Stream"
          description="Timeline stream items with real-time cross-pane highlight sync and 1-click triage action cards."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Schedule Stream Widget (6 cols) */}
          <div className="lg:col-span-6 space-y-3">
            <WidgetContainer
              icon={<Calendar size={18} className="text-casa-navy" />}
              title="Today's Timeline Stream"
              badge={<span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-bg text-casa-navy">3 Events</span>}
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
                  members={samplePeople}
                  isHighlighted={highlightedStreamId === 'dinner'}
                  onMouseEnter={() => setHighlightedStreamId('dinner')}
                  onClick={() => setHighlightedStreamId('dinner')}
                />
              </div>
            </WidgetContainer>
          </div>

          {/* Attention Hub & Action Cards (6 cols) */}
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
                        onClick={() => setToastOpen(true)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-sm transition-all min-h-control"
                      >
                        Assign Jake (Driver)
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setToastOpen(true)}
                        className="px-3.5 py-2 rounded-xl bg-casa-navy text-white hover:bg-slate-800 text-caption font-bold shadow-sm transition-all min-h-control"
                      >
                        Assign Kelly (Driver)
                      </Button>
                    </>
                  }
                />

                <ActionCard
                  category="PREP ALERT"
                  tone="accent"
                  icon={<Sparkles size={15} className="text-casa-gold shrink-0" />}
                  description="Pre-heat oven to 375°F for chicken marinade handoff at 5:00 PM."
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setToastOpen(true)}
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
      </div>

      {/* ── SECTION 3: Status Indicators & Micro-Caps Typography ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
        <SectionHeader
          icon={CheckCircle2}
          title="Status Indicators & Micro-Caps Typography"
          description="Live animated pulse dots, presence states, and uppercase tracking-widest editorial metadata."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-widget border border-casa-border bg-casa-bg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="active" size="lg" />
              <span className="text-caption font-bold uppercase tracking-widest text-casa-navy">
                active (Happening Now)
              </span>
            </div>
            <p className="text-caption text-casa-text-secondary">
              Emerald pulsing dot for ongoing appointments, live transit, and active status.
            </p>
          </div>

          <div className="rounded-widget border border-casa-border bg-casa-bg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="warning" size="lg" />
              <span className="text-caption font-bold uppercase tracking-widest text-amber-900">
                warning (Triage Needed)
              </span>
            </div>
            <p className="text-caption text-casa-text-secondary">
              Amber pulsing dot for schedule conflicts, unassigned rides, and pending prep items.
            </p>
          </div>

          <div className="rounded-widget border border-casa-border bg-casa-bg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="gold" size="lg" />
              <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                gold (AI Copilot / Sync)
              </span>
            </div>
            <p className="text-caption text-casa-text-secondary">
              Warm gold indicator for Copilot reasoning, daily briefings, and ambient sync.
            </p>
          </div>

          <div className="rounded-widget border border-casa-border bg-casa-bg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="info" size="lg" />
              <span className="text-caption font-bold uppercase tracking-widest text-casa-info-strong">
                info (Suggestions)
              </span>
            </div>
            <p className="text-caption text-casa-text-secondary">
              Teal indicator for directory recommendations, grocery suggestions, and weather.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: Room Tone Dynamic Palette Simulation ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
        <SectionHeader
          icon={Sun}
          title="Dynamic Room Tone System"
          description="Circadian background shifting tailored for kitchen and wall-mounted kiosks."
        />

        <div className="flex flex-wrap gap-2.5 mb-4">
          {(Object.keys(ROOM_TONE_COLORS) as (keyof typeof ROOM_TONE_COLORS)[]).map((tone) => (
            <Chip
              key={tone}
              selected={selectedRoomTone === tone}
              onClick={() => setSelectedRoomTone(tone)}
              className="capitalize"
            >
              {tone.replace('-', ' ')}
            </Chip>
          ))}
        </div>

        <div
          className="rounded-widget p-6 border border-casa-border/80 transition-colors duration-700 space-y-4"
          style={{ backgroundColor: ROOM_TONE_COLORS[selectedRoomTone] }}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                Circadian Shift Preview
              </span>
              <h3 className="font-display text-display-sm font-bold text-casa-navy capitalize mt-0.5">
                {selectedRoomTone} Room Tone
              </h3>
            </div>
            <span className="text-caption font-mono font-bold px-3 py-1.5 rounded-full bg-casa-surface border border-casa-border shadow-xs">
              {ROOM_TONE_COLORS[selectedRoomTone]}
            </span>
          </div>
          <p className="text-body text-casa-navy max-w-xl">
            Room Tone subtly adjusts screen temperature to avoid harsh blue light during early morning breakfast and late evening family routines.
          </p>
        </div>
      </div>

      {/* ── SECTION 5: Canonical Typography ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-4">
        <SectionHeader icon={Type} title="Typography" description="Fluid semantic roles generated from src/design-system/tokens.mjs." />
        <div className="space-y-2">
          {TYPE_ROLES.map((t) => (
            <div key={t.role} className="flex items-baseline justify-between gap-4 border-b border-casa-border/60 pb-2 last:border-0">
              <p className={cn(t.className, 'text-casa-navy truncate')}>
                {t.role === 'Display XL' ? (
                  <>Good evening, <span className="italic font-normal">Tabor Family</span></>
                ) : (
                  'The quick brown fox jumps over the lazy dog'
                )}
              </p>
              <p className="text-caption text-casa-muted whitespace-nowrap flex-shrink-0">{t.role} · {t.token}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {FONT_FAMILIES.map((f) => (
            <div key={f.label} className="rounded-widget border border-casa-border bg-casa-bg p-3.5">
              <p className={cn(f.className, 'text-body text-casa-navy font-semibold')}>Aa Bb Cc 123</p>
              <p className="text-caption text-casa-muted mt-1">{f.label}</p>
              <p className="text-caption text-casa-text-faint">{f.sample}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 6: Color Palette ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-4">
        <SectionHeader icon={Palette} title="Color" description="Core palette, semantic accents, and per-member colors from @theme." />
        <ColorSwatchGrid title="Core palette" swatches={CORE_COLORS} />
        <ColorSwatchGrid title="Semantic accents" swatches={SEMANTIC_COLORS} />
        <ColorSwatchGrid title="Family member colors" swatches={FAMILY_COLORS} />
      </div>

      {/* ── SECTION 7: Radius & Elevation ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-4">
        <SectionHeader icon={Layers} title="Radius & Shadow" description="Corner radii and elevation tokens." />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {RADII.map((r) => (
            <div key={r.label} className="text-center">
              <div className={cn('h-16 w-full bg-casa-bg-2 border border-casa-border mx-auto shadow-xs', r.className)} />
              <p className="text-caption text-casa-navy font-semibold mt-1.5">{r.label}</p>
              <p className="text-caption text-casa-text-faint">{r.token}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-2">
          {SHADOWS.map((s) => (
            <div key={s.label} className="text-center">
              <div className={cn('h-16 rounded-card bg-casa-surface border border-casa-border/30 mx-auto', s.className)} />
              <p className="text-caption text-casa-navy font-semibold mt-1.5">{s.label}</p>
              <p className="text-caption text-casa-text-faint">{s.token}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 8: Spacing & Touch Targets ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-4">
        <SectionHeader icon={Ruler} title="Spacing & touch targets" description="Minimum recommended control size for a touch-first kiosk/phone/tablet UI." />
        <div className="flex flex-wrap items-end gap-6">
          <div className="text-center">
            <div className="size-control-sm rounded-full bg-casa-accent-subtle border-2 border-casa-gold flex items-center justify-center text-caption font-semibold text-casa-navy mx-auto">S</div>
            <p className="text-caption text-casa-muted mt-1.5">Control small · density-aware</p>
          </div>
          <div className="text-center">
            <div className="size-control-md rounded-full bg-casa-info-soft border-2 border-casa-info flex items-center justify-center text-caption font-semibold text-casa-info-strong mx-auto">M</div>
            <p className="text-caption text-casa-muted mt-1.5">Control medium · density-aware</p>
          </div>
          <div className="text-center">
            <div className="size-control rounded-full bg-casa-success-soft border-2 border-casa-success flex items-center justify-center text-caption font-semibold text-casa-success-strong mx-auto">Min</div>
            <p className="text-caption text-casa-muted mt-1.5">Minimum target · 44px / 48px kiosk</p>
          </div>
        </div>
      </div>

      {/* ── SECTION 9: Shared Interactive Primitives ── */}
      <div className="rounded-container border border-casa-border/80 bg-casa-surface p-6 shadow-widget space-y-6">
        <SectionHeader icon={CheckCircle2} title="Shared primitives" description="Production components from src/components/ui with density-aware sizing and accessible states." />

        {/* Buttons */}
        <div>
          <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2.5">
            Buttons
          </Text>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="strong">Strong</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="subtle">Subtle utility</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <IconButton icon={<CheckCircle2 size={18} />} aria-label="Confirm example" variant="secondary" />
          </div>
        </div>

        {/* Progressive Event Editing & DateTimeDial */}
        <Card padding="md" tone="subtle" className="space-y-3">
          <Heading role="heading">Progressive event editing</Heading>
          <Text role="body-sm" muted className="mb-3">
            Use compact summaries for scanning, then reveal touch dials or optional fields only when needed.
          </Text>
          <DateTimeDial
            startValue={dialStart}
            endValue={dialEnd}
            onStartChange={setDialStart}
            onEndChange={setDialEnd}
          />
          <DisclosureSection
            title="Additional details"
            summary="Pickup · 2 completed"
            open={disclosureOpen}
            onOpenChange={setDisclosureOpen}
            className="mt-3 rounded-card border border-casa-border"
          >
            <Field label="Notes">
              <Textarea rows={2} placeholder="Optional details" />
            </Field>
          </DisclosureSection>
        </Card>

        {/* Sliding Segmented Control */}
        <div>
          <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2">
            Sliding segmented control
          </Text>
          <SegmentedControl
            aria-label="Gallery view"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'first', label: 'First view' },
              { value: 'second', label: 'Second view', icon: <CheckCircle2 size={15} /> },
              { value: 'third', label: 'Third view' },
            ]}
          />
          <Text role="caption" muted className="mt-2">Tap an option or drag the thumb across two or more choices.</Text>
        </div>

        {/* Chips & Badges */}
        <div className="space-y-3">
          <div>
            <Text role="caption" muted className="font-bold uppercase tracking-widest">Pills / Chips</Text>
            <Text role="body-sm" muted className="mt-1">
              Chip covers touch-sized badges and actions. CalendarPill and PersonAvatarStack are compact, read-only exceptions for dense schedules.
            </Text>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card tone="subtle" padding="sm">
              <Heading role="heading">Static badges</Heading>
              <Text role="body-sm" muted className="mt-1">
                Read-only labels for status, counts, categories, or metadata. They render as text, not buttons.
              </Text>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip size="sm">Small badge</Chip>
                <Chip>Medium badge</Chip>
                <Chip tone="success">Complete</Chip>
                <Chip tone="info">Suggested</Chip>
                <Chip tone="warning">Due soon</Chip>
                <Chip tone="danger">Blocked</Chip>
              </div>
              <Text role="caption" muted className="mt-3 font-mono">{'<Chip>Suggested</Chip>'}</Text>
              <div className="mt-4 border-t border-casa-divider pt-3">
                <Text role="caption" muted className="font-bold uppercase tracking-wide">Dense calendar metadata</Text>
                <Text role="body-sm" muted className="mt-1">CalendarPill matches Day view labels and is read-only. Never use it for a tappable action.</Text>
                <div className="mt-2 flex gap-2">
                  <CalendarPill color="var(--color-casa-navy)">Jake</CalendarPill>
                  <CalendarPill>+2</CalendarPill>
                  <PersonAvatarStack
                    people={samplePeople}
                    max={2}
                    size="sm"
                  />
                </div>
              </div>
            </Card>

            <Card tone="surface" padding="sm">
              <Heading role="heading">Interactive action pills</Heading>
              <Text role="body-sm" muted className="mt-1">
                Tappable filters or compact actions. They render as buttons and include pressed, focus, and disabled states.
              </Text>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip size="sm" onClick={() => undefined}>Small action</Chip>
                <Chip onClick={() => undefined}>Add item</Chip>
                <Chip tone="accent" selected onClick={() => undefined}>Selected filter</Chip>
                <Chip onClick={() => undefined} disabled>Disabled</Chip>
              </div>
              <Text role="caption" muted className="mt-3 font-mono">{'<Chip onClick={...}>Add item</Chip>'}</Text>
            </Card>
          </div>
        </div>

        {/* Card Tones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <Heading role="heading">Surface card</Heading>
            <Text role="body-sm" muted>Default elevation and border.</Text>
          </Card>
          <Card tone="subtle">
            <Heading role="heading">Subtle card</Heading>
            <Text role="body-sm" muted>Low-emphasis grouping.</Text>
          </Card>
          <Card tone="accent" interactive onClick={() => undefined}>
            <Heading role="heading">Interactive card</Heading>
            <Text role="body-sm" muted>Keyboard and pointer activation.</Text>
          </Card>
        </div>

        {/* Form Inputs & Live Voice Transcript */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <Field label="Household item" hint="Hint and label wiring are automatic.">
            <Input placeholder="Type an item" />
          </Field>
          <Field label="Invalid example" error="This field needs a value.">
            <Input placeholder="Required value" />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <Textarea rows={2} placeholder="Add helpful context" />
          </Field>
          <div className="md:col-span-2">
            <Text role="body-sm" className="mb-1.5 font-medium">Live voice transcript</Text>
            <div className="rounded-widget border border-casa-border bg-casa-bg p-4">
              <LiveTranscript
                committed="Add milk and eggs"
                interim="for tomorrow morning"
                phase="listening"
                volume={48}
                className="rounded-none border-0 bg-transparent p-0 shadow-none"
              />
              <div className="mt-3 flex justify-between gap-3">
                <Button variant="subtle">Type instead</Button>
                <Button variant="secondary">Stop</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal & Sheet Triggers */}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open sheet</Button>
        </div>

        <PageShell
          title="Page shell example"
          subtitle="Consistent page gutters and section rhythm."
          className="max-w-none rounded-card border border-dashed border-casa-border bg-casa-bg"
        >
          <Text role="body-sm">Page content aligns to the shared responsive grid.</Text>
        </PageShell>

        {/* Composition Patterns */}
        <div className="space-y-4 border-t border-casa-divider pt-4">
          <PageHeader
            eyebrow="Composition patterns"
            title="Predictable page assembly"
            description="These patterns combine tokens and primitives without changing their accessibility contracts."
            actions={<Button size="sm" variant="secondary" onClick={() => setConfirmationOpen(true)}>Open confirmation</Button>}
          />
          <ThreeRailLayout
            className="h-32 rounded-card border border-casa-border"
            navigation={<div className="h-full bg-surface-subtle p-3 text-caption text-content-muted">20% navigation</div>}
            primary={<div className="h-full bg-surface-page p-3 text-caption text-content-primary">55% primary</div>}
            secondary={<div className="h-full bg-surface-inset p-3 text-caption text-content-muted">25% context</div>}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ContentSection title="Dense list section" description="Shared header, surface, divider, and density rhythm." density="dense">
              <div className="py-3 text-body-sm">First household setting</div>
              <div className="py-3 text-body-sm">Second household setting</div>
            </ContentSection>
            <MasterDetailLayout
              className="h-44 rounded-card border border-casa-border"
              showDetailOnMobile={false}
              master={<div className="p-3 text-body-sm font-semibold">Master navigation</div>}
              detail={<div className="p-3 text-body-sm">Detail content</div>}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PageFeedback state="loading" title="Loading household data" rows={2} />
            <PageFeedback state="empty" title="No saved places" description="Add a place to make planning faster." />
            <PageFeedback state="success" title="Settings saved" description="Your changes are active on this device." />
          </div>
        </div>

        {/* P0 Touch Contracts */}
        <div className="space-y-4 border-t border-casa-divider pt-4">
          <div>
            <Heading role="display-sm">P0 touch contracts</Heading>
            <Text role="body-sm" muted>Shared controls and feedback patterns that prevent screens from inventing incompatible states.</Text>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padding="sm">
              <Heading role="heading">Selection controls</Heading>
              <div className="mt-2 divide-y divide-casa-divider">
                <Switch label="Conversation mode" description="Binary on/off state." checked={switchOn} onCheckedChange={setSwitchOn} />
                <Checkbox label="Include pantry staples" description="Checkbox supports checked and indeterminate states." checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                <Checkbox label="Some items selected" indeterminate />
                <Radio label="First option" name="gallery-radio" value="first" checked={radio === 'first'} onChange={() => setRadio('first')} />
                <Radio label="Second option" name="gallery-radio" value="second" checked={radio === 'second'} onChange={() => setRadio('second')} />
              </div>
            </Card>
            <Card padding="sm">
              <Heading role="heading">Select and combobox</Heading>
              <div className="mt-3 space-y-4">
                <Field label="Native select" hint="Use for short, stable option lists.">
                  <Select defaultValue="today">
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                  </Select>
                </Field>
                <Combobox
                  label="Searchable combobox"
                  value={comboValue}
                  onChange={setComboValue}
                  options={[
                    { value: 'produce', label: 'Produce' },
                    { value: 'dairy', label: 'Dairy' },
                    { value: 'bakery', label: 'Bakery' },
                    { value: 'pantry', label: 'Pantry' },
                  ]}
                />
              </div>
            </Card>
          </div>

          <Card padding="sm">
            <Heading role="heading">Alerts and banners</Heading>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Alert tone="info" title="Sync in progress">Changes are safely stored locally.</Alert>
              <Alert tone="success" title="Saved">The grocery list is up to date.</Alert>
              <Alert tone="warning" title="Leaving soon">Allow extra travel time.</Alert>
              <Alert tone="danger" title="Could not sync" onDismiss={() => undefined}>Check the connection and retry.</Alert>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padding="sm">
              <Heading role="heading">Progress</Heading>
              <div className="mt-3 space-y-4">
                <Progress label="Grocery list" value={7} max={10} showValue />
                <Progress label="Syncing" />
              </div>
            </Card>
            <Card padding="sm">
              <Heading role="heading">Toast / action confirmation</Heading>
              <Text role="body-sm" muted className="mt-1">Use for brief outcomes without moving page content; optional action supports Undo.</Text>
              <Button className="mt-3" variant="secondary" onClick={() => setToastOpen(true)}>Show confirmation</Button>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card padding="sm">
              <Heading role="heading">Skeleton loading</Heading>
              <div className="mt-3 space-y-3">
                <SkeletonRow />
                <Skeleton className="h-20 w-full" />
              </div>
            </Card>
            <EmptyState
              icon={<Inbox size={36} />}
              title="Nothing here yet"
              description="Explain what belongs here and offer one useful next action."
              action={<Button size="sm">Add item</Button>}
            />
            <EmptyState
              tone="error"
              icon={<WifiOff size={36} />}
              title="Could not load"
              description="Name the failed operation and provide a truthful recovery action."
              action={<Button size="sm" variant="secondary">Retry</Button>}
            />
          </div>
        </div>
      </div>

      {/* ── Dialogs & Overlays ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Accessible modal" size="xl">
        <Text role="body-sm" muted>Focus is trapped, Escape closes, and focus returns to the trigger.</Text>
        <Button className="mt-4" fullWidth onClick={() => setModalOpen(false)}>Done</Button>
      </Modal>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Accessible sheet">
        <Text role="body-sm" muted>The sheet shares the same focus, dismissal, and layering contract. Sequential overlays wait for its exit to complete.</Text>
        <WorkflowActions className="mt-4">
          <Button variant="secondary" onClick={() => setSheetOpen(false)}>Cancel</Button>
          <Button onClick={() => setSheetOpen(false)}>Save changes</Button>
        </WorkflowActions>
      </Sheet>

      <ConfirmationDialog
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={() => setConfirmationOpen(false)}
        title="Remove this item?"
        description="This confirmation pattern keeps destructive intent explicit and keyboard accessible."
        confirmLabel="Remove item"
        destructive
      />

      <Toast
        open={toastOpen}
        tone="success"
        message="Item removed"
        actionLabel="Undo"
        onAction={() => setToastOpen(false)}
        onClose={() => setToastOpen(false)}
      />

      {/* ── Validation matrix ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader
          icon={width >= 1024 ? Monitor : width >= 768 ? Tablet : Smartphone}
          title="Validation matrix"
          description="Required viewport/input surfaces (src/lib/deviceMatrix.mjs) with acceptance checks per profile."
        />
        <div className="space-y-3">
          {DEVICE_MATRIX.map((d) => {
            const isCurrent = d.id === closest.id
            return (
              <div
                key={d.id}
                className={cn(
                  'rounded-button border p-3',
                  isCurrent ? 'border-casa-gold bg-casa-accent-soft' : 'border-casa-border bg-casa-bg',
                )}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-body-sm font-semibold text-casa-navy">
                    {d.label} · {d.width}×{d.height} · {d.input}
                  </p>
                  {isCurrent && (
                    <span className="text-caption font-semibold text-casa-gold px-2 py-0.5 rounded-pill bg-white border border-casa-gold/40">
                      Closest to current viewport
                    </span>
                  )}
                </div>
                <p className="text-caption text-casa-muted mt-1">{d.context}</p>
                <ul className="mt-2 space-y-1">
                  {d.acceptance.map((a) => (
                    <li key={a} className="text-caption text-casa-text-secondary flex items-start gap-1.5">
                      <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0 text-casa-muted" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ColorSwatchGrid({ title, swatches }: { title: string; swatches: { className: string; label: string; token: string }[] }) {
  return (
    <div>
      <p className="text-caption font-bold text-casa-muted uppercase tracking-widest mb-2">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {swatches.map((s) => (
          <div key={s.label} className="text-center">
            <div className={cn('h-12 rounded-button border border-casa-border/60 mx-auto shadow-2xs', s.className)} />
            <p className="text-caption text-casa-navy mt-1.5 font-semibold">{s.label}</p>
            <p className="text-caption text-casa-text-faint">{s.token}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
