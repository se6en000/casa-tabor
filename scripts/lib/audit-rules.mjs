// Pure, dependency-free heuristics used by scripts/style-audit.mjs and covered
// directly by tests/style-audit.test.mjs (node:test, no filesystem access
// required). Every rule works on a single file's text content and returns an
// array of { line, snippet } matches — deterministic given the same input.
//
// These are HEURISTICS, not a linter. Each rule documents what it can and
// cannot see so `npm run style:audit` prints honest caveats instead of
// implying 100% precision/recall. See CATEGORIES[].heuristicLimits.

/** @param {string} content @returns {string[]} */
function lines(content) {
  return content.split(/\r\n|\r|\n/)
}

/** @param {string} content @returns {number[]} */
function lineStarts(content) {
  const starts = [0]
  const separators = /\r\n|\r|\n/g
  let match
  while ((match = separators.exec(content)) !== null) starts.push(separators.lastIndex)
  return starts
}

/** @param {number[]} starts @param {number} offset @returns {number} */
function lineIndexAt(starts, offset) {
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (starts[mid] <= offset) low = mid + 1
    else high = mid - 1
  }
  return Math.max(0, high)
}

/**
 * Runs a global regex against file content and maps each match to its
 * 1-based line number + a trimmed single-line snippet for reporting.
 * @param {string} content
 * @param {RegExp} pattern must have the 'g' flag
 * @returns {{ line: number, snippet: string }[]}
 */
function findMatches(content, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  const fileLines = lines(content)
  const offsets = lineStarts(content)
  const results = []
  let m
  while ((m = re.exec(content)) !== null) {
    const lineIdx = lineIndexAt(offsets, m.index)
    const snippet = (fileLines[lineIdx] ?? '').trim().slice(0, 160)
    results.push({ line: lineIdx + 1, snippet })
    if (m.index === re.lastIndex) re.lastIndex++ // guard against zero-length matches
  }
  return results
}

/** Tailwind arbitrary fixed font-size utilities, e.g. text-[13px], text-[1.1rem]. */
function findArbitraryFontSizes(content) {
  return findMatches(content, /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g)
}

/** Raw hex color literals (#abc, #aabbcc, #aabbccdd) anywhere in the file. */
function findRawHexColors(content) {
  return findMatches(content, /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})\b/g)
}

/** Tailwind arbitrary z-index utilities, e.g. z-[60], z-[9999]. */
function findArbitraryZIndex(content) {
  return findMatches(content, /\bz-\[\d+\]/g)
}

/** Inline JSX style objects: style={{ ... }}. */
function findInlineStyleBlocks(content) {
  return findMatches(content, /\bstyle=\{\{/g)
}

/**
 * Collect JSX opening tags without being confused by `>` inside quoted strings
 * or JSX expression braces. This intentionally stops at opening tags; these
 * audits only inspect attributes and class contracts.
 * @param {string} content
 * @param {Set<string>} tagNames
 * @returns {{ name: string, offset: number, source: string }[]}
 */
function collectJsxOpeningTags(content, tagNames) {
  const out = []
  const re = /<([A-Za-z][\w.]*)\b/g
  let match
  while ((match = re.exec(content)) !== null) {
    if (!tagNames.has(match[1])) continue
    let braceDepth = 0
    let quote = null
    for (let index = re.lastIndex; index < content.length; index += 1) {
      const char = content[index]
      const previous = content[index - 1]
      if (quote) {
        if (char === quote && previous !== '\\') quote = null
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char
        continue
      }
      if (char === '{') braceDepth += 1
      else if (char === '}') braceDepth -= 1
      else if (char === '>' && braceDepth === 0) {
        out.push({ name: match[1], offset: match.index, source: content.slice(match.index, index + 1) })
        re.lastIndex = index + 1
        break
      }
    }
  }
  return out
}

/**
 * Interactive JSX elements with square width/height classes below the shared
 * density-aware touch target. Decorative icon geometry is deliberately ignored.
 */
function findUndersizedSquareControls(content) {
  const out = []
  const fileLines = lines(content)
  const offsets = lineStarts(content)
  const interactiveTags = collectJsxOpeningTags(content, new Set(['button', 'a']))
  for (const tag of interactiveTags) {
    if (tag.name === 'a' && !/\bonClick=|\bhref=/.test(tag.source)) continue
    if (/\b(?:size-control|min-[wh]-control)\b/.test(tag.source)) continue
    const patterns = [
      /\bw-(\d{1,2})\s+h-(\d{1,2})\b/g,
      /\bh-(\d{1,2})\s+w-(\d{1,2})\b/g,
      /\bsize-(\d{1,2})\b/g,
    ]
    let undersized = false
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(tag.source)) !== null) {
        const first = Number(match[1])
        const second = match[2] === undefined ? first : Number(match[2])
        if (first === second && first <= 10) undersized = true
      }
    }
    if (undersized) {
      const idx = lineIndexAt(offsets, tag.offset)
      out.push({ line: idx + 1, snippet: (fileLines[idx] ?? '').trim().slice(0, 160) })
    }
  }
  return out
}

