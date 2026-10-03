import type { GroceryCategoryKey } from './groceryCategorization.ts'

// What a family says when they add groceries (Jake, Oct 2: "it messes up on a lot"): the common items and the aisle each
// is in, the words that describe an item ("canned", "frozen", "organic"), and the words an item ends in that take a
// food in front ("tuna fish", "turkey bacon", "chocolate chip muffins"). The voice parser splits what's said into items
// with these, and the aisle comes from the item itself. Plurals are matched either way ("banana" / "bananas").
// Scored by scripts/grocery-voice-eval.mjs.

const ITEMS: Record<Exclude<GroceryCategoryKey, 'other'>, string[]> = {
  produce: [
    'apple', 'banana', 'orange', 'grape', 'green grapes', 'red grapes', 'berries', 'blueberry', 'strawberry', 'raspberry', 'blackberry',
    'watermelon', 'cantaloupe', 'honeydew', 'melon', 'kiwi', 'mango', 'pineapple', 'papaya', 'peach', 'nectarine', 'plum', 'pear',
    'apricot', 'cherry', 'cherries', 'lemon', 'lime', 'grapefruit', 'clementine', 'cutie', 'mandarin', 'tangerine', 'pomegranate',
    'fig', 'dates', 'coconut', 'avocado', 'tomato', 'cherry tomatoes', 'grape tomatoes', 'roma tomatoes', 'onion', 'red onion',
    'yellow onion', 'white onion', 'sweet onion', 'green onion', 'scallion', 'shallot', 'leek', 'garlic', 'ginger', 'potato',
    'russet potatoes', 'red potatoes', 'gold potatoes', 'yukon gold potatoes', 'baby potatoes', 'sweet potato', 'yam', 'carrot',
    'baby carrots', 'celery', 'cucumber', 'zucchini', 'squash', 'yellow squash', 'butternut squash', 'spaghetti squash', 'pumpkin',
    'broccoli', 'broccolini', 'cauliflower', 'cabbage', 'red cabbage', 'brussels sprouts', 'asparagus', 'green beans', 'snap peas',
    'snow peas', 'peas', 'corn', 'corn on the cob', 'bell pepper', 'red pepper', 'green pepper', 'jalapeno', 'poblano', 'mushroom',
    'portobello', 'eggplant', 'artichoke', 'beet', 'radish', 'turnip', 'parsnip', 'okra', 'lettuce', 'romaine', 'romaine lettuce',
    'romaine hearts', 'iceberg lettuce', 'butter lettuce', 'spring mix', 'salad mix', 'bagged salad', 'arugula', 'spinach',
    'baby spinach', 'kale', 'chard', 'swiss chard', 'collard greens', 'bok choy', 'herbs', 'basil', 'fresh basil', 'cilantro',
    'parsley', 'dill', 'mint', 'rosemary', 'thyme', 'chives', 'sage', 'sprouts', 'bean sprouts', 'microgreens', 'fruit', 'vegetables',
    'veggies', 'salad', 'fruit cup', 'edamame pods', 'plantain', 'jicama', 'celery root', 'fennel', 'tomatillo',
  ],
  dairy: [
    'milk', 'whole milk', '2% milk', 'skim milk', 'low fat milk', 'chocolate milk', 'lactose free milk', 'oat milk', 'almond milk',
    'soy milk', 'coconut milk', 'rice milk', 'cashew milk', 'fairlife', 'egg', 'egg whites', 'butter', 'unsalted butter', 'salted butter',
    'margarine', 'cheese', 'cheddar', 'cheddar cheese', 'mozzarella', 'mozzarella cheese', 'fresh mozzarella', 'parmesan',
    'parmesan cheese', 'swiss cheese', 'provolone', 'provolone cheese', 'american cheese', 'pepper jack', 'monterey jack',
    'colby jack', 'gouda', 'brie', 'feta', 'feta cheese', 'goat cheese', 'blue cheese', 'ricotta', 'cottage cheese', 'cream cheese',
    'string cheese', 'shredded cheese', 'sliced cheese', 'cheese sticks', 'babybel', 'yogurt', 'greek yogurt', 'vanilla yogurt',
    'plain yogurt', 'yogurt cups', 'yogurt tubes', 'gogurt', 'yogurt drinks', 'kefir', 'sour cream', 'heavy cream',
    'heavy whipping cream', 'whipping cream', 'whipped cream', 'cool whip', 'half and half', 'coffee creamer', 'creamer', 'coffee mate',
    'buttermilk', 'ghee', 'pudding', 'pudding cups',
  ],
  meat: [
    'chicken', 'chicken breast', 'chicken breasts', 'chicken thighs', 'chicken legs', 'drumsticks', 'chicken wings', 'chicken tenders',
    'chicken cutlets', 'whole chicken', 'ground chicken', 'beef', 'ground beef', 'hamburger meat', 'ground turkey', 'ground pork',
    'steak', 'ribeye', 'sirloin', 'filet mignon', 'flank steak', 'skirt steak', 'strip steak', 't-bone steak', 'tbone steak',
    'brisket', 'roast', 'pot roast', 'chuck roast', 'short ribs', 'ribs', 'baby back ribs', 'pork', 'pork chops', 'pork tenderloin',
    'pork loin', 'pork shoulder', 'pulled pork', 'bacon', 'turkey bacon', 'sausage', 'italian sausage', 'breakfast sausage',
    'chicken sausage', 'bratwurst', 'brats', 'kielbasa', 'chorizo', 'hot dog', 'hot dogs', 'franks', 'hamburger', 'hamburgers',
    'burger', 'burgers', 'burger patties', 'turkey burgers', 'meatballs', 'lamb', 'lamb chops', 'veal', 'turkey', 'turkey breast',
    'fish', 'salmon', 'salmon fillets', 'tuna steak', 'tilapia', 'cod', 'halibut', 'mahi mahi', 'mahi', 'trout', 'barramundi',
    'snapper', 'grouper', 'swordfish', 'shrimp', 'scallops', 'crab', 'crab legs', 'lobster', 'lobster tails', 'mussels', 'clams',
    'oysters', 'calamari', 'tofu', 'tempeh',
  ],
  deli: [
    'deli meat', 'lunch meat', 'sandwich meat', 'deli turkey', 'sliced turkey', 'deli ham', 'sliced ham', 'ham', 'roast beef', 'salami', 'pepperoni',
    'prosciutto', 'bologna', 'pastrami', 'rotisserie chicken', 'chicken salad', 'tuna salad', 'egg salad', 'potato salad',
    'pasta salad', 'coleslaw', 'olives', 'pickles', 'hummus', 'guacamole', 'sushi', 'charcuterie', 'dip', 'queso',
  ],
  bakery: [
    'bread', 'white bread', 'wheat bread', 'whole wheat bread', 'sourdough', 'sourdough bread', 'rye bread', 'multigrain bread',
    'french bread', 'baguette', 'italian bread', 'ciabatta', 'brioche', 'challah', 'garlic bread', 'pita', 'pita bread', 'naan',
    'flatbread', 'bagel', 'english muffins', 'muffin', 'croissant', 'roll', 'dinner rolls', 'hawaiian rolls', 'bun', 'hamburger buns',
    'hot dog buns', 'slider buns', 'tortilla', 'flour tortillas', 'corn tortillas', 'wraps', 'donut', 'doughnut', 'cake', 'cupcakes',
    'pie', 'brownies', 'danish', 'scones', 'cinnamon rolls', 'biscuits', 'pizza dough', 'banana bread', 'breadsticks',
  ],
  frozen: [
    'ice cream', 'frozen yogurt', 'popsicle', 'ice pops', 'ice cream sandwiches', 'ice cream bars', 'gelato', 'sorbet', 'frozen pizza',
    'pizza', 'pizza rolls', 'bagel bites', 'frozen fries', 'french fries', 'fries', 'tater tots', 'hash browns', 'frozen vegetables',
    'frozen peas', 'frozen corn', 'frozen broccoli', 'frozen spinach', 'frozen berries', 'frozen fruit', 'frozen strawberries',
    'frozen blueberries', 'frozen mango', 'frozen cherries', 'frozen shrimp', 'fish sticks', 'chicken nuggets', 'dino nuggets',
    'frozen waffles', 'eggos', 'waffles', 'pancakes', 'frozen pancakes', 'frozen burritos', 'burritos', 'taquitos', 'egg rolls',
    'pot stickers', 'potstickers', 'dumplings', 'frozen meals', 'tv dinners', 'lean cuisine', 'frozen lasagna', 'lasagna', 'ravioli',
    'pie crust', 'cool whip', 'ice', 'bag of ice', 'riced cauliflower', 'cauliflower rice', 'edamame', 'orange chicken', 'uncrustables',
    'smoothie packs', 'acai bowls', 'mozzarella sticks', 'onion rings', 'corn dogs', 'protein waffles',
  ],
  pantry: [
    'pasta', 'spaghetti', 'penne', 'rigatoni', 'fusilli', 'rotini', 'linguine', 'fettuccine', 'angel hair', 'elbow macaroni',
    'macaroni', 'orzo', 'egg noodles', 'noodles', 'ramen', 'lasagna noodles', 'mac and cheese', 'macaroni and cheese', 'kraft mac and cheese',
    'rice', 'white rice', 'brown rice', 'jasmine rice', 'basmati rice', 'quinoa', 'couscous', 'oatmeal', 'oats', 'rolled oats',
    'cereal', 'cheerios', 'honey nut cheerios', 'frosted flakes', 'froot loops', 'rice krispies', 'raisin bran', 'granola', 'grits',
    'flour', 'sugar', 'brown sugar', 'powdered sugar', 'baking soda', 'baking powder', 'yeast', 'cornstarch', 'vanilla extract',
    'vanilla', 'chocolate chips', 'cocoa powder', 'sprinkles', 'cake mix', 'brownie mix', 'pancake mix', 'bisquick', 'frosting',
    'salt', 'pepper', 'black pepper', 'sea salt', 'kosher salt', 'garlic salt', 'garlic powder', 'onion powder', 'paprika',
    'smoked paprika', 'cumin', 'chili powder', 'cinnamon', 'nutmeg', 'oregano', 'italian seasoning', 'taco seasoning', 'bay leaves',
    'red pepper flakes', 'everything bagel seasoning', 'seasoning', 'spices', 'olive oil', 'extra virgin olive oil', 'vegetable oil',
    'canola oil', 'avocado oil', 'coconut oil', 'sesame oil', 'cooking spray', 'pam', 'vinegar', 'white vinegar', 'apple cider vinegar',
    'balsamic vinegar', 'red wine vinegar', 'rice vinegar', 'white wine vinegar', 'ketchup', 'mustard', 'dijon mustard', 'mayonnaise',
    'mayo', 'relish', 'bbq sauce', 'barbecue sauce', 'hot sauce', 'sriracha', 'soy sauce', 'teriyaki sauce', 'worcestershire sauce',
    'fish sauce', 'hoisin sauce', 'sweet chili sauce', 'salsa', 'pasta sauce', 'marinara', 'marinara sauce', 'pizza sauce',
    'alfredo sauce', 'pesto', 'tomato sauce', 'tomato paste', 'canned tomatoes', 'diced tomatoes', 'crushed tomatoes', 'salad dressing',
    'ranch', 'ranch dressing', 'italian dressing', 'caesar dressing', 'honey', 'maple syrup', 'syrup', 'agave', 'jam', 'jelly',
    'strawberry jam', 'grape jelly', 'peanut butter', 'almond butter', 'nutella', 'canned tuna', 'tuna', 'tuna fish', 'canned salmon',
    'canned chicken', 'sardines', 'anchovies', 'beans', 'black beans', 'pinto beans', 'kidney beans', 'chickpeas', 'garbanzo beans',
    'refried beans', 'baked beans', 'lentils', 'split peas', 'soup', 'chicken noodle soup', 'tomato soup', 'cream of mushroom soup',
    'broth', 'chicken broth', 'beef broth', 'vegetable broth', 'chicken stock', 'bouillon', 'taco shells', 'breadcrumbs',
    'panko', 'croutons', 'stuffing', 'gravy', 'canned corn', 'canned green beans', 'canned peaches', 'applesauce', 'apple sauce',
    'applesauce pouches', 'pickles', 'capers', 'olives', 'raisins', 'dried cranberries', 'craisins', 'dried fruit', 'nuts', 'almonds',
    'walnuts', 'pecans', 'cashews', 'peanuts', 'pistachios', 'sunflower seeds', 'chia seeds', 'flax seeds', 'sesame seeds',
    'coconut flakes', 'protein powder', 'nori', 'seaweed', 'rice nori seasoning', 'carnation instant breakfast', 'instant breakfast',
    'mac and cheese cups', 'cup noodles', 'jello', 'marshmallows', 'graham crackers', 'pie filling', 'condensed milk',
    'evaporated milk', 'coffee filters',
  ],
  beverages: [
    'water', 'bottled water', 'sparkling water', 'seltzer', 'seltzer water', 'la croix', 'lacroix', 'bubly', 'club soda', 'tonic water',
    'coconut water', 'juice', 'orange juice', 'apple juice', 'grape juice', 'cranberry juice', 'grapefruit juice', 'lemonade',
    'pineapple juice', 'juice boxes', 'capri sun', 'soda', 'coke', 'coca cola', 'diet coke', 'coke zero', 'pepsi', 'sprite',
    'ginger ale', 'root beer', 'dr pepper', 'mountain dew', 'gatorade', 'powerade', 'body armor', 'bodyarmor', 'vitamin water',
    'energy drinks', 'red bull', 'celsius', 'coffee', 'ground coffee', 'coffee beans', 'k cups', 'coffee pods', 'nespresso pods',
    'cold brew', 'iced coffee', 'espresso', 'tea', 'green tea', 'black tea', 'iced tea', 'sweet tea', 'herbal tea', 'tea bags',
    'kombucha', 'beer', 'ipa', 'wine', 'red wine', 'white wine', 'rose', 'prosecco', 'champagne', 'vodka', 'tequila', 'whiskey',
    'bourbon', 'rum', 'gin', 'hard seltzer', 'white claw', 'truly', 'hot chocolate', 'hot cocoa', 'protein shakes', 'smoothies',
    'liquid iv', 'pedialyte', 'milk boxes',
  ],
  snacks: [
    'chips', 'potato chips', 'tortilla chips', 'corn chips', 'pita chips', 'kettle chips', 'vinegar chips', 'salt and vinegar chips',
    'doritos', 'cheetos', 'fritos', 'lays', 'pringles', 'sun chips', 'pretzels', 'crackers', 'goldfish', 'cheez its', 'cheez-its',
    'ritz', 'ritz crackers', 'triscuits', 'wheat thins', 'graham crackers', 'animal crackers', 'popcorn', 'microwave popcorn',
    'granola bars', 'protein bars', 'kind bars', 'rx bars', 'nature valley', 'cliff bars', 'clif bars', 'fruit snacks', 'gummies',
    'gummy bears', 'fruit leather', 'trail mix', 'mixed nuts', 'beef jerky', 'jerky', 'rice cakes', 'veggie straws', 'pirate booty',
    'cookies', 'chocolate chip cookies', 'oreos', 'tates', 'tates cookies', 'chips ahoy', 'candy', 'chocolate', 'dark chocolate',
    'peanut butter cups', 'reeses', "reese's pieces", 'peppermint patties', 'm and ms', 'm&ms', 'skittles', 'snack packs', 'kids snacks',
    'rice crispy treats', 'rice krispie treats', 'pudding cups', 'applesauce cups', 'cheese crackers', 'nutter butters', 'teddy grahams',
    'snacks', 'pretzel snacks', 'seaweed snacks', 'dried mango', 'gum',
  ],
  household: [
    'paper towels', 'toilet paper', 'tissues', 'kleenex', 'napkins', 'paper plates', 'plastic cups', 'solo cups', 'plastic forks',
    'plastic utensils', 'trash bags', 'garbage bags', 'kitchen trash bags', 'aluminum foil', 'foil', 'plastic wrap', 'saran wrap',
    'parchment paper', 'wax paper', 'ziploc bags', 'ziplock bags', 'sandwich bags', 'gallon bags', 'freezer bags', 'storage bags',
    'dish soap', 'dawn', 'dishwasher pods', 'dishwasher detergent', 'cascade', 'sponges', 'sponge', 'scrub brush', 'laundry detergent',
    'tide', 'tide pods', 'detergent', 'fabric softener', 'dryer sheets', 'bleach', 'clorox wipes', 'disinfecting wipes', 'lysol',
    'all purpose cleaner', 'windex', 'glass cleaner', 'toilet bowl cleaner', 'cleaner', 'magic eraser', 'hand soap', 'soap', 'light bulbs',
    'batteries', 'aa batteries', 'aaa batteries', 'candles', 'matches', 'lighter', 'air freshener', 'fabuloso', 'swiffer pads',
    'vacuum bags', 'shop vac bags', 'coffee filters', 'water filter', 'tape', 'charcoal', 'propane',
  ],
  'personal-care': [
    'shampoo', 'conditioner', 'body wash', 'face wash', 'bar soap', 'deodorant', 'toothpaste', 'toothbrush', 'toothbrushes',
    'floss', 'mouthwash', 'razors', 'razor blades', 'shaving cream', 'lotion', 'body lotion', 'sunscreen', 'lip balm', 'chapstick',
    'cotton balls', 'q tips', 'q-tips', 'cotton swabs', 'band aids', 'bandaids', 'tylenol', 'advil', 'ibuprofen', 'motrin', 'vitamins',
    'multivitamins', 'allergy medicine', 'claritin', 'zyrtec', 'flonase', 'cough drops', 'cough medicine', 'miralax', 'visine',
    'contact solution', 'tampons', 'pads', 'hair ties', 'hairspray', 'hair gel', 'dry shampoo', 'nail polish remover', 'makeup remover',
    'hand sanitizer', 'melatonin',
  ],
  baby: [
    'diapers', 'pull ups', 'pull-ups', 'baby wipes', 'wipes', 'baby formula', 'formula', 'baby food', 'baby food pouches', 'pouches',
    'diaper cream', 'baby shampoo', 'baby lotion', 'sippy cups', 'pacifiers',
  ],
  pet: [
    'dog food', 'cat food', 'dry cat food', 'wet cat food', 'dry dog food', 'wet dog food', 'dog treats', 'cat treats', 'treats',
    'cat litter', 'kitty litter', 'litter', 'dog bones', 'bully sticks', 'chew toys', 'poop bags', 'dog poop bags', 'flea medicine',
    'hamster food', 'fish food', 'bird seed', 'temptations', 'greenies', 'delectables',
  ],
}

