export interface CasaTip { id: string; topic: string; text: string; about: RegExp | null; uses: RegExp | null }
export const CASA_TIPS: CasaTip[]
export function tipsByTopic(): Array<{ topic: string; tips: CasaTip[] }>
export function noteTipUsage(usage: Record<string, number> | null | undefined, said: string): Record<string, number>
export function pickTip(input: { question?: string | null; usage?: Record<string, number>; seed?: number }): CasaTip
