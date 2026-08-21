import { useState } from 'react'
import { Sparkles, Trash2, Navigation, House, Car, ShieldCheck } from 'lucide-react'
import type { LivingFlowProps } from './types'
import type { FamilyMember } from '../../../types'
import { useLivingFlowState } from './hooks/useLivingFlowState'
import LivingFlowHeader from './components/LivingFlowHeader'
import LivingHeroTitleCard from './components/LivingHeroTitleCard'
import LivingDepartureHero from './components/LivingDepartureHero'
import LivingRouteTimeline from './components/LivingRouteTimeline'
import LivingVenueCard from './components/LivingVenueCard'
import LivingPrepCard from './components/LivingPrepCard'
import LivingReminderCard from './components/LivingReminderCard'
import RecurrenceScopeDialog from '../RecurrenceScopeDialog'
import { Button, IconButton, ConfirmationDialog } from '../../ui'

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
    setStartAndEnd,
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
    setRecurScope,
    setRecurrenceRule,
    isRecurring,
  } = useLivingFlowState(event, handleAnimatedClose)

  const activeAttendeesNames = familyMembers
    .filter((m: FamilyMember) => state.selectedMemberIds.includes(m.id))
    .map((m: FamilyMember) => m.name)
    .join(' + ') || 'Family'

  const isDrivingOuting = state.venue.driveMinutes > 0 && state.venue.name !== 'Home'

  const hasOffsiteDestination = Boolean(
    (state.venue.address && state.venue.address.trim()) ||
    (state.venue.name && state.venue.name.trim().toLowerCase() !== 'home')
  )

  const handleOpenDirections = () => {
    const dest = state.venue.address?.trim() || state.venue.name || ''
    if (!dest) return
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank')
  }

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
        isRecurring={isRecurring}
        onToggleMember={toggleMember}
        onSetRecurScope={setRecurScope}
        onClose={handleAnimatedClose}
        onSwitchToAi={onSwitchToAi}
      />

      {/* ══════ SCROLLABLE CONTENT BODY ══════ */}
      <div className="living-sidecar-body">
        
        {/* Hero Title Block (With Inline Date/Time, Recurrence & Category Steppers) */}
        <LivingHeroTitleCard
          title={state.title}
          category={state.category}
          mode={state.mode}
          startDate={state.startDate}
          endDate={state.endDate}
          durationMinutes={state.durationMinutes}
          isAllDay={state.isAllDay}
          rrule={state.rrule}
          sourceType={event?.source_type}
          onUpdateTitle={updateTitle}
          onSetStartAndDuration={setStartAndDuration}
          onSetStartAndEnd={setStartAndEnd}
          onSelectCategory={setCategory}
          onNudgeTime={nudgeMinutes}
          onUpdateRecurrence={setRecurrenceRule}
        />

        {/* Dynamic Mode: Calendar Event vs Task Reminder */}
        {state.mode === 'event' ? (
          <>
            {/* ⭐ Hero Departure Capsule (Shown if travel / drive is required) */}
            {isDrivingOuting && state.travelBehavior !== 'none' && !state.isAllDay ? (
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

            {/* Living Route Timeline (Shown if offsite travel / drive is required) */}
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

            {/* Explicit Location & Transit Status Card (When at Home or Local) */}
            {!isDrivingOuting && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                    <House size={14} className="text-amber-600" />
                    <span>Location & Logistics</span>
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                    <ShieldCheck size={12} className="text-emerald-700" />
                    <span>At Home</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <Button
                    variant={state.travelBehavior === 'none' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTravelBehavior('none')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
                      state.travelBehavior === 'none'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <House size={14} />
                    <span>At Home (No Drive)</span>
                  </Button>
                  <Button
                    variant={state.travelBehavior !== 'none' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTravelBehavior(state.travelBehavior === 'none' ? 'stay' : state.travelBehavior)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
                      state.travelBehavior !== 'none'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <Car size={14} />
                    <span>Needs Family Ride</span>
                  </Button>
                </div>

                {state.travelBehavior === 'none' ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium pt-0.5">
                    <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                    <span>0m transit buffer · No driver locked into transit</span>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100">
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
                  </div>
                )}
              </div>
            )}

            {/* Living Prep & What to Bring Checklist */}
            <LivingPrepCard event={event} />

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

      {/* Action Footer: Delete on Left, Directions in Center (if offsite), Copilot on Right */}
      <footer className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0 z-20">
        <IconButton
          variant="secondary"
          size="md"
          icon={<Trash2 size={18} />}
          onClick={deleteEvent}
          disabled={deleting}
          aria-label="Delete this event"
          title="Delete this event"
          className="text-casa-muted hover:text-casa-error hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        />

        {state.mode === 'event' && hasOffsiteDestination && (
          <Button
            variant="secondary"
            size="md"
            leadingIcon={<Navigation size={15} className="text-casa-navy" />}
            onClick={handleOpenDirections}
            className="flex-1 text-casa-navy font-bold text-caption shadow-xs"
          >
            Directions
          </Button>
        )}

        <Button
          variant="champagne"
          size="md"
          leadingIcon={<Sparkles size={15} className="text-casa-gold" />}
          onClick={() => {
            if (onSwitchToAi) onSwitchToAi()
            else onAskAi?.()
          }}
          className="flex-1 text-casa-navy font-bold text-caption shadow-xs"
          aria-label="Ask Copilot about this…"
        >
          Ask Copilot about this…
        </Button>
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
