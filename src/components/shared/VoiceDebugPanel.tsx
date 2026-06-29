import React, { useState, useEffect } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'

interface DebugEvent {
  timestamp: number
  stage: string
  status: 'pending' | 'success' | 'error'
  message: string
  data?: Record<string, unknown>
}

export function VoiceDebugPanel() {
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [expanded, setExpanded] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    // Listen for custom voice debug events
    const handleDebug = (e: CustomEvent) => {
      const evt = e.detail as DebugEvent
      setEvents(prev => {
        const updated = [evt, ...prev].slice(0, 100)
        if (autoScroll) {
          setTimeout(() => {
            const panel = document.querySelector('[data-voice-debug-scroll]')
            if (panel) panel.scrollTop = 0
          }, 0)
        }
        return updated
      })
    }

    window.addEventListener('voice-debug', handleDebug as EventListener)
    return () => window.removeEventListener('voice-debug', handleDebug as EventListener)
  }, [autoScroll])

  const clear = () => {
    setEvents([])
    window.dispatchEvent(new CustomEvent('voice-debug-clear'))
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 px-3 py-2 bg-casa-navy text-white text-xs rounded-lg z-50 hover:bg-casa-navy/80 transition-colors"
      >
        🎤 Debug ({events.length})
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-96 bg-white border-2 border-casa-navy rounded-lg z-50 flex flex-col shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-casa-border">
        <span className="font-semibold text-sm">Voice Pipeline Debug</span>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            Auto-scroll
          </label>
          <button onClick={clear} className="p-1 hover:bg-gray-100 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setExpanded(false)} className="p-1">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        data-voice-debug-scroll
        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 bg-gray-50"
      >
        {events.length === 0 ? (
          <div className="text-gray-400">Waiting for events...</div>
        ) : (
          events.map((evt, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-500 w-8 flex-shrink-0">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`px-2 py-0.5 rounded w-16 flex-shrink-0 text-center text-white text-xs font-semibold ${
                  evt.status === 'pending'
                    ? 'bg-yellow-500'
                    : evt.status === 'success'
                      ? 'bg-green-500'
                      : 'bg-red-500'
                }`}
              >
                {evt.status === 'pending' ? '⏳' : evt.status === 'success' ? '✓' : '✗'}
              </span>
              <span className="flex-1 break-words">
                <span className="font-semibold text-casa-navy">{evt.stage}</span>
                {evt.message && `: ${evt.message}`}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function emitVoiceDebug(
  stage: string,
  message: string,
  status: 'pending' | 'success' | 'error' = 'success',
  data?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent('voice-debug', {
      detail: {
        timestamp: Date.now(),
        stage,
        status,
        message,
        data,
      },
    })
  )
}
