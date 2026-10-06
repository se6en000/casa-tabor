import { useEffect } from 'react'
import { useSetting } from '../lib/settingsStore'
import { reloadAsked, WALL_RELOAD_KEY } from './wallReload'

/** When this page was loaded: a refresh asked for after it reloads it. */
const LOADED_AT = Date.now()

export function useWallReload() {
  const { data } = useSetting<string>(WALL_RELOAD_KEY, { refetchInterval: 60_000, staleTime: 30_000 })
  useEffect(() => {
    if (reloadAsked(data, LOADED_AT)) window.location.reload()
  }, [data])
}
