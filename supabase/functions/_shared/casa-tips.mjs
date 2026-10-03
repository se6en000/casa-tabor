// Tips, and "what can I say?" (FAMILY_WALL_PLAN.md P3.19 3c; rewritten Oct 3, 2026 — Jake: "update that list with any
// new examples of your capabilities … its a reminder to talk to you I would a human, not a robot with only defined
// phrases"). One list for the wall's band (a quiet line while it waits, one that fits while Casa thinks, and the whole
// list when he says "what can I say?"), Ask Casa on the phone, and "Casa, what can you do?". Each tip is said the way a
// person would say it, with what Casa does. `about`: words in a question that make the tip fit. `added`: when the ability
// arrived — the list marks the last two weeks' as new. Every new ability adds its tip here.
//
// Tips don't retire (Jake, Oct 3: "dont hide tips after I use them.. im a dumb human and need a lot of repeating").

export const CASA_TIPS = [
  { id: 'cal-natural', topic: 'Calendar', text: '“Giselle’s watching Owen 1:30 to 3:30 today” — say it however it comes out.', about: /\b(watch|babysit|sitter|add|put|schedule|book)\b/i },
  { id: 'cal-change', topic: 'Calendar', text: '“Push the green market out an hour” — then “actually, make it 4” changes the same card.', about: /\b(move|change|push|reschedule|later|earlier)\b/i },
  { id: 'cal-cancel', topic: 'Calendar', text: '“Cancel softball tonight, it rained” — Casa takes it off.', about: /\b(cancel|rain|off|delete|remove)\b/i },
  { id: 'cal-day', topic: 'Calendar', text: '“What’s on Saturday?” — the wall opens that day.', about: /\bwhat('s| is) on\b|\b(saturday|sunday|weekend|tomorrow|next week)\b/i },
  { id: 'drive-who', topic: 'Who’s driving', text: '“Kelly takes Liv Thursday” — Casa changes who drives.', about: /\b(drive|driving|ride|take|takes|pick up|pickup|drop off)\b/i },
  { id: 'drive-ask', topic: 'Who’s driving', text: '“Who’s picking up Emme tomorrow?” — ask anything about the week.', about: /\bwho('s| is)\b/i },
  { id: 'trip-add', topic: 'Trips', text: '“I’m in Dallas Wednesday to Thursday, flying” — Casa asks only what’s missing.', about: /\b(trip|travel|flying|flight|fly|hotel|away|out of town)\b/i },
  { id: 'groc-add', topic: 'Groceries', text: '“We’re out of milk and the good coffee” — straight on the list.', about: /\b(out of|milk|eggs|bread|grocer|store|need|list)\b/i, added: '2026-10-02' },
  { id: 'groc-show', topic: 'Groceries', text: '“Show me the grocery list” — the page opens.', about: /\b(grocery list|groceries|shopping list)\b/i, added: '2026-10-03' },
  { id: 'groc-recipe', topic: 'Groceries', text: '“What do I need for chicken tacos?” — then “put those on the list.”', about: /\b(recipe|dinner|cook|make|tacos?)\b/i },
  { id: 'todo-remind', topic: 'To do & plans', text: '“Remind me to call the vet tomorrow” — on your To do.', about: /\b(remind|reminder|to do|todo|call)\b/i },
  { id: 'todo-project', topic: 'To do & plans', text: '“Make a project for painting the house” — the steps come with it.', about: /\b(project|paint|renovat|fix up)\b/i },
  { id: 'todo-plan', topic: 'To do & plans', text: '“Let’s plan Emme’s costume” — talk it through, then one Agree.', about: /\b(plan|costume|party|idea)\b/i },
  { id: 'mem-tell', topic: 'Remember', text: '“Remember, Liv does debate on Thursdays” — Casa keeps it.', about: /\b(remember|always|every)\b/i },
  { id: 'mem-ask', topic: 'Remember', text: '“What do you know about Owen’s school?” — what Casa knows, and from where.', about: /\bwhat do you know\b|\bschool\b/i },
  { id: 'cu-rule', topic: 'Coming up', text: '“Give me five days’ notice for any spirit day” — every one from then on.', about: /\b(spirit|picture day|book fair|field trip|wear|theme|notice)\b/i },
  { id: 'cu-list', topic: 'Coming up', text: '“What’s coming up?” — what to get ready for, first things first.', about: /\b(coming up|ahead|prepare|ready)\b/i },
  { id: 'gift-save', topic: 'Coming up', text: '“Gift idea for Kelly: that ceramics class” — it comes back before her birthday.', about: /\b(birthday|anniversary|gift|present|christmas)\b/i },
  { id: 'mail-review', topic: 'Email', text: '“Anything from email?” — what came in, one at a time.', about: /\b(email|mail|inbox|school sent)\b/i },
  { id: 'mail-keep', topic: 'Email', text: '“Keep me posted on anything from Sally Rozanski.”', about: /\b(keep me posted|let me know|from)\b/i },
  { id: 'go-directions', topic: 'Getting around', text: '“Navigate to Alice’s house” — the route, on the screen.', about: /\b(navigate|directions|how do i get|address)\b/i },
  { id: 'go-time', topic: 'Getting around', text: '“How long to Bak right now?” — or “Will it rain during Liv’s game?”', about: /\b(how long|traffic|rain|weather|forecast)\b/i },
  { id: 'talk-more', topic: 'Talking to Casa', text: '“Thanks — oh, and we’re out of eggs.” Keep talking while the light is on.', about: null },
  { id: 'talk-close', topic: 'Talking to Casa', text: '“Never mind” drops a card; “that’s all” ends it.', about: /\b(cancel|never mind|stop|that's all)\b/i },
  { id: 'talk-help', topic: 'Talking to Casa', text: '“What can I say?” — this list, any time.', about: /\b(help|can you|what can)\b/i, added: '2026-10-03' },
]

const TOPICS = ['Calendar', 'Who’s driving', 'Trips', 'Groceries', 'To do & plans', 'Remember', 'Coming up', 'Email', 'Getting around', 'Talking to Casa']

/** New in the last two weeks: the list marks it. */
export function isNewTip(tip, now = new Date()) {
  return Boolean(tip.added) && now.getTime() - new Date(`${tip.added}T12:00:00`).getTime() < 14 * 86_400_000
}

/** "What can I say?": the tips by topic, in the order people think of them. */
export function tipsByTopic() {
  return TOPICS.map((topic) => ({ topic, tips: CASA_TIPS.filter((t) => t.topic === topic) }))
}

/** Counts the abilities a person just used, from what they said (kept for later; tips don't retire for now). */
export function noteTipUsage(usage, said) {
  const next = { ...(usage ?? {}) }
  for (const t of CASA_TIPS) if (t.about && t.about.test(String(said ?? ''))) next[t.id] = (next[t.id] ?? 0) + 1
  return next
}

/**
 * The tip to show: one that fits the question when there is one, else any — rotating by `seed`. Nothing retires
 * (Jake, Oct 3: "I need a lot of repeating for something to stick").
 */
export function pickTip({ question, seed = 0 }) {
  const fitting = CASA_TIPS.filter((t) => t.about && t.about.test(String(question ?? '')))
  const pool = fitting.length ? fitting : CASA_TIPS
  return pool[Math.abs(Math.trunc(seed)) % pool.length]
}

/** "What can I say?", "what can you do?" — the list on the screen rather than a question for Casa. */
export function asksForTips(said) {
  const s = String(said ?? '').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(hey )?(casa |alexa )?(so )?(what can i (say|ask)|what can you do|what else can you do|show me what i can say|what do you do)( again)?$/.test(s)
}
