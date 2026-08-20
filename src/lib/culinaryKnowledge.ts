/**
 * Comprehensive Culinary Knowledge Engine for Casa Sous Chef
 * Provides rich instant answers for substitutions, cooking temps, conversions, techniques & troubleshooting.
 */

export interface RecipeCookingContext {
  recipeName: string
  currentStepIndex: number
  totalSteps: number
  currentStepInstruction?: string
  allSteps?: Array<{ stepNumber: number; instruction: string }>
  ingredients?: Array<{ id: string; name: string; qty?: string | null; rawText?: string }>
  recipeScale?: string
}

export interface VoiceActionCommand {
  type: 'timer' | 'step_next' | 'step_prev' | 'step_goto' | 'scale' | 'read_step' | 'none'
  timerLabel?: string
  timerSeconds?: number
  targetStepIndex?: number
  scaleValue?: string
}

// ── Temperature & Doneness Database ──────────────────────────────────────────
const MEAT_TEMPERATURES: Record<string, { safe: string; ideal: string; cues: string }> = {
  chicken: {
    safe: '165°F (74°C)',
    ideal: '165°F for breasts; 175°F–180°F for thighs/legs (more tender)',
    cues: 'Juices run completely clear with no pink meat near the bone; meat is firm to the touch.',
  },
  poultry: {
    safe: '165°F (74°C)',
    ideal: '165°F breast / 175°F dark meat',
    cues: 'Juices run clear, texture is opaque throughout.',
  },
  turkey: {
    safe: '165°F (74°C)',
    ideal: '165°F breast / 175°F thighs',
    cues: 'Clear juices, meat thermometer in thickest part of thigh away from bone reads 165°F+.',
  },
  beef: {
    safe: '145°F (63°C) with 3m rest for whole cuts; 160°F for ground beef',
    ideal: 'Rare: 120–125°F | Med-Rare: 130–135°F | Medium: 140–145°F | Well: 155°F+',
    cues: 'Med-rare feels like the fleshy base of your thumb when thumb and middle finger touch.',
  },
  steak: {
    safe: '145°F (63°C) with 3m rest',
    ideal: 'Medium-Rare is 130°F–135°F; pull off heat at 125°F–130°F as it carries over +5°F while resting.',
    cues: 'Rich golden-brown crust. Rest 5–10 minutes before slicing against the grain.',
  },
  pork: {
    safe: '145°F (63°C) with 3m rest; 160°F for ground pork',
    ideal: '145°F for tender, slightly blush pork chops or tenderloin; 195°F–205°F for pulled pork shoulder.',
    cues: 'Slight blush of pink in the center is safe and ensures juicy meat.',
  },
  salmon: {
    safe: '145°F (63°C)',
    ideal: '125°F–130°F for tender medium-rare flaky center (wild salmon: 120°F).',
    cues: 'Flesh changes from translucent to opaque coral; flakes gently with a fork; white albumin barely appearing.',
  },
  fish: {
    safe: '145°F (63°C)',
    ideal: '130°F–135°F for delicate white fish (halibut, cod, sea bass).',
    cues: 'Flakes easily with a fork, opaque throughout, moist.',
  },
  shrimp: {
    safe: '145°F (63°C)',
    ideal: 'Cook 2–3 minutes total until just pink.',
    cues: 'Look for a distinct "C" shape and opaque pink-orange exterior. If they curl into a tight "O", they are overcooked.',
  },
  scallops: {
    safe: '145°F (63°C)',
    ideal: 'Sear 1.5–2 minutes on high per side to 125°F–130°F.',
    cues: 'Deep golden crust top and bottom, sides still glossy and translucent.',
  },
  ground_beef: {
    safe: '160°F (71°C)',
    ideal: '160°F throughout.',
    cues: 'No pink remaining, browned evenly.',
  },
}

