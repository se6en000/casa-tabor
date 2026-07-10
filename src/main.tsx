import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initPointerGestures } from './lib/pointerGestures'
import { initDensityProfile } from './lib/densityProfile.mjs'

initPointerGestures()
initDensityProfile()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)