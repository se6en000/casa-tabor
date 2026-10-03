#!/usr/bin/env node
// Grocery voice adds, scored (Jake, Oct 2: "it messes up on a lot, can you test 100 common grocery items and see if you
// can make it better"). Each item is said in groups the way people talk to the phone — "milk eggs and bread", no "and"
// at all, "and … and", "add … to the list", commas, amounts ("2 gallons of milk", "a dozen eggs") — and the parse is
// checked: the items split right, each name, its amount, and its aisle.
//
//   node --experimental-strip-types scripts/grocery-voice-eval.mjs            # dev set (tuned against)
//   node --experimental-strip-types scripts/grocery-voice-eval.mjs --holdout  # held-out items (never tuned against)
 //   node --experimental-strip-types scripts/grocery-voice-eval.mjs --fresh    # items not in the vocabulary at all
//   … --misses                                                                  # list what went wrong
import { parseGroceryVoiceBatch } from '../src/utils/groceryBatchVoiceParser.ts'

// [what's said, aisle] — the family's own most-bought items first, then common ones.
export const DEV_ITEMS = [
  ['bananas', 'produce'], ['apples', 'produce'], ['strawberries', 'produce'], ['grapes', 'produce'], ['broccoli', 'produce'],
  ['blueberries', 'produce'], ['mushrooms', 'produce'], ['cucumbers', 'produce'], ['avocados', 'produce'], ['lemons', 'produce'],
  ['limes', 'produce'], ['cilantro', 'produce'], ['green onions', 'produce'], ['sweet potatoes', 'produce'], ['roma tomatoes', 'produce'],
  ['baby spinach', 'produce'], ['red onion', 'produce'], ['garlic', 'produce'], ['carrots', 'produce'], ['celery', 'produce'],
  ['bell peppers', 'produce'], ['romaine lettuce', 'produce'], ['watermelon', 'produce'], ['green grapes', 'produce'], ['fresh basil', 'produce'],
  ['milk', 'dairy'], ['eggs', 'dairy'], ['butter', 'dairy'], ['greek yogurt', 'dairy'], ['oat milk', 'dairy'],
  ['sour cream', 'dairy'], ['cream cheese', 'dairy'], ['shredded cheese', 'dairy'], ['parmesan cheese', 'dairy'], ['heavy cream', 'dairy'],
  ['coffee creamer', 'dairy'], ['string cheese', 'dairy'], ['cottage cheese', 'dairy'], ['almond milk', 'dairy'], ['yogurt cups', 'dairy'],
  ['american cheese', 'dairy'], ['chicken thighs', 'meat'], ['ground beef', 'meat'], ['chicken breasts', 'meat'], ['salmon', 'meat'],
  ['shrimp', 'meat'], ['bacon', 'meat'], ['hamburger meat', 'meat'], ['pork chops', 'meat'], ['turkey bacon', 'meat'],
  ['salmon fillets', 'meat'], ['steak', 'meat'], ['bread', 'bakery'], ['bagels', 'bakery'], ['flour tortillas', 'bakery'],
  ['hamburger buns', 'bakery'], ['english muffins', 'bakery'], ['chocolate chip muffins', 'bakery'], ['sourdough bread', 'bakery'], ['frozen shrimp', 'frozen'],
  ['frozen corn', 'frozen'], ['frozen pizza', 'frozen'], ['ice cream', 'frozen'], ['chicken nuggets', 'frozen'], ['frozen fries', 'frozen'],
  ['popsicles', 'frozen'], ['frozen peas', 'frozen'], ['waffles', 'frozen'], ['frozen cherries', 'frozen'], ['pasta', 'pantry'],
  ['cheerios', 'pantry'], ['cereal', 'pantry'], ['olive oil', 'pantry'], ['soy sauce', 'pantry'], ['mayonnaise', 'pantry'],
  ['ketchup', 'pantry'], ['maple syrup', 'pantry'], ['rice', 'pantry'], ['peanut butter', 'pantry'], ['canned tuna', 'pantry'],
  ['canned salmon', 'pantry'], ['black beans', 'pantry'], ['chicken broth', 'pantry'], ['salt', 'pantry'], ['garlic powder', 'pantry'],
  ['sriracha', 'pantry'], ['pasta sauce', 'pantry'], ['taco shells', 'pantry'], ['mac and cheese', 'pantry'], ['breadcrumbs', 'pantry'],
  ['honey', 'pantry'], ['flour', 'pantry'], ['sugar', 'pantry'], ['ramen', 'pantry'], ['canned tuna fish', 'pantry'],
  ['coffee', 'beverages'], ['apple juice', 'beverages'], ['orange juice', 'beverages'], ['beer', 'beverages'], ['wine', 'beverages'],
  ['gatorade', 'beverages'], ['sparkling water', 'beverages'], ['coconut water', 'beverages'], ['kombucha', 'beverages'], ['cold brew', 'beverages'],
  ['granola bars', 'snacks'], ['fruit snacks', 'snacks'], ['potato chips', 'snacks'], ['tortilla chips', 'snacks'], ['goldfish', 'snacks'],
  ['pretzels', 'snacks'], ['crackers', 'snacks'], ['popcorn', 'snacks'], ['protein bars', 'snacks'], ['chocolate chip cookies', 'snacks'],
  ['paper towels', 'household'], ['toilet paper', 'household'], ['paper plates', 'household'], ['trash bags', 'household'], ['dish soap', 'household'],
  ['laundry detergent', 'household'], ['napkins', 'household'], ['aluminum foil', 'household'], ['plastic wrap', 'household'], ['shampoo', 'personal-care'],
  ['toothpaste', 'personal-care'], ['deodorant', 'personal-care'], ['shaving cream', 'personal-care'], ['body wash', 'personal-care'], ['dog food', 'pet'],
  ['cat treats', 'pet'], ['dog treats', 'pet'], ['cat food', 'pet'], ['cat litter', 'pet'], ['diapers', 'baby'], ['baby wipes', 'baby'],
]

