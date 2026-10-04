import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import CameraStreamDialog from './CameraStreamDialog.vue'
import apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ref(mobile.value) }
})
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

// Без телепорта и анимаций: содержимое рендерится на месте, пока modelValue = true.
const DialogStub = defineComponent({
  props: ['modelValue', 'fullscreen'],
  emits: ['update:modelValue', 'close'],
  template: '<div v-if="modelValue" class="dialog" :data-fullscreen="fullscreen"><slot /></div>',
})

const passthrough = defineComponent({ template: '<div><slot /></div>' })
const SwitchStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
})

const camera = (id: number) => ({ id, name: `Cam ${id}`, location: null })

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(CameraStreamDialog, {
    props: { modelValue: false, camera: camera(1), ...props },
    attachTo: document.body,
    global: {
      stubs: { ElDialog: DialogStub, ElTag: passthrough, ElIcon: passthrough, ElAlert: true, ElSwitch: SwitchStub },
      directives: { loading: {} },
    },
  })
}

// Перехватываем все присваивания src у <img>, чтобы видеть обрыв потока.
let srcWrites: Array<{ el: HTMLImageElement; value: string }>
let restoreSrc: () => void

beforeEach(() => {
  srcWrites = []
  const proto = Object.getPrototypeOf(document.createElement('img'))
  let owner = proto
  while (owner && !Object.getOwnPropertyDescriptor(owner, 'src')) owner = Object.getPrototypeOf(owner)
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'src')!
  Object.defineProperty(owner, 'src', {
    configurable: true,
    get: descriptor.get,
    set(this: HTMLImageElement, value: string) {
      srcWrites.push({ el: this, value })
      descriptor.set!.call(this, value)
    },
  })
  restoreSrc = () => Object.defineProperty(owner, 'src', descriptor)
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const id = url.match(/cameras\/(\d+)\//)![1]
    return { data: { mjpegUrl: `/streams/${id}.mjpg?token=t&preview=1` } }
  })
})

afterEach(() => {
  mobile.value = false
  restoreSrc()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

function streamWrites(el: HTMLImageElement) {
  return srcWrites.filter((w) => w.el === el).map((w) => w.value)
}

describe('CameraStreamDialog', () => {
  it('loads stream-url and cuts the stream on close before removing <img>', async () => {
    const wrapper = createWrapper()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const img = wrapper.get('img').element as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/^\/streams\/1\.mjpg\?token=t&preview=1&ts=\d+$/)

    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    const writes = streamWrites(img)
    expect(writes[writes.length - 1]).toBe(BLANK)
    expect(img.getAttribute('src')).toBe(BLANK)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('cuts the recognition stream (/video_feed) on close', async () => {
    const wrapper = createWrapper({ recognition: true })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const img = wrapper.get('img').element as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/\/video_feed\?cameraId=1&ts=\d+$/)
    expect(apiClient.get).not.toHaveBeenCalled()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    expect(img.getAttribute('src')).toBe(BLANK)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('cuts the old stream when camera changes and keeps a single <img>', async () => {
    const wrapper = createWrapper()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    const first = wrapper.get('img').element as HTMLImageElement

    await wrapper.setProps({ camera: camera(2) })
    await flushPromises()

    expect(streamWrites(first)).toContain(BLANK)
    const imgs = wrapper.findAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attributes('src')).toMatch(/^\/streams\/2\.mjpg/)
  })

  it('cuts the old stream when switching to recognition mode', async () => {
    const wrapper = createWrapper()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    const first = wrapper.get('img').element as HTMLImageElement

    await wrapper.setProps({ recognition: true })
    await flushPromises()

    expect(streamWrites(first)).toContain(BLANK)
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.get('img').attributes('src')).toMatch(/\/video_feed\?cameraId=1/)
  })

  it('cuts the stream on unmount', async () => {
    const wrapper = createWrapper()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    const img = wrapper.get('img').element as HTMLImageElement

    wrapper.unmount()

    expect(img.getAttribute('src')).toBe(BLANK)
  })

  it('reopening does not leave previous streams open', async () => {
    const wrapper = createWrapper()
    const opened: HTMLImageElement[] = []

    for (let i = 0; i < 3; i += 1) {
      await wrapper.setProps({ modelValue: true })
      await flushPromises()
      opened.push(wrapper.get('img').element as HTMLImageElement)
      await wrapper.setProps({ modelValue: false })
      await flushPromises()
    }

    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(opened.every((el) => el.getAttribute('src') === BLANK)).toBe(true)
    expect(document.querySelectorAll('img')).toHaveLength(1)
  })

  it('does not show a stream that resolves after the dialog was closed', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(apiClient.get).mockReturnValueOnce(new Promise((r) => { resolve = r }) as never)
    const wrapper = createWrapper()
    await wrapper.setProps({ modelValue: true })
    await wrapper.setProps({ modelValue: false })
    resolve({ data: { mjpegUrl: '/streams/1.mjpg?token=t' } })
    await flushPromises()

    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(document.querySelectorAll('img')).toHaveLength(1)
    expect(srcWrites.filter((w) => w.value.startsWith('/streams/'))).toHaveLength(1)
  })
})

describe('CameraStreamDialog on a phone', () => {
  it('stays a regular dialog without the switch on a computer', async () => {
    const wrapper = createWrapper({ modeSwitchable: true })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(wrapper.get('.dialog').attributes('data-fullscreen')).toBe('false')
    expect(wrapper.find('[data-test="recognition-switch"]').exists()).toBe(false)
  })

  it('goes full screen and lets the user toggle recognition mode', async () => {
    mobile.value = true
    const wrapper = createWrapper({ modeSwitchable: true })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(wrapper.get('.dialog').attributes('data-fullscreen')).toBe('true')
    const toggle = wrapper.get('[data-test="recognition-switch"]')
    await toggle.setValue(true)
    expect(wrapper.emitted('update:recognition')).toEqual([[true]])
  })

  it('hides the switch when the camera has no recognition', async () => {
    mobile.value = true
    const wrapper = createWrapper({ modeSwitchable: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(wrapper.find('[data-test="recognition-switch"]').exists()).toBe(false)
  })
})
