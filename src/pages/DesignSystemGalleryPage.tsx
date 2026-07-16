import { useEffect, useMemo, useState } from 'react'
import { Type, Palette, Ruler, Layers, Smartphone, Tablet, Monitor, CheckCircle2, Inbox, WifiOff, Lock } from 'lucide-react'
import { cn } from '../utils/cn'
import { DEVICE_MATRIX, closestDeviceProfile } from '../lib/deviceMatrix.mjs'
import { COMPONENT_MANIFEST, DESIGN_SYSTEM_VERSION } from '../design-system/documentation.mjs'
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
} from '../components/ui'

// ── Design System Gallery ───────────────────────────────────────────────────
// Renders the canonical Casa Tabor tokens (typography, color,
// radius/shadow, spacing/touch-target guidance) plus a few representative
// component states, purely by referencing current theme classes/vars from
// src/index.css. This intentionally does NOT introduce new shared primitives
// (buttons/cards/etc.) — that consolidation is Phase 2 scope. It also encodes
// the required viewport/input validation matrix as data (src/lib/deviceMatrix.mjs)
// so QA has one place to check acceptance criteria per breakpoint.
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
  { className: 'font-display', label: 'Display', token: '--font-display', sample: 'Cormorant Garamond, Georgia, serif' },
  { className: 'font-body', label: 'Body', token: '--font-body', sample: 'DM Sans, system-ui, sans-serif' },
  { className: 'font-mono', label: 'Mono', token: '--font-mono', sample: 'JetBrains Mono, monospace' },
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
  { className: 'rounded-modal', label: 'Modal', token: '--radius-modal (1rem)' },
  { className: 'rounded-pill', label: 'Pill', token: '--radius-pill (9999px)' },
]

