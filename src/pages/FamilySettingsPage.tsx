import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, GripVertical, Save, Crown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { FamilyMember } from '../types'

// Preset color palette
const COLOR_OPTIONS = [
  { hex: '#2C3E6B', name: 'Navy' },
  { hex: '#C8A96E', name: 'Gold' },
  { hex: '#4A7C59', name: 'Forest' },
  { hex: '#C0392B', name: 'Red' },
  { hex: '#8E44AD', name: 'Purple' },
  { hex: '#2980B9', name: 'Blue' },
  { hex: '#E67E22', name: 'Orange' },
  { hex: '#16A085', name: 'Teal' },
  { hex: '#D35400', name: 'Burnt Orange' },
  { hex: '#7F8C8D', name: 'Slate' },
]

type EditableMember = Partial<FamilyMember> & { _tempId?: string; _isNew?: boolean }

function emptyMember(): EditableMember {
  return {
    _tempId: Math.random().toString(36).slice(2),
    _isNew: true,
    name: '',
    full_name: '',
    role: 'child',
    color_hex: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)].hex,
    color_name: '',
    phone: '',
    email: '',
    is_admin: false,
    sort_order: 999,
  }
}

export default function FamilySettingsPage() {
  const qc = useQueryClient()
  const { data: members = [], isLoading } = useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('family_members').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const [edits, setEdits] = useState<Record<string, EditableMember>>({})
  const [newMembers, setNewMembers] = useState<EditableMember[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_members').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family-members'] }),
  })

  function getMember(m: FamilyMember): EditableMember {
    return { ...m, ...edits[m.id] }
  }

  function patch(id: string, changes: Partial<EditableMember>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...changes } }))
  }

  function patchNew(tempId: string, changes: Partial<EditableMember>) {
    setNewMembers(prev => prev.map(m => m._tempId === tempId ? { ...m, ...changes } : m))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Update existing members that have edits
      const updates = Object.entries(edits).map(([id, changes]) => {
        const base = members.find(m => m.id === id)!
        const colorMatch = COLOR_OPTIONS.find(c => c.hex === (changes.color_hex ?? base.color_hex))
        return supabase.from('family_members').update({
          ...changes,
          color_name: colorMatch?.name ?? base.color_name,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
      })

      // Insert new members
      const inserts = newMembers
        .filter(m => m.name?.trim())
        .map((m, i) => {
          const colorMatch = COLOR_OPTIONS.find(c => c.hex === m.color_hex)
          return supabase.from('family_members').insert({
            name: m.name!.trim(),
            full_name: m.full_name?.trim() || null,
            role: m.role ?? 'child',
            color_hex: m.color_hex!,
            color_name: colorMatch?.name ?? m.color_hex!,
            phone: m.phone?.trim() || null,
            email: m.email?.trim() || null,
            is_admin: m.is_admin ?? false,
            sort_order: members.length + i,
          })
        })

      await Promise.all([...updates, ...inserts])
      setEdits({})
      setNewMembers([])
      qc.invalidateQueries({ queryKey: ['family-members'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = Object.keys(edits).length > 0 || newMembers.length > 0

  if (isLoading) return <div className="p-6 text-casa-muted animate-breathe">Loading…</div>

  const allRows: EditableMember[] = [
    ...members.map(m => getMember(m)),
    ...newMembers,
  ]

  return (
    <div className="max-w-2xl mx-auto p-6 pb-24">
      <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Settings
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-display-md text-casa-navy mb-1">Family</h1>
          <p className="text-body text-casa-muted">Manage members, colors, and roles.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-40 transition-all"
        >
          <Save size={14} />
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-3">
        {allRows.map((m) => {
          const id = m.id ?? m._tempId!
          const isNew = !!m._isNew
          const isExpanded = expandedId === id
          const colorHex = m.color_hex ?? '#2C3E6B'

          return (
            <div key={id} className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden">
              {/* Row header — tap to expand */}
              <button
                className="w-full flex items-center gap-3 p-4 text-left"
                onClick={() => setExpandedId(isExpanded ? null : id)}
              >
                <GripVertical size={16} className="text-casa-muted shrink-0" />
                {/* Color swatch */}
                <span
                  className="w-8 h-8 rounded-full shrink-0 border-2 border-white shadow-sm"
                  style={{ backgroundColor: colorHex }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-body-sm text-casa-navy leading-none">
                    {m.name || <span className="text-casa-muted italic">New member</span>}
                    {m.is_admin && <Crown size={12} className="inline ml-1.5 text-casa-gold" />}
                  </p>
                  <p className="text-caption text-casa-muted mt-0.5 capitalize">{m.role ?? 'child'} · {m.phone || m.email || 'No contact'}</p>
                </div>
                <span className="text-caption text-casa-muted">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-casa-divider px-4 pb-4 space-y-4 pt-4">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Display Name</label>
                      <input
                        type="text"
                        value={m.name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { name: e.target.value }) : patch(m.id!, { name: e.target.value })}
                        placeholder="Jake"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Full Name</label>
                      <input
                        type="text"
                        value={m.full_name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { full_name: e.target.value }) : patch(m.id!, { full_name: e.target.value })}
                        placeholder="Jacob Tabor"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Role</label>
                    <div className="flex gap-2">
                      {(['parent', 'child'] as const).map(r => (
                        <button
                          key={r}
                          onClick={() => isNew ? patchNew(m._tempId!, { role: r }) : patch(m.id!, { role: r })}
                          className={cn(
                            'flex-1 py-2 rounded-button border text-body-sm font-medium transition-all capitalize',
                            (m.role ?? 'child') === r
                              ? 'bg-casa-navy text-white border-casa-navy'
                              : 'bg-white border-casa-border text-casa-navy hover:bg-casa-bg',
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(c => (
                        <button
                          key={c.hex}
                          onClick={() => isNew ? patchNew(m._tempId!, { color_hex: c.hex, color_name: c.name }) : patch(m.id!, { color_hex: c.hex, color_name: c.name })}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-all',
                            colorHex === c.hex ? 'border-casa-navy scale-110 shadow-md' : 'border-transparent hover:scale-105',
                          )}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Phone</label>
                      <input
                        type="tel"
                        value={m.phone ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { phone: e.target.value }) : patch(m.id!, { phone: e.target.value })}
                        placeholder="+1 555 000 0000"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Email</label>
                      <input
                        type="email"
                        value={m.email ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { email: e.target.value }) : patch(m.id!, { email: e.target.value })}
                        placeholder="jake@example.com"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                  </div>

                  {/* Admin toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => isNew ? patchNew(m._tempId!, { is_admin: !m.is_admin }) : patch(m.id!, { is_admin: !m.is_admin })}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors shrink-0',
                        m.is_admin ? 'bg-casa-gold' : 'bg-casa-border',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        m.is_admin ? 'translate-x-5' : 'translate-x-0.5',
                      )} />
                    </div>
                    <span className="text-body-sm text-casa-navy">
                      Admin <span className="text-casa-muted">(default event owner, AI fallback)</span>
                    </span>
                  </label>

                  {/* Delete */}
                  {!isNew && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from the family?`)) {
                          deleteMutation.mutate(m.id!)
                          setExpandedId(null)
                        }
                      }}
                      className="flex items-center gap-2 text-body-sm text-casa-error hover:underline"
                    >
                      <Trash2 size={13} /> Remove {m.name}
                    </button>
                  )}
                  {isNew && (
                    <button
                      onClick={() => setNewMembers(prev => prev.filter(x => x._tempId !== m._tempId))}
                      className="flex items-center gap-2 text-body-sm text-casa-error hover:underline"
                    >
                      <Trash2 size={13} /> Discard
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add member */}
        <button
          onClick={() => {
            const nm = emptyMember()
            setNewMembers(prev => [...prev, nm])
            setExpandedId(nm._tempId!)
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-card border-2 border-dashed border-casa-border text-casa-muted hover:border-casa-gold hover:text-casa-gold transition-all text-body-sm font-medium"
        >
          <Plus size={16} /> Add Family Member
        </button>
      </div>
    </div>
  )
}
