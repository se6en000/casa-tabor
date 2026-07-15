import { Button, Modal } from '../ui'
import type { EventLocationScope } from '../../lib/eventLocation'

export default function RecurrenceScopeDialog({
  open,
  title = 'Edit recurring event',
  onClose,
  onSelect,
}: {
  open: boolean
  title?: string
  onClose: () => void
  onSelect: (scope: EventLocationScope) => void
}) {
  const choices: Array<{ scope: EventLocationScope; label: string; description: string }> = [
    { scope: 'this', label: 'This event', description: 'Only this occurrence will be updated' },
    { scope: 'future', label: 'This and following events', description: 'This and all future occurrences' },
    { scope: 'all', label: 'All events', description: 'Every occurrence in the series' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <p className="mb-4 text-body-sm text-casa-muted">How would you like to apply your changes?</p>
      <div className="space-y-2">
        {choices.map(({ scope, label, description }) => (
          <Button
            key={scope}
            variant="secondary"
            fullWidth
            className="h-auto justify-start py-3 text-left"
            onClick={() => onSelect(scope)}
          >
            <span>
              <span className="block text-body-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-caption text-casa-muted">{description}</span>
            </span>
          </Button>
        ))}
      </div>
      <Button variant="ghost" fullWidth className="mt-4" onClick={onClose}>Cancel</Button>
    </Modal>
  )
}
