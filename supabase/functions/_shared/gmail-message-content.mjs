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

// Converts email HTML to lightweight Markdown instead of flattening
// everything to plain text. Two problems drove this (live feedback,
// 2026-09-12): (1) only p/div/tr/li/br/h1-6 were turned into whitespace, so
// any other tag (span, td, font, a, ...) was deleted with nothing put in its
// place -- adjacent inline runs like "<strong>Message</strong><p>Please..."
// rendered as the words glommed together ("MessagePlease"); (2) collapsing
// every run of blank lines down to a single '\n' destroyed paragraph breaks
// entirely. Markdown output both fixes the readability bug (headings/bold/
// links/paragraphs survive) and is what the Reader Mode panel now renders.
function htmlToText(value) {
  const withMarkdown = value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => `\n${'#'.repeat(Number(level))} ${inner}\n`)
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => `[${text}](${href})`)
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|tr|table|ul|ol|blockquote|section|article|header|footer|thead|tbody)[^>]*>/gi, '\n\n')
    // Any tag that survives (span, td, font, img, ...) becomes a space, not
    // nothing -- the defensive fix for the word-glomming bug above.
    .replace(/<[^>]+>/g, ' ')

  return decodeHtmlEntities(withMarkdown)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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
        attachmentId: part.body?.attachmentId || null,
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
