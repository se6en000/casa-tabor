import { useState, useEffect, useRef } from 'react'
import { format, addDays, isSameDay } from 'date-fns'
import { Clock, X, Calendar, Minus, Plus } from 'lucide-react'

interface DateTimePopoverProps {
  startDate: Date
  durationMinutes: number
  isAllDay?: boolean
  onSetStartAndDuration: (startDate: Date, durationMins: number, isAllDay?: boolean) => void
  onClose: () => void
}

export default function DateTimePopover({
  startDate,
  durationMinutes,
  isAllDay = false,
  onSetStartAndDuration,
  onClose
}: DateTimePopoverProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(startDate))
  const [duration, setDuration] = useState<number>(durationMinutes)
  const [localIsAllDay, setLocalIsAllDay] = useState<boolean>(Boolean(isAllDay))
  const dateInputRef = useRef<HTMLInputElement>(null)

  const handleOpenDatePicker = () => {
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === 'function') {
          dateInputRef.current.showPicker()
        } else {
          dateInputRef.current.focus()
        }
      } catch {
        dateInputRef.current.focus()
      }
    }
  }

  useEffect(() => {
    setCurrentDate(new Date(startDate))
  }, [startDate])

  useEffect(() => {
    setDuration(durationMinutes)
  }, [durationMinutes])

  useEffect(() => {
    setLocalIsAllDay(Boolean(isAllDay))
  }, [isAllDay])

  const hours24 = currentDate.getHours()
  const hour12 = hours24 % 12 || 12
  const minutes = currentDate.getMinutes()
  const period = hours24 >= 12 ? 'PM' : 'AM'

  const stepHour = (delta: number) => {
    const next = new Date(currentDate)
    next.setHours(next.getHours() + delta)
    setCurrentDate(next)
    setLocalIsAllDay(false)
    onSetStartAndDuration(next, duration, false)
  }

  const stepMinute = (delta: number) => {
    const next = new Date(currentDate)
    next.setMinutes(next.getMinutes() + delta)
    setCurrentDate(next)
    setLocalIsAllDay(false)
    onSetStartAndDuration(next, duration, false)
  }

  const togglePeriod = () => {
    const next = new Date(currentDate)
    if (period === 'AM') {
      next.setHours(next.getHours() + 12)
    } else {
      next.setHours(next.getHours() - 12)
    }
    setCurrentDate(next)
    setLocalIsAllDay(false)
    onSetStartAndDuration(next, duration, false)
  }

  const selectDayOffset = (days: number) => {
    const target = addDays(new Date(), days)
    const next = new Date(currentDate)
    next.setFullYear(target.getFullYear(), target.getMonth(), target.getDate())
    setCurrentDate(next)
    onSetStartAndDuration(next, duration, localIsAllDay)
  }

  const selectExplicitDate = (dateStr: string) => {
    if (!dateStr) return
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3) {
      const next = new Date(currentDate)
      next.setFullYear(parts[0], parts[1] - 1, parts[2])
      setCurrentDate(next)
      onSetStartAndDuration(next, duration, localIsAllDay)
    }
  }

  const selectDuration = (mins: number) => {
    if (mins >= 1440) {
      setDuration(1440)
      setLocalIsAllDay(true)
      onSetStartAndDuration(currentDate, 1440, true)
    } else {
      setDuration(mins)
      setLocalIsAllDay(false)
      onSetStartAndDuration(currentDate, mins, false)
    }
  }

  const isTodayActive = isSameDay(currentDate, new Date())
  const isTomorrowActive = isSameDay(currentDate, addDays(new Date(), 1))
  const isDay2Active = isSameDay(currentDate, addDays(new Date(), 2))
  const isOtherDayActive = !isTodayActive && !isTomorrowActive && !isDay2Active

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
            className={`day-select-pill-btn ${isTodayActive ? 'active' : ''}`}
          >
            Today<small>{format(new Date(), 'EEE d')}</small>
          </button>
          <button
            onClick={() => selectDayOffset(1)}
            className={`day-select-pill-btn ${isTomorrowActive ? 'active' : ''}`}
          >
            Tomorrow<small>{format(addDays(new Date(), 1), 'EEE d')}</small>
          </button>
          <button
            onClick={() => selectDayOffset(2)}
            className={`day-select-pill-btn ${isDay2Active ? 'active' : ''}`}
          >
            {format(addDays(new Date(), 2), 'EEEE')}<small>{format(addDays(new Date(), 2), 'EEE d')}</small>
          </button>
          <label
            onClick={handleOpenDatePicker}
            className={`day-select-pill-btn relative cursor-pointer ${isOtherDayActive ? 'active' : ''}`}
          >
            <input
              ref={dateInputRef}
              type="date"
              value={format(currentDate, 'yyyy-MM-dd')}
              onChange={(e) => selectExplicitDate(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
              aria-label="Pick date"
              tabIndex={-1}
            />
            <div className="flex flex-col items-center justify-center pointer-events-none">
              <span>{isOtherDayActive ? format(currentDate, 'MMM d') : 'Pick Date'}</span>
              <Calendar size={12} className="mt-0.5" />
            </div>
          </label>
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
            { mins: 1440, label: 'All Day' }
          ].map((item) => {
            const isChipActive = item.mins >= 1440 ? localIsAllDay : (!localIsAllDay && duration === item.mins)
            return (
              <button
                key={item.mins}
                onClick={() => selectDuration(item.mins)}
                className={`dur-chip-btn ${isChipActive ? 'active' : ''}`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