// Never tuned against: how it does on items it hasn't seen.
export const HOLDOUT_ITEMS = [
  ['kiwi', 'produce'], ['mango', 'produce'], ['pineapple', 'produce'], ['zucchini', 'produce'], ['asparagus', 'produce'],
  ['cauliflower', 'produce'], ['peaches', 'produce'], ['pears', 'produce'], ['red grapes', 'produce'], ['jalapenos', 'produce'],
  ['mozzarella cheese', 'dairy'], ['half and half', 'dairy'], ['whipped cream', 'dairy'], ['cheddar cheese', 'dairy'], ['vanilla yogurt', 'dairy'],
  ['ground turkey', 'meat'], ['pork tenderloin', 'meat'], ['hot dogs', 'meat'], ['italian sausage', 'meat'], ['chicken wings', 'meat'],
  ['rotisserie chicken', 'deli'], ['deli turkey', 'deli'], ['sliced ham', 'deli'], ['dinner rolls', 'bakery'], ['croissants', 'bakery'],
  ['pita bread', 'bakery'], ['frozen blueberries', 'frozen'], ['fish sticks', 'frozen'], ['ice cream sandwiches', 'frozen'], ['frozen broccoli', 'frozen'],
  ['quinoa', 'pantry'], ['brown rice', 'pantry'], ['oatmeal', 'pantry'], ['canned tomatoes', 'pantry'], ['chicken noodle soup', 'pantry'],
  ['ranch dressing', 'pantry'], ['balsamic vinegar', 'pantry'], ['vanilla extract', 'pantry'], ['baking soda', 'pantry'], ['chocolate chips', 'pantry'],
  ['almond butter', 'pantry'], ['tomato paste', 'pantry'], ['lemonade', 'beverages'], ['diet coke', 'beverages'], ['iced tea', 'beverages'],
  ['trail mix', 'snacks'], ['beef jerky', 'snacks'], ['rice cakes', 'snacks'], ['dishwasher pods', 'household'], ['sponges', 'household'],
  ['ziploc bags', 'household'], ['conditioner', 'personal-care'], ['mouthwash', 'personal-care'], ['sunscreen', 'personal-care'], ['baby food', 'baby'],
]

