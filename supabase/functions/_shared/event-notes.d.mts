export interface EmailSource { from?: string | null; receivedAt?: string | null; gmailId?: string | null }
export function notesOf(description: string | null | undefined): string
export function notesSource(description: string | null | undefined): { text: string; url: string | null } | null
export function withNotes(description: string | null | undefined, notes: string): string | null
export function addNotes(description: string | null | undefined, lines: string[]): string | null
export function sourceTag(source: EmailSource): string
export function notesFromEmail(lines: string[] | null | undefined, source: EmailSource | null | undefined): string | null
