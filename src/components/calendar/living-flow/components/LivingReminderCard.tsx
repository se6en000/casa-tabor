import { useState } from 'react'
import { format } from 'date-fns'
import { Bell, Check, TimerReset, Loader2 } from 'lucide-react'

interface LivingReminderCardProps {
  title: string
  categoryIcon?: string
  dueDate: Date
  assignedAttendees: string
  onMarkDone: () => void | Promise<void>
  onSnooze: () => void | Promise<void>
}

export default function LivingReminderCard({
  title,
  dueDate,
  assignedAttendees,
  onMarkDone,
  onSnooze
}: LivingReminderCardProps) {
  const [actionState, setActionState] = useState<'idle' | 'completing' | 'snoozing'>('idle')
  const formattedDue = format(dueDate, 'EEE d · h:mm a')

  const handleMarkDone = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (actionState !== 'idle') return
    setActionState('completing')
    await onMarkDone()
  }

  const handleSnooze = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (actionState !== 'idle') return
    setActionState('snoozing')
    await onSnooze()
  }

  return (
    <div className="bg-white border-2 border-amber-400 rounded-2xl p-7 flex flex-col items-center text-center gap-4 shadow-sm transition-all">
      <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shadow-sm transition-all duration-300 ${
        actionState === 'completing'
          ? 'bg-emerald-50 border-emerald-500 text-emerald-600 scale-105'
          : 'bg-amber-50 border-amber-400 text-amber-700'
      }`}>
        {actionState === 'completing' ? (
          <Check size={32} className="animate-in zoom-in-50 duration-200" />
        ) : (
          <Bell size={28} />
        )}
      </div>

      <div>
        <span className="bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold py-1 px-3 rounded-full inline-flex items-center gap-1.5 mb-1.5 shadow-sm">
          <Bell size={12} className="text-amber-700" />
          <span>Household Task Reminder</span>
        </span>
        <h3 className="font-serif text-2xl font-semibold text-slate-900 leading-tight">
          {title}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Assigned to: {assignedAttendees} · Due {formattedDue}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full mt-1.5">
        <button
          onClick={handleMarkDone}
          disabled={actionState !== 'idle'}
          className={`p-3.5 rounded-2xl text-white text-sm font-bold flex flex-col items-center gap-1 transition-all shadow-sm ${
            actionState === 'completing'
              ? 'bg-emerald-700 scale-95 opacity-90'
              : 'bg-emerald-600 hover:-translate-y-0.5 active:scale-95'
          }`}
        >
          {actionState === 'completing' ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
          <span>{actionState === 'completing' ? 'Marking Done…' : 'Mark Done'}</span>
        </button>
        <button
          onClick={handleSnooze}
          disabled={actionState !== 'idle'}
          className={`p-3.5 rounded-2xl bg-slate-100 text-slate-800 border border-slate-200 text-sm font-bold flex flex-col items-center gap-1 transition-all hover:border-amber-400 ${
            actionState === 'snoozing'
              ? 'bg-amber-50 border-amber-400 scale-95 opacity-90'
              : 'hover:-translate-y-0.5 active:scale-95'
          }`}
        >
          {actionState === 'snoozing' ? <Loader2 size={20} className="animate-spin text-amber-700" /> : <TimerReset size={20} />}
          <span>{actionState === 'snoozing' ? 'Snoozing…' : 'Snooze (1h)'}</span>
        </button>
      </div>
    </div>
  )
}
