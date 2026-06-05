import { useState, useRef, useEffect, useCallback } from 'react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, MicOff, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { useAIAssistant, type AIMessage } from '../../hooks/useAIAssistant'
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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

      if (interim) onTranscript(interim)

      if (finalText) {
        if (DISMISS_PHRASES.test(finalText)) {
          stop()
          onDismiss()
          return
        }

        const isShortPhrase = finalText.trim().split(/\s+/).length <= 5
        if (isShortPhrase && CONFIRM_PHRASES.test(finalText)) {
          onConfirm()
          onTranscript('')
          return
        }
        if (isShortPhrase && CANCEL_PHRASES.test(finalText)) {
          onCancel()
          onTranscript('')
          return
        }

        clearSilenceTimer()
        onFinalTranscript(finalText)

        silenceTimerRef.current = setTimeout(() => {
          onFinalTranscript('__SEND__')
        }, 1200)
      }
    }

    rec.onend = () => {
      if (listeningRef.current) {
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
  anchor?: { right: number; top: number }
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
}

export default function AIChatDrawer({ open, onClose, anchor, page, events, family, homeCity }: Props) {
  const [input, setInput] = useState('')
  const interimRef = useRef('')
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { messages, loading, send, reset, session, sessionLoading, startFresh, updateMessageToolStatus } = useAIAssistant({ page, events, family, homeCity })

  const pendingConfirmRef = useRef<(() => void) | null>(null)
  const pendingCancelRef  = useRef<(() => void) | null>(null)

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
      send('Thank you, talk soon!').catch(() => {})
      setTimeout(onClose, 800)
    },
    onConfirm: () => { pendingConfirmRef.current?.() },
    onCancel:  () => { pendingCancelRef.current?.() },
  })

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        textareaRef.current?.focus()
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

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  const readImageFile = useCallback((file: File | Blob): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type || 'image/png' })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (blob) setAttachedImage(await readImageFile(blob))
    }
  }, [readImageFile])

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
    const isMobile = 'ontouchstart' in window
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasSession = !sessionLoading && !!session && session.messages.length > 0

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] max-sm:bg-black/40 sm:bg-transparent"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={cn(
              'fixed z-[70] bg-casa-surface flex flex-col transition-shadow',
              'max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:w-full max-sm:shadow-modal',
              'sm:rounded-2xl sm:w-[380px] sm:shadow-[0_8px_40px_rgba(0,0,0,0.22)] sm:border sm:border-casa-border',
              loading && 'ai-thinking',
            )}
            style={{
              ...(window.innerWidth < 640 ? {
                maxHeight: '88vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
              } : {
                maxHeight: '70vh',
                right: anchor ? Math.max(8, anchor.right) : 16,
                top: anchor ? anchor.top + 6 : 56,
              })
            }}
            onClick={e => e.stopPropagation()}
            onPaste={handlePaste}
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
              <div className="w-9 h-1 bg-casa-divider rounded-full" />
            </div>

            {/* Header */}
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
              <div className="flex items-center gap-1">
                {hasSession && (
                  <button
                    type="button"
                    onClick={startFresh}
                    title="New conversation"
                    className="w-7 h-7 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {/* Session resume banner */}
              {hasSession && messages.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-casa-gold/8 border border-casa-gold/20 text-caption text-casa-muted">
                  <Sparkles size={11} className="text-casa-gold flex-shrink-0" />
                  <span>Resuming previous conversation</span>
                  <button
                    type="button"
                    onClick={startFresh}
                    className="ml-auto text-casa-gold font-semibold hover:underline"
                  >
                    New chat
                  </button>
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Sparkles size={28} className="text-casa-gold opacity-60" />
                  <p className="text-body-sm font-semibold text-casa-navy">What can I help with?</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {SUGGESTIONS[page]?.map(s => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); textareaRef.current?.focus() }}
                        className="px-3 py-1.5 rounded-full border border-casa-border text-caption text-casa-muted hover:bg-casa-bg hover:text-casa-navy transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isLatest={idx === messages.length - 1}
                  onConfirmToolAction={async (messageId, tool, args) => {
                    updateMessageToolStatus(messageId, 'loading')
                    try {
                      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
                        body: { tool, args },
                      })
                      if (error) throw error
                      if (data?.success === false) throw new Error(data.error ?? 'Action failed')
                      updateMessageToolStatus(messageId, 'done', { resultEventId: data?.event_id })
                      qc.invalidateQueries({ queryKey: ['events'] })
                      qc.invalidateQueries({ queryKey: ['grocery'] })
                    } catch (err) {
                      updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
                    }
                  }}
                  onCancelToolAction={(messageId) => updateMessageToolStatus(messageId, 'cancelled')}
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
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image from library"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Paperclip size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  title="Take a photo"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Camera size={16} />
                </button>

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

