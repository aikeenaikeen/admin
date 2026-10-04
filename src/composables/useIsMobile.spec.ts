import { afterEach, expect, it, vi } from 'vitest'
import { MOBILE_MEDIA_QUERY, useIsMobile } from './useIsMobile'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('следит за matchMedia (max-width: 768px) и обновляется при смене ширины', () => {
  let listener: ((event: MediaQueryListEvent) => void) | null = null
  const matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => { listener = cb },
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('matchMedia', matchMedia)

  const isMobile = useIsMobile()

  expect(matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY)
  expect(MOBILE_MEDIA_QUERY).toBe('(max-width: 768px)')
  expect(isMobile.value).toBe(true)
  listener!({ matches: false } as MediaQueryListEvent)
  expect(isMobile.value).toBe(false)
})
