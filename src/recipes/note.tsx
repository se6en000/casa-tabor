import { useEffect, useState, type ReactNode } from 'react'
import { useT } from './layout'

/** "Saved", or what went wrong, for a few seconds. */
export function useNote(): [ReactNode, (text: string, bad?: boolean) => void] {
  const t = useT()
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), note.bad ? 6000 : 2600)
    return () => window.clearTimeout(timer)
  }, [note])
  return [note ? <p role="status" className={`m-0 ${t.detail} ${note.bad ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{note.text}</p> : null, (text, bad = false) => setNote({ text, bad })]
}