// ── Common Ingredient Substitutions ──────────────────────────────────────────
const COMMON_SUBSTITUTIONS: Array<{ keywords: string[]; title: string; replacements: string[] }> = [
  {
    keywords: ['white wine', 'wine', 'dry white wine'],
    title: 'White Wine Substitute',
    replacements: [
      'Equal parts chicken or vegetable broth + 1 tsp lemon juice or white wine vinegar per 1/2 cup (adds depth + acidity).',
      'Dry vermouth (1:1 ratio, great pantry staple).',
      'Water + a splash of apple cider vinegar (1 tbsp per cup water).',
    ],
  },
  {
    keywords: ['red wine'],
    title: 'Red Wine Substitute',
    replacements: [
      'Beef broth + 1 tbsp red wine vinegar or balsamic vinegar per cup.',
      'Unsweetened 100% pomegranate or cranberry juice + splash of red wine vinegar.',
    ],
  },
  {
    keywords: ['buttermilk'],
    title: 'Buttermilk Substitute',
    replacements: [
      '1 cup whole or 2% milk + 1 tbsp fresh lemon juice or white vinegar. Let sit for 5 minutes until lightly curdled.',
      '3/4 cup plain Greek yogurt + 1/4 cup milk or water.',
      'Plain kefir (1:1 swap).',
    ],
  },
  {
    keywords: ['heavy cream', 'heavy whipping cream'],
    title: 'Heavy Cream Substitute',
    replacements: [
      '3/4 cup whole milk + 1/4 cup melted unsalted butter (for cooking/soups, won’t whip).',
      'Equal parts whole milk and plain Greek yogurt (whisk smooth for sauces).',
      'Full-fat canned coconut milk (dairy-free, slight coconut aroma).',
      'Half-and-half + 1 tbsp cornstarch (for thickening sauces).',
    ],
  },
  {
    keywords: ['sour cream'],
    title: 'Sour Cream Substitute',
    replacements: [
      'Plain Greek yogurt (1:1 swap — virtually indistinguishable in baking & dips).',
      'Cottage cheese blended smooth with 1 tbsp lemon juice.',
      'Mayonnaise (for cold dressings or baking).',
    ],
  },
  {
    keywords: ['butter'],
    title: 'Butter Substitute',
    replacements: [
      'For sautéing/cooking: Extra virgin olive oil, avocado oil, or ghee (use 3/4 the amount).',
      'For baking: Coconut oil (1:1) or unsweetened applesauce (replace half the butter).',
    ],
  },
  {
    keywords: ['egg', 'eggs'],
    title: 'Egg Substitute',
    replacements: [
      'For binding/baking: 1/4 cup unsweetened applesauce or 1/2 mashed ripe banana per egg.',
      '1 tbsp ground flaxseed or chia seeds + 3 tbsp water (let sit 5m to gel).',
      '1/4 cup plain Greek yogurt or silken tofu.',
      '3 tbsp aquafaba (liquid from canned chickpeas) for egg whites.',
    ],
  },
  {
    keywords: ['garlic', 'garlic clove', 'fresh garlic'],
    title: 'Garlic Substitute',
    replacements: [
      '1/8 tsp garlic powder per fresh clove.',
      '1/2 tsp granulated garlic per fresh clove.',
      '1/2 tsp minced jarred garlic.',
      '1 medium shallot (sweeter, delicate allium flavor).',
    ],
  },
  {
    keywords: ['shallot', 'shallots'],
    title: 'Shallot Substitute',
    replacements: [
      'Yellow/red onion + 1/4 minced garlic clove (1:1 ratio).',
      'Green onion / scallion whites (mild and fresh).',
    ],
  },
  {
    keywords: ['soy sauce', 'shoyu'],
    title: 'Soy Sauce Substitute',
    replacements: [
      'Tamari (gluten-free 1:1 swap).',
      'Coconut aminos (soy-free, slightly sweeter, lower sodium).',
      'Worcestershire sauce + splash of water (for rich savory depth).',
    ],
  },
  {
    keywords: ['fish sauce'],
    title: 'Fish Sauce Substitute',
    replacements: [
      'Equal parts soy sauce + Worcestershire sauce or minced anchovy paste.',
      'Soy sauce + a pinch of brown sugar and squeeze of lime.',
    ],
  },
  {
    keywords: ['parmesan', 'parmigiano', 'pecorino'],
    title: 'Parmesan Cheese Substitute',
    replacements: [
      'Pecorino Romano (sharper, saltier — reduce added salt).',
      'Grana Padano or Asiago (mild, nutty 1:1 swap).',
      'Nutritional yeast (dairy-free/vegan savory umami, 1:1).',
    ],
  },
  {
    keywords: ['cornstarch', 'corn flour'],
    title: 'Cornstarch Thickener Substitute',
    replacements: [
      'All-purpose flour (use 2 tbsp flour for every 1 tbsp cornstarch).',
      'Arrowroot powder or tapioca starch (1:1 swap, creates glossy sauce).',
    ],
  },
  {
    keywords: ['dijon mustard', 'dijon'],
    title: 'Dijon Mustard Substitute',
    replacements: [
      'Spicy brown mustard or whole grain mustard (1:1).',
      'Yellow mustard + 1/2 tsp white wine vinegar or lemon juice.',
      '1/2 tsp dry mustard powder + 1/2 tsp water.',
    ],
  },
  {
    keywords: ['lemon juice', 'fresh lemon'],
    title: 'Lemon Juice Substitute',
    replacements: [
      'Lime juice (1:1).',
      'White wine vinegar or apple cider vinegar (use half the amount to avoid harshness).',
      '1/2 tsp lemon zest or dry citric acid pinch.',
    ],
  },
  {
    keywords: ['fresh herbs', 'fresh basil', 'fresh oregano', 'fresh thyme', 'fresh rosemary'],
    title: 'Fresh to Dried Herb Conversion',
    replacements: [
      'Rule of thumb: 1 tbsp fresh herbs = 1 tsp dried herbs (1:3 ratio, since dried is concentrated).',
      'Add dried herbs early in cooking to release oils; add fresh herbs near the end.',
    ],
  },
]

