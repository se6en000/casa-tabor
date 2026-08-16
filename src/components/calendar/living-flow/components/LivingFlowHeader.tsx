import { useState } from 'react'
import { Link2, X, ChevronDown, Users, Star, Check, Plus, Rotate3d } from 'lucide-react'
import type { FamilyMember } from '../../../../types'
import type { RecurrenceScope } from '../types'
import { getDisplayMemberColor } from '../../../../design-system/memberColors'
import { IconButton } from '../../../ui'

interface LivingFlowHeaderProps {
  familyMembers: FamilyMember[]
  selectedMemberIds: string[]
  primaryMemberId: string | null
  recurScope: RecurrenceScope
  onToggleMember: (id: string) => void
  onSetRecurScope: (scope: RecurrenceScope) => void
  onClose: () => void
  onSwitchToAi?: () => void
}

export default function LivingFlowHeader({
  familyMembers,
  selectedMemberIds,
  primaryMemberId,
  recurScope,
  onToggleMember,
  onSetRecurScope,
  onClose,
  onSwitchToAi
}: LivingFlowHeaderProps) {
  const [attendeesExpanded, setAttendeesExpanded] = useState(false)
  const activeMembers = familyMembers.filter(m => selectedMemberIds.includes(m.id))
  const attendeeNames = activeMembers.map(m => m.name).join(' + ') || 'No Attendees'

  return (
    <div className="flex flex-col border-b border-slate-200 bg-white shrink-0 relative z-20">
      {/* Main Header Bar */}
      <div className="py-3.5 px-5 flex items-center justify-between">
        {/* 1-Tap Attendee Trigger Capsule */}
        <div
          onClick={() => setAttendeesExpanded(prev => !prev)}
          title="Tap to manage attendees"
          className={`living-attendee-capsule ${attendeesExpanded ? 'bg-amber-50/50 shadow-sm' : ''}`}
        >
          <div className="flex items-center">
            {activeMembers.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="living-avatar-ring"
                style={{ backgroundColor: getDisplayMemberColor(m.color_hex) }}
              >
                {m.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            {attendeeNames}
          </span>
          <ChevronDown size={13} className={`text-slate-400 ${attendeesExpanded ? 'rotate-180 transition-transform' : ''}`} />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {onSwitchToAi && (
            <IconButton
              icon={<Rotate3d size={16} className="text-amber-700 transition-transform duration-300 group-hover:rotate-180" />}
              onClick={onSwitchToAi}
              className="living-header-action-btn group"
              title="Flip to Copilot chat"
              aria-label="Flip to Copilot chat"
            />
          )}
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
              alert('Event link copied to clipboard!')
            }}
            className="living-header-action-btn"
            aria-label="Share event link"
            title="Share event link"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="living-header-action-btn"
            aria-label="Close sidecar"
            title="Close sidecar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ══════ INLINE ATTENDEES DRAWER ══════ */}
      {attendeesExpanded && (
        <div className="p-4 bg-amber-50/30 border-t border-dashed border-amber-300 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
              <Users size={14} className="text-amber-700" />
              <span>Family Attendees</span>
            </span>
            <button
              onClick={() => setAttendeesExpanded(false)}
              className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
            >
              <span>Done</span>
              <X size={13} />
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
      )}
    </div>
  )
}
