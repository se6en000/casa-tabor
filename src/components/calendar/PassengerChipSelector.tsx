import { Check, X } from 'lucide-react'
import type { FamilyMember } from '../../types'
import { Chip } from '../ui'

interface PassengerChipSelectorProps {
  members: FamilyMember[]
  selectedNames: string[]
  disabledNames?: string[]
  onToggle: (member: FamilyMember, selected: boolean) => void
  onRemoveExternal: (name: string) => void
}

export default function PassengerChipSelector({
  members,
  selectedNames,
  disabledNames = [],
  onToggle,
  onRemoveExternal,
}: PassengerChipSelectorProps) {
  const householdNames = new Set(members.map((member) => member.name))
  const externalNames = selectedNames.filter((name) => !householdNames.has(name))
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Passengers">
      {members.map((member) => {
        const selected = selectedNames.includes(member.name)
        const disabled = disabledNames.includes(member.name)
        return (
          <Chip
            key={member.id}
            size="sm"
            className="min-h-control-lg rounded-pill px-2.5 py-0.5"
            selected={selected}
            disabled={disabled}
            onClick={() => onToggle(member, !selected)}
          >
            <span
              className="flex size-control-sm shrink-0 items-center justify-center rounded-pill text-caption font-bold text-white"
              style={{ backgroundColor: member.color_hex ?? 'var(--color-casa-muted)' }}
            >
              {member.name[0]?.toUpperCase()}
            </span>
            {member.name}
            {selected && <Check size={15} />}
          </Chip>
        )
      })}
      {externalNames.map((name) => (
        <Chip
          key={name}
          size="sm"
          className="min-h-control-lg rounded-pill px-2.5 py-0.5"
          aria-label={`Remove ${name} from this leg`}
          onClick={() => onRemoveExternal(name)}
        >
          {name}
          <X size={15} />
        </Chip>
      ))}
    </div>
  )
}
