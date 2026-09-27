// The rest of layer 2 (P3.17): what the old path did besides the calendar — weather, drive
// times, contacts, groceries, recipes, the web — so version D is checked on each before the old
// path goes. Bound to the family's real data (read only); graded like the other sets. Lookups
// that change by the hour (weather, the web) are graded on giving a real answer, not a refusal.

const card = {
  itemIs: (id) => (c) => (c.args.item_id === id ? null : `item ${c.args.item_id ?? 'none'}, not the one asked about`),
  items: (min) => (c) => ((c.args.items ?? []).length >= min ? null : `only ${(c.args.items ?? []).length} item(s)`),
}

export const ABILITIES = [
  {
    id: 'weather-then-another-day',
    gist: 'The weather for a day, then the next day, in plain words.',
    bind: (w) => ({ facts: { today: w.todayLocal, note: 'Forecasts change; grade on a real forecast for the day asked, not on exact numbers.' } }),
    turns: [
      { say: ['is it gonna rain tomorrow'], expect: { card: 'none', answer: 'Gives a weather forecast for tomorrow (rain or not). Does not say it can’t check the weather.' } },
      { say: ['and the day after'], expect: { card: 'none', answer: 'Gives a weather forecast for the day after tomorrow. Does not say it can’t check the weather.' } },
    ],
  },
  {
    id: 'drive-time-to-an-event',
    gist: 'How long the drive is to a place on the calendar.',
    bind: (w) => {
      const ev = w.timed.find((e) => e.local.date > w.todayLocal && e.place && e.spoken.length > 3)
      return ev ? { spoken: ev.spoken, facts: { event: ev.title, place: ev.address ?? ev.place, note: 'Grade on giving a drive time in minutes to that place; exact minutes vary with traffic.' } } : null
    },
    turns: [
      { say: ["how long's the drive to {spoken}"], expect: { card: 'none', answer: 'Gives a drive time (in minutes) to that event’s place. Does not say it can’t tell.' } },
    ],
  },
  {
    id: 'a-contacts-number',
    gist: 'A saved contact’s phone number.',
    bind: (w) => {
      const c = w.contacts.find((x) => x.phone && x.relationship && x.relationship !== 'contact' && x.name.split(' ').length <= 4)
      return c ? { who: c.name, facts: { contact: c.name, phone: c.phone, relationship: c.relationship } } : null
    },
    turns: [
      { say: ["what's the number for {who}"], expect: { card: 'none', answer: 'Gives that contact’s phone number (see facts).' } },
    ],
  },
  {
    id: 'grocery-check-then-remove',
    gist: 'Checking an item off the grocery list, then removing it instead.',
    bind: (w) => {
      const g = w.groceries.find((x) => !x.checked && x.name.split(' ').length <= 3)
      return g ? { item: g.name.toLowerCase(), itemId: g.id } : null
    },
    turns: [
      { say: ['check off the {item}'], expect: { card: 'check_grocery_item', checks: (b) => [card.itemIs(b.itemId)] } },
      { say: ['actually just take it off the list'], expect: { card: 'remove_grocery_item', checks: (b) => [card.itemIs(b.itemId)] } },
    ],
  },
  {
    id: 'recipe-then-shopping',
    gist: 'What a saved recipe needs, then those things onto the grocery list.',
    bind: (w) => {
      const r = w.recipes.find((x) => x.ingredients >= 5 && x.name.length < 40)
      return r ? { recipe: r.name.toLowerCase(), facts: { recipe: r.name, ingredient_count: r.ingredients } } : null
    },
    turns: [
      { say: ['what do i need for the {recipe}'], expect: { card: 'none', answer: 'Lists ingredients from that saved recipe. Does not say it has no such recipe.' } },
      { say: ['ok put those on the grocery list'], expect: { either: [{ card: 'add_grocery_items', checks: () => [card.items(2)] }] } },
    ],
  },
  {
    id: 'something-on-the-web',
    gist: 'A question only the web can answer.',
    bind: () => ({ facts: { note: 'Grade on a real, specific answer from the web (hours or open/closed), not a refusal.' } }),
    turns: [
      { say: ['is the Target on Okeechobee open tomorrow morning'], expect: { card: 'none', answer: 'Says whether that Target is open tomorrow morning, with hours. Does not say it can’t look it up.' } },
    ],
  },
]
