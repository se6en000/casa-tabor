export const GROCERY_CATEGORY_KEYS = [
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
  deoderant: 'deodorant',
  toliet: 'toilet',
  papper: 'paper',
  applesause: 'applesauce',
  hommus: 'hummus',
  almondmilk: 'almondmilk',
}

const CATEGORY_PHRASES: Record<Exclude<GroceryCategoryKey, 'other'>, string[]> = {
  produce: ['blue berries', 'straw berries', 'rasp berries', 'black berries', 'water melon', 'spring mix', 'baby spinach', 'fresh basil', 'fresh cilantro', 'fresh parsley', 'ginger root', 'romaine hearts', 'brussels sprouts', 'fresh asparagus', 'green cabbage', 'butternut squash', 'yellow squash'],
  dairy: ['half and half', 'half half', 'heavy cream', 'cottage cheese', 'sour cream', 'almond milk', 'oat milk'],
  meat: ['ground beef', 'ground turkey', 'chicken breast', 'salmon fillet', 'rib eye', 'ribeye'],
  bakery: ['sourdough bread', 'hamburger buns', 'hot dog buns', 'garlic bread'],
  frozen: ['frozen pizza', 'frozen fries', 'frozen berries', 'frozen cauliflower', 'riced cauliflower', 'dino nuggets', 'chicken nuggets'],
  pantry: ['olive oil', 'peanut butter', 'beef ramen', 'tuna canned', 'apple sauce', 'applesauce pouches', 'dried oregano', 'dried basil', 'italian seasoning', 'firm tofu', 'extra firm tofu', 'original hummus', 'mild salsa'],
  beverages: ['sparkling water', 'coffee pods', 'espresso coffee', 'nespresso pods', 'coca cola', 'diet coke', 'coke zero', 'sprite soda', 'dr pepper'],
  snacks: ['potato chips', 'tortilla chips', 'granola bars', 'protein bar', 'fruit snacks', 'trail mix'],
  deli: ['rotisserie chicken', 'lunch meat', 'deli turkey', 'prepared salad', 'mac and cheese prepared', 'genoa salami', 'cooked ham'],
  household: ['paper towels', 'toilet paper', 'dish soap', 'trash bags', 'laundry detergent'],
  'personal-care': ['tooth paste', 'toothbrush', 'body wash', 'shampoo', 'deodorant'],
  baby: ['baby wipes', 'diapers', 'baby formula', 'baby food'],
  pet: ['dog food', 'cat food', 'cat litter', 'pet treats'],
}

const CATEGORY_TOKENS: Record<Exclude<GroceryCategoryKey, 'other'>, Set<string>> = {
  produce: new Set([
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'grape', 'grapes', 'berry', 'berries',
    'blueberry', 'blueberries', 'strawberry', 'strawberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries',
    'watermelon', 'kiwi', 'mango', 'pineapple', 'melon', 'lettuce', 'spinach', 'kale', 'broccoli', 'carrot', 'carrots',
    'tomato', 'tomatoes', 'onion', 'onions', 'garlic', 'pepper', 'peppers', 'cucumber', 'celery', 'avocado', 'lemon',
    'lime', 'pear', 'ginger', 'asparagus', 'cauliflower', 'sprout', 'brussels', 'radish', 'clementine', 'artichoke',
    'pea', 'romaine', 'corn', 'grapefruit', 'eggplant', 'yam', 'chard', 'bok', 'peach', 'plum', 'squash', 'nectarine', 'apricot', 'prune', 'beet', 'arugula', 'cherry', 'shallot',
    'zucchini', 'potato', 'potatoes', 'mushroom', 'mushrooms', 'herb', 'herbs', 'basil', 'cilantro', 'parsley', 'dill', 'chive', 'chives', 'mint',
  ]),
  dairy: new Set(['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'eggs', 'mozzarella', 'cheddar', 'parmesan', 'cottage', 'ricotta', 'gouda', 'buttermilk', 'creamer', 'almond', 'oatmilk', 'soymilk']),
  meat: new Set(['chicken', 'beef', 'steak', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'bacon', 'sausage', 'lamb', 'rib', 'ribeye', 'mahi', 'cod', 'tilapia', 'halibut', 'trout']),
  bakery: new Set(['bread', 'bagel', 'bagels', 'muffin', 'muffins', 'croissant', 'bun', 'buns', 'roll', 'rolls', 'tortilla', 'tortillas', 'pita']),
  frozen: new Set(['frozen', 'ice', 'pizza', 'fries', 'waffle', 'waffles', 'popsicle', 'hashbrown', 'slider', 'ravioli', 'meatball', 'nugget', 'nuggets', 'dino']),
  pantry: new Set(['pasta', 'rice', 'cereal', 'oat', 'oats', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soup', 'broth', 'stock', 'bean', 'beans', 'lentil', 'lentils', 'spice', 'seasoning', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'ramen', 'applesauce', 'oregano', 'thyme', 'rosemary', 'tofu', 'orzo', 'quinoa', 'honey', 'olive', 'spaghetti', 'fusilli', 'penne', 'salsa', 'sweetener', 'hummus', 'hommus', 'spread', 'raisin', 'shell', 'shells', 'taco', 'pie', 'crust', 'amino', 'tempeh', 'edamame', 'rotini', 'saffron', 'seitan', 'chorizo', 'horseradish', 'quiche', 'ranch', 'pistachio', 'walnut']),
  beverages: new Set(['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lemonade', 'smoothie', 'drink', 'drinks', 'nespresso', 'espresso', 'kombucha', 'cola', 'smartwater', 'almondbreeze', 'almondmilk', 'coke', 'sprite', 'pepsi', 'fanta']),
  snacks: new Set(['chips', 'cracker', 'crackers', 'pretzel', 'pretzels', 'bar', 'bars', 'popcorn', 'snack', 'snacks', 'granola', 'cookies', 'cookie', 'wafer', 'wafers', 'zbar', 'zbars', 'kettlecorn', 'chickn']),
  deli: new Set(['deli', 'rotisserie', 'prepared', 'salad', 'hummus', 'guacamole', 'salami', 'ham', 'prosciutto', 'pepperoni', 'provolone']),
  household: new Set(['paper', 'towels', 'toilet', 'detergent', 'soap', 'cleaner', 'cleanse', 'bleach', 'sponge', 'sponges', 'trash', 'bags', 'foil', 'tissue', 'tissues', 'napkin', 'napkins', 'garbage', 'plate', 'plates', 'magic', 'eraser']),
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
  const corrected = TOKEN_CORRECTIONS[token] ?? token
  if (
    corrected.endsWith('s') &&
    corrected.length > 3 &&
    !corrected.endsWith('ss') &&
    !corrected.endsWith('ies') &&
    !corrected.endsWith('oes') &&
    !corrected.endsWith('xes') &&
    !corrected.endsWith('ches') &&
    !corrected.endsWith('shes') &&
    !corrected.endsWith('zes') &&
    !corrected.endsWith('us') &&
    !corrected.endsWith('is')
  ) {
    return corrected.slice(0, -1)
  }
  return corrected
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
    if (phrases.some((phrase) => hasPhraseMatch(normalizedName, phrase))) return category
  }

  const tokens = tokenize(name)
  for (const [category, categoryTokens] of Object.entries(CATEGORY_TOKENS) as Array<[Exclude<GroceryCategoryKey, 'other'>, Set<string>]>) {
    if (tokens.some((token) => categoryTokens.has(token))) return category
  }

  return 'other'
}
