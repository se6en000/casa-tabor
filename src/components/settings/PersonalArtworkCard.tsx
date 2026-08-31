import { useState } from 'react'
import { Eye, EyeOff, Pencil, Trash2, Feather, MapPin } from 'lucide-react'
import { IconButton } from '../ui'
import type { PersonalArtwork } from '../../hooks/usePersonalArtMode'
import { cn } from '../../utils/cn'

export interface PersonalArtworkCardProps {
  artwork: PersonalArtwork
  isDisabled?: boolean
  onToggleDisabled: (id: string) => void
  onEdit: (artwork: PersonalArtwork) => void
  onDelete: (artwork: PersonalArtwork) => void
  className?: string
}

export function PersonalArtworkCard({
  artwork,
  isDisabled = false,
  onToggleDisabled,
  onEdit,
  onDelete,
  className,
}: PersonalArtworkCardProps) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(() => {
    if (artwork.aspectFormat === 'square_1_1' || artwork.storagePath.includes('_1x1')) return 1.0
    if (artwork.aspectFormat === 'widescreen_16_9' || artwork.storagePath.includes('_16x9')) return 16 / 9
    return null
  })
  const [isLoaded, setIsLoaded] = useState(false)

  const isSquare = (aspectRatio != null && aspectRatio >= 0.88 && aspectRatio <= 1.14) || artwork.aspectFormat === 'square_1_1' || artwork.storagePath.includes('_1x1')
  const isWidescreen = (aspectRatio != null && aspectRatio >= 1.55) || artwork.aspectFormat === 'widescreen_16_9' || artwork.storagePath.includes('_16x9')

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-150 bg-casa-surface select-none cursor-pointer smooth-scroll-card',
        isDisabled
          ? 'border-casa-border/60 bg-casa-surface-2 opacity-65 contrast-90 shadow-none'
          : 'border-casa-border hover:-translate-y-0.5 hover:border-casa-gold/60 hover:shadow-card shadow-xs',
        className
      )}
      onClick={() => onEdit(artwork)}
    >
      {/* Image Preview Container */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-casa-surface-subtle">
        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            setIsLoaded(true)
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) {
              setAspectRatio(img.naturalWidth / img.naturalHeight)
            }
          }}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            isLoaded ? 'opacity-100' : 'opacity-0',
            isDisabled && 'grayscale'
          )}
        />

        {/* Top-Left: Aspect Ratio Badge & Disabled Badge */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 flex-wrap">
          {isDisabled ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-navy/90 backdrop-blur-xs text-white text-3xs font-semibold shadow-xs">
              <EyeOff size={10} className="text-casa-gold" />
              <span>Disabled</span>
            </div>
          ) : isSquare ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/85 backdrop-blur-xs border border-emerald-500/40 text-emerald-300 text-3xs font-semibold shadow-xs">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>1:1 Square</span>
            </div>
          ) : isWidescreen ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-navy/85 backdrop-blur-xs border border-white/20 text-stone-200 text-3xs font-medium shadow-xs">
              <span>16:9 Wide</span>
            </div>
          ) : aspectRatio != null ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-900/80 backdrop-blur-xs text-stone-300 text-3xs font-medium shadow-xs">
              <span>Custom</span>
            </div>
          ) : null}
        </div>

        {/* Bottom-Right: Signature Badge */}
        {artwork.signatureEnabled && (
          <div
            className="absolute bottom-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-casa-navy/85 backdrop-blur-xs text-white text-3xs font-medium shadow-xs"
            title={`Signature: "${artwork.signatureText || artwork.artist || 'Signed'}"`}
          >
            <Feather size={10} className="text-casa-gold" />
            <span>Signed</span>
          </div>
        )}
      </div>

      {/* Full-Width Metadata (Title & Artist / Location) */}
      <div className="flex-1 px-3 pt-2.5 pb-2 min-w-0">
        <p
          className={cn(
            'truncate text-body-sm font-semibold leading-snug',
            isDisabled ? 'text-casa-muted' : 'text-casa-navy group-hover:text-casa-gold transition-colors'
          )}
          title={artwork.title}
        >
          {artwork.title}
        </p>
        <p
          className="truncate text-caption text-casa-muted mt-0.5 leading-tight"
          title={artwork.artist || 'Personal collection'}
        >
          {artwork.artist || 'Personal collection'}
        </p>

        {(artwork.location || artwork.dateTaken) && (
          <div className="flex items-center gap-1 mt-1 text-3xs text-casa-muted truncate">
            {artwork.location && (
              <span className="inline-flex items-center gap-0.5 truncate text-casa-muted font-medium">
                <MapPin size={10} className="text-casa-gold shrink-0" />
                <span className="truncate">{artwork.location.split(',')[0]}</span>
              </span>
            )}
            {artwork.location && artwork.dateTaken && <span>·</span>}
            {artwork.dateTaken && <span>{artwork.dateTaken}</span>}
          </div>
        )}
      </div>

      {/* Streamlined 4-Control Action Toolbar */}
      <div
        className="border-t border-casa-border/60 bg-casa-surface/40 px-2 py-1.5 flex items-center justify-between gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Device Active / Disabled Status Pill */}
        <div className="flex items-center gap-1.5 pl-1 min-w-0">
          <span
            className={cn(
              'size-2 rounded-full shrink-0',
              isDisabled ? 'bg-casa-muted/60' : 'bg-emerald-500'
            )}
          />
          <span className="truncate text-2xs font-medium text-casa-muted">
            {isDisabled ? 'Off' : 'Active'}
          </span>
        </div>

        {/* 3 Clean, Spaced Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            size="sm"
            variant="ghost"
            icon={
              isDisabled ? (
                <Eye size={15} className="text-casa-navy" />
              ) : (
                <EyeOff size={15} className="text-casa-muted hover:text-casa-navy" />
              )
            }
            aria-label={isDisabled ? `Enable ${artwork.title}` : `Disable ${artwork.title}`}
            title={isDisabled ? 'Enable on this device' : 'Disable on this device'}
            onClick={() => onToggleDisabled(artwork.id)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<Pencil size={15} className="text-casa-navy" />}
            aria-label={`Edit ${artwork.title}`}
            title="Edit details & provenance"
            onClick={() => onEdit(artwork)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<Trash2 size={15} className="text-casa-muted hover:text-casa-error" />}
            className="hover:bg-casa-error/10"
            aria-label={`Remove ${artwork.title}`}
            title="Remove from gallery"
            onClick={() => onDelete(artwork)}
          />
        </div>
      </div>
    </div>
  )
}
