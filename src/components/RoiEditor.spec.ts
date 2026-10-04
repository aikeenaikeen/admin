import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RoiEditor from './RoiEditor.vue'
import apiClient from '@/api/client'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ref(mobile.value) }
})
vi.mock('@/api/client', () => ({ default: { get: vi.fn(async () => ({ data: { mjpegUrl: '/streams/1.mjpg' } })) } }))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))

function createWrapper() {
  return mount(RoiEditor, {
    props: { cameraId: 1 },
    global: { plugins: [ElementPlus] },
  })
}

afterEach(() => {
  mobile.value = false
  vi.clearAllMocks()
})

describe('RoiEditor', () => {
  it('shows the drawing canvas on a computer', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(wrapper.find('[data-test="roi-mobile-hint"]').exists()).toBe(false)
    expect(apiClient.get).toHaveBeenCalledWith('/api/cameras/1/stream-url')
  })

  it('asks to edit zones on a computer instead of drawing on a phone', async () => {
    mobile.value = true
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.get('[data-test="roi-mobile-hint"]').text()).toContain('roiEditor.mobileHint')
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)

    await wrapper.get('.editor-actions button').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
