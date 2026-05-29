import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, MicOff } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { useAIAssistant, type ChatMessage, type AssistantAction } from '../../hooks/useAIAssistant'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const CONFIRM_PHRASES = /\b(yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)\b/i
const CANCEL_PHRASES  = /\b(no|nope|cancel|don't|do not|stop|abort|never mind|nevermind|undo)\b/i

/** Web Speech API hook — returns null if unsupported */
function useSpeechInput({
  onTranscript,
  onFinalTranscript,
  onDismiss,
  onConfirm,
  onCancel,
}: {
  onTranscript: (text: string) => void
  onFinalTranscript: (text: string) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null)
  const listeningRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listening, setListening] = useState(false)
  const supported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }, [])

  const stop = useCallback(() => {
    clearSilenceTimer()
    listeningRef.current = false
    setListening(false)
    recognitionRef.current?.stop()
  }, [clearSilenceTimer])

  const start = useCallback(async () => {
    if (!supported || listeningRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return

    // Request mic permission explicitly — required before SpeechRecognition will work
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Stop the stream immediately — we just needed the permission grant
      stream.getTracks().forEach(t => t.stop())
    } catch {
      console.warn('[SpeechRecognition] mic permission denied')
      return
    }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    recognitionRef.current = rec

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += t
        else interim += t
      }

      // Show interim transcript in real-time
      if (interim) onTranscript(interim)

      if (finalText) {
        // Dismiss
        if (DISMISS_PHRASES.test(finalText)) {
          stop()
          onDismiss()
          return
        }

        // Confirm / cancel pending action (short phrases only — don't swallow actual requests)
        const isShortPhrase = finalText.trim().split(/\s+/).length <= 5
        if (isShortPhrase && CONFIRM_PHRASES.test(finalText)) {
          onConfirm()
          onTranscript('') // clear interim
          return
        }
        if (isShortPhrase && CANCEL_PHRASES.test(finalText)) {
          onCancel()
          onTranscript('') // clear interim
          return
        }

        clearSilenceTimer()
        onFinalTranscript(finalText)

        // Auto-send after 1.2s silence
        silenceTimerRef.current = setTimeout(() => {
          onFinalTranscript('__SEND__')
        }, 1200)
      }
    }

    rec.onend = () => {
      if (listeningRef.current) {
        // Auto-restart on unexpected end (browser cuts off after ~60s)
        try { rec.start() } catch { /* ignore */ }
      } else {
        setListening(false)
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        console.warn('[SpeechRecognition] mic not allowed — check browser permissions')
      }
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        listeningRef.current = false
        setListening(false)
      }
    }

    listeningRef.current = true
    setListening(true)
    rec.start()
  }, [supported, stop, clearSilenceTimer, onTranscript, onFinalTranscript, onDismiss, onConfirm, onCancel])

  const toggle = useCallback(() => {
    if (listeningRef.current) stop()
    else start()
  }, [start, stop])

  return { listening, supported, start, stop, toggle }
}

interface Props {
  open: boolean
  onClose: () => void
  anchor?: { right: number; bottom: number }
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
}

