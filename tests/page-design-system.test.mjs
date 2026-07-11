import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE_PATHS = [
  'src/pages/HomePage.tsx',
  'src/pages/GroceryPage.tsx',
]

for (const pagePath of PAGE_PATHS) {
  const source = readFileSync(resolve(pagePath), 'utf8')

  test(`${pagePath} uses semantic typography roles`, () => {
    assert.doesNotMatch(source, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/)
    assert.doesNotMatch(source, /\btext-(?:xs|sm|base|lg|xl|2xl)\b/)
  })

  test(`${pagePath} does not hand-roll pill geometry`, () => {
    assert.doesNotMatch(source, /\brounded-pill\b/)
  })
}

test('Design System gallery documents both static and interactive pill contracts', () => {
  const source = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  assert.match(source, />Static badges</)
  assert.match(source, />Interactive action pills</)
  assert.match(source, /<Chip>Suggested<\/Chip>/)
  assert.match(source, /<Chip onClick=\{\.\.\.\}>Add item<\/Chip>/)
  assert.match(source, /selected onClick=/)
  assert.match(source, /onClick=\{\(\) => undefined\} disabled/)
})

test('Grocery suggestion review uses an overlay instead of expanding its item row', () => {
  const source = readFileSync(resolve('src/pages/GroceryPage.tsx'), 'utf8')
  assert.match(source, /open=\{reviewingItem !== null\}/)
  assert.match(source, /The grocery list stays fixed behind this overlay/)
  assert.doesNotMatch(source, /isReviewing &&/)
  assert.doesNotMatch(source, />Quick recategorize</)
})

test('Grocery uses a compact semantic hierarchy for its dense shopping surface', () => {
  const source = readFileSync(resolve('src/pages/GroceryPage.tsx'), 'utf8')

  assert.match(source, /<Heading role="display-sm"[^>]*>Grocery List<\/Heading>/)
  assert.match(source, /text-body font-semibold text-casa-text/)
  assert.match(source, /text-body font-semibold leading-tight text-casa-navy/)
  assert.match(source, /section\.visual\.subtitle/)
  assert.match(source, /columns-1 gap-3 lg:columns-2 2xl:columns-3/)
  assert.doesNotMatch(source, /text-body-lg font-semibold text-casa-text/)
  assert.doesNotMatch(source, /text-heading font-semibold leading-tight text-casa-navy/)
  assert.doesNotMatch(source, /text-body-lg font-semibold leading-tight text-casa-navy/)
})

test('Design System gallery covers every P0 touch contract', () => {
  const source = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  for (const contract of [
    'Selection controls',
    'Select and combobox',
    'Alerts and banners',
    'Progress',
    'Toast / action confirmation',
    'Skeleton loading',
    'Nothing here yet',
    'Could not load',
  ]) {
    assert.match(source, new RegExp(contract))
  }
})

test('P0 primitives are exported from the shared UI entrypoint', () => {
  const source = readFileSync(resolve('src/components/ui/index.ts'), 'utf8')
  for (const component of ['Switch', 'Checkbox', 'Radio', 'Combobox', 'Alert', 'Toast', 'Progress', 'Skeleton', 'EmptyState']) {
    assert.match(source, new RegExp(`export \\{[^\\n]*\\b${component}\\b`))
  }
})

