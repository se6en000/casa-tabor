export type VoiceAuditEvent = {
  at: string
  sessionId: string
  turnId: string
  event: string
  detail?: string
}

export const VOICE_AUDIT_LOG_KEY = 'casa-voice-audit-log'
const MAX_AUDIT_ENTRIES = 1200

export function appendVoiceAudit(entry: VoiceAuditEvent): VoiceAuditEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(VOICE_AUDIT_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) as VoiceAuditEvent[] : []
    const next = [...(Array.isArray(parsed) ? parsed : []), entry].slice(-MAX_AUDIT_ENTRIES)
    localStorage.setItem(VOICE_AUDIT_LOG_KEY, JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

export function readVoiceAudit(): VoiceAuditEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(VOICE_AUDIT_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) as VoiceAuditEvent[] : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function clearVoiceAudit(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(VOICE_AUDIT_LOG_KEY)
}
