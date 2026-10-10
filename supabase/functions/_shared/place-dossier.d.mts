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
