import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AnimatedNumber from './AnimatedNumber.vue'

describe('AnimatedNumber', () => {
  beforeEach(() => {
    // happy-dom doesn't ship rAF by default the way jsdom does — stub it
    // so we can drive frames manually.
    let cbs: FrameRequestCallback[] = []
    let now = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cbs.push(cb)
      return cbs.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('performance', { now: () => now })
    ;(globalThis as any).__advanceFrame = (ms: number) => {
      now += ms
      const queue = cbs
      cbs = []
      queue.forEach((cb) => cb(now))
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the initial value immediately on mount', () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 42 } })
    expect(wrapper.text()).toBe('42')
  })

  it('uses the provided format function', () => {
    const wrapper = mount(AnimatedNumber, {
      props: { value: 1500, format: (n: number) => `$${Math.round(n)}` },
    })
    expect(wrapper.text()).toBe('$1500')
  })

  it('animates toward the new value over the configured duration', async () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 0, duration: 100 } })
    await wrapper.setProps({ value: 100 })
    await flushPromises()
    ;(globalThis as any).__advanceFrame(50)
    await flushPromises()
    const mid = Number(wrapper.text())
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(100)
    ;(globalThis as any).__advanceFrame(60)
    await flushPromises()
    expect(wrapper.text()).toBe('100')
  })

  it('does not animate when the value did not actually change', async () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 10 } })
    await wrapper.setProps({ value: 10 })
    // No rAF should be requested; nothing to advance.
    expect(wrapper.text()).toBe('10')
  })
})
