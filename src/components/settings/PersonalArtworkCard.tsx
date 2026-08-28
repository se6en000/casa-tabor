import { Eye, EyeOff, Crop, Pencil, Trash2, Feather } from 'lucide-react'
import { IconButton } from '../ui'
import type { PersonalArtwork } from '../../hooks/usePersonalArtMode'
import { cn } from '../../utils/cn'

export interface PersonalArtworkCardProps {
  artwork: PersonalArtwork
  isDisabled?: boolean
  onToggleDisabled: (id: string) => void
  onCrop: (artwork: PersonalArtwork) => void
  onEdit: (artwork: PersonalArtwork) => void
  onDelete: (artwork: PersonalArtwork) => void
  className?: string
}

export function PersonalArtworkCard({
  artwork,
  isDisabled = false,
  onToggleDisabled,
  onCrop,
  onEdit,
  onDelete,
  className,
}: PersonalArtworkCardProps) {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        isDisabled
          ? 'border-casa-border/60 bg-casa-surface-2 opacity-65 contrast-90 shadow-none'
          : 'border-casa-border bg-casa-bg shadow-xs hover:-translate-y-0.5 hover:border-casa-gold/50 hover:shadow-card',
        className
      )}
    >
      {/* 16:9 Image Preview Container */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-casa-surface-2">
        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          loading="lazy"
          className={cn(
            'h-full w-full object-cover transition-all duration-200 group-hover:scale-[1.02]',
            isDisabled && 'grayscale'
          )}
        />
        {isDisabled && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-navy/85 backdrop-blur-xs text-white text-2xs font-semibold shadow-xs">
            <EyeOff size={11} className="text-casa-gold" />
            <span>Disabled</span>
          </div>
        )}
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

      {/* Row 1: Full-Width Metadata (Title & Artist / Collection) */}
      <div className="flex-1 px-3 pt-2.5 pb-2 min-w-0">
        <p
          className={cn(
            'truncate text-body-sm font-semibold leading-snug',
            isDisabled ? 'text-casa-muted' : 'text-casa-navy'
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
      </div>

      {/* Row 2: Dedicated Action Toolbar */}
      <div className="border-t border-casa-border/60 bg-casa-surface/40 px-2 py-1.5 flex items-center justify-between gap-1">
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

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-0.5 shrink-0">
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
            icon={<Crop size={15} />}
            aria-label={`Crop ${artwork.title} to 16:9`}
            title="Crop to 16:9 widescreen"
            onClick={() => onCrop(artwork)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<Pencil size={15} />}
            aria-label={`Edit ${artwork.title}`}
            title="Edit details"
            onClick={() => onEdit(artwork)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            icon={<Trash2 size={15} />}
            className="hover:bg-casa-error/10 hover:text-casa-error"
            aria-label={`Remove ${artwork.title}`}
            title="Remove artwork"
            onClick={() => onDelete(artwork)}
          />
        </div>
      </div>
    </div>
  )
}
