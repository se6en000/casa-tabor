import { useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  Home,
  ListChecks,
  Settings,
  ShoppingBasket,
  Sparkles,
  Users,
} from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  ContentSection,
  Field,
  Heading,
  Input,
  Modal,
  PageFeedback,
  PageHeader,
  PageShell,
  Progress,
  SegmentedControl,
  Sheet,
  Switch,
  Text,
} from '../components/ui'

const CALENDAR_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const

const SETTINGS_OPTIONS = [
  { value: 'appearance', label: 'Appearance' },
  { value: 'family', label: 'Family' },
  { value: 'services', label: 'Services' },
] as const

function FixtureNavigation() {
  return (
    <Card padding="sm" className="h-full rounded-none border-y-0 border-l-0">
      <div className="flex items-center gap-3 border-b border-casa-divider pb-4">
        <span className="flex size-control items-center justify-center rounded-full bg-casa-navy text-casa-on-dark">
          <Home size={20} aria-hidden="true" />
        </span>
        <div>
          <Heading role="heading">Casa Tabor</Heading>
          <Text role="caption" muted>Tuesday, March 10</Text>
        </div>
      </div>
      <nav aria-label="Fixture navigation" className="mt-4 space-y-2">
        {[
          [Home, 'Home', true],
          [CalendarDays, 'Calendar', false],
          [ShoppingBasket, 'Grocery', false],
          [ChefHat, 'Cooking', false],
          [Settings, 'Settings', false],
        ].map(([Icon, label, active]) => {
          const NavIcon = Icon as typeof Home
          return (
            <div
              key={label as string}
              className={`flex min-h-control items-center gap-3 rounded-button px-3 text-body-sm font-semibold ${
                active ? 'bg-casa-accent-soft text-casa-navy' : 'text-content-muted'
              }`}
            >
              <NavIcon size={19} aria-hidden="true" />
              {label as string}
            </div>
          )
        })}
      </nav>
    </Card>
  )
}

