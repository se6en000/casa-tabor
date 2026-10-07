/**
 * What makes a trace the same trace: the session, turn, event and detail — and the payload. Without the payload, every
 * follow-up sentence in one conversation (same session, same event, a different utterance_id in the payload) looked
 * like a repeat of the first and was dropped; Oct 7 a 2–3 s pause before a follow-up couldn't be traced for it.
 */
export function traceIdentity(entry: { channel: string; sessionId?: string; turnId?: string; seq?: number; event: string; detail?: string; payload?: unknown }): string {
  let payload = ''
  try { payload = entry.payload == null ? '' : JSON.stringify(entry.payload) } catch { payload = String(entry.payload) }
  return [
    entry.channel,
    entry.sessionId ?? '',
    entry.turnId ?? '',
    String(entry.seq ?? ''),
    entry.event,
    entry.detail ?? '',
    payload.slice(0, 400),
  ].join('|')
}

