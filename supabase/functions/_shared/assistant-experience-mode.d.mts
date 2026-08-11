export type AssistantExperienceMode = 'do' | 'talk_plan'

export const ASSISTANT_EXPERIENCE_MODES: readonly AssistantExperienceMode[]

export function normalizeAssistantExperienceMode(value: unknown): AssistantExperienceMode
