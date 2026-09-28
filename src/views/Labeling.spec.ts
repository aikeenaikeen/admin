import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElSelect, ElRadioGroup } from 'element-plus'
import Labeling from './Labeling.vue'
import apiClient from '../api/client'
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
beforeEach(() => {
  vi.clearAllMocks()
  rows = [clip(1), clip(2)]
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close() {} }))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() }))
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data:
    url === '/api/captures' ? { data: [...rows] }
      : url === '/api/captures/stats' ? { counts: { unlabeled: 2 }, total: 2 }
        : url.endsWith('/activities') ? [{ id: 42, name: 'Cleaning' }]
          : new Blob(['jpeg'], { type: 'image/jpeg' }),
  }))
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function start() {
  wrapper = mount(Labeling, { global: { plugins: [ElementPlus] } })
  await flushPromises()
}
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
  wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 42)
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
