import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDayPlan } from './engine/dayPlan'
import type { WallEvent } from './engine/types'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useWakeWord } from '../hooks/useWakeWord'
import type { FamilyMember } from '../types'
import WallAssistantBand from './WallAssistantBand'
import { useWallLed } from './useWallLed'
import { addChecklistItem, toggleChecklistItem, useEventChecklist } from './useWallChecklist'
import { deleteChore, saveChore } from './saveChore'
import { setChoreDone, useChoreDone } from './useChoreDone'
import { useFamilyDay } from './useFamilyDay'
import { createEventByTouch } from './createEvent'
import { saveEventNotes } from './saveNotes'
import WallView from './WallView'
import { useComingUp } from './useComingUp'
import { useTodos } from './useTodos'
import { useEmailOffers } from './useEmailOffers'
import WallEmailReview from './WallEmailReview'
import { deviceKeyboardHere } from './keyboardMode'
import { useCasaTalk } from './useCasaTalk'
import WallQuickAsk from './WallQuickAsk'
import { toImages } from './toImages'
import { useMorningPaper } from './useMorningPaper'
import { briefFacts } from './paper'
import type { TypedImage } from './typeLine'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  // A far day on show (dayFocus.ts): its week is loaded so it can be swiped through.
  const [aroundDay, setAroundDay] = useState<Date | null>(null)
  const onFocusDay = useCallback((date: Date | null) => setAroundDay((was) => (was?.toDateString() === date?.toDateString() ? was : date)), [])
  const { now, members, today, tomorrow, week, allEvents, aroundEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient, saveTravel, travel, chores } = useFamilyDay({ kind: 'wall' }, aroundDay)
  const choreDone = useChoreDone(now)
  const { data: currentWeather } = useHomeWeather()

  // The assistant band: the mic button or the wake word (heard on the Pi) opens it and starts listening.
  const [bandOpen, setBandOpen] = useState(false)
  // A conversation going on the band: the wall holds its idle timers meanwhile.
  const [talking, setTalking] = useState(false)
  const [listenNonce, setListenNonce] = useState(0)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<{ id?: string; project?: string; todo?: boolean; day?: string; nonce: number } | null>(null)
  const [opening, setOpening] = useState<{ text: string; nonce: number } | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  // `say`: opened with words to send first (a project's "Talk to Casa about it", P3.25).
  // Opened by the wake word (a trigger that may be a false one): the band starts as the small pill.
  const [viaWake, setViaWake] = useState(false)
  // Pictures pasted on the wall (canvas 22c): Casa opens with them waiting in its line.
  const [staged, setStaged] = useState<{ text: string; images: TypedImage[]; nonce: number } | null>(null)
  const ask = useCallback((say?: string) => {
    setEmailOpen(false)
    setViaWake(false)
    setBandOpen(true)
    setListenNonce((n) => n + 1)
    setOpening(typeof say === 'string' && say ? { text: say, nonce: Date.now() } : null)
  }, [])
  const closeBand = useCallback(() => setBandOpen(false), [])
  const { onBandLed, onOutcome } = useWallLed(bandOpen, now)
  // The assistant's card is told from the same engine the wall runs; its draft is previewed on the Score.
  const [assistantDraft, setAssistantDraft] = useState<WallEvent | null>(null)
  const planDay = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date), chores }),
    [members, routines, dayOffs, tripStateFor, chores],
  )
  useWakeWord(bandOpen, false, true)
  useEffect(() => {
    const open = (e: Event) => {
      ask()
      if ((e as CustomEvent<{ source?: string }>).detail?.source === 'wake_word') setViaWake(true)
    }
    document.addEventListener('open-ai-chat', open)
    return () => document.removeEventListener('open-ai-chat', open)
  }, [ask])
  const band = bandOpen ? (
    <WallAssistantBand
      listenNonce={listenNonce}
      events={allEvents as unknown as EventWithDetails[]}
      family={members as unknown as FamilyMember[]}
      onClose={closeBand}
      onPointAt={setPointAt}
      members={members}
      planDay={planDay}
      onDraft={setAssistantDraft}
      onLed={onBandLed}
      onOutcome={onOutcome}
      onTalking={setTalking}
      onOpenEvent={(id) => {
        setBandOpen(false)
        setOpenRequest({ id, nonce: Date.now() })
      }}
      opening={opening}
      viaWake={viaWake}
      staged={staged}
      onOpenEmail={() => { setBandOpen(false); setEmailOpen(true) }}
      onOpenDay={(date) => {
        setBandOpen(false)
        setOpenRequest({ day: date.toISOString(), nonce: Date.now() })
      }}
      onOpenPlace={(open) => {
        setBandOpen(false)
        if (open.kind === 'event') setOpenRequest({ id: open.id, nonce: Date.now() })
        else if (open.kind === 'project') setOpenRequest({ project: open.id, nonce: Date.now() })
        else if (open.kind === 'todo') setOpenRequest({ todo: true, nonce: Date.now() })
      }}
    />
  ) : null
  const createEvent = async (args: Record<string, unknown>) => { await createEventByTouch(queryClient, args, 'wall') }

  const comingUp = useComingUp()
  // What came in by email (phase 2, canvas row 14): its count on the launch face, its review in the band's place.
  const email = useEmailOffers()
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const review = emailOpen && email.data ? <WallEmailReview data={email.data} act={email.act} onClose={() => setEmailOpen(false)} computer={deviceKeyboardHere()} today={localDay} /> : null
  const todos = useTodos()
  // The morning paper and its brief (canvas 48a, 58): the facts beyond today are gathered only when it's written.
  const paper = useMorningPaper(today, members, now, currentWeather, () => (comingUp.data && todos.data ? briefFacts({ members, week, now, checklist, comingUp: comingUp.data.items, todos: todos.data }) : undefined))
  // Start typing (or paste) anywhere on a computer (canvas 22c).
  const pasteFiles = useCallback((files: File[]) => {
    void toImages(files).then((images) => {
      setStaged({ text: '', images, nonce: Date.now() })
      setEmailOpen(false)
      setViaWake(false)
      setOpening(null)
      setBandOpen(true)
    })
  }, [])
  const quick = <WallQuickAsk enabled={deviceKeyboardHere() && !bandOpen && !emailOpen} onSend={(text) => ask(text)} onPasteFiles={pasteFiles} />
  // "Casa wants to talk to you" (canvas row 21): the wall alone sends the phone notice.
  const talk = useCasaTalk()
  const casaTalk = useMemo(() => ({
    ...talk,
    push: async (message: { title: string; body: string; tag: string; url: string }) => {
      const { error } = await supabase.functions.invoke('send-push-notification', { body: { ...message, data: { url: message.url } } })
      if (error) throw error
    },
  }), [talk])
  return <><WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} checklist={checklist} allEvents={allEvents} routines={routines} dayOffs={dayOffs} onAsk={ask} overlay={review ?? band} busy={Boolean(review) || (bandOpen && talking)} emailCount={email.data?.count ?? 0} onOpenEmail={() => { setBandOpen(false); setEmailOpen(true) }} pointAt={bandOpen ? pointAt : null} assistantDraft={bandOpen ? assistantDraft : null} openRequest={openRequest} tripStateFor={tripStateFor} tripActions={tripActions} week={week} aroundEvents={aroundEvents} onFocusDay={onFocusDay} deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)} toggleChecklist={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)} saveTravel={saveTravel} travelTrips={travel} chores={chores} saveChore={(chore) => saveChore(queryClient, chore)} deleteChore={(id) => deleteChore(queryClient, id)} addChecklist={(eventId, label) => addChecklistItem(queryClient, eventId, label)} saveNotes={(event, notes) => saveEventNotes(queryClient, event, notes)} useEventItems={useEventChecklist} createEvent={createEvent} comingUp={comingUp.data ? { ...comingUp.data, act: comingUp.act, start: comingUp.start, editIdea: comingUp.editIdea } : null} todos={todos.data ? { list: todos.data, act: todos.act } : null} casaTalk={casaTalk} choreDone={choreDone} tickChore={(id, date, done) => setChoreDone(queryClient, id, date, done)} paper={paper} />{quick}</>
}
