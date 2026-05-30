import { useState, useRef, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import AIChatDrawer from './AIChatDrawer'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'

interface Props {
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
}

export default function AIAssistantFab({ page, events, family, homeCity }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handler = () => setOpen(true)
    document.addEventListener('open-ai-chat', handler)
    return () => document.removeEventListener('open-ai-chat', handler)
  }, [])

  function getAnchor() {
    if (!btnRef.current) return undefined
    const r = btnRef.current.getBoundingClientRect()
    return { right: window.innerWidth - r.left, bottom: window.innerHeight - r.top }
  }

  return (
    <>
      <motion.button
        ref={btnRef}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-[60] w-14 h-14 rounded-full bg-casa-gold text-white shadow-modal flex items-center justify-center hover:brightness-110 transition-all"
        title="Ask AI"
      >
        <Sparkles size={22} />
      </motion.button>

      <AIChatDrawer
        open={open}
        onClose={() => setOpen(false)}
        anchor={getAnchor()}
        page={page}
        events={events}
        family={family}
        homeCity={homeCity}
      />
    </>
  )
}
