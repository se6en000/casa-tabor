import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, ChefHat, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, Button, Card, Chip, EmptyState, Field, Input, Modal, SegmentedControl, SkeletonRow, Text, Textarea } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import { useProfileSession } from '../contexts/ProfileSessionContext'
import { invokeAssistantHistory } from '../lib/assistantConversationHistoryClient'

type MemoryRow = {
  id: string
  scope: 'personal' | 'household'
  title: string
  content: string
  category: string | null
  confidence: number
  updated_at: string
  can_manage: boolean
}

export default function MemorySettingsPage() {
  const { profile } = useProfileSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<MemoryRow | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newScope, setNewScope] = useState<'personal' | 'household'>('personal')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const query = useQuery<MemoryRow[]>({
    queryKey: ['ai-memories', profile?.memberId ?? 'none'],
    enabled: Boolean(profile?.memberId),
    queryFn: async () => {
      const memberId = profile?.memberId
      const token = profile?.token
      if (!memberId || !token) return []
      const result = await invokeAssistantHistory<{ memories: MemoryRow[] }>(token, {
        action: 'list_memories',
      })
      return result.memories
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.token) throw new Error('Sign in to manage memory.')
      await invokeAssistantHistory(profile.token, {
        action: 'delete_memory',
        memory_id: id,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-memories', profile?.memberId ?? 'none'] })
    },
  })

  const correctMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      if (!profile?.token) throw new Error('Sign in to manage memory.')
      await invokeAssistantHistory(profile.token, {
        action: 'correct_memory',
        memory_id: id,
        title,
        content,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-memories', profile?.memberId ?? 'none'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.token) throw new Error('Sign in to add memory.')
      await invokeAssistantHistory(profile.token, {
        action: 'create_memory',
        scope: newScope,
        title: newTitle.trim(),
        content: newContent.trim(),
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-memories', profile?.memberId ?? 'none'] })
    },
  })

  const rows = query.data ?? []
  const personalCount = useMemo(() => rows.filter((row) => row.scope === 'personal').length, [rows])

  async function deleteMemory(id: string) {
    setError(null)
    setStatus(null)
    setDeletingId(id)
    try {
      await deleteMutation.mutateAsync(id)
      setStatus('Memory deleted.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this memory.')
    } finally {
      setDeletingId(null)
    }
  }

  function editMemory(row: MemoryRow) {
    setEditing(row)
    setDraftTitle(row.title)
    setDraftContent(row.content)
    setError(null)
    setStatus(null)
  }

  async function createMemory() {
    setError(null)
    setStatus(null)
    try {
      await createMutation.mutateAsync()
      setNewTitle('')
      setNewContent('')
      setStatus('Memory added.')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not add this memory.')
    }
  }

  async function saveCorrection() {
    if (!editing) return
    setError(null)
    setStatus(null)
    try {
      await correctMutation.mutateAsync({
        id: editing.id,
        title: draftTitle.trim(),
        content: draftContent.trim(),
      })
      setEditing(null)
      setStatus('Memory corrected.')
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : 'Could not correct this memory.')
    }
  }

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        icon={Brain}
        title="Household Memory"
        description="The one place for preferences and remembered information used by Talk & Plan and your daily brief."
      />
      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <Text role="body-sm" className="font-semibold text-casa-navy">Remember something</Text>
          <Text role="caption" muted>Casa learns stable preferences automatically. Add or correct something here whenever you want direct control.</Text>
        </div>
        <SegmentedControl
          aria-label="Memory scope"
          value={newScope}
          options={[
            { value: 'personal', label: 'Personal' },
            { value: 'household', label: 'Household' },
          ]}
          onChange={(value) => setNewScope(value as 'personal' | 'household')}
          fullWidth
        />
        <Field label="Short title">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="I prefer morning appointments"
          />
        </Field>
        <Field label="What Casa should remember">
          <Textarea
            rows={3}
            value={newContent}
            onChange={(event) => setNewContent(event.target.value)}
            placeholder="Morning appointments work best after school drop-off."
          />
        </Field>
        <Button
          variant="primary"
          leadingIcon={<Plus size={16} />}
          loading={createMutation.isPending}
          disabled={!newTitle.trim() || !newContent.trim()}
          onClick={() => void createMemory()}
        >
          Add memory
        </Button>
      </Card>
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <ChefHat size={20} className="mt-0.5 shrink-0 text-casa-gold" />
          <div className="space-y-1">
            <Text role="body-sm" className="font-semibold text-casa-navy">Food & meal preferences</Text>
            <Text role="caption" muted>Dietary rules, allergies, disliked foods, favorite cuisines, budget, and cooking-time limits stay structured so Meal Planner can apply them reliably.</Text>
          </div>
        </div>
        <Button variant="secondary" onClick={() => navigate('/settings/memory/food-profile')}>
          Manage food preferences
        </Button>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Chip tone="neutral">Total: {rows.length}</Chip>
        <Chip tone="neutral">Personal: {personalCount}</Chip>
        <Chip tone="neutral">Household: {rows.length - personalCount}</Chip>
      </div>
      {error ? <Alert tone="danger" title="Memory update failed">{error}</Alert> : null}
      {!error && status ? <Alert tone="success" title={status} /> : null}
      {!error && query.error ? (
        <Alert tone="danger" title="Memory could not be loaded">
          {query.error instanceof Error ? query.error.message : 'Please try again.'}
        </Alert>
      ) : null}
      {query.isLoading ? (
        <Card className="space-y-2 p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : null}
      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          title="No memory captured yet"
          description="Use Talk & Plan and Casa will start saving stable personal and household context automatically."
        />
      ) : null}
      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <Text role="body-sm" className="font-semibold text-casa-navy">{row.title}</Text>
                <Text role="caption" muted>
                  {row.scope === 'personal' ? 'Personal' : 'Household'} · {row.category ?? 'general'} · {Math.round(row.confidence * 100)}% confidence
                </Text>
              </div>
              {row.can_manage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    leadingIcon={<Pencil size={16} />}
                    onClick={() => editMemory(row)}
                  >
                    Correct
                  </Button>
                  <Button
                    variant="ghost"
                    leadingIcon={<Trash2 size={16} />}
                    onClick={() => void deleteMemory(row.id)}
                    loading={deletingId === row.id}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <Chip tone="neutral">Admin managed</Chip>
              )}
            </div>
            <Text role="body-sm">{row.content}</Text>
          </Card>
        ))}
      </div>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        closeDisabled={correctMutation.isPending}
        title="Correct memory"
      >
        <div className="space-y-4 pt-4">
          <Field label="Title">
            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </Field>
          <Field label="What Casa should remember">
            <Textarea rows={5} value={draftContent} onChange={(event) => setDraftContent(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={correctMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={correctMutation.isPending}
              disabled={!draftTitle.trim() || !draftContent.trim()}
              onClick={() => void saveCorrection()}
            >
              Save correction
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
