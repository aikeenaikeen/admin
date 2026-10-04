import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, formatTimeRange } from './date'

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

describe('formatTimeRange', () => {
  it('keeps seconds and drops the repeated date within one day', () => {
    const start = new Date(2026, 9, 4, 12, 0, 5).toISOString()
    const end = new Date(2026, 9, 4, 12, 0, 41).toISOString()
    expect(formatTimeRange(start, end)).toBe('04.10 12:00:05 – 12:00:41')
  })

  it('repeats the date when the interval crosses midnight', () => {
    const start = new Date(2026, 9, 4, 23, 59, 50).toISOString()
    const end = new Date(2026, 9, 5, 0, 0, 10).toISOString()
    expect(formatTimeRange(start, end)).toBe('04.10 23:59:50 – 05.10 00:00:10')
  })

  it('handles missing values', () => {
    expect(formatTimeRange(null, null)).toBe('—')
    expect(formatTimeRange(new Date(2026, 9, 4, 9, 0, 0).toISOString(), null)).toBe('04.10 09:00:00 – …')
  })
})
