import { Link } from 'react-router-dom'
import { ChevronLeft, Palette, Clock, Monitor, Image, ToggleLeft, Sun } from 'lucide-react'
import { cn } from '../utils/cn'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import BounceScroll from '../components/shared/BounceScroll'

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6">
      <Icon size={15} className="text-casa-gold" />
      <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">{label}</p>
    </div>
  )
}

function Toggle({ checked, onChange, label, desc }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
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

function StepPicker({ value, onChange, min, max, step = 1, unit }: {
  value: number; onChange: (v: number) => void
  min: number; max: number; step?: number; unit: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-9 h-9 rounded-full bg-casa-bg border border-casa-border text-casa-navy font-bold text-lg flex items-center justify-center active:scale-95 transition-transform"
      >−</button>
      <div className="min-w-[5rem] text-center">
        <span className="font-display text-display-sm text-casa-navy">{value}</span>
        <span className="text-caption text-casa-muted ml-1">{unit}</span>
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-9 h-9 rounded-full bg-casa-bg border border-casa-border text-casa-navy font-bold text-lg flex items-center justify-center active:scale-95 transition-transform"
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

export default function ScreensaverSettingsPage() {
  const { settings, update } = useScreensaverSettings()

  return (
    <BounceScroll className="flex-1">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/settings" className="text-casa-muted hover:text-casa-navy transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="font-display text-display-md text-casa-navy">Art Mode & Sleep</h1>
        </div>

        {/* Master toggles */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
          <SectionHeader icon={ToggleLeft} label="Enable / Disable" />
          <Toggle
            checked={settings.enabled}
            onChange={v => update({ enabled: v })}
            label="Art Mode Screensaver"
            desc="Show artwork after idle timeout"
          />
          <div className={cn('transition-opacity', !settings.enabled && 'opacity-40 pointer-events-none')}>
            <Toggle
              checked={settings.displaySleepEnabled}
              onChange={v => update({ displaySleepEnabled: v })}
              label="Monitor Sleep"
              desc="Turn off display after a longer idle period"
            />
          </div>
        </div>

        {/* Timing */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card mt-4">
          <SectionHeader icon={Clock} label="Timers" />
          <Row
            label="Art mode after"
            desc="How long before artwork appears"
          >
            <StepPicker
              value={settings.screensaverMins}
              onChange={v => update({ screensaverMins: v })}
              min={1} max={60} unit="min"
            />
          </Row>
          <Row
            label="Display off after"
            desc="How long before monitor turns off (must be > art mode)"
          >
            <StepPicker
              value={settings.displayOffMins}
              onChange={v => update({ displayOffMins: Math.max(settings.screensaverMins + 1, v) })}
              min={2} max={120} unit="min"
            />
          </Row>
          <Row
            label="Painting rotation"
            desc="How long each artwork is shown"
          >
            <StepPicker
              value={settings.rotationMins}
              onChange={v => update({ rotationMins: v })}
              min={1} max={60} unit="min"
            />
          </Row>
        </div>

        {/* Art size */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card mt-4">
          <SectionHeader icon={Image} label="Artwork Size" />
          <Row
            label="Minimum art width"
            desc="Portrait paintings won't be smaller than this"
          >
            <StepPicker
              value={settings.minArtWidthVw}
              onChange={v => update({ minArtWidthVw: v })}
              min={30} max={90} step={5} unit="vw"
            />
          </Row>
        </div>

        {/* Preview */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card mt-4">
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

        {/* Display Brightness */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card mt-4">
          <SectionHeader icon={Sun} label="Display Brightness in Art Mode" />
          <p className="text-caption text-casa-muted mb-4">
            Monitor dims to <span className="font-medium text-casa-navy">{settings.artDimOffset}% below</span> the ambient light level — so the painting feels lit by the room, not glowing.
            Higher = darker relative to surroundings.
          </p>
          <Row
            label="Dim below ambient"
            desc="Relative to current room lux reading"
          >
            <StepPicker
              value={settings.artDimOffset}
              onChange={v => update({ artDimOffset: v })}
              min={5} max={80} step={5} unit="%"
            />
          </Row>
          <p className="text-caption text-casa-muted mt-2">
            Example: room at 300 lux → auto brightness 70 → art mode at {settings.artDimOffset}% below = {Math.round(70 * (1 - settings.artDimOffset / 100))}
          </p>
        </div>

        {/* Mat color note */}
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card mt-4">
          <SectionHeader icon={Palette} label="Mat Style" />
          <p className="text-body-sm text-casa-muted">
            Warm linen mat <span className="inline-block w-4 h-4 rounded-sm align-middle mx-1 border border-casa-border" style={{ backgroundColor: '#F5F0E8' }} /> with inset bevel shadow. Style changes coming soon.
          </p>
        </div>
      </div>
    </BounceScroll>
  )
}
