import { useState, useRef } from 'react'
import { AlertCircle, CheckCircle, Lock, LogOut, RefreshCw, Trash2, Calendar } from 'lucide-react'
import BounceScroll from '../components/shared/BounceScroll'

interface OperationPlan {
  operation: 'delete' | 'add' | 'edit'
  description: string
  scope: {
    dateRangeStart?: string
    dateRangeEnd?: string
    titleFilter?: string
    memberFilter?: string[]
  }
  estimatedCount?: number
  sampleRows?: SampleRow[]
}

interface ExecutionResult {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  rowsAffected: number
  errors: string[]
  startedAt: string
  completedAt?: string
}

interface SampleRow {
  id: string
  title: string
  start_time: string
  status: string | null
  member_name?: string | null
  member_names?: string[]
  event_members?: Array<{
    family_member?: {
      name?: string | null
    } | null
  }>
}

type AuthPhase = 'pin-entry' | 'authenticated' | 'request' | 'preview' | 'confirm' | 'executing' | 'result'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!

function getSampleRowMembers(row: SampleRow): string {
  if (typeof row.member_name === 'string' && row.member_name.trim()) return row.member_name.trim()
  if (Array.isArray(row.member_names) && row.member_names.length > 0) return row.member_names.join(', ')
  if (Array.isArray(row.event_members)) {
    const names = Array.from(
      new Set(
        row.event_members
          .map((member) => member.family_member?.name?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    )
    if (names.length > 0) return names.join(', ')
  }
  return '—'
}

export default function AdminOpsPage() {
  const [phase, setPhase] = useState<AuthPhase>('pin-entry')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [request, setRequest] = useState('')
  const [plan, setPlan] = useState<OperationPlan | null>(null)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestInputRef = useRef<HTMLTextAreaElement>(null)

  const ADMIN_PIN = '5579'

  const handlePinSubmit = () => {
    if (pin === ADMIN_PIN) {
      setPinError('')
      setPhase('authenticated')
      setPin('')
    } else {
      setPinError('Invalid PIN')
      setPin('')
    }
  }

  const handleLogout = () => {
    setPhase('pin-entry')
    setPlan(null)
    setResult(null)
    setError('')
    setRequest('')
  }

  const handleGeneratePlan = async () => {
    if (!request.trim()) {
      setError('Please describe what you want to do')
      return
    }

    setLoading(true)
    setError('')
    try {
      // Call edge function to parse request and generate plan
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-ops-generate-plan`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ request }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Error ${response.status}`)
      }

      const planData: OperationPlan = await response.json()
      setPlan(planData)
      setPhase('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!plan) return

    setLoading(true)
    setError('')
    setPhase('executing')

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-ops-execute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ plan }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Error ${response.status}`)
      }

      const resultData: ExecutionResult = await response.json()
      setResult(resultData)
      setPhase('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed')
      setPhase('preview')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPhase('authenticated')
    setPlan(null)
    setResult(null)
    setError('')
    setRequest('')
  }

  // PIN Entry Phase
  if (phase === 'pin-entry') {
    return (
      <BounceScroll className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-casa-gold/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-casa-gold" />
            </div>
            <h1 className="font-display text-display-sm text-casa-navy mb-2">Admin Operations</h1>
            <p className="text-body text-casa-muted">Mass calendar operations (delete, add, edit)</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-casa-navy mb-2">Admin PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value)
                  setPinError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                placeholder="Enter PIN"
                className="w-full px-4 py-2 border border-casa-border rounded-lg focus:outline-none focus:ring-2 focus:ring-casa-gold"
              />
              {pinError && <p className="text-sm text-red-500 mt-1">{pinError}</p>}
            </div>

            <button
              onClick={handlePinSubmit}
              disabled={!pin.trim()}
              className="w-full px-4 py-2 bg-casa-gold text-white font-medium rounded-lg hover:bg-casa-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Authenticate
            </button>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>Safety first:</strong> Scoped requests are recommended for precision.
                Unscoped deletes require explicit wording (for example, "delete all events").
              </p>
            </div>
          </div>
        </div>
      </BounceScroll>
    )
  }

  // Authenticated + Request Entry Phase
  if (phase === 'authenticated' || phase === 'request') {
    return (
      <BounceScroll className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-display-sm text-casa-navy">Bulk Calendar Operations</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-casa-muted hover:text-casa-navy transition-colors"
            >
              <LogOut size={16} />
              <span className="text-sm">Exit</span>
            </button>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-casa-navy mb-2">
                What do you want to do?
              </label>
              <p className="text-xs text-casa-muted mb-3">
                Examples: "Delete all Feed Diana's Cat events in July 2025", "Add weekly standup Monday 10 AM for Q3", "Change all 3 PM slots to 2 PM"
              </p>
              <textarea
                ref={requestInputRef}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Natural language request..."
                rows={5}
                className="w-full px-4 py-3 border border-casa-border rounded-lg focus:outline-none focus:ring-2 focus:ring-casa-gold font-sans text-body resize-none"
              />
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Recommended scope:</strong> Add a date range, title pattern, or member filter for precision.
                You can still preview broad requests first before executing.
              </p>
            </div>

            <button
              onClick={handleGeneratePlan}
              disabled={loading || !request.trim()}
              className="px-6 py-3 bg-casa-gold text-white font-medium rounded-lg hover:bg-casa-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading && <RefreshCw size={16} className="animate-spin" />}
              {loading ? 'Generating Plan...' : 'Generate Plan'}
            </button>
          </div>
        </div>
      </BounceScroll>
    )
  }

  // Preview Phase
  if (phase === 'preview' && plan) {
    return (
      <BounceScroll className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-display-sm text-casa-navy">Preview Operation</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-casa-muted hover:text-casa-navy transition-colors"
            >
              <LogOut size={16} />
              <span className="text-sm">Exit</span>
            </button>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Operation Summary */}
            <div className="p-6 bg-casa-surface rounded-lg border border-casa-border">
              <h2 className="font-display text-heading text-casa-navy mb-4">Operation Summary</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-1">Operation Type</p>
                  <p className="text-body font-medium text-casa-navy capitalize flex items-center gap-2">
                    {plan.operation === 'delete' && <Trash2 size={16} className="text-red-500" />}
                    {plan.operation === 'add' && <Calendar size={16} className="text-green-500" />}
                    {plan.operation === 'edit' && <RefreshCw size={16} className="text-blue-500" />}
                    {plan.operation}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-1">Estimated Impact</p>
                  <p className="text-body font-medium text-casa-navy">{plan.estimatedCount || '?'} rows</p>
                </div>
              </div>

              <div className="p-4 bg-casa-bg rounded border border-casa-border mb-4">
                <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-2">Description</p>
                <p className="text-body text-casa-navy">{plan.description}</p>
              </div>

              {plan.scope && (
                <div className="p-4 bg-casa-bg rounded border border-casa-border">
                  <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-2">Scope</p>
                  <dl className="space-y-2 text-sm text-casa-navy">
                    {plan.scope.dateRangeStart && (
                      <>
                        <dt className="text-xs font-medium text-casa-muted">Date range:</dt>
                        <dd className="ml-2">
                          {plan.scope.dateRangeStart} to {plan.scope.dateRangeEnd || 'end of time'}
                        </dd>
                      </>
                    )}
                    {plan.scope.titleFilter && (
                      <>
                        <dt className="text-xs font-medium text-casa-muted">Title filter:</dt>
                        <dd className="ml-2">{plan.scope.titleFilter}</dd>
                      </>
                    )}
                    {plan.scope.memberFilter && plan.scope.memberFilter.length > 0 && (
                      <>
                        <dt className="text-xs font-medium text-casa-muted">Member filter:</dt>
                        <dd className="ml-2">{plan.scope.memberFilter.join(', ')}</dd>
                      </>
                    )}
                  </dl>
                </div>
              )}
            </div>

            {/* Sample Rows */}
            {plan.sampleRows && plan.sampleRows.length > 0 && (
              <div className="p-6 bg-casa-surface rounded-lg border border-casa-border">
                <h2 className="font-display text-heading text-casa-navy mb-4">Sample Rows ({plan.sampleRows.length} of {plan.estimatedCount})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-casa-border">
                        <th className="text-left px-4 py-2 text-xs font-medium text-casa-muted">Title</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-casa-muted">Member</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-casa-muted">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-casa-muted">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-casa-border">
                      {plan.sampleRows.map((row, i) => (
                        <tr key={i} className="hover:bg-casa-bg transition-colors">
                          <td className="px-4 py-2 text-casa-navy font-medium">{row.title}</td>
                          <td className="px-4 py-2 text-casa-muted">{getSampleRowMembers(row)}</td>
                          <td className="px-4 py-2 text-casa-muted">{new Date(row.start_time).toLocaleDateString()}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              row.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              row.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Confirmation */}
            {plan.operation === 'delete' ? (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="font-display text-heading text-amber-900 mb-3">Confirm Execution</h3>
                <p className="text-sm text-amber-800 mb-4">
                  This operation will affect <strong>{plan.estimatedCount} rows</strong>. Matching events will be marked
                  as cancelled.
                </p>
                <p className="text-xs text-amber-700 mb-4">
                  Type <strong>CONFIRM</strong> below to proceed, or go back to edit the request.
                </p>

                <ConfirmationStep onConfirm={handleConfirm} loading={loading} onCancel={() => setPhase('request')} />
              </div>
            ) : (
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-display text-heading text-blue-900 mb-3">Preview Ready</h3>
                <p className="text-sm text-blue-800 mb-4">
                  Query/add/edit requests are currently preview-only in this screen. Refine the request as needed, or
                  use a delete/archive request when you want to execute a bulk update.
                </p>
                <button
                  onClick={() => setPhase('request')}
                  className="px-4 py-2 bg-casa-surface border border-casa-border text-casa-navy font-medium rounded-lg hover:bg-casa-bg transition-colors"
                >
                  Back to request
                </button>
              </div>
            )}
          </div>
        </div>
      </BounceScroll>
    )
  }

  // Executing Phase
  if (phase === 'executing') {
    return (
      <BounceScroll className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-casa-gold/10 flex items-center justify-center mx-auto mb-4">
            <RefreshCw size={32} className="text-casa-gold animate-spin" />
          </div>
          <h2 className="font-display text-display-sm text-casa-navy mb-2">Executing Operation</h2>
          <p className="text-body text-casa-muted">This may take a minute depending on the number of rows...</p>
        </div>
      </BounceScroll>
    )
  }

  // Result Phase
  if (phase === 'result' && result) {
    const success = result.status === 'completed' && result.errors.length === 0
    return (
      <BounceScroll className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              success ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {success ? (
                <CheckCircle size={32} className="text-green-600" />
              ) : (
                <AlertCircle size={32} className="text-red-600" />
              )}
            </div>
            <h1 className="font-display text-display-sm text-casa-navy mb-2">
              {success ? 'Operation Completed' : 'Operation Failed'}
            </h1>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-casa-surface rounded-lg border border-casa-border text-center">
                <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-2">Status</p>
                <p className="text-heading font-medium text-casa-navy capitalize">{result.status}</p>
              </div>
              <div className="p-4 bg-casa-surface rounded-lg border border-casa-border text-center">
                <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-2">Rows Affected</p>
                <p className="text-heading font-medium text-casa-navy">{result.rowsAffected}</p>
              </div>
              <div className="p-4 bg-casa-surface rounded-lg border border-casa-border text-center">
                <p className="text-xs text-casa-muted uppercase tracking-wide font-medium mb-2">Started</p>
                <p className="text-sm font-medium text-casa-muted">{new Date(result.startedAt).toLocaleTimeString()}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
                <h2 className="font-display text-heading text-red-900 mb-4">Errors</h2>
                <ul className="space-y-2">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-sm text-red-700">• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-6 bg-casa-surface rounded-lg border border-casa-border">
              <h2 className="font-display text-heading text-casa-navy mb-4">Audit Trail</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-casa-muted uppercase mb-1">Job ID</dt>
                  <dd className="font-mono text-casa-navy break-all">{result.jobId}</dd>
                </div>
                {result.completedAt && (
                  <div>
                    <dt className="text-xs font-medium text-casa-muted uppercase mb-1">Completed At</dt>
                    <dd className="text-casa-navy">{new Date(result.completedAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>

            <button
              onClick={handleReset}
              className="w-full px-6 py-3 bg-casa-gold text-white font-medium rounded-lg hover:bg-casa-gold/90 transition-colors"
            >
              Start New Operation
            </button>
          </div>
        </div>
      </BounceScroll>
    )
  }

  return null
}

// Confirmation input component
function ConfirmationStep({ onConfirm, loading, onCancel }: { onConfirm: () => void; loading: boolean; onCancel: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const isValid = confirmText === 'CONFIRM'

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
        placeholder="Type CONFIRM to proceed"
        className="w-full px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-widest uppercase"
      />
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-casa-border text-casa-navy font-medium rounded-lg hover:bg-casa-bg disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={!isValid || loading}
          className="flex-1 px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading && <RefreshCw size={16} className="animate-spin" />}
          {loading ? 'Executing...' : 'Execute Operation'}
        </button>
      </div>
    </div>
  )
}
