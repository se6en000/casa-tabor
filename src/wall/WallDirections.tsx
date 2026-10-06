import { useMemo, useState } from 'react'
import { qrModules, qrPath } from './qr'

// Directions to someone on the wall (canvas 13c, approved by Jake 2026-09-30): the route as a QR code
// his phone's camera opens in Google Maps, "Call" as a code that dials; on a computer, plain links.

export interface Route {
  name: string
  address: string
  phone: string | null
  maps: string
}

/** A phone number a tel: link can dial: digits with the country code. */
export function telOf(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return `tel:${digits}`
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return `tel:${digits}`
}

function Qr({ text, label }: { text: string; label: string }) {
  const modules = useMemo(() => qrModules(text), [text])
  const n = modules.length
  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="h-[232px] w-[232px] shrink-0 rounded-[12px] bg-wall-on-pigment text-wall-ink" shapeRendering="crispEdges">
      <path d={qrPath(modules)} fill="currentColor" />
    </svg>
  )
}

export default function WallDirections({ route, computer }: { route: Route; computer: boolean }) {
  const [calling, setCalling] = useState(false)
  const tel = telOf(route.phone)
  const link = 'flex h-[56px] items-center rounded-full px-[28px] text-wall-detail font-semibold no-underline'
  if (computer) {
    return (
      <div aria-label={`Directions to ${route.name}`} className="flex items-center gap-[14px]">
        <a href={route.maps} target="_blank" rel="noreferrer" className={`${link} bg-wall-on-pigment text-wall-ink`}>Open Google Maps</a>
        {tel && <a href={tel} className={`${link} border border-solid border-wall-ink-2 text-wall-on-pigment`}>Call {route.name}</a>}
        <span className="text-wall-detail text-wall-night-ink-2">{route.address}</span>
      </div>
    )
  }
  return (
    <div aria-label={`Directions to ${route.name}`} className="flex max-w-[720px] items-center gap-[24px] rounded-[24px] bg-wall-on-pigment px-[26px] py-[22px] text-wall-ink">
      <Qr text={calling && tel ? tel : route.maps} label={calling ? `QR code: call ${route.name}` : `QR code: directions to ${route.name} in Google Maps`} />
      <div className="flex min-w-0 flex-col gap-[10px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{calling ? 'CALL' : 'DIRECTIONS'}</span>
        <span className="font-display text-wall-date font-bold leading-tight">{route.name}</span>
        <span className="text-wall-detail text-wall-ink-2">{calling ? route.phone : route.address}</span>
        <span className="text-wall-detail text-wall-ink-2">{calling ? 'Point your phone’s camera here to call.' : 'Point your phone’s camera here — Google Maps opens with the route.'}</span>
        {tel && (
          <button type="button" onClick={() => setCalling((c) => !c)} className="h-[52px] self-start rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[22px] text-wall-detail font-semibold text-wall-ink">
            {calling ? 'Directions instead' : `Call ${route.name}`}
          </button>
        )}
      </div>
    </div>
  )
}
