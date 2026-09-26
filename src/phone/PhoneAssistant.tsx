import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import type { FamilyMember } from '../types'
import { voiceFinal } from '../wall/assistant'
import { buildBugReport } from '../wall/bugReport'
import { useAssistantTurn } from '../wall/useAssistantTurn'
import { phoneTranscript } from './assistant'
import PhoneAssistantView from './PhoneAssistantView'

const canListen = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

/** Say it with live data: the same assistant and the same yes as the wall's band. */
export default function PhoneAssistant({ events, family, onClose, onOpenEvent }: { events: EventWithDetails[]; family: FamilyMember[]; onClose: () => void; onOpenEvent: (id: string) => void }) {
  const { profile } = useProfileSession()
  const turn = useAssistantTurn({ surface: 'phone', events, family })
  const { messages, loading, send, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport } = turn
  const [interim, setInterim] = useState('')
  const captured = useRef('')
  const heard = useRef('')
  const stopRef = useRef<() => void>(() => {})

  const speech = useSpeechInput({
    onInterim: setInterim,
    onFinalTranscript: (text) => {
      const step = voiceFinal(captured.current, text)
      captured.current = step.captured
      if (step.captured) {
        heard.current = step.captured
        setInterim(step.captured)
      }
      if (!step.toSend) return
      setInterim('')
      setNote(null)
      void send(step.toSend)
      stopRef.current()
    },
    onDismiss: () => stopRef.current(),
    onConfirm: () => void confirm(),
    onCancel: cancel,
    hasPendingAction: Boolean(pending),
  })
  useEffect(() => {
    stopRef.current = () => void speech.stop()
  })

  const lines = useMemo(() => phoneTranscript(messages), [messages])
  const thinking = loading || Boolean(answer?.streaming)

  return (
    <PhoneAssistantView
      lines={lines}
      thinking={thinking}
      pending={pending?.toolAction?.displayText ?? null}
      working={working}
      note={note}
      mic={canListen ? {
        listening: speech.listening,
        interim,
        toggle: () => {
          if (speech.listening) return speech.finish()
          captured.current = ''
          void speech.start()
        },
      } : undefined}
      onOpenEvent={pointAt && events.some((e) => e.id === pointAt) ? () => onOpenEvent(pointAt) : undefined}
      onSend={(text) => {
        setNote(null)
        void send(text)
      }}
      onConfirm={() => void confirm()}
      onCancel={cancel}
      onReport={async ({ categories, expected, happened }) => {
        const conversation = forReport()
        await sendBugReport(buildBugReport({
          messages: conversation.messages,
          seenAt: conversation.seenAt,
          sessionId: conversation.sessionId,
          heard: heard.current,
          categories,
          expected,
          happened,
          context: {
            surface: 'phone',
            build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
            viewer: profile?.memberName ?? null,
            at: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            utcOffset: -new Date().getTimezoneOffset(),
            screen: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
            pointAt: pointAt ?? null,
            pendingTool: pending?.toolAction?.tool ?? null,
            loading,
            online: navigator.onLine,
            messageCount: conversation.messages.length,
            previousConversation: conversation.previous,
          },
        }))
      }}
      onClose={() => {
        stopRef.current()
        onClose()
      }}
    />
  )
}
