import { Car, ShieldCheck } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface MemberJewelData {
  id?: string
  name: string
  color_hex?: string | null
  color?: string | null
  avatar_url?: string | null
  initial?: string | null
}

export interface MemberJewelPillProps {
  member: MemberJewelData | { family_member?: MemberJewelData | null; name?: string; role?: string }
  role?: 'attendee' | 'driver' | 'supervise' | 'assignee'
  size?: 'sm' | 'md'
  showName?: boolean
  className?: string
  title?: string
}

function resolveMemberData(input: MemberJewelPillProps['member']): MemberJewelData {
  if ('family_member' in input && input.family_member) {
    return input.family_member
  }
  return input as MemberJewelData
}

export function MemberJewelPill({
  member: rawMember,
  role = 'attendee',
  size = 'sm',
  showName = true,
  className,
  title,
}: MemberJewelPillProps) {
  const member = resolveMemberData(rawMember)
  const name = member?.name?.trim() || 'Unknown'
  const firstName = name.split(' ')[0]
  const initial = member?.initial || firstName[0]?.toUpperCase() || '?'
  const color = member?.color_hex || member?.color || 'var(--color-casa-gold)'

  const isDriver = role === 'driver'
  const isSupervising = role === 'supervise'

  const tooltip = title || (
    isDriver ? `${name} (Driver)` :
    isSupervising ? `${name} (Supervising)` :
    name
  )

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-casa-bg border border-casa-border/80 text-caption font-medium shadow-2xs select-none transition-all',
        size === 'sm' ? 'px-1.5 py-0.5 min-h-[22px]' : 'px-2 py-1 min-h-[26px]',
        isDriver && 'border-casa-navy/30 bg-slate-50/80',
        className
      )}
      title={tooltip}
    >
      {/* Monogram Jewel */}
      <div className="relative inline-flex shrink-0">
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full font-bold text-white leading-none shadow-2xs',
            size === 'sm' ? 'size-4 text-3xs' : 'size-5 text-2xs'
          )}
          style={{ backgroundColor: color }}
        >
          {initial}
        </span>

        {/* Driver or Supervisor Mini-Badge */}
        {isDriver && (
          <span
            className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-casa-navy border border-casa-surface flex items-center justify-center text-white"
            aria-label="Driver"
          >
            <Car size={7} strokeWidth={2.5} />
          </span>
        )}
        {isSupervising && (
          <span
            className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-casa-success-strong border border-casa-surface flex items-center justify-center text-white"
            aria-label="Supervising"
          >
            <ShieldCheck size={7} strokeWidth={2.5} />
          </span>
        )}
      </div>

      {/* First Name Label */}
      {showName && (
        <span className="text-caption font-semibold text-casa-navy truncate max-w-[68px] leading-tight">
          {firstName}
        </span>
      )}
    </div>
  )
}

export interface MemberJewelStackProps {
  members: Array<MemberJewelData | { family_member?: MemberJewelData | null; id?: string; name?: string }>
  max?: number
  size?: 'sm' | 'md'
  showName?: boolean
  className?: string
}

export function MemberJewelStack({
  members,
  max = 2,
  size = 'sm',
  showName = true,
  className,
}: MemberJewelStackProps) {
  if (!members || members.length === 0) return null

  const visible = members.slice(0, max)
  const remainingCount = members.length - max

  const allNames = members
    .map(m => {
      const resolved = resolveMemberData(m)
      return resolved?.name || 'Unknown'
    })
    .join(', ')

  return (
    <div className={cn('flex items-center gap-1 shrink-0 flex-wrap', className)} title={allNames}>
      {visible.map((m, idx) => {
        const resolved = resolveMemberData(m)
        const key = resolved?.id || `${resolved?.name}-${idx}`
        return (
          <MemberJewelPill
            key={key}
            member={resolved}
            size={size}
            showName={showName}
          />
        )
      })}
      {remainingCount > 0 && (
        <span
          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-casa-bg border border-casa-border/80 text-3xs font-extrabold text-casa-muted leading-none shadow-2xs"
          title={allNames}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  )
}
