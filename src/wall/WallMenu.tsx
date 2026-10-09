import { Mic, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Posture } from './posture'

// The Tabor House mark (was the MT monogram) opens the rest of the app. On the kiosk, each page's Home
// button — and a few idle minutes — bring it back to the Wall (kioskHome.ts).
const DESTINATIONS = [
  { to: '/calendar', label: 'Calendar' },
  { to: '/wall/grocery', label: 'Grocery list' },
  { to: '/recipes', label: 'Recipes' },
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
      className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-wall-brass bg-wall-paper p-0 text-wall-ink ${className}`}
    >
      <HouseMark />
    </button>
  )
}

/**
 * The Tabor House mark (the app icon, canvas 38l): the serif T, a brass rule, HOUSE; the button's brass edge is its
 * ring (Jake, Oct 6: "replace the MT button icon with the Tabor House icon"). Drawn, not the PNG, so it takes the
 * evening face's colours.
 */
function HouseMark() {
  return (
    <svg viewBox="0 0 44 44" width="42" height="42" aria-hidden="true" className="font-display">
      <text x="22" y="27" textAnchor="middle" fontSize="25" fontWeight="500" fill="currentColor">T</text>
      <line x1="17.5" y1="30.5" x2="26.5" y2="30.5" strokeWidth="0.9" className="stroke-wall-brass" />
      <text x="22.5" y="36.6" textAnchor="middle" fontSize="4.4" letterSpacing="0.9" fontWeight="600" className="fill-wall-brass-ink font-body">HOUSE</text>
    </svg>
  )
}

/** The mic: dark, beside the MT monogram on every face (board 03b). */
/** `small` sits in a 44px row beside the MT monogram (the launch header), where the full size would squeeze the clock column. */
export function MicButton({ onAsk, className = '', small = false, calling = false, onDark = false }: { onAsk: () => void; className?: string; small?: boolean; calling?: boolean; onDark?: boolean }) {
  // Casa has something to say (canvas 21a): a slow brass glow around the mic, fading only, so the Pi runs it smoothly.
  if (calling) {
    return (
      <span className={`relative inline-flex shrink-0 ${className}`}>
        <span aria-hidden="true" className="pointer-events-none absolute -inset-[24px] animate-[wall-edge-breathe_3.2s_ease-in-out_infinite] rounded-full bg-wall-brass/15" />
        <span aria-hidden="true" className="pointer-events-none absolute -inset-[12px] animate-[wall-edge-breathe_3.2s_ease-in-out_infinite] rounded-full bg-wall-brass/35" />
        <MicButton onAsk={onAsk} small={small} onDark={onDark} className="relative" />
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-label="Ask"
      onClick={(event) => {
        event.stopPropagation()
        onAsk()
      }}
      // On the dark left panel (canvas 56A) it turns brass with an ink mic, so it still reads as the one to press.
      className={`flex shrink-0 items-center justify-center rounded-full border-0 p-0 ${onDark ? 'bg-wall-night-brass text-wall-band ring-wall-night-brass/25' : 'bg-wall-ink text-wall-night-brass ring-wall-brass/35'} ${small ? 'h-[44px] w-[44px] ring-[4px]' : 'h-[56px] w-[56px] ring-[6px]'} ${className}`}
    >
      <Mic size={small ? 20 : 24} strokeWidth={1.8} />
    </button>
  )
}

/** Adding by touch (board 04d): beside the mic. */
export function AddButton({ onAdd, className = '' }: { onAdd: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Add something"
      onClick={(event) => {
        event.stopPropagation()
        onAdd()
      }}
      // Brass like the MT button, so it reads on the daytime ground and the evening's dark one.
      className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-brass bg-wall-paper p-0 text-wall-brass-ink ${className}`}
    >
      <Plus size={20} strokeWidth={2} />
    </button>
  )
}

const PREVIEWS: Array<{ face: Posture | 'paper' | 'night'; label: string }> = [
  { face: 'launch', label: 'Full day' },
  { face: 'calm', label: 'Calm' },
  { face: 'paper', label: 'Morning paper' },
  { face: 'evening', label: 'Evening' },
  { face: 'night', label: 'Night calm' },
]

/**
 * The menu: the rest of the app, and (since a tap on the wall no longer flips faces) a way to preview each face. It
 * opens under the mark that opened it — top right on the day faces, top left on the launch face (Jake, Oct 6: "can
 * settings menu show up near the MT button?").
 */
export default function WallMenu({ onClose, onPreview, onFireplace, side = 'right' }: { onClose: () => void; onPreview?: (face: Posture | 'paper' | 'night') => void; onFireplace?: () => void; side?: 'left' | 'right' }) {
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
        className={`absolute ${side === 'left' ? 'left-[52px]' : 'right-[44px]'} top-[100px] flex w-[520px] flex-col rounded-[18px] bg-wall-ground px-[32px] py-[28px] font-body text-wall-ink`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-[12px] text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">TABOR HOUSE</div>
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
            <div className="grid grid-cols-2 gap-[10px]">
              {PREVIEWS.map((p) => (
                <button
                  key={p.face}
                  type="button"
                  onClick={() => onPreview(p.face)}
                  className="h-[52px] rounded-full border border-wall-rule bg-wall-paper text-wall-detail font-semibold text-wall-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {onFireplace && (
          <button
            type="button"
            onClick={onFireplace}
            className="flex h-[64px] items-center border-0 border-t border-solid border-wall-rule bg-transparent p-0 text-left font-display text-wall-date font-semibold text-wall-ink"
          >
            Fireplace
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-[16px] h-[52px] rounded-full border border-wall-rule bg-wall-paper text-wall-body font-semibold text-wall-ink"
        >
          Back to the Wall
        </button>
      </nav>
    </div>
  )
}