/** Words that describe an item in front of it: "canned salmon", "frozen corn", "organic strawberries". */
export const DESCRIBING_WORDS = new Set([
  // who it's for: "dog shampoo", "kids vitamins"
  'dog', 'cat', 'puppy', 'kitten', 'pet', 'toddler', 'kid', 'mens', 'womens', 'adult',
  'canned', 'frozen', 'fresh', 'organic', 'sliced', 'shredded', 'grated', 'diced', 'chopped', 'minced', 'crushed', 'ground',
  'whole', 'low', 'fat', 'nonfat', 'free', 'lowfat', 'reduced', 'unsalted', 'salted', 'plain', 'strawberry',
  'baby', 'large', 'small', 'big', 'mini', 'jumbo', 'extra', 'lean', 'boneless', 'skinless', 'smoked', 'roasted', 'raw', 'dried', 'dry',
  'sweet', 'spicy', 'mild', 'medium', 'hot', 'light', 'dark', 'white', 'brown', 'red', 'green', 'yellow', 'black', 'wheat', 'gluten',
  'diet', 'unsweetened', 'sweetened', 'instant', 'kids', 'family', 'size', 'flavored', 'italian', 'mexican', 'greek', 'french',
  'english', 'american', 'swiss', 'thin', 'thick', 'cut', 'sharp', 'aged', 'seedless', 'ripe', 'local', 'wild', 'farm', 'cage',
  'pasture', 'raised', 'grass', 'fed', 'blue', 'gold', 'golden', 'mixed', 'assorted', 'variety', 'pack', 'multigrain', 'sprouted', 'artisan', 'premium', 'store',
  'brand', 'generic', 'unscented', 'scented', 'sensitive', 'travel', 'cool', 'original', 'classic', 'natural', 'zero',
  'sparkling', 'still', 'iced', 'cold', 'decaf', 'caffeinated', 'protein', 'keto', 'vegan', 'plant', 'based', 'microwave', 'party',
  'snack', 'bite', 'sized', 'single', 'serve', 'individual', 'bulk', 'chunky', 'creamy', 'crunchy', 'smooth', 'everything',
])

