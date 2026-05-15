import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from './date'

describe('formatDate', () => {
  it('returns em-dash for null/undefined/empty', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('returns em-dash for unparseable input', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('returns a formatted date for valid ISO strings', () => {
    const out = formatDate('2024-08-15T10:00:00Z')
    expect(out).not.toBe('—')
    expect(out).toMatch(/2024/)
  })
})

describe('formatDateTime', () => {
  it('returns em-dash for null/undefined/empty', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })

  it('includes a time component for valid input', () => {
    const out = formatDateTime('2024-08-15T10:30:00Z')
    expect(out).toMatch(/\d{2}:\d{2}/)
  })
})
