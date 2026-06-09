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
import BounceScroll from '../shared/BounceScroll'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const CONFIRM_PHRASES = /\b(yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)\b/i
const CANCEL_PHRASES  = /\b(no|nope|cancel|don't|do not|stop|abort|never mind|nevermind|undo)\b/i

/** Whisper VAD hook — silence-detection recording, full-sentence transcription */
const WHISPER_URL = 'http://127.0.0.1:8766/transcribe'
const SILENCE_THRESHOLD = 12   // RMS below this = silence (0–255 scale)
const SILENCE_DURATION_MS = 1000  // 1s of silence triggers transcription

type VoicePhase = 'idle' | 'listening' | 'processing'

function useSpeechInput({
  onTranscript,
  onFinalTranscript,
  onDismiss,
  onConfirm,
  onCancel,
  hasPendingAction,
}: {
  onTranscript: (text: string) => void
  onFinalTranscript: (text: string) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
  hasPendingAction: boolean
}) {
  const streamRef    = useRef<MediaStream | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const rafRef       = useRef<number>(0)
  const silenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef    = useRef(false)  // true = voice mode on (even while processing)

  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [volume, setVolume] = useState(0)  // 0–100 for waveform bars
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const clearSilence = () => { if (silenceRef.current) clearTimeout(silenceRef.current) }

  const startRecording = useCallback((stream: MediaStream) => {
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.start()
    recorderRef.current = recorder
  }, [])

  const transcribe = useCallback(async (stream: MediaStream) => {
    if (!activeRef.current) return
    // Stop current recording and grab blob
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.stop()
      await new Promise<void>(res => { recorder.onstop = () => res() })
    }
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []

    if (blob.size < 3000) {
      // Too short / silence — just restart listening
      if (activeRef.current) { setPhase('listening'); startRecording(stream) }
      return
    }

    setPhase('processing')
    try {
      const res = await fetch(WHISPER_URL, { method: 'POST', body: blob, headers: { 'Content-Type': 'audio/webm' } })
      const { transcript } = await res.json()
      if (transcript?.trim()) {
        onTranscript(transcript.trim())
        if (DISMISS_PHRASES.test(transcript)) { onDismiss(); return }
        const isShort = transcript.trim().split(/\s+/).length <= 5
        if (isShort && hasPendingAction && CONFIRM_PHRASES.test(transcript)) { onConfirm(); onTranscript(''); }
        else if (isShort && hasPendingAction && CANCEL_PHRASES.test(transcript)) { onCancel(); onTranscript(''); }
        else { onFinalTranscript(transcript.trim()); onFinalTranscript('__SEND__') }
      }
    } catch (e) {
      console.warn('[Whisper] transcription failed', e)
    }

    // Loop back to listening
    if (activeRef.current) { setPhase('listening'); startRecording(stream) }
  }, [startRecording, onTranscript, onFinalTranscript, onDismiss, onConfirm, onCancel, hasPendingAction])

  const stop = useCallback(() => {
    activeRef.current = false
    clearSilence()
    cancelAnimationFrame(rafRef.current)
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    analyserRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    setPhase('idle')
    setVolume(0)
  }, [])

  const start = useCallback(async () => {
    if (!supported || activeRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      activeRef.current = true
      setPhase('listening')

      // Set up Web Audio analyser for volume + silence detection
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      const buf = new Uint8Array(analyser.frequencyBinCount)

      startRecording(stream)

      let silenceStart: number | null = null
      const tick = () => {
        if (!activeRef.current) return
        analyser.getByteFrequencyData(buf)
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
        setVolume(Math.min(100, (rms / 128) * 100))

        if (rms < SILENCE_THRESHOLD) {
          if (silenceStart === null) silenceStart = Date.now()
          else if (Date.now() - silenceStart >= SILENCE_DURATION_MS) {
            silenceStart = null
            // Only trigger if we've recorded something meaningful
            if (chunksRef.current.length > 0) {
              transcribe(stream)
              return  // don't re-schedule RAF — transcribe loops back
            }
          }
        } else {
          silenceStart = null
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      stream.getAudioTracks()[0].addEventListener('ended', stop)
    } catch (e) {
      console.warn('[Whisper] mic access failed', e)
      activeRef.current = false
      setPhase('idle')
    }
  }, [supported, startRecording, transcribe, stop])

  const toggle = useCallback(() => {
    if (activeRef.current) stop()
    else start()
  }, [start, stop])

  return { phase, volume, supported, start, stop, toggle, listening: phase !== 'idle' }
}

/* ── Voice Mode Overlay ─────────────────────────────────────── */
function VoiceOverlay({ phase, volume, onStop }: { phase: 'listening' | 'processing', volume: number, onStop: () => void }) {
  const bars = [0.6, 0.8, 1.0, 0.8, 0.6, 0.9, 0.7, 1.0, 0.5, 0.8]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="absolute inset-x-0 bottom-0 z-10 mx-3 mb-3 rounded-2xl bg-casa-navy overflow-hidden"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}
    >
      <div className="flex flex-col items-center gap-3 px-6 py-5">
        {/* Waveform / spinner */}
        <div className="flex items-center justify-center gap-1 h-10">
          {phase === 'listening' ? (
            bars.map((mult, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-casa-gold"
                animate={{ height: Math.max(4, (volume / 100) * 36 * mult + 4) }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
            ))
          ) : (
            <Loader2 size={28} className="animate-spin text-casa-gold" />
          )}
        </div>

        {/* Label */}
        <p className="text-white text-sm font-medium tracking-wide">
          {phase === 'listening' ? 'Listening…' : 'Processing…'}
        </p>
        {phase === 'listening' && (
          <p className="text-white/40 text-xs -mt-1">Speak freely — pausing sends</p>
        )}

        {/* Stop button */}
        <button
          type="button"
          onClick={onStop}
          className="mt-1 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-colors"
        >
          <MicOff size={12} /> Stop listening
        </button>
      </div>
    </motion.div>
  )
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

  // True when the latest assistant message has a pending tool action awaiting confirmation
  const hasPendingToolAction = messages.some(m => m.toolAction?.status === 'pending')

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
    hasPendingAction: hasPendingToolAction,
  })

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 400)
    } else {
      speech.stop()
      reset()
      setInput('')
      interimRef.current = ''
      setAttachedImage(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause voice while AI is thinking; don't auto-resume (user taps mic intentionally)
  useEffect(() => {
    if (loading) speech.stop()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (e.key === 'Enter' && !e.shiftKey) {
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
            <BounceScroll className="flex-1 min-h-0" innerClassName="px-4 py-4 space-y-3">
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
            </BounceScroll>

            {/* Input */}
            <div className="relative px-4 pb-5 pt-3 border-t border-casa-border">
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
                        ? 'bg-casa-navy text-casa-gold'
                        : 'bg-casa-divider text-casa-muted hover:text-casa-gold'
                    )}
                  >
                    <Mic size={14} />
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
                  ? 'Tap 🎙 to start voice · pause to send'
                  : 'Tap ➤ to send · 📎 gallery · 📷 camera'}
              </p>

              {/* Voice mode overlay */}
              <AnimatePresence>
                {(speech.phase === 'listening' || speech.phase === 'processing') && (
                  <VoiceOverlay phase={speech.phase} volume={speech.volume} onStop={speech.stop} />
                )}
              </AnimatePresence>
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
        {msg.content !== '(see attached image)' && msg.content && (
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
