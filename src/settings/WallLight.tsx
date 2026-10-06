import type { LightReading } from './data'
import { ago, cctColor, lightWords, spectrumAt, tintColor } from './model'
import { useSize, useType } from './sizing'
import { Group, Quiet } from './ui'

// Settings › The wall (canvas 47c/47f; Jake, Oct 6: "where it is on the color spectrum currently, brightness graph").
// The Pi measures the room's light — its colour temperature and brightness — and sets the screen to match. Right now:
// where the room sits on the band from candle-warm to daylight, and what the screen is doing about it. Today: the
// screen's brightness through the last day, the light's colour under it.

const BAND = 'bg-[linear-gradient(90deg,rgb(255,159,70),rgb(255,190,126),rgb(255,214,170),rgb(255,232,212),rgb(255,246,239),rgb(255,254,250))]'

export function LightNow({ now, live, at }: { now: LightReading | null; live: boolean; at: Date }) {
  const t = useType()
  const wall = useSize() === 'wall'
  if (!now) return <Group label="Right now"><Quiet>No reading yet. The wall sends one every five minutes.</Quiet></Group>
  const pos = now.cct != null ? spectrumAt(now.cct) : null
  const tint = tintColor(now.rgb)
  return (
    <Group label="Right now">
      <div className="px-[16px] py-[14px]">
        <div className={`flex items-baseline justify-between gap-[12px] text-wall-ink ${t.body}`}>
          <span className="font-semibold">The room’s light is {lightWords(now.cct)}</span>
          <span className={`text-wall-ink-2 ${t.detail}`}>{now.cct != null ? `${now.cct.toLocaleString('en-US')} K` : ''}</span>
        </div>
        <div className={`relative mt-[12px] rounded-[12px] border border-solid border-wall-stone ${BAND} ${wall ? 'h-[64px]' : 'h-[40px]'}`} role="img" aria-label={`On the band from candle-warm to daylight: ${lightWords(now.cct)}`}>
          {pos != null && (
            <span aria-hidden="true" className="absolute -bottom-[6px] -top-[6px] w-[4px] -translate-x-1/2 rounded-full bg-wall-ink shadow-[0_0_0_2px_rgba(246,241,232,0.9)]" style={{ left: `${pos * 100}%` }} />
          )}
        </div>
        <div className={`mt-[6px] flex justify-between text-wall-ink-2 ${t.label}`}><span>Candle</span><span>Warm</span><span>Neutral</span><span>Daylight</span></div>
        <div className="mt-[14px] grid grid-cols-2 gap-[12px]">
          <div className="rounded-[14px] bg-phone-card px-[14px] py-[10px]">
            <div className={`text-wall-ink-2 ${t.label}`}>THE ROOM</div>
            <div className={`font-semibold text-wall-ink ${t.body}`}>{now.lux != null ? `${Math.round(now.lux)} lux` : '—'}</div>
            <div className={`text-wall-ink-2 ${t.detail}`}>{now.lux == null ? '' : now.lux < 5 ? 'Dark' : now.lux < 60 ? 'Dim' : now.lux < 300 ? 'Lit' : 'Bright'}</div>
          </div>
          <div className="rounded-[14px] bg-phone-card px-[14px] py-[10px]">
            <div className={`text-wall-ink-2 ${t.label}`}>THE SCREEN</div>
            <div className={`flex items-center gap-[8px] font-semibold text-wall-ink ${t.body}`}>
              {now.display_on === false ? 'Asleep' : now.brightness != null ? `${now.brightness}% bright` : '—'}
              {tint && now.display_on !== false && <span aria-hidden="true" className="h-[16px] w-[16px] rounded-full border border-solid border-wall-stone" style={{ background: tint }} />}
            </div>
            <div className={`text-wall-ink-2 ${t.detail}`}>{tint ? 'Tinted to match the room' : ''}</div>
          </div>
        </div>
        <p className={`m-0 mt-[10px] text-wall-ink-2 ${t.detail}`}>{live ? 'Live from the wall’s light sensor.' : `Measured ${ago(now.at, at)}.`} The screen warms its colors as the room’s light warms, and brightens in a bright room.</p>
      </div>
    </Group>
  )
}

const H = 190
const TOP = 12
const BOTTOM = 132

export function LightDay({ samples, at }: { samples: LightReading[] | null; at: Date }) {
  const t = useType()
  // The drawing's width: wider at the wall's size and on a laptop, so its words stay the size of the page's.
  const W = useSize() === 'wall' ? 1200 : typeof window !== 'undefined' && window.innerWidth >= 900 ? 1000 : 600
  if (!samples) return <Group label="The last 24 hours"><Quiet>Loading…</Quiet></Group>
  if (samples.length < 2) return <Group label="The last 24 hours"><Quiet>The wall started keeping its light this morning; the chart fills in through the day.</Quiet></Group>
  const end = at.getTime()
  const start = end - 24 * 3_600_000
  const x = (iso: string) => ((new Date(iso).getTime() - start) / (end - start)) * W
  const y = (b: number) => BOTTOM - (Math.min(100, Math.max(0, b)) / 100) * (BOTTOM - TOP)
  const pts = samples.filter((s) => s.brightness != null && new Date(s.at).getTime() >= start)
  const line = pts.map((s, i) => `${i ? 'L' : 'M'}${x(s.at).toFixed(1)} ${y(s.display_on === false ? 0 : s.brightness!).toFixed(1)}`).join(' ')
  const ticks = [18, 12, 6, 0].map((h) => {
    const d = new Date(end - h * 3_600_000)
    const hr = d.getHours()
    return { x: W - (h / 24) * W, label: h === 0 ? 'now' : hr === 0 ? 'midnight' : hr === 12 ? 'noon' : `${hr % 12 || 12} ${hr < 12 ? 'AM' : 'PM'}` }
  })
  const peak = Math.max(...pts.map((s) => s.brightness ?? 0))
  return (
    <Group label="The last 24 hours">
      <div className="px-[12px] pb-[8px] pt-[12px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`The screen's brightness over the last day, up to ${peak}%, with the room's light colour under it`}>
          <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="rgb(214,204,188)" strokeDasharray="3 4" />
          <text x="4" y={y(50) - 6} fontSize="20" fill="rgb(94,86,75)">50%</text>
          <path d={line} fill="none" stroke="rgb(168,132,80)" strokeWidth="3.5" strokeLinejoin="round" />
          {samples.map((s, i) => s.cct != null && (
            <rect key={i} x={x(s.at)} y={BOTTOM + 8} width={W / 288 + 1} height="16" fill={cctColor(s.cct)} />
          ))}
          <rect x="0" y={BOTTOM + 8} width={W} height="16" fill="none" stroke="rgb(214,204,188)" />
          {ticks.map((k) => <text key={k.label} x={Math.min(W - 4, Math.max(4, k.x))} y={H - 4} fontSize="20" fill="rgb(94,86,75)" textAnchor={k.x >= W - 1 ? 'end' : k.x <= 1 ? 'start' : 'middle'}>{k.label}</text>)}
        </svg>
        <p className={`m-0 mt-[4px] text-wall-ink-2 ${t.detail}`}>The line is the screen’s brightness (0 when asleep); the strip under it is the room’s light, warm to daylight.</p>
      </div>
    </Group>
  )
}
