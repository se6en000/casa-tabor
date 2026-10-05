/**
 * The Ask button's face (canvas 41a, Jake Oct 5: "A but we also need to have it animated/breathing"): the Tabor House
 * T, a brass rule and ASK inside a thin brass ring, like the app icon. While it waits it breathes — the ring brightens
 * and dims with the glow around the button, and a glint of light travels slowly round it. Held, it turns brass and
 * goes still. Still for Reduce Motion (index.css).
 */
export default function AskMark({ held = false }: { held?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="27.5" fill="none" strokeWidth="1.3" className={held ? 'stroke-wall-ink' : 'ask-ring-breathe stroke-wall-night-brass'} />
      {!held && <circle cx="32" cy="32" r="27.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="14 159" className="ask-glint stroke-wall-on-pigment" />}
      <text x="32" y="33.5" textAnchor="middle" fontSize="24" fontWeight="500" className={`font-display ${held ? 'fill-wall-ink' : 'fill-wall-on-pigment'}`}>T</text>
      <line x1="27" y1="38" x2="37" y2="38" strokeWidth="1" className={held ? 'stroke-wall-ink' : 'stroke-wall-night-brass'} />
      <text x="33" y="48" textAnchor="middle" fontSize="8.6" fontWeight="700" letterSpacing="1.9" className={`font-body ${held ? 'fill-wall-ink' : 'fill-wall-night-brass'}`}>ASK</text>
    </svg>
  )
}
