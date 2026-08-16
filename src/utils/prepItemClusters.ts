import type { PrepItem } from '../types'

export interface PrepItemCluster {
  item: PrepItem
  itemIds: string[]
  relatedCount: number
  allDescriptions?: string[]
}

const STOPWORDS = new Set([
  'and', 'the', 'for', 'in', 'of', 'to', 'a', 'an', 'is', 'are', 'on', 'at',
  'by', 'with', 'from', 're', 'fwd', 'fw', 'update', 'notice', 'notification',
  'information', 'info', 'message', 'meeting', 'important', 'please', 'regarding',
])

export function extractKeywords(text?: string | null): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/**
 * Generates a semantic domain signature to group multiple related email replies,
 * paperwork reminders, and notices regarding the same real-world household topic.
 */
export function topicSignature(item: PrepItem): string | null {
  const titleWords = extractKeywords(item.event_title)
  const descWords = extractKeywords(item.description)
  const combined = Array.from(new Set([...titleWords, ...descWords]))

  // 1. Strings / Music paperwork & meetings (merges all Beethoven Strings and Strings orientation forms)
  if (combined.includes('string') || combined.includes('strings') || combined.includes('beethoven')) {
    return 'topic:strings_paperwork'
  }

  // 2. Science Camp & Outdoor trips
  if (combined.includes('science') && (combined.includes('camp') || combined.includes('alpine') || combined.includes('waiver'))) {
    return 'topic:science_camp'
  }

  // 3. Sports registrations
  if (combined.includes('basketball') && (combined.includes('registration') || combined.includes('tryouts') || combined.includes('aktivate'))) {
    return 'topic:basketball_registration'
  }
  if (combined.includes('lassie') || (combined.includes('lake') && combined.includes('lytal'))) {
    return 'topic:lake_lytal_lassie_league'
  }
  if (combined.includes('gymnastics')) {
    return 'topic:gymnastics_practice'
  }

  // 4. Food orders & transactions
  if (combined.includes('east') && combined.includes('wok')) {
    return 'topic:east_wok_order'
  }

  // 5. Utilities & Bills
  if (combined.includes('edison') && (combined.includes('insurance') || combined.includes('bill') || combined.includes('edh5679813'))) {
    return 'topic:edison_insurance_bill'
  }
  if (combined.includes('xfinity') && (combined.includes('bill') || combined.includes('online'))) {
    return 'topic:xfinity_bill'
  }
  if (combined.includes('bank') && combined.includes('america') && (combined.includes('loan') || combined.includes('payment') || combined.includes('vehicle'))) {
    return 'topic:bofa_vehicle_loan'
  }

  // 6. Security & Logins
  if (combined.includes('roblox') || combined.includes('toastfox13')) {
    return 'topic:roblox_security'
  }

  // 7. School Spirit Day / PTO
  if (combined.includes('spirit') && (combined.includes('pto') || combined.includes('day') || combined.includes('week') || combined.includes('butler'))) {
    return 'topic:pto_spirit_day'
  }

  // 8. General fallback to sorted top 3 significant keywords if present
  if (titleWords.length >= 2) {
    const sorted = [...titleWords].sort().slice(0, 3).join('_')
    return `topic:${sorted}`
  }

  return null
}

export function prepItemClusterKey(item: PrepItem): string {
  // 1. Explicit cluster ID from backend
  if (item.cluster_id) {
    return `cluster:${item.cluster_id}`
  }

  // 2. Linked calendar event
  if (item.event_id) {
    return `event:${item.event_id}`
  }

  // 3. Topic semantic signature
  const sig = topicSignature(item)
  if (sig) {
    return sig
  }

  // 4. True multi-item transaction key (ignoring per-message fallback keys)
  if (item.attention_thread_key && !item.attention_thread_key.includes(':message:')) {
    return `attention:${item.attention_thread_key}`
  }

  // 5. Source reference fallback
  if (item.source_ref) {
    return `source:${item.source_ref}`
  }

  return `item:${item.id}`
}

export function clusterPrepItems(items: PrepItem[]): PrepItemCluster[] {
  const clusters = new Map<string, PrepItemCluster>()

  for (const item of items) {
    const key = prepItemClusterKey(item)
    const cluster = clusters.get(key)
    if (!cluster) {
      clusters.set(key, {
        item,
        itemIds: [item.id],
        relatedCount: 0,
        allDescriptions: [item.description || item.event_title || ''],
      })
      continue
    }

    cluster.itemIds.push(item.id)
    cluster.relatedCount = cluster.itemIds.length - 1
    if (item.description && !cluster.allDescriptions?.includes(item.description)) {
      cluster.allDescriptions?.push(item.description)
    }

    // Keep the most informative / complete / urgent item as the face of the cluster
    const curLen = (cluster.item.description || '').length
    const newLen = (item.description || '').length
    if ((item.priority ?? 1) > (cluster.item.priority ?? 1)) {
      cluster.item = item
    } else if (newLen > curLen && (item.priority ?? 1) >= (cluster.item.priority ?? 1)) {
      cluster.item = item
    } else if (item.due_by && (!cluster.item.due_by || new Date(item.due_by) < new Date(cluster.item.due_by))) {
      cluster.item = item
    }
  }

  return [...clusters.values()]
}

