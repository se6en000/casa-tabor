import { useEffect, useState } from 'react'

export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'hidden'
  })

  useEffect(() => {
    const update = () => setIsVisible(document.visibilityState !== 'hidden')

    update()
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)

    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])

  return isVisible
}
