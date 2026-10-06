// One person, several names: "Liv" is Olivia Tabor. Gift ideas and Coming up both need to know that
// an idea saved "for Olivia" is Liv's (Jake's bug report, 2026-09-27).

const clean = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Every name a family member goes by: short name, full name, the first name of it, and their nicknames. */
export function namesOf(member) {
  const full = clean(member?.full_name)
  const nicknames = Array.isArray(member?.nicknames) ? member.nicknames.map(clean) : []
  return [...new Set([clean(member?.name), full, full.split(' ')[0], ...nicknames].filter(Boolean))]
}

/** The family member a name means, or null ("Tabor" alone is nobody in particular). */
export function memberNamed(who, family) {
  const said = clean(who)
  if (!said) return null
  return (family ?? []).find((m) => namesOf(m).includes(said)) ?? null
}