// Written after the vocabulary was settled and never added to it: brands, flavours and compounds the parser has to work
// out from its rules (a describing word, a food in front of a word that takes one, an unknown name kept whole).
export const FRESH_ITEMS = [
  ['kerrygold butter', 'dairy'], ['everything bagels', 'bakery'], ['garlic naan', 'bakery'], ['turkey meatballs', 'meat'], ['chobani yogurt', 'dairy'],
  ['pretzel bites', 'snacks'], ['mango salsa', 'pantry'], ['honey ham', 'deli'], ['blueberry muffins', 'bakery'], ['strawberry jelly', 'pantry'],
  ['cinnamon raisin bread', 'bakery'], ['sharp cheddar', 'dairy'], ['organic bananas', 'produce'], ['frozen raspberries', 'frozen'], ['canned pineapple', 'pantry'],
  ['baby bok choy', 'produce'], ['lemon pepper seasoning', 'pantry'], ['vanilla almond milk', 'dairy'], ['sparkling lemonade', 'beverages'], ['ginger beer', 'beverages'],
  ['coconut yogurt', 'dairy'], ['turkey pepperoni', 'deli'], ['sweet potato fries', 'frozen'], ['gluten free pasta', 'pantry'], ['whole wheat tortillas', 'bakery'],
  ['raspberry sorbet', 'frozen'], ['peanut butter pretzels', 'snacks'], ['cheddar crackers', 'snacks'], ['unscented dryer sheets', 'household'], ['puppy pads', 'pet'],
  ['cat toys', 'pet'], ['kids toothpaste', 'personal-care'], ['spinach dip', 'deli'], ['chicken sausages', 'meat'], ['beef broth', 'pantry'],
  ['shredded mozzarella', 'dairy'], ['red bell peppers', 'produce'], ['green apples', 'produce'], ['banana chips', 'snacks'], ['apple cinnamon oatmeal', 'pantry'],
]

// Written last, scored once, never tuned against: the honest number.
export const UNSEEN_ITEMS = [
  ['tillamook cheese', 'dairy'], ['dave\'s killer bread', 'bakery'], ['honey crisp apples', 'produce'], ['chicken quesadillas', 'frozen'], ['clementines', 'produce'],
  ['turkey sandwich meat', 'deli'], ['garlic hummus', 'deli'], ['bagel thins', 'bakery'], ['strawberry yogurt', 'dairy'], ['mint chocolate chip ice cream', 'frozen'],
  ['frozen meatballs', 'frozen'], ['cheese pizza', 'frozen'], ['fig bars', 'snacks'], ['salted butter', 'dairy'], ['smoked salmon', 'meat'],
  ['sesame bagels', 'bakery'], ['cauliflower', 'produce'], ['pickle chips', 'pantry'], ['cranberry sauce', 'pantry'], ['beef stew meat', 'meat'],
  ['english cucumbers', 'produce'], ['diet ginger ale', 'beverages'], ['decaf coffee', 'beverages'], ['white cheddar popcorn', 'snacks'], ['veggie chips', 'snacks'],
  ['dishwasher salt', 'household'], ['lint rollers', 'household'], ['kids vitamins', 'personal-care'], ['dog shampoo', 'pet'], ['baby oatmeal', 'baby'],
  ['heirloom tomatoes', 'produce'], ['lemon bars', 'bakery'], ['egg noodles', 'pantry'], ['brown eggs', 'dairy'], ['chicken drumsticks', 'meat'],
  ['grape tomatoes', 'produce'], ['rainbow sprinkles', 'pantry'], ['mint gum', 'snacks'], ['coconut oil', 'pantry'], ['powdered donuts', 'bakery'],
]

// Some items are said with an amount: [said, name, quantity, unit].
const AMOUNTS = {
  milk: [['2 gallons of milk', 'milk', '2', 'gallons'], ['a gallon of milk', 'milk', '1', 'gallon']],
  eggs: [['a dozen eggs', 'eggs', '1', 'dozen'], ['2 dozen eggs', 'eggs', '2', 'dozen']],
  avocados: [['3 avocados', 'avocados', '3', null], ['three avocados', 'avocados', '3', null]],
  bananas: [['6 bananas', 'bananas', '6', null]],
  lemons: [['two lemons', 'lemons', '2', null]],
  cheerios: [['a box of cheerios', 'cheerios', '1', 'box']],
  'frozen corn': [['2 bags of frozen corn', 'frozen corn', '2', 'bags']],
  'ground beef': [['2 pounds of ground beef', 'ground beef', '2', 'lbs']],
  'paper towels': [['a pack of paper towels', 'paper towels', '1', 'pack']],
  'black beans': [['3 cans of black beans', 'black beans', '3', 'cans']],
  kiwi: [['4 kiwi', 'kiwi', '4', null]],
  'hot dogs': [['2 packs of hot dogs', 'hot dogs', '2', 'packs']],
  'canned tomatoes': [['two cans of canned tomatoes', 'canned tomatoes', '2', 'cans']],
  'whipped cream': [['a can of whipped cream', 'whipped cream', '1', 'can']],
}

// A small seeded random, so every run says the same things.
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

const STYLES = [
  // "milk eggs and bread" — what an iPhone hears when you list things
  (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(' ')} and ${xs.at(-1)}`),
  // no "and" at all
  (xs) => xs.join(' '),
  // "milk and eggs and bread"
  (xs) => xs.join(' and '),
  (xs) => `add ${xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(' ')} and ${xs.at(-1)}`} to the list`,
  (xs) => `we need ${xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(' ')} and ${xs.at(-1)}`}`,
  // typed-like: "milk, eggs, and bread"
  (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`),
]

