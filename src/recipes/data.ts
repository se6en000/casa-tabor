import { createContext, useContext } from 'react'

// Recipes V2's data, behind one interface: the live app reads and writes Supabase (liveSource.ts); the screen tests
// use fixed recipes (RecipesFixturePage.tsx).

export interface Recipe {
  id: string
  name: string
  cook_time: string | null
  servings: string | null
  source_type: string
  source_url: string | null
  image_url: string | null
  last_used_at: string | null
  favorite: boolean
  cooked_count: number
  /** The ingredient lines as written ("10 oz | 20 oz Shrimp"). */
  ingredients: string[]
  steps: string[]
  /** Every photo, the cover first. */
  images: string[]
}

export interface CookTimer {
  id: string
  label: string
  /** Running: when it rings. Paused: null, with `left` seconds. */
  ends_at: string | null
  left: number
  /** The step it came from (0-based). */
  step: number
}

/** Your place in a recipe, kept for every device. */
export interface CookPlace {
  recipe_id: string
  step: number
  servings_index: number
  /** Ingredient lines ticked (their index). */
  ticked: number[]
  timers: CookTimer[]
  device: string | null
  updated_at: string
}

/** A recipe being written: a new one, an import to check, or an edit. */
export interface RecipeDraft {
  id?: string
  name: string
  cook_time: string
  servings: string
  source_type: string
  source_url: string | null
  image_url: string | null
  /** Photos to choose the cover from. */
  image_urls: string[]
  ingredients: string[]
  steps: string[]
}

export type SaveResult = { ok: boolean; message?: string }
export type ImportKind = 'photos' | 'pdf' | 'link'

export interface RecipesSource {
  now: () => Date
  onWall: boolean
  /** "Jake’s phone", "the wall": where this device cooks from (shown on the others). */
  deviceName: string
  useRecipes: () => Recipe[] | null
  /** What's being cooked right now, anywhere. */
  useCooking: () => CookPlace[]
  setFavorite: (id: string, on: boolean) => Promise<SaveResult>
  save: (draft: RecipeDraft, photo?: File | null) => Promise<SaveResult & { id?: string }>
  remove: (id: string) => Promise<SaveResult>
  /** Read a recipe from photos, a PDF or a link; you check it before it's saved. */
  importRecipe: (input: { kind: ImportKind; files?: File[]; url?: string }) => Promise<SaveResult & { draft?: RecipeDraft }>
  searchPhotos: (query: string) => Promise<string[]>
  addToGroceries: (lines: string[]) => Promise<SaveResult>
  saveCooking: (place: Omit<CookPlace, 'updated_at' | 'device'>) => Promise<void>
  finishCooking: (recipeId: string) => Promise<SaveResult>
  /** Start over: your place let go without counting it as made. */
  dropCooking: (recipeId: string) => Promise<void>
}

export const RecipesContext = createContext<RecipesSource | null>(null)

export function useRecipesSource(): RecipesSource {
  const src = useContext(RecipesContext)
  if (!src) throw new Error('Recipes need a source')
  return src
}

export const emptyDraft = (): RecipeDraft => ({ name: '', cook_time: '', servings: '', source_type: 'manual', source_url: null, image_url: null, image_urls: [], ingredients: [], steps: [] })

export const draftOf = (r: Recipe): RecipeDraft => ({
  id: r.id, name: r.name, cook_time: r.cook_time ?? '', servings: r.servings ?? '', source_type: r.source_type, source_url: r.source_url,
  image_url: r.image_url, image_urls: r.images.length ? r.images : r.image_url ? [r.image_url] : [], ingredients: r.ingredients, steps: r.steps,
})
