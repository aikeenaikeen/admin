import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveBaseUrl } from './baseUrl'

describe('resolveBaseUrl', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.com' } })
  })

  afterEach(() => {
    vi.stubGlobal('window', originalWindow)
  })

  it('returns the trimmed env value when provided', () => {
    expect(resolveBaseUrl('https://api.example.com')).toBe('https://api.example.com')
  })

  it('strips trailing slashes from the env value', () => {
    expect(resolveBaseUrl('https://api.example.com///')).toBe('https://api.example.com')
  })

  it('trims surrounding whitespace before checking emptiness', () => {
    expect(resolveBaseUrl('   ')).toBe('https://app.example.com')
  })

  it('falls back to window.location.origin when env is empty', () => {
    expect(resolveBaseUrl('')).toBe('https://app.example.com')
    expect(resolveBaseUrl(undefined)).toBe('https://app.example.com')
  })

  it('returns empty string when no env and no window', () => {
    vi.stubGlobal('window', undefined)
    expect(resolveBaseUrl()).toBe('')
  })
})
