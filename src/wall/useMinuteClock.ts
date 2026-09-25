import { useEffect, useState } from 'react'
import { msUntilNextMinute } from './clock'

/** Current time, re-rendering exactly on each minute boundary (and on wake). */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msUntilNextMinute(new Date()) + 50)
    }
    const resync = () => {
      clearTimeout(timer)
      setNow(new Date())
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [])

  return now
}
