export type VoiceDebugLevel = 'off' | 'minimal' | 'verbose'

export type VoiceRuntimeConfig = {
  coreV2Enabled: boolean
  debugLevel: VoiceDebugLevel
  auditEnabled: boolean
}

const STORAGE_KEY = 'casa-voice-runtime-config-v1'

const DEFAULT_CONFIG: VoiceRuntimeConfig = {
  coreV2Enabled: true,
  debugLevel: 'minimal',
  auditEnabled: true,
}

function normalizeDebugLevel(value: unknown): VoiceDebugLevel {
  if (value === 'off' || value === 'minimal' || value === 'verbose') return value
  return DEFAULT_CONFIG.debugLevel
}

export function readVoiceRuntimeConfig(): VoiceRuntimeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<VoiceRuntimeConfig>
    return {
      coreV2Enabled: parsed.coreV2Enabled ?? DEFAULT_CONFIG.coreV2Enabled,
      debugLevel: normalizeDebugLevel(parsed.debugLevel),
      auditEnabled: parsed.auditEnabled ?? DEFAULT_CONFIG.auditEnabled,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function writeVoiceRuntimeConfig(next: Partial<VoiceRuntimeConfig>): VoiceRuntimeConfig {
  const merged = { ...readVoiceRuntimeConfig(), ...next, debugLevel: normalizeDebugLevel(next.debugLevel) }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  }
  return merged
}

export function shouldEmitVoiceDebug(level: VoiceDebugLevel, minLevel: VoiceDebugLevel = 'minimal'): boolean {
  const rank: Record<VoiceDebugLevel, number> = { off: 0, minimal: 1, verbose: 2 }
  return rank[level] >= rank[minLevel]
}

export const VOICE_RUNTIME_CONFIG_KEY = STORAGE_KEY
