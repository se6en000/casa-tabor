import { useEffect, useState } from 'react'
import { useArtwork } from '../../hooks/useArtwork'

interface Props {
  onDismiss: () => void
}

export default function ArtScreensaver({ onDismiss }: Props) {
  const { artwork, loaded, onLoad, next } = useArtwork(240)
  const [visible, setVisible] = useState(false)

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Touch anywhere to dismiss
  function handleDismiss() {
    setVisible(false)
    setTimeout(onDismiss, 500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{
        backgroundColor: '#0a0a0a',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }}
      onClick={handleDismiss}
      onTouchStart={handleDismiss}
    >
      {/* Mat frame */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '84vw',
          height: '84vh',
          backgroundColor: '#F5F0E8',  // warm linen mat
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.18), 0 8px 60px rgba(0,0,0,0.7)',
          padding: '3.5vw',
        }}
      >
        {/* Artwork */}
        {artwork && (
          <img
            key={artwork.id}
            src={artwork.imageUrl}
            alt={artwork.title}
            onLoad={onLoad}
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

        {/* Next artwork hint — subtle tap indicator */}
        <div
          className="absolute bottom-3 left-4 pointer-events-none"
          style={{ color: '#9b9285', fontSize: '0.55rem', fontFamily: 'Georgia, serif' }}
          onClick={(e) => { e.stopPropagation(); next() }}
        >
          tap to wake · say alexa
        </div>
      </div>
    </div>
  )
}
