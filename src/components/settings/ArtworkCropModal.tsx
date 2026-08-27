import { useEffect, useRef, useState, useCallback } from 'react'
import { Crop, ZoomIn, ZoomOut, RotateCcw, Move, Sparkles, AlertCircle } from 'lucide-react'
import { Modal, Button, IconButton, Chip } from '../ui'
import type { PersonalArtwork } from '../../hooks/usePersonalArtMode'

interface ArtworkCropModalProps {
  open: boolean
  artwork: PersonalArtwork | null
  onClose: () => void
  onSaveCrop: (croppedFile: File) => Promise<void>
  saving?: boolean
}

export function ArtworkCropModal({
  open,
  artwork,
  onClose,
  onSaveCrop,
  saving = false,
}: ArtworkCropModalProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  
  // Transform state
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null)

  // Refs for tracking drag coordinates & dimensions
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ clientX: number; clientY: number; startPanX: number; startPanY: number } | null>(null)
  const imageElementRef = useRef<HTMLImageElement | null>(null)

  // Load image safely as blob to prevent canvas cross-origin taint
  useEffect(() => {
    if (!open || !artwork?.imageUrl) {
      setImageLoaded(false)
      setNaturalSize(null)
      setLocalBlobUrl(null)
      setLoadError(null)
      return
    }

    let isCancelled = false
    setLoadError(null)
    setImageLoaded(false)
    setZoom(1.0)
    setPan({ x: 0, y: 0 })

    async function fetchImageBlob() {
      try {
        const response = await fetch(artwork!.imageUrl, { mode: 'cors' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (isCancelled) return
        const blobUrl = URL.createObjectURL(blob)
        setLocalBlobUrl(blobUrl)
      } catch {
        if (!isCancelled) {
          // Fallback to direct URL if fetch blob fails
          setLocalBlobUrl(artwork!.imageUrl)
        }
      }
    }

    void fetchImageBlob()

    return () => {
      isCancelled = true
    }
  }, [open, artwork])

  // Clean up object URL on unmount / change
  useEffect(() => {
    return () => {
      if (localBlobUrl && localBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localBlobUrl)
      }
    }
  }, [localBlobUrl])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    imageElementRef.current = img
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    setNaturalSize({ width, height })
    setImageLoaded(true)
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  // Calculate cover dimensions and pan constraints
  const getLayoutMetrics = useCallback(() => {
    if (!containerRef.current || !naturalSize) return null
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight

    const imgAspect = naturalSize.width / naturalSize.height
    const containerAspect = 16 / 9

    let baseWidth: number
    let baseHeight: number

    if (imgAspect > containerAspect) {
      // Wider than 16:9 -> fit height, width overflows
      baseHeight = containerHeight
      baseWidth = containerHeight * imgAspect
    } else {
      // Taller than 16:9 -> fit width, height overflows
      baseWidth = containerWidth
      baseHeight = containerWidth / imgAspect
    }

    const scaledWidth = baseWidth * zoom
    const scaledHeight = baseHeight * zoom

    const maxPanX = Math.max(0, (scaledWidth - containerWidth) / 2)
    const maxPanY = Math.max(0, (scaledHeight - containerHeight) / 2)

    return {
      containerWidth,
      containerHeight,
      scaledWidth,
      scaledHeight,
      maxPanX,
      maxPanY,
    }
  }, [naturalSize, zoom])

  // Clamp pan when zoom changes
  useEffect(() => {
    const metrics = getLayoutMetrics()
    if (!metrics) return

    setPan(currentPan => ({
      x: Math.max(-metrics.maxPanX, Math.min(metrics.maxPanX, currentPan.x)),
      y: Math.max(-metrics.maxPanY, Math.min(metrics.maxPanY, currentPan.y)),
    }))
  }, [zoom, getLayoutMetrics])

  // Drag handlers (Mouse & Touch)
  const handlePointerDown = (clientX: number, clientY: number) => {
    const metrics = getLayoutMetrics()
    if (!metrics) return
    setIsDragging(true)
    dragStartRef.current = {
      clientX,
      clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    }
  }

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!dragStartRef.current) return
    const metrics = getLayoutMetrics()
    if (!metrics) return

    const deltaX = clientX - dragStartRef.current.clientX
    const deltaY = clientY - dragStartRef.current.clientY

    const nextX = dragStartRef.current.startPanX + deltaX
    const nextY = dragStartRef.current.startPanY + deltaY

    setPan({
      x: Math.max(-metrics.maxPanX, Math.min(metrics.maxPanX, nextX)),
      y: Math.max(-metrics.maxPanY, Math.min(metrics.maxPanY, nextY)),
    })
  }, [getLayoutMetrics])

  const handlePointerUp = () => {
    setIsDragging(false)
    dragStartRef.current = null
  }

  // Preset alignments
  const applyPreset = (position: 'center' | 'top' | 'bottom' | 'left' | 'right') => {
    const metrics = getLayoutMetrics()
    if (!metrics) return

    switch (position) {
      case 'center':
        setPan({ x: 0, y: 0 })
        break
      case 'top':
        setPan(p => ({ ...p, y: metrics.maxPanY }))
        break
      case 'bottom':
        setPan(p => ({ ...p, y: -metrics.maxPanY }))
        break
      case 'left':
        setPan(p => ({ ...p, x: metrics.maxPanX }))
        break
      case 'right':
        setPan(p => ({ ...p, x: -metrics.maxPanX }))
        break
    }
  }

  const handleReset = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  // Generate cropped image on canvas at maximum source fidelity
  const handleConfirmCrop = async () => {
    if (!artwork || !naturalSize || !containerRef.current || !imageElementRef.current) return

    const metrics = getLayoutMetrics()
    if (!metrics) return

    try {
      const img = imageElementRef.current
      const containerWidth = metrics.containerWidth
      const containerHeight = metrics.containerHeight
      const scaledWidth = metrics.scaledWidth
      const scaledHeight = metrics.scaledHeight

      // Top-left of rendered image relative to container top-left
      const imgRenderLeft = (containerWidth - scaledWidth) / 2 + pan.x
      const imgRenderTop = (containerHeight - scaledHeight) / 2 + pan.y

      // Visible crop window in image rendered space:
      const cropLeftRender = -imgRenderLeft
      const cropTopRender = -imgRenderTop
      const cropWidthRender = containerWidth
      const cropHeightRender = containerHeight

      // Scale factors from rendered image to original natural image
      const scaleX = naturalSize.width / scaledWidth
      const scaleY = naturalSize.height / scaledHeight

      const sx = Math.max(0, cropLeftRender * scaleX)
      const sy = Math.max(0, cropTopRender * scaleY)
      const sw = Math.min(naturalSize.width - sx, cropWidthRender * scaleX)
      const sh = Math.min(naturalSize.height - sy, cropHeightRender * scaleY)

      // High-resolution canvas dimensions (at least 1920x1080 if source allows)
      const targetWidth = Math.max(1920, Math.round(sw))
      const targetHeight = Math.round((targetWidth * 9) / 16)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas 2d context')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)

      // Export as Blob
      const outputMime = artwork.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, outputMime, 0.95)
      })

      if (!blob) throw new Error('Canvas export failed')

      const extension = outputMime === 'image/png' ? 'png' : 'jpg'
      const cleanFileName = `${(artwork.title || 'artwork').replace(/[^a-zA-Z0-9_-]/g, '_')}_16x9.${extension}`
      const croppedFile = new File([blob], cleanFileName, { type: outputMime })

      await onSaveCrop(croppedFile)
      onClose()
    } catch (err) {
      console.error('Failed to crop artwork:', err)
      setLoadError(err instanceof Error ? err.message : 'Cropping failed.')
    }
  }

  const isTall = naturalSize ? naturalSize.height / naturalSize.width > 9 / 16 : false
  const isWide = naturalSize ? naturalSize.width / naturalSize.height > 16 / 9 : false

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crop to 16:9 Widescreen"
      size="lg"
      closeDisabled={saving}
    >
      <div className="space-y-4 py-2">
        {/* Descriptive Header Info */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm text-casa-muted">
            Reposition and frame for the 1080p ambient kiosk display (`1920×1080`).
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-casa-surface border border-casa-border px-2.5 py-0.5 text-caption font-semibold text-casa-navy">
            16:9 Ambient Fit
          </span>
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-caption text-red-800">
            <AlertCircle size={16} className="shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* 16:9 Aperture Frame / Viewport */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-casa-navy/20 bg-black shadow-card">
          <div
            ref={containerRef}
            className="relative aspect-video w-full cursor-grab active:cursor-grabbing select-none overflow-hidden touch-none"
            onMouseDown={e => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={e => isDragging && handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={e => {
              if (e.touches[0]) {
                handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)
              }
            }}
            onTouchMove={e => {
              if (e.touches[0]) {
                handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)
              }
            }}
            onTouchEnd={handlePointerUp}
          >
            {localBlobUrl && (
              <img
                ref={imageElementRef}
                src={localBlobUrl}
                alt={artwork?.title || 'Crop preview'}
                crossOrigin="anonymous"
                onLoad={handleImageLoad}
                onError={() => {
                  setLoadError('Failed to load artwork preview.')
                }}
                draggable={false}
                className="absolute max-w-none transition-transform duration-75 ease-out select-none pointer-events-none"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxHeight: isWide ? '100%' : 'none',
                  maxWidth: isTall ? '100%' : 'none',
                  minWidth: '100%',
                  minHeight: '100%',
                  objectFit: 'cover',
                }}
              />
            )}

            {/* Rule-of-Thirds Grid Overlay during adjustment */}
            <div
              className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
                isDragging ? 'opacity-70' : 'opacity-25'
              }`}
            >
              <div className="h-full w-full grid grid-cols-3 grid-rows-3 border border-white/30">
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div />
              </div>
            </div>

            {/* Drag Hint Watermark */}
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-caption font-medium text-white/90 pointer-events-none">
              <Move size={12} />
              <span>Drag to reposition</span>
            </div>
          </div>
        </div>

        {/* Framing & Zoom Controls */}
        <div className="rounded-xl border border-casa-border bg-casa-surface p-3.5 space-y-3">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <IconButton
              size="sm"
              variant="secondary"
              icon={<ZoomOut size={16} />}
              aria-label="Zoom out"
              onClick={() => setZoom(z => Math.max(1.0, Number((z - 0.1).toFixed(2))))}
              disabled={zoom <= 1.0}
            />
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.05}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                aria-label="Zoom level"
                className="w-full accent-casa-gold cursor-pointer"
              />
              <span className="min-w-[3rem] text-right text-caption font-semibold text-casa-navy">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <IconButton
              size="sm"
              variant="secondary"
              icon={<ZoomIn size={16} />}
              aria-label="Zoom in"
              onClick={() => setZoom(z => Math.min(3.0, Number((z + 0.1).toFixed(2))))}
              disabled={zoom >= 3.0}
            />
          </div>

          {/* Focal Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-casa-border">
            <span className="text-caption font-medium text-casa-muted mr-1">Align:</span>
            <Chip
              onClick={() => applyPreset('center')}
              className="hover:bg-casa-navy hover:text-white"
            >
              <Sparkles size={12} className="inline mr-1" />
              Center
            </Chip>
            {isTall && (
              <>
                <Chip onClick={() => applyPreset('top')}>Top Focus</Chip>
                <Chip onClick={() => applyPreset('bottom')}>Bottom Focus</Chip>
              </>
            )}
            {isWide && (
              <>
                <Chip onClick={() => applyPreset('left')}>Left</Chip>
                <Chip onClick={() => applyPreset('right')}>Right</Chip>
              </>
            )}
            <Chip
              onClick={handleReset}
              className="text-casa-muted hover:text-casa-navy"
            >
              <RotateCcw size={12} className="inline mr-1" />
              Reset
            </Chip>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="strong"
            leadingIcon={<Crop size={16} />}
            loading={saving || !imageLoaded}
            disabled={!imageLoaded || saving}
            onClick={() => void handleConfirmCrop()}
          >
            Apply 16:9 Crop
          </Button>
        </div>
      </div>
    </Modal>
  )
}
