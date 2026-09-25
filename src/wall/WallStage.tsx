import { useEffect, useState, type ReactNode } from 'react'
import { STAGE_HEIGHT, STAGE_WIDTH, computeStageFit } from './stage'

function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export default function WallStage({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState(readViewport)

  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fit = computeStageFit(viewport.width, viewport.height)

  return (
    <div className="fixed inset-0 overflow-hidden bg-wall-ground">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
