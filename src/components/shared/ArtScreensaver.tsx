import { useEffect, useMemo, useRef, useState } from 'react'
import { useArtwork } from '../../hooks/useArtwork'
import { generateAdaptiveMatColor, generateHarmonizedBevel, MAT_PRESETS, type MatPresetKey } from '../../utils/colorUtils'
import { getTextureStyle, PAPER_GRAIN_TEXTURE } from '../../utils/textureUtils'
import { sanitizeArtworkMetadata } from '../../lib/artModeLibrary'
import { useTheme } from '../../contexts/ThemeContext'

const SENSOR = 'http://127.0.0.1:8765'
const MAT_MARGIN_H_PX = 72
const MAT_MARGIN_V_PX = 72
const MIN_FRAME_PX = 320
const MIDNIGHT_MAT_COLOR = '#07090D'
const MIDNIGHT_MAT_TEXTURE = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.22))'

const PAPER_BASE_LIGHT = '#F8F5EE'
const PAPER_BASE_DARK = '#12151B'

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
  onDismiss?: () => void
  rotationMins?: number
  adaptiveMatColor?: boolean
  artDimOffset?: number
  minArtWidthVw?: number
  shuffle?: boolean
  plaqueMode?: 'fade' | 'always' | 'hidden'
  matPreset?: MatPresetKey
}

