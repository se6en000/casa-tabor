import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Info } from 'lucide-react'
import {
  useArtwork,
  artworkMetadataCache,
  type Artwork,
  type PresentationUnit,
} from '../../hooks/useArtwork'
import { ArtworkProvenanceCard } from './ArtworkProvenanceCard'
import { Button, IconButton } from '../ui'
import {
  generateHarmonizedBevel,
  getPaletteColorForKey,
  MAT_PRESETS,
  DEFAULT_MAT_COLOR,
  DEFAULT_DOMINANT_COLOR,
  type MatPresetKey,
} from '../../utils/colorUtils'
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
  aspectRatioMode?: 'mixed' | 'diptych_only' | 'single_only'
}

export default function ArtScreensaver({
  onDismiss,
  rotationMins = 4,
  artDimOffset = 30,
  minArtWidthVw = 55,
  shuffle = true,
  plaqueMode = 'fade',
  matPreset = 'auto',
}: Props) {
  const { presentationUnit, onLoad, onError, next, prev } = useArtwork(
    rotationMins * 60,
    shuffle,
  )
  const { isMidnightActive } = useTheme()
  const [visible, setVisible] = useState(false)
  const [dismissable, setDismissable] = useState(false)
  const [plaqueVisible, setPlaqueVisible] = useState(true)

  const [activeUnit, setActiveUnit] = useState<PresentationUnit | null>(presentationUnit)
  const [outgoingUnit, setOutgoingUnit] = useState<PresentationUnit | null>(null)

  const [infoOpen, setInfoOpen] = useState(false)
  const [provenanceTab, setProvenanceTab] = useState<'left' | 'right'>('left')
  const infoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }))

  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleToggleInfo = useCallback(
    (tab: 'left' | 'right' = 'left', e?: React.SyntheticEvent) => {
      e?.stopPropagation()
      setProvenanceTab(tab)
      setInfoOpen(prev => {
        const nextState = !prev
        if (infoTimerRef.current) clearTimeout(infoTimerRef.current)
        if (nextState) {
          infoTimerRef.current = setTimeout(() => {
            setInfoOpen(false)
          }, 8000)
        }
        return nextState
      })
    },
    [],
  )

  // Auto-close info card on unit change
  useEffect(() => {
    setInfoOpen(false)
    if (infoTimerRef.current) clearTimeout(infoTimerRef.current)
  }, [presentationUnit?.id])

  const textureStyle = useMemo(() => getTextureStyle(), [])
  const darkThemeActive = useMemo(() => {
    if (typeof window === 'undefined') return isMidnightActive
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-casa-bg')
    return isMidnightActive || isDarkColor(bg)
  }, [isMidnightActive])

  const diptychMullion = useMemo(() => {
    return Math.round(Math.max(32, Math.min(56, viewport.width * 0.026)))
  }, [viewport.width])

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

  // Smooth Slide Cross-Dissolve Transition Pipeline (1.2-Second Solid-Base Cross-Dissolve)
  useEffect(() => {
    if (!presentationUnit) return

    if (!activeUnit) {
      setActiveUnit(presentationUnit)
      return
    }

    if (activeUnit.id !== presentationUnit.id) {
      const prevUnit = activeUnit
      setOutgoingUnit(prevUnit)
      setActiveUnit(presentationUnit)

      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = setTimeout(() => {
        setOutgoingUnit(null)
      }, 1250)
    }
  }, [presentationUnit?.id, activeUnit])

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
  }, [presentationUnit?.id, plaqueMode])

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
    [next],
  )

  const handlePrevPiece = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation()
      prev()
    },
    [prev],
  )

  // Keyboard navigation (Arrow keys to switch, Escape/Space to dismiss, I for info)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextPiece()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevPiece()
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        handleToggleInfo('left')
      } else if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (infoOpen) {
          setInfoOpen(false)
        } else {
          handleDismiss()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNextPiece, handlePrevPiece, handleDismiss, handleToggleInfo, infoOpen])

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

  // Active unit for info modal
  const effectiveUnit = activeUnit || presentationUnit
  const isEffectiveDiptych = effectiveUnit?.type === 'diptych'
  const leftEffectiveArt = effectiveUnit
    ? effectiveUnit.type === 'single'
      ? effectiveUnit.artwork
      : effectiveUnit.left
    : null
  const rightEffectiveArt = effectiveUnit && effectiveUnit.type === 'diptych' ? effectiveUnit.right : null

  const provenanceTarget =
    isEffectiveDiptych && provenanceTab === 'right'
      ? rightEffectiveArt ?? leftEffectiveArt
      : leftEffectiveArt

  const provenanceMeta = provenanceTarget
    ? sanitizeArtworkMetadata(provenanceTarget.title, provenanceTarget.artist)
    : { title: '', artist: '' }

  const effectiveLeftMeta = leftEffectiveArt
    ? sanitizeArtworkMetadata(leftEffectiveArt.title, leftEffectiveArt.artist)
    : { title: '', artist: '' }
  const effectiveRightMeta = rightEffectiveArt
    ? sanitizeArtworkMetadata(rightEffectiveArt.title, rightEffectiveArt.artist)
    : { title: '', artist: '' }

  // Render an individual artwork aperture with framing bevels, textures, and signature
  const renderAperture = (
    art: Artwork,
    widthPx: number,
    heightPx: number,
    bevelColors: ReturnType<typeof generateHarmonizedBevel>,
    dominantColor: string,
    paperBaseColor: string,
    isOutgoing: boolean,
  ) => {
    const cleanMeta = sanitizeArtworkMetadata(art.title, art.artist)

    return (
      <div
        key={`aperture-${art.id}-${isOutgoing ? 'out' : 'in'}`}
        style={{
          boxSizing: 'content-box',
          backgroundColor: paperBaseColor,
          borderTop: `4.5px solid ${bevelColors.top}`,
          borderLeft: `4.5px solid ${bevelColors.left}`,
          borderRight: `4.5px solid ${bevelColors.right}`,
          borderBottom: `4.5px solid ${bevelColors.bottom}`,
          boxShadow: darkThemeActive
            ? '0 0 0 1px rgba(0,0,0,0.9), 0 3px 12px rgba(0,0,0,0.6)'
            : '0 0 0 1px rgba(50,40,30,0.18), 0 3px 10px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          position: 'relative',
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        <img
          src={art.imageUrl}
          alt={cleanMeta.title}
          decoding="async"
          onLoad={isOutgoing ? undefined : onLoad}
          onError={isOutgoing ? undefined : onError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            display: 'block',
            filter: darkThemeActive ? 'contrast(0.98) brightness(0.92)' : 'none',
          }}
        />

        {/* Artist Signature Overlay */}
        {art.signature?.enabled && Boolean(art.signature.text) && (() => {
          const sigStyle =
            SIGNATURE_STYLES[art.signature.style] || SIGNATURE_STYLES.draft
          const inkStyle = getSignatureInkStyle(
            art.signature.color,
            dominantColor,
            art.signature.opacity ?? 0.75,
          )
          const sizeScale =
            SIGNATURE_SIZE_SCALES[art.signature.size || 'xs'] || 0.55
          const isBottomLeft = art.signature.position === 'bottom-left'
          return (
            <div
              key={`sig-${art.id}`}
              style={{
                position: 'absolute',
                bottom: 'clamp(14px, 3.2%, 36px)',
                ...(isBottomLeft
                  ? { left: 'clamp(16px, 3.5%, 40px)', textAlign: 'left' }
                  : { right: 'clamp(16px, 3.5%, 40px)', textAlign: 'right' }),
                fontFamily: sigStyle.fontFamily,
                fontSize: `clamp(${sigStyle.baseFontSizeRem * 0.9 * sizeScale}rem, ${2 * sizeScale}vw, ${sigStyle.baseFontSizeRem * 1.6 * sizeScale}rem)`,
                fontWeight: sigStyle.weight,
                color: inkStyle.color,
                textShadow: inkStyle.textShadow,
                mixBlendMode: inkStyle.blendMode || 'normal',
                transform: isBottomLeft ? 'rotate(0.8deg)' : 'rotate(-1.2deg)',
                letterSpacing: '0.015em',
                lineHeight: 1.3,
                paddingTop: '8px',
                paddingBottom: '12px',
                filter: 'blur(0.2px) contrast(1.05)',
                textRendering: 'geometricPrecision',
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 3,
                maxWidth: sizeScale > 1.2 ? '75%' : '60%',
                whiteSpace: 'pre-line',
                overflow: 'visible',
              }}
            >
              {art.signature.text}
            </div>
          )
        })()}

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

        {/* Subtle Directional Cast Shadow & Ambient Color Radiosity */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 6,
            boxShadow: darkThemeActive
              ? 'inset 0 3px 6px -1px rgba(0,0,0,0.65), inset 2px 0 4px -1px rgba(0,0,0,0.40)'
              : 'inset 0 3px 6px -1px rgba(45,30,15,0.14), inset 2px 0 3px -1px rgba(45,30,15,0.06), inset 0 0 12px -2px rgba(0,0,0,0.05)',
          }}
        />
      </div>
    )
  }

  // Render a complete, self-contained presentation slide (Mat + Frames + Plaques)
  const renderSlide = (unit: PresentationUnit | null, isOutgoing: boolean) => {
    if (!unit) return null

    const isDiptych = unit.type === 'diptych'
    const leftArt = isDiptych ? unit.left : unit.artwork
    const rightArt = isDiptych ? unit.right : null

    const leftMeta = sanitizeArtworkMetadata(leftArt.title, leftArt.artist)
    const rightMeta = rightArt ? sanitizeArtworkMetadata(rightArt.title, rightArt.artist) : null

    // Compute palette colors specific to this slide's artwork
    const primaryArt = leftArt
    let slideMatColor = DEFAULT_MAT_COLOR
    let slideDominantColor = DEFAULT_DOMINANT_COLOR

    if (darkThemeActive) {
      slideMatColor = MIDNIGHT_MAT_COLOR
    } else if (matPreset && matPreset !== 'auto' && MAT_PRESETS[matPreset]) {
      slideMatColor = MAT_PRESETS[matPreset]
    } else if (primaryArt?.imageUrl) {
      const cached = artworkMetadataCache.get(primaryArt.imageUrl)
      if (cached) {
        slideMatColor = cached.matColor
        slideDominantColor = cached.dominantColor
      } else {
        slideMatColor = getPaletteColorForKey(primaryArt.imageUrl)
      }
    }

    const slideBevelColors = darkThemeActive
      ? {
          top: '#2C323D',
          left: '#222832',
          right: '#12151B',
          bottom: '#0A0D12',
          radiosity: 'rgba(0,0,0,0.4)',
        }
      : generateHarmonizedBevel(slideMatColor, slideDominantColor)

    const matTexture = darkThemeActive ? MIDNIGHT_MAT_TEXTURE : textureStyle.backgroundImage
    const matBlendMode = darkThemeActive ? 'normal' : textureStyle.backgroundBlendMode
    const paperBaseColor = darkThemeActive ? PAPER_BASE_DARK : PAPER_BASE_LIGHT

    // Compute aperture sizes
    const maxWidth = Math.max(viewport.width - MAT_MARGIN_H_PX * 2, MIN_FRAME_PX)
    const maxHeight = Math.max(viewport.height - MAT_MARGIN_V_PX * 2, MIN_FRAME_PX)

    let singleWidth = maxWidth
    let singleHeight = maxHeight

    if (!isDiptych) {
      let ratio = 16 / 9
      const cached = artworkMetadataCache.get(unit.artwork.imageUrl)
      if (cached?.aspectRatio) {
        ratio = cached.aspectRatio
      } else if (unit.artwork.aspectRatio) {
        ratio = unit.artwork.aspectRatio
      }

      const minWidth = Math.min(maxWidth, (viewport.width * minArtWidthVw) / 100)
      singleWidth = Math.max(maxWidth, minWidth)
      singleHeight = singleWidth / ratio

      if (singleHeight > maxHeight) {
        singleHeight = maxHeight
        singleWidth = singleHeight * ratio
      }
      singleWidth = Math.round(singleWidth)
      singleHeight = Math.round(singleHeight)
    }

    const maxSquareWidth = Math.floor((maxWidth - diptychMullion) / 2)
    const squareApertureSize = Math.round(Math.min(maxSquareWidth, maxHeight))

    return (
      <div
        className="w-full h-full flex items-center justify-center relative select-none"
        style={{
          backgroundColor: slideMatColor,
          backgroundImage: matTexture,
          backgroundSize: textureStyle.backgroundSize,
          backgroundPosition: textureStyle.backgroundPosition,
          backgroundAttachment: textureStyle.backgroundAttachment,
          backgroundBlendMode: matBlendMode,
          boxShadow: darkThemeActive
            ? 'inset 0 2px 6px rgba(0,0,0,0.7), inset 0 0 1px rgba(0,0,0,0.9)'
            : 'inset 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 2px rgba(0,0,0,0.06), inset 0 0 1px rgba(0,0,0,0.10)',
          padding: '3.5vw',
        }}
      >
        {/* Aperture Frame Layout */}
        {isDiptych && rightArt ? (
          <div
            className="flex items-center justify-center"
            style={{ gap: `${diptychMullion}px` }}
          >
            {renderAperture(
              leftArt,
              squareApertureSize,
              squareApertureSize,
              slideBevelColors,
              slideDominantColor,
              paperBaseColor,
              isOutgoing,
            )}
            {renderAperture(
              rightArt,
              squareApertureSize,
              squareApertureSize,
              slideBevelColors,
              slideDominantColor,
              paperBaseColor,
              isOutgoing,
            )}
          </div>
        ) : (
          renderAperture(
            leftArt,
            singleWidth,
            singleHeight,
            slideBevelColors,
            slideDominantColor,
            paperBaseColor,
            isOutgoing,
          )
        )}

        {/* Gallery Plaques */}
        {plaqueMode !== 'hidden' && (
          <>
            {/* Left Plaque for Diptych Left Image */}
            {isDiptych ? (
              <div
                className="absolute bottom-5 left-7 flex items-end gap-3 z-30 pointer-events-none"
                style={{
                  opacity: plaqueVisible ? 1 : 0,
                  transform: plaqueVisible ? 'translateY(0)' : 'translateY(6px)',
                  transition:
                    'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {!isOutgoing &&
                  (leftArt.description ||
                    leftArt.location ||
                    leftArt.funFact ||
                    leftArt.subjects) && (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<Info size={14} className="text-amber-500 shrink-0" />}
                      onClick={e => handleToggleInfo('left', e)}
                      aria-label="View left photo provenance and story"
                      title="Left photo details & provenance (press 'i')"
                      className="pointer-events-auto rounded-full transition-all duration-200 bg-white/10 dark:bg-black/20 hover:bg-white/20 dark:hover:bg-black/30 border border-white/20 dark:border-white/10 backdrop-blur-xs shadow-xs active:scale-95 cursor-pointer"
                    />
                  )}

                <div
                  className="text-left"
                  style={{
                    color: darkThemeActive
                      ? 'rgba(220, 215, 205, 0.78)'
                      : 'rgba(65, 50, 40, 0.80)',
                    textShadow: darkThemeActive
                      ? '0 1px 1px rgba(0, 0, 0, 0.90), 0 -1px 0.5px rgba(255, 255, 255, 0.08)'
                      : '0 1px 0px rgba(255, 255, 255, 0.92), 0 -1px 0.5px rgba(0, 0, 0, 0.18)',
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
                    {leftMeta.title}
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
                    {leftMeta.artist}
                    {leftArt.location && ` · ${leftArt.location.split(',')[0]}`}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Right Plaque (Single Artwork or Diptych Right Image) */}
            <div
              className="absolute bottom-5 right-7 flex items-end gap-3 z-30 pointer-events-none"
              style={{
                opacity: plaqueVisible ? 1 : 0,
                transform: plaqueVisible ? 'translateY(0)' : 'translateY(6px)',
                transition:
                  'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {!isOutgoing &&
                ((isDiptych ? rightArt : leftArt)?.description ||
                  (isDiptych ? rightArt : leftArt)?.location ||
                  (isDiptych ? rightArt : leftArt)?.funFact ||
                  (isDiptych ? rightArt : leftArt)?.subjects) && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<Info size={14} className="text-amber-500 shrink-0" />}
                    onClick={e => handleToggleInfo(isDiptych ? 'right' : 'left', e)}
                    aria-label="View photo provenance and story"
                    title="Photo details & provenance (press 'i')"
                    className="pointer-events-auto rounded-full transition-all duration-200 bg-white/10 dark:bg-black/20 hover:bg-white/20 dark:hover:bg-black/30 border border-white/20 dark:border-white/10 backdrop-blur-xs shadow-xs active:scale-95 cursor-pointer"
                  />
                )}

              <div
                className="text-right"
                style={{
                  color: darkThemeActive
                    ? 'rgba(220, 215, 205, 0.78)'
                    : 'rgba(65, 50, 40, 0.80)',
                  textShadow: darkThemeActive
                    ? '0 1px 1px rgba(0, 0, 0, 0.90), 0 -1px 0.5px rgba(255, 255, 255, 0.08)'
                    : '0 1px 0px rgba(255, 255, 255, 0.92), 0 -1px 0.5px rgba(0, 0, 0, 0.18)',
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
                  {isDiptych && rightMeta ? rightMeta.title : leftMeta.title}
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
                  {isDiptych && rightMeta ? rightMeta.artist : leftMeta.artist}
                  {(isDiptych ? rightArt : leftArt)?.location &&
                    ` · ${(isDiptych ? rightArt : leftArt)?.location?.split(',')[0]}`}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  const slideToRender = activeUnit || presentationUnit

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
      {/* Active Bottom Slide (z-1) */}
      {slideToRender && (
        <div key={`slide-in-${slideToRender.id}`} className="absolute inset-0 z-1">
          {renderSlide(slideToRender, false)}
        </div>
      )}

      {/* Outgoing Top Slide (z-2, dissolves out 1.0 -> 0.0 over 1.2s) */}
      {outgoingUnit && (
        <div
          key={`slide-out-${outgoingUnit.id}`}
          className="absolute inset-0 z-2 pointer-events-none"
          style={{
            animation: 'casa-art-dissolve-out 1200ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
            willChange: 'opacity',
          }}
        >
          {renderSlide(outgoingUnit, true)}
        </div>
      )}

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

      {/* Ambient Provenance Card Overlay */}
      {infoOpen && provenanceTarget && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={e => {
            e.stopPropagation()
            setInfoOpen(false)
          }}
        >
          {/* Dual Diptych Tab Selector */}
          {isEffectiveDiptych && leftEffectiveArt && rightEffectiveArt && (
            <div
              className="flex items-center gap-2 mb-3 bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/20 z-10 shadow-lg"
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant={provenanceTab === 'left' ? 'primary' : 'ghost'}
                onClick={() => setProvenanceTab('left')}
                className={
                  provenanceTab === 'left'
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-full shadow-xs'
                    : 'text-stone-300 hover:text-white rounded-full'
                }
              >
                Left: {effectiveLeftMeta.title}
              </Button>
              <Button
                size="sm"
                variant={provenanceTab === 'right' ? 'primary' : 'ghost'}
                onClick={() => setProvenanceTab('right')}
                className={
                  provenanceTab === 'right'
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-full shadow-xs'
                    : 'text-stone-300 hover:text-white rounded-full'
                }
              >
                Right: {effectiveRightMeta.title}
              </Button>
            </div>
          )}

          <ArtworkProvenanceCard
            title={provenanceMeta.title}
            artist={provenanceMeta.artist}
            location={provenanceTarget.location}
            dateTaken={provenanceTarget.dateTaken || provenanceTarget.date}
            description={provenanceTarget.description}
            subjects={provenanceTarget.subjects}
            medium={provenanceTarget.medium}
            funFact={provenanceTarget.funFact}
            imageUrl={provenanceTarget.imageUrl}
            darkTheme={darkThemeActive}
            onClose={() => setInfoOpen(false)}
            className="max-w-lg w-full"
          />
        </div>
      )}
    </div>
  )
}
