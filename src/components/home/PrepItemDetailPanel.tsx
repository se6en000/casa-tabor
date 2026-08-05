import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Mail, CalendarDays, Clock3, TimerReset, Ban, ThumbsDown, CalendarPlus, BellPlus, MapPin, Pencil, UserPlus, ExternalLink } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDueByForAiPrompt } from '../../utils/eventTime'
import { openEventDetails } from '../../utils/openEventDetails'
import {
  useDismissPrepItem,
  useDownvotePrepItem,
  usePrepItemDetails,
  useSetPrepItemAssignee,
  useSnoozePrepItem,
  useUpdatePrepItemDueBy,
  prepItemConfidenceLabel,
} from '../../hooks/usePrepItems'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { PrepItem } from '../../types'
import { getPrepCategoryConfig } from '../../utils/prepCategories'
import BounceScroll from '../shared/BounceScroll'
import { Button, CalendarPill, Chip, Heading, IconButton, PersonAvatarStack } from '../ui'

interface PrepItemDetailPanelProps {
  item: PrepItem | null
  onClose: () => void
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'gmail') return 'Email'
  if (source === 'calendar_ai') return 'Calendar AI'
  if (source === 'reminder_manual') return 'Manual reminder'
  if (source === 'reminder_missed') return 'Missed reminder'
  return 'System'
}

/** Splits an ISO/local timestamp into native `<input type="date">` and `<input type="time">` values, in local (Eastern) time. */
function toDateAndTimeInputs(value: string | null | undefined): { date: string; time: string } {
  const parsed = value ? new Date(value) : new Date()
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    time: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
  }
}

/** Combines native date + time input values (local/Eastern) into an ISO timestamp for storage. */
function combineDateAndTimeInputs(date: string, time: string): string | null {
  if (!date || !time) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const combined = new Date(year, month - 1, day, hour, minute, 0, 0)
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString()
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  return format(new Date(value), 'EEE, MMM d · h:mm a')
}

