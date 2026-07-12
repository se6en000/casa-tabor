import { useState, useRef, useEffect, useCallback } from 'react'
import { normalizeConfidence as normalizeConfidencePure } from '../lib/sttConfidence.mjs'
import {
  normalizeBridgeTurnMessage,
  reconcileTranscriptRevision,
  STT_TURN_PROTOCOL,
} from '../lib/sttTurnProtocol.mjs'
import { isIncompleteVoiceFragment } from '../lib/voiceTurnTaking.mjs'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const CONFIRM_PHRASES = /\b(yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)\b/i
const CANCEL_PHRASES  = /\b(no|nope|cancel|don't|do not|stop|abort|never mind|nevermind|undo)\b/i

/** DeepGram STT bridge — HTTP for probe/display, WS for streaming */
const BRIDGE    = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
export const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

export type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing'
export type STTMode = 'unknown' | 'bridge' | 'webspeech'
export type VoiceTranscriptRevision = {
  committed: string
  interim: string
  isFinal: boolean
}

const SILENCE_MS = 2500
const CONNECT_TIMEOUT_MS = 5000
const TURN_COMMIT_GRACE_MS = 700
const MANUAL_FINALIZE_TIMEOUT_MS = 1800

function createUtteranceId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** Quick probe — resolves true if bridge is reachable within 800ms */
async function probeBridge(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 800)
    const res = await fetch(`${BRIDGE}/status`, { signal: ctrl.signal })
    clearTimeout(tid)
    return res.ok
  } catch {
    return false
  }
}

