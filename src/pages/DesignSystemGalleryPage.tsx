import { useEffect, useMemo, useState } from 'react'
import { Type, Palette, Ruler, Layers, Smartphone, Tablet, Monitor, CheckCircle2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { DEVICE_MATRIX, closestDeviceProfile } from '../lib/deviceMatrix.mjs'
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  IconButton,
  Input,
  Modal,
  PageShell,
  Sheet,
  SegmentedControl,
  Text,
  Textarea,
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

function SectionHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-full border border-casa-border bg-casa-bg flex items-center justify-center text-casa-gold flex-shrink-0">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="font-display text-heading text-casa-navy">{title}</h2>
        <p className="text-body-sm text-casa-muted">{desc}</p>
      </div>
    </div>
  )
}

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
  const [segment, setSegment] = useState<'first' | 'second' | 'third'>('first')
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
          desc="Casa’s token contract, reusable components, and live capability-based density."
        />
        <div className="mt-3 rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text-secondary">
          Live viewport: <span className="font-semibold text-casa-navy">{width}×{height}</span>{' '}
          ({isFinePointer ? 'fine-pointer' : 'touch'}, <span className="font-semibold text-casa-navy">{density}</span> density)
          {' '}— nearest validation-matrix profile:{' '}
          <span className="font-semibold text-casa-navy">{closest.label}</span>
        </div>
      </div>

      {/* ── Typography ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={Type} title="Typography" desc="Fluid semantic roles generated from src/design-system/tokens.mjs." />
        <div className="space-y-2">
          {TYPE_ROLES.map((t) => (
            <div key={t.role} className="flex items-baseline justify-between gap-4 border-b border-casa-border/60 pb-2 last:border-0">
              <p className={cn(t.className, 'text-casa-navy truncate')}>The quick brown fox</p>
              <p className="text-caption text-casa-muted whitespace-nowrap flex-shrink-0">{t.role} · {t.token}</p>
            </div>
          ))}
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
        <SectionHeader icon={Palette} title="Color" desc="Core palette, semantic accents, and per-member colors from @theme." />
        <ColorSwatchGrid title="Core palette" swatches={CORE_COLORS} />
        <ColorSwatchGrid title="Semantic accents" swatches={SEMANTIC_COLORS} />
        <ColorSwatchGrid title="Family member colors" swatches={FAMILY_COLORS} />
      </div>

      {/* ── Radius & Shadow ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader icon={Layers} title="Radius & Shadow" desc="Corner radii and elevation tokens." />
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
        <SectionHeader icon={Ruler} title="Spacing & touch targets" desc="Minimum recommended control size for a touch-first kiosk/phone/tablet UI." />
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
        <SectionHeader icon={CheckCircle2} title="Shared primitives" desc="Production components from src/components/ui with density-aware sizing and accessible states." />
        <div>
          <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2">Buttons</Text>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="strong">Strong</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <IconButton icon={<CheckCircle2 size={18} />} aria-label="Confirm example" variant="secondary" />
          </div>
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
        <div>
          <Text role="caption" muted className="font-bold uppercase tracking-widest mb-2">Chips</Text>
          <div className="flex flex-wrap gap-2">
            <Chip>Neutral</Chip>
            <Chip tone="accent">Accent</Chip>
            <Chip tone="success">Success</Chip>
            <Chip tone="info">Info</Chip>
            <Chip tone="warning">Warning</Chip>
            <Chip tone="danger">Danger</Chip>
            <Chip tone="accent" selected onClick={() => undefined}>Selected filter</Chip>
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
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Accessible modal">
        <Text role="body-sm" muted>Focus is trapped, Escape closes, and focus returns to the trigger.</Text>
        <Button className="mt-4" fullWidth onClick={() => setModalOpen(false)}>Done</Button>
      </Modal>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Accessible sheet">
        <Text role="body-sm" muted>The sheet shares the same focus, dismissal, and layering contract.</Text>
        <Button className="mt-4" fullWidth onClick={() => setSheetOpen(false)}>Done</Button>
      </Sheet>

      {/* ── Validation matrix ── */}
      <div className="rounded-card border border-casa-border bg-casa-surface p-4 space-y-4">
        <SectionHeader
          icon={width >= 1024 ? Monitor : width >= 768 ? Tablet : Smartphone}
          title="Validation matrix"
          desc="Required viewport/input surfaces (src/lib/deviceMatrix.mjs) with acceptance checks per profile."
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
