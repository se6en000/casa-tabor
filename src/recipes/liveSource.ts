import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import { normalizeRecipeIngredientFields } from '../utils/recipeIngredientParsing'
import { readWallHomeFlag } from '../wall/kioskHome'
import { fileToUpload } from './files'
import type { CookPlace, Recipe, RecipeDraft, RecipesSource, SaveResult } from './data'

const ok: SaveResult = { ok: true }
const fail = (error: unknown, fallback = 'That didn’t save.'): SaveResult => ({ ok: false, message: formatSupabaseError(error, fallback) })
const RECIPES = ['recipes-v2'] as const
const COOKING = ['recipes-v2-cooking'] as const

const isWebUrl = (u: string | null | undefined) => Boolean(u && /^https?:\/\//.test(u) && u.length <= 2048)

async function uploadPhoto(recipeId: string, file: File): Promise<string> {
  const up = await fileToUpload(file)
  const { data, error } = await supabase.functions.invoke('recipe-photo-upload', {
    body: { recipe_id: recipeId, file_name: file.name || `photo-${Date.now()}.jpg`, file_base64: up.base64, mime_type: up.mimeType },
  })
  if (error) throw error
  const url = String((data as { url?: string } | null)?.url ?? '').trim()
  if (!url) throw new Error('The photo didn’t upload.')
  return url
}

function payloadOf(draft: RecipeDraft, id?: string) {
  const images = Array.from(new Set(draft.image_urls.filter(isWebUrl)))
  const cover = isWebUrl(draft.image_url) ? draft.image_url : images[0] ?? null
  return {
    id: id ?? draft.id ?? null,
    name: draft.name.trim(),
    cook_time: draft.cook_time.trim(),
    servings: draft.servings.trim(),
    source_type: draft.source_type,
    source_url: draft.source_url,
    image_url: cover,
    image_urls: cover && !images.includes(cover) ? [cover, ...images] : images,
    ingredients: draft.ingredients.map((line) => line.trim()).filter(Boolean).map((raw_text) => {
      const n = normalizeRecipeIngredientFields({ rawText: raw_text, name: null, quantity: null, unit: null })
      return { raw_text, name: n.name, quantity: n.quantity, unit: n.unit }
    }),
    steps: draft.steps.map((s) => s.trim()).filter(Boolean),
  }
}

/** The draft an import gives back, in the shape the editor works on. */
function draftFromImport(raw: Record<string, unknown>, kind: 'photos' | 'pdf' | 'link', url?: string): RecipeDraft {
  const lines = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((row) => String((row as { raw_text?: unknown })?.raw_text ?? '').trim()).filter(Boolean)
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((row) => String((row as { instruction?: unknown })?.instruction ?? '').trim()).filter(Boolean)
  const images = Array.from(new Set([raw.image_url, ...(Array.isArray(raw.image_urls) ? raw.image_urls : [])].map(String).filter(isWebUrl)))
  return {
    name: String(raw.name ?? '').trim(),
    cook_time: typeof raw.cook_time === 'string' ? raw.cook_time : '',
    servings: typeof raw.servings === 'string' ? raw.servings : '',
    source_type: kind === 'link' ? 'url' : kind === 'pdf' ? 'pdf' : 'image',
    source_url: kind === 'link' ? url ?? null : null,
    image_url: images[0] ?? null,
    image_urls: images,
    ingredients: lines,
    steps,
  }
}

export function liveRecipesSource(deviceName: string, queryClient: QueryClient): RecipesSource {
  const refresh = () => queryClient.invalidateQueries({ queryKey: RECIPES })
  return {
    now: () => new Date(),
    onWall: readWallHomeFlag() === '1',
    deviceName,
    useRecipes: () => useQuery({
      queryKey: RECIPES,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_recipes')
        if (error) throw error
        return (data ?? []) as Recipe[]
      },
      staleTime: 60_000,
    }).data ?? null,
    // Your place, on every device: checked every 10 seconds while a recipes page is open.
    useCooking: () => useQuery({
      queryKey: COOKING,
      queryFn: async () => {
        const { data, error } = await supabase.from('recipe_cooking').select('recipe_id, step, servings_index, ticked, timers, device, updated_at')
        if (error) throw error
        return (data ?? []) as CookPlace[]
      },
      refetchInterval: 10_000,
    }).data ?? [],
    setFavorite: async (id, on) => {
      queryClient.setQueryData<Recipe[]>(RECIPES, (old) => old?.map((r) => (r.id === id ? { ...r, favorite: on } : r)))
      const { error } = await supabase.from('recipes').update({ favorite: on }).eq('id', id)
      void refresh()
      return error ? fail(error) : ok
    },
    save: async (draft, photo) => {
      try {
        const { data, error } = await supabase.rpc('save_recipe', { p: payloadOf(draft) })
        if (error) throw error
        const id = String(data)
        // A photo of your own: it needs the recipe to exist first, then it becomes the cover.
        if (photo) {
          const url = await uploadPhoto(id, photo)
          const withPhoto = { ...draft, image_url: url, image_urls: [url, ...draft.image_urls] }
          const { error: coverError } = await supabase.rpc('save_recipe', { p: { ...payloadOf(withPhoto, id) } })
          if (coverError) throw coverError
        }
        await refresh()
        return { ok: true, id }
      } catch (error) {
        return fail(error, 'The recipe didn’t save.')
      }
    },
    remove: async (id) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      await refresh()
      return error ? fail(error, 'It wasn’t deleted.') : ok
    },
    importRecipe: async ({ kind, files = [], url }) => {
      try {
        const body = kind === 'link'
          ? { source_type: 'url', source_url: url?.trim() }
          : { source_type: kind === 'pdf' ? 'pdf' : 'image', files: await Promise.all(files.map(async (f) => { const up = await fileToUpload(f); return { file_base64: up.base64, mime_type: up.mimeType } })) }
        const { data, error } = await supabase.functions.invoke('extract-recipe-content', { body })
        if (error) throw error
        const raw = (data as { recipe?: Record<string, unknown> } | null)?.recipe
        if (!raw) throw new Error('Nothing came back from that page.')
        const draft = draftFromImport(raw, kind, url)
        if (!draft.ingredients.length && !draft.steps.length) throw new Error('No recipe was found there.')
        return { ok: true, draft }
      } catch (error) {
        return { ok: false, message: formatSupabaseError(error, 'That couldn’t be read.') }
      }
    },
    searchPhotos: async (query) => {
      const { data, error } = await supabase.functions.invoke('recipe-image-search', { body: { query, limit: 12 } })
      if (error) return []
      return ((data as { results?: Array<{ url?: string }> } | null)?.results ?? []).map((r) => String(r.url ?? '')).filter(isWebUrl)
    },
    addToGroceries: async (lines) => {
      try {
        const { data: lists, error: listError } = await supabase.from('grocery_lists').select('id').order('created_at').limit(1)
        if (listError) throw listError
        const listId = lists?.[0]?.id
        if (!listId) throw new Error('There’s no grocery list yet.')
        const rows = lines.map((line) => {
          const n = normalizeRecipeIngredientFields({ rawText: line, name: null, quantity: null, unit: null })
          const name = (n.name || line).trim()
          return { list_id: listId, name, quantity: n.quantity, unit: n.unit, category: inferCategoryFromName(name), checked: false, notes: null, last_modified_source: 'casa' }
        }).filter((r) => r.name)
        const { error } = await supabase.from('grocery_items').insert(rows)
        if (error && error.code !== '23505') throw error
        void queryClient.invalidateQueries({ queryKey: ['grocery'] })
        return ok
      } catch (error) {
        return fail(error, 'They didn’t go on the list.')
      }
    },
    saveCooking: async (place) => {
      queryClient.setQueryData<CookPlace[]>(COOKING, (old = []) => [...old.filter((p) => p.recipe_id !== place.recipe_id), { ...place, device: deviceName, updated_at: new Date().toISOString() }])
      await supabase.from('recipe_cooking').upsert({ ...place, device: deviceName, updated_at: new Date().toISOString() })
    },
    finishCooking: async (recipeId) => {
      queryClient.setQueryData<CookPlace[]>(COOKING, (old = []) => old.filter((p) => p.recipe_id !== recipeId))
      const { error } = await supabase.rpc('finish_cooking', { p_recipe_id: recipeId })
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: COOKING })])
      return error ? fail(error) : ok
    },
    dropCooking: async (recipeId) => {
      queryClient.setQueryData<CookPlace[]>(COOKING, (old = []) => old.filter((p) => p.recipe_id !== recipeId))
      await supabase.from('recipe_cooking').delete().eq('recipe_id', recipeId)
    },
  }
}
