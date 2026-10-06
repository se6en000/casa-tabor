import { useState, type ReactNode } from 'react'
import { useType } from './sizing'

/** "Saved" or what went wrong, quietly under what changed; gone after a few seconds. */
export function useSaveNote(): [ReactNode, (result: { ok: boolean; message?: string }, saved?: string) => void] {
  const t = useType()
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  const show = (result: { ok: boolean; message?: string }, saved = 'Saved') => {
    setNote({ text: result.ok ? saved : result.message ?? 'That didn’t save.', bad: !result.ok })
    window.setTimeout(() => setNote(null), result.ok ? 2200 : 5000)
  }
  return [note ? <p role="status" className={`m-0 mt-[8px] px-[4px] ${t.detail} ${note.bad ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{note.text}</p> : null, show]
}
