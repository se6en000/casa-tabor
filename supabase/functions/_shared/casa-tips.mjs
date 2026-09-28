// Tips while Casa thinks, and "What can I say?" (FAMILY_WALL_PLAN.md P3.19 3c). One list for the wall's
// band, Ask Casa on the phone, and "Casa, what can you do?". Each tip is one sentence with the words
// to say. `about`: words in a question that make the tip fit; `uses`: words that show the family
// already does it (twice, and the tip retires). Every new ability adds its own tip here.

export const CASA_TIPS = [
  { id: 'cal-add', topic: 'Calendar', text: '“Add the dentist for Emme Tuesday at 3:30” — then “make it 4” changes the same card.', about: /\b(add|put|schedule|book|appointment)\b/i, uses: /\b(add|schedule|book)\b.*\b(at|on|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i },
  { id: 'cal-move', topic: 'Calendar', text: '“Move Liv’s softball to 5” — change anything just by saying it.', about: /\b(move|change|reschedule|later|earlier)\b/i, uses: /\b(move|reschedule|push)\b/i },
  { id: 'cal-driver', topic: 'Calendar', text: '“Kelly takes Liv on Thursday” — Casa changes who drives.', about: /\b(drive|driving|ride|pick up|pickup|drop off|take)\b/i, uses: /\b(takes|drives|driving)\b/i },
  { id: 'cal-who', topic: 'Calendar', text: '“Who’s driving Owen tomorrow?” — ask anything about the week.', about: /\bwho('s| is| drives)?\b/i, uses: /\bwho('s| is)\b/i },
  { id: 'cu-rule', topic: 'Coming up', text: '“Any spirit day, give me 5 days” — Casa catches every one from then on.', about: /\b(spirit|picture day|book fair|field trip|wear|theme|school)\b/i, uses: /\b(any|every)\b.*\b(give me|days|notice)\b/i },
  { id: 'cu-add', topic: 'Coming up', text: '“Put the book fair on Coming up, Liv needs money” — anything that needs getting ready.', about: /\b(ready|prep|prepare|need to get|remember)\b/i, uses: /\bon (the )?coming up\b/i },
  { id: 'cu-list', topic: 'Coming up', text: '“What’s on Coming up?” — what to get ready for, first things first.', about: /\b(coming up|next week|this month|plan|ahead)\b/i, uses: /\bwhat('s| is) on coming up\b/i },
  { id: 'cu-snooze', topic: 'Coming up', text: '“Snooze Columbus Day a week” or “Veterans Day’s not needed.”', about: /\b(holiday|no school|snooze|later)\b/i, uses: /\b(snooze|not needed)\b/i },
  { id: 'cu-off', topic: 'Coming up', text: '“Stop flagging dentist” — Casa leaves those off Coming up.', about: /\b(dentist|doctor|appointment)\b/i, uses: /\b(stop flagging|never flag|stop putting)\b/i },
  { id: 'gift-save', topic: 'Gift ideas', text: 'Heard something they’d love? “Gift idea for Kelly: that ceramic class.”', about: /\b(birthday|anniversary|gift|present|christmas)\b/i, uses: /\bgift idea for\b/i },
  { id: 'gift-list', topic: 'Gift ideas', text: '“What gift ideas do I have for Carl?” — they come back with the birthday heads-up too.', about: /\b(birthday|gift|present)\b/i, uses: /\bgift ideas\b.*\?|what gift ideas/i },
  { id: 'groc-add', topic: 'Groceries & recipes', text: '“We’re out of milk” is enough — Casa offers to put it on the list.', about: /\b(out of|milk|eggs|bread|grocer|store|need)\b/i, uses: /\b(out of|we need|add .* to (the )?list)\b/i },
  { id: 'groc-recipe', topic: 'Groceries & recipes', text: '“What do I need for chicken tacos?” — then “put those on the list.”', about: /\b(recipe|dinner|cook|make)\b/i, uses: /\bwhat do i need for\b/i },
  { id: 'talk-keep', topic: 'Talking to Casa', text: 'While a card is up, just keep talking — no wake word needed.', about: null, uses: null },
  { id: 'talk-close', topic: 'Talking to Casa', text: '“Never mind” drops the card; “that’s all” ends the conversation.', about: /\b(cancel|never mind|stop)\b/i, uses: /\b(never mind|that's all|thats all)\b/i },
  { id: 'talk-photo', topic: 'Talking to Casa', text: 'Snap a flyer in Ask Casa on your phone — its dates come back as cards.', about: /\b(flyer|schedule|email|photo)\b/i, uses: null },
  { id: 'talk-help', topic: 'Talking to Casa', text: '“Casa, what can you do?” — or tap “What can I say?” for the whole list.', about: /\b(help|can you|how do i)\b/i, uses: /\bwhat can you do\b/i },
]

const TOPICS = ['Calendar', 'Coming up', 'Gift ideas', 'Groceries & recipes', 'Talking to Casa']

/** "What can I say?": the tips by topic, in the order people think of them. */
export function tipsByTopic() {
  return TOPICS.map((topic) => ({ topic, tips: CASA_TIPS.filter((t) => t.topic === topic) }))
}

/** Counts the abilities a person just used, from what they said. */
export function noteTipUsage(usage, said) {
  const next = { ...(usage ?? {}) }
  for (const t of CASA_TIPS) if (t.uses && t.uses.test(String(said ?? ''))) next[t.id] = (next[t.id] ?? 0) + 1
  return next
}

/**
 * The tip to show while Casa thinks: one that fits the question and hasn't been learned yet, else
 * any not yet learned (rotating by `seed`), else any at all.
 */
export function pickTip({ question, usage = {}, seed = 0 }) {
  const fresh = CASA_TIPS.filter((t) => (usage[t.id] ?? 0) < 2)
  const fitting = fresh.filter((t) => t.about && t.about.test(String(question ?? '')))
  const pool = fitting.length ? fitting : fresh.length ? fresh : CASA_TIPS
  return pool[Math.abs(Math.trunc(seed)) % pool.length]
}
