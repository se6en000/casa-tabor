export const GROCERY_CATEGORY_KEYS = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'frozen',
  'pantry',
  'beverages',
  'other',
] as const

export type GroceryCategoryKey = (typeof GROCERY_CATEGORY_KEYS)[number]

const TOKEN_CORRECTIONS: Record<string, string> = {
  bannanas: 'bananas',
  bannana: 'banana',
  banannas: 'bananas',
  blueberies: 'blueberries',
  bluebery: 'blueberry',
  bluberries: 'blueberries',
  straberries: 'strawberries',
  strawbery: 'strawberry',
  rasberries: 'raspberries',
  blackberies: 'blackberries',
  'blueberriess': 'blueberries',
}

const CATEGORY_PHRASES: Record<Exclude<GroceryCategoryKey, 'other'>, string[]> = {
  produce: [
    'blue berries',
    'straw berries',
    'rasp berries',
    'black berries',
    'water melon',
    'spring mix',
    'baby spinach',
  ],
  dairy: ['half and half', 'heavy cream', 'cottage cheese', 'sour cream'],
  meat: ['ground beef', 'ground turkey', 'meat balls', 'chicken breast', 'salmon fillet', 'mahi mahi'],
  bakery: ['sourdough bread', 'hamburger buns', 'hot dog buns'],
  frozen: ['ice cream', 'frozen pizza', 'frozen fries', 'frozen berries', 'frozen cauliflower', 'riced cauliflower'],
  pantry: ['olive oil', 'peanut butter', 'fruit loops', 'cheerios', 'beef ramen', 'tuna canned'],
  beverages: ['sparkling water', 'coffee pods', 'espresso coffee', 'nespresso pods'],
}

const CATEGORY_TOKENS: Record<Exclude<GroceryCategoryKey, 'other'>, Set<string>> = {
  produce: new Set([
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'grape', 'grapes', 'berry', 'berries',
    'blueberry', 'blueberries', 'strawberry', 'strawberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries',
    'watermelon', 'kiwi', 'mango', 'pineapple', 'melon',
    'lettuce', 'spinach', 'kale', 'broccoli', 'carrot', 'carrots', 'tomato', 'tomatoes', 'onion', 'onions', 'garlic',
    'pepper', 'peppers', 'cucumber', 'celery', 'avocado', 'lemon', 'lime', 'zucchini', 'potato', 'potatoes', 'mushroom', 'mushrooms',
  ]),
  dairy: new Set([
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'eggs', 'mozzarella', 'cheddar', 'parmesan',
    'cottage', 'ricotta', 'gouda',
  ]),
  meat: new Set([
    'chicken', 'beef', 'steak', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage', 'lamb',
    'mahi', 'cod', 'tilapia', 'halibut', 'trout', 'lobster', 'crab',
  ]),
  bakery: new Set(['bread', 'bagel', 'bagels', 'muffin', 'muffins', 'croissant', 'bun', 'buns', 'roll', 'rolls', 'tortilla', 'tortillas', 'pita']),
  frozen: new Set(['frozen', 'ice', 'cream', 'pizza', 'fries', 'waffle', 'waffles', 'popsicle']),
  pantry: new Set([
    'pasta', 'rice', 'cereal', 'oat', 'oats', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'broth', 'stock',
    'bean', 'beans', 'lentil', 'lentils', 'spice', 'seasoning', 'ketchup', 'mustard', 'mayo', 'ramen', 'cheerios', 'fruit', 'loops', 'tuna',
  ]),
  beverages: new Set(['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lemonade', 'smoothie', 'drink', 'drinks', 'nespresso', 'espresso']),
}

export function normalizeComparableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeToken(token: string): string {
  return TOKEN_CORRECTIONS[token] ?? token
}

function tokenize(name: string): string[] {
  return normalizeComparableName(name).split(' ').filter(Boolean).map(normalizeToken)
}

function hasPhraseMatch(normalizedName: string, phrase: string): boolean {
  const normalizedPhrase = normalizeComparableName(phrase)
  if (!normalizedPhrase) return false
  const pattern = new RegExp(`(?:^|\\s)${normalizedPhrase.replace(/\s+/g, '\\s+')}(?:\\s|$)`)
  return pattern.test(normalizedName)
}

export function inferCategoryFromName(name: string): GroceryCategoryKey {
  const normalizedName = normalizeComparableName(name)
  if (!normalizedName) return 'other'

  for (const [category, phrases] of Object.entries(CATEGORY_PHRASES) as Array<[Exclude<GroceryCategoryKey, 'other'>, string[]]>) {
    if (phrases.some((phrase) => hasPhraseMatch(normalizedName, phrase))) {
      return category
    }
  }

  const tokens = tokenize(name)
  const tokenSet = new Set(tokens)
  if (tokenSet.has('watermelon')) return 'produce'

  for (const [category, categoryTokens] of Object.entries(CATEGORY_TOKENS) as Array<[Exclude<GroceryCategoryKey, 'other'>, Set<string>]>) {
    if (tokens.some((token) => categoryTokens.has(token))) {
      return category
    }
  }

  return 'other'
}
