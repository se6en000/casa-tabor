import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useEnrichEvent } from '../../hooks/useEnrichEvent'
import { Button, Field, Modal, Textarea } from '../ui'

interface Props {
  event: EventWithDetails
  open: boolean
  onClose: () => void
}

export default function ReenrichDialog({ event, open, onClose }: Props) {
  const [context, setContext] = useState('')
  const enrich = useEnrichEvent()

  const handleEnrich = async () => {
    await enrich.mutateAsync({ eventId: event.id, extraContext: context.trim() || undefined })
    setContext('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Re-enrich with AI"
      panelClassName={enrich.isPending ? 'ai-thinking' : undefined}
    >
      <div className="flex items-center gap-2 mb-3 text-casa-gold">
        <Sparkles size={18} aria-hidden="true" />
        <p className="text-caption text-casa-muted">{event.title}</p>
      </div>
      <p className="text-body-sm text-casa-muted mb-4 leading-relaxed">
        Add any extra context to help the AI fill in better details. Leave blank to re-run with the event info alone.
      </p>
      <Field label="Extra context" className="mb-4">
        <Textarea
          rows={3}
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder='e.g. "Dad is driving, she needs cleats and shin guards"'
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleEnrich() }}
        />
      </Field>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button
          fullWidth
          onClick={() => void handleEnrich()}
          loading={enrich.isPending}
          leadingIcon={<Sparkles size={14} aria-hidden="true" />}
        >
          {enrich.isPending ? 'AI is thinking…' : 'Enrich'}
        </Button>
      </div>
    </Modal>
  )
}
