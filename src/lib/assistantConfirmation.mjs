const CONFIRM = /^(?:yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)[.!]?$/i
const CANCEL = /^(?:no|nope|cancel|don't|do not|stop|abort|never mind|nevermind)[.!]?$/i

export function classifyPendingConfirmation(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (CONFIRM.test(text)) return 'confirm'
  if (CANCEL.test(text)) return 'cancel'
  return null
}
