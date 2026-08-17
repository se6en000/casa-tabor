import { useEffect, useState } from 'react'
import { Car, Bus, ShoppingCart, Home, Briefcase, Check } from 'lucide-react'
import { Button, Input, Sheet, Switch, Field } from '../../ui'
import type { HouseholdWeekdayRhythm, RoutineSyncMode } from '../../../lib/familyRoutines'
import type { FamilyMember } from '../../../types'

export type EditRhythmPhase = 'morning' | 'ops_gate' | 'afternoon' | 'evening' | 'sync'

interface RhythmEditDrawerProps {
  open: boolean
  onClose: () => void
  phase: EditRhythmPhase | null
  rhythm: HouseholdWeekdayRhythm
  members: FamilyMember[]
  onSave: (updated: HouseholdWeekdayRhythm) => void
}

export default function RhythmEditDrawer({
  open,
  onClose,
  phase,
  rhythm,
  members,
  onSave,
}: RhythmEditDrawerProps) {
  const [draft, setDraft] = useState<HouseholdWeekdayRhythm>(rhythm)

  // Sync draft whenever drawer opens with a new rhythm
  useEffect(() => {
    setDraft(rhythm)
  }, [rhythm, open])

  if (!phase) return null

  const availableDrivers = members.filter((m) => m.can_drive || m.role === 'parent' || m.role === 'caregiver')

  const titleMap: Record<EditRhythmPhase, string> = {
    morning: 'Edit Morning Launch (7:30 – 8:30 AM)',
    ops_gate: 'Edit Upstream Ops & Grocery Cutoff Gate',
    afternoon: 'Edit Afternoon Relay Chain (3:00 – 5:30 PM)',
    evening: 'Edit Evening Rhythm & Commute',
    sync: 'Calendar & Hardware Sync Settings',
  }

  const handleSaveAndClose = () => {
    onSave({ ...draft, updatedAt: new Date().toISOString() })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={titleMap[phase]}
      panelClassName="w-full max-w-xl bg-casa-surface overflow-y-auto"
    >
      <div className="p-5 space-y-6">
        {/* Phase 1: Morning Launch Editor */}
        {phase === 'morning' && (
          <div className="space-y-4">
            <p className="text-body-sm text-casa-muted">
              Configure morning drop-offs. Drivers, departure times, and destination venues form the morning baseline without cluttering Google Calendar.
            </p>

            <div className="space-y-3">
              {draft.morningLaunch.legs.map((leg, idx) => (
                <div key={leg.id || idx} className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                      <Car size={16} className="text-casa-gold" />
                      Leg {idx + 1}: {leg.label}
                    </span>
                    <Switch
                      label="Active"
                      checked={leg.enabled ?? true}
                      onCheckedChange={(checked) => {
                        const updatedLegs = [...draft.morningLaunch.legs]
                        updatedLegs[idx] = { ...updatedLegs[idx], enabled: checked }
                        setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Departure Time">
                      <Input
                        type="time"
                        value={leg.time}
                        onChange={(e) => {
                          const updatedLegs = [...draft.morningLaunch.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], time: e.target.value }
                          setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                        }}
                      />
                    </Field>
                    <Field label="Driver">
                      <select
                        value={leg.driverName}
                        onChange={(e) => {
                          const drv = availableDrivers.find((m) => m.name === e.target.value)
                          const updatedLegs = [...draft.morningLaunch.legs]
                          updatedLegs[idx] = {
                            ...updatedLegs[idx],
                            driverName: e.target.value,
                            driverMemberId: drv?.id || null,
                          }
                          setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                        }}
                        className="w-full h-10 px-3 rounded-lg border border-casa-border bg-white text-body-sm text-casa-navy font-medium"
                      >
                        {availableDrivers.map((d) => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Label / Purpose">
                      <Input
                        type="text"
                        value={leg.label}
                        onChange={(e) => {
                          const updatedLegs = [...draft.morningLaunch.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], label: e.target.value }
                          setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                        }}
                        placeholder="e.g. School Drop-offs"
                      />
                    </Field>
                    <Field label="Destination Venue">
                      <Input
                        type="text"
                        value={leg.destinationVenue}
                        onChange={(e) => {
                          const updatedLegs = [...draft.morningLaunch.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], destinationVenue: e.target.value }
                          setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                        }}
                        placeholder="e.g. Bak Middle School"
                      />
                    </Field>
                  </div>

                  <Field label="Notes / Instructions">
                    <Input
                      type="text"
                      value={leg.notes || ''}
                      onChange={(e) => {
                        const updatedLegs = [...draft.morningLaunch.legs]
                        updatedLegs[idx] = { ...updatedLegs[idx], notes: e.target.value }
                        setDraft({ ...draft, morningLaunch: { legs: updatedLegs } })
                      }}
                      placeholder="e.g. 7:45–8:15 AM window"
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 2: Ops & Grocery Gate Editor */}
        {phase === 'ops_gate' && (
          <div className="space-y-4">
            <p className="text-body-sm text-casa-muted">
              Configure the morning operational gate. Casa Tabor prompts a pantry check for tonight’s dinner before the Walmart delivery cutoff.
            </p>

            <div className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                  <ShoppingCart size={16} className="text-casa-gold" />
                  Enable Upstream Operations Prompt
                </span>
                <Switch
                  label="Enabled"
                  checked={draft.operationsGate.enabled}
                  onCheckedChange={(checked) => {
                    setDraft({
                      ...draft,
                      operationsGate: { ...draft.operationsGate, enabled: checked },
                    })
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Verification Window Start">
                  <Input
                    type="time"
                    value={draft.operationsGate.checkWindowStart}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        operationsGate: { ...draft.operationsGate, checkWindowStart: e.target.value },
                      })
                    }}
                  />
                </Field>
                <Field label="Verification Window End">
                  <Input
                    type="time"
                    value={draft.operationsGate.checkWindowEnd}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        operationsGate: { ...draft.operationsGate, checkWindowEnd: e.target.value },
                      })
                    }}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Target Delivery Cutoff">
                  <Input
                    type="time"
                    value={draft.operationsGate.targetCutoff}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        operationsGate: { ...draft.operationsGate, targetCutoff: e.target.value },
                      })
                    }}
                  />
                </Field>
                <Field label="Gate Title">
                  <Input
                    type="text"
                    value={draft.operationsGate.title}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        operationsGate: { ...draft.operationsGate, title: e.target.value },
                      })
                    }}
                  />
                </Field>
              </div>

              <Switch
                label="Auto-verify ingredients for tonight's planned dinner"
                checked={draft.operationsGate.linkPantryDinner}
                onCheckedChange={(checked) => {
                  setDraft({
                    ...draft,
                    operationsGate: { ...draft.operationsGate, linkPantryDinner: checked },
                  })
                }}
              />
            </div>
          </div>
        )}

        {/* Phase 3: Afternoon Relay Chain Editor */}
        {phase === 'afternoon' && (
          <div className="space-y-4">
            <p className="text-body-sm text-casa-muted">
              Configure Giselle's afternoon baton passes and Emme's dismissal mode.
            </p>

            <div className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-3">
              <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                <Bus size={16} className="text-casa-gold" />
                Emme Dismissal Default Mode
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={draft.afternoonChain.emmeDefaultMode === 'bus' ? 'strong' : 'secondary'}
                  onClick={() => {
                    setDraft({
                      ...draft,
                      afternoonChain: { ...draft.afternoonChain, emmeDefaultMode: 'bus' },
                    })
                  }}
                  className="text-body-sm font-semibold"
                >
                  School Bus #14 (Default)
                </Button>
                <Button
                  variant={draft.afternoonChain.emmeDefaultMode === 'giselle_carpool' ? 'strong' : 'secondary'}
                  onClick={() => {
                    setDraft({
                      ...draft,
                      afternoonChain: { ...draft.afternoonChain, emmeDefaultMode: 'giselle_carpool' },
                    })
                  }}
                  className="text-body-sm font-semibold"
                >
                  Giselle Carpool
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {draft.afternoonChain.legs.map((leg, idx) => (
                <div key={leg.id || idx} className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                      <Car size={16} className="text-casa-gold" />
                      Step {idx + 1}: {leg.label}
                    </span>
                    <Switch
                      label="Active"
                      checked={leg.enabled ?? true}
                      onCheckedChange={(checked) => {
                        const updatedLegs = [...draft.afternoonChain.legs]
                        updatedLegs[idx] = { ...updatedLegs[idx], enabled: checked }
                        setDraft({ ...draft, afternoonChain: { ...draft.afternoonChain, legs: updatedLegs } })
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Time">
                      <Input
                        type="time"
                        value={leg.time}
                        onChange={(e) => {
                          const updatedLegs = [...draft.afternoonChain.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], time: e.target.value }
                          setDraft({ ...draft, afternoonChain: { ...draft.afternoonChain, legs: updatedLegs } })
                        }}
                      />
                    </Field>
                    <Field label="Driver">
                      <select
                        value={leg.driverName}
                        onChange={(e) => {
                          const drv = availableDrivers.find((m) => m.name === e.target.value)
                          const updatedLegs = [...draft.afternoonChain.legs]
                          updatedLegs[idx] = {
                            ...updatedLegs[idx],
                            driverName: e.target.value,
                            driverMemberId: drv?.id || null,
                          }
                          setDraft({ ...draft, afternoonChain: { ...draft.afternoonChain, legs: updatedLegs } })
                        }}
                        className="w-full h-10 px-3 rounded-lg border border-casa-border bg-white text-body-sm text-casa-navy font-medium"
                      >
                        {availableDrivers.map((d) => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                        <option value="School Bus #14">School Bus #14</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Label">
                      <Input
                        type="text"
                        value={leg.label}
                        onChange={(e) => {
                          const updatedLegs = [...draft.afternoonChain.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], label: e.target.value }
                          setDraft({ ...draft, afternoonChain: { ...draft.afternoonChain, legs: updatedLegs } })
                        }}
                      />
                    </Field>
                    <Field label="Destination">
                      <Input
                        type="text"
                        value={leg.destinationVenue}
                        onChange={(e) => {
                          const updatedLegs = [...draft.afternoonChain.legs]
                          updatedLegs[idx] = { ...updatedLegs[idx], destinationVenue: e.target.value }
                          setDraft({ ...draft, afternoonChain: { ...draft.afternoonChain, legs: updatedLegs } })
                        }}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 4: Evening Rhythm & Commute Editor */}
        {phase === 'evening' && (
          <div className="space-y-4">
            <p className="text-body-sm text-casa-muted">
              Configure Kelly's commute arrival window from Boca Raton and Jake's dinner rhythm.
            </p>

            <div className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-3">
              <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                <Briefcase size={16} className="text-casa-gold" />
                Kelly Commute Window
              </span>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Workplace Venue">
                  <Input
                    type="text"
                    value={draft.eveningCommute.kelly.workplaceVenue}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          kelly: { ...draft.eveningCommute.kelly, workplaceVenue: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
                <Field label="Workday End">
                  <Input
                    type="time"
                    value={draft.eveningCommute.kelly.workEndLocal}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          kelly: { ...draft.eveningCommute.kelly, workEndLocal: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Expected Arrival (Start)">
                  <Input
                    type="time"
                    value={draft.eveningCommute.kelly.expectedHomeStart}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          kelly: { ...draft.eveningCommute.kelly, expectedHomeStart: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
                <Field label="Expected Arrival (End)">
                  <Input
                    type="time"
                    value={draft.eveningCommute.kelly.expectedHomeEnd}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          kelly: { ...draft.eveningCommute.kelly, expectedHomeEnd: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-casa-border bg-white shadow-2xs space-y-3">
              <span className="text-body-sm font-bold text-casa-navy flex items-center gap-2">
                <Home size={16} className="text-casa-gold" />
                Jake Household & Dinner Rhythm
              </span>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dinner Prep Time">
                  <Input
                    type="time"
                    value={draft.eveningCommute.jake.dinnerPrepLocal}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          jake: { ...draft.eveningCommute.jake, dinnerPrepLocal: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
                <Field label="Dinner Target Time">
                  <Input
                    type="time"
                    value={draft.eveningCommute.jake.dinnerTargetLocal}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        eveningCommute: {
                          ...draft.eveningCommute,
                          jake: { ...draft.eveningCommute.jake, dinnerTargetLocal: e.target.value },
                        },
                      })
                    }}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* Phase 5: Sync Mode */}
        {phase === 'sync' && (
          <div className="space-y-4">
            <p className="text-body-sm text-casa-muted">
              Choose how routine departures sync to Google Calendar and Skylight hardware.
            </p>

            <div className="space-y-2.5">
              {[
                {
                  mode: 'exceptions_only' as RoutineSyncMode,
                  title: 'Exceptions Only (Recommended)',
                  desc: 'Keeps Google Calendar and Skylight clean. Only syncs unusual schedule changes or early releases.',
                },
                {
                  mode: 'none' as RoutineSyncMode,
                  title: 'Casa Tabor Only (Zero Calendar Clutter)',
                  desc: 'Never writes routine events to Google Calendar. Lives 100% inside Casa Tabor ambient displays.',
                },
                {
                  mode: 'all' as RoutineSyncMode,
                  title: 'Full Daily Sync',
                  desc: 'Syncs every morning and afternoon leg to Google Calendar daily.',
                },
              ].map((opt) => (
                <Button
                  key={opt.mode}
                  variant={draft.syncMode === opt.mode ? 'strong' : 'secondary'}
                  align="start"
                  contentClassName="flex-col items-start gap-0.5 w-full text-left"
                  onClick={() => setDraft({ ...draft, syncMode: opt.mode })}
                  className={`w-full text-left p-4 h-auto rounded-xl border transition-all justify-start ${
                    draft.syncMode === opt.mode
                      ? 'border-casa-gold bg-casa-gold/10 ring-1 ring-casa-gold'
                      : 'border-casa-border bg-white hover:border-casa-navy/30'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-body-sm font-bold text-casa-navy">{opt.title}</span>
                    {draft.syncMode === opt.mode && <Check size={16} className="text-casa-navy" />}
                  </div>
                  <p className="text-caption text-casa-muted font-normal">{opt.desc}</p>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-4 border-t border-casa-border flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="strong" onClick={handleSaveAndClose}>
            Save Routine Changes
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