function toReadableEmailText(raw: string): string {
  const input = raw.replace(/\r\n/g, '\n').trim()
  if (!input) return ''

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(input) || /&(?:nbsp|amp|lt|gt|quot|#\d+);/i.test(input)
  if (!looksLikeHtml || typeof window === 'undefined') {
    return input
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(input, 'text/html')
  doc.querySelectorAll('script, style, noscript, svg, math, iframe').forEach((node) => node.remove())
  doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  doc
    .querySelectorAll('p, div, li, tr, td, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article')
    .forEach((node) => {
      if (node.textContent?.trim()) node.append('\n\n')
    })

  return (doc.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

function formatEmailBody(body: string | null | undefined): string[] {
  if (!body) return []
  return toReadableEmailText(body)
    .split(/\n{2,}/)
    .map(part => part.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function PrepItemDetailPanel({ item, onClose }: PrepItemDetailPanelProps) {
  const isMobile = useIsMobile()
  const { data, isLoading } = usePrepItemDetails(item)
  const { data: familyMembers = [] } = useFamilyMembers()
  const snooze = useSnoozePrepItem()
  const dismiss = useDismissPrepItem()
  const downvote = useDownvotePrepItem()
  const setAssignee = useSetPrepItemAssignee()
  const updateDueBy = useUpdatePrepItemDueBy()
  const [acting, setActing] = useState<string | null>(null)
  const [editingDueBy, setEditingDueBy] = useState(false)
  const [dueByDraft, setDueByDraft] = useState({ date: '', time: '' })
  const [savingDueBy, setSavingDueBy] = useState(false)
  const emailParagraphs = useMemo(() => formatEmailBody(data?.gmailContext?.email_body), [data?.gmailContext?.email_body])
  const confidence = useMemo(() => prepItemConfidenceLabel(data?.source_confidence ?? item?.source_confidence), [data?.source_confidence, item?.source_confidence])
  const suggestedAssigneeId = data?.suggestedAssignees?.[0]?.id ?? null
  const selectedAssigneeId = item?.assigned_to ?? suggestedAssigneeId

  useEffect(() => {
    if (!item) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [item])

  useEffect(() => {
    setEditingDueBy(false)
  }, [item?.id])

  async function runAction(action: 'snooze' | 'dismiss' | 'downvote') {
    if (!item || acting) return
    setActing(action)
    try {
      if (action === 'snooze') await snooze(item.id)
      if (action === 'dismiss') await dismiss(item.id)
      if (action === 'downvote') await downvote(item.id)
      onClose()
    } finally {
      setActing(null)
    }
  }

  async function handleAssign(memberId: string) {
    if (!item) return
    await setAssignee(item.id, selectedAssigneeId === memberId ? null : memberId)
  }

  function openDueByEditor() {
    if (!item) return
    setDueByDraft(toDateAndTimeInputs(item.due_by))
    setEditingDueBy(true)
  }

  async function saveDueBy() {
    if (!item) return
    const iso = combineDateAndTimeInputs(dueByDraft.date, dueByDraft.time)
    if (!iso) return
    setSavingDueBy(true)
    try {
      await updateDueBy(item.id, iso)
      setEditingDueBy(false)
    } finally {
      setSavingDueBy(false)
    }
  }

  async function launchCreate(kind: 'event' | 'reminder') {
    if (!item || acting) return
    setActing(`create-${kind}`)
    const bodyContext = emailParagraphs.slice(0, 6).join('\n')
    const dueByPrompt = formatDueByForAiPrompt(item.due_by)
    const prompt = kind === 'event'
      ? `Create a calendar event from this prep/action item as a draft and ask me to confirm before saving.\n\nAction title: ${item.event_title ?? item.description}\nAction details: ${item.description}\nDue by: ${dueByPrompt} (this is already in Eastern Time — use it as-is, do not treat it as UTC)\nSource: ${sourceLabel(item.source_type)}\nEmail context:\n${bodyContext || 'No email body available'}`
      : `Create a reminder from this prep/action item as a draft and ask me to confirm before saving.\n\nReminder title: ${item.event_title ?? item.description}\nReminder details: ${item.description}\nDue by: ${dueByPrompt} (this is already in Eastern Time — use it as-is, do not treat it as UTC)\nSource: ${sourceLabel(item.source_type)}\nEmail context:\n${bodyContext || 'No email body available'}`
    try {
      await dismiss(item.id)
      document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt, autoSend: true } }))
      onClose()
    } finally {
      setActing(null)
    }
  }

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-scrim bg-black/40"
            onClick={onClose}
          />

          <motion.aside
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 220 }}
            className={cn(
              'fixed z-modal bg-casa-surface border-casa-border shadow-modal flex flex-col overflow-hidden',
              isMobile
                ? 'inset-x-0 bottom-0 top-[8vh] rounded-t-2xl border-t'
                : 'top-0 right-0 h-full w-[min(680px,92vw)] border-l',
            )}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-casa-border relative">
              <IconButton
                onClick={onClose}
                className="absolute right-3 top-3"
                aria-label="Close prep item details"
                icon={<X size={18} />}
              />
              <Heading role="display-sm" className="pr-8 leading-tight">
                Prep item details
              </Heading>
              <p className="text-body-sm text-casa-muted mt-1">{item.event_title ?? 'Action context'}</p>
            </div>

            <BounceScroll className="flex-1 min-h-0">
              <div className="px-6 py-5 space-y-5">
                <section className="rounded-card border border-casa-border bg-casa-bg p-4">
                  <p className="text-body text-casa-text leading-relaxed">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CalendarPill className="gap-1 bg-casa-surface">
                      {(() => {
                        const category = getPrepCategoryConfig(item)
                        const CategoryIcon = category.icon
                        return <><CategoryIcon size={11} /> {category.label}</>
                      })()}
                    </CalendarPill>
                    <CalendarPill className="gap-1 bg-casa-surface">
                      <Mail size={11} /> {sourceLabel(item.source_type)}
                    </CalendarPill>
                    {confidence && (
                      <Chip tone={confidence.tone} size="sm">{confidence.label}</Chip>
                    )}
                    <Chip
                      size="sm"
                      onClick={openDueByEditor}
                      icon={<CalendarDays size={11} />}
                    >
                      Due {formatWhen(item.due_by)} <Pencil size={10} className="opacity-60 ml-1" />
                    </Chip>
                    <CalendarPill className="gap-1 bg-casa-surface">
                      <Clock3 size={11} /> Added {formatWhen(item.created_at)}
                    </CalendarPill>
                  </div>

                  {editingDueBy && (
                    <div className="mt-3 rounded-card border border-casa-border bg-casa-surface p-3 space-y-2">
                      <p className="text-caption text-casa-muted">
                        Editing only updates this action's due date — it will not change any linked calendar event.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date"
                          value={dueByDraft.date}
                          onChange={(e) => setDueByDraft((prev) => ({ ...prev, date: e.target.value }))}
                          className="rounded-input border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text"
                        />
                        <input
                          type="time"
                          value={dueByDraft.time}
                          onChange={(e) => setDueByDraft((prev) => ({ ...prev, time: e.target.value }))}
                          className="rounded-input border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => void saveDueBy()} disabled={savingDueBy}>
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingDueBy(false)} disabled={savingDueBy}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3">
                    <p className="text-caption font-semibold text-casa-muted mb-1.5 flex items-center gap-1">
                      <UserPlus size={12} /> Assigned to
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {familyMembers.map((member) => {
                        const selected = selectedAssigneeId === member.id
                        const suggested = !item.assigned_to && suggestedAssigneeId === member.id
                        return (
                          <Chip
                            key={member.id}
                            size="sm"
                            selected={selected}
                            onClick={() => void handleAssign(member.id)}
                            icon={<PersonAvatarStack people={[{ id: member.id, name: member.name, color: member.color_hex }]} size="sm" max={1} />}
                          >
                            {member.name}{suggested ? ' (suggested)' : ''}
                          </Chip>
                        )
                      })}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => runAction('snooze')}
                      disabled={!!acting}
                      variant="secondary"
                      size="sm"
                      leadingIcon={<TimerReset size={13} />}
                    >
                      Snooze
                    </Button>
                    <Button
                      onClick={() => runAction('dismiss')}
                      disabled={!!acting}
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Ban size={13} />}
                    >
                      Dismiss
                    </Button>
                    <Button
                      onClick={() => runAction('downvote')}
                      disabled={!!acting}
                      variant="danger"
                      size="sm"
                      leadingIcon={<ThumbsDown size={13} />}
                    >
                      Downvote
                    </Button>
                    {item.event_id ? (
                      <Button
                        onClick={() => { openEventDetails(item.event_id!); onClose() }}
                        variant="primary"
                        size="sm"
                        leadingIcon={<ExternalLink size={13} />}
                      >
                        View event
                      </Button>
                    ) : (
                      <Button
                        onClick={() => launchCreate('event')}
                        disabled={!!acting}
                        variant="primary"
                        size="sm"
                        leadingIcon={<CalendarPlus size={13} />}
                      >
                        Create event
                      </Button>
                    )}
                    <Button
                      onClick={() => launchCreate('reminder')}
                      disabled={!!acting}
                      variant="primary"
                      size="sm"
                      className="col-span-2"
                      leadingIcon={<BellPlus size={13} />}
                    >
                      Create reminder
                    </Button>
                  </div>
                </section>

                <section className="rounded-card border border-casa-border p-4">
                  <h3 className="font-semibold text-casa-navy text-body-sm mb-2">Related action items</h3>
                  {isLoading ? (
                    <p className="text-caption text-casa-muted">Loading related actions…</p>
                  ) : (data?.relatedItems ?? []).length > 0 ? (
                    <ul className="space-y-2">
                      {data!.relatedItems.map((related: { id: string; description: string }) => (
                        <li key={related.id} className="text-body-sm text-casa-text leading-relaxed">
                          • {related.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-caption text-casa-muted">No related actions found.</p>
                  )}
                </section>

                <section className="rounded-card border border-casa-border p-4">
                  <h3 className="font-semibold text-casa-navy text-body-sm mb-2">
                    {item.source_type === 'gmail' ? 'Email context' : item.source_type === 'calendar_ai' ? 'Source event' : 'Source'}
                  </h3>
                  {data?.gmailContext ? (
                    <div className="space-y-2">
                      <p className="text-body-sm text-casa-text">
                        <span className="font-semibold">Subject:</span> {data.gmailContext.subject ?? '(no subject)'}
                      </p>
                      <p className="text-body-sm text-casa-text">
                        <span className="font-semibold">From:</span> {data.gmailContext.from_email ?? 'Unknown sender'}
                      </p>
                      <p className="text-caption text-casa-muted">
                        Received {formatWhen(data.gmailContext.received_at)}
                      </p>
                      {emailParagraphs.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {emailParagraphs.map((paragraph, idx) => (
                            <p key={idx} className="text-body-sm text-casa-text leading-relaxed">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-caption text-casa-muted">No email body was saved for this message.</p>
                      )}
                    </div>
                  ) : data?.eventSnapshot ? (
                    <div className="space-y-2">
                      <p className="text-body-sm text-casa-text font-semibold">{data.eventSnapshot.title ?? item.event_title ?? 'Untitled event'}</p>
                      <p className="text-caption text-casa-muted flex items-center gap-1">
                        <CalendarDays size={11} />
                        {data.eventSnapshot.all_day ? formatWhen(data.eventSnapshot.start_time).split(' · ')[0] : formatWhen(data.eventSnapshot.start_time)}
                      </p>
                      {(data.eventSnapshot.location_name || data.eventSnapshot.address) && (
                        <p className="text-caption text-casa-muted flex items-center gap-1">
                          <MapPin size={11} /> {data.eventSnapshot.location_name ?? data.eventSnapshot.address}
                        </p>
                      )}
                      {data.eventSnapshot.description && (
                        <p className="text-body-sm text-casa-text leading-relaxed mt-2">{data.eventSnapshot.description}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-caption text-casa-muted">
                      This item came from {sourceLabel(item.source_type).toLowerCase()}. No additional source details available.
                    </p>
                  )}
                </section>
              </div>
            </BounceScroll>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
