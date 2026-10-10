export const DOSSIER_FIELDS: string
export interface DossierFact { text: string; url: string | null; as_of: string | null }
export interface GoogleFacts {
  name: string | null; type: string | null; address: string | null; location: { lat: number; lng: number } | null
  phone: string | null; website: string | null; maps_url: string | null; rating: number | null; rating_count: number | null
  price: string | null; hours: string[] | null; summary: string | null; overview: string | null
  serves: string[]; has: string[]; parking: string | null
  reviews: Array<{ stars: number | null; when: string | null; at: string | null; text: string; by: string | null; by_url: string | null }>
  photos: Array<{ name: string; w: number | null; h: number | null; by: string | null; uri?: string | null }>
}
export interface WebDossier {
  dress: DossierFact | null; setting: DossierFact | null; crowd: DossierFact | null; busy: DossierFact | null; best_time: DossierFact | null
  deals: Array<DossierFact & { when: string | null }>; reservations: DossierFact | null; parking: DossierFact | null; noise: DossierFact | null
  order: { items: string[]; url: string | null } | null; spend: DossierFact | null; heads_up: Array<DossierFact & { when: string | null }>; news: DossierFact | null
}
export function googleFacts(p: Record<string, any> | null): GoogleFacts | null
export function dossierPrompt(place: { name: string; address?: string | null }, opts: { today: string }): string
export function parseDossier(text: unknown, pages?: string[]): WebDossier | null
export function sourceWord(f: { url: string | null; as_of: string | null } | null): string | null
export function hoursLine(descriptions: string[] | null | undefined): string | null
export function todayHours(descriptions: string[] | null | undefined, ymd: string | null | undefined): { open: boolean; text: string } | null
export function reviewExcerpt(text: string | null | undefined, n?: number): string
export interface ForYouLine { mark: 'yes' | 'maybe' | 'no' | 'note'; head: string; line: string; from: string | null }
export function forYouPrompt(input: { place: { name: string }; google: GoogleFacts | null; web: WebDossier | null; interests?: Array<{ name: string; who: string; level: string }>; driveMin?: number | null }): string
export function parseForYou(text: unknown): { for_you: ForYouLine[]; best_time: string | null }
/** What the sheet reads (scout `dossier`): kept 30 days; the map fresh each time. */
export interface PlaceDossier { google: GoogleFacts | null; web: WebDossier | null; for_you: ForYouLine[]; best_time: string | null; read_at: string; map?: string | null }
