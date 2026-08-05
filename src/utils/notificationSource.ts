// notifications.source is an internal engine/table name (policy, manual, system) --
// never render it raw in user-facing UI. This is the single place that translates
// it into a plain-language label a family member would actually understand.
const SOURCE_LABELS: Record<string, string> = {
  policy: 'Casa',
  manual: 'You',
  system: 'Automatic',
}

export function humanizeNotificationSource(source: string | null | undefined): string {
  if (!source) return 'Automatic'
  return SOURCE_LABELS[source] ?? 'Casa'
}