function MessageBubble({ msg, isLatest, onConfirmToolAction, onCancelToolAction, registerPendingConfirm, registerPendingCancel }: {
  msg: AIMessage
  isLatest: boolean
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  registerPendingConfirm: (fn: () => void) => void
  registerPendingCancel:  (fn: () => void) => void
}) {
  const isUser = msg.role === 'user'
  const ta = msg.toolAction
  const hasPendingAction = !!ta && ta.status === 'pending'

  const doConfirm = useCallback(() => {
    if (!ta) return
    onConfirmToolAction(msg.id, ta.tool, ta.args)
  }, [msg.id, ta, onConfirmToolAction])

  const doCancel = useCallback(() => {
    onCancelToolAction(msg.id)
  }, [msg.id, onCancelToolAction])

  useEffect(() => {
    if (isLatest && hasPendingAction) {
      registerPendingConfirm(doConfirm)
      registerPendingCancel(doCancel)
    }
  }, [isLatest, hasPendingAction, doConfirm, doCancel]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-body-sm leading-relaxed',
        isUser
          ? 'bg-casa-navy text-white rounded-br-sm'
          : 'bg-casa-bg border border-casa-border text-casa-navy rounded-bl-sm'
      )}>
        {msg.imageDataUrl && (
          <img src={msg.imageDataUrl} alt="Attached" className="max-h-40 w-auto rounded-lg mb-2 object-cover" />
        )}
        {msg.content !== '(see attached image)' && (
          <p dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        )}

        {/* Tool action confirmation card */}
        {ta && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {ta.status === 'done' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                  <Check size={13} />
                  {ta.tool === 'create_event' ? 'Created & added to calendar ✓'
                    : ta.tool === 'update_event' ? 'Updated ✓'
                    : ta.tool === 'delete_event' ? 'Deleted ✓'
                    : ta.tool === 'add_grocery_items' ? 'Added to grocery list ✓'
                    : 'Done ✓'}
                </div>
                {ta.tool === 'create_event' && ta.resultEventId && (
                  <p className="text-[10px] text-casa-muted">Visible on your calendar now</p>
                )}
              </div>
            ) : ta.status === 'cancelled' ? (
              <div className="flex items-center gap-1.5 text-casa-muted text-caption">
                <XCircle size={13} /> Cancelled
              </div>
            ) : ta.status === 'error' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-red-600 text-caption font-semibold">
                  <XCircle size={13} /> Failed
                </div>
                {ta.errorMsg && <p className="text-[10px] text-red-500">{ta.errorMsg}</p>}
                <button
                  type="button"
                  onClick={doConfirm}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-button bg-red-600 text-white text-caption font-semibold hover:brightness-110 transition-all"
                >
                  <Loader2 size={12} /> Retry
                </button>
              </div>
            ) : (
              <>
                <ToolActionPreview tool={ta.tool} args={ta.args} />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={ta.status === 'loading'}
                    onClick={doConfirm}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button bg-casa-gold text-white text-caption font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {ta.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {ta.status === 'loading' ? 'Working…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={doCancel}
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

function ToolActionPreview({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  if (tool === 'create_event') {
    const start = new Date(args.start as string)
    const end = new Date(args.end as string)
    return (
      <div className="space-y-1 text-caption text-casa-muted">
        <p className="font-semibold text-casa-navy text-body-sm">{args.title as string}</p>
        <p>{format(start, 'EEE, MMM d · h:mm a')} – {format(end, 'h:mm a')}</p>
        {!!args.location && <p>📍 {String(args.location)}</p>}
        {(args.members as string[])?.length > 0 && <p>👤 {(args.members as string[]).join(', ')}</p>}
      </div>
    )
  }
  if (tool === 'update_event') {
    const changes: string[] = []
    if (args.title) changes.push(`title → "${args.title}"`)
    if (args.start) changes.push(`start → ${format(new Date(args.start as string), 'MMM d h:mm a')}`)
    if (args.end) changes.push(`end → ${format(new Date(args.end as string), 'h:mm a')}`)
    if (args.location) changes.push(`location → "${args.location}"`)
    if (args.notes) changes.push(`notes → "${args.notes}"`)
    if ((args.members_add as string[])?.length) changes.push(`add: ${(args.members_add as string[]).join(', ')}`)
    if ((args.members_remove as string[])?.length) changes.push(`remove: ${(args.members_remove as string[]).join(', ')}`)
    return <p className="text-caption text-casa-muted">{changes.join(' · ')}</p>
  }
  if (tool === 'delete_event') {
    return <p className="text-caption text-red-600 font-semibold">Delete "{args.title as string}"?</p>
  }
  if (tool === 'add_grocery_items') {
    const items = args.items as { name: string; quantity?: string }[]
    return (
      <div className="space-y-0.5 text-caption text-casa-muted">
        {items.map((i, idx) => (
          <p key={idx}>+ {i.name}{i.quantity ? ` (${i.quantity})` : ''}</p>
        ))}
      </div>
    )
  }
  if (tool === 'check_grocery_item') {
    return <p className="text-caption text-casa-muted">Mark item as {args.checked ? 'done ✓' : 'undone'}</p>
  }
  if (tool === 'clear_checked_grocery_items') {
    return <p className="text-caption text-casa-muted">Clear all checked grocery items</p>
  }
  return <p className="text-caption text-casa-muted">{tool}</p>
}

/* ── Contextual suggestions ─────────────────────────────────── */

const SUGGESTIONS: Record<string, string[]> = {
  home: ["What's next up today?", "Add an event tonight", "Any conflicts this week?"],
  calendar: ["What does tomorrow look like?", "Add a new appointment", "Who's busiest this week?"],
  briefing: ["Summarize today for me", "Add an event", "Any prep needed today?"],
  grocery: ["Add milk and eggs", "What's on the list?", "Clear checked items"],
}
