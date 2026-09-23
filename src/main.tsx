import { StrictMode } from 'react'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {visualRegressionMode
        ? (
            <ThemeProvider>
              <VisualRegressionPage />
            </ThemeProvider>
          )
        : <App />}
    </MotionConfig>
  </StrictMode>,
)