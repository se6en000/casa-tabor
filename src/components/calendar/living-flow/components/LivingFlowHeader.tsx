import { useState, useMemo } from 'react'
import { Link2, X, ChevronDown, Users, Star, Check, Plus, Rotate3d, Repeat, AlertTriangle } from 'lucide-react'
import type { FamilyMember } from '../../../../types'
import type { RecurrenceScope } from '../types'
import { getDisplayMemberColor, getMemberRoleLabel } from '../../../../design-system/memberColors'
import { Button, IconButton, Chip } from '../../../ui'

interface LivingFlowHeaderProps {
  familyMembers: FamilyMember[]
  selectedMemberIds: string[]
  primaryMemberId: string | null
  recurScope: RecurrenceScope
  isRecurring?: boolean
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
  isRecurring,
  onToggleMember,
  onSetRecurScope,
  onClose,
  onSwitchToAi
}: LivingFlowHeaderProps) {
  const [attendeesExpanded, setAttendeesExpanded] = useState(false)
  const visibleMembers = useMemo(
    () => familyMembers.filter((m) => (m.show_on_home_sidebar ?? true) || selectedMemberIds.includes(m.id)),
    [familyMembers, selectedMemberIds]
  )
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
            <Button
              variant="ghost"
              type="button"
              onClick={onSwitchToAi}
              className="min-h-[34px] px-3 py-1 flex items-center gap-1.5 rounded-full text-2xs font-bold text-casa-navy bg-casa-accent-subtle hover:bg-casa-accent-soft border border-casa-gold/40 shadow-2xs transition-all active:scale-95 group shrink-0"
              title="Flip to Copilot"
              aria-label="Flip to Copilot"
            >
              <Rotate3d size={14} className="text-casa-gold transition-transform duration-300 group-hover:rotate-180" />
              <span>Flip to Copilot</span>
            </Button>
          )}
          <IconButton
            icon={<Link2 size={16} className="text-slate-800" />}
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
              alert('Event link copied to clipboard!')
            }}
            className="living-header-action-btn"
            aria-label="Share event link"
            title="Share event link"
          />
          <IconButton
            icon={<X size={16} className="text-slate-800" />}
            onClick={onClose}
            className="living-header-action-btn"
            aria-label="Close sidecar"
            title="Close sidecar"
          />
        </div>
      </div>

      {/* Recurrence Banner & Scope Controls */}
      {isRecurring && (
        <div className="px-5 py-2 flex items-center justify-between border-t border-amber-200/60 bg-amber-50/50">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <Repeat size={13} className="text-amber-700 shrink-0" />
            <span>Repeating Event</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-0.5">Apply edits:</span>
            <Chip
              size="sm"
              tone={recurScope === 'this' ? 'accent' : 'neutral'}
              selected={recurScope === 'this'}
              onClick={() => onSetRecurScope('this')}
            >
              This only
            </Chip>
            <Chip
              size="sm"
              tone={recurScope === 'all' ? 'accent' : 'neutral'}
              selected={recurScope === 'all'}
              onClick={() => onSetRecurScope('all')}
            >
              All repeating
            </Chip>
          </div>
        </div>
      )}

      {/* Caution Banner when Editing All Repeating Events */}
      {isRecurring && recurScope === 'all' && (
        <div className="px-5 py-2 flex items-center gap-2 bg-amber-500/15 border-t border-amber-300/80 text-amber-950 text-xs font-semibold">
          <AlertTriangle size={14} className="text-amber-700 shrink-0" />
          <span>Caution: Changes will apply to all repeating events in this series.</span>
        </div>
      )}

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
            {visibleMembers.map((member: FamilyMember) => {
              const isSelected = selectedMemberIds.includes(member.id)
              const isPrimary = member.id === primaryMemberId
              const initial = member.name.charAt(0).toUpperCase()
              const roleLabel = getMemberRoleLabel(member)

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
