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
 * Square width/height utility pairs below the 44px (11 * 4px) touch-target
 * minimum, in either class order, plus the Tailwind v4 `size-N` shorthand.
 * Undersized here means N <= 10 (<=40px).
 */
function findUndersizedSquareControls(content) {
  const out = []
  const reW = /\bw-(\d{1,2})\s+h-(\d{1,2})\b/g
  const reH = /\bh-(\d{1,2})\s+w-(\d{1,2})\b/g
  const reSize = /\bsize-(\d{1,2})\b/g
  const fileLines = lines(content)
  const offsets = lineStarts(content)

  function scan(re, sameOrderCheck) {
    let m
    while ((m = re.exec(content)) !== null) {
      const a = Number(m[1])
      const b = m[2] !== undefined ? Number(m[2]) : a
      if (sameOrderCheck && a !== b) continue
      if (a <= 10 && b <= 10) {
        const idx = lineIndexAt(offsets, m.index)
        out.push({ line: idx + 1, snippet: (fileLines[idx] ?? '').trim().slice(0, 160) })
      }
    }
  }
  scan(reW, true)
  scan(reH, true)
  scan(reSize, false)
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
    label: 'Undersized square controls (<44px)',
    run: findUndersizedSquareControls,
    heuristicLimits:
      'Matches paired w-N/h-N or size-N utilities with N<=10 (<=40px). Cannot ' +
      'confirm the element is actually interactive/tappable (vs. a decorative ' +
      'icon wrapper), and cannot account for padding/hit-area extensions that ' +
      'may already satisfy the 44px touch target in practice.',
  },
]

export { findMatches, findArbitraryFontSizes, findRawHexColors, findArbitraryZIndex, findInlineStyleBlocks, findUndersizedSquareControls }
