import rrulePackage from 'npm:rrule@2.8.1'
import { formatInTimeZone, fromZonedTime } from 'npm:date-fns-tz@3.2.0'
import { createRecurrenceEngine } from './recurrence-engine-core.mjs'

const { rrulestr } = rrulePackage

export const recurrenceEngine = createRecurrenceEngine({
  rrulestr,
  formatInTimeZone,
  fromZonedTime,
})
