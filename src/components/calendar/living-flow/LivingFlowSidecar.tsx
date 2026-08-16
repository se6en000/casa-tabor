import { useState } from 'react'
import { Sparkles, Trash2, Check } from 'lucide-react'
import type { LivingFlowProps } from './types'
import type { FamilyMember } from '../../../types'
import { useLivingFlowState } from './hooks/useLivingFlowState'
import LivingFlowHeader from './components/LivingFlowHeader'
import LivingHeroTitleCard from './components/LivingHeroTitleCard'
import LivingDepartureHero from './components/LivingDepartureHero'
import LivingRouteTimeline from './components/LivingRouteTimeline'
import LivingVenueCard from './components/LivingVenueCard'
import LivingReminderCard from './components/LivingReminderCard'
import RecurrenceScopeDialog from '../RecurrenceScopeDialog'
import { ConfirmationDialog } from '../../ui'

import './living-flow.css'

export default function LivingFlowSidecar({
  event,
  onClose,
  embedded = false,
  onAskAi,
  onSwitchToAi,
}: LivingFlowProps) {
  const [isClosing, setIsClosing] = useState(false)

  const handleAnimatedClose = () => {
    if (isClosing) return
    setIsClosing(true)
    if (embedded) {
      onClose()
    } else {
      setTimeout(() => {
        onClose()
      }, 220)
    }
  }

  const {
    state,
    familyMembers,
    departureDate,
    pickupDepartureDate,
    returnDate,
    updateTitle,
    toggleMember,
    setTravelBehavior,
    setDriver,
    setVenue,
    setStartAndDuration,
    nudgeMinutes,
    setCategory,
    deleteEvent,
    handleDelete,
    handleRecurringDelete,
    showDeleteScopeModal,
    setShowDeleteScopeModal,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleting,
    deleteError,
    setDeleteError,
    deleteBlocked,
    setDeleteBlocked,
    recurringDeleteActionIdRef,
    scopeImpacts,
    markCompleted,
    snoozeReminder,
    setRecurScope
  } = useLivingFlowState(event, handleAnimatedClose)

  const activeAttendeesNames = familyMembers
    .filter((m: FamilyMember) => state.selectedMemberIds.includes(m.id))
    .map((m: FamilyMember) => m.name)
    .join(' + ') || 'Family'

  const isDrivingOuting = state.venue.driveMinutes > 0 && state.venue.name !== 'Home'

  const content = (
    <aside 
      className="living-flow-sidecar"
      onClick={(e) => e.stopPropagation()}
    >
      
      {/* ══════ TOP HEADER (With Inline Attendees Drawer) ══════ */}
      <LivingFlowHeader
        familyMembers={familyMembers}
        selectedMemberIds={state.selectedMemberIds}
        primaryMemberId={state.primaryMemberId}
        recurScope={state.recurScope}
        onToggleMember={toggleMember}
        onSetRecurScope={setRecurScope}
        onClose={handleAnimatedClose}
        onSwitchToAi={onSwitchToAi}
      />

      {/* ══════ SCROLLABLE CONTENT BODY ══════ */}
      <div className="living-sidecar-body">
        
        {/* Hero Title Block (With Inline Date/Time & Category Steppers) */}
        <LivingHeroTitleCard
          title={state.title}
          category={state.category}
          mode={state.mode}
          startDate={state.startDate}
          durationMinutes={state.durationMinutes}
          onUpdateTitle={updateTitle}
          onSetStartAndDuration={setStartAndDuration}
          onSelectCategory={setCategory}
          onNudgeTime={nudgeMinutes}
        />

        {/* Dynamic Mode: Calendar Event vs Task Reminder */}
        {state.mode === 'event' ? (
          <>
            {/* ⭐ Hero Departure Capsule (Shown if travel / drive is required) */}
            {isDrivingOuting ? (
              <LivingDepartureHero
                departureDate={departureDate}
                arrivalDate={state.startDate}
                pickupDepartureDate={pickupDepartureDate}
                venue={state.venue}
                bufferMinutes={state.bufferMinutes}
                travelBehavior={state.travelBehavior}
                onOpenBufferOrTime={() => {}}
              />
            ) : null}

            {/* Living Route Timeline (Shown if travel / drive is required) */}
            {isDrivingOuting ? (
              <LivingRouteTimeline
                departureDate={departureDate}
                arrivalDate={state.startDate}
                pickupDepartureDate={pickupDepartureDate}
                returnDate={returnDate}
                durationMinutes={state.durationMinutes}
                venue={state.venue}
                travelBehavior={state.travelBehavior}
                driverLeg1={state.driverLeg1}
                driverLeg2={state.driverLeg2}
                familyMembers={familyMembers}
                selectedMemberIds={state.selectedMemberIds}
                onSetTravelBehavior={setTravelBehavior}
                onAssignDriver={setDriver}
              />
            ) : null}

            {/* Venue & Address Card (With Live Google Places Search) */}
            <LivingVenueCard
              venue={state.venue}
              onSelectVenue={setVenue}
            />
          </>
        ) : (
          /* Dedicated Focused Reminder View */
          <LivingReminderCard
            title={state.title}
            dueDate={state.startDate}
            assignedAttendees={activeAttendeesNames}
            onMarkDone={markCompleted}
            onSnooze={() => snoozeReminder(60)}
          />
        )}

      </div>

      {/* Action Footer: Copilot + Quick Actions */}
      <footer className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0 z-20">
        <button
          onClick={deleteEvent}
          disabled={deleting}
          className="living-footer-action-btn delete-btn disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Delete this event"
          title="Delete this event"
        >
          <Trash2 size={18} />
        </button>

        {state.mode === 'event' && (
          <button
            onClick={markCompleted}
            className="living-footer-action-btn done-btn"
            aria-label="Mark event complete"
            title="Mark event complete"
          >
            <Check size={18} />
          </button>
        )}

        <button
          onClick={() => onAskAi?.(`Tell me about ${state.title} at ${state.venue.name}`)}
          className="flex-1 py-2.5 px-4 rounded-full bg-amber-50 border border-amber-300 text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all min-h-[44px]"
        >
          <Sparkles size={14} className="text-amber-700" />
          <span>Ask Copilot about this…</span>
        </button>
      </footer>

    </aside>
  )

  const modals = (
    <>
      <RecurrenceScopeDialog
        open={showDeleteScopeModal}
        operation="delete"
        selectedStart={event?.start_time}
        impacts={scopeImpacts}
        loading={deleting}
        error={deleteError}
        onClose={() => {
          setShowDeleteScopeModal(false)
          setDeleteError(null)
          recurringDeleteActionIdRef.current = null
        }}
        onSelect={(scope) => void handleRecurringDelete(scope)}
      />

      <ConfirmationDialog
        open={showDeleteConfirm}
        onClose={() => {
          if (deleting) return
          setShowDeleteConfirm(false)
          setDeleteError(null)
          setDeleteBlocked(false)
        }}
        onConfirm={() => void handleDelete()}
        title={
          deleteBlocked
            ? 'Cannot safely delete this event'
            : (state.title || event?.title || '').trim()
              ? `Delete "${(state.title || event?.title || '').trim()}"?`
              : 'Delete this event?'
        }
        description={
          deleteBlocked
            ? (deleteError || 'Casa left the event unchanged.')
            : 'This will remove the event from Casa Tabor and its connected Google Calendar.'
        }
        confirmLabel="Delete event"
        cancelLabel={deleteBlocked ? 'Close' : 'Keep event'}
        destructive={!deleteBlocked}
        loading={deleting}
        error={deleteError}
      />
    </>
  )

  if (embedded) {
    return (
      <>
        {content}
        {modals}
      </>
    )
  }

  return (
    <>
      <div 
        onClick={handleAnimatedClose}
        className={`living-sidecar-modal-overlay ${isClosing ? 'is-closing' : ''}`}
        aria-hidden="true"
      />
      <div 
        className={`living-sidecar-modal-panel ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
      {modals}
    </>
  )
}