const SHADOWS: { className: string; label: string; token: string }[] = [
  { className: 'shadow-card', label: 'Card', token: '--shadow-card' },
  { className: 'shadow-card-hover', label: 'Card hover', token: '--shadow-card-hover' },
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
  const density = document.documentElement.dataset.density ?? 'touch'
  const closest = useMemo(
    () => closestDeviceProfile(width, height, isFinePointer ? 'fine-pointer' : 'touch'),
    [width, height, isFinePointer],
  )

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4">
        <SectionHeader
          icon={Palette}
          title="Design System Gallery"
          description="Casa’s token contract, reusable components, and live capability-based density."
          action={<Chip size="sm" tone="accent">v{DESIGN_SYSTEM_VERSION} · {COMPONENT_MANIFEST.length} components</Chip>}
        />
        <div className="mt-3 rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text-secondary">
          Live viewport: <span className="font-semibold text-casa-navy">{width}×{height}</span>{' '}
          ({isFinePointer ? 'fine-pointer' : 'touch'}, <span className="font-semibold text-casa-navy">{density}</span> density)
          {' '}— nearest validation-matrix profile:{' '}
          <span className="font-semibold text-casa-navy">{closest.label}</span>
        </div>
      </div>

      <Card className="space-y-3" padding="sm" tone="subtle">
        <SectionHeader
          icon={Lock}
          title="Developer reference"
          description="This gallery is a read-only QA surface. Household appearance and text-size controls live in Appearance & Display."
        />
      </Card>

      {/* ── Typography ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={Type} title="Typography" description="Fluid semantic roles generated from src/design-system/tokens.mjs." />
        <div className="space-y-2">
          {TYPE_ROLES.map((t) => (
            <div key={t.role} className="flex items-baseline justify-between gap-4 border-b border-casa-border/60 pb-2 last:border-0">
              <p className={cn(t.className, 'text-casa-navy truncate')}>The quick brown fox</p>
              <p className="text-caption text-casa-muted whitespace-nowrap flex-shrink-0">{t.role} · {t.token}</p>
            </div>
          ))}
        </div>
        <div className="rounded-card bg-casa-navy p-4">
          <Heading role="display-sm" tone="on-dark">On-dark editorial heading</Heading>
          <Text role="body-sm" className="mt-1 text-casa-on-dark/75">
            Use the on-dark tone when a heading sits on a navy or dark branded surface.
          </Text>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {FONT_FAMILIES.map((f) => (
            <div key={f.label} className="rounded-button border border-casa-border bg-casa-bg p-3">
              <p className={cn(f.className, 'text-body text-casa-navy')}>Aa Bb Cc 123</p>
              <p className="text-caption text-casa-muted mt-1">{f.label} · {f.token}</p>
              <p className="text-caption text-casa-text-faint">{f.sample}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Color ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={Palette} title="Color" description="Core palette, semantic accents, and per-member colors from @theme." />
        <ColorSwatchGrid title="Core palette" swatches={CORE_COLORS} />
        <ColorSwatchGrid title="Semantic accents" swatches={SEMANTIC_COLORS} />
        <ColorSwatchGrid title="Family member colors" swatches={FAMILY_COLORS} />
      </div>

      {/* ── Radius & Shadow ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={Layers} title="Radius & Shadow" description="Corner radii and elevation tokens." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {RADII.map((r) => (
            <div key={r.label} className="text-center">
              <div className={cn('h-16 w-full bg-casa-bg-2 border border-casa-border mx-auto', r.className)} />
              <p className="text-caption text-casa-muted mt-1.5">{r.label}</p>
              <p className="text-caption text-casa-text-faint">{r.token}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {SHADOWS.map((s) => (
            <div key={s.label} className="text-center">
              <div className={cn('h-16 rounded-card bg-casa-surface mx-auto', s.className)} />
              <p className="text-caption text-casa-muted mt-1.5">{s.label}</p>
              <p className="text-caption text-casa-text-faint">{s.token}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Spacing / touch targets ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
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
        <p className="text-body-sm text-casa-text-secondary">
          Use <code className="text-caption bg-casa-bg px-1.5 py-0.5 rounded">min-h-control</code>/<code className="text-caption bg-casa-bg px-1.5 py-0.5 rounded">min-w-control</code> or
          <code className="text-caption bg-casa-bg px-1.5 py-0.5 rounded ml-1">size-control</code> on tappable controls. The token resolves to 44px on handheld/desktop
          and 48px on the Pi kiosk. The audit script (<code className="text-caption bg-casa-bg px-1.5 py-0.5 rounded">npm run style:audit</code>) flags
          new square controls below this size as a heuristic (not a hard guarantee — see its printed caveats).
        </p>
      </div>

      {/* ── Shared primitives ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={CheckCircle2} title="Shared primitives" description="Production components from src/components/ui with density-aware sizing and accessible states." />
        <div>
          <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2">Buttons</Text>
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
          <div className="mt-3 max-w-sm space-y-2">
            <Button variant="secondary" fullWidth align="start">Start-aligned list action</Button>
            <Button variant="secondary" fullWidth align="between" trailingIcon={<CheckCircle2 size={18} />}>
              Between-aligned sidebar action
            </Button>
          </div>
          <Card padding="sm">
            <Heading role="heading">Progressive event editing</Heading>
            <Text role="body-sm" muted className="mb-3">Use compact summaries for scanning, then reveal touch dials or optional fields only when needed.</Text>
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
          <div>
            <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2">Sliding segmented control</Text>
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
        </div>
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
                    people={[
                      { id: 'giselle', name: 'Giselle', color: 'var(--color-person-giselle)' },
                      { id: 'jake', name: 'Jake', color: 'var(--color-casa-navy)' },
                      { id: 'kelly', name: 'Kelly', color: 'var(--color-casa-gold)' },
                    ]}
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
            <div className="rounded-control border border-casa-border bg-casa-bg p-4">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Accessible modal">
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
            <div className={cn('h-12 rounded-button border border-casa-border/60 mx-auto', s.className)} />
            <p className="text-caption text-casa-navy mt-1.5 font-medium">{s.label}</p>
            <p className="text-caption text-casa-text-faint">{s.token}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
