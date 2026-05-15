import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { start, done, reset } from './progress'

const BAR_ID = 'app-progress-bar'

function getBar(): HTMLElement | null {
  return document.getElementById(BAR_ID)
}

describe('progress', () => {
  beforeEach(() => {
    reset()
    getBar()?.remove()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    reset()
    getBar()?.remove()
  })

  it('creates a bar element on first start()', () => {
    expect(getBar()).toBeNull()
    start()
    expect(getBar()).not.toBeNull()
    expect(getBar()?.style.opacity).toBe('1')
  })

  it('finishes only when matching done() balances all start() calls', () => {
    start()
    start()
    done()
    expect(getBar()?.style.opacity).toBe('1')
    done()
    // bar still visible during the 220ms tail
    vi.advanceTimersByTime(300)
    expect(getBar()?.style.opacity).toBe('0')
  })

  it('extra done() calls beyond counter are no-ops', () => {
    expect(() => done()).not.toThrow()
    expect(getBar()?.style.opacity).toBeFalsy()
  })

  it('reset clears the counter and timers', () => {
    start()
    start()
    reset()
    expect(getBar()?.style.opacity).toBe('0')
  })
})
