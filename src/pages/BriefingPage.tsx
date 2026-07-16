import { useCallback, useEffect, useState } from 'react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  CalendarDays,
  ChevronRight,
  FileText,
  RefreshCw,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BounceScroll from '../components/shared/BounceScroll'
import MarkdownContent from '../components/shared/MarkdownContent'
import { formatTextForMarkdown } from '../lib/assistantMarkdown.mjs'
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  Heading,
  PageShell,
  SectionHeader,
  Sheet,
  Skeleton,
  Text,
} from '../components/ui'
import { useWeekConflicts, useResolveConflict, useSnoozeConflict } from '../hooks/useConflicts'
import { useDismissPrepItem, usePrepItems, useSnoozePrepItem } from '../hooks/usePrepItems'
import { supabase } from '../lib/supabase'
import { useCalendarStore } from '../stores/calendarStore'
import type { Conflict, PrepItem } from '../types'

interface MemberEvent {
  title: string
  start_time: string
  end_time: string
  all_day: boolean
  location_name: string | null
  enrichment: { summary: string | null; category: string | null; what_to_bring: string[] | null } | null
}

interface MemberSchedule {
  name: string
  color_hex: string
  events: MemberEvent[]
}

interface Briefing {
  briefing_date: string
  summary_text: string | null
  member_schedules: Record<string, MemberSchedule>
  generated_by: string | null
}

interface TimelineEvent extends MemberEvent {
  memberName: string
  memberColor: string
}

interface ConflictGroup {
  kind: 'conflict'
  type: string
  conflicts: Conflict[]
}

interface PrepNeed {
  kind: 'prep'
  item: PrepItem
}

type NeedItem = ConflictGroup | PrepNeed
type NeedsPanel = { mode: 'all' } | { mode: 'conflict'; type: string } | null

const CONFLICT_LABELS: Record<string, string> = {
  drive_time: 'Needs a ride',
  double_book: 'Double booked',
  overlap: 'Time overlap',
  gear_conflict: 'Gear conflict',
}

function useIsNarrowScreen() {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 63.999rem)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia('(max-width: 63.999rem)')
    const update = (event: MediaQueryListEvent) => setIsNarrow(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return isNarrow
}

