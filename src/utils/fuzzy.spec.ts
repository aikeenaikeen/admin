import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzy'

describe('fuzzyMatch', () => {
  it('matches an exact substring', () => {
    expect(fuzzyMatch('Open Employees', 'employees')).toBe(true)
  })

  it('matches a subsequence', () => {
    expect(fuzzyMatch('Open Employees', 'oemp')).toBe(true)
    expect(fuzzyMatch('Open Employees', 'opn')).toBe(true)
  })

  it('is case-insensitive in both directions', () => {
    expect(fuzzyMatch('OPEN', 'op')).toBe(true)
    expect(fuzzyMatch('open', 'OP')).toBe(true)
  })

  it('returns true for an empty query', () => {
    expect(fuzzyMatch('anything', '')).toBe(true)
  })

  it('returns false when characters appear out of order', () => {
    expect(fuzzyMatch('abc', 'cba')).toBe(false)
  })

  it('returns false when haystack is empty and query is not', () => {
    expect(fuzzyMatch('', 'a')).toBe(false)
  })

  it('handles repeated characters correctly', () => {
    expect(fuzzyMatch('banana', 'baa')).toBe(true)
    expect(fuzzyMatch('banana', 'bbb')).toBe(false)
  })

  it('handles unicode characters', () => {
    expect(fuzzyMatch('тёмная тема', 'тт')).toBe(true)
    expect(fuzzyMatch('Сотрудники', 'сот')).toBe(true)
  })
})
