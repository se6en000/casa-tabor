import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button, SegmentedControl } from '../../ui'
import { cn } from '../../../utils/cn'
import {
  useVendorSpendSummary,
  useVendorSpendTransactions,
  type VendorSpendRange,
} from '../../../hooks/usePrepItems'

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

const RANGE_OPTIONS = [
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'Trailing 12 Months' },
] as const

function VendorTransactionsList({ vendor, range }: { vendor: string; range: VendorSpendRange }) {
  const { data: transactions = [], isLoading } = useVendorSpendTransactions(vendor, range)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-1 text-caption text-casa-muted">
        <Loader2 size={13} className="animate-spin" />
        <span>Loading transactions…</span>
      </div>
    )
  }

  if (transactions.length === 0) {
    return <p className="py-3 px-1 text-caption text-casa-muted">No transactions found for this range.</p>
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {transactions.map((txn) => (
        <div
          key={txn.id}
          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-casa-bg border border-casa-border/50"
        >
          <div className="min-w-0">
            <p className="text-caption font-semibold text-casa-navy truncate">
              {txn.eventTitle || txn.description || 'Transaction'}
            </p>
            <p className="text-3xs text-casa-muted">{format(new Date(txn.createdAt), 'MMM d, yyyy')}</p>
          </div>
          <span className="text-caption font-bold text-casa-navy shrink-0">
            {txn.amountEstimated && '~'}
            {formatCents(txn.amountCents)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Vendor spend summary for the Inbound Manifest. amount_cents is only populated
 * where the classifier (or the one-time historical backfill) found a real
 * transaction total, so this is a floor on real spend, not a complete ledger --
 * see migration 20260911181708_prep_item_vendor_spend.sql. Deliberately scoped
 * to totals only for v1 (no groceries-vs-discretionary split yet).
 */
export default function VendorSpendCard() {
  const [range, setRange] = useState<VendorSpendRange>('month')
  const [expanded, setExpanded] = useState(false)
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null)
  const { data: rows = [], isLoading } = useVendorSpendSummary(range)

  const totalCents = rows.reduce((sum, row) => sum + row.totalCents, 0)
  const hasAnyEstimated = rows.some((row) => row.hasEstimated)

  const rangeLabel = range === 'month' ? 'this month' : 'in the trailing 12 months'
  const summaryText = isLoading
    ? 'Loading spend…'
    : totalCents === 0
      ? `No tracked spend yet ${rangeLabel}`
      : `${hasAnyEstimated ? '~' : ''}${formatCents(totalCents)} spent ${rangeLabel}`

  return (
    <div className="shrink-0 mb-2.5">
      <Button
        variant="ghost"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-1 py-1.5 min-h-[36px] rounded-lg text-left hover:bg-casa-bg transition-colors font-normal"
        aria-expanded={expanded}
      >
        <span className="text-caption text-casa-muted truncate">
          {summaryText}
          <span className="text-casa-muted/70"> · tap for details</span>
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-casa-muted shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-casa-muted shrink-0" />
        )}
      </Button>

      {expanded && (
        <div className="px-1 pb-3 pt-1 mt-1 border-t border-casa-border/50">
          <div className="pt-3 pb-2">
            <SegmentedControl
              aria-label="Spend time range"
              value={range}
              onChange={(value) => {
                setRange(value)
                setExpandedVendor(null)
              }}
              options={RANGE_OPTIONS}
              fullWidth
            />
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-caption text-casa-muted">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading spend…</span>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-caption text-casa-muted">
              No tracked spend yet for this range. Bills, orders, and deliveries with a known amount will show up here.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 pt-2">
              {rows.map((row) => {
                const isRowExpanded = expandedVendor === row.vendor
                return (
                  <div key={row.vendor}>
                    <Button
                      variant="ghost"
                      onClick={() => setExpandedVendor(isRowExpanded ? null : row.vendor)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl min-h-[44px] transition-colors text-left font-normal',
                        isRowExpanded ? 'bg-casa-gold/10 border border-casa-gold/30' : 'bg-casa-surface border border-casa-border/50 hover:border-casa-gold/40'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-caption font-semibold text-casa-navy truncate">{row.vendor}</p>
                        <p className="text-3xs text-casa-muted">
                          {row.transactionCount} transaction{row.transactionCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="text-caption font-bold text-casa-navy shrink-0">
                        {row.hasEstimated && '~'}
                        {formatCents(row.totalCents)}
                      </span>
                    </Button>
                    {isRowExpanded && (
                      <div className="pl-2">
                        <VendorTransactionsList vendor={row.vendor} range={range} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