function greetingFor(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function summaryPreview(summary: string | null, needsCount: number, eventCount: number) {
  if (!summary) {
    const needsCopy = needsCount === 0
      ? 'Nothing needs your attention'
      : `${needsCount} ${needsCount === 1 ? 'thing needs' : 'things need'} you`
    return `${needsCopy}, with ${eventCount} ${eventCount === 1 ? 'event' : 'events'} on the family schedule.`
  }

  const plain = summary
    .replace(/[#*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = plain.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? plain
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence
}

function daysLabel(eventDate: string | null) {
  if (!eventDate) return null
  const days = differenceInCalendarDays(parseISO(eventDate), new Date())
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function conflictLabel(type: string) {
  return CONFLICT_LABELS[type] ?? 'Schedule conflict'
}

function conflictPriority(type: string) {
  if (type === 'drive_time') return 3
  if (type === 'double_book') return 2
  return 1
}

function prepTitle(item: PrepItem) {
  const raw = item.event_title?.includes(' | ')
    ? item.event_title.split(' | ').slice(1).join(' | ')
    : item.event_title
  return raw ?? 'Preparation needed'
}

export default function BriefingPage() {
  const navigate = useNavigate()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPanel, setNeedsPanel] = useState<NeedsPanel>(null)
  const isNarrow = useIsNarrowScreen()
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const resolveConflict = useResolveConflict()
  const snoozeConflict = useSnoozeConflict()
  const dismissPrep = useDismissPrepItem()
  const snoozePrep = useSnoozePrepItem()
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const today = new Date().toLocaleDateString('en-CA')

  const generate = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date()
      dayEnd.setHours(23, 59, 59, 999)
      const { data, error: functionError } = await supabase.functions.invoke('generate-briefing', {
        body: {
          localDate: today,
          dayStartUtc: dayStart.toISOString(),
          dayEndUtc: dayEnd.toISOString(),
        },
      })
      if (functionError) {
        const message = (functionError as { context?: { message?: string }; message?: string })
          .context?.message ?? functionError.message
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.briefing) throw new Error('No briefing returned from function')
      setBriefing(data.briefing as Briefing)
    } catch (generationError) {
      console.error('[Briefing] generate error:', generationError)
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    } finally {
      setIsGenerating(false)
      setIsLoading(false)
    }
  }, [today])

  useEffect(() => {
    let active = true
    void supabase
      .from('daily_briefings')
      .select('*')
      .eq('briefing_date', today)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          console.error('[Briefing] load error:', queryError)
          setError(queryError.message)
          setIsLoading(false)
          return
        }
        if (data) {
          setBriefing(data as Briefing)
          setIsLoading(false)
          return
        }
        void generate()
      })
    return () => {
      active = false
    }
  }, [generate, today])

  const members = briefing ? Object.values(briefing.member_schedules) : []
  const emptyMembers = members.filter((member) => member.events.length === 0)
  const timeline = members
    .flatMap((member) => member.events.map((event) => ({
      ...event,
      memberName: member.name,
      memberColor: member.color_hex,
    })))
    .sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
      return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
    })

  const conflictGroups = Object.entries(
    conflicts.reduce<Record<string, Conflict[]>>((groups, conflict) => {
      ;(groups[conflict.conflict_type] ??= []).push(conflict)
      return groups
    }, {}),
  )
    .sort(([typeA], [typeB]) => conflictPriority(typeB) - conflictPriority(typeA))
    .map(([type, groupedConflicts]): ConflictGroup => ({
      kind: 'conflict',
      type,
      conflicts: groupedConflicts,
    }))

  const needs: NeedItem[] = [
    ...conflictGroups,
    ...prepItems.map((item): PrepNeed => ({ kind: 'prep', item })),
  ]
  const visibleNeeds = needs.slice(0, 3)
  const dateSource = briefing?.briefing_date
    ? parseISO(`${briefing.briefing_date}T12:00:00`)
    : new Date()
  const dateLabel = format(dateSource, 'EEEE, MMMM d')
  const preview = summaryPreview(briefing?.summary_text ?? null, needs.length, timeline.length)
  const activeConflicts = needsPanel?.mode === 'conflict'
    ? conflicts.filter((conflict) => conflict.conflict_type === needsPanel.type)
    : []

  async function dismissConflictGroup(group: ConflictGroup) {
    await Promise.all(group.conflicts.map((conflict) => resolveConflict(conflict.id, 'dismissed')))
  }

  function reviewConflict(type: string) {
    setNeedsPanel({ mode: 'conflict', type })
  }

  function viewConflictInCalendar(conflict: Conflict) {
    if (conflict.event_a?.start_time) setSelectedDate(parseISO(conflict.event_a.start_time))
    setNeedsPanel(null)
    navigate('/calendar')
  }

  return (
    <BounceScroll className="flex-1">
      <PageShell width="wide" className="briefing-page">
        <div className="grid min-w-0 gap-section-gap xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] xl:items-start">
          <main className="min-w-0 space-y-section-gap">
            <section className="relative overflow-hidden rounded-modal border border-casa-navy/30 bg-casa-navy p-card-padding text-casa-on-dark shadow-modal sm:p-7 lg:p-8">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/10" />
              <div className="relative grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <Text role="caption" as="p" className="font-bold uppercase tracking-widest text-casa-gold">
                    {greetingFor(new Date())} · Casa Tabor
                  </Text>
                  <Heading role="display-lg" tone="on-dark" as="h1" className="mt-3">
                    {dateLabel}
                  </Heading>
                  <Text role="body" className="mt-3 max-w-2xl text-casa-on-dark/80">
                    {preview}
                  </Text>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button
                      onClick={generate}
                      loading={isGenerating}
                      leadingIcon={<RefreshCw size={18} />}
                    >
                      {isGenerating ? 'Generating' : 'Regenerate'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => navigate('/calendar')}
                      leadingIcon={<CalendarDays size={18} />}
                    >
                      View full day
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {briefing?.generated_by && (
                      <Text role="caption" className="text-casa-on-dark/60">
                        Generated by {briefing.generated_by}
                      </Text>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/settings/ai')}
                      leadingIcon={<Settings size={16} />}
                    >
                      AI settings
                    </Button>
                  </div>
                </div>

                <div className="mx-auto flex size-32 shrink-0 flex-col items-center justify-center rounded-full border-8 border-casa-gold text-center sm:size-36">
                  <span className="font-display text-display-lg leading-none">{timeline.length}</span>
                  <span className="mt-2 text-caption font-bold uppercase tracking-wider text-casa-on-dark/70">
                    {timeline.length === 1 ? 'Event today' : 'Events today'}
                  </span>
                  {needs.length > 0 && (
                    <span className="mt-2 rounded-pill border border-casa-warning/40 bg-casa-warning/15 px-3 py-1 text-caption font-bold text-casa-on-dark">
                      {needs.length} need you
                    </span>
                  )}
                </div>
              </div>
            </section>

            {error && (
              <Alert tone="danger" title="Briefing could not be refreshed">
                <div className="space-y-3">
                  <p>{error}</p>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/settings/ai')}>
                    Check AI settings
                  </Button>
                </div>
              </Alert>
            )}

            {isLoading && !briefing ? (
              <Card padding="lg" className="space-y-4" aria-label="Loading today's briefing">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-11/12" />
                <Skeleton className="h-5 w-4/5" />
              </Card>
            ) : briefing?.summary_text ? (
              <section aria-labelledby="briefing-summary-title" className="space-y-4 py-2">
                <SectionHeader
                  compact
                  title={<span id="briefing-summary-title">Today's briefing</span>}
                  icon={FileText}
                />
                <MarkdownContent
                  content={formatTextForMarkdown(briefing.summary_text)}
                  className="max-w-page-narrow space-y-4 text-body text-casa-text-secondary [&_p]:leading-relaxed"
                />
              </section>
            ) : briefing ? (
              <Card tone="subtle" padding="lg">
                <EmptyState
                  icon={<Sparkles size={24} />}
                  title="Your schedule is ready"
                  description="Add an API key in AI settings to include a written daily summary."
                  action={<Button variant="secondary" onClick={() => navigate('/settings/ai')}>Open AI settings</Button>}
                />
              </Card>
            ) : null}

            {visibleNeeds.length > 0 && (
              <section aria-labelledby="briefing-needs-title" className="space-y-3">
                <SectionHeader
                  compact
                  title={<span id="briefing-needs-title">Needs you</span>}
                  icon={Sparkles}
                  action={needs.length > 3 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNeedsPanel({ mode: 'all' })}
                      trailingIcon={<ChevronRight size={16} />}
                    >
                      View all {needs.length}
                    </Button>
                  ) : undefined}
                />
                <div className="grid gap-3 md:grid-cols-3">
                  {visibleNeeds.map((need) => (
                    <NeedCard
                      key={need.kind === 'conflict' ? `conflict-${need.type}` : need.item.id}
                      need={need}
                      onReviewConflict={reviewConflict}
                      onDismissConflictGroup={dismissConflictGroup}
                      onSnoozePrep={snoozePrep}
                      onDismissPrep={dismissPrep}
                    />
                  ))}
                </div>
              </section>
            )}
          </main>

          <ScheduleRail timeline={timeline} emptyMembers={emptyMembers} isLoading={isLoading && !briefing} />
        </div>
      </PageShell>

      <Sheet
        open={needsPanel !== null}
        onClose={() => setNeedsPanel(null)}
        side={isNarrow ? 'bottom' : 'right'}
        showHandle={isNarrow}
        title={needsPanel?.mode === 'conflict' ? conflictLabel(needsPanel.type) : 'Everything that needs you'}
        panelClassName={isNarrow ? undefined : 'w-full max-w-xl'}
      >
        {needsPanel?.mode === 'all' && (
          <div className="space-y-3">
            <Text role="body-sm" muted>
              Review, snooze, or dismiss each item without losing your place in the briefing.
            </Text>
            {needs.map((need) => (
              <NeedCard
                key={need.kind === 'conflict' ? `sheet-conflict-${need.type}` : `sheet-${need.item.id}`}
                need={need}
                onReviewConflict={reviewConflict}
                onDismissConflictGroup={dismissConflictGroup}
                onSnoozePrep={snoozePrep}
                onDismissPrep={dismissPrep}
              />
            ))}
          </div>
        )}

        {needsPanel?.mode === 'conflict' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Text role="body-sm" muted>
                {activeConflicts.length} {activeConflicts.length === 1 ? 'schedule issue' : 'schedule issues'} to review
              </Text>
              {activeConflicts.length > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dismissConflictGroup({
                    kind: 'conflict',
                    type: needsPanel.type,
                    conflicts: activeConflicts,
                  })}
                >
                  Dismiss all
                </Button>
              )}
            </div>
            {activeConflicts.map((conflict) => (
              <ConflictReviewCard
                key={conflict.id}
                conflict={conflict}
                onView={() => viewConflictInCalendar(conflict)}
                onSnooze={() => snoozeConflict(conflict.id)}
                onDismiss={() => resolveConflict(conflict.id, 'dismissed')}
              />
            ))}
          </div>
        )}
      </Sheet>
    </BounceScroll>
  )
}