/**
 * Words an item ends in that take a food in front — "tuna fish", "turkey bacon", "chocolate chip muffins", "beef jerky",
 * "cat treats" — so a food word before one is part of the item, not an item of its own.
 */
export const HEAD_WORDS = new Set([
  'juice', 'sauce', 'soup', 'bread', 'chips', 'chip', 'bars', 'bar', 'sticks', 'stick', 'nuggets', 'broth', 'stock', 'jerky', 'burgers',
  'burger', 'patties', 'sausage', 'sausages', 'bacon', 'cookies', 'cookie', 'muffins', 'muffin', 'cake', 'cakes', 'pie', 'pies',
  'salad', 'dressing', 'seasoning', 'powder', 'oil', 'butter', 'jam', 'jelly', 'spread', 'cereal', 'waffles', 'pancakes', 'noodles',
  'rolls', 'wraps', 'cups', 'bites', 'treats', 'snacks', 'food', 'crackers', 'cheese', 'yogurt', 'cream', 'popsicles', 'fillets',
  'fillet', 'steaks', 'wings', 'tenders', 'thighs', 'breasts', 'breast', 'slices', 'shells', 'mix', 'milk', 'water', 'tea', 'paste',
  'vinegar', 'syrup', 'extract', 'pods', 'bags', 'wipes', 'soap', 'detergent', 'cleaner', 'spray', 'sandwiches', 'pizza', 'fries',
  'tortillas', 'buns', 'bagels', 'meat', 'fish', 'salt', 'flakes', 'drink', 'drinks', 'shake', 'shakes', 'creamer', 'pouches', 'tubes',
  'bowls', 'cubes', 'strips', 'links', 'loaf', 'rice', 'pasta', 'beans', 'seeds', 'chunks', 'meatballs', 'dip', 'salsa', 'frosting',
  'pudding', 'candy', 'gummies', 'leaves', 'sprouts', 'greens', 'peppers', 'tomatoes', 'potatoes', 'onions', 'mushrooms', 'grapes',
  'drumsticks', 'legs', 'cutlets', 'tenderloin', 'loin', 'ribs', 'chops', 'roast', 'ham', 'pepperoni', 'sorbet', 'naan', 'oatmeal', 'beer', 'lemonade', 'pads', 'toys', 'liners', 'refills', 'filters', 'sheets',
  'pretzels', 'cream', 'hummus', 'granola', 'smoothie', 'smoothies', 'cupcakes', 'donuts', 'bagel', 'wrap', 'pasta',
])

