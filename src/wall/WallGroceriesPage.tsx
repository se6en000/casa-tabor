import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSyncHealth } from '../hooks/useSyncHealth'
import { usePhoneGroceries } from '../phone/usePhoneGroceries'
import { RETURN_TO_WALL_MS, readWallHomeFlag } from './kioskHome'
import WallGroceries from './WallGroceries'

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** /wall/grocery: the Grocery page on the live list (the phone's, with Reminders sync); back to the Wall when left idle. */
export default function WallGroceriesPage() {
  const data = usePhoneGroceries()
  const { isStale } = useSyncHealth()
  const navigate = useNavigate()
  useEffect(() => {
    if (readWallHomeFlag() !== '1') return
    const goBack = () => navigate('/wall')
    let timer = window.setTimeout(goBack, RETURN_TO_WALL_MS)
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(goBack, RETURN_TO_WALL_MS) }
    ACTIVITY.forEach((name) => window.addEventListener(name, reset, { passive: true }))
    return () => { window.clearTimeout(timer); ACTIVITY.forEach((name) => window.removeEventListener(name, reset)) }
  }, [navigate])
  return <WallGroceries data={data} syncStale={isStale} />
}
