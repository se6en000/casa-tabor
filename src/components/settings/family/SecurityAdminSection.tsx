import { useState, type FormEvent } from 'react'
import { ShieldCheck, Calendar, Trash2 } from 'lucide-react'
import { Button, Input, Modal, SegmentedControl, Field } from '../../ui'
import type { FamilyMember, MemberAvailabilityException } from '../../../types'

interface SecurityAdminSectionProps {
  members: FamilyMember[]
  exceptions: MemberAvailabilityException[]
  adminSessionToken: string | null
  onUnlockAdmin: (pin: string) => Promise<void>
  onBootstrapAdmin: (token: string, pin: string) => Promise<void>
  onSetMemberPin: (memberId: string, pin: string) => Promise<void>
  onAddException: (memberId: string, date: string, note?: string) => Promise<void>
  onRemoveException: (id: string) => Promise<void>
}

export default function SecurityAdminSection({
  members,
  exceptions,
  adminSessionToken,
  onUnlockAdmin,
  onBootstrapAdmin,
  onSetMemberPin,
  onAddException,
  onRemoveException,
}: SecurityAdminSectionProps) {
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historySetupMode, setHistorySetupMode] = useState<'unlock' | 'bootstrap'>('unlock')
  const [adminPin, setAdminPin] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [memberPinDrafts, setMemberPinDrafts] = useState<Record<string, string>>({})
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)

  const [selectedMemberId, setSelectedMemberId] = useState<string>(members[0]?.id || '')
  const [dayOffDate, setDayOffDate] = useState<string>('')
  const [dayOffNote, setDayOffNote] = useState<string>('')

  const handleAdminSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setHistoryError(null)
    try {
      if (historySetupMode === 'bootstrap') {
        await onBootstrapAdmin(bootstrapToken, adminPin)
      } else {
        await onUnlockAdmin(adminPin)
      }
      setHistoryModalOpen(false)
      setAdminPin('')
      setBootstrapToken('')
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to unlock household admin')
    }
  }

  const handleSaveMemberPin = async (memberId: string) => {
    const pin = memberPinDrafts[memberId]
    if (!pin) return
    setSavingMemberId(memberId)
    try {
      await onSetMemberPin(memberId, pin)
      setMemberPinDrafts((prev) => ({ ...prev, [memberId]: '' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save member PIN')
    } finally {
      setSavingMemberId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Admin PIN & Private History */}
      <div className="bg-casa-surface p-5 rounded-card border border-casa-border shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-casa-gold/10 flex items-center justify-center text-casa-gold shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-body-sm text-casa-navy">Household Security & Private History</h3>
              <p className="text-caption text-casa-muted">
                Manage 6–12 digit member PINs for private conversations and admin access.
              </p>
            </div>
          </div>

          <Button
            variant={adminSessionToken ? 'secondary' : 'strong'}
            size="sm"
            onClick={() => setHistoryModalOpen(true)}
            className="text-caption font-semibold"
          >
            {adminSessionToken ? 'Admin Session Active' : 'Unlock Household Admin'}
          </Button>
        </div>

        {adminSessionToken ? (
          <div className="pt-3 border-t border-casa-divider space-y-3">
            <p className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
              Set / Update Member Private PINs
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {members.map((m) => (
                <div key={m.id} className="p-3 rounded-xl border border-casa-border bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-body-sm text-casa-navy">{m.name}</span>
                    <span className="text-2xs text-casa-muted capitalize">{m.role}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{6,12}"
                      placeholder="6–12 digits"
                      value={memberPinDrafts[m.id] || ''}
                      onChange={(e) => setMemberPinDrafts({ ...memberPinDrafts, [m.id]: e.target.value })}
                      className="h-8 text-body-sm"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingMemberId === m.id || !memberPinDrafts[m.id]}
                      onClick={() => handleSaveMemberPin(m.id)}
                      className="h-8 px-2.5 text-caption font-semibold shrink-0"
                    >
                      {savingMemberId === m.id ? 'Saving…' : 'Set PIN'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-surface-subtle text-caption text-casa-muted">
            Unlock household admin with your PIN to configure or reset family members' private-history PINs.
          </div>
        )}
      </div>

      {/* Global Day-Off & Vacation Overrides */}
      <div className="bg-casa-surface p-5 rounded-card border border-casa-border shadow-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <h3 className="font-bold text-body-sm text-casa-navy">Day-Off & Vacation Exceptions</h3>
            <p className="text-caption text-casa-muted">
              Add dates when members or drivers are away (e.g. Giselle vacation or school teacher workdays).
            </p>
          </div>
        </div>

        {/* Add Exception Form */}
        <div className="p-3.5 rounded-xl border border-casa-border bg-surface-subtle grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="block text-2xs font-bold text-casa-muted uppercase mb-1">Member</label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-casa-border bg-white text-body-sm font-medium text-casa-navy"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-2xs font-bold text-casa-muted uppercase mb-1">Date</label>
            <Input
              type="date"
              value={dayOffDate}
              onChange={(e) => setDayOffDate(e.target.value)}
              className="h-9 text-body-sm"
            />
          </div>

          <div>
            <label className="block text-2xs font-bold text-casa-muted uppercase mb-1">Reason / Note</label>
            <Input
              type="text"
              placeholder="e.g. Day Off, Teacher Workday"
              value={dayOffNote}
              onChange={(e) => setDayOffNote(e.target.value)}
              className="h-9 text-body-sm"
            />
          </div>

          <Button
            variant="strong"
            disabled={!dayOffDate || !selectedMemberId}
            onClick={async () => {
              if (selectedMemberId && dayOffDate) {
                await onAddException(selectedMemberId, dayOffDate, dayOffNote)
                setDayOffDate('')
                setDayOffNote('')
              }
            }}
            className="h-9 text-caption font-semibold"
          >
            Add Exception
          </Button>
        </div>

        {/* Exceptions List */}
        <div className="space-y-2 pt-1">
          {exceptions.length === 0 ? (
            <p className="text-caption text-casa-muted italic">No upcoming day-off exceptions registered.</p>
          ) : (
            exceptions.map((ex) => {
              const mem = members.find((m) => m.id === ex.member_id)
              const start = new Date(ex.start_at)
              const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              return (
                <div
                  key={ex.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-casa-border bg-white text-body-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-casa-navy">{mem?.name || 'Member'}:</span>
                    <span className="text-casa-navy font-medium">{dateStr}</span>
                    {ex.note && <span className="text-casa-muted text-caption">({ex.note})</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveException(ex.id)}
                    className="h-7 px-2 text-caption text-casa-error hover:bg-casa-error/10 font-semibold"
                  >
                    <Trash2 size={13} className="mr-1" /> Remove
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Admin Unlock Modal */}
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Household Admin Access"
        size="sm"
      >
        <form className="space-y-4 pt-4" onSubmit={handleAdminSubmit}>
          <SegmentedControl
            aria-label="Admin action"
            value={historySetupMode}
            options={[
              { value: 'unlock', label: 'Unlock Admin' },
              { value: 'bootstrap', label: 'First Setup' },
            ]}
            onChange={setHistorySetupMode}
            fullWidth
          />

          {historySetupMode === 'bootstrap' && (
            <Field label="Setup Token" hint="Server-provisioned initial token">
              <Input
                type="password"
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                required
              />
            </Field>
          )}

          <Field label="Household Admin PIN" error={historyError}>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              placeholder="6 to 12 digits"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              required
            />
          </Field>

          <Button type="submit" variant="strong" fullWidth>
            {historySetupMode === 'bootstrap' ? 'Initialize Admin PIN' : 'Unlock Access'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