function HomeFixture() {
  return (
    <div className="space-y-4 p-page-gutter">
      <PageHeader
        eyebrow="Good morning"
        title="The Tabor family"
        description="Everything important for today, in one calm view."
        actions={<Button variant="strong">Add to today</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ContentSection title="Coming up" description="Tuesday, March 10">
          {[
            ['8:30 AM', 'School drop-off', 'Jake + Owen'],
            ['2:00 PM', 'Dentist appointment', 'Jake'],
            ['6:30 PM', 'Family dinner', 'Everyone'],
          ].map(([time, title, people]) => (
            <div key={title} className="flex min-h-control items-center gap-3 rounded-button border border-casa-border bg-surface-page p-3">
              <span className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-casa-accent-soft text-casa-navy">
                <Clock3 size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Text role="body-sm" className="font-semibold">{title}</Text>
                <Text role="caption" muted>{time} · {people}</Text>
              </div>
            </div>
          ))}
        </ContentSection>
        <ContentSection title="Needs you" description="Two simple actions">
          <Checkbox checked readOnly label="Pack soccer bag" description="Before 4:30 PM" />
          <Checkbox readOnly label="Approve grocery substitutions" description="3 items need review" />
          <Progress value={68} label="Today is 68% planned" />
        </ContentSection>
      </div>
      <Alert tone="info" title="A calm afternoon">
        No schedule conflicts detected. Dinner prep can start at 5:45 PM.
      </Alert>
    </div>
  )
}

function CalendarFixture() {
  const [view, setView] = useState<(typeof CALENDAR_OPTIONS)[number]['value']>('week')
  return (
    <Card padding="md" className="space-y-4">
      <PageHeader
        title="Calendar"
        description="March 9–15, 2026"
        actions={<SegmentedControl aria-label="Calendar view" value={view} options={CALENDAR_OPTIONS} onChange={setView} />}
      />
      <div className="grid grid-cols-5 overflow-hidden rounded-card border border-casa-border bg-surface-page">
        {['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'].map((day, dayIndex) => (
          <div key={day} className="min-h-44 border-r border-casa-divider p-2 last:border-r-0">
            <Text role="caption" className="font-semibold text-content-muted">{day}</Text>
            {dayIndex === 1 && (
              <>
                <div className="mt-3 rounded-button border-l-4 border-casa-info bg-casa-info-soft p-2">
                  <Text role="caption" className="font-semibold">Dentist</Text>
                  <Text role="caption" muted>2:00 PM</Text>
                </div>
                <div className="mt-2 rounded-button border-l-4 border-casa-success bg-casa-success-soft p-2">
                  <Text role="caption" className="font-semibold">Family dinner</Text>
                  <Text role="caption" muted>6:30 PM</Text>
                </div>
              </>
            )}
            {dayIndex === 3 && (
              <div className="mt-8 rounded-button border-l-4 border-casa-gold bg-casa-accent-subtle p-2">
                <Text role="caption" className="font-semibold">Soccer practice</Text>
                <Text role="caption" muted>4:30 PM</Text>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function SettingsFixture() {
  const [section, setSection] = useState<(typeof SETTINGS_OPTIONS)[number]['value']>('appearance')
  const [midnight, setMidnight] = useState(false)
  return (
    <Card padding="md" className="space-y-4">
      <PageHeader title="Settings" description="Personalize the shared home experience." />
      <SegmentedControl
        aria-label="Settings section"
        value={section}
        options={SETTINGS_OPTIONS}
        onChange={setSection}
        fullWidth
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ContentSection title="Display" density="dense">
          <Switch
            checked={midnight}
            onCheckedChange={setMidnight}
            label="Midnight Gallery"
            description="Use the low-light palette after sunset"
          />
          <Switch checked onCheckedChange={() => {}} label="Show family rail" description="Keep family availability visible" />
        </ContentSection>
        <ContentSection title="Family profile" density="dense">
          <Field label="Household name" hint="Shown in shared headings">
            <Input value="The Tabor family" readOnly />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Chip tone="accent">Jake</Chip>
            <Chip tone="success">Owen</Chip>
            <Chip>Family</Chip>
          </div>
        </ContentSection>
      </div>
    </Card>
  )
}

function GroceryFixture() {
  return (
    <Card padding="md" className="space-y-4">
      <PageHeader
        title="Grocery"
        description="Shopping list · 7 items"
        actions={<Button variant="strong">Add item</Button>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {['Milk', 'Strawberries', 'Pasta', 'Olive oil'].map((item, index) => (
          <div key={item} className="flex min-h-control items-center gap-3 rounded-button border border-casa-border bg-surface-page px-3">
            <Checkbox checked={index === 0} readOnly label={item} />
            <Chip className="ml-auto">{index < 2 ? 'Produce' : 'Pantry'}</Chip>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FeedbackFixture() {
  return (
    <section aria-labelledby="feedback-title" className="space-y-4">
      <div>
        <Heading id="feedback-title" role="display-sm">Feedback states</Heading>
        <Text role="body-sm" muted>Stable loading, empty, error, and success compositions.</Text>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PageFeedback state="loading" title="Loading schedule" rows={3} />
        <PageFeedback
          state="empty"
          icon={<CalendarDays size={28} aria-hidden="true" />}
          title="A clear afternoon"
          description="Nothing is scheduled after lunch."
          action={<Button variant="subtle">Add an event</Button>}
        />
        <PageFeedback
          state="error"
          icon={<ListChecks size={28} aria-hidden="true" />}
          title="List unavailable"
          description="The grocery list could not be refreshed."
          action={<Button variant="secondary">Try again</Button>}
        />
        <PageFeedback
          state="success"
          icon={<CheckCircle2 size={28} aria-hidden="true" />}
          title="All synced"
          description="Casa and Reminders are up to date."
        />
      </div>
    </section>
  )
}

export default function VisualRegressionPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <main data-testid="visual-regression-fixture" className="min-h-screen bg-surface-page text-casa-text">
      <section aria-label="Representative Casa shell" className="overflow-hidden border-b border-casa-border">
        <div className="grid min-h-160 lg:grid-cols-[minmax(13rem,20%)_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <FixtureNavigation />
          </div>
          <HomeFixture />
        </div>
      </section>
      <PageShell
        width="wide"
        title="Design-system visual baseline"
        subtitle="Deterministic product compositions and interaction states"
        actions={<Chip tone="accent"><Sparkles size={14} aria-hidden="true" /> Phase 5</Chip>}
      >
        <div className="grid gap-section-gap xl:grid-cols-2">
          <CalendarFixture />
          <SettingsFixture />
        </div>
        <GroceryFixture />
        <FeedbackFixture />
        <section aria-label="Action hierarchy" className="flex flex-wrap items-center gap-3">
          <Users size={22} className="text-content-muted" aria-hidden="true" />
          <Button variant="primary">Primary CTA</Button>
          <Button variant="strong">Strong action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Destructive</Button>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Review dialog</Button>
          <Button variant="subtle" onClick={() => setSheetOpen(true)}>Open task sheet</Button>
        </section>
      </PageShell>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Review family plan">
        <Text role="body-sm">Confirm that the shared schedule is ready for everyone.</Text>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Not yet</Button>
          <Button variant="strong" onClick={() => setModalOpen(false)}>Confirm plan</Button>
        </div>
      </Modal>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Today’s task details" side="right">
        <Text role="body-sm">Review the task details without losing your place.</Text>
        <Button className="mt-4" variant="secondary" onClick={() => setSheetOpen(false)}>Done</Button>
      </Sheet>
    </main>
  )
}
