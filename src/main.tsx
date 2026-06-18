import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initPointerGestures } from './lib/pointerGestures'

initPointerGestures()

const isMacDesktop =
  typeof navigator !== 'undefined' &&
  /Mac/.test(navigator.platform) &&
  navigator.maxTouchPoints === 0

if (isMacDesktop) {
  document.documentElement.classList.add('mac-desktop')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)