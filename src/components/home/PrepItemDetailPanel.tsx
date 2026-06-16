import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Mail, ClipboardList, CalendarDays, Clock3 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { usePrepItemDetails } from '../../hooks/usePrepItems'
import type { PrepItem } from '../../types'
import BounceScroll from '../shared/BounceScroll'

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

function formatEmailBody(body: string | null | undefined): string[] {
  if (!body) return []
  return body
    .replace(/\r\n/g, '\n')
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
  const emailParagraphs = useMemo(() => formatEmailBody(data?.gmailContext?.email_body), [data?.gmailContext?.email_body])

  useEffect(() => {
    if (!item) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [item])

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-[54]"
            onClick={onClose}
          />

          <motion.aside
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 220 }}
            className={cn(
              'fixed z-[55] bg-casa-surface border-casa-border shadow-2xl flex flex-col overflow-hidden',
              isMobile
                ? 'inset-x-0 bottom-0 top-[8vh] rounded-t-2xl border-t'
                : 'top-0 right-0 h-full w-[min(680px,92vw)] border-l',
            )}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-casa-border relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
              >
                <X size={18} />
              </button>
              <h2 className="font-display text-display-sm text-casa-navy pr-8 leading-tight">
                Prep item details
              </h2>
              <p className="text-body-sm text-casa-muted mt-1">{item.event_title ?? 'Action context'}</p>
            </div>

            <BounceScroll className="flex-1 min-h-0">
              <div className="px-6 py-5 space-y-5">
                <section className="rounded-card border border-casa-border bg-casa-bg p-4">
                  <p className="text-body text-casa-text leading-relaxed">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption bg-casa-surface border border-casa-border text-casa-muted">
                      <ClipboardList size={11} /> {item.type}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption bg-casa-surface border border-casa-border text-casa-muted">
                      <Mail size={11} /> {sourceLabel(item.source_type)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption bg-casa-surface border border-casa-border text-casa-muted">
                      <CalendarDays size={11} /> Due {formatWhen(item.due_by)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption bg-casa-surface border border-casa-border text-casa-muted">
                      <Clock3 size={11} /> Added {formatWhen(item.created_at)}
                    </span>
                  </div>
                </section>

                <section className="rounded-card border border-casa-border p-4">
                  <h3 className="font-semibold text-casa-navy text-body-sm mb-2">Related action items</h3>
                  {isLoading ? (
                    <p className="text-caption text-casa-muted">Loading related actions…</p>
                  ) : (data?.relatedItems ?? []).length > 0 ? (
                    <ul className="space-y-2">
                      {data!.relatedItems.map((related) => (
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