const KNOWN_MEMBER_EMAILS: Record<string, string> = {
  '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488': 'jacobrtabor@gmail.com',
  '917b4b82-dd58-4a4b-a4fa-76065f62e33c': 'taborfamilyemail@gmail.com',
  household: 'taborfamilyemail@gmail.com',
}

/**
 * Resolves which Gmail account (e.g. taborfamilyemail@gmail.com vs jacobrtabor@gmail.com)
 * the message was received on, so links open the correct Google account.
 */
export function resolveGmailAccountEmail(
  item?: PrepItem | null,
  gmailContext?: { subject?: string | null; from_email?: string | null; email_body?: string | null; family_member_id?: string | null } | null,
  familyMembers?: { id: string; name?: string | null; email?: string | null }[] | null
): string {
  // 1. Explicit source_ref token check (e.g., gmail:household:... or gmail:<member_id>:...)
  if (item?.source_ref?.startsWith('gmail:')) {
    const parts = item.source_ref.split(':')
    const token = (parts[1] || '').toLowerCase().trim()
    if (token === 'household' || token.includes('taborfamily')) return 'taborfamilyemail@gmail.com'
    if (token.includes('jacobrtabor') || token.includes('jake')) return 'jacobrtabor@gmail.com'
    if (KNOWN_MEMBER_EMAILS[token]) return KNOWN_MEMBER_EMAILS[token]

    if (familyMembers && familyMembers.length > 0) {
      const match = familyMembers.find((m) => m.id === token)
      if (match) {
        if (match.email && match.email.includes('@')) return match.email.toLowerCase().trim()
        if (match.name && /jake|jacob/i.test(match.name)) return 'jacobrtabor@gmail.com'
        if (match.name && /tabor family|family/i.test(match.name)) return 'taborfamilyemail@gmail.com'
      }
    }
  }

  // 2. Gmail context inspection
  if (gmailContext?.family_member_id) {
    if (KNOWN_MEMBER_EMAILS[gmailContext.family_member_id]) {
      return KNOWN_MEMBER_EMAILS[gmailContext.family_member_id]
    }
    if (familyMembers && familyMembers.length > 0) {
      const match = familyMembers.find((m) => m.id === gmailContext.family_member_id)
      if (match?.email && match.email.includes('@')) return match.email.toLowerCase().trim()
    }
  }

  const body = (gmailContext?.email_body || '').toLowerCase()
  if (body.includes('taborfamilyemail@gmail.com')) return 'taborfamilyemail@gmail.com'
  if (body.includes('jacobrtabor@gmail.com') || /thanks for your.*order, jacob/i.test(body)) {
    return 'jacobrtabor@gmail.com'
  }

  // 3. Content heuristics for personal vs household
  const text = `${item?.event_title || ''} ${item?.description || ''}`.toLowerCase()
  if (
    text.includes('amazon developer') ||
    text.includes('jacob tabor') ||
    text.includes('order, jacob') ||
    text.includes('appstore.amazon.com') ||
    text.includes('model y lease') ||
    text.includes('tesla') ||
    text.includes('hellofresh')
  ) {
    return 'jacobrtabor@gmail.com'
  }

  // Default to shared household inbox
  return 'taborfamilyemail@gmail.com'
}

/**
 * Builds a direct, reliable Gmail web URL for any email action item targeted to the specific
 * account (taborfamilyemail@gmail.com or jacobrtabor@gmail.com).
 */
export function buildGmailWebUrl(
  item: PrepItem,
  gmailContext?: { subject?: string | null; from_email?: string | null; email_body?: string | null; family_member_id?: string | null } | null,
  familyMembers?: { id: string; name?: string | null; email?: string | null }[] | null
): string {
  const accountEmail = resolveGmailAccountEmail(item, gmailContext, familyMembers)
  const userSegment = encodeURIComponent(accountEmail)

  const subject = gmailContext?.subject || item.event_title || ''
  const cleanSubject = subject
    .replace(/^(\s*(re|fwd|fw|aw|vs|sv|antw)\s*:\s*)+/i, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim()

  if (cleanSubject) {
    return `https://mail.google.com/mail/u/${userSegment}/#search/${encodeURIComponent(`subject:("${cleanSubject.slice(0, 50)}")`)}`
  }

  if (item.source_ref?.startsWith('gmail:')) {
    const parts = item.source_ref.split(':')
    const msgId = parts[2] || parts[1]
    if (msgId && /^[0-9a-f]+$/i.test(msgId)) {
      return `https://mail.google.com/mail/u/${userSegment}/#all/${msgId}`
    }
  }

  return `https://mail.google.com/mail/u/${userSegment}/#inbox`
}