/** Flavours: in front of anything that takes a food, staples too ("vanilla yogurt", "garlic bread", "honey ham"). */
export const FLAVORS = new Set([
  'vanilla', 'chocolate', 'strawberry', 'blueberry', 'raspberry', 'cherry', 'peach', 'mango', 'banana', 'apple', 'lemon', 'lime',
  'orange', 'coconut', 'almond', 'honey', 'maple', 'caramel', 'cinnamon', 'garlic', 'ginger', 'peanut', 'pumpkin', 'mint', 'cookie',
  'oat', 'cranberry', 'pineapple', 'watermelon', 'grape', 'berry', 'mocha', 'hazelnut', 'butterscotch', 'toffee', 'raisin',
])
/** Savoury fronts and proteins: in front of a word that takes a food, not a staple ("spinach dip", "turkey pepperoni"). */
export const FRONT_FOODS = new Set([
  'chicken', 'turkey', 'beef', 'pork', 'salmon', 'tuna', 'shrimp', 'fish', 'crab', 'veggie', 'vegetable', 'spinach', 'onion', 'potato',
  'tomato', 'cheddar', 'jalapeno', 'buffalo', 'bbq', 'ranch', 'teriyaki', 'pesto', 'mushroom', 'broccoli', 'corn', 'egg',
  'bean', 'black', 'cheese', 'pizza', 'taco', 'pretzel', 'tortilla', 'puppy', 'kitten',
])

