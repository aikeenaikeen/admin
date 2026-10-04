import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElDrawer, ElMessage, ElSelect, ElRadioGroup } from 'element-plus'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import dayjs from 'dayjs'
import Labeling from './Labeling.vue'
import apiClient from '../api/client'
import { stubViewportWidth } from '../test-utils/viewport'
vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const clip = (id: number, activityId: number | null = 42) => ({ id, companySlug: 'test', cameraId: 7,
  employeeId: 8, activityId, reason: 'random', capturedAt: '2026-09-22T00:00:00Z', frameCount: 2,
  label: null, meta: { nominalFps: 8 } })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
let rows = [clip(1), clip(2)]
let wrapper: ReturnType<typeof mount>
let router: Router
beforeEach(() => {
  vi.clearAllMocks()
  rows = [clip(1), clip(2)]
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close() {} }))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() }))
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data:
    url === '/api/captures' ? { data: [...rows] }
      : url === '/api/captures/stats' ? { counts: { unlabeled: 2 }, total: 2 }
        : url === '/api/employees' ? [{ id: 8, name: 'Employee' }]
        : url === '/api/cameras' ? [{ id: 64, name: 'Office' }]
        : url.endsWith('/activities') ? [{ id: 42, name: 'Cleaning' }]
          : new Blob(['jpeg'], { type: 'image/jpeg' }),
  }))
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function start(query: Record<string, string> = {}) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/labeling', component: Labeling }] })
  await router.push({ path: '/labeling', query })
  await router.isReady()
  wrapper = mount(Labeling, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
}
const listCalls = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/api/captures')
const lastListParams = () => listCalls()[listCalls().length - 1]?.[1]?.params
it('fetches frames with API auth client as blobs, not naked img URLs; frees them', async () => {
  await start()
  expect(apiClient.get).toHaveBeenCalledWith('/api/captures/1/frames/0', expect.objectContaining({ responseType: 'blob' }))
  expect(wrapper.find('img').attributes('src')).toMatch(/^blob:/)
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
it('does not advance or duplicate a pending save; failure leaves the same clip', async () => {
  await start()
  const pending = deferred<{ data: object }>()
  vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise)
  await wrapper.get('[data-test="positive"]').trigger('click')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
  expect(apiClient.post).toHaveBeenCalledTimes(1)
  expect(apiClient.get).not.toHaveBeenCalledWith('/api/captures/2/activities', expect.anything())
  pending.reject(new Error('offline'))
  await flushPromises()
  expect(ElMessage.error).toHaveBeenCalled()
  await wrapper.get('[data-test="negative"]').trigger('click')
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: 'negative', activityId: 42 })
  expect(apiClient.get).toHaveBeenCalledWith('/api/captures/2/activities', expect.anything())
})
it('requires an explicit target when random clips have multiple activities', async () => {
  const base = vi.mocked(apiClient.get).getMockImplementation()!
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    if (url.endsWith('/activities')) {
      return Promise.resolve({ data: [{ id: 42, name: 'Cleaning' }, { id: 43, name: 'Phone' }] })
    }
    return base(url, config)
  })
  rows = [clip(1, null)]
  await start()
  expect(wrapper.get('[data-test="positive"]').attributes('disabled')).toBeDefined()
  wrapper.get('[data-test="activity"]').getComponent(ElSelect).vm.$emit('update:modelValue', 42)
  await flushPromises()
  expect(wrapper.get('[data-test="positive"]').attributes('disabled')).toBeUndefined()
})
it('undo only restores a clip after the server confirms null; failure is retryable', async () => {
  await start()
  await wrapper.get('[data-test="positive"]').trigger('click')
  await flushPromises()
  vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('offline'))
  await wrapper.get('[data-test="undo"]').trigger('click')
  await flushPromises()
  expect(ElMessage.error).toHaveBeenCalledWith('labeling.undoFailed')
  await wrapper.get('[data-test="undo"]').trigger('click')
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: null })
  await wrapper.get('[data-test="negative"]').trigger('click')
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: 'negative', activityId: 42 })
})
it('ignores stale list responses when filters change', async () => {
  await start()
  const old = deferred<{ data: { data: ReturnType<typeof clip>[] } }>()
  vi.mocked(apiClient.get).mockImplementation(async (url) => {
    if (url === '/api/captures') return old.promise
    return { data: [] }
  })
  wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'random')
  await flushPromises()
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data: url === '/api/captures' ? { data: [] } : [] }))
  wrapper.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'vlm_verdict')
  await flushPromises()
  old.resolve({ data: { data: [clip(9)] } })
  await flushPromises()
  expect(wrapper.text()).toContain('labeling.empty')
  expect(wrapper.find('img').exists()).toBe(false)
})
it('does not allow labels when a frame request fails', async () => {
  const base = vi.mocked(apiClient.get).getMockImplementation()!
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    if (url.endsWith('/frames/1')) { return Promise.reject(new Error('missing frame')) }
    return base(url, config)
  })
  await start()
  expect(wrapper.text()).toContain('labeling.mediaFailed')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
  expect(apiClient.post).not.toHaveBeenCalled()
})
it('keyboard shortcuts ignore inputs and repeated keydown events', async () => {
  await start()
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true }))
  expect(apiClient.post).not.toHaveBeenCalled()
  input.remove()
})

