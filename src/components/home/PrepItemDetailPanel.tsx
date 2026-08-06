import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X, Mail, CalendarDays, TimerReset, Ban, CalendarPlus, BellPlus, MapPin, Pencil, UserPlus, ExternalLink } from 'lucide-react'
import { buildAiDraftPrompt } from '../../utils/eventTime'
import { openEventDetails } from '../../utils/openEventDetails'
import {
  useCompletePrepItem,
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
import MarkdownContent from '../shared/MarkdownContent'
import { Button, Chip, Heading, IconButton, PersonAvatarStack } from '../ui'

const PANEL_ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const PANEL_EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1]

const stopTouch = (e: React.TouchEvent | React.PointerEvent) => e.stopPropagation()

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

function linkifyEmailBody(text: string): string {
  return text.replace(/(https?:\/\/[^\s<>()]+)/g, (url) => {
    const trailingMatch = url.match(/[),.;:!?\]]+$/)
    const trailing = trailingMatch ? trailingMatch[0] : ''
    const cleanUrl = trailing ? url.slice(0, -trailing.length) : url
    let label = cleanUrl
    try {
      label = new URL(cleanUrl).hostname.replace(/^www\./, '')
    } catch {
      label = 'link'
    }
    return `[${label}](${cleanUrl})${trailing}`
  })
}

function formatEmailBody(body: string | null | undefined): string {
  if (!body) return ''
  const readable = toReadableEmailText(body)
  if (!readable) return ''
  return linkifyEmailBody(readable)
}

function fromDisplayName(value: string | null | undefined): string {
  if (!value) return 'Unknown sender'
  const quoted = value.match(/"([^"]+)"/)
  if (quoted) return quoted[1]
  const beforeAngle = value.split('<')[0].trim()
  return beforeAngle || value
}