/** Items that stand alone in a list — never the front of another ("milk bread" is milk and bread). */
export const STANDALONE = new Set(['milk', 'egg', 'eggs', 'bread', 'butter', 'water', 'beer', 'wine', 'soda', 'cereal', 'pasta', 'coffee', 'tea', 'juice', 'cheese', 'yogurt', 'salt', 'sugar', 'flour', 'rice', 'pepper'])

/** Flavours of more than one word, in front of an item: "peanut butter pretzels", "chocolate chip muffins". */
export const FLAVOR_PHRASES = new Set(['peanut butter', 'chocolate chip', 'cookies and cream', 'cookie and cream', 'salted caramel', 'pumpkin spice', 'cookie dough', 'birthday cake', 'mint chocolate', 'sour cream and onion', 'salt and vinegar', 'cinnamon raisin', 'apple cinnamon', 'honey nut', 'strawberry banana', 'mixed berry', 'lemon pepper', 'garlic parmesan', 'honey mustard', 'sweet chili', 'everything bagel', 'cinnamon sugar', 'brown sugar', 'maple brown sugar', 'sea salt', 'barbecue'])

/** One way to write a word or phrase for matching: lower case, plain letters, plurals folded ("cherries" → "cherry"). */
export function foldWord(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2)
  if (w.length > 4 && /(?:ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
  return w
}
export function foldPhrase(text: string): string {
  return text.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9% ]+/g, ' ').split(/\s+/).filter(Boolean).map(foldWord).join(' ')
}

