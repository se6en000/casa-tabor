// Lifelike conversations (Jake, 2026-09-26: "more of a life like conversation with the AI vs
// just give it tasks"). Each is one person talking the way people do at the wall or into a
// phone: thinking out loud, small talk, questions and changes mixed together, dictation slips
// ("live" for Liv, "kelli" for Kelly), changing their mind mid-sentence, and "that one", "her",
// "the second one" pointing back at earlier turns. One fixed wording per turn, so both sides of
// a comparison hear exactly the same words. Bound to the family's real calendar at run time,
// read only; graded like the other situations (a card checked by content, or an answer graded
// on its gist against the day's real facts). Never tuned against.

const MISHEARD = { liv: 'live', emme: 'emmy', kelly: 'kelli', owen: 'owen', jake: 'jay', giselle: 'gisele' }
const misheard = (name) => MISHEARD[String(name).toLowerCase()] ?? String(name).toLowerCase()
const plusMinutes = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60e3).toISOString()

/** The local date `days` from now, with its weekday name. */
function dayFromNow(w, days) {
  const p = w.localParts(new Date(w.now.getTime() + days * 86400e3).toISOString())
  return { date: p.date, name: p.weekday }
}
const timedOn = (w, date) => w.byDay.get(date) ?? []

const card = {
  target: (id) => (c) => (c.args.id === id || c.args.event_id === id ? null : `changes ${c.args.id ?? c.args.event_id ?? 'nothing named'}, not the right event`),
  movedTo: (iso) => (c) => (c.args.start && Math.abs(Date.parse(c.args.start) - Date.parse(iso)) < 60e3 ? null : `start ${c.args.start ?? 'unchanged'}, wanted ${iso}`),
  startsAt: (hhmm, date) => (c, { world }) => {
    if (!c.args.start) return 'no start time'
    const p = world.localParts(c.args.start)
    if (p.hhmm !== hhmm) return `starts ${p.hhmm}, not ${hhmm}`
    if (date && p.date !== date) return `on ${p.date}, not ${date}`
    return null
  },
  withPeople: (names) => (c) => {
    const have = [...(c.args.members ?? []), ...(c.args.members_add ?? [])].map((n) => String(n).toLowerCase())
    const missing = names.filter((n) => !have.some((h) => h.includes(n.toLowerCase())))
    return missing.length ? `missing ${missing.join(', ')}` : null
  },
  placeLike: (re) => (c) => (re.test(`${c.args.location ?? ''} ${c.args.location_name ?? ''} ${c.args.address ?? ''}`) ? null : `place is "${c.args.location ?? c.args.address ?? ''}"`),
  driverIs: (name) => (c) => (JSON.stringify([c.args.driver_name, c.args.driver_leg1, c.args.driver_leg2]).toLowerCase().includes(name.toLowerCase()) ? null : `driver not ${name}`),
  itemLike: (re) => (c) => (re.test(JSON.stringify(c.args.items ?? c.args)) ? null : `items are ${JSON.stringify(c.args.items ?? c.args).slice(0, 80)}`),
}

