import { Repeat, Globe, Mail, GraduationCap, Briefcase } from 'lucide-react'
import { cn } from '../../utils/cn'

export type EventSourceType = 'routine' | 'google' | 'gmail' | 'casa'

interface EventProvenanceBadgeProps {
  sourceType?: EventSourceType | string
  isHeroState?: boolean
  className?: string
  routineType?: 'school' | 'work' | 'camp' | 'custom'
}

export function EventProvenanceBadge({
  sourceType,
  isHeroState = false,
  className,
  routineType = 'school',
}: EventProvenanceBadgeProps) {
  if (!sourceType || sourceType === 'casa') return null

  if (sourceType === 'routine') {
    const IconComp = routineType === 'work' ? Briefcase : routineType === 'school' ? GraduationCap : Repeat
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider shrink-0 transition-colors',
          isHeroState
            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
            : 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs',
          className
        )}
        title="Created from Family Routine"
      >
        <IconComp size={10} className="shrink-0 text-amber-600" />
        <span>Routine</span>
      </span>
    )
  }

  if (sourceType === 'google') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider shrink-0 transition-colors',
          isHeroState
            ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
            : 'bg-sky-50 text-sky-900 border border-sky-200/80 shadow-2xs',
          className
        )}
        title="Synced from Google Calendar"
      >
        <Globe size={10} className="shrink-0 text-sky-600" />
        <span>Google</span>
      </span>
    )
  }

  if (sourceType === 'gmail') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold uppercase tracking-wider shrink-0 transition-colors',
          isHeroState
            ? 'bg-purple-400/20 text-purple-200 border border-purple-400/30'
            : 'bg-purple-50 text-purple-900 border border-purple-200/80 shadow-2xs',
          className
        )}
        title="Extracted from Email / Gmail"
      >
        <Mail size={10} className="shrink-0 text-purple-600" />
        <span>Gmail</span>
      </span>
    )
  }

  return null
}
