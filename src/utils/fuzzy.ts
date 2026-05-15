/**
 * Subsequence fuzzy match: every char of `query` must appear in
 * `haystack` in the same order, case-insensitively. Matches the
 * "type any few letters" feel of VS Code's command palette without
 * pulling in a real scoring library.
 *
 * Returns true on empty query (match-all) so callers can use it as
 * a filter predicate without special-casing.
 */
export function fuzzyMatch(haystack: string, query: string): boolean {
  if (!query) return true
  if (!haystack) return false

  const h = haystack.toLowerCase()
  const q = query.toLowerCase()

  let i = 0
  for (const ch of q) {
    const idx = h.indexOf(ch, i)
    if (idx === -1) return false
    i = idx + 1
  }
  return true
}