/** UI hidden until hover is unavailable to touch and keyboard users. */
function findHoverOnlyReveals(content) {
  return findMatches(content, /\bopacity-0\b[^\n"']*\bgroup-hover:opacity-\d+\b/g)
}

/**
 * Native buttons outside shared UI primitives. Existing debt is baselined, but
 * every new recreation fails style:check and must use Button/IconButton/Chip.
 */
function findNativeControlRecreations(content, filePath = '') {
  if (filePath.startsWith('src/components/ui/')) return []
  const fileLines = lines(content)
  const offsets = lineStarts(content)
  return collectJsxOpeningTags(content, new Set(['button'])).map((tag) => {
    const idx = lineIndexAt(offsets, tag.offset)
    return { line: idx + 1, snippet: (fileLines[idx] ?? '').trim().slice(0, 160) }
  })
}

/** Buttons using title as their only explicit label must add aria-label. */
function findTitleOnlyButtonLabels(content) {
  const out = []
  const fileLines = lines(content)
  const offsets = lineStarts(content)
  for (const tag of collectJsxOpeningTags(content, new Set(['button']))) {
    if (!/\btitle=/.test(tag.source) || /\baria-label=/.test(tag.source)) continue
    const idx = lineIndexAt(offsets, tag.offset)
    out.push({ line: idx + 1, snippet: (fileLines[idx] ?? '').trim().slice(0, 160) })
  }
  return out
}

export const CATEGORIES = [
  {
    id: 'arbitraryFontSize',
    label: 'Arbitrary fixed font-size utilities',
    run: findArbitraryFontSizes,
    heuristicLimits:
      'Regex-only: matches text-[Npx|rem|em] literals. Misses font sizes set via ' +
      'inline style="font-size:..." or computed/template class names.',
  },
  {
    id: 'rawHexColors',
    label: 'Raw hex colors in TS/TSX',
    run: findRawHexColors,
    heuristicLimits:
      'Matches any #hex literal in scanned files, including legitimate token/theme ' +
      'definition files (e.g. contexts/ThemeContext.tsx) — those are expected to ' +
      'contain hex values and are counted as-is rather than special-cased, which ' +
      'can overstate true "component debt". Does not detect rgb()/hsl() equivalents.',
  },
  {
    id: 'arbitraryZIndex',
    label: 'Arbitrary z-index utilities',
    run: findArbitraryZIndex,
    heuristicLimits:
      'Matches z-[N] literals only. Misses z-index set via inline style or numeric ' +
      'stacking managed through component props/CSS.',
  },
  {
    id: 'inlineStyleBlocks',
    label: 'Inline style={{...}} blocks',
    run: findInlineStyleBlocks,
    heuristicLimits:
      'Counts the opening `style={{` token once per occurrence. Does not evaluate ' +
      'whether the inline style is justified (e.g. dynamic transforms/positions ' +
      'that cannot reasonably be static Tailwind classes).',
  },
  {
    id: 'undersizedSquareControls',
    label: 'Undersized interactive controls (<44px)',
    run: findUndersizedSquareControls,
    heuristicLimits:
      'Inspects button and interactive anchor opening tags for paired w-N/h-N or ' +
      'size-N utilities with N<=10, excluding controls that use semantic control targets.',
  },
  {
    id: 'hoverOnlyReveals',
    label: 'Hover-only revealed UI',
    run: findHoverOnlyReveals,
    heuristicLimits:
      'Matches same-line opacity-0 plus group-hover:opacity-N class contracts. ' +
      'It does not infer visibility controlled by component state or external CSS.',
  },
  {
    id: 'titleOnlyButtonLabels',
    label: 'Buttons relying on title instead of aria-label',
    run: findTitleOnlyButtonLabels,
    heuristicLimits:
      'Matches button opening tags containing title without aria-label. It may ' +
      'include text buttons whose visible children already provide an accessible name.',
  },
  {
    id: 'nativeControlRecreations',
    label: 'Native button recreations outside shared UI',
    run: findNativeControlRecreations,
    heuristicLimits:
      'Counts native JSX button opening tags outside src/components/ui. Existing ' +
      'debt is budgeted; new controls must use shared Button, IconButton, or Chip.',
  },
]

export {
  collectJsxOpeningTags,
  findMatches,
  findArbitraryFontSizes,
  findRawHexColors,
  findArbitraryZIndex,
  findInlineStyleBlocks,
  findUndersizedSquareControls,
  findHoverOnlyReveals,
  findNativeControlRecreations,
  findTitleOnlyButtonLabels,
}
