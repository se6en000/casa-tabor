import { useEffect, useState } from 'react'
import { ChefHat, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_FOOD_PROFILE, normalizeFoodProfile, type FoodProfile } from '../lib/foodProfile'
import { formatSupabaseError } from '../lib/formatSupabaseError'

export default function FoodProfileSettingsPage() {
  const [profile, setProfile] = useState<FoodProfile>(DEFAULT_FOOD_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: loadError } = await supabase.from('settings').select('value').eq('key', 'food_profile').maybeSingle()
        if (loadError) throw loadError
        if (!active) return
        setProfile(normalizeFoodProfile(data?.value))
      } catch (loadError) {
        if (!active) return
        setError(formatSupabaseError(loadError, 'Could not load food profile'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  async function saveProfile() {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const normalized = normalizeFoodProfile(profile)
      const { error: saveError } = await supabase.from('settings').upsert(
        { key: 'food_profile', value: normalized, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      if (saveError) throw saveError
      setProfile(normalized)
      setStatus('Food profile saved.')
    } catch (saveError) {
      setError(formatSupabaseError(saveError, 'Could not save food profile'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-casa-muted animate-breathe">Loading food profile…</p>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-casa-border bg-casa-surface p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-casa-border bg-casa-bg flex items-center justify-center text-casa-gold">
            <ChefHat size={18} />
          </div>
          <div>
            <h2 className="font-display text-heading text-casa-navy">Food Profile</h2>
            <p className="text-body-sm text-casa-muted">Used by Meal Planner AI for budget, overlap, and preferences.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="rounded-card border border-casa-border bg-casa-surface p-3">
          <p className="text-caption text-casa-muted mb-1">Household size</p>
          <input type="number" min={1} max={12} value={profile.householdSize} onChange={(event) => setProfile((prev) => ({ ...prev, householdSize: Number(event.target.value) }))} className="w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm" />
        </label>
        <label className="rounded-card border border-casa-border bg-casa-surface p-3">
          <p className="text-caption text-casa-muted mb-1">Weekly budget (USD)</p>
          <input type="number" min={20} max={2000} value={profile.weeklyBudgetUsd} onChange={(event) => setProfile((prev) => ({ ...prev, weeklyBudgetUsd: Number(event.target.value) }))} className="w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm" />
        </label>
        <label className="rounded-card border border-casa-border bg-casa-surface p-3">
          <p className="text-caption text-casa-muted mb-1">Default meals per week</p>
          <input type="number" min={1} max={14} value={profile.defaultMealsPerWeek} onChange={(event) => setProfile((prev) => ({ ...prev, defaultMealsPerWeek: Number(event.target.value) }))} className="w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm" />
        </label>
        <label className="rounded-card border border-casa-border bg-casa-surface p-3">
          <p className="text-caption text-casa-muted mb-1">Weeknight max minutes</p>
          <input type="number" min={10} max={180} value={profile.weeknightMaxMinutes} onChange={(event) => setProfile((prev) => ({ ...prev, weeknightMaxMinutes: Number(event.target.value) }))} className="w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {[
          ['Dietary rules', 'dietaryRules'],
          ['Allergies', 'allergies'],
          ['Disliked foods', 'dislikedFoods'],
          ['Preferred cuisines', 'preferredCuisines'],
          ['Preferred proteins', 'preferredProteins'],
          ['Pantry staples', 'pantryStaples'],
        ].map(([label, key]) => (
          <label key={key} className="rounded-card border border-casa-border bg-casa-surface p-3">
            <p className="text-caption text-casa-muted mb-1">{label}</p>
            <textarea
              value={profile[key as keyof FoodProfile] as string}
              onChange={(event) => setProfile((prev) => ({ ...prev, [key]: event.target.value }))}
              rows={2}
              className="w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm"
            />
          </label>
        ))}
      </div>

      {error && <p className="text-body-sm text-casa-error">{error}</p>}
      {!error && status && <p className="text-body-sm text-casa-muted">{status}</p>}

      <button
        type="button"
        onClick={() => void saveProfile()}
        disabled={saving}
        className="px-4 py-2 rounded-button border border-casa-gold/40 bg-casa-gold/10 text-casa-navy text-body-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
      >
        <Save size={14} />
        {saving ? 'Saving…' : 'Save food profile'}
      </button>
    </div>
  )
}