it('selects the only available activity for a random clip and sends that id', async () => {
  rows = [clip(1, null)]
  await start()
  expect(wrapper.get('[data-test="positive"]').attributes('disabled')).toBeUndefined()
  await wrapper.get('[data-test="positive"]').trigger('click')
  expect(apiClient.post).toHaveBeenCalledWith('/api/captures/1/label', { label: 'positive', activityId: 42 })
})
it('keeps labeling disabled when the company has no activities', async () => {
  const base = vi.mocked(apiClient.get).getMockImplementation()!
  vi.mocked(apiClient.get).mockImplementation((url, config) => url.endsWith('/activities')
    ? Promise.resolve({ data: [] }) : base(url, config))
  rows = [clip(1, null)]
  await start()
  expect(wrapper.get('[data-test="positive"]').attributes('disabled')).toBeDefined()
})

it('wrong-person button and key 4 toggle the flag via API without an action label', async () => {
  await start()
  const button = () => wrapper.get('[data-test="wrong-person"]')
  expect(button().attributes('aria-pressed')).toBe('false')
  await button().trigger('click')
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/wrong-person', { wrongPerson: true })
  expect(button().attributes('aria-pressed')).toBe('true')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }))
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/wrong-person', { wrongPerson: false })
  expect(button().attributes('aria-pressed')).toBe('false')
  expect(apiClient.post).not.toHaveBeenCalledWith('/api/captures/1/label', expect.anything())
})
it('wrong-person flag is independent of the action label; Backspace undoes only the label', async () => {
  await start()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }))
  await flushPromises()
  await wrapper.get('[data-test="positive"]').trigger('click')
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: 'positive', activityId: 42 })
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
  await flushPromises()
  expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: null })
  expect(apiClient.post).toHaveBeenCalledTimes(3)
  // The restored clip still shows the saved flag; it can be cleared explicitly.
  expect(wrapper.get('[data-test="wrong-person"]').attributes('aria-pressed')).toBe('true')
})
it('failed wrong-person save keeps the previous state and blocks labels while pending', async () => {
  await start()
  const pending = deferred<{ data: object }>()
  vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
  expect(apiClient.post).toHaveBeenCalledTimes(1)
  pending.reject(new Error('offline'))
  await flushPromises()
  expect(ElMessage.error).toHaveBeenCalledWith('labeling.wrongPersonFailed')
  expect(wrapper.get('[data-test="wrong-person"]').attributes('aria-pressed')).toBe('false')
})
it('wrong-person toggle is disabled until frames load and never shows the VLM verdict', async () => {
  rows = [{ ...clip(1), vlmDecision: 'yes', vlmReason: 'secret reasoning' } as ReturnType<typeof clip>]
  const base = vi.mocked(apiClient.get).getMockImplementation()!
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    if (url.endsWith('/frames/1')) { return Promise.reject(new Error('missing frame')) }
    return base(url, config)
  })
  await start()
  expect(wrapper.get('[data-test="wrong-person"]').attributes('disabled')).toBeDefined()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }))
  expect(apiClient.post).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('secret reasoning')
})

