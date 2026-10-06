import { useMemo, useSyncExternalStore } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecipesContext, type CookPlace, type Recipe, type RecipeDraft, type RecipesSource } from './data'
import { RecipesScreens } from './RecipesRoot'

// Recipes V2's screen tests (/__recipes-fixture?at=/recipes/scampi/cook&wall=1): the family's own recipes and photos
// as they were on Oct 6, held in memory so a star, a save or a step shows at once.

const NOW = new Date('2026-10-06T17:30:00')
const img = (k: string) => `/fixtures/recipes/${k}.jpg`
const r = (id: string, name: string, extra: Partial<Recipe>): Recipe => ({
  id, name, cook_time: null, servings: '2', source_type: 'image', source_url: null, image_url: img(id), last_used_at: null, favorite: false, cooked_count: 0,
  ingredients: [], steps: [], images: [img(id)], ...extra,
})

const SCAMPI_STEPS = [
  'Adjust rack to top position and preheat oven to 450 degrees. Bring a large pot of salted water to a boil. Wash and dry produce.',
  'Cut broccoli into 1-inch pieces if necessary. Zest and quarter lemon. Peel and mince or grate garlic.',
  'Toss broccoli on a baking sheet with a drizzle of olive oil, salt, and pepper.',
  'Roast on top rack until browned and crispy, 12- 15 minutes.',
  'Once water is boiling, add spaghetti to pot. Cook, stirring occasionally, until al dente, 9-11 minutes.',
  'Reserve 1/2 cup pasta cooking water (1 cup for 4 servings), then drain.',
  'While pasta cooks, place 3 TBSP butter (6 TBSP for 4 servings) in a small microwave-safe bowl. Microwave until just softened, 10 seconds. Add lemon zest, half the Parmesan (save the rest for serving), a pinch of garlic, and a pinch of chili flakes if desired. Mash with a fork to combine. Season with salt and pepper.',
  'Rinse shrimp under cold water, then pat dry with paper towels. Toss in a large bowl with a large drizzle of olive oil, remaining garlic, salt, and pepper.',
  'Heat a large pan over medium-high heat. Add shrimp and cook, stirring occasionally, until opaque and cooked through, 2-4 minutes.',
  'To pan with shrimp, add drained spaghetti, broccoli, stock concentrate, garlic butter, and 1/4 cup reserved pasta cooking water (1/3 cup for 4 servings). Toss until everything is thoroughly coated in sauce. Add a squeeze or two of lemon juice to taste. Season with salt and pepper.',
  'Divide pasta between bowls and top with remaining Parmesan and a pinch of chili flakes if desired. Serve with any remaining lemon wedges on the side.',
]

const FIXTURE_RECIPES: Recipe[] = [
  r('stirfry', 'Shrimp and Broccoli Stir Fry', { cook_time: '25 minutes', servings: '2-3', source_type: 'manual', last_used_at: '2026-09-07T18:00:00', favorite: true, cooked_count: 1, ingredients: ['1 lb shrimp, peeled', '1 head broccoli', '3 cloves garlic', '2 tbsp soy sauce', '1 tbsp vegetable oil'], steps: ['Cut the broccoli into small florets.', 'Stir fry the shrimp 2-3 minutes; set aside.', 'Stir fry the broccoli 4 minutes, add the garlic and soy, then the shrimp.'] }),
  r('scampi', 'Garlic Butter Shrimp Scampi', { cook_time: '30 Minutes', servings: '2 Person | 4 Person', source_type: 'pdf', last_used_at: '2026-08-14T18:00:00', favorite: true, cooked_count: 3,
    ingredients: ['10 oz | 20 oz Shrimp', '2 Clove(s) | 4 Clove(s) Garlic', '3 TBSP | 6 TBSP Parmesan Cheese', '1/2 Broccoli', '1 tsp | 1 tsp Chili Flakes', '6 oz | 12 oz Spaghetti', '1 | 2 Seafood Stock Concentrate', '1 | 2 Lemon'], steps: SCAMPI_STEPS }),
  r('bangbang', 'One-Pan Bang Bang Salmon Potato Bake', { servings: '2', source_type: 'manual', last_used_at: '2026-07-16T18:00:00', ingredients: ['2 salmon fillets', '1 lb baby potatoes', '1/4 cup bang bang sauce'], steps: ['Roast the potatoes 20 minutes at 425.', 'Add the salmon, brush with sauce, roast 12-15 minutes.'] }),
  r('bowls', 'Quick Salmon Power Bowls', { cook_time: '45 minutes', last_used_at: '2026-07-15T18:00:00', ingredients: ['2 salmon fillets', '1 cup rice', '1 avocado', '1 cucumber'], steps: ['Cook the rice.', 'Sear the salmon 4 minutes a side.', 'Build the bowls.'] }),
  r('honeysoy', 'Honey soy glazed salmon', { source_type: 'url', source_url: 'https://www.walmart.com/', last_used_at: '2026-07-08T18:00:00', ingredients: ['2 salmon fillets', '2 tbsp honey', '2 tbsp soy sauce'], steps: ['Whisk the honey and soy.', 'Bake the salmon 12 minutes, glazing twice.'] }),
  r('tacos', 'Prep & Bake Tex-Mex Salmon Tacos', { cook_time: '25 Minutes', servings: '2 Person | 4 Person', last_used_at: '2026-07-02T18:00:00', ingredients: ['10 oz | 20 oz Salmon', '6 | 12 Tortillas'], steps: ['Bake the salmon 12 minutes.', 'Fill the tortillas.'] }),
  r('cod', 'Pistachio Cod with Mango-Jalapeño Salsa', { cook_time: '30 Minutes', servings: '2 Person | 4 Person', source_type: 'pdf', last_used_at: '2026-07-01T18:00:00', ingredients: ['2 | 4 Cod fillets', '1 Mango', '1 Jalapeño pepper'], steps: ['Crust the cod with pistachios.', 'Bake 12-14 minutes.'] }),
  r('seared', 'Seared Salmon with Lemon-Dijon Sauce', { cook_time: '30 Minutes', servings: '2 Person | 4 Person', source_type: 'pdf', last_used_at: '2026-07-01T18:00:00', ingredients: ['2 | 4 Salmon fillets', '1 | 2 Lemon'], steps: ['Sear the salmon.', 'Make the sauce.'] }),
  r('tilapia', 'Parmesan crusted tilapia', { servings: '4', source_type: 'url', last_used_at: '2026-07-08T18:00:00', ingredients: ['4 tilapia fillets', '1/2 cup Parmesan'], steps: ['Crust and bake 15 minutes.'] }),
  r('noodles', 'SPICY THAI PEANUT SHIRATAKI NOODLES', { last_used_at: '2026-06-25T18:00:00', ingredients: ['2 packs shirataki noodles', '2 tbsp peanut butter'], steps: ['Rinse the noodles.', 'Toss with the sauce.'] }),
]

