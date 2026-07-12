import { cn } from '../../utils/cn'

export interface LiveTranscriptProps {
  committed: string
  interim: string
  active?: boolean
  className?: string
}

export function LiveTranscript({
  committed,
  interim,
  active = true,
  className,
}: LiveTranscriptProps) {
  if (!active) return null

  const stableText = committed.trim()
  const liveText = interim.trim()

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 flex items-end overflow-hidden whitespace-pre-wrap break-words text-body leading-relaxed',
          className,
        )}
      >
        <span className="w-full">
          {stableText && <span className="text-content-heading">{stableText}</span>}
          {stableText && liveText && ' '}
          {liveText && <span className="text-casa-muted">{liveText}</span>}
        </span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stableText}
      </span>
    </>
  )
}
