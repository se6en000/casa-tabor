import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileSession } from '../contexts/useProfileSession'

// Settings › Send to Tabor House (Jake, Oct 9): this person's key for the iPhone Shortcut. Made by the share-in function
// for whoever is signed in on this phone; shown once (only its fingerprint is kept), a new one stops the old.

export const SHARE_URL = 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/share-in'

export interface ShareKeyProps {
  /** The key in use: when it was made and last used (null: none yet; undefined: still looking). */
  status: { created_at: string; last_used_at: string | null } | null | undefined
  /** Makes a new key (the old one stops working) and gives it back, once. */
  make: () => Promise<string>
}

export function useShareKey(): ShareKeyProps {
  const { profile } = useProfileSession()
  const [status, setStatus] = useState<ShareKeyProps['status']>(undefined)
  const call = useCallback(async (action: 'key' | 'key_status') => {
    if (!profile?.token) throw new Error('Sign in on this phone first.')
    const { data, error } = await supabase.functions.invoke('share-in', { body: { action }, headers: { 'x-casa-history-session': profile.token } })
    if (error) throw new Error('That didn’t work. Try again.')
    return data as { key?: string | { created_at: string; last_used_at: string | null } | null }
  }, [profile?.token])
  useEffect(() => {
    let live = true
    call('key_status').then((d) => { if (live) setStatus((d.key as ShareKeyProps['status']) ?? null) }).catch(() => { if (live) setStatus(null) })
    return () => { live = false }
  }, [call])
  const make = useCallback(async () => {
    const d = await call('key')
    if (typeof d.key !== 'string') throw new Error('That didn’t work. Try again.')
    setStatus({ created_at: new Date().toISOString(), last_used_at: null })
    return d.key
  }, [call])
  return { status, make }
}