function store<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    sub: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn) },
    set: (next: T) => { value = next; subs.forEach((fn) => fn()) },
  }
}

function fixtureSource(params: URLSearchParams): RecipesSource {
  const recipes = store<Recipe[]>(FIXTURE_RECIPES)
  // ?cooking=phone: the scampi is being cooked on Jake's phone (step 5, a timer running).
  const cooking = store<CookPlace[]>(params.get('cooking') === 'phone'
    ? [{ recipe_id: 'scampi', step: 4, servings_index: 0, ticked: [1, 2, 3, 4, 7], timers: [{ id: 't1', label: '12–15 min', ends_at: new Date(NOW.getTime() + 582_000).toISOString(), left: 720, step: 3 }], device: 'Jake’s phone', updated_at: NOW.toISOString() }]
    : [])
  const ok = { ok: true }
  const w = window as unknown as { __recipes?: Record<string, unknown> }
  w.__recipes = {}
  const log = (k: string, v: unknown) => { w.__recipes![k] = v }
  return {
    now: () => NOW,
    onWall: params.get('wall') === '1',
    deviceName: params.get('wall') === '1' ? 'the wall' : 'Jake’s phone',
    useRecipes: () => useSyncExternalStore(recipes.sub, recipes.get),
    useCooking: () => useSyncExternalStore(cooking.sub, cooking.get),
    setFavorite: async (id, on) => { recipes.set(recipes.get().map((x) => (x.id === id ? { ...x, favorite: on } : x))); return ok },
    save: async (draft: RecipeDraft) => {
      const id = draft.id ?? `new-${recipes.get().length}`
      const saved: Recipe = { id, name: draft.name.trim(), cook_time: draft.cook_time || null, servings: draft.servings || null, source_type: draft.source_type, source_url: draft.source_url, image_url: draft.image_url, last_used_at: NOW.toISOString(), favorite: false, cooked_count: 0, ingredients: draft.ingredients.map((l) => l.trim()).filter(Boolean), steps: draft.steps.map((s) => s.trim()).filter(Boolean), images: draft.image_urls }
      const old = recipes.get().find((x) => x.id === id)
      recipes.set(old ? recipes.get().map((x) => (x.id === id ? { ...saved, favorite: old.favorite, cooked_count: old.cooked_count, last_used_at: old.last_used_at } : x)) : [...recipes.get(), saved])
      log('saved', saved)
      return { ok: true, id }
    },
    remove: async (id) => { recipes.set(recipes.get().filter((x) => x.id !== id)); return ok },
    importRecipe: async ({ kind, url }) => {
      await new Promise((res) => setTimeout(res, 300))
      if (kind === 'link' && url?.includes('nothing')) return { ok: false, message: 'No recipe was found there.' }
      return { ok: true, draft: { name: 'Lemon Ricotta Pancakes', cook_time: '20 minutes', servings: '4', source_type: kind === 'link' ? 'url' : kind === 'pdf' ? 'pdf' : 'image', source_url: url ?? null, image_url: img('bowls'), image_urls: [img('bowls'), img('honeysoy')], ingredients: ['1 cup ricotta', '2 eggs', '1 lemon, zested', '1 cup flour'], steps: ['Whisk the ricotta, eggs and zest.', 'Fold in the flour.', 'Cook on a hot griddle, 2-3 minutes a side.'] } }
    },
    searchPhotos: async () => [img('seared'), img('cod'), img('tacos')],
    addToGroceries: async (lines) => { log('groceries', lines); return ok },
    saveCooking: async (place) => { cooking.set([...cooking.get().filter((p) => p.recipe_id !== place.recipe_id), { ...place, device: 'Jake’s phone', updated_at: NOW.toISOString() }]) },
    finishCooking: async (id) => { cooking.set(cooking.get().filter((p) => p.recipe_id !== id)); recipes.set(recipes.get().map((x) => (x.id === id ? { ...x, cooked_count: x.cooked_count + 1, last_used_at: NOW.toISOString() } : x))); return ok },
    dropCooking: async (id) => { cooking.set(cooking.get().filter((p) => p.recipe_id !== id)) },
  }
}

export default function RecipesFixturePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const source = useMemo(() => fixtureSource(params), [params])
  const client = useMemo(() => new QueryClient(), [])
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[params.get('at') ?? '/recipes']}>
        <div data-testid="recipes-fixture"><RecipesContext.Provider value={source}><RecipesScreens /></RecipesContext.Provider></div>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
