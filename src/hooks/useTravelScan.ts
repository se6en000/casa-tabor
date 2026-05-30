/**
 * useTravelScan — triggers scan-travel-emails once per day on app load.
 * Tracks last scan time in localStorage to avoid hammering the function.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'casa_travel_scan_date'

export function useTravelScan() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const lastScan = localStorage.getItem(STORAGE_KEY)
    if (lastScan === today) return

    // Set BEFORE invoking — prevents re-firing on error/timeout
    localStorage.setItem(STORAGE_KEY, today)

    // Fire and forget — runs in background
    supabase.functions
      .invoke('scan-travel-emails', { body: {} })
      .catch(() => { /* non-fatal */ })
  }, [])
}
