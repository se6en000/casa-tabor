import { useEffect, useState } from 'react'
import { useArtwork } from '../../hooks/useArtwork'

interface Props {
  onDismiss: () => void
  rotationMins?: number
  minArtWidthVw?: number
}

export default function ArtScreensaver({ onDismiss, rotationMins = 4, minArtWidthVw = 55 }: Props) {
  const { artwork, loaded, onLoad } = useArtwork(rotationMins * 60)
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string | undefined>(undefined)

  // Fade in on mount, then allow dismiss after a grace period
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 50)
    const t2 = setTimeout(() => setDismissable(true), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Reset aspect ratio when artwork changes
  useEffect(() => { setAspectRatio(undefined) }, [artwork?.id])

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setAspectRatio(`${img.naturalWidth} / ${img.naturalHeight}`)
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
          boxShadow: 'inset 0 0 80px 20px rgba(0,0,0,0.45)',
          padding: '3.5vw',
        }}
      >
        {/* Bevel wrapper — sized to actual image aspect ratio so shadow hugs the painting */}
        <div
          style={{
            position: 'relative',
            aspectRatio: aspectRatio,
            minWidth: `${minArtWidthVw}vw`,
            maxWidth: '100%',
            maxHeight: '100%',
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
                objectFit: 'fill',
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
                inset 0 -6px 10px rgba(0,0,0,0.27),
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
            <p className="text-xs italic leading-tight" style={{ fontFamily: 'Georgia, serif', fontSize: '0.65rem' }}>
              {artwork.title}
            </p>
            <p className="text-xs leading-tight mt-0.5" style={{ fontFamily: 'Georgia, serif', fontSize: '0.6rem', opacity: 0.75 }}>
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