export default function ArtScreensaver({
  onDismiss,
  rotationMins = 4,
  adaptiveMatColor = true,
  artDimOffset = 30,
  minArtWidthVw = 55,
  shuffle = true,
  plaqueMode = 'fade',
  matPreset = 'auto',
}: Props) {
  const { artwork, loaded, onLoad, onError, next } = useArtwork(rotationMins * 60, shuffle)
  const { isMidnightActive } = useTheme()
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [plaqueVisible, setPlaqueVisible] = useState(true)
  const [imageRatio, setImageRatio] = useState(16 / 9)
  const [matColor, setMatColor] = useState('#F6F3EA')
  const [dominantColor, setDominantColor] = useState('#808080')
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
  const paperBaseColor = darkThemeActive ? PAPER_BASE_DARK : PAPER_BASE_LIGHT

  const bevelColors = useMemo(() => {
    if (darkThemeActive) {
      return {
        top: '#2C323D',
        left: '#222832',
        right: '#12151B',
        bottom: '#0A0D12',
        radiosity: 'rgba(0,0,0,0.4)',
      }
    }
    return generateHarmonizedBevel(matColor, dominantColor)
  }, [darkThemeActive, matColor, dominantColor])

  const frameSize = useMemo(() => {
    const maxWidth = Math.max(viewport.width - MAT_MARGIN_H_PX * 2, MIN_FRAME_PX)
    const maxHeight = Math.max(viewport.height - MAT_MARGIN_V_PX * 2, MIN_FRAME_PX)
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
  }, [artDimOffset])

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

    if (matPreset && matPreset !== 'auto' && MAT_PRESETS[matPreset]) {
      setMatTransition(false)
      setMatColor(MAT_PRESETS[matPreset])
      setDominantColor('#808080')
      setTimeout(() => setMatTransition(true), 50)
      return
    }

    if (!artwork?.imageUrl || !adaptiveMatColor) return
    setMatTransition(false)
    const timeout = setTimeout(async () => {
      try {
        const colorAnalysis = await generateAdaptiveMatColor(artwork.imageUrl)
        setMatColor(colorAnalysis.matColor)
        setDominantColor(colorAnalysis.dominant)
        setTimeout(() => setMatTransition(true), 50)
      } catch {
        setMatColor('#E8E3D7')
        setDominantColor('#808080')
      }
    }, 50)
    return () => clearTimeout(timeout)
  }, [artwork?.id, artwork?.imageUrl, adaptiveMatColor, darkThemeActive, matPreset])

  useEffect(() => {
    if (plaqueMode === 'hidden') {
      setPlaqueVisible(false)
      return
    }
    if (plaqueMode === 'always') {
      setPlaqueVisible(true)
      return
    }
    // 'fade' mode: reveal for 5.5 seconds then smoothly fade out
    setPlaqueVisible(true)
    const timer = setTimeout(() => {
      setPlaqueVisible(false)
    }, 5500)
    return () => clearTimeout(timer)
  }, [artwork?.id, loaded, plaqueMode])

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
    setTimeout(() => onDismiss?.(), 500)
  }

  function handleNextPiece(e?: React.MouseEvent | React.TouchEvent) {
    e?.stopPropagation()
    setSwiping(true)
    setTimeout(() => setSwiping(false), 260)
    next()
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
    if (plaqueMode === 'fade' && !plaqueVisible) {
      setPlaqueVisible(true)
      setTimeout(() => setPlaqueVisible(false), 5000)
    }
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    if (endX - startX < -50) handleNextPiece(e)
    touchStartXRef.current = null
  }

  const { title: cleanTitle, artist: cleanArtist } = artwork
    ? sanitizeArtworkMetadata(artwork.title, artwork.artist)
    : { title: '', artist: '' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer select-none"
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
          // Subtle frame lip shadow (eliminates muddy black edge smudges)
          boxShadow: darkThemeActive
            ? 'inset 0 2px 5px rgba(0,0,0,0.7), inset 0 0 1px rgba(0,0,0,0.9)'
            : 'inset 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 2px rgba(0,0,0,0.06), inset 0 0 1px rgba(0,0,0,0.10)',
          padding: '3.5vw',
          transition: matTransition ? 'background-color 0.5s ease-out' : 'none',
        }}
      >
        {/* Passe-Partout Aperture Frame with 45-Degree Mitered Cotton Rag Bevel Core */}
        <div
          style={{
            position: 'relative',
            width: `${frameSize.width}px`,
            height: `${frameSize.height}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            boxSizing: 'content-box',
            backgroundColor: paperBaseColor,
            // 2.5px thick 45-degree mitered core bevel facets (dimmed warm ivory harmonized with mat & artwork light bounce)
            borderTop: `2.5px solid ${bevelColors.top}`,
            borderLeft: `2.5px solid ${bevelColors.left}`,
            borderRight: `2.5px solid ${bevelColors.right}`,
            borderBottom: `2.5px solid ${bevelColors.bottom}`,
            // Clean razor blade incision groove where bevel meets the mat board
            boxShadow: darkThemeActive
              ? '0 0 0 1px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.45)'
              : '0 0 0 1px rgba(50,40,30,0.10), 0 2px 8px rgba(0,0,0,0.05)',
            transform: ['translate3d(0px,0px,0)', 'translate3d(1px,0px,0)', 'translate3d(0px,1px,0)', 'translate3d(-1px,0px,0)'][driftIndex],
            transition: swiping ? 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1)' : 'transform 16s linear',
            overflow: 'hidden',
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
                objectFit: 'cover',
                objectPosition: 'center center',
                transform: 'scale(1.01)',
                display: 'block',
                filter: darkThemeActive ? 'contrast(0.98) brightness(0.92)' : 'none',
                mixBlendMode: 'normal',
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
              alt={cleanTitle}
              onLoad={handleImgLoad}
              onError={onError}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center center',
                transform: 'scale(1.01)',
                display: 'block',
                filter: darkThemeActive ? 'contrast(0.98) brightness(0.92)' : 'none',
                mixBlendMode: 'normal',
                opacity: loaded ? 1 : 0,
                transition: 'opacity 500ms ease-out',
              }}
            />
          )}
          
          {/* Cold-Press Watercolor Paper Grain & Canvas Tooth Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: `url("${PAPER_GRAIN_TEXTURE}")`,
              backgroundSize: '256px 256px',
              backgroundRepeat: 'repeat',
              mixBlendMode: 'overlay',
              opacity: darkThemeActive ? 0.35 : 0.70,
            }}
          />

          {/* Directional Gallery Spotlight & Ambient Falloff */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 5,
              background: darkThemeActive
                ? 'radial-gradient(ellipse 80% 65% at 50% 12%, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 55%, transparent 100%)'
                : 'radial-gradient(ellipse 85% 70% at 50% 12%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 50%, transparent 100%)',
            }}
          />

          {/* Subtle Directional Cast Shadow & Ambient Color Bounce Radiosity */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 10,
              boxShadow: darkThemeActive
                ? 'inset 0 3px 6px -1px rgba(0,0,0,0.65), inset 2px 0 4px -1px rgba(0,0,0,0.40)'
                : `inset 0 3px 6px -1px rgba(45,30,15,0.14), inset 2px 0 3px -1px rgba(45,30,15,0.06), inset 0 0 16px -2px ${bevelColors.radiosity}`,
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

        {artwork && loaded && plaqueMode !== 'hidden' && (
          <div
            className="absolute bottom-4 right-6 text-right pointer-events-none transition-opacity duration-1000 ease-in-out"
            style={{
              opacity: plaqueVisible ? 1 : 0,
              color: darkThemeActive ? 'rgba(215, 210, 200, 0.72)' : 'rgba(70, 55, 45, 0.75)',
              textShadow: darkThemeActive
                ? '0 1px 0px rgba(0, 0, 0, 0.85), 0 -1px 0.5px rgba(255, 255, 255, 0.08)'
                : '0 1px 0px rgba(255, 255, 255, 0.90), 0 -1px 0.5px rgba(0, 0, 0, 0.20)',
            }}
          >
            <p
              className="italic leading-snug tracking-wide"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", "Times New Roman", serif',
                fontSize: '0.80rem',
                fontWeight: 500,
                letterSpacing: '0.4px',
              }}
            >
              {cleanTitle}
            </p>
            <p
              className="leading-tight mt-0.5 uppercase tracking-wider"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", "Times New Roman", serif',
                fontSize: '0.62rem',
                fontWeight: 400,
                letterSpacing: '1px',
                opacity: 0.85,
              }}
            >
              {cleanArtist}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
