// Pure STT helper extracted so it can be unit-tested under `node --test`
// (the useSpeechInput hook itself relies on browser APIs — WebSocket,
// SpeechRecognition — that aren't available in the plain-node test runner).

/**
 * Normalize a raw confidence score from any STT source into a 0..1 range.
 * - Non-finite / non-number → null (unknown confidence)
 * - Values in (1, 100] are treated as percentages and divided by 100
 * - All results are clamped to [0, 1]
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeConfidence(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw > 1 && raw <= 100) return Math.max(0, Math.min(1, raw / 100))
  return Math.max(0, Math.min(1, raw))
}
