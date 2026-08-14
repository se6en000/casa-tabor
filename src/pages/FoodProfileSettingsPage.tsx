import { useEffect, useState } from 'react'
import { ChefHat, Save, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_FOOD_PROFILE, normalizeFoodProfile, type FoodProfile } from '../lib/foodProfile'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { Alert, Button, Card, Field, Heading, Input, SkeletonRow, Textarea } from '../components/ui'
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
        const { data, error: loadError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'food_profile')
          .maybeSingle()
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
    return () => {
      active = false
    }
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
      setStatus('Food profile successfully saved.')
    } catch (saveError) {
      setError(formatSupabaseError(saveError, 'Could not save food profile'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={ChefHat}
        title="Food Profile & Dietary Memory"
        description="Core household dietary preferences, weekly budget targets, and pantry staples used by Meal Planner AI."
      />

      {error && (
        <Alert tone="danger" title="Could not save food profile" className="shadow-sm">
          {error}
        </Alert>
      )}
      {!error && status && (
        <Alert tone="success" title={status} className="shadow-sm" />
      )}

      {/* Household & Budget Metrics */}
      <Card tone="surface" padding="lg" className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-casa-border/60">
          <Users size={18} className="text-casa-gold" />
          <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
            Household & Weeknight Planning
          </Heading>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Household size" hint="Portion baseline">
            <Input
              type="number"
              min={1}
              max={12}
              value={profile.householdSize}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, householdSize: Number(event.target.value) }))
              }
            />
          </Field>

          <Field label="Weekly budget (USD)" hint="Grocery target">
            <Input
              type="number"
              min={20}
              max={2000}
              value={profile.weeklyBudgetUsd}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, weeklyBudgetUsd: Number(event.target.value) }))
              }
            />
          </Field>

          <Field label="Meals per week" hint="Planned dinners">
            <Input
              type="number"
              min={1}
              max={14}
              value={profile.defaultMealsPerWeek}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, defaultMealsPerWeek: Number(event.target.value) }))
              }
            />
          </Field>

          <Field label="Max weeknight mins" hint="Prep + cook cap">
            <Input
              type="number"
              min={10}
              max={180}
              value={profile.weeknightMaxMinutes}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, weeknightMaxMinutes: Number(event.target.value) }))
              }
            />
          </Field>
        </div>
      </Card>

      {/* Dietary Rules, Allergies & Preferences */}
      <Card tone="surface" padding="lg" className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-casa-border/60">
          <ChefHat size={18} className="text-casa-gold" />
          <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
            Dietary Preferences & Flavor Profile
          </Heading>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Dietary rules" hint="e.g. Pescatarian, Low sodium">
            <Textarea
              value={profile.dietaryRules}
              onChange={(event) => setProfile((prev) => ({ ...prev, dietaryRules: event.target.value }))}
              rows={2}
              placeholder="e.g. Pescatarian on weekdays, low sugar"
            />
          </Field>

          <Field label="Allergies & restrictions" hint="Strict exclusions">
            <Textarea
              value={profile.allergies}
              onChange={(event) => setProfile((prev) => ({ ...prev, allergies: event.target.value }))}
              rows={2}
              placeholder="e.g. Tree nuts, shellfish, sesame"
            />
          </Field>

          <Field label="Disliked foods" hint="Ingredients to avoid in suggestions">
            <Textarea
              value={profile.dislikedFoods}
              onChange={(event) => setProfile((prev) => ({ ...prev, dislikedFoods: event.target.value }))}
              rows={2}
              placeholder="e.g. Cilantro, blue cheese, eggplant"
            />
          </Field>

          <Field label="Preferred cuisines" hint="Family favorite styles">
            <Textarea
              value={profile.preferredCuisines}
              onChange={(event) => setProfile((prev) => ({ ...prev, preferredCuisines: event.target.value }))}
              rows={2}
              placeholder="e.g. Mediterranean, Mexican, Coastal seafood, Italian"
            />
          </Field>

          <Field label="Preferred proteins" hint="Core dinner proteins">
            <Textarea
              value={profile.preferredProteins}
              onChange={(event) => setProfile((prev) => ({ ...prev, preferredProteins: event.target.value }))}
              rows={2}
              placeholder="e.g. Salmon, chicken breast, tofu, black beans"
            />
          </Field>

          <Field label="Pantry staples" hint="Items assumed always on hand">
            <Textarea
              value={profile.pantryStaples}
              onChange={(event) => setProfile((prev) => ({ ...prev, pantryStaples: event.target.value }))}
              rows={2}
              placeholder="e.g. Olive oil, garlic, kosher salt, black pepper, butter"
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void saveProfile()}
          loading={saving}
          leadingIcon={<Save size={18} />}
          className="font-bold shadow-sm px-6 min-h-control"
        >
          Save food profile
        </Button>
      </div>
    </div>
  )
}