export function buildCases(items, seed) {
  const r = rng(seed)
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const cases = []
  let at = 0
  let styleAt = 0
  while (at < pool.length) {
    const size = 1 + Math.floor(r() * 4)
    const group = pool.slice(at, at + size)
    at += size
    const style = STYLES[styleAt++ % STYLES.length]
    const said = []
    const want = []
    for (const [name, aisle] of group) {
      const amount = AMOUNTS[name] && r() < 0.6 ? AMOUNTS[name][Math.floor(r() * AMOUNTS[name].length)] : null
      said.push(amount ? amount[0] : name)
      want.push({ name: amount ? amount[1] : name, aisle, quantity: amount ? amount[2] : null, unit: amount ? amount[3] : null })
    }
    // The phone capitalizes the first word.
    const text = style(said).replace(/^\w/, (c) => c.toUpperCase())
    cases.push({ text, want })
  }
  return cases
}

const fold = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ')

export function score(cases, parse = parseGroceryVoiceBatch) {
  let utterOk = 0
  let items = 0
  let namesOk = 0
  let aislesOk = 0
  let amountsWanted = 0
  let amountsOk = 0
  let extra = 0
  const misses = []
  for (const c of cases) {
    const got = parse(c.text)
    const gotNames = got.map((g) => fold(g.name))
    let allOk = got.length === c.want.length
    const notes = []
    c.want.forEach((w, i) => {
      items++
      const k = gotNames.indexOf(fold(w.name))
      if (k < 0) { allOk = false; notes.push(`missing "${w.name}"`); return }
      namesOk++
      const g = got[k]
      if (g.category === w.aisle) aislesOk++
      else { allOk = false; notes.push(`${w.name}: aisle ${g.category}, want ${w.aisle}`) }
      if (w.quantity) {
        amountsWanted++
        const unitOk = (g.unit ?? null) === w.unit || (w.unit == null && g.unit == null)
        if (String(g.quantity) === w.quantity && unitOk) amountsOk++
        else { allOk = false; notes.push(`${w.name}: amount ${g.quantity ?? '-'} ${g.unit ?? ''}, want ${w.quantity} ${w.unit ?? ''}`) }
      }
      void i
    })
    const wantNames = new Set(c.want.map((w) => fold(w.name)))
    const stray = gotNames.filter((n) => !wantNames.has(n))
    extra += stray.length
    if (stray.length) notes.push(`stray ${stray.map((s) => `"${s}"`).join(', ')}`)
    if (allOk && !stray.length) utterOk++
    else misses.push({ text: c.text, got: got.map((g) => `${g.name}${g.quantity ? ` ×${g.quantity}${g.unit ? ` ${g.unit}` : ''}` : ''} [${g.category}]`), notes })
  }
  return {
    utterances: cases.length,
    utterancesRight: utterOk,
    items,
    namesRight: namesOk,
    aislesRight: aislesOk,
    amountsRight: `${amountsOk}/${amountsWanted}`,
    stray: extra,
    misses,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const holdout = process.argv.includes('--holdout')
  const fresh = process.argv.includes('--fresh')
  const unseen = process.argv.includes('--unseen')
  const items = unseen ? UNSEEN_ITEMS : fresh ? FRESH_ITEMS : holdout ? HOLDOUT_ITEMS : DEV_ITEMS
  // Three different groupings of the same items, so a lucky split isn't counted.
  const cases = [11, 22, 33].flatMap((seed) => buildCases(items, unseen ? seed + 3000 : fresh ? seed + 2000 : holdout ? seed + 1000 : seed))
  const s = score(cases)
  const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / b)}%)`
  console.log(`${unseen ? 'UNSEEN' : fresh ? 'FRESH' : holdout ? 'HELD-OUT' : 'DEV'}: ${items.length} items, ${s.utterances} things said`)
  console.log(`  said right, all of it: ${pct(s.utterancesRight, s.utterances)}`)
  console.log(`  items found:           ${pct(s.namesRight, s.items)}`)
  console.log(`  right aisle:           ${pct(s.aislesRight, s.items)}`)
  console.log(`  amounts:               ${s.amountsRight}`)
  console.log(`  stray items:           ${s.stray}`)
  if (process.argv.includes('--misses')) for (const m of s.misses) console.log(`- "${m.text}"\n    got: ${m.got.join(' | ')}\n    ${m.notes.join('; ')}`)
}
