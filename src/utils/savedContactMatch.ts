import type { SavedContact } from '../types'

function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * Finds an existing saved contact matching a candidate name/phone/email,
 * used to check for duplicates before creating a new contact. Phone and
 * email are the strongest signals (checked first, formatting-insensitive);
 * name/alias match is the fallback when no phone/email is given.
 */
export function findSavedContactMatch(
  contacts: Pick<SavedContact, 'id' | 'name' | 'aliases' | 'phone' | 'email'>[],
  name: string | null | undefined,
  phone: string | null | undefined,
  email: string | null | undefined,
): Pick<SavedContact, 'id' | 'name' | 'aliases' | 'phone' | 'email'> | null {
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) {
    const byPhone = contacts.find(c => normalizePhone(c.phone) === normalizedPhone)
    if (byPhone) return byPhone
  }
  const normalizedEmail = normalizeText(email)
  if (normalizedEmail) {
    const byEmail = contacts.find(c => normalizeText(c.email) === normalizedEmail)
    if (byEmail) return byEmail
  }
  const normalizedName = normalizeText(name)
  if (!normalizedName) return null
  return contacts.find(c =>
    [c.name, ...c.aliases].some(candidate => normalizeText(candidate) === normalizedName),
  ) ?? null
}
