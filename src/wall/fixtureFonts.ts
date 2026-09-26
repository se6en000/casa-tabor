import { useEffect, useState } from 'react'

// Visual-test only: every face and weight the Wall and the phone draw with, loaded up
// front. Weights load lazily on first use, so document.fonts.ready could resolve before
// a bold or an italic was even asked for, and a screenshot caught the fallback font
// (random 500-pixel diffs on "MAISON TABOR", a title, a count).
const FACES = [
  '400 16px "DM Sans"', '500 16px "DM Sans"', '600 16px "DM Sans"', '700 16px "DM Sans"',
  '500 16px "Cormorant Garamond"', '600 16px "Cormorant Garamond"', '700 16px "Cormorant Garamond"',
  'italic 500 16px "Cormorant Garamond"', 'italic 600 16px "Cormorant Garamond"',
]

export function useFixtureFonts(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => []))).then(() => document.fonts.ready).then(() => {
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [])
  return ready
}
