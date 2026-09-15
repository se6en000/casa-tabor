import { useMemo } from 'react'
import { X, Users, Star, Check, Plus, Repeat, AlertTriangle } from 'lucide-react'
import type { FamilyMember } from '../../../../types'
import type { RecurrenceScope } from '../types'
import { getDisplayMemberColor, getMemberRoleLabel } from '../../../../design-system/memberColors'
import { Chip } from '../../../ui'

interface LivingFlowHeaderProps {
  familyMembers: FamilyMember[]
  selectedMemberIds: string[]
  primaryMemberId: string | null
  recurScope: RecurrenceScope
  isRecurring?: boolean
  attendeesExpanded: boolean
  onCloseAttendees: () => void
  onToggleMember: (id: string) => void
  onSetRecurScope: (scope: RecurrenceScope) => void
}

/**
 * Everything BELOW the navy micro-hero (title + attendee pill, now rendered
 * by LivingHeroTitleCard) -- the recurring-event banner, the "editing all
 * repeating events" caution, and the attendee-picker drawer. Kept in the
 * app's normal light/dark card language rather than the micro-hero's fixed
 * white-on-navy palette (2026-09-15).
 */
export default function LivingFlowHeader({
  familyMembers,
  selectedMemberIds,
  primaryMemberId,
  recurScope,
  isRecurring,
  attendeesExpanded,
  onCloseAttendees,
  onToggleMember,
  onSetRecurScope,
}: LivingFlowHeaderProps) {
  const visibleMembers = useMemo(
    () => familyMembers.filter((m) => (m.show_on_home_sidebar ?? true) || selectedMemberIds.includes(m.id)),
    [familyMembers, selectedMemberIds]
  )

  if (!isRecurring && !attendeesExpanded) return null

  return (
    <div className="flex flex-col bg-casa-bg">
      {/* Recurrence Banner & Scope Controls */}
      {isRecurring && (
        <div className="px-5 py-2 flex items-center justify-between rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/50">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-300">
            <Repeat size={13} className="text-amber-700 dark:text-amber-400 shrink-0" />
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
        <div className="mt-2 px-5 py-2 flex items-center gap-2 rounded-2xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-300/80 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs font-semibold">
          <AlertTriangle size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span>Caution: Changes will apply to all repeating events in this series.</span>
        </div>
      )}

      {/* ══════ INLINE ATTENDEES DRAWER ══════ */}
      {attendeesExpanded && (
        <div className="mt-2 p-4 rounded-2xl bg-amber-50/30 dark:bg-amber-950/20 border border-dashed border-amber-300 dark:border-amber-700 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-900 dark:text-slate-300 tracking-wider flex items-center gap-1.5">
              <Users size={14} className="text-amber-700 dark:text-amber-400" />
              <span>Family Attendees</span>
            </span>
            <button
              onClick={onCloseAttendees}
              className="text-xs text-slate-500 hover:text-slate-900 hover:dark:text-slate-300 font-bold flex items-center gap-0.5"
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
                        <Check size={16} className="text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
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
