import { useEffect, useState } from 'react'
import { ChefHat, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_FOOD_PROFILE, normalizeFoodProfile, type FoodProfile } from '../lib/foodProfile'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { Alert, Button, Card, Field, Input, SkeletonRow, Textarea } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

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
    return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
  }

  return (
    <div className="space-y-5">
      <SettingsPageHeader icon={ChefHat} title="Food Profile" description="Used by Meal Planner AI for budget, overlap, and preferences." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><Field label="Household size"><Input type="number" min={1} max={12} value={profile.householdSize} onChange={(event) => setProfile((prev) => ({ ...prev, householdSize: Number(event.target.value) }))} /></Field></Card>
        <Card><Field label="Weekly budget (USD)"><Input type="number" min={20} max={2000} value={profile.weeklyBudgetUsd} onChange={(event) => setProfile((prev) => ({ ...prev, weeklyBudgetUsd: Number(event.target.value) }))} /></Field></Card>
        <Card><Field label="Default meals per week"><Input type="number" min={1} max={14} value={profile.defaultMealsPerWeek} onChange={(event) => setProfile((prev) => ({ ...prev, defaultMealsPerWeek: Number(event.target.value) }))} /></Field></Card>
        <Card><Field label="Weeknight max minutes"><Input type="number" min={10} max={180} value={profile.weeknightMaxMinutes} onChange={(event) => setProfile((prev) => ({ ...prev, weeknightMaxMinutes: Number(event.target.value) }))} /></Field></Card>
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
          <Card key={key}>
            <Field label={label}>
            <Textarea
              value={profile[key as keyof FoodProfile] as string}
              onChange={(event) => setProfile((prev) => ({ ...prev, [key]: event.target.value }))}
              rows={2}
            />
            </Field>
          </Card>
        ))}
      </div>

      {error && <Alert tone="danger" title="Could not save food profile">{error}</Alert>}
      {!error && status && <Alert tone="success" title={status} />}

      <Button
        onClick={() => void saveProfile()}
        loading={saving}
        leadingIcon={<Save size={16} />}
      >
        Save food profile
      </Button>
    </div>
  )
}
