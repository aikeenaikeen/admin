import { vi } from 'vitest'

/**
 * Подменяет ширину окна для useIsMobile: innerWidth + matchMedia по max-width.
 * Снимать через vi.unstubAllGlobals().
 */
export function stubViewportWidth(width: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY)
    return {
      matches: width <= max,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
}
