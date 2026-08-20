import { Bell } from 'lucide-react'
import { Chip, PersonAvatarStack } from '../ui'

interface Props {
  id: string
  title: string
  members: { id: string; family_member: { name: string; color_hex: string } | null }[]
  onClick?: () => void
  onComplete?: (id: string) => void
  onDismiss?: (id: string) => void
}

export default function SwipeableReminderPill({ id: _id, title, members, onClick }: Props) {
  const people = members
    .map(m => (m.family_member ? { id: m.id, name: m.family_member.name, color: m.family_member.color_hex } : null))
    .filter(Boolean) as { id: string; name: string; color?: string }[]

  return (
    <Chip
      size="sm"
      tone="accent"
      onClick={onClick}
      icon={<Bell size={13} />}
    >
      <span className="truncate">{title}</span>
      {people.length > 0 && (
        <PersonAvatarStack people={people} size="sm" max={3} />
      )}
    </Chip>
  )
}