function NeedCard({
  need,
  onReviewConflict,
  onDismissConflictGroup,
  onSnoozePrep,
  onDismissPrep,
}: {
  need: NeedItem
  onReviewConflict: (type: string) => void
  onDismissConflictGroup: (group: ConflictGroup) => Promise<void>
  onSnoozePrep: (id: string) => Promise<void>
  onDismissPrep: (id: string) => Promise<void>
}) {
  if (need.kind === 'conflict') {
    const count = need.conflicts.length
    return (
      <Card padding="sm" className="flex min-h-full flex-col border-casa-accent-soft-border">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-casa-warning/10 text-casa-warning">
            <Zap size={17} aria-hidden="true" />
          </span>
          <Text role="body-sm" as="h3" className="min-w-0 flex-1 font-bold text-content-heading">
            {conflictLabel(need.type)}
          </Text>
          <Chip tone="warning" size="sm">{count}</Chip>
        </div>
        <Text role="caption" muted className="mt-2">
          {count} {count === 1 ? 'schedule issue needs' : 'schedule issues need'} a decision.
        </Text>
        <div className="mt-auto flex gap-2 pr-12 pt-4 sm:pr-0">
          <Button variant="strong" size="sm" fullWidth onClick={() => onReviewConflict(need.type)}>
            Review
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDismissConflictGroup(need)}>
            Dismiss all
          </Button>
        </div>
      </Card>
    )
  }

  const item = need.item
  const due = daysLabel(item.event_date)
  return (
    <Card padding="sm" className="flex min-h-full flex-col">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-casa-accent-subtle text-heading" aria-hidden="true">
          {item.emoji}
        </span>
        {due && <Chip tone={item.priority >= 3 ? 'danger' : 'accent'} size="sm">{due}</Chip>}
      </div>
      <Text role="caption" as="h3" muted className="mt-2 line-clamp-2 font-semibold leading-snug">
        {prepTitle(item)}
      </Text>
      <Text role="caption" className="mt-2 line-clamp-3">
        {item.description}
      </Text>
      <div className="mt-auto flex gap-2 pr-12 pt-4 sm:pr-0">
        <Button variant="subtle" size="sm" fullWidth onClick={() => onSnoozePrep(item.id)}>
          Snooze
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onDismissPrep(item.id)}>
          Dismiss
        </Button>
      </div>
    </Card>
  )
}