export function useSpeechInput({
  onInterim,
  onFinalTranscript,
  onDismiss,
  onConfirm,
  onCancel,
  onIncomplete,
  hasPendingAction,
  onTrace,
}: {
  onInterim: (text: string, revision?: VoiceTranscriptRevision) => void
  onFinalTranscript: (text: string, meta?: { confidence?: number | null }) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
  onIncomplete?: (text: string) => void
  hasPendingAction: boolean
  onTrace?: (event: string, payload?: Record<string, unknown>) => void
}) {
  const wsRef              = useRef<WebSocket | null>(null)
  const activeRef          = useRef(false)
  const suppressRef        = useRef(false)
  const modeRef            = useRef<STTMode>('unknown')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef     = useRef<any>(null)
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInterimRef     = useRef('')
  const lastInterimTimeRef = useRef(0)
  const lastConfidenceRef  = useRef<number | null>(null)
  const connectStartRef    = useRef(0)
  const listeningStartRef  = useRef(0)
  const firstInterimRef    = useRef(false)
  const utteranceIdRef     = useRef('')
  const pendingFragmentRef = useRef('')
  const pendingFragmentUtteranceIdRef = useRef('')
  const fragmentTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnCandidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnCandidateAtRef = useRef(0)
  const speechStartedAtRef = useRef(0)
  const finalizingRef = useRef(false)
  const lastTranscriptAtRef = useRef(0)
  const startWebSpeechRef = useRef<() => void>(() => {})
  const startBridgeRef = useRef<() => void>(() => {})
  const [phase, setPhase]  = useState<VoicePhase>('idle')
  const phaseRef           = useRef<VoicePhase>('idle')
  const setPhaseSync = (p: VoicePhase) => { phaseRef.current = p; setPhase(p) }
  const [volume, setVolume] = useState(0)
  const [bridgeDown, setBridgeDown] = useState(false)
  const supported = !IS_SAFE_MODE

  // ── Stable callback refs — always current, never stale inside setInterval ──
  // This is the core pattern for voice agents: the polling loop runs continuously
  // but React re-creates callbacks whenever state changes (e.g. hasPendingAction).
  // Using refs ensures the poll always calls the latest version.
  const onInterimRef       = useRef(onInterim)
  const onFinalRef         = useRef(onFinalTranscript)
  const onDismissRef       = useRef(onDismiss)
  const onConfirmRef       = useRef(onConfirm)
  const onCancelRef        = useRef(onCancel)
  const onIncompleteRef    = useRef(onIncomplete)
  const onTraceRef         = useRef(onTrace)
  const hasPendingRef      = useRef(hasPendingAction)
  useEffect(() => { onInterimRef.current  = onInterim },        [onInterim])
  useEffect(() => { onFinalRef.current    = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onDismissRef.current  = onDismiss },         [onDismiss])
  useEffect(() => { onConfirmRef.current  = onConfirm },         [onConfirm])
  useEffect(() => { onCancelRef.current   = onCancel },          [onCancel])
  useEffect(() => { onIncompleteRef.current = onIncomplete },     [onIncomplete])
  useEffect(() => { onTraceRef.current    = onTrace },           [onTrace])
  useEffect(() => { hasPendingRef.current = hasPendingAction },  [hasPendingAction])

  const normalizeConfidence = useCallback((raw: unknown): number | null => {
    return normalizeConfidencePure(raw)
  }, [])

  // Stable ref — avoids recreating startWebSpeech on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null
  ).current

  const stopWS = () => {
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }
  const stopSilenceTimer = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
  const stopFragmentTimer = () => { if (fragmentTimerRef.current) clearTimeout(fragmentTimerRef.current); fragmentTimerRef.current = null }
  const stopTurnCandidateTimer = () => {
    if (turnCandidateTimerRef.current) clearTimeout(turnCandidateTimerRef.current)
    turnCandidateTimerRef.current = null
    turnCandidateAtRef.current = 0
  }
  const stopManualFinalizeTimer = () => {
    if (manualFinalizeTimerRef.current) clearTimeout(manualFinalizeTimerRef.current)
    manualFinalizeTimerRef.current = null
    finalizingRef.current = false
  }
  const scheduleFragmentTimeout = () => {
    stopFragmentTimer()
    fragmentTimerRef.current = setTimeout(() => {
      const abandoned = pendingFragmentRef.current
      const abandonedUtteranceId = pendingFragmentUtteranceIdRef.current
      pendingFragmentRef.current = ''
      pendingFragmentUtteranceIdRef.current = ''
      fragmentTimerRef.current = null
      const nextUtteranceId = createUtteranceId()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'discard',
          utterance_id: abandonedUtteranceId,
          next_utterance_id: nextUtteranceId,
        }))
      }
      utteranceIdRef.current = nextUtteranceId
      listeningStartRef.current = Date.now()
      speechStartedAtRef.current = 0
      onInterimRef.current('')
      onTraceRef.current?.('asr_fragment_discarded', {
        utterance_id: abandonedUtteranceId,
        reason: 'continuation_timeout',
        word_count: abandoned ? abandoned.split(/\s+/).length : 0,
      })
      if (abandoned) onIncompleteRef.current?.(abandoned)
    }, 4500)
  }
  // No deps — uses only refs, so triggerFinal/startBridge are created once and never stale
  const handleFinalTranscript = useCallback((transcript: string) => {
    if (!transcript.trim()) return
    if (suppressRef.current) return
    if (DISMISS_PHRASES.test(transcript)) {
      activeRef.current = false  // prevent poll-scheduled restart from re-firing
      onDismissRef.current()
      return
    }
    const isShort = transcript.trim().split(/\s+/).length <= 5
    if (isShort && hasPendingRef.current && CONFIRM_PHRASES.test(transcript)) {
      onConfirmRef.current(); onInterimRef.current('')
      return
    }
    if (isShort && hasPendingRef.current && CANCEL_PHRASES.test(transcript)) {
      onCancelRef.current(); onInterimRef.current('')
      return
    }
    onFinalRef.current(transcript.trim(), { confidence: lastConfidenceRef.current })
    onFinalRef.current('__SEND__', { confidence: lastConfidenceRef.current })
  }, [])

  const triggerFinal = useCallback((text: string, metadata: { endpointReason?: string } = {}) => {
    stopSilenceTimer()
    stopTurnCandidateTimer()
    stopManualFinalizeTimer()
    const capturedText = text.trim() || lastInterimRef.current.trim()
    const pendingFragment = pendingFragmentRef.current.trim()
    const includesPending = pendingFragment
      && capturedText.toLocaleLowerCase().startsWith(pendingFragment.toLocaleLowerCase())
    const finalText = [
      includesPending ? '' : pendingFragment,
      capturedText,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const asrElapsedMs = listeningStartRef.current > 0 ? Date.now() - listeningStartRef.current : null
    const speechToCommitMs = speechStartedAtRef.current > 0 ? Date.now() - speechStartedAtRef.current : null
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    firstInterimRef.current = false
    if (isIncompleteVoiceFragment(finalText)) {
      pendingFragmentRef.current = finalText
      pendingFragmentUtteranceIdRef.current = utteranceIdRef.current
      setPhaseSync('listening')
      onInterimRef.current(finalText)
      onTraceRef.current?.('asr_fragment_held', {
        utterance_id: utteranceIdRef.current,
        endpoint_reason: metadata.endpointReason ?? 'unknown',
        asr_elapsed_ms: asrElapsedMs,
        word_count: finalText.split(/\s+/).length,
      })
      scheduleFragmentTimeout()
      return
    }
    stopFragmentTimer()
    pendingFragmentRef.current = ''
    pendingFragmentUtteranceIdRef.current = ''
    setPhaseSync('processing')
    const completedUtteranceId = utteranceIdRef.current
    const nextUtteranceId = createUtteranceId()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'commit',
        utterance_id: completedUtteranceId,
        next_utterance_id: nextUtteranceId,
      }))
    }
    onTraceRef.current?.('asr_final', {
      utterance_id: completedUtteranceId,
      endpoint_reason: metadata.endpointReason ?? 'unknown',
      asr_elapsed_ms: asrElapsedMs,
      speech_to_commit_ms: speechToCommitMs,
      confidence: lastConfidenceRef.current,
      word_count: finalText ? finalText.split(/\s+/).length : 0,
    })
    handleFinalTranscript(finalText)
    if (activeRef.current) {
      utteranceIdRef.current = nextUtteranceId
      listeningStartRef.current = Date.now()
      speechStartedAtRef.current = 0
    }
  }, [handleFinalTranscript]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelTurnCandidate = useCallback((reason: string) => {
    if (!turnCandidateTimerRef.current) return
    const candidateAgeMs = turnCandidateAtRef.current > 0 ? Date.now() - turnCandidateAtRef.current : null
    stopTurnCandidateTimer()
    onTraceRef.current?.('asr_turn_resumed', {
      utterance_id: utteranceIdRef.current,
      reason,
      candidate_age_ms: candidateAgeMs,
    })
  }, [])

  const scheduleTurnCommit = useCallback((
    text: string,
    metadata: { endpointReason?: string; confidence?: unknown } = {},
  ) => {
    if (!text.trim() || turnCandidateTimerRef.current) return
    lastInterimRef.current = text.trim()
    lastConfidenceRef.current = normalizeConfidence(metadata.confidence)
      ?? lastConfidenceRef.current
    turnCandidateAtRef.current = Date.now()
    onTraceRef.current?.('asr_turn_candidate', {
      utterance_id: utteranceIdRef.current,
      endpoint_reason: metadata.endpointReason ?? 'unknown',
      word_count: text.trim().split(/\s+/).length,
    })
    const graceMs = finalizingRef.current ? 300 : TURN_COMMIT_GRACE_MS
    turnCandidateTimerRef.current = setTimeout(() => {
      turnCandidateTimerRef.current = null
      turnCandidateAtRef.current = 0
      triggerFinal(text, metadata)
    }, graceMs)
  }, [normalizeConfidence, triggerFinal])

  // ── Web Speech API path (Safari / iOS) ──────────────────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    // Kill any lingering instance to prevent duplicate ghost listeners
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    listeningStartRef.current = Date.now()
    utteranceIdRef.current = createUtteranceId()
    firstInterimRef.current = false
    setPhaseSync('listening')
    onTraceRef.current?.('asr_listening_ready', { connect_ms: 0, mode: 'webspeech', utterance_id: utteranceIdRef.current })

    const recognition = new WebSpeech()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      let finalAccum = ''
      let finalConfidence: number | null = null
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalAccum += t
          finalConfidence = normalizeConfidence(event.results[i][0].confidence)
        }
        else interim += t
      }

      // Use final result immediately (authoritative — no silence timer needed)
      if (finalAccum.trim()) {
        lastConfidenceRef.current = finalConfidence
        stopSilenceTimer()
        lastInterimRef.current = ''
        onInterimRef.current(finalAccum.trim())
        try { recognition.stop() } catch { /* ignore */ }
        triggerFinal(finalAccum.trim(), { endpointReason: 'provider_final' })
        if (activeRef.current) setTimeout(() => startWebSpeechRef.current(), 300)
        return
      }

      const display = interim.trim()
      if (!display) return

      if (!firstInterimRef.current) {
        firstInterimRef.current = true
        onTraceRef.current?.('asr_first_interim', {
          first_interim_ms: Date.now() - listeningStartRef.current,
          mode: 'webspeech',
        })
      }
      onInterimRef.current(display, {
        committed: '',
        interim: display,
        isFinal: false,
      })
      lastInterimRef.current = display

      // Silence timer fallback for browsers that don't emit isFinal promptly
      stopSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        if (lastInterimRef.current && activeRef.current) {
          const toSend = lastInterimRef.current
          lastInterimRef.current = ''
          try { recognition.stop() } catch { /* ignore */ }
          triggerFinal(toSend, { endpointReason: 'client_silence_timeout' })
          if (activeRef.current) setTimeout(() => startWebSpeechRef.current(), 300)
        }
      }, SILENCE_MS)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      // 'no-speech' and 'aborted' are expected — no-speech = silence, aborted = we called stop()
      if (e.error === 'no-speech' || e.error === 'aborted') return
      onTraceRef.current?.('asr_error', { mode: 'webspeech', reason: String(e.error ?? 'unknown').slice(0, 120) })
      console.warn('[WebSpeech] error', e.error)
      if (activeRef.current) setTimeout(() => startWebSpeechRef.current(), 500)
    }

    recognition.onend = () => {
      // continuous=true can still stop on silence — restart transparently
      // Use phaseRef (not phase) to avoid stale closure
      if (activeRef.current && phaseRef.current !== 'processing') {
        setTimeout(() => startWebSpeechRef.current(), 150)
      }
    }

    recognition.start()
  }, [WebSpeech, triggerFinal, normalizeConfidence]) // all state accessed via refs
  useEffect(() => { startWebSpeechRef.current = startWebSpeech }, [startWebSpeech])

  const stopWebSpeech = useCallback(() => {
    stopSilenceTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  // ── Bridge path (Pi / Chromium) ─────────────────────────────────────────
  const startBridge = useCallback(() => {
    if (!activeRef.current) return
    stopWS()
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    connectStartRef.current = Date.now()
    utteranceIdRef.current = createUtteranceId()
    firstInterimRef.current = false
    onTraceRef.current?.('asr_connect_started', { mode: 'bridge', utterance_id: utteranceIdRef.current })
    setPhaseSync('connecting')

    const ws = new WebSocket(BRIDGE_WS)
    wsRef.current = ws

    ws.onopen = () => {
      setBridgeDown(false)
      ws.send(JSON.stringify({
        type: 'start',
        turn_protocol: STT_TURN_PROTOCOL,
        utterance_id: utteranceIdRef.current,
      }))
    }

    ws.onmessage = (evt) => {
      if (!activeRef.current) return
      try {
        const msg = normalizeBridgeTurnMessage(JSON.parse(evt.data as string))
        if (!msg) return
        switch (msg.type) {
          case 'ready':
            listeningStartRef.current = Date.now()
            onTraceRef.current?.('asr_listening_ready', {
              connect_ms: connectStartRef.current > 0 ? Date.now() - connectStartRef.current : null,
              mode: 'bridge',
              utterance_id: utteranceIdRef.current,
            })
            setPhaseSync('listening')
            connectStartRef.current = 0
            setBridgeDown(false)
            break
          case 'volume':
            setVolume(msg.level ?? 0)
            break
          case 'speech_started':
            if (speechStartedAtRef.current === 0) speechStartedAtRef.current = Date.now()
            if (pendingFragmentRef.current) scheduleFragmentTimeout()
            cancelTurnCandidate('speech_started')
            onTraceRef.current?.('asr_speech_started', {
              utterance_id: utteranceIdRef.current,
              provider_timestamp: msg.provider_timestamp ?? null,
              ready_to_speech_ms: listeningStartRef.current > 0 ? Date.now() - listeningStartRef.current : null,
            })
            break
          case 'transcript':
            if (!msg.is_final) cancelTurnCandidate('interim_after_candidate')
            {
              const display = reconcileTranscriptRevision(msg)
              const now = Date.now()
              const revisionIntervalMs = lastTranscriptAtRef.current > 0
                ? now - lastTranscriptAtRef.current
                : null
              lastTranscriptAtRef.current = now
              onTraceRef.current?.('asr_transcript_revision', {
                utterance_id: utteranceIdRef.current,
                revision_interval_ms: revisionIntervalMs,
                is_final: msg.is_final === true,
                committed_word_count: String(msg.committed ?? '').trim().split(/\s+/).filter(Boolean).length,
                interim_word_count: String(msg.interim ?? '').trim().split(/\s+/).filter(Boolean).length,
              })
              if (display === lastInterimRef.current) break
              if (pendingFragmentRef.current) scheduleFragmentTimeout()
              if (!firstInterimRef.current) {
                firstInterimRef.current = true
                onTraceRef.current?.('asr_first_interim', {
                  first_interim_ms: speechStartedAtRef.current > 0
                    ? Date.now() - speechStartedAtRef.current
                    : null,
                  ready_to_first_interim_ms: listeningStartRef.current > 0
                    ? Date.now() - listeningStartRef.current
                    : null,
                  mode: 'bridge',
                  utterance_id: utteranceIdRef.current,
                })
              }
              lastInterimRef.current = display
              lastInterimTimeRef.current = now
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              onInterimRef.current(display, {
                committed: String(msg.committed ?? ''),
                interim: String(msg.interim ?? ''),
                isFinal: msg.is_final === true,
              })
            }
            break
          case 'segment_final': {
            const text = String(msg.text ?? '')
            lastInterimRef.current = text
            lastConfidenceRef.current = normalizeConfidence(msg.confidence)
            onInterimRef.current(text, {
              committed: text,
              interim: '',
              isFinal: true,
            })
            onTraceRef.current?.('asr_segment_final', {
              utterance_id: utteranceIdRef.current,
              word_count: text.trim().split(/\s+/).filter(Boolean).length,
              speech_final: true,
            })
            break
          }
          case 'turn_candidate':
            scheduleTurnCommit(String(msg.text ?? ''), {
              endpointReason: String(msg.endpoint_reason ?? 'bridge_candidate'),
              confidence: msg.confidence,
            })
            break
          case 'committed':
            onTraceRef.current?.('asr_commit_ack', {
              utterance_id: String(msg.utterance_id ?? ''),
              next_utterance_id: String(msg.next_utterance_id ?? ''),
            })
            break
          case 'discarded':
            onTraceRef.current?.('asr_discard_ack', {
              utterance_id: String(msg.utterance_id ?? ''),
              next_utterance_id: String(msg.next_utterance_id ?? ''),
            })
            break
          case 'shadow_metric':
            onTraceRef.current?.('asr_flux_shadow', {
              utterance_id: utteranceIdRef.current,
              provider: String(msg.provider ?? 'flux'),
              status: String(msg.status ?? 'unknown'),
              shadow_session_id: String(msg.session_id ?? ''),
              shadow_turn_index: msg.turn_index ?? null,
              primary_discarded: msg.primary_discarded ?? null,
              primary_word_count: msg.primary_word_count ?? null,
              shadow_word_count: msg.shadow_word_count ?? null,
              average_confidence: msg.average_confidence ?? null,
              normalized_edit_distance: msg.normalized_edit_distance ?? null,
              end_of_turn_confidence: msg.end_of_turn_confidence ?? null,
              speech_to_first_update_ms: msg.speech_to_first_update_ms ?? null,
              average_update_interval_ms: msg.average_update_interval_ms ?? null,
              update_count: msg.update_count ?? null,
              last_word_to_eot_ms: msg.last_word_to_eot_ms ?? null,
              turn_resumed_count: msg.turn_resumed_count ?? null,
              queue_drops: msg.queue_drops ?? 0,
              max_queue_depth: msg.max_queue_depth ?? 0,
              average_primary_offer_us: msg.average_primary_offer_us ?? null,
              max_primary_offer_us: msg.max_primary_offer_us ?? null,
              offer_us: msg.offer_us ?? null,
            })
            break
          case 'interim': {
            const text = String(msg.text ?? '')
            if (text !== lastInterimRef.current) {
              if (pendingFragmentRef.current) scheduleFragmentTimeout()
              if (!firstInterimRef.current) {
                firstInterimRef.current = true
                onTraceRef.current?.('asr_first_interim', {
                  first_interim_ms: listeningStartRef.current > 0 ? Date.now() - listeningStartRef.current : null,
                  mode: 'bridge',
                  utterance_id: utteranceIdRef.current,
                })
              }
              lastInterimRef.current = text
              lastInterimTimeRef.current = Date.now()
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              onInterimRef.current(text)
            }
            break
          }
          case 'final':
            if (phaseRef.current !== 'processing') {
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              triggerFinal(String(msg.text ?? ''), { endpointReason: String(msg.endpoint_reason ?? 'bridge_final') })
            }
            break
          case 'error':
            onTraceRef.current?.('asr_error', {
              mode: 'bridge',
              reason: String(msg.msg ?? 'bridge_error').slice(0, 120),
            })
            console.warn('[STT] bridge error', msg.msg)
            if (activeRef.current) setTimeout(() => startBridgeRef.current(), 500)
            break
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => {
      onTraceRef.current?.('asr_error', { mode: 'bridge', reason: 'websocket_error' })
      console.warn('[STT] WS connection error')
    }

    ws.onclose = () => {
      wsRef.current = null
      setVolume(0)
      if (connectStartRef.current > 0 && Date.now() - connectStartRef.current > CONNECT_TIMEOUT_MS) {
        console.warn('[STT] connect timeout, retrying')
        setBridgeDown(true)
      }
      if (activeRef.current && phaseRef.current !== 'processing') {
        setTimeout(() => startBridgeRef.current(), 500)
      }
    }
  }, [triggerFinal, normalizeConfidence, cancelTurnCandidate, scheduleTurnCommit]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { startBridgeRef.current = startBridge }, [startBridge])

  const stopBridge = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch { /* ignore */ }
    }
    stopWS()
  }, [])

  // ── Unified start / stop ─────────────────────────────────────────────────
  const stop = useCallback(async () => {
    activeRef.current = false
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    lastConfidenceRef.current = null
    pendingFragmentRef.current = ''
    pendingFragmentUtteranceIdRef.current = ''
    stopFragmentTimer()
    stopTurnCandidateTimer()
    stopManualFinalizeTimer()
    connectStartRef.current = 0
    listeningStartRef.current = 0
    firstInterimRef.current = false
    speechStartedAtRef.current = 0
    lastTranscriptAtRef.current = 0
    setPhaseSync('idle')
    setVolume(0)
    onInterimRef.current('')
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopBridge()
  }, [stopWebSpeech, stopBridge])

  const finish = useCallback(() => {
    if (!activeRef.current || finalizingRef.current) return
    const capturedText = lastInterimRef.current.trim()
    if (!capturedText) {
      void stop()
      return
    }
    finalizingRef.current = true
    onTraceRef.current?.('asr_finalize_requested', {
      utterance_id: utteranceIdRef.current,
      word_count: capturedText.split(/\s+/).length,
    })
    if (modeRef.current === 'bridge' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'finalize', utterance_id: utteranceIdRef.current }))
    } else if (modeRef.current === 'webspeech' && recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
    stopManualFinalizeTimer()
    finalizingRef.current = true
    manualFinalizeTimerRef.current = setTimeout(() => {
      manualFinalizeTimerRef.current = null
      triggerFinal(lastInterimRef.current || capturedText, { endpointReason: 'manual_finalize_timeout' })
    }, MANUAL_FINALIZE_TIMEOUT_MS)
  }, [stop, triggerFinal])

  const start = useCallback(async () => {
    if (activeRef.current) return
    if (IS_SAFE_MODE) return
    activeRef.current = true
    setPhaseSync('connecting')
    utteranceIdRef.current = createUtteranceId()
    onTraceRef.current?.('asr_start_requested', { utterance_id: utteranceIdRef.current })

    // Auto-detect once per component lifetime — don't re-probe on every open
    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
      onTraceRef.current?.('asr_mode_selected', { mode: modeRef.current })
      console.log(`[STT] mode: ${modeRef.current}`)
    }

    if (modeRef.current === 'webspeech') startWebSpeech()
    else startBridge()
  }, [startWebSpeech, startBridge, WebSpeech])

  const toggle = useCallback(() => {
    if (activeRef.current) finish()
    else start()
  }, [start, finish])

  // Suppress/unsuppress without stopping the mic — used during AI loading
  const suppress  = useCallback(() => { suppressRef.current = true  }, [])
  const unsuppress = useCallback(() => { suppressRef.current = false }, [])

  // Ensure mic is running — restarts WebSpeech if it naturally ended while suppressed.
  // Reads phaseRef (not state) to avoid stale closure — ensureRunning is created once.
  const ensureRunning = useCallback(() => {
    if (!activeRef.current) return  // fully stopped (drawer closed), don't restart
    if (
      modeRef.current === 'webspeech' &&
      phaseRef.current !== 'listening' &&
      phaseRef.current !== 'connecting'
    ) {
      startWebSpeech()
    }
    // Bridge stays running continuously — no action needed
  }, [startWebSpeech]) // phase read via phaseRef, no stale closure

  // Ensure bridge/webspeech resources are always torn down on component unmount.
  useEffect(() => {
    return () => {
      activeRef.current = false
      stopSilenceTimer()
      stopWebSpeech()
      stopBridge()
    }
  }, [stopWebSpeech, stopBridge])

  return {
    phase,
    volume,
    supported,
    bridgeDown,
    start,
    stop,
    finish,
    toggle,
    suppress,
    unsuppress,
    ensureRunning,
    active: activeRef,
    listening: phase === 'listening',
    connecting: phase === 'connecting',
  }
}
