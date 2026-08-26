import { useEffect, useMemo, useRef, useState } from 'react'
import { useArtwork } from '../../hooks/useArtwork'
import { generateAdaptiveMatColor } from '../../utils/colorUtils'
import { getTextureStyle } from '../../utils/textureUtils'
import { useTheme } from '../../contexts/ThemeContext'

const SENSOR = 'http://127.0.0.1:8765'
const EDGE_MAT_H_PX = 90
const EDGE_MAT_TOP_PX = 76
const EDGE_MAT_BOT_PX = 112
const MIN_FRAME_PX = 320
const MIDNIGHT_MAT_COLOR = '#07090D'
const MIDNIGHT_MAT_TEXTURE = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.22))'

function isDarkColor(color: string): boolean {
  const raw = color.trim()
  if (!raw) return false

  let r = 255
  let g = 255
  let b = 255

  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    }
  } else {
    const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
    if (m) {
      r = Number(m[1])
      g = Number(m[2])
      b = Number(m[3])
    }
  }

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.45
}

interface Props {
  onDismiss: () => void
  rotationMins?: number
  minArtWidthVw?: number
  artDimOffset?: number
  adaptiveMatColor?: boolean
}

export default function ArtScreensaver({ onDismiss, rotationMins = 4, minArtWidthVw = 55, artDimOffset = 30, adaptiveMatColor = true }: Props) {
  const { artwork, loaded, onLoad, onError, next } = useArtwork(rotationMins * 60)
  const { isMidnightActive } = useTheme()
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [imageRatio, setImageRatio] = useState(16 / 9)
  const [matColor, setMatColor] = useState('#F5F0E8')
  const [matTransition, setMatTransition] = useState(false)
  const [driftIndex, setDriftIndex] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }))
  
  // Previous artwork for cross-fade
  const [prevArtwork, setPrevArtwork] = useState<typeof artwork>(null)
  
  const touchStartXRef = useRef<number | null>(null)
  const textureStyle = useMemo(() => getTextureStyle(), [])
  const darkThemeActive = useMemo(() => {
    if (typeof window === 'undefined') return isMidnightActive
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-casa-bg')
    return isMidnightActive || isDarkColor(bg)
  }, [isMidnightActive])
  const matTexture = darkThemeActive ? MIDNIGHT_MAT_TEXTURE : textureStyle.backgroundImage
  const matBlendMode = darkThemeActive ? 'normal' : textureStyle.backgroundBlendMode
  const frameSize = useMemo(() => {
    const maxWidth = Math.max(viewport.width - EDGE_MAT_H_PX * 2, MIN_FRAME_PX)
    const maxHeight = Math.max(viewport.height - (EDGE_MAT_TOP_PX + EDGE_MAT_BOT_PX), MIN_FRAME_PX)
    const minWidth = Math.min(maxWidth, (viewport.width * minArtWidthVw) / 100)

    let width = Math.max(maxWidth, minWidth)
    let height = width / imageRatio

    if (height > maxHeight) {
      height = maxHeight
      width = height * imageRatio
    }

    return { width: Math.round(width), height: Math.round(height) }
  }, [viewport.width, viewport.height, imageRatio, minArtWidthVw])

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 50)
    const t2 = setTimeout(() => setDismissable(true), 1500)
    fetch(`${SENSOR}/display/art-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dim_offset: artDimOffset / 100 }),
    }).catch(() => {})
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      fetch(`${SENSOR}/display/art-mode-off`, { method: 'POST' }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    // When artwork changes, save the current one as previous for cross-fade
    if (artwork) {
      setPrevArtwork(artwork)
    }
  }, [artwork?.id])

  useEffect(() => {
    const t = setInterval(() => setDriftIndex(i => (i + 1) % 4), 45000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (darkThemeActive) {
      setMatTransition(false)
      setMatColor(MIDNIGHT_MAT_COLOR)
      setTimeout(() => setMatTransition(true), 50)
      return
    }

    if (!artwork?.imageUrl || !adaptiveMatColor) return
    setMatTransition(false)
    const timeout = setTimeout(async () => {
      try {
        const colorAnalysis = await generateAdaptiveMatColor(artwork.imageUrl)
        setMatColor(colorAnalysis.matColor)
        setTimeout(() => setMatTransition(true), 50)
      } catch {
        setMatColor('#F5F0E8')
      }
    }, 50)
    return () => clearTimeout(timeout)
  }, [artwork?.id, artwork?.imageUrl, adaptiveMatColor, darkThemeActive])

  const apertureShadow = useMemo(() => {
    if (darkThemeActive) {
      return [
        'inset 1px 1px 0px rgba(255, 255, 255, 0.10)',
        'inset -1.5px -1.5px 0px rgba(0, 0, 0, 0.70)',
        'inset 0 12px 24px -2px rgba(0, 0, 0, 0.75)',
        'inset 6px 0 16px -2px rgba(0, 0, 0, 0.45)',
        'inset -6px 0 16px -2px rgba(0, 0, 0, 0.35)',
        'inset 0 -6px 10px -2px rgba(0, 0, 0, 0.30)',
        '0 0 30px rgba(0,0,0,0.35)',
      ].join(', ')
    }
    return [
      'inset 1.5px 1.5px 0px rgba(255, 255, 255, 0.88)',
      'inset -1.5px -1.5px 0px rgba(70, 60, 50, 0.28)',
      'inset 0 10px 22px -2px rgba(20, 15, 10, 0.42)',
      'inset 6px 0 14px -2px rgba(20, 15, 10, 0.22)',
      'inset -6px 0 14px -2px rgba(20, 15, 10, 0.16)',
      'inset 0 -4px 8px -2px rgba(20, 15, 10, 0.10)',
      '0 0 28px rgba(0,0,0,0.12)',
    ].join(', ')
  }, [darkThemeActive])

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setImageRatio(img.naturalWidth / img.naturalHeight)
    }
    onLoad()
  }

  function handleDismiss() {
    if (!dismissable) return
    setVisible(false)
    setTimeout(onDismiss, 500)
  }

  function handleNextPiece(e?: React.MouseEvent | React.TouchEvent) {
    e?.stopPropagation()
    setSwiping(true)
    setTimeout(() => setSwiping(false), 260)
    next()
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    if (endX - startX < -50) handleNextPiece(e)
    touchStartXRef.current = null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}
      onClick={handleDismiss}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: matColor,
          backgroundImage: matTexture,
          backgroundSize: textureStyle.backgroundSize,
          backgroundPosition: textureStyle.backgroundPosition,
          backgroundAttachment: textureStyle.backgroundAttachment,
          backgroundBlendMode: matBlendMode,
          boxShadow: [
            'inset 0 36px 48px -12px rgba(0,0,0,0.50)',
            'inset 18px 0 24px -12px rgba(0,0,0,0.10)',
            'inset -36px 0 48px -12px rgba(0,0,0,0.32)',
            'inset 0 -18px 24px -12px rgba(0,0,0,0.10)',
          ].join(', '),
          padding: '3.5vw 3.5vw 4.8vw 3.5vw',
          transition: matTransition ? 'background-color 0.5s ease-out' : 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: `${frameSize.width}px`,
            height: `${frameSize.height}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            overflow: 'hidden',
            display: 'flex',
            transform: ['translate3d(0px,0px,0)', 'translate3d(1px,0px,0)', 'translate3d(0px,1px,0)', 'translate3d(-1px,0px,0)'][driftIndex],
            transition: swiping ? 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1)' : 'transform 16s linear',
          }}
        >
          {/* Previous image fades out as new one fades in */}
          {prevArtwork && (
            <img
              src={prevArtwork.imageUrl}
              alt={prevArtwork.title}
              onError={onError}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                opacity: loaded ? 0 : 1,
                transition: 'opacity 500ms ease-out',
                pointerEvents: 'none',
              }}
            />
          )}
          
          {/* Current image fades in */}
          {artwork && (
            <img
              key={artwork.id}
              src={artwork.imageUrl}
              alt={artwork.title}
              onLoad={handleImgLoad}
              onError={onError}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                opacity: loaded ? 1 : 0,
                transition: 'opacity 500ms ease-out',
              }}
            />
          )}
          
          {/* Directional 45-Degree Beveled Mat Cutout & Cast Shadow */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              boxShadow: apertureShadow,
            }}
          />
        </div>

        {!loaded && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${frameSize.width}px`,
              height: `${frameSize.height}px`,
              backgroundColor: matColor,
              backgroundImage: matTexture,
              backgroundSize: textureStyle.backgroundSize,
              backgroundPosition: textureStyle.backgroundPosition,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        )}

        {artwork && loaded && (
          <div className="absolute bottom-4 right-5 text-right pointer-events-none" style={{ color: darkThemeActive ? '#D7D2C8' : '#5a4f4a' }}>
            <p className="text-caption italic leading-tight" style={{ fontFamily: 'Georgia, serif', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.3px' }}>
              {artwork.title}
            </p>
            <p className="text-caption leading-tight mt-0.5" style={{ fontFamily: 'Georgia, serif', fontSize: '0.62rem', opacity: 0.7, letterSpacing: '0.2px' }}>
              {artwork.artist}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
