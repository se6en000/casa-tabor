import { useEffect, useState } from 'react'

// A real household member glancing at the kiosk needs to be able to tell "the
// network dropped" from "the app is just being slow" -- previously nothing
// surfaced this at all (App.tsx had an 'online' listener, but only used it to
// trigger a version-check side effect). Small and dedicated so it's reusable
// anywhere a component wants to react to connectivity, not just the banner.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