test('P0 controls preserve native and ARIA semantics', () => {
  const buttonSource = readFileSync(resolve('src/components/ui/Button.tsx'), 'utf8')
  const selectionSource = readFileSync(resolve('src/components/ui/SelectionControls.tsx'), 'utf8')
  const comboboxSource = readFileSync(resolve('src/components/ui/Combobox.tsx'), 'utf8')
  const feedbackSource = readFileSync(resolve('src/components/ui/Toast.tsx'), 'utf8')
  assert.match(buttonSource, /contentClassName/)
  assert.match(buttonSource, /cn\('inline-flex items-center justify-center gap-2', contentClassName/)
  assert.match(selectionSource, /role="switch"/)
  assert.match(selectionSource, /type="checkbox"/)
  assert.match(selectionSource, /type="radio"/)
  assert.match(comboboxSource, /role="listbox"/)
  assert.match(comboboxSource, /role="option"/)
  assert.match(feedbackSource, /role=\{tone === 'danger' \? 'alert' : 'status'\}/)
})

test('Progress uses native progress semantics without layout-fragile inline widths', () => {
  const source = readFileSync(resolve('src/components/ui/Progress.tsx'), 'utf8')
  assert.match(source, /<progress/)
  assert.match(source, /aria-label=\{ariaLabel \?\? label\}/)
  assert.doesNotMatch(source, /style=\{\{/)
})

test('Phase 3 composition patterns are exported from the shared UI entrypoint', () => {
  const source = readFileSync(resolve('src/components/ui/index.ts'), 'utf8')
  for (const component of [
    'PageHeader',
    'SectionHeader',
    'ContentSection',
    'ThreeRailLayout',
    'PrimaryRail',
    'SecondaryRail',
    'MasterDetailLayout',
    'PageFeedback',
    'WorkflowActions',
    'ConfirmationDialog',
  ]) {
    assert.match(source, new RegExp(`\\b${component}\\b`))
  }
})

test('three-rail patterns preserve the 20 / 55 / 25 desktop contract', () => {
  const patterns = readFileSync(resolve('src/components/ui/Patterns.tsx'), 'utf8')
  const home = readFileSync(resolve('src/pages/HomePage.tsx'), 'utf8')
  const homeRight = readFileSync(resolve('src/components/home/HomeRightPanel.tsx'), 'utf8')
  const navigation = readFileSync(resolve('src/components/layout/TabletSidebar.tsx'), 'utf8')

  assert.match(patterns, /basis-1\/5/)
  assert.match(patterns, /basis-1\/4/)
  assert.match(patterns, /basis-5\/16 min-w-0 shrink-0/)
  assert.doesNotMatch(patterns, /basis-5\/16[^'\n]*flex-none/)
  assert.match(home, /<PrimaryRail/)
  assert.match(homeRight, /<SecondaryRail/)
  assert.match(navigation, /basis-1\/5/)
})

test('page and Settings compositions delegate to shared Phase 3 patterns', () => {
  const pageShell = readFileSync(resolve('src/components/ui/PageShell.tsx'), 'utf8')
  const settingsHeader = readFileSync(resolve('src/components/settings/SettingsPageHeader.tsx'), 'utf8')
  const settingsSection = readFileSync(resolve('src/components/settings/SettingsSection.tsx'), 'utf8')
  const settingsShell = readFileSync(resolve('src/components/settings/SettingsShell.tsx'), 'utf8')
  const display = readFileSync(resolve('src/pages/DisplaySettingsPage.tsx'), 'utf8')
  const artMode = readFileSync(resolve('src/pages/ArtModeSettingsPage.tsx'), 'utf8')

  assert.match(pageShell, /<PageHeader/)
  assert.match(settingsHeader, /<PageHeader/)
  assert.match(settingsSection, /<ContentSection/)
  assert.match(settingsShell, /<MasterDetailLayout/)
  assert.match(display, /<SharedSectionHeader/)
  assert.match(artMode, /<SharedSectionHeader/)
})

test('page feedback and confirmation patterns preserve truthful ARIA and dismissal semantics', () => {
  const source = readFileSync(resolve('src/components/ui/Patterns.tsx'), 'utf8')

  assert.match(source, /role="status"/)
  assert.match(source, /<Alert tone="success"/)
  assert.match(source, /tone=\{state\}/)
  assert.match(source, /closeOnBackdrop=\{!loading\}/)
  assert.match(source, /closeOnEscape=\{!loading\}/)
  assert.match(source, /variant=\{destructive \? 'danger' : 'primary'\}/)
})

test('semantic composition colors are aliases rather than brand-name dependencies', () => {
  const generator = readFileSync(resolve('scripts/generate-design-tokens.mjs'), 'utf8')
  const patterns = readFileSync(resolve('src/components/ui/Patterns.tsx'), 'utf8')

  for (const alias of [
    'surface-page',
    'surface-subtle',
    'surface-raised',
    'surface-inset',
    'content-primary',
    'content-heading',
    'content-muted',
    'action-primary',
    'action-accent',
    'action-danger',
  ]) {
    assert.match(generator, new RegExp(`color-${alias}`))
  }
  assert.doesNotMatch(patterns, /(?:bg|text)-casa-(?:gold|navy|bg|surface|text)\b/)
})

test('Design System gallery demonstrates every Phase 3 pattern family', () => {
  const source = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  for (const pattern of [
    'Predictable page assembly',
    '<ThreeRailLayout',
    'Dense list section',
    '<MasterDetailLayout',
    '<PageFeedback',
    '<WorkflowActions',
    '<ConfirmationDialog',
  ]) {
    assert.match(source, new RegExp(pattern))
  }
})

test('Grocery uses shared controls and feedback without changing its dense layout', () => {
  const source = readFileSync(resolve('src/pages/GroceryPage.tsx'), 'utf8')
  for (const component of ['Alert', 'Button', 'Checkbox', 'Chip', 'IconButton', 'Progress', 'SegmentedControl', 'Sheet']) {
    assert.match(source, new RegExp(`<${component}\\b`))
  }
  assert.doesNotMatch(source, /<button\b/)
  assert.doesNotMatch(source, /chipClassName/)
  assert.match(source, /columns-1 gap-3 lg:columns-2 2xl:columns-3/)
  assert.match(source, /<Heading role="display-sm"[^>]*>Grocery List<\/Heading>/)
  assert.match(source, /style=\{\{ left: dragState\.x \+ 14, top: dragState\.y \+ 14 \}\}/)
})

test('event create and edit workflows use shared design-system contracts', () => {
  const quickCreate = readFileSync(resolve('src/components/shared/QuickCreateSheet.tsx'), 'utf8')
  const eventEdit = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')
  const eventDetail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')
  assert.match(quickCreate, /<Sheet/)
  assert.match(quickCreate, /<Field label="Event title"/)
  assert.match(quickCreate, /<Button/)
  assert.match(quickCreate, /<Alert tone="danger"/)
  assert.doesNotMatch(quickCreate, /z-\[\d+\]/)
  assert.match(eventEdit, /<SegmentedControl/)
  assert.match(eventEdit, /<Switch/)
  assert.match(eventEdit, /<Select/)
  assert.match(eventEdit, /<Modal/)
  assert.match(eventEdit, /<Alert /)
  assert.doesNotMatch(eventEdit, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/)
  assert.doesNotMatch(eventEdit, /z-\[\d+\]/)
  assert.match(eventDetail, /\{event && !showEdit && \(/)
})

test('inline calendar uses density-aware controls and semantic layering', () => {
  const source = readFileSync(resolve('src/components/shared/InlineCalendarPicker.tsx'), 'utf8')
  assert.match(source, /<IconButton/)
  assert.match(source, /min-h-control-sm/)
  assert.match(source, /z-popover/)
  assert.doesNotMatch(source, /\bh-8\b/)
  assert.doesNotMatch(source, /z-\[\d+\]/)
})

test('event editor uses shared progressive disclosure and date-time dials', () => {
  const editor = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')
  const quickCreate = readFileSync(resolve('src/components/shared/QuickCreateSheet.tsx'), 'utf8')
  const exports = readFileSync(resolve('src/components/ui/index.ts'), 'utf8')
  assert.match(editor, /<DateTimeDial/)
  assert.match(editor, /<DisclosureSection/)
  assert.match(editor, /<FormSummaryCard/)
  assert.doesNotMatch(editor, /type="datetime-local"/)
  assert.match(quickCreate, /<DateTimeDial/)
  assert.match(exports, /export \{ DateTimeDial/)
  assert.match(exports, /export \{ DisclosureSection/)
  assert.match(exports, /export \{ FormSummaryCard/)
})

test('calendar cards and event details use shared touch contracts', () => {
  const detail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')
  const largeCard = readFileSync(resolve('src/components/calendar/LargeEventCard.tsx'), 'utf8')
  const reminderCard = readFileSync(resolve('src/components/calendar/ReminderEventCard.tsx'), 'utf8')
  const stacked = readFileSync(resolve('src/components/calendar/StackedView.tsx'), 'utf8')
  assert.match(detail, /role="dialog"/)
  assert.match(detail, /aria-modal="true"/)
  assert.match(detail, /z-scrim/)
  assert.match(detail, /z-modal/)
  assert.doesNotMatch(detail, /z-\[\d+\]/)
  assert.match(detail, /<IconButton/)
  assert.match(detail, /<Chip/)
  assert.match(largeCard, /<CalendarPill/)
  assert.match(reminderCard, /<Button/)
  assert.match(reminderCard, /role="button"/)
  assert.match(stacked, /<CalendarPill/)
  assert.match(stacked, /min-h-control/)
})

test('dense calendar metadata uses the Day-view-sized read-only pill', () => {
  const pill = readFileSync(resolve('src/components/ui/CalendarPill.tsx'), 'utf8')
  const day = readFileSync(resolve('src/components/calendar/DayView.tsx'), 'utf8')
  const stacked = readFileSync(resolve('src/components/calendar/StackedView.tsx'), 'utf8')
  const large = readFileSync(resolve('src/components/calendar/LargeEventCard.tsx'), 'utf8')
  assert.match(pill, /px-2 py-0\.5 text-caption/)
  assert.match(pill, /HTMLAttributes<HTMLSpanElement>/)
  assert.doesNotMatch(pill, /<button/)
  assert.match(day, /<CalendarPill/)
  assert.match(stacked, /<CalendarPill/)
  assert.match(large, /<CalendarPill/)
})

test('calendar views use semantic theme, typography, and layering contracts', () => {
  const paths = [
    'src/components/calendar/DayView.tsx',
    'src/components/calendar/EventBlock.tsx',
    'src/components/calendar/EventDetailPanel.tsx',
    'src/components/calendar/MonthView.tsx',
    'src/components/calendar/StackedView.tsx',
    'src/components/calendar/WeekView.tsx',
  ]
  for (const path of paths) {
    const source = readFileSync(resolve(path), 'utf8')
    assert.doesNotMatch(source, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/, `${path} has arbitrary typography`)
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b/i, `${path} has a raw color`)
    assert.doesNotMatch(source, /\bz-\[\d+\]/, `${path} has arbitrary layering`)
  }
})

test('calendar chrome uses shared controls while runtime event geometry stays intact', () => {
  const page = readFileSync(resolve('src/pages/CalendarPage.tsx'), 'utf8')
  const day = readFileSync(resolve('src/components/calendar/DayView.tsx'), 'utf8')
  const month = readFileSync(resolve('src/components/calendar/MonthView.tsx'), 'utf8')
  const week = readFileSync(resolve('src/components/calendar/WeekView.tsx'), 'utf8')
  const block = readFileSync(resolve('src/components/calendar/EventBlock.tsx'), 'utf8')
  const detail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')

  assert.match(day, /import \{ Button, CalendarPill, IconButton \} from '\.\.\/ui'/)
  assert.match(month, /import \{ Button, CalendarPill, IconButton \} from '\.\.\/ui'/)
  assert.match(detail, /import \{ Button, Card, Chip, IconButton, Switch \} from '\.\.\/ui'/)
  assert.match(page, /import \{ Button, IconButton \} from '\.\.\/components\/ui'/)
  assert.doesNotMatch(page, /<button\b/)
  assert.match(detail, /<Switch[\s\S]*label="Someone waits on site"/)
  assert.equal((detail.match(/<button\b/g) ?? []).length, 1)
  assert.match(detail, /data-native-drag/)

  assert.match(block, /top: `\$\{top\}px`/)
  assert.match(block, /height: `\$\{height\}px`/)
  assert.match(block, /backgroundColor: color/)
  assert.match(week, /left: `calc\(\$\{leftPct\}% \+ 2px\)`/)
  assert.match(week, /className="pointer-events-none fixed z-popover/)
})

test('Cook preserves its landing hierarchy through shared design-system roles', () => {
  const cook = readFileSync(resolve('src/pages/CookPage.tsx'), 'utf8')
  const styles = readFileSync(resolve('src/index.css'), 'utf8')
  assert.match(cook, /<Heading role="display-sm"/)
  assert.match(cook, /<Text as="h3" role="body-lg"[^>]*>\{insight\.recipe\.name\}<\/Text>/)
  assert.match(cook, /variant=\{isTop \? 'primary' : 'secondary'\}\s+className="mt-auto"/)
  assert.doesNotMatch(cook, /className="mt-auto pt-3"/)
  assert.match(cook, /<SegmentedControl/)
  assert.match(cook, /<Card/)
  assert.match(cook, /<Chip/)
  assert.match(cook, /<Button/)
  assert.match(cook, /<Textarea/)
  assert.doesNotMatch(cook, /cook-v2-/)
  assert.doesNotMatch(cook, /text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/)
  assert.doesNotMatch(styles, /\.cook-v2-/)
})

test('Cooking uses shared controls while preserving its interaction contracts', () => {
  const source = readFileSync(resolve('src/pages/CookPage.tsx'), 'utf8')
  for (const component of ['Alert', 'Button', 'Checkbox', 'Chip', 'IconButton', 'Progress', 'SegmentedControl', 'Switch']) {
    assert.match(source, new RegExp(`<${component}\\b`))
  }
  assert.doesNotMatch(source, /<button\b/)
  assert.doesNotMatch(source, /\bz-\[\d+\]/)
  assert.match(source, /className="fixed inset-0 z-modal/)
  assert.match(source, /aria-label="Cooking step progress"/)
  assert.match(source, /aria-label="Saved cooking progress"/)
  assert.match(source, /style=\{\{ objectPosition: `\$\{focalX\}% \$\{focalY\}%` \}\}/)
})

test('Design System settings expose persistent live font and color controls', () => {
  const gallery = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  const theme = readFileSync(resolve('src/contexts/ThemeContext.tsx'), 'utf8')
  const generatedTokens = readFileSync(resolve('src/generated/design-tokens.css'), 'utf8')

  assert.match(gallery, /Live Theme Lab/)
  assert.match(gallery, /aria-label="Global font scale"/)
  assert.match(gallery, /type="color"/)
  assert.match(gallery, /<SegmentedControl[\s\S]*aria-label="Palette to edit"/)
  assert.match(gallery, /<Switch[\s\S]*label="Preview Midnight palette"/)
  assert.match(theme, /casa-design-font-scale/)
  assert.match(theme, /if \(raw == null\) return DEFAULT_FONT_SCALE/)
  assert.match(theme, /localStorage\.setItem\(STORAGE_FONT_SCALE/)
  assert.match(theme, /--ds-font-scale: \$\{fontScale\}/)
  assert.match(generatedTokens, /calc\(76px \* var\(--ds-font-scale\)\)/)
  assert.match(generatedTokens, /calc\(18px \* var\(--ds-font-scale\)\)/)
})

test('Cook mode, unit, and quantity selectors use shared toggle controls', () => {
  const cook = readFileSync(resolve('src/pages/CookPage.tsx'), 'utf8')

  assert.match(cook, /aria-label="Directions view"/)
  assert.match(cook, /aria-label="Ingredient units"/)
  assert.match(cook, /aria-label="Recipe quantity scale"/)
  assert.match(cook, /type RecipeScale = '0\.5' \| '1' \| '2'/)
})

test('Home and its right rail use shared touch-first design contracts', () => {
  const home = readFileSync(resolve('src/pages/HomePage.tsx'), 'utf8')
  const rightRail = readFileSync(resolve('src/components/home/HomeRightPanel.tsx'), 'utf8')
  const leftRail = readFileSync(resolve('src/components/layout/TabletSidebar.tsx'), 'utf8')

  for (const component of ['Button', 'CalendarPill', 'Card', 'Chip', 'EmptyState', 'Heading', 'IconButton', 'Text']) {
    assert.match(home, new RegExp(`<${component}`))
  }
  for (const component of ['Button', 'Card', 'Chip', 'EmptyState', 'Heading', 'IconButton', 'Text']) {
    assert.match(rightRail, new RegExp(`<${component}`))
  }
  assert.match(home, /aria-label="Previous event"/)
  assert.match(home, /aria-label="Snooze reminder one hour"/)
  assert.match(home, /<IconButton[\s\S]*aria-label=\{`Go to event \$\{i \+ 1\} of \$\{slides\.length\}`\}[\s\S]*className="rounded-full"/)
  assert.match(rightRail, /min-h-control rounded-button/)
  assert.match(leftRail, /collapsed \? 'w-20' : 'basis-1\/5'/)
  assert.match(rightRail, /<SecondaryRail/)
  assert.doesNotMatch(leftRail, /collapsed \? 'w-20' : 'w-72'/)
  assert.doesNotMatch(rightRail, /w-\[22rem\]/)
  assert.doesNotMatch(home, /const SHARED_GOLD = '#/)
  assert.doesNotMatch(rightRail, /text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/)
})

test('Home middle rail omits household availability pills', () => {
  const home = readFileSync(resolve('src/pages/HomePage.tsx'), 'utf8')

  assert.doesNotMatch(home, /familyStatusByMember/)
  assert.doesNotMatch(home, /status\?\.label \?\? 'Free today'/)
  assert.match(home, /<MiniPlayer \/>/)
})

test('Home condenses earlier appointments and reminders into three cards plus a full-history sheet', () => {
  const home = readFileSync(resolve('src/pages/HomePage.tsx'), 'utf8')

  assert.match(home, /pastEvents\.slice\(0, 3\)/)
  assert.match(home, /grid grid-cols-1 gap-2 md:grid-cols-3/)
  assert.match(home, /View all \{pastEvents\.length\}/)
  assert.match(home, /title=\{`Earlier today · \$\{pastEvents\.length\}/)
  assert.match(home, /panelClassName="max-h-\[85dvh\] bg-casa-bg"/)
  assert.match(home, /contentClassName="bg-casa-bg"/)
  assert.match(home, /<Card[\s\S]*?tone="surface"/)
  assert.match(home, /pastEvents\.map\(\(event\) =>/)
  assert.match(home, /function PastTimelineCard/)
  assert.doesNotMatch(home, /events\.filter\(e => isBefore\(getEventEndDate\(e\), now\)\)\.map/)
})

test('every Settings route is covered by the shared Settings surface contract', () => {
  const shell = readFileSync(resolve('src/components/settings/SettingsShell.tsx'), 'utf8')
  const styles = readFileSync(resolve('src/index.css'), 'utf8')
  const routePages = [
    'GoogleServicesPage.tsx',
    'AISettingsPage.tsx',
    'FamilySettingsPage.tsx',
    'DisplaySettingsPage.tsx',
    'ArtModeSettingsPage.tsx',
    'SmsSettingsPage.tsx',
    'MusicPage.tsx',
    'HomeSettingsPage.tsx',
    'StatusDashboardPage.tsx',
    'DataAnalyticsPage.tsx',
    'GroceryIntelligenceSettingsPage.tsx',
    'SavedPlacesSettingsPage.tsx',
    'FoodProfileSettingsPage.tsx',
    'PantryInventorySettingsPage.tsx',
    'AdminOpsPage.tsx',
    'DesignSystemGalleryPage.tsx',
  ]

  assert.match(shell, /className="settings-surface/)
  assert.match(shell, /min-h-control/)
  assert.match(styles, /\.settings-surface :is\(input, select, textarea\)/)
  assert.match(styles, /min-height: var\(--ds-control-target\)/)

  for (const file of routePages) {
    const source = readFileSync(resolve('src/pages', file), 'utf8')
    assert.match(source, /from '\.\.\/components\/(?:ui|settings)'/, `${file} must use shared design-system components`)
    assert.doesNotMatch(source, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/, `${file} must use semantic typography`)
    assert.doesNotMatch(source, /<button\b/, `${file} must use shared button primitives`)
  }

  for (const file of ['CalendarsSettingsPage.tsx', 'GmailScanPage.tsx']) {
    const source = readFileSync(resolve('src/pages', file), 'utf8')
    assert.doesNotMatch(source, /<button\b/, `${file} must keep legacy Settings controls on shared primitives`)
  }
  assert.doesNotMatch(shell, /<button\b/, 'SettingsShell must use the shared Button primitive')
})

test('Settings toggles and key forms use shared accessible primitives', () => {
  const sharedToggle = readFileSync(resolve('src/components/settings/SettingsToggle.tsx'), 'utf8')
  const display = readFileSync(resolve('src/pages/DisplaySettingsPage.tsx'), 'utf8')
  const art = readFileSync(resolve('src/pages/ArtModeSettingsPage.tsx'), 'utf8')
  const sms = readFileSync(resolve('src/pages/SmsSettingsPage.tsx'), 'utf8')
  const home = readFileSync(resolve('src/pages/HomeSettingsPage.tsx'), 'utf8')
  const family = readFileSync(resolve('src/pages/FamilySettingsPage.tsx'), 'utf8')
  const food = readFileSync(resolve('src/pages/FoodProfileSettingsPage.tsx'), 'utf8')
  const pantry = readFileSync(resolve('src/pages/PantryInventorySettingsPage.tsx'), 'utf8')
  const groceryIntelligence = readFileSync(resolve('src/pages/GroceryIntelligenceSettingsPage.tsx'), 'utf8')
  const music = readFileSync(resolve('src/pages/MusicPage.tsx'), 'utf8')
  const familyColors = readFileSync(resolve('src/design-system/memberColors.ts'), 'utf8')

  assert.match(sharedToggle, /<Switch/)
  assert.doesNotMatch(display, /function Toggle/)
  assert.doesNotMatch(art, /function Toggle/)
  assert.doesNotMatch(sms, /function Toggle/)
  assert.match(home, /<SettingsToggle/)
  assert.match(home, /<Field label="Street address"/)
  assert.match(food, /<Textarea/)
  assert.match(pantry, /<Select/)
  assert.match(pantry, /<EmptyState/)
  assert.match(groceryIntelligence, /<Progress/)
  assert.match(music, /<Progress/)
  assert.match(music, /<IconButton/)
  assert.match(family, /from '\.\.\/design-system\/memberColors'/)
  assert.match(familyColors, /FALLBACK_PROFILE_COLOR/)
  assert.doesNotMatch(family, /#[0-9a-fA-F]{3,8}\b/)
})

test('responsive shell uses viewport-safe sizing and semantic layout tiers', () => {
  const app = readFileSync(resolve('src/App.tsx'), 'utf8')
  const styles = readFileSync(resolve('src/index.css'), 'utf8')
  const generatedTokens = readFileSync(resolve('src/generated/design-tokens.css'), 'utf8')
  const pageShell = readFileSync(resolve('src/components/ui/PageShell.tsx'), 'utf8')
  const topBar = readFileSync(resolve('src/components/shared/TopBar.tsx'), 'utf8')
  const nav = readFileSync(resolve('src/components/shared/NavBar.tsx'), 'utf8')
  const settings = readFileSync(resolve('src/components/settings/SettingsShell.tsx'), 'utf8')

  assert.match(app, /className="app-shell/)
  assert.doesNotMatch(app, /\bh-screen\b/)
  assert.match(styles, /height: 100svh/)
  assert.match(styles, /height: 100dvh/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /@media \(max-width: 29\.999rem\)/)
  assert.match(generatedTokens, /@media \(min-width: 48rem\)/)
  assert.match(generatedTokens, /@media \(min-width: 80rem\)/)
  assert.match(generatedTokens, /--container-page-wide: 96rem/)
  assert.match(pageShell, /type PageShellWidth = 'narrow' \| 'default' \| 'wide' \| 'full'/)
  assert.match(pageShell, /max-w-page-narrow/)
  assert.match(pageShell, /max-w-page-wide/)
  assert.match(topBar, /app-topbar-events/)
  assert.match(topBar, /<IconButton/)
  assert.match(nav, /app-bottom-nav-item/)
  assert.match(nav, /min-w-0 flex-1/)
  assert.match(settings, /max-w-page-narrow px-page-gutter py-section-gap/)
})

test('remaining active surfaces use shared controls and semantic presentation contracts', () => {
  const sharedControlFiles = [
    'src/App.tsx',
    'src/components/layout/TabletSidebar.tsx',
    'src/components/music/MiniPlayer.tsx',
    'src/components/shared/AIChatDrawer.tsx',
    'src/components/shared/ConflictAlertsSection.tsx',
    'src/components/shared/EventContextMenu.tsx',
    'src/components/shared/InlineCalendarPicker.tsx',
    'src/components/shared/NavBar.tsx',
    'src/components/shared/NotificationBell.tsx',
    'src/components/shared/NotificationDrawer.tsx',
    'src/components/shared/PinGate.tsx',
    'src/components/shared/PrepAlertsSection.tsx',
    'src/components/shared/VoiceDebugPanel.tsx',
    'src/pages/ActionHubPage.tsx',
    'src/pages/BriefingPage.tsx',
    'src/pages/TabletPrototypePage.tsx',
    'src/pages/TripDetailPage.tsx',
  ]

  for (const file of sharedControlFiles) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.doesNotMatch(source, /<button\b/, `${file} must use shared button primitives`)
  }

  const semanticLayerFiles = [
    'src/components/shared/AddEventFab.tsx',
    'src/components/shared/AIAssistantFab.tsx',
    'src/components/shared/AIChatDrawer.tsx',
    'src/components/shared/EventContextMenu.tsx',
    'src/components/shared/PinGate.tsx',
    'src/components/shared/TouchKeyboard.tsx',
  ]
  for (const file of semanticLayerFiles) {
    assert.doesNotMatch(readFileSync(resolve(file), 'utf8'), /\bz-\[\d+\]/, `${file} must use semantic layers`)
  }

  const miniPlayer = readFileSync(resolve('src/components/music/MiniPlayer.tsx'), 'utf8')
  const roomTone = readFileSync(resolve('src/hooks/useRoomTone.ts'), 'utf8')
  const tokens = readFileSync(resolve('src/design-system/tokens.mjs'), 'utf8')
  assert.match(miniPlayer, /<Progress/)
  assert.match(roomTone, /ROOM_TONE_COLORS/)
  assert.match(tokens, /export const ROOM_TONE_COLORS/)
})
