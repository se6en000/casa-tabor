import { useState } from 'react'
import { DEFAULT_TASTE, ratingsToAsk, type GuideTaste, type OutingRating } from '../../supabase/functions/_shared/guide.mjs'
import type { HowWasItData } from './useHowWasIt'
import type { GuideTasteProps } from './useGuideTaste'

// `?rate=1` on the wall and phone fixtures (canvas 85C–D): the night before at Mr B's — Oct 3's real one, football with
// the Springmyers — asked of Jake and of Kelly. Answers land in window.__rated.

export function useFixtureHowWasIt(now: Date, memberId: string | null = null): HowWasItData | null {
  const on = new URLSearchParams(window.location.search).get('rate') === '1'
  const [rows, setRows] = useState<OutingRating[]>(() => {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 18, 0).toISOString()
    const row = (member_id: string): OutingRating => ({ id: `rate-${member_id}`, event_id: 'mr-bs', member_id, title: 'Watching college football with the Springmyers', place: 'Mr B’s', address: '5201 Georgia Ave, West Palm Beach, FL 33405', visited_at: at, status: 'ask', ask_after: at })
    return [row('jake-id'), row('kelly')]
  })
  if (!on) return null
  const record = (line: string) => { ((window as unknown as { __rated?: string[] }).__rated ??= []).push(line) }
  return {
    open: ratingsToAsk(rows, now, memberId),
    answer: async (row, a) => { record(`${row.member_id}:${a.stars}:${a.go_back ?? ''}:${a.stood_out.join('+')}${a.note ? `:${a.note}` : ''}`); setRows((list) => list.filter((r) => r.id !== row.id)) },
    didntGo: async (row) => { record(`${row.event_id}:didnt_go`); setRows((list) => list.filter((r) => r.event_id !== row.event_id)) },
    later: async (row) => { record(`${row.member_id}:later`); setRows((list) => list.filter((r) => r.id !== row.id)) },
  }
}

/** Settings › Your taste on the phone fixture: Jake's Oct 9 answers, changes kept in memory (window.__taste). */
export function useFixtureTaste(): GuideTasteProps {
  const [taste, setTaste] = useState<GuideTaste>(DEFAULT_TASTE)
  return { taste, save: async (next) => { setTaste(next); (window as unknown as { __taste?: GuideTaste }).__taste = next } }
}

/** Settings › Send to Tabor House on the phone fixture: no key yet; Make my key gives a made-up one. */
export function useFixtureShareKey() {
  const [status, setStatus] = useState<{ created_at: string; last_used_at: string | null } | null>(null)
  return { status, make: async () => { setStatus({ created_at: new Date().toISOString(), last_used_at: null }); return 'tabor_share_fixture0000000000000000000000000000' } }
}
