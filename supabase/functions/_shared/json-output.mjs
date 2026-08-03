function balancedObjects(text) {
  const objects = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return objects
}

export function parseLastJsonObject(raw) {
  const text = String(raw ?? '').trim()
  if (!text) throw new Error('provider_output_empty')

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Search-grounded responses can contain prose or multiple JSON objects.
  }

  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (let index = fenced.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(fenced[index][1].trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Try balanced objects below.
    }
  }

  const candidates = balancedObjects(text)
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Continue to the preceding complete object.
    }
  }
  throw new Error('provider_output_invalid_json')
}

export const jsonOutputInternals = { balancedObjects }
