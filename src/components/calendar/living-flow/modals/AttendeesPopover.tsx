import { Users, X, Star, Check, Plus } from 'lucide-react'
import type { FamilyMember } from '../../../../types'
import type { RecurrenceScope } from '../types'
import { getDisplayMemberColor } from '../../../../design-system/memberColors'

interface AttendeesPopoverProps {
  familyMembers: FamilyMember[]
  selectedMemberIds: string[]
  primaryMemberId: string | null
  recurScope: RecurrenceScope
  onToggleMember: (id: string) => void
  onSetRecurScope: (scope: RecurrenceScope) => void
  onClose: () => void
}

export default function AttendeesPopover({
  familyMembers,
  selectedMemberIds,
  primaryMemberId,
  recurScope,
  onToggleMember,
  onSetRecurScope,
  onClose
}: AttendeesPopoverProps) {
  return (
    <div 
      className="living-floating-card living-attendees-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Row */}
      <div className="living-card-title-row">
        <span className="living-card-heading">
          <Users size={16} className="text-slate-700" />
          <span>Family Attendees</span>
        </span>
        <button
          onClick={onClose}
          className="living-card-close-btn"
          aria-label="Close attendees popover"
        >
          <X size={16} />
        </button>
      </div>

      {/* 2x2 Family Members Grid */}
      <div className="living-member-grid">
        {familyMembers.map((member) => {
          const isSelected = selectedMemberIds.includes(member.id)
          const isPrimary = member.id === primaryMemberId
          const initial = member.name.charAt(0).toUpperCase()
          const roleLabel = member.role === 'parent' 
            ? (member.can_drive ? 'Parent · Driver' : 'Parent')
            : 'Child'

          return (
            <div
              key={member.id}
              onClick={() => onToggleMember(member.id)}
              className={`living-member-card ${isSelected ? 'selected' : ''}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="living-member-avatar"
                  style={{ backgroundColor: getDisplayMemberColor(member.color_hex) }}
                >
                  {initial}
                </div>
                <div className="min-w-0 truncate">
                  <div className="living-member-name truncate">
                    {member.name}
                  </div>
                  <div className="living-member-role truncate">
                    {roleLabel}
                  </div>
                </div>
              </div>

              {/* Badge Icon */}
              <div className="text-sm font-bold shrink-0 ml-1.5 flex items-center justify-center">
                {isSelected ? (
                  isPrimary ? (
                    <Star size={16} className="text-amber-500 fill-amber-400" />
                  ) : (
                    <Check size={16} className="text-emerald-600 stroke-[2.5]" />
                  )
                ) : (
                  <Plus size={16} className="text-slate-400" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Recurrence Scope Box */}
      <div className="living-recurrence-box">
        <span className="living-recur-label">
          Apply changes to:
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => onSetRecurScope('this')}
            className={`living-recur-pill ${recurScope === 'this' ? 'active' : ''}`}
          >
            This Event Only
          </button>
          <button
            onClick={() => onSetRecurScope('all')}
            className={`living-recur-pill ${recurScope === 'all' ? 'active' : ''}`}
          >
            All Repeating
          </button>
        </div>
      </div>
    </div>
  )
}
