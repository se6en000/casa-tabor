// A yes sent twice for the same card (a double tap, a retry) gets the first answer back instead of saving twice. Only
// an answer that went through is kept like that (Jake's bug reports, Oct 6: "I need the override ability when I say yes
// or hit the button" — a clash refused the first yes, and every later yes, "add it anyway" included, was handed that
// same refusal again, so the card came back forever). A failed or refused try is tried again.
export function replayableResult(row) {
  if (!row || row.status === 'failed') return null
  return row.result_payload ?? null
}
