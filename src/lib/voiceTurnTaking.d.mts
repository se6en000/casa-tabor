export function isIncompleteVoiceFragment(value: unknown): boolean
export function isLikelyUnusableVoiceTranscript(value: unknown, confidence: unknown): boolean
export function voiceFinalIntent(value: string, options?: { hasPending?: boolean }): 'confirm' | 'cancel' | 'dismiss' | 'send'