export default function PrepItemDetailPanel({ item, onClose }: PrepItemDetailPanelProps) {
  const { data } = usePrepItemDetails(item)
  const { data: familyMembers = [] } = useFamilyMembers()
  const snooze = useSnoozePrepItem()
  const downvote = useDownvotePrepItem()
  const complete = useCompletePrepItem()
  const setAssignee = useSetPrepItemAssignee()
  const updateDueBy = useUpdatePrepItemDueBy()
  const panelDragControls = useDragControls()
  const [acting, setActing] = useState<string | null>(null)
  const [editingDueBy, setEditingDueBy] = useState(false)
  const [dueByDraft, setDueByDraft] = useState({ date: '', time: '' })
  const [savingDueBy, setSavingDueBy] = useState(false)
  const [assignPickerOpen, setAssignPickerOpen] = useState(false)
  const emailMarkdown = useMemo(() => formatEmailBody(data?.gmailContext?.email_body), [data?.gmailContext?.email_body])
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
    setAssignPickerOpen(false)
  }, [item?.id])

  async function runAction(action: 'snooze' | 'dismiss') {
    if (!item || acting) return
    setActing(action)
    try {
      if (action === 'snooze') await snooze(item.id)
      // "Dismiss" records the same not-relevant signal used to train the
      // relevance/suppression model — matching the inline dismiss action
      // used elsewhere in the app (Home rail, Action Hub).
      if (action === 'dismiss') await downvote(item.id)
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
    const bodyContext = emailMarkdown.split('\n').slice(0, 12).join('\n')
    const prompt = buildAiDraftPrompt({
      kind,
      title: item.event_title ?? item.description,
      details: item.description,
      dueBy: item.due_by,
      source: sourceLabel(item.source_type),
      bodyContext: bodyContext || 'No email body available',
    })
    try {
      await complete(item.id)
      document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt, autoSend: true } }))
      onClose()
    } finally {
      setActing(null)
    }
  }

  const dragDismissOffset = 160
  const dragDismissVelocity = 600

  return (
    <AnimatePresence initial={false}>
      {item && (
        <>
          <motion.div
            key="prep-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.26, ease: PANEL_ENTER_EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: PANEL_EXIT_EASE } }}
            className="fixed inset-0 z-scrim"
            style={{
              background: 'linear-gradient(color-mix(in srgb, var(--color-casa-navy) 8%, transparent), color-mix(in srgb, var(--color-casa-navy) 8%, transparent)), var(--casa-scrim)',
            }}
            onClick={onClose}
            onTouchStart={stopTouch}
            onTouchMove={stopTouch}
            onTouchEnd={stopTouch}
            onPointerDown={stopTouch}
          />

          <motion.div
            key="prep-panel-shell"
            initial={{ y: '106%', opacity: 0.985 }}
            animate={{
              y: 0,
              opacity: 1,
              transition: {
                y: { duration: 0.34, ease: PANEL_ENTER_EASE },
                opacity: { duration: 0.22, ease: 'easeOut' },
              },
            }}
            exit={{
              y: '104%',
              opacity: 0.985,
              transition: {
                y: { duration: 0.26, ease: PANEL_EXIT_EASE },
                opacity: { duration: 0.16, ease: 'easeIn' },
              },
            }}
            drag="y"
            dragControls={panelDragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.18 }}
            dragMomentum={false}
            onDragEnd={(_e, info) => {
              if (info.velocity.y > dragDismissVelocity || info.offset.y > dragDismissOffset) onClose()
            }}
            style={{
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              boxShadow: 'var(--shadow-modal), 0 20px 56px color-mix(in srgb, var(--color-casa-navy) 20%, transparent)',
            }}
            className="fixed inset-x-2 bottom-2 z-modal flex max-h-[90vh] flex-col overflow-hidden rounded-modal bg-casa-surface shadow-modal transform-gpu lg:bottom-4 lg:left-auto lg:right-4 lg:w-[40vw]"
            data-native-drag
            data-ptr-ignore
            role="dialog"
            aria-modal="true"
            aria-label={`Prep item details: ${item.event_title ?? item.description}`}
            onClick={e => e.stopPropagation()}
            onPointerDown={stopTouch}
            onTouchStart={stopTouch}
            onTouchMove={stopTouch}
            onTouchEnd={stopTouch}
          >
            <div className="relative h-control-sm flex-shrink-0 border-b border-casa-border bg-casa-bg px-3">
              <button
                type="button"
                className="absolute inset-x-0 top-0 z-10 mx-auto block h-control w-[86px] cursor-grab active:cursor-grabbing"
                aria-label="Drag down to dismiss panel"
                style={{ touchAction: 'none' }}
                data-native-drag
                data-ptr-ignore
                onPointerDown={e => panelDragControls.start(e)}
              >
                <span
                  className="mx-auto mt-1.5 block h-[5px] w-control-sm rounded-full"
                  style={{
                    background: 'color-mix(in srgb, var(--color-casa-navy) 38%, transparent)',
                  }}
                />
              </button>
            </div>

            <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-casa-bg-2" data-native-drag data-ptr-ignore>
              <div className="relative border-b border-casa-border bg-casa-bg px-6 pb-5 pt-4">
                <IconButton
                  onClick={onClose}
                  className="absolute right-3 top-3"
                  aria-label="Close prep item details"
                  icon={<X size={18} />}
                  variant="secondary"
                  size="sm"
                />
                <div className="flex items-center gap-2 pr-8 text-caption font-semibold uppercase tracking-wide text-casa-muted">
                  {(() => {
                    const category = getPrepCategoryConfig(item)
                    const CategoryIcon = category.icon
                    return <><CategoryIcon size={12} /> {category.label}</>
                  })()}
                </div>
                <Heading role="display-sm" className="pr-8 leading-tight mt-1">
                  {item.event_title ?? item.description}
                </Heading>
              </div>

              <BounceScroll className="flex-1 min-h-0">
                <div className="px-6 py-5 space-y-5">
                  <section className="rounded-card border border-casa-border bg-casa-bg p-4">
                    <ol className="space-y-4">
                      <li className="flex gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-casa-info-soft text-casa-info-strong">
                            <Mail size={12} />
                          </span>
                          <span className="mt-1 w-px flex-1 bg-casa-border" />
                        </div>
                        <div className="flex-1 pb-1">
                          <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">
                            {data?.gmailContext ? 'Received' : data?.eventSnapshot ? 'Source event' : 'Source'}
                          </p>
                          <p className="text-body-sm text-casa-text mt-0.5">
                            {data?.gmailContext
                              ? `${formatWhen(data.gmailContext.received_at)} from ${fromDisplayName(data.gmailContext.from_email)}`
                              : data?.eventSnapshot
                                ? `${data.eventSnapshot.title ?? item.event_title ?? 'Untitled event'} · ${formatWhen(data.eventSnapshot.start_time)}`
                                : `${sourceLabel(item.source_type)} · Added ${formatWhen(item.created_at)}`}
                          </p>
                          {confidence && (
                            <Chip tone={confidence.tone} size="sm" className="mt-2">{confidence.label}</Chip>
                          )}
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-casa-warning/10 text-casa-warning">
                            <CalendarDays size={12} />
                          </span>
                          <span className="mt-1 w-px flex-1 bg-casa-border" />
                        </div>
                        <div className="flex-1 pb-1">
                          <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">Due</p>
                          <button
                            type="button"
                            onClick={openDueByEditor}
                            className="mt-0.5 flex items-center gap-1 text-body-sm text-casa-text"
                          >
                            {formatWhen(item.due_by)}
                            <Pencil size={11} className="opacity-60" />
                          </button>

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
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-casa-bg-2 text-casa-navy">
                            <UserPlus size={12} />
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">Assigned to</p>
                            <button
                              type="button"
                              onClick={() => setAssignPickerOpen((open) => !open)}
                              className="text-caption font-semibold text-casa-info-strong underline underline-offset-2"
                            >
                              {assignPickerOpen ? 'Done' : 'Change'}
                            </button>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            {selectedAssigneeId ? (
                              <>
                                <PersonAvatarStack
                                  people={familyMembers
                                    .filter((m) => m.id === selectedAssigneeId)
                                    .map((m) => ({ id: m.id, name: m.name, color: m.color_hex }))}
                                  size="sm"
                                  max={1}
                                />
                                <span className="text-body-sm text-casa-text">
                                  {familyMembers.find((m) => m.id === selectedAssigneeId)?.name ?? 'Assigned'}
                                  {!item.assigned_to && suggestedAssigneeId === selectedAssigneeId ? ' (suggested)' : ''}
                                </span>
                              </>
                            ) : (
                              <span className="text-body-sm text-casa-muted">Unassigned</span>
                            )}
                          </div>

                          {assignPickerOpen && (
                            <div className="mt-3 flex flex-wrap gap-2">
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
                          )}
                        </div>
                      </li>
                    </ol>
                  </section>

                  {(data?.gmailContext || data?.eventSnapshot) && (
                    <section className="rounded-card border border-casa-border bg-casa-bg p-4">
                      <h3 className="font-semibold text-casa-navy text-body-sm mb-2">
                        {data?.gmailContext ? 'Email context' : 'Source event'}
                      </h3>
                      {data?.gmailContext ? (
                        <div className="space-y-2">
                          <p className="text-body-sm text-casa-text font-semibold">
                            {data.gmailContext.subject ?? '(no subject)'}
                          </p>
                          {emailMarkdown ? (
                            <MarkdownContent
                              content={emailMarkdown}
                              className="text-body-sm text-casa-text leading-relaxed"
                            />
                          ) : (
                            <p className="text-caption text-casa-muted">No email body was saved for this message.</p>
                          )}
                        </div>
                      ) : data?.eventSnapshot ? (
                        <div className="space-y-2">
                          {(data.eventSnapshot.location_name || data.eventSnapshot.address) && (
                            <p className="text-caption text-casa-muted flex items-center gap-1">
                              <MapPin size={11} /> {data.eventSnapshot.location_name ?? data.eventSnapshot.address}
                            </p>
                          )}
                          {data.eventSnapshot.description && (
                            <p className="text-body-sm text-casa-text leading-relaxed">{data.eventSnapshot.description}</p>
                          )}
                        </div>
                      ) : null}
                    </section>
                  )}
                </div>
              </BounceScroll>
            </div>

            <div className="flex flex-none items-center gap-2 border-t border-casa-border bg-casa-surface px-5 py-3.5">
              <IconButton
                onClick={() => runAction('snooze')}
                disabled={!!acting}
                variant="secondary"
                icon={<TimerReset size={16} />}
                aria-label="Snooze until tomorrow"
                title="Snooze until tomorrow"
              />
              <IconButton
                onClick={() => runAction('dismiss')}
                disabled={!!acting}
                variant="secondary"
                icon={<Ban size={16} />}
                aria-label="Dismiss"
                title="Dismiss"
              />
              {item.event_id ? (
                <Button
                  onClick={() => { openEventDetails(item.event_id!); onClose() }}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  leadingIcon={<ExternalLink size={13} />}
                >
                  View event
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => launchCreate('event')}
                    disabled={!!acting}
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    leadingIcon={<CalendarPlus size={13} />}
                  >
                    Create event
                  </Button>
                  <Button
                    onClick={() => launchCreate('reminder')}
                    disabled={!!acting}
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    leadingIcon={<BellPlus size={13} />}
                  >
                    Create reminder
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
