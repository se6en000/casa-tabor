import { useState, useEffect, useMemo } from 'react'
import { Repeat, Plus, Minus } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Chip, SegmentedControl, Input, IconButton } from '../ui'
import {
  DAY_LABELS,
  DAY_NAMES_SHORT,
  buildRruleString,
  buildRruleSummary,
  parseRrule,
  type RecurrenceFrequency,
  type RecurrenceRuleState,
} from './RecurrenceRuleBuilder.helpers'

export type {
  RecurrenceFrequency,
  RecurrenceEndType,
  RecurrenceRuleState,
} from './RecurrenceRuleBuilder.helpers'

export interface RecurrenceRuleBuilderProps {
  value: string | null
  onChange: (rruleStr: string | null, summary: string) => void
  startDate?: string
  disabled?: boolean
  className?: string
}

export default function RecurrenceRuleBuilder({
  value,
  onChange,
  startDate,
  disabled = false,
  className,
}: RecurrenceRuleBuilderProps) {
  const [state, setState] = useState<RecurrenceRuleState>(() => parseRrule(value))

  useEffect(() => {
    setState(parseRrule(value))
  }, [value])

  const updateState = (updater: (prev: RecurrenceRuleState) => RecurrenceRuleState) => {
    setState(prev => {
      const next = updater(prev)
      const rruleStr = buildRruleString(next)
      const summary = buildRruleSummary(next)
      onChange(rruleStr, summary)
      return next
    })
  }

  const handleFreqChange = (freq: RecurrenceFrequency) => {
    updateState(prev => {
      let defaultByDay = prev.byDay
      if (freq === 'weekly' && defaultByDay.length === 0) {
        const d = startDate ? new Date(startDate) : new Date()
        defaultByDay = [d.getDay()]
      }
      return { ...prev, freq, byDay: defaultByDay }
    })
  }

  const toggleDay = (dayIndex: number) => {
    updateState(prev => {
      const exists = prev.byDay.includes(dayIndex)
      const nextDays = exists
        ? prev.byDay.filter(d => d !== dayIndex)
        : [...prev.byDay, dayIndex]
      return { ...prev, byDay: nextDays }
    })
  }

  const summary = useMemo(() => buildRruleSummary(state), [state])

  return (
    <div className={cn('space-y-4 rounded-2xl bg-casa-surface p-4 border border-casa-border/80 shadow-2xs', className)}>
      {/* Header / Summary Badge */}
      <div className="flex items-center justify-between pb-2 border-b border-casa-divider">
        <div className="flex items-center gap-2 text-casa-navy font-semibold text-body-sm">
          <Repeat size={16} className="text-casa-gold shrink-0" />
          <span>Repeat Schedule</span>
        </div>
        <span className="text-caption font-medium text-casa-muted bg-casa-bg-2 px-2.5 py-1 rounded-full border border-casa-border/50">
          {summary}
        </span>
      </div>

      {/* Preset Frequencies */}
      <div>
        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
          Frequency
        </label>
        <SegmentedControl
          value={state.freq}
          onChange={val => handleFreqChange(val as RecurrenceFrequency)}
          aria-label="Repeat frequency"
          disabled={disabled}
          options={[
            { value: 'none', label: 'Never' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />
      </div>

      {state.freq !== 'none' && (
        <>
          {/* Day of Week Selector for Weekly */}
          {state.freq === 'weekly' && (
            <div>
              <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                Repeat On Days
              </label>
              <div className="flex gap-1.5 justify-between">
                {DAY_LABELS.map((label, index) => {
                  const isSelected = state.byDay.includes(index)
                  return (
                    <Chip
                      key={index}
                      disabled={disabled}
                      selected={isSelected}
                      onClick={() => toggleDay(index)}
                      tone={isSelected ? 'accent' : 'neutral'}
                      className="flex-1 justify-center py-2.5 text-body-sm font-bold min-h-[44px]"
                      aria-label={`Repeat on ${DAY_NAMES_SHORT[index]}`}
                    >
                      {label}
                    </Chip>
                  )
                })}
              </div>
            </div>
          )}

          {/* Interval Stepper */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-body-sm font-medium text-casa-navy">
              Every
            </span>
            <div className="flex items-center gap-2">
              <IconButton
                icon={<Minus size={16} />}
                aria-label="Decrease repeat interval"
                disabled={disabled || state.interval <= 1}
                onClick={() => updateState(p => ({ ...p, interval: Math.max(1, p.interval - 1) }))}
                variant="secondary"
                size="md"
              />
              <span className="w-12 text-center font-bold text-body-lg text-casa-navy">
                {state.interval}
              </span>
              <IconButton
                icon={<Plus size={16} />}
                aria-label="Increase repeat interval"
                disabled={disabled || state.interval >= 99}
                onClick={() => updateState(p => ({ ...p, interval: p.interval + 1 }))}
                variant="secondary"
                size="md"
              />
              <span className="text-body-sm text-casa-muted font-medium ml-1">
                {state.freq === 'daily' ? 'day(s)' : state.freq === 'weekly' ? 'week(s)' : 'month(s)'}
              </span>
            </div>
          </div>

          {/* End Condition */}
          <div className="pt-2 border-t border-casa-divider space-y-2">
            <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide">
              Ends
            </label>
            <div className="flex gap-2">
              {(['never', 'date', 'count'] as const).map(type => (
                <Chip
                  key={type}
                  selected={state.endType === type}
                  disabled={disabled}
                  onClick={() => updateState(p => ({ ...p, endType: type }))}
                  tone={state.endType === type ? 'accent' : 'neutral'}
                  className="flex-1 justify-center py-2 text-body-sm font-semibold min-h-[44px]"
                >
                  {type === 'never' ? 'Never' : type === 'date' ? 'On Date' : 'After'}
                </Chip>
              ))}
            </div>

            {state.endType === 'date' && (
              <div className="pt-2">
                <Input
                  type="date"
                  value={state.endDate}
                  disabled={disabled}
                  onChange={e => updateState(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full"
                />
              </div>
            )}

            {state.endType === 'count' && (
              <div className="flex items-center gap-3 pt-2">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={state.count}
                  disabled={disabled}
                  onChange={e => updateState(p => ({ ...p, count: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-28 text-center font-bold"
                />
                <span className="text-body-sm text-casa-muted">occurrences</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
