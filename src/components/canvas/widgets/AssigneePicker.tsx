import React, { useState } from 'react'
import { ChevronDown, UserCheck } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { Button } from '../../ui/Button'
import { MemberJewelPill } from '../../ui/MemberJewelPill'
import type { FamilyMember } from '../../../types'

export interface AssigneePickerProps {
  currentAssigneeName?: string | null
  familyMembers: FamilyMember[]
  onSelectAssignee: (memberName: string) => void
  className?: string
}

export function AssigneePicker({
  currentAssigneeName,
  familyMembers,
  onSelectAssignee,
  className,
}: AssigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const currentMember = familyMembers.find(
    (m) => m.name.toLowerCase() === currentAssigneeName?.toLowerCase()
  )

  const handleSelect = (e: React.MouseEvent, memberName: string) => {
    e.stopPropagation()
    onSelectAssignee(memberName)
    setIsOpen(false)
    navigator.vibrate?.(15)
  }

  return (
    <div className={cn('relative inline-flex items-center', className)} onClick={(e) => e.stopPropagation()}>
      {/* ── Trigger Chip ── */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Change assignee (currently ${currentAssigneeName || 'unassigned'})`}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        className={cn(
          'text-3xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 transition-all cursor-pointer border min-h-0 h-auto select-none',
          isOpen
            ? 'bg-casa-navy text-casa-gold border-casa-navy shadow-2xs ring-1 ring-casa-gold/40'
            : 'bg-casa-bg hover:bg-casa-surface border-casa-border hover:border-casa-gold text-casa-navy'
        )}
      >
        {currentMember ? (
          <MemberJewelPill
            member={currentMember}
            size="sm"
            showName={false}
            className="border-0 bg-transparent p-0 shadow-none min-h-0"
          />
        ) : (
          <span className="w-2 h-2 rounded-full shrink-0 bg-casa-gold" />
        )}
        <span>{currentAssigneeName ? `For ${currentAssigneeName}` : 'Assign'}</span>
        <ChevronDown size={10} className={cn('transition-transform duration-150', isOpen && 'rotate-180 text-casa-gold')} />
      </Button>

      {/* ── 1-Tap Fast Member Selection Strip ── */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-30 p-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-casa-gold/60 shadow-lg flex items-center gap-1 flex-wrap animate-in fade-in-0 zoom-in-95 duration-150 min-w-max max-w-[280px]">
          <span className="text-3xs font-mono font-bold text-casa-muted uppercase tracking-wider px-1.5 py-0.5 block w-full border-b border-casa-border/50 mb-0.5 flex items-center gap-1">
            <UserCheck size={10} className="text-casa-gold" />
            <span>Select Assignee</span>
          </span>

          {familyMembers.map((member) => {
            const isSelected = member.name.toLowerCase() === currentAssigneeName?.toLowerCase()
            return (
              <Button
                key={member.id}
                variant="ghost"
                size="sm"
                onClick={(e) => handleSelect(e, member.name)}
                className={cn(
                  'px-2 py-1 rounded-lg text-2xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border min-h-[30px] h-auto',
                  isSelected
                    ? 'bg-casa-navy text-casa-gold border-casa-navy shadow-2xs ring-1 ring-casa-gold/40'
                    : 'bg-casa-surface hover:bg-casa-surface-subtle border-casa-border hover:border-casa-gold text-casa-navy'
                )}
              >
                <MemberJewelPill
                  member={member}
                  size="sm"
                  showName={false}
                  className="border-0 bg-transparent p-0 shadow-none min-h-0"
                />
                <span>{member.name}</span>
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
