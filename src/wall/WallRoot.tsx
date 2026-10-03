import { useAppUpdater } from '../hooks/useAppUpdater'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import WallFrame from './WallFrame'
import WallStage from './WallStage'
import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'

const WallGroceriesPage = lazy(() => import('./WallGroceriesPage'))

/** Entry for /wall: the Family Wall, outside the old app shell. */
export default function WallRoot() {
  // Pick up new deploys automatically on the kiosk.
  useAppUpdater()
  // Keep the existing display-sleep behavior; the old art screensaver isn't part of the Wall.
  const { settings } = useScreensaverSettings()
  useIdleTimer(Infinity, settings.displaySleepEnabled ? settings.displayOffMins * 60_000 : Infinity)

  const { pathname } = useLocation()
  return (
    <WallStage>
      {/* The Grocery page, v2 (canvas 35a): the menu's "Grocery list" on the Wall. */}
      {pathname === '/wall/grocery'
        ? <Suspense fallback={null}><WallGroceriesPage /></Suspense>
        : <WallFrame />}
    </WallStage>
  )
}
