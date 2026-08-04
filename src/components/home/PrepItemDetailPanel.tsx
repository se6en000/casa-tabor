import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Mail, ClipboardList, CalendarDays, Clock3, TimerReset, Ban, ThumbsDown, CalendarPlus, BellPlus } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDueByForAiPrompt } from '../../utils/eventTime'
import { useDismissPrepItem, useDownvotePrepItem, usePrepItemDetails, useSnoozePrepItem } from '../../hooks/usePrepItems'
import type { PrepItem } from '../../types'
import BounceScroll from '../shared/BounceScroll'
import { Button, CalendarPill, Heading, IconButton } from '../ui'

interface PrepItemDetailPanelProps {
  item: PrepItem | null
  onClose: () => void
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'gmail') return 'Email'
  if (source === 'calendar_ai') return 'Calendar AI'
  return 'System'
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
  const snooze = useSnoozePrepItem()
  const dismiss = useDismissPrepItem()
  const downvote = useDownvotePrepItem()
  const [acting, setActing] = useState<string | null>(null)
  const emailParagraphs = useMemo(() => formatEmailBody(data?.gmailContext?.email_body), [data?.gmailContext?.email_body])

  useEffect(() => {
    if (!item) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [item])

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
                      <ClipboardList size={11} /> {item.type}
                    </CalendarPill>
                    <CalendarPill className="gap-1 bg-casa-surface">
                      <Mail size={11} /> {sourceLabel(item.source_type)}
                    </CalendarPill>
                    <CalendarPill className="gap-1 bg-casa-surface">
                      <CalendarDays size={11} /> Due {formatWhen(item.due_by)}
                    </CalendarPill>
                    <CalendarPill className="gap-1 bg-casa-surface">
                      <Clock3 size={11} /> Added {formatWhen(item.created_at)}
                    </CalendarPill>
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
                    <Button
                      onClick={() => launchCreate('event')}
                      disabled={!!acting}
                      variant="primary"
                      size="sm"
                      leadingIcon={<CalendarPlus size={13} />}
                    >
                      Create event
                    </Button>
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
                  <h3 className="font-semibold text-casa-navy text-body-sm mb-2">Email context</h3>
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
                  ) : (
                    <p className="text-caption text-casa-muted">No linked email details for this action.</p>
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
