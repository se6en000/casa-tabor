function decodeBase64Url(value) {
  return atob(String(value).replace(/-/g, '+').replace(/_/g, '/'))
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function htmlToText(value) {
  return decodeHtmlEntities(value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|tr|li|br|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function stripQuotedReplyHistory(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .split(/\n(?:On .+? wrote:|From:.+\nSent:.+\nTo:.+\nSubject:)/i)[0]
    .replace(/\n>.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractGmailMessageContent(payload) {
  const plainParts = []
  const htmlParts = []
  const attachments = []

  function walk(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainParts.push(decodeBase64Url(part.body.data))
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlParts.push(htmlToText(decodeBase64Url(part.body.data)))
    }

    if (part.body?.attachmentId || part.filename) {
      attachments.push({
        filename: String(part.filename || 'Unnamed attachment'),
        mimeType: String(part.mimeType || 'application/octet-stream'),
        size: Number.isFinite(part.body?.size) ? part.body.size : 0,
      })
    }

    for (const child of part.parts ?? []) walk(child)
  }

  walk(payload ?? {})
  const plainText = stripQuotedReplyHistory(plainParts.join('\n'))
  if (plainText) return { text: plainText, format: 'plain', attachments }

  const htmlText = stripQuotedReplyHistory(htmlParts.join('\n'))
  return { text: htmlText, format: htmlText ? 'html' : 'none', attachments }
}