it('opens the slice from the address bar and sends local-day bounds to the API', async () => {
  await start({ reason: 'vlm_verdict', vlmDecision: 'confirmed', from: '2026-09-29', to: '2026-09-30',
    minScore: '0.5', maxScore: '0.9', employeeId: '8', cameraId: '64', order: 'desc' })
  expect(listCalls()).toHaveLength(1)
  expect(lastListParams()).toEqual({ label: 'unlabeled', limit: 50, order: 'desc', reason: 'vlm_verdict',
    vlmDecision: 'confirmed', employeeId: 8, cameraId: 64, minScore: 0.5, maxScore: 0.9,
    from: dayjs('2026-09-29').startOf('day').toISOString(), to: dayjs('2026-09-30').endOf('day').toISOString() })
})
it('ignores junk in the address and keeps the old default request', async () => {
  await start({ reason: 'everything', employeeId: 'abc', from: 'yesterday', vlmDecision: 'maybe', order: 'sideways' })
  expect(lastListParams()).toEqual({ label: 'unlabeled', limit: 50, order: 'asc' })
})
it('writes filter changes to the address bar and reloads the list', async () => {
  await start({ reason: 'vlm_verdict' })
  wrapper.get('[data-test="filter-vlm"]').getComponent(ElSelect).vm.$emit('update:modelValue', 'rejected')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ reason: 'vlm_verdict', vlmDecision: 'rejected' })
  expect(lastListParams()).toMatchObject({ reason: 'vlm_verdict', vlmDecision: 'rejected' })
  wrapper.get('[data-test="filter-vlm"]').getComponent(ElSelect).vm.$emit('update:modelValue', undefined)
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ reason: 'vlm_verdict' })
  await wrapper.get('[data-test="filter-reset"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
  expect(lastListParams()).toEqual({ label: 'unlabeled', limit: 50, order: 'asc' })
})
it('shows the remaining count of the current slice and keeps it in step with labels and undo', async () => {
  const base = vi.mocked(apiClient.get).getMockImplementation()!
  vi.mocked(apiClient.get).mockImplementation((url, config) => url === '/api/captures'
    ? Promise.resolve({ data: { data: [...rows], total: 37 } }) : base(url, config))
  await start({ reason: 'random' })
  const counter = () => wrapper.get('[data-test="remaining"]').text()
  expect(counter()).toContain('37')
  await wrapper.get('[data-test="positive"]').trigger('click')
  await flushPromises()
  expect(counter()).toContain('36')
  await wrapper.get('[data-test="undo"]').trigger('click')
  await flushPromises()
  expect(counter()).toContain('37')
})
it('does not query an empty slice when bounds are reversed', async () => {
  await start({ from: '2026-10-02', to: '2026-09-29' })
  expect(listCalls()).toHaveLength(0)
  expect(wrapper.text()).toContain('labeling.filters.badDates')
  expect(wrapper.find('img').exists()).toBe(false)
})

