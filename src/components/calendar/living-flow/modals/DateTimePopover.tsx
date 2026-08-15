import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { Clock, X, Calendar, Minus, Plus } from 'lucide-react'

interface DateTimePopoverProps {
  startDate: Date
  durationMinutes: number
  onSetStartAndDuration: (startDate: Date, durationMins: number) => void
  onClose: () => void
}

export default function DateTimePopover({
  startDate,
  durationMinutes,
  onSetStartAndDuration,
  onClose
}: DateTimePopoverProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(startDate))
  const [duration, setDuration] = useState<number>(durationMinutes)

  const hours24 = currentDate.getHours()
  const hour12 = hours24 % 12 || 12
  const minutes = currentDate.getMinutes()
  const period = hours24 >= 12 ? 'PM' : 'AM'

  const stepHour = (delta: number) => {
    const next = new Date(currentDate)
    next.setHours(next.getHours() + delta)
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const stepMinute = (delta: number) => {
    const next = new Date(currentDate)
    next.setMinutes(next.getMinutes() + delta)
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const togglePeriod = () => {
    const next = new Date(currentDate)
    if (period === 'AM') {
      next.setHours(next.getHours() + 12)
    } else {
      next.setHours(next.getHours() - 12)
    }
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const selectDayOffset = (days: number) => {
    const target = addDays(new Date(), days)
    const next = new Date(currentDate)
    next.setFullYear(target.getFullYear(), target.getMonth(), target.getDate())
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const selectDuration = (mins: number) => {
    setDuration(mins)
    onSetStartAndDuration(currentDate, mins)
  }

  return (
    <div 
      className="living-floating-card living-datetime-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Row */}
      <div className="living-card-title-row">
        <span className="living-card-heading">
          <Clock size={16} className="text-slate-700" />
          <span>Schedule & Start Time</span>
        </span>
        <button
          onClick={onClose}
          className="living-card-close-btn"
          aria-label="Close schedule popover"
        >
          <X size={16} />
        </button>
      </div>

      {/* 1. Day Selector Grid */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Select Day
        </div>
        <div className="day-selector-grid-exact">
          <button
            onClick={() => selectDayOffset(0)}
            className="day-select-pill-btn"
          >
            Today<small>{format(new Date(), 'EEE d')}</small>
          </button>
          <button
            onClick={() => selectDayOffset(1)}
            className="day-select-pill-btn active"
          >
            Tomorrow<small>{format(addDays(new Date(), 1), 'EEE d')}</small>
          </button>
          <button
            onClick={() => selectDayOffset(2)}
            className="day-select-pill-btn"
          >
            {format(addDays(new Date(), 2), 'EEEE')}<small>{format(addDays(new Date(), 2), 'EEE d')}</small>
          </button>
          <button
            onClick={() => selectDayOffset(3)}
            className="day-select-pill-btn"
          >
            <div className="flex flex-col items-center justify-center">
              <span>Pick Date</span>
              <Calendar size={12} className="mt-0.5" />
            </div>
          </button>
        </div>
      </div>

      {/* 2. Touch Stepper Wheels (48px targets) */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Start Time (Touch Steppers)
        </div>
        <div className="time-stepper-touch-grid">
          
          {/* Hour Column */}
          <div className="stepper-column-box">
            <span className="stepper-label-tag">Hour</span>
            <div className="stepper-number-display">
              {hour12 < 10 ? `0${hour12}` : hour12}
            </div>
            <div className="stepper-buttons-row">
              <button onClick={() => stepHour(-1)} className="stepper-arrow-btn" aria-label="Decrease hour">
                <Minus size={15} />
              </button>
              <button onClick={() => stepHour(1)} className="stepper-arrow-btn" aria-label="Increase hour">
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Minute Column */}
          <div className="stepper-column-box">
            <span className="stepper-label-tag">Minute</span>
            <div className="stepper-number-display">
              {minutes < 10 ? `0${minutes}` : minutes}
            </div>
            <div className="stepper-buttons-row">
              <button onClick={() => stepMinute(-5)} className="stepper-arrow-btn" aria-label="Decrease 5 minutes">
                <Minus size={15} />
              </button>
              <button onClick={() => stepMinute(5)} className="stepper-arrow-btn" aria-label="Increase 5 minutes">
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Period Column */}
          <div className="stepper-column-box">
            <span className="stepper-label-tag">Period</span>
            <div className="stepper-number-display">
              {period}
            </div>
            <button onClick={togglePeriod} className="ampm-toggle-btn">
              AM / PM
            </button>
          </div>

        </div>
      </div>

      {/* 3. Duration Presets */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Event Duration
        </div>
        <div className="duration-chips-row">
          {[
            { mins: 45, label: '45m' },
            { mins: 90, label: '1h 30m' },
            { mins: 160, label: '2h 40m' },
            { mins: 240, label: '4h' },
            { mins: 480, label: 'All Day' }
          ].map((item) => (
            <button
              key={item.mins}
              onClick={() => selectDuration(item.mins)}
              className={`dur-chip-btn ${duration === item.mins ? 'active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
