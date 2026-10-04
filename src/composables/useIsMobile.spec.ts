import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { MOBILE_BREAKPOINT, MOBILE_MEDIA_QUERY, useIsMobile } from './useIsMobile'

function stubWidth(width: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity)
    return {
      matches: width <= max,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  })
}

describe('useIsMobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the shared 768px breakpoint', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
    expect(MOBILE_MEDIA_QUERY).toBe('(max-width: 768px)')
  })

  it('is true at phone width and at exactly 768px', () => {
    stubWidth(390)
    expect(useIsMobile().value).toBe(true)
    stubWidth(768)
    expect(useIsMobile().value).toBe(true)
  })

  it('is false on desktop width', () => {
    stubWidth(1280)
    expect(useIsMobile().value).toBe(false)
  })

  it('reacts to window resize and stops listening when scope is disposed', async () => {
    stubWidth(1280)
    const scope = effectScope()
    const isMobile = scope.run(() => useIsMobile())!
    expect(isMobile.value).toBe(false)

    stubWidth(390)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(isMobile.value).toBe(true)

    scope.stop()
    stubWidth(1280)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(isMobile.value).toBe(true)
  })

  it('falls back to innerWidth when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    vi.stubGlobal('innerWidth', 500)
    expect(useIsMobile().value).toBe(true)
  })
})
