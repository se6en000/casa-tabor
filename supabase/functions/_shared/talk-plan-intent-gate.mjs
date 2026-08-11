const WRITE_ACTION = /\b(add|create|save|schedule|book|move|reschedule|change|update|edit|delete|remove|cancel|complete|check off|mark done)\b/i

function actionKindFor(text) {
  const input = String(text ?? '')
  if (/\b(reminder|remind me)\b/i.test(input)) return 'reminder'
  if (/\b(event|appointment|appt|apt|calendar)\b/i.test(input)) return 'event'
  if (/\b(grocery|groceries|shopping list)\b/i.test(input)) return 'grocery action'
  if (/\b(recipe|recipe library)\b/i.test(input)) return 'recipe'
  if (/\b(task|to-?do|action item)\b/i.test(input)) return 'task'
  return null
}

export function resolveTalkPlanIntentGate(text, resolution) {
  const actionKind = WRITE_ACTION.test(String(text ?? '')) ? actionKindFor(text) : null
  if (!actionKind) return { decision: 'answer_conversationally', actionKind: null }
  if (resolution === 'confirmed_action') return { decision: 'run_action', actionKind }
  if (resolution === 'conversation_only') return { decision: 'answer_conversationally', actionKind }
  return { decision: 'confirm_intent', actionKind }
}