describe('mobile layout (≤ 768px)', () => {
  const player = () => wrapper.get('[data-test="player"]')
  async function swipe(dx: number, dy = 0, pointerType = 'touch') {
    const start = { pointerId: 1, pointerType, clientX: 150, clientY: 200 }
    await player().trigger('pointerdown', start)
    await player().trigger('pointermove', { ...start, clientX: 150 + dx / 2, clientY: 200 + dy / 2 })
    await player().trigger('pointermove', { ...start, clientX: 150 + dx, clientY: 200 + dy })
    await player().trigger('pointerup', { ...start, clientX: 150 + dx, clientY: 200 + dy })
    await flushPromises()
  }
  beforeEach(() => { stubViewportWidth(390) })

  it('pins large label, wrong-person and undo buttons into the bottom action bar', async () => {
    await start()
    const bar = wrapper.get('[data-test="actionbar"]')
    for (const name of ['positive', 'negative', 'unclear', 'wrong-person', 'undo']) {
      expect(bar.find(`[data-test="${name}"]`).exists()).toBe(true)
      expect(wrapper.findAll(`[data-test="${name}"]`)).toHaveLength(1)
    }
    expect(wrapper.find('[data-test="filters"]').exists()).toBe(false)
    await bar.get('[data-test="positive"]').trigger('click')
    await flushPromises()
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: 'positive', activityId: 42 })
    await bar.get('[data-test="undo"]').trigger('click')
    await flushPromises()
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: null })
  })

  it('hides filters behind a "Filters (N)" button that opens a drawer', async () => {
    await start({ reason: 'random', cameraId: '64' })
    const toggle = wrapper.get('[data-test="filters-toggle"]')
    expect(toggle.text()).toContain('(2)')
    expect(wrapper.getComponent(ElDrawer).props('modelValue')).toBe(false)
    await toggle.trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(ElDrawer).props('modelValue')).toBe(true)
    wrapper.get('[data-test="filter-vlm"]').getComponent(ElSelect).vm.$emit('update:modelValue', 'rejected')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ reason: 'random', cameraId: '64', vlmDecision: 'rejected' })
    expect(wrapper.get('[data-test="filters-toggle"]').text()).toContain('(3)')
  })

  it('swipe right labels "positive", swipe left labels "negative"', async () => {
    await start()
    await swipe(120)
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/1/label', { label: 'positive', activityId: 42 })
    await swipe(-120)
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/captures/2/label', { label: 'negative', activityId: 42 })
    expect(apiClient.post).toHaveBeenCalledTimes(2)
  })

  it('ignores short, vertical and mouse drags', async () => {
    await start()
    await swipe(40)
    await swipe(100, 160)
    await swipe(150, 0, 'mouse')
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('shows a yes/no hint while dragging and arms it past the threshold', async () => {
    await start()
    const base = { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 200 }
    await player().trigger('pointerdown', base)
    await player().trigger('pointermove', { ...base, clientX: 190 })
    const hint = () => wrapper.get('[data-test="swipe-hint"]')
    expect(hint().text()).toBe('labeling.mobile.yes')
    expect(hint().classes()).not.toContain('labeling__swipe--armed')
    await player().trigger('pointermove', { ...base, clientX: 250 })
    expect(hint().classes()).toContain('labeling__swipe--armed')
    await player().trigger('pointercancel', base)
    expect(wrapper.find('[data-test="swipe-hint"]').exists()).toBe(false)
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('does not label by swipe while labels are unavailable', async () => {
    const baseGet = vi.mocked(apiClient.get).getMockImplementation()!
    vi.mocked(apiClient.get).mockImplementation((url, config) => url.endsWith('/activities')
      ? Promise.resolve({ data: [] }) : baseGet(url, config))
    rows = [clip(1, null)]
    await start()
    await swipe(150)
    expect(apiClient.post).not.toHaveBeenCalled()
  })
})

it('desktop keeps the filter card and inline buttons, without the mobile action bar', async () => {
  stubViewportWidth(1280)
  await start()
  expect(wrapper.find('[data-test="filters"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="actionbar"]').exists()).toBe(false)
  expect(wrapper.find('[data-test="filters-toggle"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('labeling.shortcuts')
})
