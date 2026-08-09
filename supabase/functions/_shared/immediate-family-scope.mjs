const IMMEDIATE_FAMILY_NAME_KEYS = new Set(['jake', 'kelly', 'liv', 'emme', 'owen'])
const SHARED_FAMILY_INBOXES = new Set(['taborfamilyemail@gmail.com'])

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function firstNameKey(value) {
  const normalized = normalizeName(value)
  if (!normalized) return ''
  return normalized.split(' ')[0] ?? ''
}

export function isImmediateFamilyName(name) {
  return IMMEDIATE_FAMILY_NAME_KEYS.has(firstNameKey(name))
}

export function filterImmediateFamilyMembers(members) {
  if (!Array.isArray(members)) return []
  return members.filter((member) => isImmediateFamilyName(member?.name))
}

export function isSharedFamilyInbox(email) {
  const normalized = String(email ?? '').trim().toLowerCase()
  return normalized.length > 0 && SHARED_FAMILY_INBOXES.has(normalized)
}

export function resolveImmediateFamilyMember({
  members,
  preferredName,
  entityNames = [],
  fallbackMemberId = null,
}) {
  const immediateMembers = filterImmediateFamilyMembers(members)
  if (!immediateMembers.length) return null
  const preferredNorm = normalizeName(preferredName)
  if (preferredNorm) {
    const direct = immediateMembers.find((member) => {
      const memberNameNorm = normalizeName(member?.name)
      return memberNameNorm.includes(preferredNorm) || preferredNorm.includes(memberNameNorm)
    })
    if (direct) return direct
  }
  for (const entityName of entityNames) {
    const entityNorm = normalizeName(entityName)
    if (!entityNorm) continue
    const match = immediateMembers.find((member) => {
      const memberNorm = normalizeName(member?.name)
      return entityNorm.includes(memberNorm) || memberNorm.includes(entityNorm)
    })
    if (match) return match
  }
  if (fallbackMemberId) {
    const fallback = immediateMembers.find((member) => member?.id === fallbackMemberId)
    if (fallback) return fallback
  }
  return null
}
