import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { initPointerGestures } from './lib/pointerGestures'
import { initDensityProfile } from './lib/densityProfile.mjs'
import { initDisablePinchZoom } from './lib/disablePinchZoom'
import { initTouchDeviceFlag } from './lib/touchDeviceFlag'
import { initGlobalErrorReporting } from './lib/clientErrorReporter'
import VisualRegressionPage from './pages/VisualRegressionPage'

initPointerGestures()
initDensityProfile()
initDisablePinchZoom()
initTouchDeviceFlag()
initGlobalErrorReporting()

const visualRegressionMode = import.meta.env.VITE_VISUAL_TEST_MODE === 'true'
  && window.location.pathname === '/__visual-regression'
const wallFixtureMode = import.meta.env.VITE_VISUAL_TEST_MODE === 'true'
  && window.location.pathname === '/__wall-fixture'
const phoneFixtureMode = import.meta.env.VITE_VISUAL_TEST_MODE === 'true'
  && window.location.pathname === '/__phone-fixture'
const settingsFixtureMode = import.meta.env.VITE_VISUAL_TEST_MODE === 'true'
  && window.location.pathname === '/__settings-fixture'
const recipesFixtureMode = import.meta.env.VITE_VISUAL_TEST_MODE === 'true'
  && window.location.pathname === '/__recipes-fixture'
// Constant-folded away in production builds, so the fixture pages never ship.
const WallFixturePage = import.meta.env.VITE_VISUAL_TEST_MODE === 'true' ? lazy(() => import('./wall/WallFixturePage')) : () => null
const PhoneFixturePage = import.meta.env.VITE_VISUAL_TEST_MODE === 'true' ? lazy(() => import('./phone/PhoneFixturePage')) : () => null
const SettingsFixturePage = import.meta.env.VITE_VISUAL_TEST_MODE === 'true' ? lazy(() => import('./settings/SettingsFixturePage')) : () => null
const RecipesFixturePage = import.meta.env.VITE_VISUAL_TEST_MODE === 'true' ? lazy(() => import('./recipes/RecipesFixturePage')) : () => null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {wallFixtureMode
        ? <Suspense fallback={null}><WallFixturePage /></Suspense>
        : phoneFixtureMode
        ? <Suspense fallback={null}><PhoneFixturePage /></Suspense>
        : settingsFixtureMode
        ? <Suspense fallback={null}><SettingsFixturePage /></Suspense>
        : recipesFixtureMode
        ? <Suspense fallback={null}><RecipesFixturePage /></Suspense>
        : visualRegressionMode
        ? (
            <ThemeProvider>
              <VisualRegressionPage />
            </ThemeProvider>
          )
        : <App />}
    </MotionConfig>
  </StrictMode>,
)