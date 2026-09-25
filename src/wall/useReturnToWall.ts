import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RETURN_TO_WALL_MS, readWallHomeFlag } from './kioskHome'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** On the wall kiosk, any other page goes back to the Wall after a few minutes with no touch. */
export function useReturnToWall(): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    if (readWallHomeFlag() !== '1' || pathname.startsWith('/wall')) return
    const goBack = () => navigate('/wall')
    let timer = window.setTimeout(goBack, RETURN_TO_WALL_MS)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(goBack, RETURN_TO_WALL_MS)
    }
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset))
    }
  }, [pathname, navigate])
}