export const LIFE = [
  {
    id: 'evening-at-the-wall',
    gist: 'Tired, at the end of the day: what’s tomorrow, who’s going, do they need a ride, hand it off, then groceries.',
    bind: (w) => {
      const tomorrow = dayFromNow(w, 1)
      const ev = timedOn(w, tomorrow.date).find((e) => e.people.length > 0)
      if (!ev) return null
      const other = w.parents.find((p) => !ev.drivers.includes(p.name)) ?? w.parents[1]
      if (!other) return null
      return {
        spoken: ev.spoken, eventId: ev.id, parent: other.name, parentHeard: misheard(other.name),
        facts: { tomorrow: `${tomorrow.name} ${tomorrow.date}`, onTomorrow: w.allOn(tomorrow.date), theEvent: { title: ev.title, starts: ev.local.hhmm, people: ev.people, drivers: ev.drivers, place: ev.place, driveIsPlanned: ev.hasTrip } },
      }
    },
    turns: [
      { say: ["hey. long day. what's tomorrow looking like"], expect: { card: 'none', answer: 'Tells what is on tomorrow (see facts: onTomorrow).' } },
      { say: ['wait who all is going to the {spoken} thing'], expect: { card: 'none', answer: 'Says who is on that event (see facts: theEvent.people).' } },
      { say: ['do they need a ride or is somebody already on it'], expect: { card: 'none', answer: 'About that same event: says who drives, or that no driver is set, or that no drive is planned (see facts: theEvent). Proposes no change.' } },
      {
        say: ['ugh ok have {parentHeard} take them'],
        expect: { either: [
          { card: 'update_event', checks: (b) => [card.target(b.eventId), card.driverIs(b.parent)] },
          { card: 'none', answer: 'Talks about making the named parent the driver of that same event (offers to, or asks to confirm).' },
        ] },
      },
      {
        say: ["thanks. oh and we're out of milk btw"],
        expect: { either: [
          { card: 'add_grocery_items', checks: () => [card.itemLike(/milk/i)] },
          { card: 'none', answer: 'Says milk was added (or will be added) to the grocery list.' },
        ] },
      },
    ],
  },
  {
    id: 'planning-the-week',
    gist: 'Thinking out loud about next week: the worst day, what’s on it, a change, then taking it back, then a question about it.',
    bind: (w) => {
      const days = [1, 2, 3, 4, 5, 6, 7].map((n) => dayFromNow(w, n)).map((d) => ({ ...d, events: timedOn(w, d.date) }))
      const busy = [...days].sort((a, b) => b.events.length - a.events.length)[0]
      if (!busy || busy.events.length < 2) return null
      const first = busy.events[0]
      return {
        busy: busy.name, firstId: first.id, movedTo: plusMinutes(first.start_time, 30),
        facts: {
          timedItemsPerDay: Object.fromEntries(days.map((d) => [`${d.name} ${d.date}`, d.events.length])),
          busiestDay: `${busy.name} ${busy.date}`, onBusiestDay: w.allOn(busy.date),
          firstThingThatDay: { title: first.title, starts: first.local.hhmm, place: first.place, drivers: first.drivers },
        },
      }
    },
    turns: [
      { say: ["i'm trying to get my head around next week. which day is gonna be the craziest"], expect: { card: 'none', answer: 'Names the busiest day (see facts: timedItemsPerDay / busiestDay; a day tied for busiest is fine) and roughly why.' } },
      { say: ['ok walk me through {busy}'], expect: { card: 'none', answer: 'Lists what is on that day (see facts: onBusiestDay).' } },
      { say: ['can the first one on that day start like a half hour later'], expect: { card: 'update_event', checks: (b) => [card.target(b.firstId), card.movedTo(b.movedTo)] } },
      { say: ["hmm no actually leave it, sorry, it's fine where it is"], expect: { card: 'none', answer: 'Acknowledges that nothing changes; the time stays as it was.' } },
      { say: ['what time do we have to leave for it though'], expect: { card: 'none', answer: 'About that same first event (see facts: firstThingThatDay): gives when to leave, or its start time and that the leave time isn’t known. Talks about no other event.' } },
    ],
  },
  {
    id: 'dictated-add-with-a-correction',
    gist: 'An add dictated with a correction mid-sentence, a vague place, a question about it, then another kid on it.',
    bind: (w) => {
      if (w.kids.length < 2) return null
      const day = dayFromNow(w, 3)
      return {
        kid: w.kids[0].name, kidHeard: misheard(w.kids[0].name), kid2: w.kids[1].name, kid2Heard: misheard(w.kids[1].name),
        day: day.name, date: day.date,
        facts: { date: `${day.name} ${day.date}`, alreadyOnThatDay: w.allOn(day.date), theNewItem: '3:30–4:30 PM, not saved yet' },
      }
    },
    turns: [
      { say: ['add a dentist appointment for {kidHeard} {day} at 3 no wait 3:30'], expect: { card: 'create_event', checks: (b) => [card.startsAt('15:30', b.date), card.withPeople([b.kid])] } },
      { say: ["it's the pediatric dentist over on okeechobee"], expect: { card: 'create_event', sameDraft: true, checks: (b) => [card.startsAt('15:30', b.date), card.placeLike(/pediatric|okeechobee/i)] } },
      { say: ['does that clash with anything that day'], expect: { card: 'none', answer: 'Says whether anything already on that day overlaps 3:30–4:30 PM (see facts: alreadyOnThatDay). Proposes no new change.' } },
      { say: ['oh and put {kid2Heard} on it too she needs a cleaning'], expect: { card: 'create_event', sameDraft: true, checks: (b) => [card.startsAt('15:30', b.date), card.withPeople([b.kid, b.kid2])] } },
    ],
  },
  {
    id: 'vague-about-a-kid',
    gist: 'Asking about a kid’s week, then “the second one” and “the first one” pointing back at the answer.',
    bind: (w) => {
      const until = dayFromNow(w, 8).date
      for (const kid of w.kids) {
        const hers = w.timed.filter((e) => e.local.date > w.todayLocal && e.local.date < until && e.people.includes(kid.name))
        if (hers.length >= 2) {
          return { kidHeard: misheard(kid.name), facts: { kid: kid.name, herThingsInOrder: hers.map((e) => ({ title: e.title, date: e.local.date, weekday: e.local.weekday, starts: e.local.hhmm, place: e.place ?? 'no place set' })) } }
        }
      }
      return null
    },
    turns: [
      { say: ["when's {kidHeard}s stuff next week"], expect: { card: 'none', answer: 'Lists that kid’s things in the coming week (see facts: herThingsInOrder), with days and times.' } },
      { say: ["wait what's the second one again, where is that"], expect: { card: 'none', answer: 'Names the second thing it just listed and where it is (see facts; “no place set” means it should say it doesn’t know).' } },
      { say: ['ok and remind me what time the first one starts'], expect: { card: 'none', answer: 'Gives the start time of the first thing it listed (see facts).' } },
    ],
  },
  {
    id: 'small-talk-then-a-reminder',
    gist: 'Small talk, a question, a reminder dictated loosely, a time added, then the whole thing called off.',
    bind: (w) => {
      const tomorrow = dayFromNow(w, 1)
      const monday = [1, 2, 3, 4, 5, 6, 7].map((n) => dayFromNow(w, n)).find((d) => d.name === 'Monday')
      return { tomorrow: tomorrow.name, mondayDate: monday.date, facts: { tomorrow: `${tomorrow.name} ${tomorrow.date}`, onTomorrow: w.allOn(tomorrow.date), nextMonday: monday.date } }
    },
    turns: [
      { say: ['hi casa! how are you doing today'], expect: { card: 'none', answer: 'A short friendly reply. Proposes no change and doesn’t read out the whole calendar unasked.' } },
      { say: ['i keep forgetting stuff lol. anything i need to remember for tomorrow morning'], expect: { card: 'none', answer: 'Tells what is on tomorrow morning (before noon) from the facts, or says there’s nothing then. Anything later that day may be mentioned too.' } },
      { say: ['oh yeah can you remind me to call the pediatrician monday morning'], expect: { card: 'create_event' } },
      { say: ['make it 9'], expect: { card: 'create_event', sameDraft: true, checks: (b) => [card.startsAt('09:00', b.mondayDate)] } },
      { say: ['ok actually forget the whole thing i just called them'], expect: { card: 'none', answer: 'Acknowledges that nothing was added.' } },
    ],
  },
]
