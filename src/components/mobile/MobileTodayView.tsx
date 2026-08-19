import { useState, useMemo } from 'react'
import { format, addDays, differenceInMinutes } from 'date-fns'
import {
  ChevronRight,
  Camera,
} from 'lucide-react'
import { useRollingEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { getEventStartDate, getEventEndDate, eventOverlapsDay } from '../../utils/eventTime'
import { useLiveClock } from '../../hooks/useLiveClock'
import { inferEventMode, inferEventPlanKind } from '../../lib/eventCommandCenter'
import { isReminderOrChore } from '../../lib/heroFocus.mjs'
import { openEventDetails } from '../../utils/openEventDetails'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'
import { EventSyncStatusDot } from '../calendar/EventSyncStatusDot'
import MobileDocumentScanSheet from './MobileDocumentScanSheet'

export function isHeroTravel(ev: EventWithDetails | null | undefined): boolean {
  if (!ev || ev.all_day || ev.event_type === 'reminder') return false
  const mode = inferEventMode(ev)
  const kind = inferEventPlanKind(ev, mode)
  if (kind !== 'travel') return false
  const loc = (ev.location_name || '').trim().toLowerCase()
  if (loc === 'home' || loc.includes('at home')) return false
  return Boolean(
    (ev.address && ev.address.trim().length > 0) ||
    (ev.location_name && ev.location_name.trim().length > 0)
  )
}

interface MobileTodayViewProps {
  onOpenQuickCreate?: () => void
}

export default function MobileTodayView({ onOpenQuickCreate: _onOpenQuickCreate }: MobileTodayViewProps) {
  const now = useLiveClock(30_000)
  const tomorrow = useMemo(() => addDays(now, 1), [now])
  const { data: rollingEvents = [] } = useRollingEvents(now)

  const [scanSheetOpen, setScanSheetOpen] = useState(false)

  // Filter Today & Tomorrow Events (Excluding chores and reminders from hero candidates)
  const todayEvents = useMemo(() => {
    return rollingEvents
      .filter((ev) => eventOverlapsDay(ev, now) && !isReminderOrChore(ev))
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, now])

  const tomorrowEvents = useMemo(() => {
    return rollingEvents
      .filter((ev) => eventOverlapsDay(ev, tomorrow) && !isReminderOrChore(ev))
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, tomorrow])

  return (
    <div className="w-full flex flex-col gap-4 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-32 overflow-y-auto overscroll-contain">
      {/* ── Gmail Sync Health Warning Banner ── */}
      <GmailSyncStatusIndicator variant="compact" />

      {/* ── Optional Document Scanner Shortcut ── */}
      <div
        role="button"
        tabIndex={0}
        data-tactile="true"
        onClick={() => setScanSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setScanSheetOpen(true)
          }
        }}
        className="flex items-center justify-between p-3 bg-casa-surface border border-casa-border rounded-xl shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-80 transition-all duration-150 cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-casa-gold/15 text-casa-gold flex items-center justify-center shrink-0">
            <Camera size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="text-body-sm font-semibold text-casa-navy truncate">
              Scan Document or Card
            </div>
            <div className="text-caption text-casa-muted truncate">
              Snap photo to extract reminders & events
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-caption font-semibold text-casa-gold shrink-0 ml-2">
          <span>Scan</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          5. TODAY'S TIMELINE
         ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between">
          <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
            Today · {format(now, 'EEEE, MMM d')}
          </span>
          <span className="text-caption text-casa-muted font-medium">
            {todayEvents.length} scheduled
          </span>
        </div>

        {/* Real-Time Now Line */}
        <div className="flex items-center gap-2 py-1 select-none pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse shrink-0" />
          <div className="flex-1 h-px bg-red-400/40" />
          <span className="text-2xs font-mono font-bold text-red-500 shrink-0">
            NOW {format(now, 'h:mm a')}
          </span>
          <div className="flex-1 h-px bg-red-400/40" />
        </div>

        {/* Timeline Events List */}
        {todayEvents.length === 0 ? (
          <div className="p-4 rounded-xl bg-casa-surface border border-casa-border text-center text-caption text-casa-muted">
            No events on today's schedule.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.map((ev) => {
              const start = getEventStartDate(ev)
              const end = getEventEndDate(ev)
              const durationMins = Math.max(15, differenceInMinutes(end, start))
              const memberNames = ev.members?.map((m) => m.family_member.name).join(', ') || 'Family'

              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  data-calendar-event
                  data-sidecar-loadable="true"
                  data-event-id={ev.id}
                  onClick={() => openEventDetails(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEventDetails(ev.id)
                    }
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 cursor-pointer"
                >
                  {/* Time Badge */}
                  <div className="flex flex-col items-center justify-center min-w-[48px] text-center shrink-0">
                    <span className="text-body-sm font-mono font-bold text-casa-navy leading-none">
                      {format(start, 'h:mm')}
                    </span>
                    <span className="text-3xs text-casa-muted mt-1 font-medium">
                      {durationMins >= 60 ? `${(durationMins / 60).toFixed(1).replace('.0', '')}h` : `${durationMins}m`}
                    </span>
                  </div>

                  {/* Vertical Member Color Bar */}
                  <div className="w-1 h-8 rounded-full shrink-0 bg-casa-gold" />

                  {/* Event Title & Subtitle */}
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">
                      {ev.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-casa-muted mt-0.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-casa-gold" />
                      <span>{memberNames}</span>
                      {ev.location_name && (
                        <span>· {ev.location_name}</span>
                      )}
                    </div>
                  </div>

                  <EventSyncStatusDot event={ev} size="xs" className="shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          5. TOMORROW'S TIMELINE PREVIEW
         ══════════════════════════════════════════════════════════════ */}
      {tomorrowEvents.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              Tomorrow · {format(tomorrow, 'EEEE')}
            </span>
            <span className="text-caption text-casa-muted font-medium">
              {tomorrowEvents.length} scheduled
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {tomorrowEvents.slice(0, 3).map((ev) => {
              const start = getEventStartDate(ev)
              const end = getEventEndDate(ev)
              const durationMins = Math.max(15, differenceInMinutes(end, start))
              const memberNames = ev.members?.map((m) => m.family_member.name).join(', ') || 'Family'

              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  data-calendar-event
                  data-sidecar-loadable="true"
                  data-event-id={ev.id}
                  onClick={() => openEventDetails(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEventDetails(ev.id)
                    }
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex flex-col items-center justify-center min-w-[48px] text-center shrink-0">
                    <span className="text-body-sm font-mono font-bold text-casa-navy leading-none">
                      {format(start, 'h:mm')}
                    </span>
                    <span className="text-3xs text-casa-muted mt-1 font-medium">
                      {durationMins >= 60 ? `${(durationMins / 60).toFixed(1).replace('.0', '')}h` : `${durationMins}m`}
                    </span>
                  </div>

                  <div className="w-1 h-8 rounded-full shrink-0 bg-emerald-500" />

                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">
                      {ev.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-casa-muted mt-0.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                      <span>{memberNames}</span>
                      {ev.location_name && <span>· {ev.location_name}</span>}
                    </div>
                  </div>

                  <EventSyncStatusDot event={ev} size="xs" className="shrink-0" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Document / Card Scanner Sheet ── */}
      <MobileDocumentScanSheet
        open={scanSheetOpen}
        onClose={() => setScanSheetOpen(false)}
      />
    </div>
  )
}