export default function AIChatDrawer({ open, onClose, anchor, page, events, family, homeCity }: Props) {
  const [input, setInput] = useState('')
  const interimRef = useRef('')  // current interim transcript (not yet final)

  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { messages, loading, send, reset } = useAIAssistant({ page, events, family, homeCity })

  // Ref to the "confirm" callback of the most recent pending action card
  const pendingConfirmRef = useRef<(() => void) | null>(null)
  const pendingCancelRef  = useRef<(() => void) | null>(null)

  // ── Voice send helper ────────────────────────────────────────
  const sendCurrentInput = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    send(trimmed)
  }, [loading, send])

  const speech = useSpeechInput({
    onTranscript: (interim) => {
      interimRef.current = interim
      setInput(interim)
    },
    onFinalTranscript: (text) => {
      if (text === '__SEND__') {
        sendCurrentInput(interimRef.current || (textareaRef.current?.value ?? ''))
        interimRef.current = ''
      } else {
        interimRef.current = text
        setInput(text)
      }
    },
    onDismiss: () => {
      send('Thank you, talk soon!')
        .catch(() => {})
      setTimeout(onClose, 800)
    },
    onConfirm: () => {
      pendingConfirmRef.current?.()
    },
    onCancel: () => {
      pendingCancelRef.current?.()
    },
  })

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        textareaRef.current?.focus()
        // Auto-start listening when drawer opens
        speech.start()
      }, 400)
    } else {
      speech.stop()
      reset()
      setInput('')
      interimRef.current = ''
      setAttachedImage(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-grow textarea height whenever input changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  // Convert a File or Blob → base64 data URL
  const readImageFile = useCallback((file: File | Blob): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type || 'image/png' })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // Handle paste anywhere in the drawer (catches Ctrl+V screenshots)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (blob) setAttachedImage(await readImageFile(blob))
    }
  }, [readImageFile])

  // Handle file picker
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setAttachedImage(await readImageFile(file))
    }
    e.target.value = ''
  }, [readImageFile])

  const handleSend = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = (textareaRef.current?.value ?? input).trim()
    const img = attachedImage
    if ((!text && !img) || loading) return
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    setAttachedImage(null)
    send(text || '(see attached image)', img ?? undefined)
  }, [input, attachedImage, loading, send])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Desktop only: Enter sends; mobile uses the Send button
    const isMobile = 'ontouchstart' in window
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-[65]"
            onClick={onClose}
          />

          {/* Panel — anchored above-left of FAB */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className={cn(
              'fixed z-[70] bg-casa-surface rounded-2xl shadow-modal flex flex-col transition-shadow',
              'w-[min(520px,calc(100vw-2rem))]',
              loading && 'ai-thinking',
            )}
            style={{
              maxHeight: '65vh',
              // offset 16px gap from FAB; clamp so it never goes off-screen
              right: anchor ? Math.max(8, anchor.right - 16) : 20,
              bottom: anchor ? Math.max(8, anchor.bottom + 16) : 100,
            }}
            onClick={e => e.stopPropagation()}
            onPaste={handlePaste}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-casa-border">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'w-7 h-7 rounded-full bg-casa-gold/10 flex items-center justify-center transition-all',
                  loading && 'bg-casa-gold/20',
                )}>
                  <Sparkles size={15} className={cn('text-casa-gold', loading && 'animate-pulse')} />
                </div>
                <p className="font-display text-heading text-casa-navy">
                  Casa Tabor AI
                  {loading && <span className="text-casa-gold text-caption font-normal ml-2">thinking…</span>}
                  {!loading && speech.listening && (
                    <span className="text-red-500 text-caption font-normal ml-2 flex items-center gap-1 inline-flex">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      listening
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Sparkles size={28} className="text-casa-gold opacity-60" />
                  <p className="text-body-sm font-semibold text-casa-navy">What can I help with?</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {SUGGESTIONS[page] ? SUGGESTIONS[page].map(s => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); textareaRef.current?.focus() }}
                        className="px-3 py-1.5 rounded-full border border-casa-border text-caption text-casa-muted hover:bg-casa-bg hover:text-casa-navy transition-colors"
                      >
                        {s}
                      </button>
                    )) : null}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isLatest={idx === messages.length - 1}
                  onConfirmAction={async (action) => {
                    await executeAction(action, family, qc)
                    qc.invalidateQueries({ queryKey: ['events'] })
                  }}
                  registerPendingConfirm={(fn) => { pendingConfirmRef.current = fn }}
                  registerPendingCancel={(fn)  => { pendingCancelRef.current  = fn }}
                />
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-casa-muted pl-1">
                  <Loader2 size={15} className="animate-spin text-casa-gold" />
                  <span className="text-caption">Thinking…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-5 pt-3 border-t border-casa-border">
              {/* Image preview */}
              <AnimatePresence>
                {attachedImage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 overflow-hidden"
                  >
                    <div className="relative inline-block">
                      <img
                        src={attachedImage.dataUrl}
                        alt="Attached"
                        className="h-20 w-auto rounded-lg border border-casa-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-casa-error text-white flex items-center justify-center shadow"
                      >
                        <X size={10} />
                      </button>
                      <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/50 rounded px-1 py-0.5">
                        <ImageIcon size={9} className="text-white" />
                        <span className="text-[9px] text-white font-medium">Image attached</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-2 bg-casa-bg rounded-xl border border-casa-border px-3 py-2">
                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Attach from library */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image from library"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Paperclip size={16} />
                </button>

                {/* Camera capture */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  title="Take a photo"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Camera size={16} />
                </button>

                {/* Controlled textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={speech.listening ? 'Listening… speak now' : attachedImage ? 'Ask about this image…' : "Ask anything or say 'add an event…'"}
                  rows={1}
                  className="flex-1 bg-transparent text-body text-casa-navy placeholder:text-casa-muted outline-none resize-none leading-relaxed"
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />

                {/* Mic toggle */}
                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
                    title={speech.listening ? 'Stop listening' : 'Start voice input'}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5',
                      speech.listening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-casa-divider text-casa-muted hover:text-casa-gold'
                    )}
                  >
                    {speech.listening ? <Mic size={14} /> : <MicOff size={14} />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && !attachedImage) || loading}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5',
                    (input.trim() || attachedImage) && !loading
                      ? 'bg-casa-gold text-white hover:brightness-110'
                      : 'bg-casa-divider text-casa-muted'
                  )}
                >
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[10px] text-casa-muted mt-1.5 text-center opacity-60">
                {speech.supported
                  ? 'Tap 🎙 to toggle voice · say "thank you" to close'
                  : 'Tap ➤ to send · 📎 gallery · 📷 camera'}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Message Bubble ─────────────────────────────────────────── */

