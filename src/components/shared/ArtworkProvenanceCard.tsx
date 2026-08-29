import { MapPin, Calendar, Camera, Users, Sparkles, X, Info } from 'lucide-react'
import { cn } from '../../utils/cn'
import { IconButton } from '../ui'

export interface ArtworkProvenanceCardProps {
  title: string
  artist?: string
  location?: string
  dateTaken?: string
  description?: string
  subjects?: string
  medium?: string
  funFact?: string
  imageUrl?: string
  darkTheme?: boolean
  compact?: boolean
  onClose?: () => void
  className?: string
}

export function ArtworkProvenanceCard({
  title,
  artist,
  location,
  dateTaken,
  description,
  subjects,
  medium,
  funFact,
  imageUrl,
  darkTheme = false,
  compact = false,
  onClose,
  className,
}: ArtworkProvenanceCardProps) {
  const subjectList = subjects
    ? subjects.split(',').map(s => s.trim()).filter(Boolean)
    : []

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300',
        darkTheme
          ? 'bg-stone-900/92 backdrop-blur-xl border-stone-700/60 text-stone-100 shadow-[0_12px_40px_rgba(0,0,0,0.85)]'
          : 'bg-casa-bg/96 backdrop-blur-xl border-casa-border text-stone-900 shadow-[0_12px_36px_rgba(40,30,20,0.18)]',
        compact ? 'p-4 max-w-md' : 'p-5 sm:p-6 max-w-lg w-full',
        className
      )}
      onClick={e => e.stopPropagation()}
    >
      {/* Header Accent Bar */}
      <div className="flex items-start justify-between gap-3 border-b pb-3 mb-3 border-inherit/40">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={title}
              className="size-12 sm:size-14 rounded-lg object-cover border border-inherit/50 shrink-0 shadow-xs"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-2xs uppercase tracking-widest font-semibold opacity-75 mb-1">
              <Info size={13} className="text-casa-gold shrink-0" />
              <span>Curator's Provenance</span>
            </div>
            <h3
              className={cn(
                'font-serif font-medium leading-tight truncate',
                compact ? 'text-lg' : 'text-xl sm:text-2xl',
                darkTheme ? 'text-stone-50' : 'text-stone-900'
              )}
              title={title}
            >
              {title || 'Untitled Artwork'}
            </h3>
            <p className="text-caption font-medium opacity-85 mt-0.5 tracking-wide">
              {artist || 'Personal Collection'}
            </p>
          </div>
        </div>

        {onClose && (
          <IconButton
            size="sm"
            variant="ghost"
            icon={<X size={16} />}
            aria-label="Close provenance details"
            onClick={onClose}
            className={cn(
              'shrink-0 -mt-1 -mr-1',
              darkTheme ? 'hover:bg-white/10 text-stone-300' : 'hover:bg-black/5 text-stone-600'
            )}
          />
        )}
      </div>

      {/* Metadata Badges Ribbon */}
      <div className="flex flex-wrap gap-2 mb-3.5 text-2xs sm:text-xs">
        {dateTaken && (
          <div className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
            darkTheme
              ? 'bg-stone-800/80 border-stone-700 text-stone-200'
              : 'bg-stone-100/90 border-stone-200 text-stone-700'
          )}>
            <Calendar size={12} className="text-casa-gold shrink-0" />
            <span className="font-medium">{dateTaken}</span>
          </div>
        )}

        {location && (
          <div className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
            darkTheme
              ? 'bg-stone-800/80 border-stone-700 text-stone-200'
              : 'bg-stone-100/90 border-stone-200 text-stone-700'
          )}>
            <MapPin size={12} className="text-casa-gold shrink-0" />
            <span className="font-medium">{location}</span>
          </div>
        )}

        {medium && (
          <div className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
            darkTheme
              ? 'bg-stone-800/80 border-stone-700 text-stone-200'
              : 'bg-stone-100/90 border-stone-200 text-stone-700'
          )}>
            <Camera size={12} className="text-casa-gold shrink-0" />
            <span>{medium}</span>
          </div>
        )}
      </div>

      {/* Story / Description Section */}
      {description && (
        <div className="mb-3.5 leading-relaxed text-caption sm:text-body-sm opacity-90">
          <p>{description}</p>
        </div>
      )}

      {/* Notable Subjects */}
      {subjectList.length > 0 && (
        <div className="mb-3.5">
          <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider font-semibold opacity-70 mb-1.5">
            <Users size={12} className="text-casa-gold shrink-0" />
            <span>Key Figures & Setting</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subjectList.map((subject, idx) => (
              <span
                key={idx}
                className={cn(
                  'px-2 py-0.5 rounded-md text-2xs font-medium border',
                  darkTheme
                    ? 'bg-stone-800/60 border-stone-700 text-stone-300'
                    : 'bg-stone-100 border-stone-200/80 text-stone-800'
                )}
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fun Fact / Trivia Callout */}
      {funFact && (
        <div
          className={cn(
            'rounded-xl p-3 border text-2xs sm:text-xs leading-relaxed',
            darkTheme
              ? 'bg-amber-950/25 border-amber-800/40 text-amber-200/90'
              : 'bg-amber-50/80 border-amber-200/80 text-amber-900'
          )}
        >
          <div className="flex items-center gap-1.5 font-semibold text-casa-gold mb-1">
            <Sparkles size={13} className="shrink-0" />
            <span>Insider Trivia</span>
          </div>
          <p>{funFact}</p>
        </div>
      )}
    </div>
  )
}
