import { supabase } from '../lib/supabase.ts'
import type { FamilyMember } from '../types'
import { parseDatePortionAsLocal } from './eventTime.ts'
import { normalizeAllDayEventRange } from './allDayEventRange.ts'
import { format } from 'date-fns'

export interface ScannedItem {
  id: string
  type: 'event' | 'reminder'
  title: string
  date: string // YYYY-MM-DD
  start_time_local: string | null // HH:MM
  end_time_local: string | null // HH:MM
  start_time: string // ISO string
  end_time: string // ISO string
  all_day: boolean
  location_name: string | null
  address: string | null
  notes: string | null
  raw_text_snippet?: string | null
  selectedMemberIds: string[]
  confidence: number
  selected: boolean
}

export interface ScanDocumentResponse {
  success: boolean
  document_summary?: string
  items?: Array<{
    id?: string
    type: 'event' | 'reminder'
    title: string
    date?: string
    start_time_local?: string | null
    end_time_local?: string | null
    start_time: string
    end_time: string
    all_day: boolean
    location_name?: string | null
    address?: string | null
    notes?: string | null
    raw_text_snippet?: string | null
    suggested_member_name?: string | null
    confidence: number
  }>
  error?: string
}

/**
 * Format a YYYY-MM-DD date string safely in local time without UTC offset drift.
 */
export function formatScannedDate(dateStr: string, formatPattern = 'EEEE, MMM d'): string {
  if (!dateStr) return ''
  try {
    const localDate = parseDatePortionAsLocal(dateStr)
    if (Number.isNaN(localDate.getTime())) return dateStr
    return format(localDate, formatPattern)
  } catch {
    return dateStr
  }
}

/**
 * Format 24-hour HH:MM time string to human-friendly 12-hour (e.g. "14:30" -> "2:30 PM")
 */
export function formatScannedTime(timeStr?: string | null): string {
  if (!timeStr) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  if (!m) return timeStr
  let hour = Number(m[1])
  const minute = m[2]
  const isPm = hour >= 12
  if (hour > 12) hour -= 12
  if (hour === 0) hour = 12
  return `${hour}:${minute} ${isPm ? 'PM' : 'AM'}`
}

/**
 * Optimizes an image File for AI vision processing by resizing large dimensions to <= 1920px.
 * Converts to JPEG Base64 string for fast transfer.
 */
export async function optimizeFileForVision(file: File): Promise<{ base64: string; mimeType: string }> {
  // If it's a PDF, pass directly as base64
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return {
      base64: btoa(binary),
      mimeType: 'application/pdf',
    }
  }

  // Image processing: scale to max 1920 width/height to avoid sending huge 10MB phone captures
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.onload = () => {
        const MAX_DIM = 1920
        let width = img.width
        let height = img.height

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width)
            width = MAX_DIM
          } else {
            width = Math.round((width * MAX_DIM) / height)
            height = MAX_DIM
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // Fallback to raw base64 if canvas unavailable
          const rawBase64 = (e.target?.result as string).split(',')[1] || ''
          resolve({ base64: rawBase64, mimeType: file.type || 'image/jpeg' })
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        const base64 = dataUrl.split(',')[1] || ''
        resolve({ base64, mimeType: 'image/jpeg' })
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Match a suggested member name string (from AI vision) to the existing family members in Casa.
 */
export function matchSuggestedMemberIds(
  suggestedName: string | null | undefined,
  familyMembers: FamilyMember[],
): string[] {
  if (!suggestedName || !familyMembers.length) return []
  const clean = suggestedName.trim().toLowerCase()
  const matched = familyMembers.find((m) => {
    const name = m.name.toLowerCase()
    const fullName = (m.full_name || '').toLowerCase()
    return clean.includes(name) || name.includes(clean) || (fullName && clean.includes(fullName))
  })
  return matched ? [matched.id] : []
}

/**
 * Batch insert created items into Supabase events and event_members tables.
 */
export async function batchSaveScannedItems(
  items: ScannedItem[],
): Promise<{ successCount: number; errors: string[] }> {
  const selectedItems = items.filter((item) => item.selected && item.title.trim().length > 0)
  if (selectedItems.length === 0) {
    return { successCount: 0, errors: ['No items selected'] }
  }

  let successCount = 0
  const errors: string[] = []

  for (const item of selectedItems) {
    try {
      const nowIso = new Date().toISOString()
      let startIso = item.start_time
      let endIso = item.end_time

      // Ensure proper all-day range or timed range based on the edited date and times
      if (item.all_day) {
        const range = normalizeAllDayEventRange(item.date, item.date)
        startIso = range.start
        endIso = range.end
      } else if (item.start_time_local) {
        const localStartDate = new Date(`${item.date}T${item.start_time_local}:00`)
        const localEndDate = new Date(`${item.date}T${item.end_time_local || item.start_time_local}:00`)
        if (!Number.isNaN(localStartDate.getTime())) {
          startIso = localStartDate.toISOString()
          endIso = !Number.isNaN(localEndDate.getTime()) ? localEndDate.toISOString() : localStartDate.toISOString()
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from('events')
        .insert({
          title: item.title.trim(),
          description: item.notes?.trim() || null,
          start_time: startIso,
          end_time: endIso,
          all_day: item.all_day,
          status: 'confirmed',
          event_type: item.type,
          location_name: item.location_name?.trim() || null,
          address: item.address?.trim() || null,
          record_kind: 'single',
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('id')
        .single()

      if (insertError) {
        errors.push(`Could not create "${item.title}": ${insertError.message}`)
        continue
      }

      // Insert assigned family members
      if (inserted?.id && item.selectedMemberIds.length > 0) {
        const memberPayload = item.selectedMemberIds.map((memberId, idx) => ({
          event_id: inserted.id,
          family_member_id: memberId,
          role: idx === 0 ? 'primary' : 'attendee',
          rsvp_status: 'accepted',
        }))

        await supabase.from('event_members').insert(memberPayload)
      }

      // Async weather enrichment & Google sync
      if (inserted?.id && item.type === 'event') {
        void supabase.functions
          .invoke('fetch-event-weather', { body: { event_id: inserted.id } })
          .catch(() => {})
        void supabase.functions
          .invoke('create-google-event', { body: { event_id: inserted.id } })
          .catch(() => {})
      }

      successCount++
    } catch (err) {
      errors.push(`Error saving "${item.title}": ${(err as Error).message}`)
    }
  }

  return { successCount, errors }
}
