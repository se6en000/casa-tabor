import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * Wraps a page in a subtle fade + lift transition. AnimatePresence in App.tsx
 * handles the exit phase via key={location.pathname}.
 * Always h-full so pages control their own overflow/scrolling.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col overflow-hidden"
    >
      {children}
    </motion.div>
  )
}
