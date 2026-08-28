import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useArtwork, artworkMetadataCache, type Artwork } from '../../hooks/useArtwork'
import { generateAdaptiveMatColor, generateHarmonizedBevel, MAT_PRESETS, type MatPresetKey } from '../../utils/colorUtils'
import { getTextureStyle, PAPER_GRAIN_TEXTURE } from '../../utils/textureUtils'
import {
  sanitizeArtworkMetadata,
  SIGNATURE_STYLES,
  SIGNATURE_SIZE_SCALES,
  getSignatureInkStyle,
} from '../../lib/artModeLibrary'
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
  const { artwork, onLoad, onError, next, prev } = useArtwork(rotationMins * 60, shuffle)
  const { isMidnightActive } = useTheme()
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [plaqueVisible, setPlaqueVisible] = useState(true)
  const [imageRatio, setImageRatio] = useState(16 / 9)
  const [matColor, setMatColor] = useState('#F6F3EA')
  const [dominantColor, setDominantColor] = useState('#808080')
  const [activeArtwork, setActiveArtwork] = useState<Artwork | null>(artwork)
  const [outgoingArtwork, setOutgoingArtwork] = useState<Artwork | null>(null)
  const [crossFadeActive, setCrossFadeActive] = useState(false)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }))

  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Screen saver mount and ambient display brightness sync
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 40)
    const t2 = setTimeout(() => setDismissable(true), 1200)
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

  // Viewport resize tracking for kiosk & mobile
  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  // Smooth Artwork Dissolve Transition Pipeline (2.8-Second Cinematic Dissolve)
  useEffect(() => {
    if (!artwork) return

    // Check if image ratio or colors are already in prefetch cache
    const cached = artworkMetadataCache.get(artwork.imageUrl)
    if (cached) {
      setImageRatio(cached.aspectRatio)
      if (!darkThemeActive && matPreset === 'auto' && adaptiveMatColor) {
        setMatColor(cached.matColor)
        setDominantColor(cached.dominantColor)
      }
    }

    if (!activeArtwork) {
      setActiveArtwork(artwork)
      return
    }

    if (activeArtwork.id !== artwork.id) {
      const prevPiece = activeArtwork
      setOutgoingArtwork(prevPiece)
      setActiveArtwork(artwork)
      setCrossFadeActive(true)

      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = setTimeout(() => {
        setOutgoingArtwork(null)
        setCrossFadeActive(false)
      }, 2850)
    }
  }, [artwork?.id, artwork?.imageUrl, activeArtwork, darkThemeActive, matPreset, adaptiveMatColor])

  // Adaptive Mat Color & Harmonized Lighting Sync
  useEffect(() => {
    if (darkThemeActive) {
      setMatColor(MIDNIGHT_MAT_COLOR)
      return
    }

    if (matPreset && matPreset !== 'auto' && MAT_PRESETS[matPreset]) {
      setMatColor(MAT_PRESETS[matPreset])
      setDominantColor('#808080')
      return
    }

    if (!artwork?.imageUrl || !adaptiveMatColor) return

    const cached = artworkMetadataCache.get(artwork.imageUrl)
    if (cached) {
      setMatColor(cached.matColor)
      setDominantColor(cached.dominantColor)
      return
    }

    let cancelled = false
    void generateAdaptiveMatColor(artwork.imageUrl)
      .then(analysis => {
        if (!cancelled) {
          setMatColor(analysis.matColor)
          setDominantColor(analysis.dominant)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMatColor('#E8E3D7')
          setDominantColor('#808080')
        }
      })

    return () => {
      cancelled = true
    }
  }, [artwork?.id, artwork?.imageUrl, adaptiveMatColor, darkThemeActive, matPreset])

  // Plaque reveal timer
  useEffect(() => {
    if (plaqueMode === 'hidden') {
      setPlaqueVisible(false)
      return
    }
    if (plaqueMode === 'always') {
      setPlaqueVisible(true)
      return
    }
    // 'fade' mode: reveal for 6 seconds then smoothly fade out
    setPlaqueVisible(true)
    const timer = setTimeout(() => {
      setPlaqueVisible(false)
    }, 6000)
    return () => clearTimeout(timer)
  }, [artwork?.id, plaqueMode])

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget
      if (img.naturalWidth && img.naturalHeight) {
        setImageRatio(img.naturalWidth / img.naturalHeight)
      }
      onLoad()
    },
    [onLoad]
  )

  const handleDismiss = useCallback(() => {
    if (!dismissable) return
    setVisible(false)
    setTimeout(() => onDismiss?.(), 500)
  }, [dismissable, onDismiss])

  const handleNextPiece = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation()
      next()
    },
    [next]
  )

  const handlePrevPiece = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation()
      prev()
    },
    [prev]
  )

  // Keyboard navigation (Arrow keys to switch, Escape/Space to dismiss)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextPiece()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevPiece()
      } else if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNextPiece, handlePrevPiece, handleDismiss])

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
    touchStartYRef.current = e.touches[0]?.clientY ?? null
    if (plaqueMode === 'fade' && !plaqueVisible) {
      setPlaqueVisible(true)
      setTimeout(() => setPlaqueVisible(false), 5000)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current
    const startY = touchStartYRef.current
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    const endY = e.changedTouches[0]?.clientY ?? (startY ?? 0)
    const diffX = endX - startX
    const diffY = endY - (startY ?? 0)

    // Horizontal swipe gesture
    if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        handleNextPiece(e)
      } else {
        handlePrevPiece(e)
      }
    }
    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  const currentToDisplay = activeArtwork || artwork
  const { title: cleanTitle, artist: cleanArtist } = currentToDisplay
    ? sanitizeArtworkMetadata(currentToDisplay.title, currentToDisplay.artist)
    : { title: '', artist: '' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer select-none overflow-hidden"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        backgroundColor: '#000000',
      }}
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
          // Subtle frame lip shadow with warm depth
          boxShadow: darkThemeActive
            ? 'inset 0 2px 6px rgba(0,0,0,0.7), inset 0 0 1px rgba(0,0,0,0.9)'
            : 'inset 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 2px rgba(0,0,0,0.06), inset 0 0 1px rgba(0,0,0,0.10)',
          padding: '3.5vw',
          transition: 'background-color 2800ms cubic-bezier(0.4, 0, 0.2, 1)',
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
            // 4.5px thick 45-degree mitered core bevel facets (thick 8-ply museum board depth)
            borderTop: `4.5px solid ${bevelColors.top}`,
            borderLeft: `4.5px solid ${bevelColors.left}`,
            borderRight: `4.5px solid ${bevelColors.right}`,
            borderBottom: `4.5px solid ${bevelColors.bottom}`,
            // Clean razor blade incision groove where bevel meets the mat board
            boxShadow: darkThemeActive
              ? '0 0 0 1px rgba(0,0,0,0.9), 0 3px 12px rgba(0,0,0,0.6)'
              : '0 0 0 1px rgba(50,40,30,0.18), 0 3px 10px rgba(0,0,0,0.08)',
            transition: 'width 2800ms cubic-bezier(0.4, 0, 0.2, 1), height 2800ms cubic-bezier(0.4, 0, 0.2, 1), border-color 2800ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 2800ms cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          {/* Base Active Artwork Layer (Dissolves In from 0 to 1 over 2.8s at zIndex: 1) */}
          {currentToDisplay && (
            <div
              key={`in-${currentToDisplay.id}`}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                animation: crossFadeActive ? 'casa-art-dissolve-in 2800ms cubic-bezier(0.4, 0, 0.2, 1) forwards' : 'none',
                willChange: 'opacity',
              }}
            >
              <img
                src={currentToDisplay.imageUrl}
                alt={cleanTitle}
                onLoad={handleImgLoad}
                onError={onError}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  display: 'block',
                  filter: darkThemeActive ? 'contrast(0.98) brightness(0.92)' : 'none',
                  animation: 'casa-art-drift 48s ease-in-out infinite alternate',
                  willChange: 'transform',
                  transformOrigin: 'center center',
                }}
              />

              {/* Artist Signature Overlay on Active Artwork */}
              {currentToDisplay.signature?.enabled && Boolean(currentToDisplay.signature.text) && (() => {
                const sigStyle = SIGNATURE_STYLES[currentToDisplay.signature.style] || SIGNATURE_STYLES.fountain
                const inkStyle = getSignatureInkStyle(
                  currentToDisplay.signature.color,
                  dominantColor,
                  currentToDisplay.signature.opacity ?? 0.55
                )
                const sizeScale = SIGNATURE_SIZE_SCALES[currentToDisplay.signature.size || 'md'] || 1.0
                const isBottomLeft = currentToDisplay.signature.position === 'bottom-left'
                return (
                  <div
                    key={`sig-${currentToDisplay.id}`}
                    style={{
                      position: 'absolute',
                      bottom: 'clamp(14px, 3.2%, 36px)',
                      ...(isBottomLeft ? { left: 'clamp(16px, 3.5%, 40px)', textAlign: 'left' } : { right: 'clamp(16px, 3.5%, 40px)', textAlign: 'right' }),
                      fontFamily: sigStyle.fontFamily,
                      fontSize: `clamp(${sigStyle.baseFontSizeRem * 0.9 * sizeScale}rem, ${2 * sizeScale}vw, ${sigStyle.baseFontSizeRem * 1.6 * sizeScale}rem)`,
                      fontWeight: sigStyle.weight,
                      color: inkStyle.color,
                      textShadow: inkStyle.textShadow,
                      mixBlendMode: inkStyle.blendMode || 'normal',
                      transform: isBottomLeft ? 'rotate(0.8deg)' : 'rotate(-1.2deg)',
                      letterSpacing: '0.015em',
                      lineHeight: 1.55,
                      paddingTop: '12px',
                      paddingBottom: '16px',
                      filter: 'blur(0.2px) contrast(1.05)',
                      textRendering: 'geometricPrecision',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 3,
                      opacity: 1,
                      maxWidth: sizeScale > 1.2 ? '65%' : '50%',
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                    }}
                  >
                    {currentToDisplay.signature.text}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Top Outgoing Artwork Layer (Dissolves Out from 1 to 0 over 2.8s at zIndex: 2) */}
          {outgoingArtwork && (
            <div
              key={`out-${outgoingArtwork.id}`}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none',
                animation: 'casa-art-dissolve-out 2800ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
                willChange: 'opacity',
              }}
            >
              <img
                src={outgoingArtwork.imageUrl}
                alt={outgoingArtwork.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  display: 'block',
                  filter: darkThemeActive ? 'contrast(0.98) brightness(0.92)' : 'none',
                }}
              />

              {/* Artist Signature on Outgoing Layer */}
              {outgoingArtwork.signature?.enabled && Boolean(outgoingArtwork.signature.text) && (() => {
                const sigStyle = SIGNATURE_STYLES[outgoingArtwork.signature.style] || SIGNATURE_STYLES.fountain
                const inkStyle = getSignatureInkStyle(
                  outgoingArtwork.signature.color,
                  dominantColor,
                  outgoingArtwork.signature.opacity ?? 0.55
                )
                const sizeScale = SIGNATURE_SIZE_SCALES[outgoingArtwork.signature.size || 'md'] || 1.0
                const isBottomLeft = outgoingArtwork.signature.position === 'bottom-left'
                return (
                  <div
                    key={`sig-out-${outgoingArtwork.id}`}
                    style={{
                      position: 'absolute',
                      bottom: 'clamp(14px, 3.2%, 36px)',
                      ...(isBottomLeft ? { left: 'clamp(16px, 3.5%, 40px)', textAlign: 'left' } : { right: 'clamp(16px, 3.5%, 40px)', textAlign: 'right' }),
                      fontFamily: sigStyle.fontFamily,
                      fontSize: `clamp(${sigStyle.baseFontSizeRem * 0.9 * sizeScale}rem, ${2 * sizeScale}vw, ${sigStyle.baseFontSizeRem * 1.6 * sizeScale}rem)`,
                      fontWeight: sigStyle.weight,
                      color: inkStyle.color,
                      textShadow: inkStyle.textShadow,
                      mixBlendMode: inkStyle.blendMode || 'normal',
                      transform: isBottomLeft ? 'rotate(0.8deg)' : 'rotate(-1.2deg)',
                      letterSpacing: '0.015em',
                      lineHeight: 1.55,
                      paddingTop: '12px',
                      paddingBottom: '16px',
                      filter: 'blur(0.2px) contrast(1.05)',
                      textRendering: 'geometricPrecision',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 3,
                      maxWidth: sizeScale > 1.2 ? '65%' : '50%',
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                    }}
                  >
                    {outgoingArtwork.signature.text}
                  </div>
                )
              })()}
            </div>
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
              opacity: darkThemeActive ? 0.35 : 0.65,
              zIndex: 4,
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
              zIndex: 6,
              boxShadow: darkThemeActive
                ? 'inset 0 3px 6px -1px rgba(0,0,0,0.65), inset 2px 0 4px -1px rgba(0,0,0,0.40)'
                : `inset 0 3px 6px -1px rgba(45,30,15,0.14), inset 2px 0 3px -1px rgba(45,30,15,0.06), inset 0 0 16px -2px ${bevelColors.radiosity}`,
              transition: 'box-shadow 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        {/* Tactile Edge Tap Zones for Kiosk Navigation */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[22%] z-20 cursor-pointer"
          title="Previous artwork"
          onClick={handlePrevPiece}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-[22%] z-20 cursor-pointer"
          title="Next artwork"
          onClick={handleNextPiece}
        />

        {/* Museum Gallery Plaque */}
        {currentToDisplay && plaqueMode !== 'hidden' && (
          <div
            className="absolute bottom-5 right-7 text-right pointer-events-none"
            style={{
              opacity: plaqueVisible ? 1 : 0,
              transform: plaqueVisible ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
              color: darkThemeActive ? 'rgba(220, 215, 205, 0.78)' : 'rgba(65, 50, 40, 0.80)',
              textShadow: darkThemeActive
                ? '0 1px 1px rgba(0, 0, 0, 0.90), 0 -1px 0.5px rgba(255, 255, 255, 0.08)'
                : '0 1px 0px rgba(255, 255, 255, 0.92), 0 -1px 0.5px rgba(0, 0, 0, 0.18)',
              zIndex: 30,
            }}
          >
            <p
              className="italic leading-snug tracking-wide"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", "Times New Roman", serif',
                fontSize: '0.86rem',
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
                fontSize: '0.64rem',
                fontWeight: 400,
                letterSpacing: '1.2px',
                opacity: 0.88,
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

