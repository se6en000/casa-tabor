export const ASSISTANT_EXPERIENCE_MODES = ['do', 'talk_plan']

export function normalizeAssistantExperienceMode(value) {
  return value === 'talk_plan' ? 'talk_plan' : 'do'
}