/** Every known item, folded, with its aisle. */
export const VOCABULARY: Map<string, Exclude<GroceryCategoryKey, 'other'>> = (() => {
  const map = new Map<string, Exclude<GroceryCategoryKey, 'other'>>()
  for (const [aisle, names] of Object.entries(ITEMS) as Array<[Exclude<GroceryCategoryKey, 'other'>, string[]]>) {
    for (const name of names) {
      const key = foldPhrase(name)
      if (!map.has(key)) map.set(key, aisle)
    }
  }
  return map
})()

/** Items usually said in the plural ("chocolate chips"): said in the singular in front of another, they describe it. */
export const PLURAL_WRITTEN: Set<string> = new Set(
  Object.values(ITEMS).flat().filter((name) => /[^s]s$/.test(name)).map(foldPhrase),
)

/** The aisle an item ending in this word is in, when the item itself isn't known ("lemon bars", "chicken quesadillas"). */
export const HEAD_AISLE: Record<string, Exclude<GroceryCategoryKey, 'other'>> = {
  bar: 'snacks', bite: 'snacks', chip: 'snacks', cracker: 'snacks', cookie: 'snacks', gum: 'snacks', candy: 'snacks', popcorn: 'snacks', thin: 'bakery',
  nugget: 'frozen', quesadilla: 'frozen', burrito: 'frozen', waffle: 'frozen', fry: 'frozen', fries: 'frozen', pizza: 'frozen', sorbet: 'frozen', popsicle: 'frozen',
  muffin: 'bakery', bread: 'bakery', bagel: 'bakery', donut: 'bakery', roll: 'bakery', bun: 'bakery', cake: 'bakery', pie: 'bakery', tortilla: 'bakery', wrap: 'bakery', naan: 'bakery',
  yogurt: 'dairy', milk: 'dairy', cheese: 'dairy', butter: 'dairy', cream: 'dairy', creamer: 'dairy',
  juice: 'beverages', tea: 'beverages', coffee: 'beverages', water: 'beverages', soda: 'beverages', beer: 'beverages', lemonade: 'beverages',
  sauce: 'pantry', soup: 'pantry', seasoning: 'pantry', oil: 'pantry', vinegar: 'pantry', noodle: 'pantry', pasta: 'pantry', rice: 'pantry', cereal: 'pantry',
  syrup: 'pantry', jam: 'pantry', jelly: 'pantry', spread: 'pantry', dressing: 'pantry', sprinkle: 'pantry', salt: 'pantry',
  dip: 'deli', salad: 'deli', hummus: 'deli', meat: 'meat', sausage: 'meat', bacon: 'meat', wing: 'meat', thigh: 'meat', drumstick: 'meat',
  burger: 'meat', meatball: 'meat', treat: 'pet', shampoo: 'personal-care', vitamin: 'personal-care', soap: 'household', wipe: 'baby', roller: 'household',
}

/** Items with "and" in them, kept whole before a list is split on "and": "mac and cheese", "half and half". */
export const AND_ITEMS = [...VOCABULARY.keys()].filter((k) => / and /.test(k))

const FOOD_AISLES = new Set(['produce', 'dairy', 'meat', 'deli', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks'])
/** A food word: it can be the front of an item that ends in a head word ("turkey bacon", "apple juice"). */
export function isFoodWord(word: string): boolean {
  const aisle = VOCABULARY.get(foldWord(word))
  return Boolean(aisle && FOOD_AISLES.has(aisle))
}
