import { useState, useRef, useEffect, useCallback } from 'react'
import {
  parseVoiceActionCommand,
  resolveCulinaryQuery,
  type RecipeCookingContext,
} from '../lib/culinaryKnowledge'

const BRIDGE_WS = 'ws://127.0.0.1:8767'

export interface UseKitchenVoiceAssistantProps {
  enabled: boolean
  context: RecipeCookingContext
  onAddTimer: (label: string, seconds: number) => void
  onStepChange: (stepIndex: number) => void
  onChangeScale?: (scale: string) => void
  onQuerySubmit: (query: string) => Promise<string | void> | string | void
}

export function useKitchenVoiceAssistant({
  enabled,
  context,
  onAddTimer,
  onStepChange,
  onChangeScale,
  onQuerySubmit,
}: UseKitchenVoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [wakeDetected, setWakeDetected] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)

  // Stable refs to prevent re-subscribing loops
  const contextRef = useRef(context)
  const onAddTimerRef = useRef(onAddTimer)
  const onStepChangeRef = useRef(onStepChange)
  const onChangeScaleRef = useRef(onChangeScale)
  const onQuerySubmitRef = useRef(onQuerySubmit)
  const enabledRef = useRef(enabled)
  const ttsEnabledRef = useRef(ttsEnabled)

  useEffect(() => { contextRef.current = context }, [context])
  useEffect(() => { onAddTimerRef.current = onAddTimer }, [onAddTimer])
  useEffect(() => { onStepChangeRef.current = onStepChange }, [onStepChange])
  useEffect(() => { onChangeScaleRef.current = onChangeScale }, [onChangeScale])
  useEffect(() => { onQuerySubmitRef.current = onQuerySubmit }, [onQuerySubmit])
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { ttsEnabledRef.current = ttsEnabled }, [ttsEnabled])

  // Text-To-Speech (TTS) Speaker
  const speakText = useCallback((rawText: string) => {
    if (!ttsEnabledRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return

    try {
      window.speechSynthesis.cancel()

      // Strip markdown asterisks, hashes, backticks, emojis and excessive whitespace for natural speech
      const cleaned = rawText
        .replace(/[\*#_`~]/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!cleaned) return

      const utterance = new SpeechSynthesisUtterance(cleaned)
      utterance.rate = 1.05
      utterance.pitch = 1.0

      // Pick a natural English voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(
        (v) => (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Google') || v.name.includes('Samantha')) && v.lang.startsWith('en')
      ) || voices.find((v) => v.lang.startsWith('en'))

      if (preferred) utterance.voice = preferred

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utterance)
    } catch {
      setIsSpeaking(false)
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [])

  // Process incoming transcribed voice command
  const handleTranscribedCommand = useCallback(async (spokenText: string) => {
    const raw = spokenText.trim()
    if (!raw) return

    // Strip wake word prefixes: "alexa", "hey chef", "sous chef", "chef"
    const cleaned = raw
      .replace(/^(?:hey\s+)?(?:alexa|sous\s+chef|chef|casa|computer)[,\s]*/i, '')
      .trim()

    if (!cleaned) return

    setLiveTranscript(cleaned)
    setWakeDetected(true)
    setTimeout(() => setWakeDetected(false), 2500)

    const ctx = contextRef.current

    // Check for actionable voice commands (timers, navigation, portion scaling)
    const action = parseVoiceActionCommand(cleaned, ctx.totalSteps, ctx.currentStepIndex)

    if (action.type === 'timer' && action.timerSeconds && action.timerLabel) {
      onAddTimerRef.current(action.timerLabel, action.timerSeconds)
      const confirmation = `Started a timer for ${Math.round(action.timerSeconds / 60)} minute${action.timerSeconds >= 120 ? 's' : ''}.`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    if (action.type === 'step_next' && typeof action.targetStepIndex === 'number') {
      onStepChangeRef.current(action.targetStepIndex)
      const nextInstr = ctx.allSteps?.[action.targetStepIndex]?.instruction || `Step ${action.targetStepIndex + 1}`
      const confirmation = `Moving to Step ${action.targetStepIndex + 1}. ${nextInstr}`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    if (action.type === 'step_prev' && typeof action.targetStepIndex === 'number') {
      onStepChangeRef.current(action.targetStepIndex)
      const prevInstr = ctx.allSteps?.[action.targetStepIndex]?.instruction || `Step ${action.targetStepIndex + 1}`
      const confirmation = `Back to Step ${action.targetStepIndex + 1}. ${prevInstr}`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    if (action.type === 'step_goto' && typeof action.targetStepIndex === 'number') {
      onStepChangeRef.current(action.targetStepIndex)
      const targetInstr = ctx.allSteps?.[action.targetStepIndex]?.instruction || `Step ${action.targetStepIndex + 1}`
      const confirmation = `Jumping to Step ${action.targetStepIndex + 1}. ${targetInstr}`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    if (action.type === 'read_step') {
      const curInstr = ctx.currentStepInstruction || ctx.allSteps?.[ctx.currentStepIndex]?.instruction || ''
      const confirmation = `Step ${ctx.currentStepIndex + 1} of ${ctx.totalSteps}: ${curInstr}`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    if (action.type === 'scale' && action.scaleValue && onChangeScaleRef.current) {
      onChangeScaleRef.current(action.scaleValue)
      const confirmation = `Portion scale adjusted to ${action.scaleValue} times.`
      speakText(confirmation)
      await onQuerySubmitRef.current(cleaned)
      return
    }

    // Direct general culinary query
    const fastAnswer = resolveCulinaryQuery(cleaned, ctx)
    const result = await onQuerySubmitRef.current(cleaned)
    const spokenAnswer = typeof result === 'string' && result ? result : (fastAnswer || `Here is what you need for ${ctx.recipeName}.`)
    speakText(spokenAnswer)
  }, [speakText])

  // ── 1. Local STT Bridge WebSocket Listener (Hardware Alexa wake word) ───────
  useEffect(() => {
    if (!enabled) return

    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let isDisposed = false

    function connectBridge() {
      if (isDisposed) return
      try {
        ws = new WebSocket(BRIDGE_WS)

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string)
            if (msg.type === 'wake') {
              ws?.send(JSON.stringify({ type: 'accept_wake', wake_id: msg.wake_id }))
              setWakeDetected(true)
              setTimeout(() => setWakeDetected(false), 2000)
            } else if (msg.type === 'final_transcript' && msg.text) {
              handleTranscribedCommand(msg.text)
            }
          } catch { /* ignore */ }
        }

        ws.onerror = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectBridge, 10000)
          }
        }

        ws.onclose = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connectBridge, 5000)
          }
        }
      } catch {
        // Bridge not present (e.g. non-kiosk)
      }
    }

    connectBridge()

    return () => {
      isDisposed = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
      }
    }
  }, [enabled, handleTranscribedCommand])

  // ── 2. Continuous Web Speech API Listener ──────────────────────────────────
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recognition: any = null
    let restartTimer: ReturnType<typeof setTimeout> | null = null
    let isStoppedIntentionally = false

    function startRecognition() {
      if (isStoppedIntentionally || !enabledRef.current) return

      try {
        recognition = new SpeechRecognitionClass()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onstart = () => {
          setIsListening(true)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let interimText = ''
          let finalText = ''

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalText += transcript
            } else {
              interimText += transcript
            }
          }

          const currentSpoken = (finalText || interimText).trim()
          if (currentSpoken) {
            setLiveTranscript(currentSpoken)

            // Look for wake words in interim / final
            const wakeMatch = currentSpoken.match(/\b(?:alexa|hey\s+chef|sous\s+chef|chef)\b/i)
            if (wakeMatch) {
              setWakeDetected(true)
            }
          }

          if (finalText.trim()) {
            handleTranscribedCommand(finalText.trim())
          }
        }

        recognition.onerror = () => {
          // Auto-restart on benign speech timeouts
          if (!isStoppedIntentionally && enabledRef.current) {
            restartTimer = setTimeout(startRecognition, 1000)
          }
        }

        recognition.onend = () => {
          setIsListening(false)
          // Keep continuously listening while enabled
          if (!isStoppedIntentionally && enabledRef.current) {
            restartTimer = setTimeout(startRecognition, 400)
          }
        }

        recognition.start()
      } catch {
        setIsListening(false)
      }
    }

    startRecognition()

    return () => {
      isStoppedIntentionally = true
      if (restartTimer) clearTimeout(restartTimer)
      if (recognition) {
        try { recognition.stop() } catch { /* ignore */ }
      }
      stopSpeaking()
      setIsListening(false)
      setLiveTranscript('')
    }
  }, [enabled, handleTranscribedCommand, stopSpeaking])

  return {
    isListening,
    isSpeaking,
    liveTranscript,
    wakeDetected,
    ttsEnabled,
    setTtsEnabled,
    speakText,
    stopSpeaking,
    triggerVoiceCommand: handleTranscribedCommand,
  }
}
