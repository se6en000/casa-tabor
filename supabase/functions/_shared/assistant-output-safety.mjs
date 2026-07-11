const RAW_TOOL_SYNTAX = /(?:^|\n)\s*(?:```(?:tool|python|json)?|tool_code\b|function_call\b)|\bprint\s*\(\s*(?:update|create|delete|bulk_update)_[a-z_]+\s*\(|\b(?:update|create|delete|bulk_update)_[a-z_]+\s*\(\s*\{/i
const UNSUPPORTED_WRITE_PROMISE = /\b(?:i['’]?ll|i will|let me|i(?:'m| am) going to)\s+(?:update|change|save|delete|create|add|move|reschedule)\b/i
const UNSUPPORTED_WRITE_COMPLETION = /\b(?:i(?: have|'ve)\s+)?(?:updated|changed|saved|deleted|created|added|moved|rescheduled)\b/i

export function secureAssistantResult(result, options = {}) {
  if (!result || result.type !== 'text') return result
  const text = String(result.text ?? '').trim()
  if (!text) return result

  if (RAW_TOOL_SYNTAX.test(text)) {
    return {
      ...result,
      text: "I couldn't safely prepare that response. Nothing was changed—please say the request again.",
      safety_rejection: 'raw_tool_syntax',
    }
  }

  const writeWasVerified = options.writeWasVerified === true || result.write_verified === true
  const userRequestedWrite = options.userRequestedWrite === true
  if (!writeWasVerified && (
    UNSUPPORTED_WRITE_PROMISE.test(text) ||
    (userRequestedWrite && UNSUPPORTED_WRITE_COMPLETION.test(text))
  )) {
    return {
      ...result,
      text: 'I could not verify that change, so nothing was changed. Please try the request again.',
      safety_rejection: 'unsupported_write_claim',
    }
  }

  return result
}
