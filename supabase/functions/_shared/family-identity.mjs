function normalizeIdentity(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function familyMemberAliases(member) {
  const name = typeof member?.name === 'string' ? member.name.trim() : ''
  if (!name) return []

  const aliases = new Set([name])
  const fullName = typeof member?.full_name === 'string' ? member.full_name.trim() : ''
  if (fullName && normalizeIdentity(fullName) !== normalizeIdentity(name)) {
    aliases.add(fullName)
    const firstName = fullName.split(/\s+/)[0]
    if (firstName && normalizeIdentity(firstName) !== normalizeIdentity(name)) aliases.add(firstName)
  }

  return [...aliases]
}

export function canonicalizeFamilyReferences(text, members) {
  let resolved = String(text ?? '')
  const aliases = (Array.isArray(members) ? members : [])
    .flatMap((member) => familyMemberAliases(member)
      .filter((alias) => normalizeIdentity(alias) !== normalizeIdentity(member.name))
      .map((alias) => ({ alias, canonical: member.name.trim() })))
    .sort((a, b) => b.alias.length - a.alias.length)

  for (const { alias, canonical } of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    resolved = resolved.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), canonical)
  }
  return resolved
}

export function resolveFamilyMemberByName(members, requestedName) {
  const normalizedRequested = normalizeIdentity(requestedName)
  if (!normalizedRequested) return null
  return (Array.isArray(members) ? members : []).find((member) =>
    familyMemberAliases(member).some((alias) => normalizeIdentity(alias) === normalizedRequested),
  ) ?? null
}

export function formatFamilyIdentityAliases(members) {
  return (Array.isArray(members) ? members : [])
    .flatMap((member) => familyMemberAliases(member)
      .filter((alias) => normalizeIdentity(alias) !== normalizeIdentity(member.name))
      .map((alias) => `${alias} = ${member.name.trim()}`))
    .join('; ')
}