function ConflictReviewCard({
  conflict,
  onView,
  onSnooze,
  onDismiss,
}: {
  conflict: Conflict
  onView: () => void
  onSnooze: () => Promise<void>
  onDismiss: () => Promise<void>
}) {
  const eventDate = conflict.event_a?.start_time ? parseISO(conflict.event_a.start_time) : null

  return (
    <Card padding="md" className="space-y-3">
      <div>
        <Text role="body-sm" className="font-semibold">{conflict.description}</Text>
        {eventDate && (
          <Text role="caption" muted className="mt-1">
            {format(eventDate, 'EEEE, MMMM d · h:mm a')}
          </Text>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="strong" size="sm" onClick={onView}>View in calendar</Button>
        <Button variant="subtle" size="sm" onClick={onSnooze}>Snooze</Button>
        <Button variant="secondary" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    </Card>
  )
}

function ScheduleRail({
  timeline,
  emptyMembers,
  isLoading,
}: {
  timeline: TimelineEvent[]
  emptyMembers: MemberSchedule[]
  isLoading: boolean
}) {
  return (
    <Card
      tone="subtle"
      padding="lg"
      className="min-w-0 space-y-5 xl:min-h-full"
      role="complementary"
      aria-label="Today's schedules"
    >
      <SectionHeader title="Today's schedules" icon={CalendarDays} />

      {isLoading ? (
        <div className="space-y-5" aria-label="Loading today's schedules">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : timeline.length > 0 ? (
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[4.35rem] before:top-2 before:w-px before:bg-casa-divider-strong">
          {timeline.map((event, index) => (
            <li
              key={`${event.memberName}-${event.start_time}-${event.title}-${index}`}
              className="relative grid min-w-0 grid-cols-[3.5rem_1rem_minmax(0,1fr)] gap-2"
            >
              <Text role="caption" as="time" className="pt-0.5 text-right font-bold text-casa-text-secondary">
                {event.all_day ? 'All day' : format(parseISO(event.start_time), 'h:mm a')}
              </Text>
              <span
                className="relative z-10 mt-1 size-3 rounded-full border-2 border-casa-bg-2"
                style={{ backgroundColor: event.memberColor }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <Text role="body-sm" className="font-semibold text-content-heading">
                  {event.title}
                </Text>
                <Text role="caption" muted className="mt-0.5">
                  {event.memberName}{event.location_name ? ` · ${event.location_name}` : ''}
                </Text>
                {event.enrichment?.what_to_bring && event.enrichment.what_to_bring.length > 0 && (
                  <Text role="caption" className="mt-1 text-action-accent">
                    Bring: {event.enrichment.what_to_bring.slice(0, 3).join(', ')}
                  </Text>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="No events today"
          description="Enjoy the quiet."
        />
      )}

      {emptyMembers.length > 0 && (
        <div className="border-t border-casa-divider-strong pt-4">
          <Text role="caption" className="mb-3 font-bold uppercase tracking-wide text-content-muted">
            Free day
          </Text>
          <div className="flex flex-wrap gap-2">
            {emptyMembers.map((member) => (
              <span key={member.name} className="inline-flex min-h-control-sm items-center gap-2 text-caption font-semibold text-casa-text-secondary">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: member.color_hex }}
                  aria-hidden="true"
                />
                {member.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
