export interface HouseNote { id: string; text: string; source: string; pinned: boolean; added: string }
export type PersonaLevel = 'quiet' | 'some' | 'playful'
export interface Persona { core: string; level: PersonaLevel; notes: HouseNote[]; updatedAt: string | null }
export const PERSONA_KEY: string
export const DEFAULT_CORE: string
export const LEVELS: Record<PersonaLevel, string>
export function cleanPersona(value: unknown): Persona
export function personaSection(persona: unknown): string
export function personaForBrief(persona: unknown): string
export function reflectPrompt(input: { persona: unknown; conversations: Array<{ role: string; content: string }>; family: string[] }): string
export function applyReflection(persona: unknown, text: string, today: string, newId?: () => string): Persona | null
