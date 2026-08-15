import { format } from 'date-fns'
import { Bell, Check, TimerReset } from 'lucide-react'

interface LivingReminderCardProps {
  title: string
  categoryIcon?: string
  dueDate: Date
  assignedAttendees: string
  onMarkDone: () => void
  onSnooze: () => void
}

export default function LivingReminderCard({
  title,
  dueDate,
  assignedAttendees,
  onMarkDone,
  onSnooze
}: LivingReminderCardProps) {
  const formattedDue = format(dueDate, 'EEE d · h:mm a')

  return (
    <div className="bg-white border-2 border-amber-400 rounded-2xl p-7 flex flex-col items-center text-center gap-4 shadow-sm">
      <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-400 flex items-center justify-center text-amber-700 shadow-sm">
        <Bell size={28} />
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
          onClick={onMarkDone}
          className="p-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex flex-col items-center gap-1 hover:-translate-y-0.5 transition-transform shadow-sm"
        >
          <Check size={20} />
          <span>Mark Done</span>
        </button>
        <button
          onClick={onSnooze}
          className="p-3.5 rounded-2xl bg-slate-100 text-slate-800 border border-slate-200 text-sm font-bold flex flex-col items-center gap-1 hover:-translate-y-0.5 transition-transform hover:border-amber-400"
        >
          <TimerReset size={20} />
          <span>Snooze (1h)</span>
        </button>
      </div>
    </div>
  )
}
