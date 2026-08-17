import { useState } from 'react'
import {
  Sun,
  Sunset,
  Car,
  Bus,
  Train,
  ShoppingCart,
  Briefcase,
  Home,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
} from 'lucide-react'
import { Button } from '../../ui'
import type { HouseholdWeekdayRhythm, DailyOverrides } from '../../../lib/familyRoutines'
import type { FamilyMember } from '../../../types'
import RhythmEditDrawer, { type EditRhythmPhase } from './RhythmEditDrawer'
import { detectRoutineConflicts } from '../../../utils/routineConflictResolver'

interface WeekdayRhythmHeroProps {
  rhythm: HouseholdWeekdayRhythm
  members: FamilyMember[]
  dailyOverrides: DailyOverrides
  onUpdateRhythm: (updated: HouseholdWeekdayRhythm) => void
  onToggleEmmeTransport: () => void
  onToggleGiselleOff: () => void
  onToggleKellyEarlyHome: () => void
}

export default function WeekdayRhythmHero({
  rhythm,
  members,
  dailyOverrides,
  onUpdateRhythm,
  onToggleEmmeTransport,
  onToggleGiselleOff,
  onToggleKellyEarlyHome,
}: WeekdayRhythmHeroProps) {
  const [activeEditPhase, setActiveEditPhase] = useState<EditRhythmPhase | null>(null)

  const conflicts = detectRoutineConflicts({
    rhythm,
    events: [],
    members,
    overrides: dailyOverrides,
  })

  const emmeMode = dailyOverrides.emmeTransportMode || rhythm.afternoonChain.emmeDefaultMode
  const isGiselleOff = Boolean(dailyOverrides.giselleOffToday)
  const isKellyEarly = Boolean(dailyOverrides.kellyEarlyHome)

  return (
    <div className="space-y-6">
      {/* ── Top Bar: 1-Tap Daily Overrides Bar ──────────────────────────── */}
      <div className="bg-casa-surface p-4 rounded-xl border border-casa-border shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-casa-gold" />
              <h3 className="text-body-sm font-bold text-casa-navy uppercase tracking-wider">
                1-Tap Today Overrides
              </h3>
            </div>
            <p className="text-caption text-casa-muted mt-0.5">
              Quick weekday adjustments for today without changing the baseline routine.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Emme Dismissal Toggle */}
            <Button
              variant={emmeMode === 'bus' ? 'secondary' : 'strong'}
              size="sm"
              onClick={onToggleEmmeTransport}
              className="h-9 px-3 gap-1.5 font-semibold text-caption"
            >
              {emmeMode === 'bus' ? <Bus size={14} /> : <Car size={14} />}
              Emme: {emmeMode === 'bus' ? 'Bus #14 (3:35 PM)' : 'Giselle Carpool'}
            </Button>

            {/* Giselle Off Today Toggle */}
            <Button
              variant={isGiselleOff ? 'strong' : 'secondary'}
              size="sm"
              onClick={onToggleGiselleOff}
              className={`h-9 px-3 gap-1.5 font-semibold text-caption ${
                isGiselleOff ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
              }`}
            >
              <Car size={14} />
              Giselle: {isGiselleOff ? 'Off Today (Coverage Needed)' : 'Active Today'}
            </Button>

            {/* Kelly Early Home Toggle */}
            <Button
              variant={isKellyEarly ? 'strong' : 'secondary'}
              size="sm"
              onClick={onToggleKellyEarlyHome}
              className="h-9 px-3 gap-1.5 font-semibold text-caption"
            >
              <Briefcase size={14} />
              Kelly: {isKellyEarly ? 'Home Early (5:30 PM)' : 'Boca Commute (8–9 PM)'}
            </Button>
          </div>
        </div>

        {/* Conflict / Coverage Warning Banner */}
        {conflicts.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-body-sm text-casa-navy">
              <p className="font-bold">{conflicts[0].title}</p>
              <p className="text-caption text-casa-muted">{conflicts[0].description}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 4-Phase Chronological Timeline Cards ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Phase 1: Morning Launch */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-4 flex flex-col justify-between hover:border-casa-navy/30 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Sun size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-body-sm text-casa-navy leading-tight">Morning Launch</h4>
                  <span className="text-caption text-casa-muted font-medium">07:30 – 08:30 AM</span>
                </div>
              </div>
              <span className="text-2xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-casa-warm text-casa-muted">
                Mon–Fri
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-casa-divider text-caption">
              <div className="p-2.5 rounded-lg bg-surface-subtle border border-casa-border/60 space-y-1">
                <div className="flex items-center justify-between font-bold text-casa-navy">
                  <span className="flex items-center gap-1.5">
                    <Car size={13} className="text-casa-gold" />
                    Jake ➔ Owen & Emme
                  </span>
                  <span className="text-2xs font-mono">07:45 AM</span>
                </div>
                <p className="text-casa-muted text-2xs">Bak Middle / Palm Beach Public</p>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-subtle border border-casa-border/60 space-y-1">
                <div className="flex items-center justify-between font-bold text-casa-navy">
                  <span className="flex items-center gap-1.5">
                    <Train size={13} className="text-casa-gold" />
                    Kelly ➔ Olivia (Tri-Rail)
                  </span>
                  <span className="text-2xs font-mono">08:00 AM</span>
                </div>
                <p className="text-casa-muted text-2xs">Station drop ➔ Boca office commute</p>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveEditPhase('morning')}
            className="w-full mt-4 text-caption font-semibold"
          >
            Edit Morning Flow
          </Button>
        </div>

        {/* Phase 2: Upstream Operations & Grocery Gate */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-4 flex flex-col justify-between hover:border-casa-navy/30 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-body-sm text-casa-navy leading-tight">Ops & Pantry Gate</h4>
                  <span className="text-caption text-casa-muted font-medium">08:00 – 10:30 AM</span>
                </div>
              </div>
              <span className="text-2xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700">
                Active
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-casa-divider text-caption">
              <div className="p-2.5 rounded-lg bg-surface-subtle border border-casa-border/60 space-y-1.5">
                <p className="font-bold text-casa-navy flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Tonight's Dinner Inventory Check
                </p>
                <p className="text-casa-muted text-2xs leading-snug">
                  Prompts pantry verification for dinner ingredients before Walmart 11:00 AM delivery cutoff.
                </p>
              </div>

              <div className="p-2 rounded-lg bg-casa-warm/50 text-2xs text-casa-muted flex items-center justify-between">
                <span>Walmart Cutoff:</span>
                <span className="font-bold text-casa-navy">11:00 AM</span>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveEditPhase('ops_gate')}
            className="w-full mt-4 text-caption font-semibold"
          >
            Configure Ops Gate
          </Button>
        </div>

        {/* Phase 3: Afternoon Relay Chain */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-4 flex flex-col justify-between hover:border-casa-navy/30 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                  <Car size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-body-sm text-casa-navy leading-tight">Afternoon Relay</h4>
                  <span className="text-caption text-casa-muted font-medium">15:00 – 17:30 PM</span>
                </div>
              </div>
              <span className="text-2xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-casa-warm text-casa-muted">
                5 Legs
              </span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-casa-divider text-2xs">
              <div className="flex items-center justify-between text-casa-navy">
                <span>1. Owen School Pickup</span>
                <span className="font-mono text-casa-muted">3:00 PM</span>
              </div>
              <div className="flex items-center justify-between text-casa-navy">
                <span>2. Owen Activity / Karate</span>
                <span className="font-mono text-casa-muted">3:30 PM</span>
              </div>
              <div className="flex items-center justify-between font-semibold text-casa-navy">
                <span>3. Emme: {emmeMode === 'bus' ? 'Bus #14' : 'Giselle'}</span>
                <span className="font-mono text-casa-muted">3:35 PM</span>
              </div>
              <div className="flex items-center justify-between text-casa-navy">
                <span>4. Olivia Tri-Rail Pickup</span>
                <span className="font-mono text-casa-muted">4:15 PM</span>
              </div>
              <div className="flex items-center justify-between text-casa-navy">
                <span>5. Kids Home / Park</span>
                <span className="font-mono text-casa-muted">5:00 PM</span>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveEditPhase('afternoon')}
            className="w-full mt-4 text-caption font-semibold"
          >
            Edit Afternoon Chain
          </Button>
        </div>

        {/* Phase 4: Evening Rhythm & Commute */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-4 flex flex-col justify-between hover:border-casa-navy/30 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
                  <Sunset size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-body-sm text-casa-navy leading-tight">Evening & Commute</h4>
                  <span className="text-caption text-casa-muted font-medium">17:30 – 21:00 PM</span>
                </div>
              </div>
              <span className="text-2xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-casa-warm text-casa-muted">
                Family
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-casa-divider text-caption">
              <div className="p-2.5 rounded-lg bg-surface-subtle border border-casa-border/60 space-y-1">
                <div className="flex items-center justify-between font-bold text-casa-navy">
                  <span className="flex items-center gap-1.5">
                    <Home size={13} className="text-casa-gold" />
                    Jake Household
                  </span>
                  <span className="text-2xs font-mono">17:30 PM</span>
                </div>
                <p className="text-casa-muted text-2xs">Dinner prep & homework coordination</p>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-subtle border border-casa-border/60 space-y-1">
                <div className="flex items-center justify-between font-bold text-casa-navy">
                  <span className="flex items-center gap-1.5">
                    <Briefcase size={13} className="text-casa-gold" />
                    Kelly Commute
                  </span>
                  <span className="text-2xs font-mono">20:00–21:00</span>
                </div>
                <p className="text-casa-muted text-2xs">Boca Raton ➔ Gym ➔ Return Home</p>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveEditPhase('evening')}
            className="w-full mt-4 text-caption font-semibold"
          >
            Edit Evening Rhythm
          </Button>
        </div>
      </div>

      {/* ── Footer: Calendar Sync & Privacy Overview ───────────────────── */}
      <div className="p-4 rounded-xl border border-casa-border bg-surface-subtle/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-casa-muted shrink-0" />
          <div>
            <p className="text-body-sm font-bold text-casa-navy">
              Google Calendar & Skylight Sync Mode:{' '}
              <span className="text-casa-gold">
                {rhythm.syncMode === 'exceptions_only'
                  ? 'Exceptions Only (Zero Calendar Clutter)'
                  : rhythm.syncMode === 'none'
                  ? 'Off (Casa Tabor Only)'
                  : 'Full Daily Sync'}
              </span>
            </p>
            <p className="text-caption text-casa-muted">
              Routine acts as a background baseline without creating dozens of spam events on external calendars.
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setActiveEditPhase('sync')}
          className="shrink-0 text-caption font-semibold"
        >
          Change Sync Mode
        </Button>
      </div>

      {/* Slide-Over Drawer for Editing */}
      <RhythmEditDrawer
        open={Boolean(activeEditPhase)}
        onClose={() => setActiveEditPhase(null)}
        phase={activeEditPhase}
        rhythm={rhythm}
        members={members}
        onSave={onUpdateRhythm}
      />
    </div>
  )
}
