import { useEffect, useState } from 'react'
import { useArtwork } from '../../hooks/useArtwork'

const SENSOR = 'http://127.0.0.1:8765'

interface Props {
  onDismiss: () => void
  rotationMins?: number
  minArtWidthVw?: number
  artDimOffset?: number  // % below ambient lux (0–80)
}

export default function ArtScreensaver({ onDismiss, rotationMins = 4, minArtWidthVw = 55, artDimOffset = 30 }: Props) {
  const { artwork, loaded, onLoad } = useArtwork(rotationMins * 60)
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string | undefined>(undefined)
  const [isPortrait, setIsPortrait] = useState(false)

  // Fade in on mount, then allow dismiss after a grace period
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 50)
    const t2 = setTimeout(() => setDismissable(true), 1500)
    // Tell sensor bridge to dim monitor relative to ambient lux
    fetch(`${SENSOR}/display/art-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dim_offset: artDimOffset / 100 }),
    }).catch(() => { /* non-Pi — ignore */ })
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      // Restore auto-brightness when art mode exits
      fetch(`${SENSOR}/display/art-mode-off`, { method: 'POST' }).catch(() => {})
    }
  }, [])

  // Reset aspect ratio when artwork changes
  useEffect(() => { setAspectRatio(undefined); setIsPortrait(false) }, [artwork?.id])

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setAspectRatio(`${img.naturalWidth} / ${img.naturalHeight}`)
      setIsPortrait(img.naturalHeight > img.naturalWidth)
    }
    onLoad()
  }

  function handleDismiss() {
    if (!dismissable) return
    setVisible(false)
    setTimeout(onDismiss, 500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }}
      onClick={handleDismiss}
    >
      {/* Full-bleed mat — linen fills the entire screen */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: '#F5F0E8',
          boxShadow: [
            'inset 0 36px 48px -12px rgba(0,0,0,0.50)',   // top — strongest, light comes from above
            'inset 36px 0 48px -12px rgba(0,0,0,0.38)',   // left — medium
            'inset -36px 0 48px -12px rgba(0,0,0,0.32)',  // right — slightly lighter
            'inset 0 -18px 24px -12px rgba(0,0,0,0.10)',  // bottom — barely visible, light from above
          ].join(', '),
          padding: '3.5vw',
        }}
      >
        {/* Bevel wrapper — sized to actual image aspect ratio so shadow hugs the painting */}
        <div
          style={{
            position: 'relative',
            aspectRatio: aspectRatio,
            ...(isPortrait
              ? { minHeight: '70vh', maxHeight: '100%', maxWidth: '100%' }
              : { minWidth: `${minArtWidthVw}vw`, maxWidth: '100%', maxHeight: '100%' }
            ),
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {artwork && (
            <img
              key={artwork.id}
              src={artwork.imageUrl}
              alt={artwork.title}
              onLoad={handleImgLoad}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                opacity: loaded ? 1 : 0,
                transition: 'opacity 1.2s ease',
              }}
            />
          )}
          {/* Bevel overlay — sits on top of image so inset shadow is visible */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              boxShadow: `
                inset 0 6px 10px rgba(0,0,0,0.55),
                inset 5px 0 8px rgba(0,0,0,0.42),
                inset -5px 0 8px rgba(0,0,0,0.35),
                inset 0 -3px 5px rgba(0,0,0,0.10),
                inset -3px -3px 6px rgba(255,255,255,0.20)
              `,
            }}
          />
        </div>

        {/* Loading shimmer */}
        {!loaded && (
          <div
            className="absolute inset-0 m-[3.5vw]"
            style={{ backgroundColor: '#e8e3db', animation: 'pulse 2s ease-in-out infinite' }}
          />
        )}

        {/* Gallery label — bottom right inside mat */}
        {artwork && loaded && (
          <div
            className="absolute bottom-3 right-4 text-right pointer-events-none"
            style={{ color: '#6b6355' }}
          >
            <p className="text-caption italic leading-tight" style={{ fontFamily: 'Georgia, serif', fontSize: '0.65rem' }}>
              {artwork.title}
            </p>
            <p className="text-caption leading-tight mt-0.5" style={{ fontFamily: 'Georgia, serif', fontSize: '0.6rem', opacity: 0.75 }}>
              {artwork.artist}
            </p>
          </div>
        )}

        {/* Hint */}
        <div
          className="absolute bottom-3 left-4 pointer-events-none"
          style={{ color: '#9b9285', fontSize: '0.55rem', fontFamily: 'Georgia, serif' }}
        >
          tap to wake · say alexa
        </div>
      </div>
    </div>
  )
}
