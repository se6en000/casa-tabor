import { UserPlus } from 'lucide-react'
import type { FamilyMember, PrepItem } from '../../types'
import { Chip, PersonAvatarStack } from '../ui'

interface PrepItemAssigneeChipProps {
  item: PrepItem
  familyMembers: FamilyMember[]
  onNudge: () => void
}

/**
 * Surfaces prep-item assignment directly on the card face. assigned_to already had a
 * full picker in PrepItemDetailPanel, but with zero visibility on the card itself it saw
 * near-zero real-world adoption — nobody could tell an item was (or wasn't) assigned
 * without opening the detail panel first.
 */
export default function PrepItemAssigneeChip({ item, familyMembers, onNudge }: PrepItemAssigneeChipProps) {
  const assignee = item.assigned_to ? familyMembers.find((m) => m.id === item.assigned_to) ?? null : null

  if (assignee) {
    return (
      <Chip
        size="sm"
        tone="neutral"
        icon={<PersonAvatarStack people={[{ id: assignee.id, name: assignee.name, color: assignee.color_hex }]} size="sm" max={1} />}
      >
        {assignee.name}
      </Chip>
    )
  }

  return (
    <Chip size="sm" tone="neutral" icon={<UserPlus size={11} />} onClick={onNudge}>
      Assign
    </Chip>
  )
}
