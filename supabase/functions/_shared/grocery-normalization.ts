export const GROCERY_CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'bakery',
  'frozen',
  'pantry',
  'beverages',
  'snacks',
  'deli',
  'household',
  'personal-care',
  'baby',
  'pet',
  'other',
])

const CATEGORY_ALIASES: Record<string, string> = {
  'meat & seafood': 'meat',
  'meat and seafood': 'meat',
  seafood: 'meat',
  protein: 'meat',
  drink: 'beverages',
  drinks: 'beverages',
  beverage: 'beverages',
  'deli/prepared': 'deli',
  prepared: 'deli',
  'prepared foods': 'deli',
  'personal care': 'personal-care',
  'personal-care': 'personal-care',
  'household supplies': 'household',
}

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
  deoderant: 'deodorant',
  toliet: 'toilet',
  papper: 'paper',
  applesause: 'applesauce',
}

const CATEGORY_PHRASES: Record<string, string[]> = {
  produce: ['blue berries', 'straw berries', 'rasp berries', 'black berries', 'water melon', 'spring mix', 'baby spinach', 'fresh basil', 'fresh cilantro', 'fresh parsley'],
  dairy: ['half and half', 'heavy cream', 'cottage cheese', 'sour cream'],
  meat: ['ground beef', 'ground turkey', 'chicken breast', 'salmon fillet', 'mahi mahi', 'rib eye', 'ribeye'],
  bakery: ['sourdough bread', 'hamburger buns', 'hot dog buns', 'garlic bread'],
  frozen: ['frozen pizza', 'frozen fries', 'frozen berries', 'frozen cauliflower', 'riced cauliflower'],
  pantry: ['olive oil', 'peanut butter', 'beef ramen', 'tuna canned', 'apple sauce', 'applesauce pouches', 'dried oregano', 'dried basil', 'italian seasoning'],
  beverages: ['sparkling water', 'coffee pods', 'espresso coffee', 'nespresso pods'],
  snacks: ['potato chips', 'tortilla chips', 'granola bars', 'protein bar', 'fruit snacks', 'trail mix'],
  deli: ['rotisserie chicken', 'lunch meat', 'deli turkey', 'prepared salad', 'prepared soup'],
  household: ['paper towels', 'toilet paper', 'dish soap', 'trash bags', 'laundry detergent'],
  'personal-care': ['tooth paste', 'toothbrush', 'body wash', 'shampoo', 'deodorant'],
  baby: ['baby wipes', 'diapers', 'baby formula', 'baby food'],
  pet: ['dog food', 'cat food', 'cat litter', 'pet treats'],
}

const CATEGORY_TOKENS: Record<string, Set<string>> = {
  produce: new Set([
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'grape', 'grapes', 'berry', 'berries',
    'blueberry', 'blueberries', 'strawberry', 'strawberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries',
    'watermelon', 'kiwi', 'mango', 'pineapple', 'melon', 'lettuce', 'spinach', 'kale', 'broccoli', 'carrot', 'carrots',
    'tomato', 'tomatoes', 'onion', 'onions', 'garlic', 'pepper', 'peppers', 'cucumber', 'celery', 'avocado', 'lemon',
    'lime', 'zucchini', 'potato', 'potatoes', 'mushroom', 'mushrooms', 'herb', 'herbs', 'basil', 'cilantro', 'parsley', 'dill', 'chives', 'mint',
  ]),
  dairy: new Set(['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'eggs', 'mozzarella', 'cheddar', 'parmesan', 'cottage', 'ricotta', 'gouda']),
  meat: new Set(['chicken', 'beef', 'steak', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage', 'lamb', 'rib', 'ribeye', 'mahi', 'cod', 'tilapia', 'halibut', 'trout', 'lobster', 'crab']),
  bakery: new Set(['bread', 'bagel', 'bagels', 'muffin', 'muffins', 'croissant', 'bun', 'buns', 'roll', 'rolls', 'tortilla', 'tortillas', 'pita']),
  frozen: new Set(['frozen', 'ice', 'pizza', 'fries', 'waffle', 'waffles', 'popsicle']),
  pantry: new Set(['pasta', 'rice', 'cereal', 'oat', 'oats', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'broth', 'stock', 'bean', 'beans', 'lentil', 'lentils', 'spice', 'seasoning', 'ketchup', 'mustard', 'mayo', 'ramen', 'applesauce', 'oregano', 'thyme', 'rosemary']),
  beverages: new Set(['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lemonade', 'smoothie', 'drink', 'drinks', 'nespresso', 'espresso']),
  snacks: new Set(['chips', 'cracker', 'crackers', 'pretzel', 'pretzels', 'bar', 'bars', 'popcorn', 'snack', 'snacks', 'granola', 'cookies']),
  deli: new Set(['deli', 'rotisserie', 'prepared', 'salad', 'hummus', 'guacamole']),
  household: new Set(['paper', 'towels', 'toilet', 'detergent', 'soap', 'cleaner', 'bleach', 'sponge', 'sponges', 'trash', 'bags', 'foil']),
  'personal-care': new Set(['shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'deodorant', 'lotion', 'razor', 'bodywash', 'body', 'wash']),
  baby: new Set(['diapers', 'wipe', 'wipes', 'formula', 'baby', 'infant']),
  pet: new Set(['dog', 'cat', 'pet', 'litter', 'kibble', 'treat', 'treats']),
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

export function inferCategoryFromName(name: string): string {
  const normalizedName = normalizeComparableName(name)
  if (!normalizedName) return 'other'

  for (const [category, phrases] of Object.entries(CATEGORY_PHRASES)) {
    if (phrases.some((phrase) => hasPhraseMatch(normalizedName, phrase))) {
      return category
    }
  }

  const tokens = tokenize(name)
  for (const [category, categoryTokens] of Object.entries(CATEGORY_TOKENS)) {
    if (tokens.some((token) => categoryTokens.has(token))) {
      return category
    }
  }

  return 'other'
}

export function normalizeCategoryInput(category?: string | null): string {
  if (!category) return 'other'
  const normalized = category.trim().toLowerCase()
  if (GROCERY_CATEGORIES.has(normalized)) return normalized
  const aliased = CATEGORY_ALIASES[normalized]
  if (aliased && GROCERY_CATEGORIES.has(aliased)) return aliased
  return 'other'
}

export function resolveCategoryFromInput(inputCategory: string | null | undefined, name: string): string {
  const normalizedCategory = normalizeCategoryInput(inputCategory)
  if (normalizedCategory !== 'other') return normalizedCategory
  return inferCategoryFromName(name)
}
