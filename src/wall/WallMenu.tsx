import { Mic } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Posture } from './posture'

// The MT monogram opens the rest of the app. On the kiosk, each page's Home
// button — and a few idle minutes — bring it back to the Wall (kioskHome.ts).
const DESTINATIONS = [
  { to: '/calendar', label: 'Calendar' },
  { to: '/grocery', label: 'Grocery list' },
  { to: '/cook', label: 'Meals & kitchen' },
  { to: '/music', label: 'Music' },
  { to: '/briefing', label: 'Briefing' },
  { to: '/settings', label: 'Settings' },
  { to: '/?classic=1', label: 'Previous home screen' },
] as const

export function MenuButton({ onOpen, className = '' }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-wall-brass bg-transparent p-0 font-display text-wall-detail font-bold text-wall-brass-ink ${className}`}
    >
      MT
    </button>
  )
}

/** The mic: dark, beside the MT monogram on every face (board 03b). */
/** `small` sits in a 44px row beside the MT monogram (the launch header), where the full size would squeeze the clock column. */
export function MicButton({ onAsk, className = '', small = false }: { onAsk: () => void; className?: string; small?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Talk to Casa"
      onClick={(event) => {
        event.stopPropagation()
        onAsk()
      }}
      className={`flex shrink-0 items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-night-brass ${small ? 'h-[44px] w-[44px] ring-[4px]' : 'h-[56px] w-[56px] ring-[6px]'} ring-wall-brass/35 ${className}`}
    >
      <Mic size={small ? 20 : 24} strokeWidth={1.8} />
    </button>
  )
}

const PREVIEWS: Array<{ posture: Posture; label: string }> = [
  { posture: 'launch', label: 'Full day' },
  { posture: 'calm', label: 'Calm' },
  { posture: 'evening', label: 'Evening' },
]

/** The MT menu: the rest of the app, and (since a tap on the wall no longer flips faces) a way to preview each face. */
export default function WallMenu({ onClose, onPreview }: { onClose: () => void; onPreview?: (posture: Posture) => void }) {
  return (
    <div
      role="dialog"
      aria-label="Menu"
      className="absolute inset-0 z-10 bg-wall-ink/40"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <nav
        className="absolute left-[44px] top-[44px] flex w-[520px] flex-col rounded-[18px] bg-wall-ground px-[32px] py-[28px] font-body text-wall-ink"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-[12px] text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">MAISON TABOR</div>
        {DESTINATIONS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex h-[64px] items-center border-t border-wall-rule font-display text-wall-date font-semibold text-wall-ink no-underline"
          >
            {item.label}
          </Link>
        ))}
        {onPreview && (
          <div className="mt-[14px] flex flex-col gap-[10px] border-t border-wall-rule pt-[14px]">
            <div className="text-wall-label font-semibold tracking-[0.2em] text-wall-ink-2">PREVIEW A FACE</div>
            <div className="flex gap-[10px]">
              {PREVIEWS.map((p) => (
                <button
                  key={p.posture}
                  type="button"
                  onClick={() => onPreview(p.posture)}
                  className="h-[52px] flex-1 rounded-full border border-wall-rule bg-transparent text-wall-detail font-semibold text-wall-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-[16px] h-[52px] rounded-full border border-wall-rule bg-transparent text-wall-body font-semibold text-wall-ink"
        >
          Back to the Wall
        </button>
      </nav>
    </div>
  )
}