function MessageBubble({ msg, isLatest, onConfirmAction, registerPendingConfirm, registerPendingCancel }: {
  msg: ChatMessage
  isLatest: boolean
  onConfirmAction: (action: AssistantAction) => Promise<void>
  registerPendingConfirm: (fn: () => void) => void
  registerPendingCancel:  (fn: () => void) => void
}) {
  const [confirmed, setConfirmed] = useState<'idle' | 'loading' | 'done' | 'cancelled'>('idle')

  const isUser = msg.role === 'user'
  const actionDone = confirmed === 'done'
  const actionCancelled = confirmed === 'cancelled'

  const hasPendingAction = !!msg.action && !msg.action.needs_clarification && confirmed === 'idle'

  // Register confirm/cancel handlers so voice can trigger them
  useEffect(() => {
    if (isLatest && hasPendingAction) {
      registerPendingConfirm(async () => {
        setConfirmed('loading')
        await onConfirmAction(msg.action!)
        setConfirmed('done')
      })
      registerPendingCancel(() => setConfirmed('cancelled'))
    }
  }, [isLatest, hasPendingAction]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-body-sm leading-relaxed',
        isUser
          ? 'bg-casa-navy text-white rounded-br-sm'
          : 'bg-casa-bg border border-casa-border text-casa-navy rounded-bl-sm'
      )}>
        {/* Image thumbnail in user bubble */}
        {msg.imageDataUrl && (
          <img
            src={msg.imageDataUrl}
            alt="Attached"
            className="max-h-40 w-auto rounded-lg mb-2 object-cover"
          />
        )}
        {/* Render bold markdown minimally */}
        {msg.content !== '(see attached image)' && (
          <p dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        )}

        {/* Action confirmation card */}
        {msg.action && !msg.action.needs_clarification && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {actionDone ? (
              <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                <Check size={13} /> Done!
              </div>
            ) : actionCancelled ? (
              <div className="flex items-center gap-1.5 text-casa-muted text-caption">
                <XCircle size={13} /> Cancelled
              </div>
            ) : (
              <>
                <ActionPreview action={msg.action} />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={confirmed === 'loading'}
                    onClick={async () => {
                      setConfirmed('loading')
                      await onConfirmAction(msg.action!)
                      setConfirmed('done')
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button bg-casa-gold text-white text-caption font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {confirmed === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmed('cancelled')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-caption text-casa-muted hover:bg-casa-divider transition-colors"
                  >
                    <XCircle size={12} /> Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionPreview({ action }: { action: AssistantAction }) {
  if (action.action === 'create_event') {
    const start = new Date(action.start)
    const end = new Date(action.end)
    return (
      <div className="space-y-1 text-caption text-casa-muted">
        <p className="font-semibold text-casa-navy text-body-sm">{action.title}</p>
        <p>{format(start, 'EEE, MMM d · h:mm a')} – {format(end, 'h:mm a')}</p>
        {action.location && <p>📍 {action.location}</p>}
        {action.members?.length > 0 && <p>👤 {action.members.join(', ')}</p>}
      </div>
    )
  }
  if (action.action === 'delete_event') {
    return <p className="text-caption text-red-600 font-semibold">Delete "{action.title}"?</p>
  }
  if (action.action === 'update_event') {
    const changes = Object.entries(action.changes).map(([k, v]) => `${k}: ${v}`).join(' · ')
    return <p className="text-caption text-casa-muted">Update: {changes}</p>
  }
  return null
}

/* ── Execute confirmed action ───────────────────────────────── */

async function executeAction(action: AssistantAction, family: FamilyMember[], qc: ReturnType<typeof useQueryClient>) {
  if (action.action === 'create_event') {
    // Insert event
    const { data: event, error } = await supabase.from('events').insert({
      title: action.title,
      start_time: action.start,
      end_time: action.end,
      location_name: action.location ?? null,
      all_day: false,
      status: 'confirmed',
      is_enriched: false,
    }).select().single()

    if (error || !event) { console.error('[AI create_event]', error); return }

    // Resolve member names → ids and insert event_members
    const memberIds = (action.members ?? [])
      .map(name => family.find(f => f.name.toLowerCase() === name.toLowerCase())?.id)
      .filter((id): id is string => !!id)

    if (memberIds.length > 0) {
      await supabase.from('event_members').insert(
        memberIds.map((id, i) => ({ event_id: event.id, family_member_id: id, role: i === 0 ? 'primary' : 'attendee' }))
      )
    }

    // Fire-and-forget: create in Google Calendar, then enrich, then analyze conflicts + prep
    supabase.functions.invoke('create-google-event', { body: { event_id: event.id } })
      .then(() => supabase.functions.invoke('enrich-event', { body: { event_id: event.id } }))
      .then(() => supabase.functions.invoke('analyze-conflicts', {}))
      .then(() => supabase.functions.invoke('analyze-prep', {}))
      .catch(console.error)
    qc.invalidateQueries({ queryKey: ['events'] })
  }

  if (action.action === 'delete_event') {
    // Remove from Google Calendar before marking cancelled
    await supabase.functions.invoke('delete-google-event', { body: { event_id: action.id } })
      .catch(() => { /* best-effort */ })
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', action.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }

  if (action.action === 'update_event') {
    const updates: Record<string, string> = {}
    if (action.changes.title) updates.title = action.changes.title
    if (action.changes.start) updates.start_time = action.changes.start
    if (action.changes.end) updates.end_time = action.changes.end
    if (action.changes.location) updates.location_name = action.changes.location
    await supabase.from('events').update(updates).eq('id', action.id)
    qc.invalidateQueries({ queryKey: ['events'] })
    // Push changes to Google Calendar
    supabase.functions.invoke('push-to-google', { body: { event_id: action.id } })
      .catch(() => { /* best-effort */ })
  }
}

/* ── Contextual suggestions ─────────────────────────────────── */

const SUGGESTIONS: Record<string, string[]> = {
  home: ["What's next up today?", "Add an event tonight", "Any conflicts this week?"],
  calendar: ["What does tomorrow look like?", "Add a new appointment", "Who's busiest this week?"],
  briefing: ["Summarize today for me", "Add an event", "Any prep needed today?"],
}
