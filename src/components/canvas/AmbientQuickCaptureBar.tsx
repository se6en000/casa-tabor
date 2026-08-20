import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Mic,
  CalendarDays,
  Users,
  MapPin,
  CheckCircle2,
  Maximize2,
  X,
  Loader2,
  Bell,
  ArrowUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { parseNaturalLanguageCapture } from '../../utils/naturalLanguageCapture'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { supabase } from '../../lib/supabase'
import { triggerGoogleEventSync } from '../../lib/eventMutations'
import { cn } from '../../utils/cn'
import { IconButton } from '../ui'

interface Props {
  className?: string
}

export default function AmbientQuickCaptureBar({ className }: Props) {
  const qc = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { openQuickCreate } = useAppStore()

  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMicHoldingRef = useRef(false)
  const isHoldingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-grow textarea smoothly as text wraps across multiple lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollH = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${Math.min(Math.max(26, scrollH), 96)}px`
    }
  }, [query])

  // Voice Dictation hook (dual-path: Deepgram bridge on kiosk Pi + WebSpeech API on browser)
  const { listening, start: startDictation, stop: stopDictation, toggle: toggleDictation, resetBuffer: resetDictationBuffer } = useFieldDictation({
    onText: (text) => {
      setQuery(text)
    },
  })

  // Parse natural language in real-time as user types or speaks
  const parsed = useMemo(() => {
    if (!query.trim()) return null
    return parseNaturalLanguageCapture(query, {
      familyMembers,
      now: new Date(),
    })
  }, [query, familyMembers])

  const hasTokens = Boolean(
    parsed &&
      (parsed.detectedDateLabel ||
        parsed.detectedTimeLabel ||
        parsed.matchedMembers.length > 0 ||
        parsed.matchedPlace ||
        parsed.intent === 'reminder')
  )

  const handleQuickAdd = async () => {
    if (!query.trim() || !parsed || isSaving) return

    setIsSaving(true)
    setSaveFeedback(null)

    try {
      const start = parsed.startDate || new Date()
      const end = parsed.endDate || new Date(start.getTime() + 60 * 60 * 1000)

      const { data: inserted, error } = await supabase
        .from('events')
        .insert({
          title: parsed.title,
          description: null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          all_day: parsed.allDay,
          status: 'confirmed',
          event_type: parsed.intent === 'reminder' ? 'reminder' : 'event',
          location_name: parsed.matchedPlace,
          record_kind: 'single',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        throw error
      }

      if (inserted && parsed.matchedMembers.length > 0) {
        const memberRows = parsed.matchedMembers
          .map((m, idx) => {
            const fMember = familyMembers.find(
              (f) => f.name.toLowerCase() === m.name.toLowerCase()
            )
            if (!fMember) return null
            return {
              event_id: inserted.id,
              family_member_id: fMember.id,
              role: idx === 0 ? 'primary' : 'attendee',
              rsvp_status: 'accepted',
            }
          })
          .filter(
            (
              row
            ): row is {
              event_id: string
              family_member_id: string
              role: string
              rsvp_status: string
            } => row !== null
          )

        if (memberRows.length > 0) {
          await supabase.from('event_members').insert(memberRows)
        }
      }

      if (inserted?.id) {
        triggerGoogleEventSync(supabase, inserted.id)
      }

      await qc.invalidateQueries({ queryKey: ['events'] })
      navigator.vibrate?.(15)

      const feedbackMsg =
        parsed.intent === 'reminder'
          ? `✓ Reminder "${parsed.title}" saved`
          : `✓ Event "${parsed.title}" scheduled`

      // Immediately clear and reset to quiet ambient state
      setQuery('')
      setIsFocused(false)
      stopDictation()
      resetDictationBuffer()
      if (textareaRef.current) {
        textareaRef.current.style.height = '28px'
        textareaRef.current.blur()
      }

      setSaveFeedback(feedbackMsg)

      setTimeout(() => {
        setSaveFeedback(null)
      }, 2400)
    } catch (err: any) {
      setSaveFeedback(`Error saving: ${err.message || 'Check connection'}`)
      setTimeout(() => {
        setSaveFeedback(null)
      }, 3500)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenFullEditor = () => {
    openQuickCreate(parsed?.startDate || undefined, query)
    setQuery('')
    setIsFocused(false)
    stopDictation()
    resetDictationBuffer()
    if (textareaRef.current) {
      textareaRef.current.style.height = '28px'
      textareaRef.current.blur()
    }
  }

  return (
    <div
      className={cn(
        'w-full rounded-2xl transition-all duration-300',
        'border shadow-2xs',
        listening
          ? 'bg-gradient-to-r from-casa-surface to-amber-500/[0.12] border-casa-gold ring-2 ring-casa-gold/35 shadow-[0_0_20px_rgba(201,169,110,0.25)]'
          : isFocused
          ? 'bg-gradient-to-r from-casa-surface to-amber-500/[0.08] border-casa-gold/60 ring-2 ring-casa-gold/20 shadow-sm'
          : 'bg-gradient-to-r from-casa-surface to-amber-500/[0.08] border-casa-gold/35 hover:border-casa-gold/60',
        className
      )}
    >
      <div className="px-3.5 py-2 flex flex-col gap-2">
        {/* Main Input Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Left Jewel Button: Tap to toggle listening, Hold to speak until release */}
            <div className="relative shrink-0 flex items-center justify-center">
              <AnimatePresence>
                {listening && (
                  <>
                    <motion.span
                      initial={{ scale: 0.9, opacity: 0.8 }}
                      animate={{ scale: 1.45, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-xl bg-amber-400/40 pointer-events-none"
                    />
                    <motion.span
                      initial={{ scale: 0.9, opacity: 0.6 }}
                      animate={{ scale: 1.25, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                      className="absolute inset-0 rounded-xl bg-casa-gold/30 pointer-events-none"
                    />
                  </>
                )}
              </AnimatePresence>

              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={listening ? 'Listening... click or release to stop' : 'Tap to dictate or hold to speak'}
                icon={
                  listening ? (
                    <div className="flex items-center justify-center gap-[2.5px] h-4 px-0.5">
                      <motion.span
                        animate={{ height: ['4px', '14px', '7px', '16px', '4px'] }}
                        transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-[2px] rounded-full bg-casa-navy"
                      />
                      <motion.span
                        animate={{ height: ['11px', '5px', '17px', '9px', '11px'] }}
                        transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
                        className="w-[2px] rounded-full bg-casa-navy"
                      />
                      <motion.span
                        animate={{ height: ['6px', '16px', '4px', '13px', '6px'] }}
                        transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                        className="w-[2px] rounded-full bg-casa-navy"
                      />
                      <motion.span
                        animate={{ height: ['14px', '7px', '13px', '5px', '14px'] }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                        className="w-[2px] rounded-full bg-casa-navy"
                      />
                    </div>
                  ) : (
                    <Mic size={17} className="text-amber-800 transition-transform group-hover:scale-105" />
                  )
                }
                onPointerDown={() => {
                  isHoldingTimerRef.current = setTimeout(() => {
                    isMicHoldingRef.current = true
                    navigator.vibrate?.(15)
                    void startDictation(query)
                  }, 500)
                }}
                onPointerUp={() => {
                  if (isHoldingTimerRef.current) {
                    clearTimeout(isHoldingTimerRef.current)
                    isHoldingTimerRef.current = null
                  }
                  if (isMicHoldingRef.current) {
                    isMicHoldingRef.current = false
                    stopDictation()
                  }
                }}
                onPointerLeave={() => {
                  if (isHoldingTimerRef.current) {
                    clearTimeout(isHoldingTimerRef.current)
                    isHoldingTimerRef.current = null
                  }
                  if (isMicHoldingRef.current) {
                    isMicHoldingRef.current = false
                    stopDictation()
                  }
                }}
                onClick={() => {
                  if (!isMicHoldingRef.current) {
                    toggleDictation(query)
                  }
                }}
                className={cn(
                  'w-9 h-9 min-h-0 rounded-xl flex items-center justify-center font-bold shadow-2xs border shrink-0 transition-all select-none active:scale-95 cursor-pointer group',
                  listening
                    ? 'bg-gradient-to-tr from-amber-500 to-casa-gold text-casa-navy border-casa-gold shadow-[0_0_16px_rgba(201,169,110,0.55)] ring-2 ring-casa-gold/60'
                    : 'bg-casa-gold/20 text-casa-navy border-casa-gold/30 hover:bg-casa-gold/30 hover:border-casa-gold/60'
                )}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* Editorial Eyebrow Label matching Tonight's Kitchen */}
              <div className="flex items-center gap-1.5 mb-0.5 flex-nowrap overflow-hidden">
                <span className="font-sans text-3xs sm:text-2xs font-bold uppercase tracking-wider text-amber-900 whitespace-nowrap shrink-0">
                  ✦ SMART CAPTURE
                </span>
                <span className="text-casa-muted/60 text-3xs shrink-0">·</span>
                <span className="text-3xs sm:text-2xs font-medium text-casa-text-secondary truncate shrink-0">
                  {listening ? 'Listening live...' : 'Calendar & To-Do'}
                </span>
              </div>

              {/* Display Headline Input */}
              <div className="relative flex items-center min-w-0">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleQuickAdd()
                    } else if (e.key === 'Escape') {
                      setQuery('')
                      textareaRef.current?.blur()
                    }
                  }}
                  placeholder={listening ? 'Listening... speak naturally...' : 'What\'s on your mind? "Tennis Friday 9am"...'}
                  className="w-full bg-transparent font-sans text-body-lg sm:text-body-base font-medium text-casa-navy placeholder:font-normal placeholder:text-casa-muted/70 focus:outline-hidden p-0 pr-6 resize-none leading-snug transition-all scrollbar-hide overflow-y-auto block"
                  disabled={isSaving}
                />

                {query.length > 0 && (
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      if (textareaRef.current) {
                        textareaRef.current.style.height = '28px'
                      }
                    }}
                    aria-label="Clear input"
                    icon={<X size={14} className="text-casa-muted hover:text-casa-navy" />}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Expand into Full Modal */}
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenFullEditor}
              aria-label="Open in full editor"
              title="Open in full editor"
              icon={<Maximize2 size={13} className="text-casa-muted hover:text-casa-navy transition-colors" />}
              className="w-8 h-8 min-h-0 rounded-full hidden sm:flex items-center justify-center shrink-0 hover:bg-casa-sand/60"
            />

            {/* Circular Send Arrow / Commit Button */}
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleQuickAdd}
              disabled={!query.trim() || isSaving}
              aria-label="Add entry to schedule"
              icon={
                isSaving ? (
                  <Loader2 size={13} className="animate-spin text-casa-muted" />
                ) : (
                  <ArrowUp size={14} strokeWidth={2.4} />
                )
              }
              className={cn(
                'w-8 h-8 min-h-0 rounded-full flex items-center justify-center transition-all shrink-0 border',
                query.trim().length > 0
                  ? 'bg-casa-navy text-white hover:bg-casa-navy-dark hover:text-casa-gold border-casa-navy shadow-sm scale-105 cursor-pointer'
                  : 'bg-casa-sand/60 text-casa-muted/70 border-casa-border/50 cursor-default'
              )}
            />
          </div>
        </div>

        {/* Live Parsed Tokens Banner */}
        <AnimatePresence>
          {hasTokens && parsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-casa-border/40 text-caption font-medium overflow-hidden"
            >
              <span className="text-3xs uppercase font-bold tracking-wider text-casa-muted/80 mr-1">
                Detected:
              </span>

              {/* Intent Badge */}
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold shadow-2xs',
                  parsed.intent === 'reminder'
                    ? 'bg-amber-500/15 text-amber-800 border border-amber-500/30'
                    : 'bg-casa-navy/10 text-casa-navy border border-casa-navy/20'
                )}
              >
                {parsed.intent === 'reminder' ? (
                  <Bell size={12} className="text-amber-700" />
                ) : (
                  <CalendarDays size={12} className="text-casa-navy" />
                )}
                <span>{parsed.intent === 'reminder' ? 'Reminder' : 'Event'}</span>
              </span>

              {/* Date & Time Badge */}
              {(parsed.detectedDateLabel || parsed.detectedTimeLabel) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-casa-surface-subtle border border-casa-border/60 text-casa-text text-caption font-semibold shadow-2xs">
                  <CalendarDays size={12} className="text-casa-gold" />
                  <span>
                    {parsed.detectedDateLabel || 'Today'}
                    {parsed.detectedTimeLabel ? ` @ ${parsed.detectedTimeLabel}` : ' · All Day'}
                  </span>
                </span>
              )}

              {/* Family Members Badges */}
              {parsed.matchedMembers.map((m, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-surface-subtle border border-casa-border/60 text-casa-text text-caption font-semibold shadow-2xs"
                >
                  <Users size={12} className="text-casa-muted" />
                  <span>{m.name}</span>
                </span>
              ))}

              {/* Location Badge */}
              {parsed.matchedPlace && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-surface-subtle border border-casa-border/60 text-casa-text text-caption font-semibold shadow-2xs">
                  <MapPin size={12} className="text-casa-muted" />
                  <span>{parsed.matchedPlace}</span>
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feedback confirmation banner */}
        <AnimatePresence>
          {saveFeedback && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-casa-gold/40 text-casa-navy text-caption font-bold shadow-2xs overflow-hidden"
            >
              <CheckCircle2 size={14} className="text-casa-gold shrink-0" />
              <span className="truncate">{saveFeedback}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
