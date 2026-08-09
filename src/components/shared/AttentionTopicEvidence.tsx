import { formatDistanceToNow } from 'date-fns'
import type { PrepItem } from '../../types'
import { sourceBadge } from '../../utils/prepSourceBadge'
import { Chip } from '../ui'
import { Button } from '../ui'

export default function AttentionTopicEvidence({
  items,
  onKeepGrouped,
  onSeparate,
  isSaving = false,
}: {
  items: PrepItem[]
  onKeepGrouped: () => void
  onSeparate: (item: PrepItem) => void
  isSaving?: boolean
}) {
  const sortedItems = [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const latestItemId = sortedItems[0]?.id

  return (
    <div className="mt-2.5 border-t border-casa-border/70 pt-2.5">
      <p className="text-caption font-semibold text-casa-navy">Grouped updates</p>
      <div className="mt-2 space-y-2">
        {sortedItems.map((evidence) => (
            <div key={evidence.id} className="rounded-card border border-casa-border bg-casa-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip size="sm" tone="neutral">{sourceBadge(evidence).label}</Chip>
                {evidence.id === latestItemId && <Chip size="sm" tone="success">Latest</Chip>}
                <span className="text-caption text-casa-muted">
                  {formatDistanceToNow(new Date(evidence.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-1.5 text-body-sm leading-snug text-casa-text">{evidence.description}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => onSeparate(evidence)}
                className="mt-1.5 h-auto min-h-0 p-0 hover:bg-transparent"
                contentClassName="text-caption text-casa-muted underline underline-offset-2"
              >
                Not related
              </Button>
            </div>
          ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isSaving}
        onClick={onKeepGrouped}
        className="mt-2.5"
      >
        Keep grouped
      </Button>
    </div>
  )
}
