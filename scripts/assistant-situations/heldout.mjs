// Held-out phrasings: the same situations, said differently. Not used while fixing
// anything — only to check afterwards that the gist is handled, not the dev wordings.
export const HELDOUT = {
  'draft-place-then-time': [
    ['{kid} needs to see the dentist {day}, 3:30 in the afternoon — add that', 'dentist for {kid}, {day}, half past three'],
    ["location's {place}", "that's at {place} by the way"],
    ['hmm, four works better', 'switch that to 4:00'],
  ],
  'draft-add-person': [
    ['{kid} is getting a haircut {day} at 4, add it', 'haircut {day} 4 o clock for {kid}'],
    ['put {kid2} on that one also', 'oh {kid2} is going too'],
  ],
  'draft-dropped-for-question': [
    ['{kid} piano {day} 5pm', 'schedule piano for {kid} on {day} at five'],
    ['actually hold off on that — what time does {ev} begin {evDay}', 'wait never mind, {ev} on {evDay} starts when'],
  ],
  'read-then-another-day': [
    ['tell me about {dayA}', 'how does {dayA} look for us'],
    ['{dayB} too', 'same question for {dayB}'],
  ],
  'question-about-the-first-one': [
    ['go over {day} for me', "{day}'s plan?"],
    ['the first thing — who has it, driving wise', 'who is on driving duty for the earliest one'],
  ],
  'change-the-first-one': [
    ['{day}, what is on it', 'read me {day}'],
    ['bump the earliest one by 30 minutes', 'the first item, can it start half an hour later'],
  ],
  'kid-outing-then-handoff': [
    ['has somebody got {kid} covered for {spoken} {weekday}', "{weekday}'s {spoken} — who's driving {kid}"],
    ['{parent} could do it, right?', 'let {parent} handle that drive'],
  ],
  'where-is-it': [
    ["{kid}'s {spoken}, when's the next one", 'next {spoken} for {kid}?'],
    ['whats the location', 'where do we go for that'],
  ],
  'which-one-then-answer': [
    ['the thing I have {day}, make it 5 pm', 'change {day} to 5 o clock'],
    ['{secondTitle}', 'that would be {secondTitle}'],
  ],
  'draft-cancelled': [
    ['{kid} playdate {day} at 2 please', 'add playdate {day} 2pm {kid}'],
    ["don't bother with that", 'no, scrap it'],
  ],
}
