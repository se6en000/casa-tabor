import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260911181708_prep_item_vendor_spend.sql', import.meta.url),
  'utf8',
)
const usePrepItems = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const vendorSpendCard = readFileSync(new URL('../src/components/canvas/widgets/VendorSpendCard.tsx', import.meta.url), 'utf8')
const estateLogisticsWidget = readFileSync(new URL('../src/components/canvas/widgets/EstateLogisticsWidget.tsx', import.meta.url), 'utf8')

test('migration adds a real, queryable amount column instead of relying on render-time regex guessing', () => {
  assert.match(migration, /add column if not exists amount_cents bigint/)
  assert.match(migration, /add column if not exists amount_estimated boolean not null default false/)
  assert.match(migration, /create index if not exists prep_items_vendor_spend_idx/)
})

test('get_vendor_spend_summary excludes non-monetary items and buckets missing vendor as Other', () => {
  assert.match(migration, /create or replace function public\.get_vendor_spend_summary\(p_since timestamptz\)/)
  assert.match(migration, /where amount_cents is not null/)
  assert.match(migration, /coalesce\(nullif\(trim\(attention_vendor\), ''\), 'Other'\)/)
  assert.match(migration, /grant execute on function public\.get_vendor_spend_summary\(timestamptz\)\s*\n\s*to anon, authenticated, service_role/)
})

test('get_vendor_spend_transactions is scoped to one vendor and one range, for drill-down', () => {
  assert.match(migration, /create or replace function public\.get_vendor_spend_transactions\(p_vendor text, p_since timestamptz\)/)
  assert.match(migration, /and coalesce\(nullif\(trim\(attention_vendor\), ''\), 'Other'\) = p_vendor/)
})

test('useVendorSpendSummary and useVendorSpendTransactions call the real RPCs, not a client-side regex re-scan', () => {
  assert.match(usePrepItems, /supabase\.rpc\('get_vendor_spend_summary', \{\s*p_since: vendorSpendSinceIso\(range\),?\s*\}\)/)
  assert.match(usePrepItems, /supabase\.rpc\('get_vendor_spend_transactions', \{/)
  assert.match(usePrepItems, /export function useVendorSpendSummary/)
  assert.match(usePrepItems, /export function useVendorSpendTransactions/)
})

// usePrepItems.ts pulls in the real supabase client via an extensionless relative
// import, which Node's native ESM loader can't resolve without this repo's build
// step (unlike leaf utils with no such imports, which other test files in this
// repo do dynamically import directly) -- so this is a source assertion of the
// exact date-boundary logic rather than a runtime execution of it.
test('vendorSpendSinceIso resolves "month" to the 1st of the current month and "year" to 12 months ago', () => {
  assert.match(usePrepItems, /new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)\.toISOString\(\)/)
  assert.match(usePrepItems, /since\.setFullYear\(since\.getFullYear\(\) - 1\)/)
})

test('VendorSpendCard offers a This Month / Trailing 12 Months toggle and per-vendor drill-down', () => {
  assert.match(vendorSpendCard, /This Month/)
  assert.match(vendorSpendCard, /Trailing 12 Months/)
  assert.match(vendorSpendCard, /useVendorSpendSummary/)
  assert.match(vendorSpendCard, /useVendorSpendTransactions/)
  assert.match(vendorSpendCard, /expandedVendor/)
})

test('VendorSpendCard collapses to a plain text line, not a bordered card with an icon -- too heavy-handed for secondary info, per live user feedback 2026-09-11', () => {
  assert.doesNotMatch(vendorSpendCard, /DollarSign/)
  assert.doesNotMatch(vendorSpendCard, /rounded-2xl border border-casa-border\/60 bg-casa-bg\/60/)
  assert.match(vendorSpendCard, /tap for details/)
})

test('VendorSpendCard marks estimated/backfilled totals distinctly from precisely-extracted ones', () => {
  assert.match(vendorSpendCard, /hasEstimated/)
  assert.match(vendorSpendCard, /amountEstimated/)
})

test('EstateLogisticsWidget renders the vendor spend card', () => {
  assert.match(estateLogisticsWidget, /import VendorSpendCard from '\.\/VendorSpendCard'/)
  assert.match(estateLogisticsWidget, /<VendorSpendCard \/>/)
})
