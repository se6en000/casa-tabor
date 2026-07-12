const ITEMS = ['milk', 'eggs', 'bananas', 'bread', 'coffee']
const QUANTITY_WORDS = Object.freeze({
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
})

export const GROCERY_INTENTS = Object.freeze([
  'grocery.list',
  'grocery.contains',
  'grocery.add',
  'grocery.check',
  'grocery.remove',
  'grocery.quantity',
  'grocery.clear_checked',
])

export const GROCERY_UTTERANCE_CORPUS = Object.freeze([
  ...['what is on my grocery list', 'read my shopping list', 'show me the grocery list', 'what do we need from the store']
    .map((text) => ({ text, intent: 'grocery.list' })),
  ...ITEMS.flatMap((item) => [
    { text: `is ${item} on the grocery list`, intent: 'grocery.contains' },
    { text: `do we already have ${item} on the shopping list`, intent: 'grocery.contains' },
    { text: `add ${item} to the grocery list`, intent: 'grocery.add' },
    { text: `put ${item} on the shopping list`, intent: 'grocery.add' },
    { text: `we need ${item}`, intent: 'grocery.add' },
    { text: `buy ${item}`, intent: 'grocery.add' },
    { text: `check off ${item}`, intent: 'grocery.check' },
    { text: `mark ${item} as bought`, intent: 'grocery.check' },
    { text: `remove ${item} from the grocery list`, intent: 'grocery.remove' },
    { text: `take ${item} off the shopping list`, intent: 'grocery.remove' },
    { text: `change ${item} to two`, intent: 'grocery.quantity' },
    { text: `make ${item} quantity 2`, intent: 'grocery.quantity' },
  ]),
  ...['clear checked groceries', 'remove completed shopping items', 'clear bought items']
    .map((text) => ({ text, intent: 'grocery.clear_checked' })),
])

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^(?:alexa|casa)[,\s]+/, '')
    .replace(/[’']/g, "'")
    .replace(/[?!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanItem(value) {
  return String(value ?? '')
    .replace(/^(?:some|the|a|an)\s+/i, '')
    .replace(/\s+(?:to|on|from|off)\s+(?:my|the|our)?\s*(?:grocery|shopping)?\s*list$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitItems(value) {
  return String(value ?? '')
    .split(/\s*,\s*|\s+(?:and|plus)\s+/i)
    .map(cleanItem)
    .filter((item) => item.length > 0 && item.length <= 120)
    .slice(0, 20)
}

function parseAddItem(value) {
  const cleaned = cleanItem(value)
  const amount = cleaned.match(/^(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(bags?|bottles?|boxes?|cans?|cartons?|dozen|gallons?|jars?|packs?|packages?|pounds?|lbs?)\s+(?:of\s+)?)?(.+)$/i)
  if (!amount) return { name: cleaned }
  return {
    name: cleanItem(amount[3]),
    quantity: quantityValue(amount[1]),
    ...(amount[2] ? { unit: amount[2].toLowerCase() } : {}),
  }
}

function splitAddItems(value) {
  return splitItems(value).map(parseAddItem).filter((item) => item.name)
}

function quantityValue(value) {
  const normalized = normalize(value)
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return normalized
  return QUANTITY_WORDS[normalized] ?? null
}

function frame(intent, confidence, slots = {}, requiresActiveItem = false) {
  return {
    domain: 'grocery',
    intent,
    confidence,
    source: 'grocery_language_contract',
    requiresActiveItem,
    slots,
  }
}

export function parseGroceryLanguage(text, options = {}) {
  const input = normalize(text)
  if (!input) return null
  const activeItem = options.activeEntityType === 'grocery_item'

  if (/^(?:what(?:'s| is) on|read|show|list|tell me)(?: me)?\s+(?:what(?:'s| is) on\s+)?(?:my|the|our)?\s*(?:grocery|shopping)(?: list)?$/.test(input) ||
      /^what do we need (?:from|at) the (?:store|grocery store)$/.test(input)) {
    return frame('grocery.list', 0.99)
  }
  if (/^(?:clear|remove|delete)\s+(?:all\s+)?(?:the\s+)?(?:checked|completed|bought|done)\s+(?:grocery|groceries|shopping items?|items?)$/.test(input) ||
      /^clear\s+(?:the\s+)?(?:checked|completed)\s+(?:grocery|shopping)\s+items?$/.test(input)) {
    return frame('grocery.clear_checked', 0.99)
  }

  const contains = input.match(/^(?:is|are)\s+(.+?)\s+(?:already\s+)?on\s+(?:my|the|our)?\s*(?:grocery|shopping)(?: list)?$/) ||
    input.match(/^do we (?:already )?have\s+(.+?)(?:\s+on\s+(?:my|the|our)?\s*(?:grocery|shopping)(?: list)?)?$/)
  if (contains) return frame('grocery.contains', 0.99, { items: splitItems(contains[1]) })

  const check = input.match(/^(?:check off|mark|cross off)\s+(.+?)(?:\s+as\s+(?:bought|done|complete|completed))?$/) ||
    input.match(/^(?:i|we)\s+(?:bought|got|picked up)\s+(.+)$/)
  if (check) return frame('grocery.check', 0.97, { item: cleanItem(check[1]) })

  const remove = input.match(/^(?:remove|delete|take)\s+(.+?)\s+(?:from|off)\s+(?:my|the|our)?\s*(?:grocery|shopping)(?: list)?$/)
  if (remove) return frame('grocery.remove', 0.99, { item: cleanItem(remove[1]) })

  const quantity = input.match(/^(?:change|update|set|make)\s+(.+?)\s+(?:(?:quantity\s+)?(?:to|is)\s+|quantity\s+)(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/)
  if (quantity) {
    return frame('grocery.quantity', 0.98, {
      item: cleanItem(quantity[1]),
      quantity: quantityValue(quantity[2]),
    })
  }
  const activeQuantity = input.match(/^(?:make|change|update|set)\s+(?:that|it)(?:\s+quantity)?\s+(?:to\s+)?(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/)
  if (activeItem && activeQuantity) {
    return frame('grocery.quantity', 0.98, { quantity: quantityValue(activeQuantity[1]) }, true)
  }

  const add = input.match(/^(?:add|put)\s+(.+?)(?:\s+(?:to|on)\s+(?:my|the|our)?\s*(?:grocery|shopping)(?: list)?)$/) ||
    input.match(/^(?:buy|get|pick up|restock)\s+(.+)$/) ||
    input.match(/^(?:i|we)\s+need\s+(.+)$/)
  if (add) return frame('grocery.add', 0.97, { items: splitAddItems(add[1]) })

  return null
}

export function isGroceryLikeLanguage(text) {
  const input = normalize(text)
  return /\b(?:grocery|groceries|shopping list|buy|bought|restock|check off|picked up)\b/.test(input)
}
