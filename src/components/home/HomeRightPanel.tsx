/**
 * HomeRightPanel — shown on tablet (lg:) to the right of today's timeline.
 * Week strip, daily briefing, alerts, recent activity — all collapsible.
 */
import { useEffect, useState } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { Link } from 'react-router-dom'
import { AlertTriangle, Sun, ChevronRight, Bot, CalendarDays, Bell, ChevronDown, Plane } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import { supabase } from '../../lib/supabase'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useUpcomingTrips } from '../../hooks/useTrips'
import TripCard from './TripCard'

interface Props {
  now: Date
  allTodayEvents: EventWithDetails[]
}

interface Briefing {
  summary_text: string | null
  generated_by: string | null
}

/** Shared collapsible section header — gold icon + label + chevron */
function SectionHeader({
  icon, label, open, onToggle, action,
}: {
  icon: React.ReactNode
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-body font-medium text-casa-navy">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
        <ChevronDown
          size={13}
          className={cn('text-casa-muted transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </div>
    </button>
  )
}

function wordCount(text: string) { return text.trim().split(/\s+/).length }

function truncateToWords(paragraphs: string[], limit = 500) {
  let count = 0
  let cutIdx = paragraphs.length
  for (let i = 0; i < paragraphs.length; i++) {
    const w = wordCount(paragraphs[i])
    if (count + w > limit && i > 0) { cutIdx = i; break }
    count += w
  }
  return { visible: paragraphs.slice(0, cutIdx), rest: paragraphs.slice(cutIdx) }
}

function parseParagraphs(text: string): string[] {
  if (text.includes('\n\n')) {
    return text.split('\n\n').map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  }
  const sentences = text.match(/[^.!?]+[.!?]+["']?/g) ?? [text]
  const chunks: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    chunks.push(sentences.slice(i, i + 2).join(' ').trim())
  }
  return chunks.filter(Boolean)
}

export default function HomeRightPanel({ now, allTodayEvents }: Props) {
  const { notifications } = useNotifications()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const { data: weekEvents } = useWeekEvents(now)
  const { data: upcomingTrips } = useUpcomingTrips()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)

  const [openTrips, setOpenTrips] = useState(true)
  const [openWeek, setOpenWeek] = useState(true)
  const [openBriefing, setOpenBriefing] = useState(true)
  const [openAlerts, setOpenAlerts] = useState(true)
  const [openActivity, setOpenActivity] = useState(true)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('daily_briefings')
      .select('summary_text, generated_by')
      .eq('briefing_date', today)
      .maybeSingle()
      .then(({ data }) => { if (data) setBriefing(data as Briefing) })
  }, [])

  const paragraphs = briefing?.summary_text ? parseParagraphs(briefing.summary_text) : []
  const { visible, rest } = truncateToWords(paragraphs)
  const hasMore = rest.length > 0

  return (
    <aside className="hidden lg:flex w-[300px] xl:w-[340px] flex-shrink-0 flex-col border-l border-casa-border bg-casa-surface self-stretch overflow-y-auto">

      {/* ── Upcoming Trips ────────────────────────────────────── */}
      {upcomingTrips && upcomingTrips.length > 0 && (
        <div className="px-5 pt-6 pb-5 border-b border-casa-border">
          <SectionHeader
            icon={<Plane size={15} className="text-casa-gold" />}
            label="Upcoming Trips"
            open={openTrips}
            onToggle={() => setOpenTrips(v => !v)}
          />
          {openTrips && (
            <div className="mt-3 space-y-2.5">
              {upcomingTrips.map(trip => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── This Week ─────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 border-b border-casa-border">
        <SectionHeader
          icon={<CalendarDays size={15} className="text-casa-gold" />}
          label="This Week"
          open={openWeek}
          onToggle={() => setOpenWeek(v => !v)}
          action={
            <Link to="/calendar" className="text-caption text-casa-gold hover:brightness-110 flex items-center gap-0.5">
              See all <ChevronRight size={11} />
            </Link>
          }
        />
        {openWeek && (
          <div className="flex gap-1.5 mt-4">
            {days.map((d, i) => {
              const isToday = d.toDateString() === now.toDateString()
              const count = weekEvents?.filter(e =>
                new Date(e.start_time).toDateString() === d.toDateString()
              ).length ?? 0
              return (
                <div key={i} className={cn(
                  'flex-1 flex flex-col items-center py-2.5 rounded-xl text-center cursor-pointer transition-colors',
                  isToday ? 'bg-casa-navy' : 'hover:bg-casa-bg',
                )}>
                  <span className={cn('text-caption uppercase tracking-wide', isToday ? 'text-white/60' : 'text-casa-muted')}>
                    {format(d, 'EEE')[0]}
                  </span>
                  <span className={cn('text-body font-semibold mt-1', isToday ? 'text-white' : 'text-casa-navy')}>
                    {format(d, 'd')}
                  </span>
                  <span className={cn('text-[10px] font-bold mt-0.5 h-3.5', isToday ? 'text-casa-gold' : 'text-casa-muted/60')}>
                    {count > 0 ? count : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Daily Briefing ────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-casa-border">
        <SectionHeader
          icon={<Sun size={15} className="text-casa-gold" />}
          label="Daily Briefing"
          open={openBriefing}
          onToggle={() => setOpenBriefing(v => !v)}
          action={
            <Link to="/briefing" className="text-caption text-casa-gold hover:brightness-110">Full →</Link>
          }
        />
        {openBriefing && (
          <div className="mt-3">
            {paragraphs.length > 0 ? (
              <div className="space-y-2.5">
                {visible.map((p, i) => (
                  <p key={i} className="text-caption text-casa-text leading-relaxed">{p}</p>
                ))}
                {hasMore && briefingExpanded && rest.map((p, i) => (
                  <p key={`r${i}`} className="text-caption text-casa-text leading-relaxed">{p}</p>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setBriefingExpanded(e => !e)}
                    className="text-[11px] text-casa-gold hover:brightness-110 font-medium flex items-center gap-1"
                  >
                    {briefingExpanded ? '↑ Show less' : '↓ Show more'}
                  </button>
                )}
                {briefing?.generated_by && (
                  <p className="text-[10px] text-casa-muted flex items-center gap-1 pt-2 border-t border-casa-divider">
                    <Bot size={10} className="text-casa-gold" />
                    {briefing.generated_by}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-caption text-casa-muted italic leading-relaxed">
                {allTodayEvents.length} event{allTodayEvents.length !== 1 ? 's' : ''} scheduled today.{' '}
                <Link to="/briefing" className="text-casa-gold hover:brightness-110">Generate briefing →</Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Alerts ────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-casa-border">
        <SectionHeader
          icon={<AlertTriangle size={15} className="text-casa-gold" />}
          label="Alerts"
          open={openAlerts}
          onToggle={() => setOpenAlerts(v => !v)}
        />
        {openAlerts && (
          <div className="mt-3 text-caption text-casa-muted bg-amber-50 rounded-xl px-3 py-2.5">
            No conflicts detected 🎉
          </div>
        )}
      </div>

      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="px-5 py-5 flex-1">
        <SectionHeader
          icon={<Bell size={15} className="text-casa-gold" />}
          label="Recent Activity"
          open={openActivity}
          onToggle={() => setOpenActivity(v => !v)}
        />
        {openActivity && (
          <div className="mt-3">
            {notifications.length === 0 ? (
              <p className="text-caption text-casa-muted">No recent activity</p>
            ) : (
              <div>
                {notifications.slice(0, 6).map(n => (
                  <div key={n.id} className="py-2.5 border-b border-casa-divider last:border-0">
                    <p className={cn('text-caption font-medium leading-snug', n.read ? 'text-casa-muted' : 'text-casa-navy')}>
                      {n.body ?? n.title}
                    </p>
                    <p className="text-caption text-casa-muted/60 mt-0.5">
                      {format(new Date(n.created_at), 'h:mm a')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