// ── Kitchen Conversions ───────────────────────────────────────────────────────
const CONVERSIONS = [
  { pattern: /tablespoons?\s*(?:in|to)\s*(?:a\s*)?cup/i, answer: 'There are **16 tablespoons** in 1 standard measuring cup (8 fl oz).' },
  { pattern: /teaspoons?\s*(?:in|to)\s*(?:a\s*)?tablespoon/i, answer: 'There are **3 teaspoons** in 1 tablespoon.' },
  { pattern: /tablespoons?\s*(?:in|to)\s*(?:a\s*)?(?:half|1\/2)\s*cup/i, answer: 'There are **8 tablespoons** (or 1/2 stick of butter) in 1/2 cup.' },
  { pattern: /tablespoons?\s*(?:in|to)\s*(?:a\s*)?(?:third|1\/3)\s*cup/i, answer: 'There are **5 tablespoons + 1 teaspoon** in 1/3 cup.' },
  { pattern: /tablespoons?\s*(?:in|to)\s*(?:a\s*)?(?:quarter|1\/4)\s*cup/i, answer: 'There are **4 tablespoons** (or 1/4 stick of butter) in 1/4 cup.' },
  { pattern: /ounces?\s*(?:in|to)\s*(?:a\s*)?cup/i, answer: 'There are **8 fluid ounces** in 1 liquid measuring cup (approx 237 ml).' },
  { pattern: /grams?\s*(?:in|to)\s*(?:a\s*)?cup.*flour/i, answer: '1 level cup of all-purpose flour weighs approximately **120 to 125 grams** (spooned and leveled).' },
  { pattern: /grams?\s*(?:in|to)\s*(?:a\s*)?cup.*sugar/i, answer: '1 cup of granulated white sugar weighs approximately **200 grams**.' },
  { pattern: /grams?\s*(?:in|to)\s*(?:an?\s*)?ounce/i, answer: '1 ounce (oz) is equal to **28.35 grams**.' },
  { pattern: /stick.*butter/i, answer: '1 standard stick of butter = **1/2 cup = 8 tablespoons = 4 ounces = approx 113 grams**.' },
]

/**
 * Parses user input for actionable voice commands like timers, step navigation, or scaling.
 */
