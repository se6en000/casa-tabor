import { useEffect, useState } from 'react'

// The fireplace (Jake, Oct 8: "for shits and giggles, can you also add a menu item for fireplace, where it will play a
// good full screen fireplace with some crackling sound?" → "id go for real"): a filmed fire with its own crackle, no
// music, twelve hours and then it loops — full screen, YouTube's frame cropped away. A tap anywhere (or Esc) puts it out.

const VIDEO = 'UgHKb_7884o' // "12 HOURS of Relaxing Fireplace Sounds … Crackling Fire Sounds (NO MUSIC)" — Cat Trumpet
const SRC = `https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1&controls=0&loop=1&playlist=${VIDEO}&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&disablekb=1&fs=0`

export default function WallFireplace({ onClose }: { onClose: () => void }) {
  const [hint, setHint] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setHint(false), 4000)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <div role="dialog" aria-label="Fireplace" className="absolute inset-0 z-50 overflow-hidden bg-wall-night-ground">
      {/* A touch larger than the screen: the title bar and edges of the player stay off it. */}
      <iframe
        title="Fireplace"
        src={SRC}
        allow="autoplay; encrypted-media"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[1210px] w-[2150px] -translate-x-1/2 -translate-y-1/2 border-0"
      />
      <button
        type="button"
        aria-label="Put out the fire"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
      />
      <div className={`pointer-events-none absolute bottom-[40px] left-1/2 -translate-x-1/2 rounded-full bg-wall-night-ground/70 px-[22px] py-[8px] text-wall-detail text-wall-night-ink-2 transition-opacity duration-1000 ${hint ? 'opacity-100' : 'opacity-0'}`}>
        Tap anywhere to put it out
      </div>
    </div>
  )
}
