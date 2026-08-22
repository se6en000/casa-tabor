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

  // Only include family members who have the homepage sidebar setting turned on in their profile
  const visibleMembers = React.useMemo(() => {
    return familyMembers.filter((m) => {
      if (m.show_on_home_sidebar === false) {
        return m.name.toLowerCase() === currentAssigneeName?.toLowerCase()
      }
      return true
    })
  }, [familyMembers, currentAssigneeName])

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

      {/* ── 1-Tap Fast Member Selection Dropdown (Bounded within 3rd Rail) ── */}
      {isOpen && (
        <>
          {/* Invisible dismissal backdrop */}
          <div
            className="fixed inset-0 z-20 cursor-default"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(false)
            }}
          />

          <div className="absolute left-0 top-full mt-1.5 z-30 p-2 rounded-2xl bg-white/98 backdrop-blur-md border border-amber-300 shadow-xl flex flex-col gap-1.5 w-[220px] max-w-[calc(100vw-2rem)] animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="text-3xs font-mono font-bold text-casa-muted uppercase tracking-wider px-1 pb-1 border-b border-casa-border/50 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <UserCheck size={10} className="text-amber-700" />
                <span>Select Assignee</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1">
              {visibleMembers.map((member) => {
                const isSelected = member.name.toLowerCase() === currentAssigneeName?.toLowerCase()
                const isBroadFamily = member.name.toLowerCase().includes('family')
                return (
                  <Button
                    key={member.id}
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleSelect(e, member.name)}
                    className={cn(
                      'px-2 py-1.5 rounded-xl text-2xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer border min-h-[34px] h-auto justify-start truncate',
                      isBroadFamily && 'col-span-2',
                      isSelected
                        ? 'bg-casa-navy text-casa-gold border-casa-navy shadow-2xs ring-1 ring-casa-gold/40'
                        : 'bg-casa-surface/90 hover:bg-casa-surface-subtle border-casa-border/70 hover:border-amber-400 text-casa-navy'
                    )}
                  >
                    <MemberJewelPill
                      member={member}
                      size="sm"
                      showName={false}
                      className="border-0 bg-transparent p-0 shadow-none min-h-0 shrink-0"
                    />
                    <span className="truncate">{member.name}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
