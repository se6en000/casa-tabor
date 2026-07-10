import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  onClick: () => void
}

export default function AddEventFab({ onClick }: Props) {
  return (
    <motion.button
      initial={{ y: 0 }}
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      whileTap={{ scale: 0.92, y: 0 }}
      onClick={onClick}
      className="fixed right-5 bottom-[calc(var(--spacing-nav-height)+1rem+var(--vk-height,0px)+var(--vk-gap,0px))] lg:bottom-[calc(1.5rem+var(--vk-height,0px)+var(--vk-gap,0px))] z-[60] w-14 h-14 rounded-full bg-casa-gold text-casa-navy font-semibold border border-casa-gold/50 shadow-[0_10px_28px_-4px_rgba(27,42,74,0.45),0_4px_10px_-2px_rgba(27,42,74,0.30),0_1px_0_rgba(255,255,255,0.25)_inset] flex items-center justify-center hover:brightness-110 hover:shadow-[0_16px_36px_-4px_rgba(27,42,74,0.5),0_6px_14px_-2px_rgba(27,42,74,0.35),0_1px_0_rgba(255,255,255,0.3)_inset] transition-all"
      title="Add event"
      aria-label="Add event"
    >
      <Plus size={24} />
    </motion.button>
  )
}