export function parseVoiceActionCommand(query: string, totalSteps: number, currentStep: number): VoiceActionCommand {
  const lower = query.toLowerCase().trim()

  // 1. Timer parsing: "set a 5 minute timer", "timer for 45 seconds", "3 min timer"
  const timerMinuteMatch = lower.match(/(?:set|start|add)?\s*(?:a\s*)?(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\s*(?:timer)?(?:\s*for\s*(.+))?/i)
  const timerSecondMatch = lower.match(/(?:set|start|add)?\s*(?:a\s*)?(\d+)\s*(?:sec|second|seconds)\s*(?:timer)?(?:\s*for\s*(.+))?/i)

  if (timerMinuteMatch && (lower.includes('timer') || lower.includes('minute') || lower.includes('min'))) {
    const mins = parseFloat(timerMinuteMatch[1])
    const label = timerMinuteMatch[2]?.trim() || `Step ${currentStep + 1} (${mins}m)`
    return {
      type: 'timer',
      timerLabel: label.slice(0, 24),
      timerSeconds: Math.round(mins * 60),
    }
  }

  if (timerSecondMatch && (lower.includes('timer') || lower.includes('second') || lower.includes('sec'))) {
    const secs = parseInt(timerSecondMatch[1], 10)
    const label = timerSecondMatch[2]?.trim() || `Step ${currentStep + 1} (${secs}s)`
    return {
      type: 'timer',
      timerLabel: label.slice(0, 24),
      timerSeconds: secs,
    }
  }

  // 2. Step navigation
  if (/\b(?:next\s*step|advance|forward|continue|done\s*with\s*this\s*step)\b/i.test(lower)) {
    return {
      type: 'step_next',
      targetStepIndex: Math.min(totalSteps - 1, currentStep + 1),
    }
  }

  if (/\b(?:previous\s*step|go\s*back|back\s*a\s*step|last\s*step)\b/i.test(lower)) {
    return {
      type: 'step_prev',
      targetStepIndex: Math.max(0, currentStep - 1),
    }
  }

  const gotoMatch = lower.match(/(?:go\s*to|jump\s*to|show\s*me)\s*(?:step\s*)?(\d+)/i)
  if (gotoMatch) {
    const stepNum = parseInt(gotoMatch[1], 10)
    if (stepNum >= 1 && stepNum <= totalSteps) {
      return {
        type: 'step_goto',
        targetStepIndex: stepNum - 1,
      }
    }
  }

  if (/\b(?:repeat\s*step|read\s*step|what\s*is\s*this\s*step|what\s*do\s*i\s*do|what\s*am\s*i\s*doing)\b/i.test(lower)) {
    return {
      type: 'read_step',
      targetStepIndex: currentStep,
    }
  }

  // 3. Portion scaling
  if (/\b(?:double\s*recipe|2x|double\s*portions?)\b/i.test(lower)) {
    return { type: 'scale', scaleValue: '2' }
  }
  if (/\b(?:half\s*recipe|0\.5x|cut\s*in\s*half)\b/i.test(lower)) {
    return { type: 'scale', scaleValue: '0.5' }
  }
  if (/\b(?:standard\s*recipe|1x|reset\s*scale)\b/i.test(lower)) {
    return { type: 'scale', scaleValue: '1' }
  }

  return { type: 'none' }
}

/**
 * Intelligent instant culinary responder that can answer substitutions, pan temps,
 * meat safety, conversions, troubleshooting, and ingredient questions offline or as instant fallback.
 */
export function resolveCulinaryQuery(query: string, context: RecipeCookingContext): string | null {
  const lower = query.toLowerCase().trim()
  const { recipeName, currentStepIndex, totalSteps, currentStepInstruction = '', allSteps = [], ingredients = [] } = context

  // 1. Navigation / Step queries
  if (/\b(?:what\s*is\s*step|read\s*step|current\s*step|where\s*am\s*i)\b/i.test(lower)) {
    const instr = currentStepInstruction || (allSteps[currentStepIndex]?.instruction ?? '')
    return `📖 **Step ${currentStepIndex + 1} of ${totalSteps} (${recipeName}):**\n\n"${instr}"`
  }

  if (/\b(?:what'?s\s*next|next\s*step|what\s*comes\s*next)\b/i.test(lower)) {
    if (currentStepIndex + 1 < totalSteps) {
      const nextInstr = allSteps[currentStepIndex + 1]?.instruction ?? 'Continue following the recipe instructions.'
      return `👉 **Next up is Step ${currentStepIndex + 2}:**\n\n"${nextInstr}"`
    }
    return `🎉 You're already on the final step (**Step ${totalSteps}**)! Once finished, tap **Finish & Complete Meal**.`
  }

  // 2. Ingredient measurement & lookup
  const ingMatch = lower.match(/(?:how\s*much|how\s*many|do\s*i\s*need|amount\s*of)\s+([a-z\s]+)/i)
  if (ingMatch) {
    const requested = ingMatch[1].replace(/\b(?:the|a|an|for|in|this|recipe|now)\b/g, '').trim()
    if (requested.length > 2) {
      const found = ingredients.find(
        (ing) => ing.name.toLowerCase().includes(requested) || (ing.rawText && ing.rawText.toLowerCase().includes(requested))
      )
      if (found) {
        return `🥣 For **${found.name}**, you need **${found.qty || 'as directed'}**${found.rawText ? ` (${found.rawText})` : ''}.`
      }
    }
  }

  if (/\b(?:what\s*ingredients|ingredient\s*list|what\s*do\s*i\s*need)\b/i.test(lower)) {
    if (ingredients.length > 0) {
      const list = ingredients.slice(0, 8).map((ing) => `• **${ing.name}**: ${ing.qty || 'to taste'}`).join('\n')
      return `📋 **Ingredients for ${recipeName}:**\n${list}${ingredients.length > 8 ? `\n*...and ${ingredients.length - 8} more on your Mise en Place shelf.*` : ''}`
    }
  }

  // 3. Conversions check
  for (const conv of CONVERSIONS) {
    if (conv.pattern.test(lower)) {
      return `📐 **Kitchen Conversion:**\n${conv.answer}`
    }
  }

  // 4. Meat temperature & doneness lookup
  for (const [meatKey, data] of Object.entries(MEAT_TEMPERATURES)) {
    const regex = new RegExp(`\\b${meatKey.replace('_', '\\s*')}\\b`, 'i')
    if (regex.test(lower)) {
      const name = meatKey.replace('_', ' ').toUpperCase()
      return `🌡️ **${name} Temperature & Doneness Guide:**\n• **Ideal Temp:** ${data.ideal}\n• **USDA Safe Minimum:** ${data.safe}\n• **Visual/Touch Cues:** ${data.cues}`
    }
  }

  // 5. Pan Heat & Stovetop Temperature
  if (/\b(?:pan\s*temp|how\s*hot|skillet\s*temp|stove\s*heat|burner\s*setting|heat\s*level)\b/i.test(lower)) {
    return `🔥 **Pan Heat Guidelines:**\n• **Low (225°–275°F):** Gentle sweating onions, melting butter/chocolate, slow simmering.\n• **Medium-Low (300°–325°F):** Sautéing garlic/aromatics, scrambled eggs (prevents burning).\n• **Medium (350°F):** Cooking chicken breasts through, pancakes, reductions.\n• **Medium-High (375°–400°F):** Searing shrimp, stir-fries, browning ground meat (oil should shimmer).\n• **High (425°F+):** Hard searing steaks, boiling water, wok cooking.`
  }

  // 6. Troubleshooting mistakes
  if (/\b(?:too\s*salty|salty|oversalted)\b/i.test(lower)) {
    return `🧂 **Fixing an Oversalted Dish:**\n1. **Dilute:** Add more unsalted liquid (broth, water, cream, or crushed tomatoes).\n2. **Acid:** A squeeze of fresh lemon juice or a splash of vinegar cuts through perceived saltiness.\n3. **Fat/Dairy:** Whisk in butter, heavy cream, or sour cream to coat the palate.\n4. **Bulk:** Add more unsalted starch or veggies (potatoes, cooked beans, rice).`
  }

  if (/\b(?:broke|broken\s*sauce|separated|curdled)\b/i.test(lower)) {
    return `🍳 **Fixing a Broken Sauce / Emulsion:**\n1. Take the pan off heat immediately.\n2. Whisk in **1 tablespoon of boiling water or cold cream** vigorously until it re-emulsifies.\n3. For hollandaise/mayo: Start with 1 egg yolk in a clean bowl and slowly whisk the broken sauce into it.`
  }

  if (/\b(?:too\s*spicy|too\s*hot|spiciness)\b/i.test(lower)) {
    return `🌶️ **Taming Too Much Spice:**\n1. **Dairy:** Stir in sour cream, Greek yogurt, heavy cream, or butter (capsaicin binds to milk fats).\n2. **Sweetness:** Add 1 tsp honey or brown sugar to counterbalance the heat.\n3. **Acid:** Add fresh lime or lemon juice.`
  }

  if (/\b(?:smoke|smoking|pan\s*burning|scorched)\b/i.test(lower)) {
    return `⚠️ **Pan Smoking / Scorching:**\n1. Lift pan off the heat source immediately.\n2. Add a splash of cool oil or broth to bring down the surface temperature.\n3. If aromatics (garlic) blackened, wipe out the pan and restart to avoid bitter flavor.`
  }

  // 7. Substitutions check
  for (const sub of COMMON_SUBSTITUTIONS) {
    if (sub.keywords.some((kw) => lower.includes(kw))) {
      const items = sub.replacements.map((r) => `• ${r}`).join('\n')
      return `🔄 **${sub.title}:**\n${items}`
    }
  }

  // 8. General culinary fallback
  return null
}
