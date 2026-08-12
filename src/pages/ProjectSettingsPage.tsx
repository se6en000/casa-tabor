import { useState } from 'react'
import { Check, FolderKanban, Pause, Pencil, Play, Archive, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  SegmentedControl,
  SkeletonRow,
  Text,
  Textarea,
} from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import { useProfileSession } from '../contexts/ProfileSessionContext'
import { invokeAssistantHistory } from '../lib/assistantConversationHistoryClient'

type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'
type ProjectItem = {
  id: string
  kind: 'goal' | 'decision' | 'commitment' | 'open_question' | 'next_action'
  content: string
  status: 'open' | 'done' | 'decided' | 'superseded' | 'dismissed'
  due_at: string | null
}
type ProjectRow = {
  id: string
  title: string
  summary: string
  status: ProjectStatus
  briefing_state: 'active' | 'snoozed' | 'not_relevant' | 'decided'
  target_date: string | null
  version: number
  last_activity_at: string
  source_conversation_id: string
  ai_project_items: ProjectItem[]
}

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
] as const

const ITEM_LABELS: Record<ProjectItem['kind'], string> = {
  goal: 'Goal',
  decision: 'Decision',
  commitment: 'Commitment',
  open_question: 'Open question',
  next_action: 'Next action',
}

export default function ProjectSettingsPage() {
  const { profile } = useProfileSession()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<ProjectStatus>('active')
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSummary, setDraftSummary] = useState('')
  const [draftTargetDate, setDraftTargetDate] = useState('')
  const [draftGoalItem, setDraftGoalItem] = useState('')
  const [draftNextActionItem, setDraftNextActionItem] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const query = useQuery<ProjectRow[]>({
    queryKey: ['ai-projects', profile?.memberId ?? 'none'],
    enabled: Boolean(profile?.token),
    queryFn: async () => {
      if (!profile?.token) return []
      const result = await invokeAssistantHistory<{ projects: ProjectRow[] }>(profile.token, {
        action: 'list_projects',
      })
      return result.projects
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: { title: string; summary?: string; target_date?: string | null; items?: { kind: string; content: string }[] }) => {
      if (!profile?.token) throw new Error('Sign in to manage planning projects.')
      await invokeAssistantHistory(profile.token, { action: 'create_project', ...payload })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-projects', profile?.memberId ?? 'none'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!profile?.token) throw new Error('Sign in to manage planning projects.')
      await invokeAssistantHistory(profile.token, { action: 'update_project', ...payload })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-projects', profile?.memberId ?? 'none'] })
    },
  })

  const itemMutation = useMutation({
    mutationFn: async (payload: { projectId: string; itemId: string; status: 'done' | 'decided' }) => {
      if (!profile?.token) throw new Error('Sign in to manage planning projects.')
      await invokeAssistantHistory(profile.token, {
        action: 'update_project_item',
        project_id: payload.projectId,
        item_id: payload.itemId,
        status: payload.status,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-projects', profile?.memberId ?? 'none'] })
    },
  })

  const briefingMutation = useMutation({
    mutationFn: async (projectId: string) => {
      if (!profile?.token) throw new Error('Sign in to manage planning projects.')
      await invokeAssistantHistory(profile.token, {
        action: 'update_project_briefing',
        project_id: projectId,
        command: 'reactivate',
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-projects', profile?.memberId ?? 'none'] })
    },
  })

  const projects = query.data ?? []
  const visible = projects.filter((project) => project.status === filter)

  function openCreate() {
    setDraftTitle('')
    setDraftSummary('')
    setDraftTargetDate('')
    setDraftGoalItem('')
    setDraftNextActionItem('')
    setError(null)
    setStatus(null)
    setCreating(true)
  }

  async function saveCreate() {
    if (!draftTitle.trim()) return
    setError(null)
    setStatus(null)
    try {
      const items: { kind: string; content: string }[] = []
      if (draftGoalItem.trim()) items.push({ kind: 'goal', content: draftGoalItem.trim() })
      if (draftNextActionItem.trim()) items.push({ kind: 'next_action', content: draftNextActionItem.trim() })

      await createMutation.mutateAsync({
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        target_date: draftTargetDate || null,
        items,
      })
      setCreating(false)
      setStatus('Planning project created.')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create project.')
    }
  }

  async function updateProject(project: ProjectRow, nextStatus?: ProjectStatus) {
    setActingId(project.id)
    setError(null)
    setStatus(null)
    try {
      await updateMutation.mutateAsync({
        project_id: project.id,
        title: project.title,
        summary: project.summary,
        target_date: project.target_date,
        status: nextStatus ?? project.status,
      })
      setStatus(nextStatus ? `Project ${nextStatus}.` : 'Project updated.')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this project.')
    } finally {
      setActingId(null)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setError(null)
    setStatus(null)
    try {
      await updateMutation.mutateAsync({
        project_id: editing.id,
        title: draftTitle.trim(),
        summary: draftSummary.trim(),
        target_date: draftTargetDate || null,
        status: editing.status,
      })
      setEditing(null)
      setStatus('Project updated.')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this project.')
    }
  }

  async function resolveItem(projectId: string, item: ProjectItem) {
    setActingId(item.id)
    setError(null)
    try {
      await itemMutation.mutateAsync({
        projectId,
        itemId: item.id,
        status: item.kind === 'decision' || item.kind === 'open_question' ? 'decided' : 'done',
      })
    } catch (itemError) {
      setError(itemError instanceof Error ? itemError.message : 'Could not update this project item.')
    } finally {
      setActingId(null)
    }
  }

  async function reactivateBriefing(projectId: string) {
    setActingId(projectId)
    setError(null)
    try {
      await briefingMutation.mutateAsync(projectId)
      setStatus('Project restored to your daily brief.')
    } catch (briefingError) {
      setError(briefingError instanceof Error ? briefingError.message : 'Could not restore this project.')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        icon={FolderKanban}
        title="Planning projects"
        description="Goals, decisions, commitments, questions, and next actions captured from your private Talk & Plan conversations."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Project status"
          value={filter}
          options={FILTERS}
          onChange={(value) => setFilter(value as ProjectStatus)}
          fullWidth={false}
        />
        <Button variant="primary" size="sm" leadingIcon={<Plus size={15} />} onClick={openCreate}>
          New project
        </Button>
      </div>
      {!profile?.token ? (
        <Alert tone="warning" title="Private profile required">
          Sign in to your private profile in Talk & Plan to view and manage your planning projects.
        </Alert>
      ) : null}
      {error ? <Alert tone="danger" title="Project update failed">{error}</Alert> : null}
      {!error && status ? <Alert tone="success" title={status} /> : null}
      {!error && query.error ? (
        <Alert tone="danger" title="Projects could not be loaded">
          {query.error instanceof Error ? query.error.message : 'Please try again.'}
        </Alert>
      ) : null}
      {query.isLoading ? (
        <Card className="space-y-2 p-4" aria-label="Loading planning projects">
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : null}
      {!query.isLoading && visible.length === 0 ? (
        <EmptyState
          title={`No ${filter} projects`}
          description='Start a private Talk & Plan conversation with “Help me plan…” and Casa will organize the project here.'
        />
      ) : null}
      <div className="space-y-3">
        {visible.map((project) => {
          const openItems = project.ai_project_items.filter((item) => item.status === 'open')
          return (
            <Card key={project.id} className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Text role="body-sm" className="font-semibold text-casa-navy">{project.title}</Text>
                  <Text role="caption" muted>
                    Version {project.version} · {openItems.length} open · {project.target_date ? `Target ${project.target_date}` : 'No target date'}
                  </Text>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip tone={project.status === 'active' ? 'success' : 'neutral'}>{project.status}</Chip>
                  {project.briefing_state !== 'active' ? <Chip tone="neutral">Daily brief: {project.briefing_state.replace('_', ' ')}</Chip> : null}
                </div>
              </div>
              {project.summary ? <Text role="body-sm">{project.summary}</Text> : null}
              {openItems.length > 0 ? (
                <div className="space-y-2">
                  {openItems.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-casa-border bg-casa-bg p-3">
                      <div className="min-w-0 space-y-1">
                        <Chip size="sm" tone="neutral">{ITEM_LABELS[item.kind]}</Chip>
                        <Text role="body-sm">{item.content}</Text>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={<Check size={15} />}
                        loading={actingId === item.id}
                        onClick={() => void resolveItem(project.id, item)}
                      >
                        {item.kind === 'decision' || item.kind === 'open_question' ? 'Mark decided' : 'Done'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" leadingIcon={<Pencil size={15} />} onClick={() => openEdit(project)}>
                  Edit
                </Button>
                {project.status === 'active' ? (
                  <Button variant="ghost" size="sm" leadingIcon={<Pause size={15} />} loading={actingId === project.id} onClick={() => void updateProject(project, 'paused')}>
                    Pause
                  </Button>
                ) : project.status === 'paused' ? (
                  <Button variant="ghost" size="sm" leadingIcon={<Play size={15} />} loading={actingId === project.id} onClick={() => void updateProject(project, 'active')}>
                    Resume
                  </Button>
                ) : null}
                {!['completed', 'archived'].includes(project.status) ? (
                  <Button variant="ghost" size="sm" leadingIcon={<Check size={15} />} loading={actingId === project.id} onClick={() => void updateProject(project, 'completed')}>
                    Complete
                  </Button>
                ) : null}
                {project.status !== 'archived' ? (
                  <Button variant="ghost" size="sm" leadingIcon={<Archive size={15} />} loading={actingId === project.id} onClick={() => void updateProject(project, 'archived')}>
                    Archive
                  </Button>
                ) : null}
                {project.status === 'active' && project.briefing_state !== 'active' ? (
                  <Button variant="secondary" size="sm" loading={actingId === project.id} onClick={() => void reactivateBriefing(project.id)}>
                    Show in daily brief
                  </Button>
                ) : null}
              </div>
            </Card>
          )
        })}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} closeDisabled={updateMutation.isPending} title="Edit planning project">
        <div className="space-y-4 pt-4">
          <Field label="Project title">
            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </Field>
          <Field label="Current plan">
            <Textarea rows={5} value={draftSummary} onChange={(event) => setDraftSummary(event.target.value)} />
          </Field>
          <Field label="Target date">
            <Input type="date" value={draftTargetDate} onChange={(event) => setDraftTargetDate(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>Cancel</Button>
            <Button variant="primary" loading={updateMutation.isPending} disabled={!draftTitle.trim()} onClick={() => void saveEdit()}>
              Save project
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} closeDisabled={createMutation.isPending} title="New planning project">
        <div className="space-y-4 pt-4">
          <Field label="Project title">
            <Input placeholder="e.g. Owen's 5th Birthday, Backyard Landscaping" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </Field>
          <Field label="Summary / Overview">
            <Textarea rows={3} placeholder="Brief summary of goals and context..." value={draftSummary} onChange={(event) => setDraftSummary(event.target.value)} />
          </Field>
          <Field label="Target date (optional)">
            <Input type="date" value={draftTargetDate} onChange={(event) => setDraftTargetDate(event.target.value)} />
          </Field>
          <Field label="Primary goal (optional)">
            <Input placeholder="e.g. Host 15 kids at local park" value={draftGoalItem} onChange={(event) => setDraftGoalItem(event.target.value)} />
          </Field>
          <Field label="First next action (optional)">
            <Input placeholder="e.g. Reserve pavilion and order cake" value={draftNextActionItem} onChange={(event) => setDraftNextActionItem(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button variant="primary" loading={createMutation.isPending} disabled={!draftTitle.trim()} onClick={() => void saveCreate()}>
              Create project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
