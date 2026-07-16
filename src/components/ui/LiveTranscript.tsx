import { cn } from '../../utils/cn'

export interface LiveTranscriptProps {
  committed: string
  interim: string
  active?: boolean
  phase?: 'idle' | 'connecting' | 'capturing' | 'listening' | 'processing'
  volume?: number
  className?: string
}

export function LiveTranscript({
  committed,
  interim,
  active = true,
  phase = 'listening',
  volume = 0,
  className,
}: LiveTranscriptProps) {
  if (!active) return null

  const stableText = committed.trim()
  const liveText = interim.trim()
  const level = Math.min(4, Math.floor(Math.max(0, Math.min(volume, 100)) / 20))
  const status = phase === 'connecting'
    ? { label: 'Opening microphone', hint: 'One moment' }
    : phase === 'capturing'
      ? { label: "I'm listening", hint: 'Live words are warming up' }
      : phase === 'processing'
        ? { label: 'Got it', hint: 'Working on that' }
        : { label: "I'm listening", hint: 'Speak naturally' }

  return (
    <section
      className={cn(
        'live-transcript-surface rounded-card border border-casa-border bg-casa-surface px-4 py-3 shadow-sm',
        className,
      )}
      data-phase={phase}
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-between gap-4"
      >
        <span className="min-w-0">
          <span className="block text-label font-semibold text-content-heading">{status.label}</span>
          <span className="block text-caption text-casa-muted">{status.hint}</span>
        </span>
        <span className={cn('live-transcript-meter', `live-transcript-level-${level}`)}>
          {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 min-h-7 overflow-hidden whitespace-pre-wrap break-words text-body leading-relaxed"
      >
        {stableText && <span className="text-content-heading">{stableText}</span>}
        {stableText && liveText && ' '}
        {liveText
          ? <span key={liveText} className="live-transcript-revision text-casa-muted">{liveText}</span>
          : !stableText && <span className="text-casa-muted">Go ahead…</span>}
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stableText}
      </span>
    </section>
  )
}
