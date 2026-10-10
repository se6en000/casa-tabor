// Visual-test only (VITE_VISUAL_TEST_MODE): the Wall drawn from the fixed test
// fixture at the moment given by ?at=, for the screenshot guard (P2.6).
import { useCallback, useMemo, useState } from 'react'
import { withNotes } from '../../supabase/functions/_shared/event-notes.mjs'
import { isLedNight, wallLedMode } from './led'
import type { BandState } from './assistant'
import { ProfileSessionContext } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'
import { fixtureTurn, useFixtureSpeech } from './assistantFixture'
import WallAssistantBand from './WallAssistantBand'
import WallEmailReview from './WallEmailReview'
import { emailScene, fixtureEmailAct } from './assistantFixture'
import { useFixtureFonts } from './fixtureFonts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from './engine/dayPlan'
import { buildTrips, type TravelSettings } from './engine/travel'
import type { WallChore } from './engine/chores'
import { choreDoneKey } from './nextUp'
import type { WallEvent, WallMember } from './engine/types'
import WallView from './WallView'
import type { AheadProject, ComingUpItem, GiftIdea } from './comingUp'
import type { TodoProjectDetail } from './todos'
import { numbered, PAINT, pstep, summary, useFixtureTodos } from './todoFixture'
import { WallSpeechContext } from './speechContext'
import WallGroceriesFixture from './WallGroceriesFixture'
import { SEASONS } from '../../supabase/functions/_shared/coming-up.mjs'
import type { HandledItem } from './comingUp'
import type { ScoutPaper } from './useScout'
import type { TidyData, TidySuggestion } from './useTidy'
import type { Outing, TownNews } from '../../supabase/functions/_shared/scout.mjs'
import { withDriver } from './editing'
import { dayState, withDeparted, withDismissed, withHandOff, withoutDeparted, type WallTripState } from './tripState'
import { members as baseMembers, routines as schoolRoutines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import { driveEvents, tripEvents } from '../../tests/fixtures/wall-trip-2026-10-07.mjs'
import type { CasaTalkState } from './casaTalk'
import WallQuickAsk from './WallQuickAsk'
import { toImages } from './toImages'
import type { TypedImage } from './typeLine'
import type { FamilyRoutine } from '../lib/familyRoutines'
import { FIXTURE_DAY_OFFS, WORK_ROUTINES, seedKnown } from './routineFixture'
import { useFixtureHowWasIt } from './howWasItFixture'
import { LIST_DOSSIER, LIST_LIKE, LIST_PASSED, LIST_PLACES, LIST_WATCHES } from './guideFixture'

// School, and the parents' work hours (canvas 16a).
const routines = [...(schoolRoutines as unknown as FamilyRoutine[]), ...WORK_ROUTINES]

const WEATHER = { temp: 84, condition: 'Partly cloudy' }
// ?paper=1: the morning paper's words as the server writes them (canvas 48a); without it, the plain ones. A script can
// set window.__paperWords first to show a real day's words (design mocks).
const PAPER_WORDS = {
  headline: 'Spirit Day, and Giselle has both pickups.', deck: 'The rest is an ordinary Friday: Giselle collects Emme & Owen at 2:00 and Liv at 3:30.', sky: 'Warm and partly cloudy, 86° by two. A light jacket stays home.',
  // The morning brief (canvas 58), as the server writes it.
  brief: {
    turn: 'And a big Saturday coming.',
    today: [{ title: 'Nothing’s wrong', detail: 'Every run has a driver, and it stays dry until evening.' }, { title: 'Spirit Day', detail: 'Emme & Owen in school colors.' }],
    weekend: [{ title: 'Pack tonight', detail: 'Glove, cleats and water bottles for Saturday’s games — 4 of 5 still to do.' }, { title: 'Grandma, Saturday', detail: 'She’s here all day; the guest room isn’t ready.' }, { title: 'Decide one car or two', detail: 'Softball and baseball are both at Ferrin Park at 12:30.' }],
    month: [{ title: 'Halloween · 5 weeks', detail: 'Costumes for Emme & Owen take a few weekends — nothing started.' }],
    wayOut: [{ title: 'Thanksgiving · 8 weeks', detail: 'Flights fill early; book by mid-October.' }],
    forgot: { title: 'The treehouse — step 2 of 6', detail: 'Stalled since May. October is the best month to build: next, buy the lumber.' },
    feature: { label: 'Worth a try · date night', title: 'Ela Curry & Cocktails, in the MICHELIN Guide', detail: 'Indian, with a tiki bar on the patio. Next Friday evening is free.' },
    aside: 'Two games at 12:30 in one park: the Taborville Classic.',
  },
}
// ?paper=1 also brings the paper's Out & about and Around town (canvas 72), as the Scout's list returns them.
const OUTINGS = [
  { id: 'o1', kind: 'couple', title: 'Sunset Jazz on the Waterfront', inDays: 1, at: '19:00', recurring: null, place: 'Meyer Amphitheatre', why: 'A free evening concert by the water — Saturday evening looks free.', free: true },
  { id: 'o2', kind: 'couple', title: 'Art After Dark', inDays: null, at: null, recurring: 'Thursdays 5–9 PM', place: 'Norton Museum', why: 'The museum after hours, with music and a bar.', free: false },
  { id: 'o3', kind: 'family', title: 'Pumpkin Fest', inDays: 8, at: '11:00', recurring: null, place: 'Harbourside Place', why: 'Pumpkin patch, live music and trick-or-treating, for a good cause.', free: true, watch_id: 'w3' },
  { id: 'o4', kind: 'family', title: 'Clematis by Fright!', inDays: 13, at: '18:00', recurring: null, place: 'the Waterfront', why: 'Hayrides, games and trick-or-treating downtown.', free: true },
  { id: 'o5', kind: 'fitness', title: 'Rooftop Yoga at the Treehouse', inDays: null, at: null, recurring: 'Thursdays 6:30 PM', place: 'The Canopy, 6th floor', why: 'An hour of yoga with the city below.', free: false },
  { id: 'o6', kind: 'fitness', title: 'Pickleball open play', inDays: null, at: null, recurring: 'Mon, Wed, Fri 8:30 AM', place: 'Mandel Rec Center', why: 'First come, first served — bring a paddle.', free: true },
  { id: 'o9', kind: 'music', title: 'The Goodnicks', inDays: 0, at: '20:00', recurring: null, place: 'Centennial Square', why: 'classic rock · Clematis by Night', free: true, act: { known: 'no', plays: 'covers', genre: 'classic rock', standing: 'liked' } },
  { id: 'o10', kind: 'trivia', title: 'Live Trivia', inDays: null, at: null, recurring: 'Thursdays 7–9 PM', place: 'Newport Diner', why: 'free team trivia, real bar prizes', free: true },
  { id: 'o7', kind: 'restaurant', title: 'Celona', inDays: null, at: null, recurring: null, place: 'Celona', why: 'Restaurant & gin lounge — date-night quiet.', free: null, drive_min: 7, rating: 4.8, rating_count: 46, gem: true },
  { id: 'o8', kind: 'restaurant', title: 'Andino Spot', inDays: null, at: null, recurring: null, place: 'Andino Spot', why: 'Colombian — arepas worth a Saturday lunch.', free: null, drive_min: 4, rating: 5, rating_count: 134, gem: false },
  // What they watch for (canvas 86C): the Candlelight concerts they'd do again, Ballet Palm Beach they asked about.
  { id: 'w1a', kind: 'couple', title: 'Candlelight: A Haunted Evening', inDays: 29, at: '18:30', recurring: null, place: 'First Presbyterian Church, West Palm Beach', why: 'Halloween classics by candlelight. From $54.', free: null, watch_id: 'w1' },
  { id: 'w1b', kind: 'couple', title: 'Candlelight: Tribute to Queen', inDays: 71, at: '20:30', recurring: null, place: 'First Presbyterian Church, West Palm Beach', why: 'Queen by candlelight. From $44.', free: null, watch_id: 'w1' },
  { id: 'w1c', kind: 'couple', title: 'Candlelight: Tribute to Fleetwood Mac', inDays: 77, at: '20:30', recurring: null, place: 'First Presbyterian Church, West Palm Beach', why: 'Fleetwood Mac by candlelight. From $44.', free: null, watch_id: 'w1' },
  { id: 'w2a', kind: 'family', title: 'The Nutcracker', inDays: 70, at: '19:00', recurring: null, place: 'Kravis Center, West Palm Beach', why: 'Ballet Palm Beach’s Nutcracker, Dec 4–6. From $25.', free: null, watch_id: 'w2' },
] as const
const TOWN_NEWS = [
  { section: 'schools', headline: 'Free flu shots at school, Oct 28', line: 'Palm Beach Public’s clinic — Emme and Owen can get theirs there; the form is in the email.', source: 'Palm Beach Public', source_date: '2026-09-24', rank: 0 },
  { section: 'schools', headline: 'Detention days change at Bak', line: 'From December 1, after-school detentions only on the 1st and 3rd Wednesdays.', source: 'Bak Middle', source_date: '2026-09-22', rank: 1 },
  { section: 'schools', headline: 'PTO family portraits, Oct 16–18', line: 'Sign-up opens this week; the kids’ Spirit Day is Oct 30.', source: 'Palm Beach Public', source_date: '2026-09-21', rank: 2 },
  { section: 'city', headline: 'Referendum town hall moved', line: 'The District 7 town hall on the 2026 school referendum has a new date — worth hearing before November.', source: 'School District', source_date: '2026-09-23', rank: 0 },
  { section: 'city', headline: 'What’s on downtown this month', line: 'Clematis by Night every Thursday; Clematis by Fright on the 29th; the GreenMarket opens its season.', source: 'City of West Palm Beach', source_date: '2026-09-20', rank: 1 },
] as const

// `?tidy=1` (canvas 75): Alexa's tidy-up, Oct 8's real four; answers and Undo in memory (window.__tidy records them).
const TIDY_OPEN: TidySuggestion[] = [
  { id: 'tidy-copy', kind: 'copy', says: '“Look into box character project” is on twice, both at 9:17 AM today.', fix: 'Keep one — I’ll fold the second into the first.', choices: [{ key: 'yes', label: 'Merge them' }, { key: 'no', label: 'Keep both' }] },
  { id: 'tidy-step', kind: 'same_thing', says: '“Get Halloween decorations from storage.” (12:00 PM today) is your Halloween decorations project’s step “Get decorations from storage unit and test lights”.', fix: 'Make it that step, at 12:00 PM today.', choices: [{ key: 'yes', label: 'Make it the step' }, { key: 'no', label: 'Keep both' }] },
  { id: 'tidy-double', kind: 'step_double', says: '“Install Tesla charger in garage: Get quotes from licensed electricians” is on all day today and again at 3:00 PM.', fix: 'Keep the 3:00 PM one; take the all-day off.', choices: [{ key: 'yes', label: 'Clean it up' }, { key: 'no', label: 'Leave it' }] },
  { id: 'tidy-stuck', kind: 'stuck', says: '“Replace tire sensor” has been overdue since Sep 16.', fix: 'Sunday 10 AM is open — put it there?', choices: [{ key: 'yes', label: 'Sunday 10 AM' }, { key: 'done', label: 'Done already' }, { key: 'drop', label: 'Drop it' }] },
]

// No network in the fixture: saved places load empty and nothing is ever saved.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
seedKnown(queryClient)
// `?places=1` (canvas row 23): one saved place, as the picker would load it (queries are off in the fixture).
if (new URLSearchParams(window.location.search).get('places')) {
  queryClient.setQueryData(['saved_places'], [
    { id: 'p1', name: 'Royal Palm Beach Commons Park', aliases: [], address: '11600 Poinciana Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411', lat: 26.7, lng: -80.2, category: 'sports', notes: null, phone: null, google_place_id: null, confirmed: true, source: 'manual', occurrence_count: 4, last_seen_at: null, dismissed_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  ])
}
const CHECKLIST = [
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
  { id: 'c3', event_id: 'softball', label: 'Cleats', checked: false, sort_order: 3 },
  { id: 'c4', event_id: 'baseball', label: 'Glove', checked: false, sort_order: 1 },
  { id: 'c5', event_id: 'baseball', label: 'Cleats', checked: false, sort_order: 2 },
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
]

// Coming up (board 07a), shaped like the live list on 2026-09-27, dated from the fixture day.
const COMING_UP: Array<Omit<ComingUpItem, 'date' | 'pokeOn' | 'daysAway'> & { inDays: number; pokeIn: number }> = [
  // What's already set (canvas 66): on the calendar, a reminder for it.
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning appointment', nextStep: 'Make sure it works with work', inDays: 3, pokeIn: -4, late: true, onCalendar: true, reminder: { id: 'r-ac', title: 'Clear the closet for the AC tech', at: '2026-09-27T23:00:00.000Z', allDay: false } },
  { key: 'cu-columbus', kind: 'no_school', title: 'Columbus Day', nextStep: 'No school? Who’s with the kids', inDays: 15, pokeIn: 0, late: false },
  { key: 'cu-dentist', kind: 'appointment', title: 'Dentist (Dr. Ledakis)', nextStep: 'Make sure it works with work', inDays: 12, pokeIn: 5, late: false, onCalendar: true },
  { key: 'cu-forms', kind: 'deadline', title: 'Liv’s athletics forms due', nextStep: 'Get it done', inDays: 15, pokeIn: 6, late: false, onCalendar: true, reminder: { id: 'r-forms', title: 'Liv’s athletics forms', at: '2026-10-09T04:00:00.000Z', allDay: false } },
  { key: 'cu-carl', kind: 'birthday', title: 'Carl’s birthday', nextStep: 'Pick a gift', inDays: 68, pokeIn: 8, late: false, ideas: ['A fly-fishing reel'], reminder: { id: 'r-carl', title: 'Order Carl’s gift', at: '2026-12-01T14:00:00.000Z', allDay: false } },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving', nextStep: 'Hosting or going?', inDays: 60, pokeIn: 30, late: false },
]
// `?comingUp=projects` (P3.23, canvas 10e): a project's dated step on the list, with Open project.
const COMING_UP_PROJECTS: typeof COMING_UP = [
  { key: 'season:christmas_lights:2026', kind: 'season', title: 'Christmas lights', nextStep: 'Lights up before Thanksgiving', inDays: 61, pokeIn: 41, late: false, startable: true, plan: { steps: 7, minutes: 685, first: 'Storage unit run: the lights and wreaths' } },
  ...COMING_UP,
]
// The live list on the kiosk the night of 2026-09-27 (nine items; the fifth once ran under the week strip).
const COMING_UP_LIVE: typeof COMING_UP = [
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning Appointment', nextStep: 'Make sure it works with work', inDays: 3, pokeIn: -4, late: true },
  { key: 'cu-columbus', kind: 'no_school', title: 'Celebrate Columbus Day Holiday', nextStep: 'No school? Who’s with the kids', inDays: 17, pokeIn: 3, late: false },
  { key: 'cu-dentist', kind: 'appointment', title: 'Dentist (Dr. Ledakis)', nextStep: 'Make sure it works with work', inDays: 14, pokeIn: 7, late: false },
  { key: 'cu-cats', kind: 'outing', title: 'Cats & Dogs Exhibition Preview', nextStep: 'Tickets, and who’s going', inDays: 15, pokeIn: 7, late: false },
  { key: 'cu-forms', kind: 'deadline', title: 'Liv BAK Athletics Aktivate System Due', nextStep: 'Get it done', inDays: 17, pokeIn: 10, late: false },
  { key: 'cu-tryouts', kind: 'tryout', title: 'BAK Softball Tryouts', nextStep: 'Check what’s needed and who drives', inDays: 24, pokeIn: 10, late: false },
  { key: 'cu-carl', kind: 'birthday', title: 'Carl’s birthday', nextStep: 'Pick a gift', inDays: 70, pokeIn: 10, late: false, ideas: ['A fly-fishing reel'] },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving Day', nextStep: 'Hosting or going?', inDays: 62, pokeIn: 32, late: false },
  { key: 'cu-veterans', kind: 'no_school', title: 'Veterans Day', nextStep: 'No school? Who’s with the kids', inDays: 47, pokeIn: 33, late: false },
]
const IDEAS: GiftIdea[] = [{ id: 'gi-carl', for_name: 'Carl', idea: 'A fly-fishing reel' }, { id: 'gi-jebb', for_name: 'Jebb', idea: 'A soccer-team sweatshirt and T-shirt' }]

// To do (board 09b), shaped like Jake's sorted list on 2026-09-28.
const STEP_EVENT = new URLSearchParams(window.location.search).get('stepEvent') === '1'
// `?trip=1` (canvas 19): Jake's Dallas trip, Oct 7–8, his flights as the work email brought them in; he takes an hour
// at the airport and an Uber (his page's travel settings).
const TRIP = new URLSearchParams(window.location.search).get('trip') === '1'
const PAPER = new URLSearchParams(window.location.search).get('paper') === '1'
// `?chores=1`: the household chores as Jake listed them on Oct 1 (chores.ts).
const CHORE_LIST = new URLSearchParams(window.location.search).get('chores') === '1'
  ? [
    { id: 'trash', title: 'Trash to the street', member_id: 'jake-id', for_member_id: null, days_of_week: [1, 4], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
    { id: 'yard', title: 'Landscaping to the street', member_id: 'jake-id', for_member_id: null, days_of_week: [2], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
    { id: 'meds', title: 'Give Liv her meds', member_id: null, for_member_id: 'liv', days_of_week: [1, 2, 3, 4, 5], time_local: '19:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
  ]
  : []
// `?drive=1`: a work trip by car, Oct 13–15 (Orlando).
const DRIVE = new URLSearchParams(window.location.search).get('drive') === '1'
const members = TRIP
  ? baseMembers.map((m) => (m.id === 'jake-id' ? { ...m, travel_prefs: { airport_minutes: 60, way: 'uber' } } : m))
  : baseMembers

// The screenshots show Casa's keyboard, as on the kiosk; `?keyboard=device` shows a desktop's.
Object.assign(window, { __casaKeyboard: new URLSearchParams(window.location.search).get('keyboard') ?? 'screen' })

export default function WallFixturePage() {
  const fontsReady = useFixtureFonts()
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  // Trip decisions live in memory here (the real wall saves them to settings).
  const [tripState, setTripState] = useState<WallTripState>({})
  // The trip sheets' choices (canvas 19d), in memory here (the real wall keeps them in settings).
  const [travelSettings, setTravelSettings] = useState<Record<string, TravelSettings>>({})
  // Chores (canvas 20), saved in memory here.
  const [CHORES, setChores] = useState<WallChore[]>(CHORE_LIST as WallChore[])
  // Chores ticked for the day (canvas 27a/27c), in memory here; recorded for the tests.
  const [choreDone, setChoreDone] = useState<ReadonlySet<string>>(() => new Set())
  // `?nobody=1` (board 08a): Jake's portfolio review with nobody on it, as on 2026-09-28.
  const [evs, setEvs] = useState(() => [
    ...(events as unknown as WallEvent[]),
    ...(TRIP ? (tripEvents as unknown as WallEvent[]) : []),
    ...(DRIVE ? (driveEvents as unknown as WallEvent[]) : []),
    ...(new URLSearchParams(window.location.search).get('nobody') ? [{
      id: 'portfolio', title: 'Portfolio trigger review', start_time: new Date(2026, 8, 25, 9, 0).toISOString(), end_time: new Date(2026, 8, 25, 9, 30).toISOString(),
      all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [],
    } as unknown as WallEvent] : []),
    // `?far=1` (any day): the week around Sat, Oct 17 — weeks past the usual strip.
    ...(new URLSearchParams(window.location.search).get('far') ? [
      { id: 'far-dentist', title: 'Owen dentist', start_time: new Date(2026, 9, 15, 15, 30).toISOString(), end_time: new Date(2026, 9, 15, 16, 30).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'owen', role: 'primary' }] },
      { id: 'far-build', title: 'Emme’s build night', start_time: new Date(2026, 9, 17, 18, 0).toISOString(), end_time: new Date(2026, 9, 17, 20, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'emme', role: 'primary' }] },
      { id: 'far-market', title: 'Green Market', start_time: new Date(2026, 9, 18, 9, 0).toISOString(), end_time: new Date(2026, 9, 18, 11, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'kelly', role: 'primary' }] },
    ] as unknown as WallEvent[] : []),
    // `?home=1` (canvas 29): at home this afternoon — the plumber for the water heater (Jake), a video call (Kelly).
    ...(new URLSearchParams(window.location.search).get('home') ? [
      { id: 'home-plumber', title: 'Plumber · water heater', start_time: new Date(2026, 8, 25, 15, 15).toISOString(), end_time: new Date(2026, 8, 25, 16, 15).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }] },
      { id: 'home-call', title: 'Video call with Towid', start_time: new Date(2026, 8, 25, 16, 0).toISOString(), end_time: new Date(2026, 8, 25, 16, 30).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'kelly', role: 'primary' }] },
    ] as unknown as WallEvent[] : []),
    // `?gym=1` (canvas 27c): Kelly at the gym, 7 to 9:30 tonight.
    ...(new URLSearchParams(window.location.search).get('gym') ? [{
      id: 'kelly-gym', title: 'Gym', start_time: new Date(2026, 8, 25, 19, 0).toISOString(), end_time: new Date(2026, 8, 25, 21, 30).toISOString(),
      all_day: false, event_type: 'event', status: 'confirmed', location_name: 'Gym', address: '1500 N Flagler Dr, West Palm Beach, FL', members: [{ family_member_id: 'kelly', role: 'primary' }],
    } as unknown as WallEvent] : []),
    // `?stepEvent=1` (P3.23): a project step's all-day calendar event today.
    ...(STEP_EVENT ? [{
      id: 'ev-colours', title: 'Paint the house: Pick colours: 3 sample pots', start_time: '2026-09-25T00:00:00Z', end_time: '2026-09-25T23:59:59Z',
      all_day: true, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [],
    } as unknown as WallEvent] : []),
  ])
  const [checklist, setChecklist] = useState(CHECKLIST)
  const [dayOffs, setDayOffs] = useState<Array<(typeof FIXTURE_DAY_OFFS)[number] & { note?: string }>>(FIXTURE_DAY_OFFS)
  // `?talk=1` (canvas row 21): "Casa wants to talk to you", its state in memory; what reaches the phones is recorded.
  const [talkState, setTalkState] = useState<CasaTalkState>({})
  const casaTalk = new URLSearchParams(window.location.search).get('talk') === '1' ? {
    state: talkState,
    ready: true,
    save: async (change: CasaTalkState) => setTalkState((was) => ({ snoozed: { ...was.snoozed, ...change.snoozed }, pushed: { ...was.pushed, ...change.pushed } })),
    push: async (message: { title: string; body: string }) => { (window as unknown as { __casaPushed?: unknown[] }).__casaPushed = [...((window as unknown as { __casaPushed?: unknown[] }).__casaPushed ?? []), message] },
  } : null
  const plan = (date: Date) =>
    buildDayPlan({ date, members: members as WallMember[], routines, events: evs, tripState: dayState(tripState, date), travelSettings, chores: CHORES })
  const tripActions = {
    leaving: (ids: string[]) => setTripState((s) => withDeparted(s, day, ids, now)),
    undoLeaving: (ids: string[]) => setTripState((s) => withoutDeparted(s, day, ids)),
    handOff: async (trip: { id: string; source: string; sourceId: string }, driverId: string, date: Date = day) => {
      if (trip.source === 'routine') return setTripState((s) => withHandOff(s, date, trip.id, driverId))
      // Events: the driver goes on the trip plan, as the real save does.
      const name = members.find((m) => m.id === driverId)?.name ?? ''
      setEvs((list) => list.map((e) => (e.id === trip.sourceId
        ? { ...e, plan_override: { ...(e.plan_override ?? {}), transportation_plan: withDriver(e, e.plan_override?.transportation_plan as never, driverId, name) as never } }
        : e)))
    },
    dismiss: async (date: Date, key: string) => setTripState((s) => withDismissed(s, date, key)),
    // A school holiday's answers, in memory (holidays.ts).
    daysOff: async (ids: string[], ymd: string, note: string, until = ymd) => {
      const [y, m, d] = ymd.split('-').map(Number)
      const [uy, um, ud] = until.split('-').map(Number)
      setDayOffs((list) => [...list, ...ids.map((id) => ({ id: `off-${id}-${ymd}`, member_id: id, override_type: 'day_off', start_at: new Date(y, m - 1, d, 0, 0).toISOString(), end_at: new Date(uy, um - 1, ud, 23, 59).toISOString(), note }))])
    },
    cover: async (ids: string[], ymd: string, note: string) => setDayOffs((list) => list.map((o) => (ids.includes(o.member_id) && o.start_at.slice(0, 10) === ymd ? { ...o, note } : o))),
  }
  // The assistant band with a canned conversation (design section 06): `?band=add|change|which|answer`.
  const ledLog = ((window as unknown as { __led?: { mode: string; outcomes: string[] } }).__led ??= { mode: 'off', outcomes: [] })
  const recordLed = useCallback((b: { state: BandState; micOpen: boolean; closing?: boolean }) => {
    ledLog.mode = wallLedMode({ bandOpen: true, bandState: b.state, micOpen: b.micOpen, closing: b.closing, night: isLedNight(now), glowEnabled: true })
  }, [ledLog, now])
  const recordOutcome = useCallback((kind: 'confirm' | 'cancel') => { ledLog.outcomes.push(kind) }, [ledLog])
  const scene = new URLSearchParams(window.location.search).get('band')
  // `?quick=1&keyboard=device` (canvas 22c): Casa closed; typing or pasting anywhere opens it.
  const quickOn = new URLSearchParams(window.location.search).get('quick') === '1'
  const useTurn = useMemo(() => (scene ? fixtureTurn(scene) : quickOn ? fixtureTurn('empty') : null), [scene, quickOn])
  const [bandOpen, setBandOpen] = useState(Boolean(scene))
  const [opening, setOpening] = useState<{ text: string; nonce: number } | null>(null)
  const [staged, setStaged] = useState<{ text: string; images: TypedImage[]; nonce: number } | null>(null)
  const [talking, setTalking] = useState(false)
  const [assistantDraft, setAssistantDraft] = useState<WallEvent | null>(null)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<{ day?: string; todo?: boolean; nonce: number } | null>(() => (new URLSearchParams(window.location.search).get('open') === 'todo' ? { todo: true, nonce: 1 } : null))
  // Casa reads the email (canvas rows 14–15): `?email=1|posted|ask|textoff`.
  const emailOn = new URLSearchParams(window.location.search).has('email')
  const emailData = useMemo(() => emailScene(), [])
  const [emailOpen, setEmailOpen] = useState(false)
  const review = emailOn && emailOpen ? <WallEmailReview data={emailData} act={fixtureEmailAct} onClose={() => setEmailOpen(false)} today="2026-09-25" computer={new URLSearchParams(window.location.search).get('keyboard') === 'device'} /> : null
  const band = useTurn && bandOpen ? (
    <ProfileSessionContext.Provider value={{ profile: null, unlock: async () => {}, adopt: () => {}, signOut: () => {} }}>
      <WallAssistantBand
        listenNonce={0}
        events={evs as unknown as EventWithDetails[]}
        family={members as unknown as FamilyMember[]}
        onClose={() => setBandOpen(false)}
        onPointAt={setPointAt}
        onOpenEvent={() => setBandOpen(false)}
        onOpenPlace={() => setBandOpen(false)}
        onOpenDay={(date) => { setBandOpen(false); setOpenRequest({ day: date.toISOString(), nonce: Date.now() }) }}
        viaWake={new URLSearchParams(window.location.search).get('wake') === '1'}
        members={members as WallMember[]}
        planDay={(date, list) => buildDayPlan({ date, members: members as WallMember[], routines, events: list, tripState: dayState(tripState, date), travelSettings, chores: CHORES })}
        onDraft={setAssistantDraft}
        useTurn={useTurn}
        useSpeech={useFixtureSpeech}
        // The LED strip, as the wall would drive it (P3.14): recorded for the tests.
        onLed={recordLed}
        onOutcome={recordOutcome}
        onTalking={setTalking}
        lookupDrive={async () => 24}
        opening={opening}
        staged={staged}
      />
    </ProfileSessionContext.Provider>
  ) : null
  const ymd = (offset: number) => { const d = new Date(day); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const [outings, setOutings] = useState<Outing[]>(() => OUTINGS.map(({ inDays, at, ...o }) => ({
    address: null, url: `https://example.org/${o.id}`, drive_min: null, rating: null, rating_count: null, gem: false, status: 'new' as const, ...o,
    when: inDays == null ? null : `${ymd(inDays)} ${at}`,
  } as Outing)))
  // Not for us and We went take a place off, as the real list does (Oct 10: the next card slides in).
  const [goneIds, setGoneIds] = useState<string[]>([])
  // A script can set window.__scoutList (the Scout's real list) to show a real day (design mocks).
  const realList = (window as unknown as { __scoutList?: { outings: Outing[]; news: TownNews[]; today: string } }).__scoutList
  const scout: ScoutPaper | null = PAPER ? {
    outings: realList?.outings ?? outings, news: realList?.news ?? (TOWN_NEWS as unknown as TownNews[]), today: realList?.today ?? ymd(0),
    answer: (id, status) => setOutings((list) => (status === 'not_for_us' ? list.filter((o) => o.id !== id) : list.map((o) => (o.id === id ? { ...o, status } : o)))),
    // What its page says (canvas 77), as the scout function reads it — Taste-like for a ticketed one, a free one plainer.
    details: async (id) => (id === 'o1'
      ? { facts: [{ label: 'Tickets', text: 'Free — bring a blanket or lawn chair' }, { label: 'How long', text: '7–9:30 PM' }, { label: 'Good to know', text: 'Food trucks from 6; no coolers' }], not_said: ['For kids', 'Parking'], ticket_url: null, ends: '21:30', read_at: new Date(day).toISOString() }
      : id === 'o3'
        ? { facts: [{ label: 'Tickets', text: '$15 a car, kids under 12 free' }, { label: 'What’s in it', text: 'Pumpkin patch, hayrides, live music and trick-or-treating' }, { label: 'For kids', text: 'All ages; costumes welcome' }], not_said: ['Parking'], ticket_url: 'https://example.org/pumpkin-tickets', ends: '15:00', read_at: new Date(day).toISOString() }
        : null),
    guide: new URLSearchParams(window.location.search).get('guide') === '1' ? LIST_PLACES.filter((p) => !goneIds.includes(p.id)) : [],
    watches: LIST_WATCHES,
    // One of their spots on the calendar, the day after tomorrow.
    calendar: { g13: { next: ymd(2), last: null } },
    like: async () => LIST_LIKE,
    // A place, the whole story (canvas 90): a moment's read, as the scout's kept one comes back.
    dossier: async () => { await new Promise((r) => setTimeout(r, 150)); return LIST_DOSSIER },
    passed: new URLSearchParams(window.location.search).get('guide') === '1' ? LIST_PASSED : [],
    addPlace: async (p) => { ((window as unknown as { __added?: string[] }).__added ??= []).push(p.name) },
    answerPlace: (id, status) => {
      ((window as unknown as { __placed?: string[] }).__placed ??= []).push(`${id}:${status}`)
      if (status === 'not_for_us' || status === 'not_now' || status === 'been') setGoneIds((ids) => [...ids, id])
    },
    sendPlace: async (p) => { ((window as unknown as { __sent?: string[] }).__sent ??= []).push(p.name) },
    send: async (o) => { ((window as unknown as { __sent?: string[] }).__sent ??= []).push(o.title) },
  } : null
  const howWasIt = useFixtureHowWasIt(now)
  const [tidyOpen, setTidyOpen] = useState<TidySuggestion[]>(TIDY_OPEN)
  const tidy: TidyData | null = new URLSearchParams(window.location.search).get('tidy') === '1' ? {
    open: tidyOpen, through: ymd(3),
    answer: async (id, choice) => {
      ((window as unknown as { __tidy?: string[] }).__tidy ??= []).push(`${id}:${choice}`)
      setTidyOpen((list) => list.filter((t) => t.id !== id))
    },
    undo: async (id) => {
      ((window as unknown as { __tidy?: string[] }).__tidy ??= []).push(`${id}:undo`)
      setTidyOpen((list) => [...list, ...TIDY_OPEN.filter((t) => t.id === id)])
    },
  } : null
  const [comingUpItems, setComingUpItems] = useState<ComingUpItem[]>(() => ({ live: COMING_UP_LIVE, projects: COMING_UP_PROJECTS }[new URLSearchParams(window.location.search).get('comingUp') ?? ''] ?? COMING_UP).map(({ inDays, pokeIn, ...rest }) => ({ ...rest, date: ymd(inDays), pokeOn: ymd(pokeIn), daysAway: inDays })))
  const { todos, setProjects, setTodoList } = useFixtureTodos({ stepEvent: STEP_EVENT, twoInside: new URLSearchParams(window.location.search).get('twoInside') === '1', closedInside: new URLSearchParams(window.location.search).get('closedInside') === '1', detail: new URLSearchParams(window.location.search).get('nextUpDetail') === '1' })
  // A season started (canvas 11c): this year's project from the same starter plan the server uses.
  const start = async (key: string) => {
    const [, id, year] = key.split(':')
    const season = SEASONS.find((x) => x.id === id)
    if (!season?.template) return null
    const pid = `pr-${id}-${year}`
    const detail: TodoProjectDetail = {
      project: { ...PAINT.project, id: pid, title: season.title, aim_date: season.date(Number(year)), aim_firm: true, budget_cents: null, yearly: true, season_id: `${id}:${year}`, notes: null, created_at: now.toISOString(), people: [{ name: 'Me' }, { name: 'Kelly' }] },
      steps: numbered(season.template.map((t, i) => pstep(`${pid}-${i}`, t.grp, t.title, { minutes: t.minutes ?? null, repeat_minutes: t.repeat_minutes ?? null, repeat_count: t.repeat_count ?? null, repeat_unit: t.repeat_unit ?? null }))),
      parent: null,
      others: [],
    }
    setProjects((all) => ({ ...all, [pid]: detail }))
    setTodoList((l) => ({ ...l, projects: [...l.projects, summary(detail)] }))
    setComingUpItems((list) => list.map((i) => (i.key === key ? { ...i, startable: false, projectId: pid, nextStep: `A project · 0 of ${detail.steps.length}` } : i)))
    return pid
  }
  const [ideas, setIdeas] = useState(IDEAS)
  // Ahead's ✓s on the timeline: one handled (by Alexa, linked) in the fixture; a ✓ in the test adds its own (canvas 64).
  const [handled, setHandled] = useState<HandledItem[]>(() => [{ key: 'h-columbus', title: 'Columbus Day', date: ymd(5), text: 'Giselle has them · days off set', eventId: null, by: 'alexa', at: new Date().toISOString() }])
  // `?comingUp=projects` (canvas 68–69B): the projects as the server groups them — one card each above the timeline.
  const projects: AheadProject[] = new URLSearchParams(window.location.search).get('comingUp') === 'projects' ? [
    { key: 'project:pr-paint', projectId: 'pr-paint', title: 'Paint the house', done: 1, total: 5, left: 4, next: { title: 'Choose the painter and book dates', date: ymd(15) }, target: null, from: ymd(15), to: ymd(29), date: ymd(29) },
    { key: 'project:pr-xmas', projectId: 'pr-xmas', title: 'Replace the master bathroom floor and the shower glass', done: 3, total: 8, left: 5, next: { title: 'Red yarn wig', date: ymd(20) }, target: ymd(36), from: ymd(20), to: ymd(34), date: ymd(36) },
  ] : []
  const comingUp = { items: comingUpItems, projects, ideas, today: ymd(0), handled,
    act: async (key: string, action: string, extra?: { outcome?: { text: string; title: string; date: string } }) => {
      const it = comingUpItems.find((i) => i.key === key)
      setComingUpItems((list) => list.filter((i) => i.key !== key))
      if (action === 'done' && it) setHandled((h) => [...h, { key, title: it.title, date: it.date, text: extra?.outcome?.text ?? 'Marked handled', eventId: null, by: 'you', at: new Date().toISOString() }])
      ;(window as unknown as { __aheadActs?: unknown[] }).__aheadActs = [...((window as unknown as { __aheadActs?: unknown[] }).__aheadActs ?? []), { key, action, extra }]
      return action === 'dismiss' ? 'fall festival' : null
    },
    start,
    editIdea: async (id: string, idea: string | null) => setIdeas((list) => (idea == null ? list.filter((g) => g.id !== id) : list.map((g) => (g.id === id ? { ...g, idea } : g)))) }
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(day); d.setDate(d.getDate() + i); return plan(d) })
  // Nothing until every font weight is in, so screenshots never catch a fallback face.
  if (!fontsReady) return null
  if (new URLSearchParams(window.location.search).get('grocery') === '1') {
    return (
      <MemoryRouter>
        <WallSpeechContext.Provider value={useFixtureSpeech}>
          <div data-testid="wall-fixture" className="relative h-[1080px] w-[1920px]"><WallGroceriesFixture /></div>
        </WallSpeechContext.Provider>
      </MemoryRouter>
    )
  }
  return (
    <QueryClientProvider client={queryClient}>
    <MemoryRouter>
    <Routes>
    <Route path="/calendar" element={<div data-testid="fixture-calendar">Calendar page</div>} />
    <Route path="/wall/grocery" element={<div data-testid="fixture-grocery">Grocery page</div>} />
    <Route path="*" element={
    <WallSpeechContext.Provider value={useFixtureSpeech}>
    <div data-testid="wall-fixture" className="relative h-[1080px] w-[1920px]">
      <WallView paper={PAPER ? ((window as unknown as { __paperWords?: typeof PAPER_WORDS }).__paperWords ?? PAPER_WORDS) : null} refreshPaper={PAPER ? async () => { (window as unknown as { __refreshed?: number }).__refreshed = ((window as unknown as { __refreshed?: number }).__refreshed ?? 0) + 1 } : undefined} scout={scout} tidy={tidy} howWasIt={howWasIt} now={now} members={members as WallMember[]} today={plan(day)} tomorrow={plan(next)} currentWeather={WEATHER} checklist={checklist} allEvents={evs} routines={routines} dayOffs={dayOffs} tripStateFor={(date) => dayState(tripState, date)} tripActions={tripActions} week={week} aroundEvents={evs} openRequest={openRequest} emailCount={emailOn ? emailData.count : 0} onOpenEmail={emailOn ? () => setEmailOpen(true) : undefined} onAsk={(say) => { (window as unknown as { __asked?: string | null }).__asked = typeof say === 'string' ? say : null }} overlay={review ?? band} busy={Boolean(review) || (Boolean(band) && talking)} pointAt={band ? pointAt : null} assistantDraft={band ? assistantDraft : null} deleteEvent={async (event) => setEvs((list) => list.filter((e) => e.id !== event.id))}
        createEvent={async (args) => { ((window as unknown as { __created?: Record<string, unknown>[] }).__created ??= []).push(args); setEvs((list) => [...list, {
          id: `added-${list.length}`, title: String(args.title), event_type: String(args.event_type), all_day: false,
          start_time: String(args.start), end_time: String(args.end),
          location_name: (args.location as string) ?? null, address: (args.location as string) ?? null,
          members: (args.members as string[]).map((name) => ({ family_member_id: (members as WallMember[]).find((m) => m.name === name)?.id ?? name, role: 'attendee' })),
        } as unknown as WallEvent]) }} travelTrips={buildTrips(evs, members as WallMember[], {}, travelSettings)} chores={CHORES} saveChore={async (chore) => setChores((list) => (chore.id ? list.map((c) => (c.id === chore.id ? chore : c)) : [...list, { ...chore, id: `new-${list.length}` }]))} deleteChore={async (id) => setChores((list) => list.filter((c) => c.id !== id))} saveTravel={async (key, change) => setTravelSettings((all) => ({ ...all, [key]: { ...(all[key] ?? {}), ...change } }))} toggleChecklist={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))} saveNotes={async (event, notes) => setEvs((list) => list.map((e) => (e.id === event.id ? { ...e, description: withNotes((e as { description?: string | null }).description, notes) } : e)))} addChecklist={async (eventId, label) => setChecklist((list) => [...list, { id: `added-${list.length}`, event_id: eventId, label, checked: false, sort_order: 1 + Math.max(-1, ...list.filter((i) => i.event_id === eventId).map((i) => i.sort_order)) }])} comingUp={comingUp} todos={todos} casaTalk={casaTalk} choreDone={choreDone} tickChore={async (id, date, done) => {
          const key = choreDoneKey(id, date)
          ;(window as unknown as { __choreTicks?: string[] }).__choreTicks = [...((window as unknown as { __choreTicks?: string[] }).__choreTicks ?? []), `${done ? '+' : '-'}${key}`]
          setChoreDone((was) => { const next = new Set(was); if (done) next.add(key); else next.delete(key); return next })
        }} />
      {quickOn && (
        <WallQuickAsk
          enabled={!bandOpen}
          onSend={(text) => { setOpening({ text, nonce: Date.now() }); setBandOpen(true) }}
          onPasteFiles={(files) => void toImages(files).then((images) => { setStaged({ text: '', images, nonce: Date.now() }); setBandOpen(true) })}
        />
      )}
    </div>
    </WallSpeechContext.Provider>
    } />
    </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  )
}
