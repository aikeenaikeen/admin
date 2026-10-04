import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, inject, provide } from 'vue'
import ElementPlus, { ElMessage } from 'element-plus'
import Cameras from './Cameras.vue'
import apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ref(mobile.value) }
})
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))

const SelectStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', Number($event.target.value))"><slot /></select>`,
})
const OptionStub = defineComponent({
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>',
})

const MenuStub = defineComponent({
  emits: ['select'],
  template: `<button data-edit-camera @click="$emit('select', 'edit')">Edit</button>`,
})

const tableRowsKey = Symbol('camera-table-rows')
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props) {
    provide(tableRowsKey, () => props.data)
  },
  template: '<div><slot /></div>',
})
const TableColumnStub = defineComponent({
  setup() {
    return { rows: inject<() => unknown[]>(tableRowsKey, () => []) }
  },
  template: '<div><slot v-for="row in rows()" :row="row" /></div>',
})

const StreamDialogStub = defineComponent({
  name: 'CameraStreamDialog',
  props: ['modelValue', 'camera', 'recognition', 'modeSwitchable'],
  template: '<div data-test="stream-dialog" />',
})

const ceilingCamera = {
  id: 64,
  name: 'Потолок',
  location: null,
  ip: '192.168.1.64',
  rtspPort: 554,
  username: 'admin',
  rtspPath: '/stream',
  isActive: true,
  recognitionEnabled: true,
  rotation: 90,
}

function createWrapper() {
  return mount(Cameras, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElSelect: SelectStub,
        ElOption: OptionStub,
        ElTable: TableStub,
        ElTableColumn: TableColumnStub,
        TableActionsMenu: MenuStub,
        CameraStreamDialog: StreamDialogStub,
      },
    },
  })
}

let wrapper: ReturnType<typeof createWrapper>

function rotationSelect() {
  return wrapper.get<HTMLSelectElement>('[data-test="camera-rotation"]')
}

function buttonByText(text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)!
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close() {} }) as never)
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close() {} }) as never)
  vi.mocked(apiClient.get).mockResolvedValue({ data: [ceilingCamera] })
  vi.mocked(apiClient.put).mockResolvedValue({ data: ceilingCamera })
  vi.mocked(apiClient.post).mockResolvedValue({ data: ceilingCamera })
  wrapper = createWrapper()
  await flushPromises()
})

afterEach(() => {
  wrapper?.unmount()
  mobile.value = false
  vi.restoreAllMocks()
})

describe('Camera rotation field', () => {
  it('offers the four right angles with a label for no rotation', async () => {
    await buttonByText('cameras.addButton').trigger('click')
    const options = rotationSelect().findAll('option')
    expect(options.map((option) => option.element.value)).toEqual(['0', '90', '180', '270'])
    expect(options[0].text()).toBe('cameras.form.rotationNone')
    expect(options[1].text()).toBe('cameras.form.rotationDegrees:{"degrees":90}')
  })

  it('loads the saved rotation into the edit form and sends the changed value', async () => {
    await wrapper.get('[data-edit-camera]').trigger('click')
    expect(rotationSelect().element.value).toBe('90')

    await rotationSelect().setValue('270')
    await buttonByText('common.actions.save').trigger('click')
    await flushPromises()

    expect(apiClient.put).toHaveBeenCalledWith('/api/cameras/64', expect.objectContaining({ rotation: 270 }))
  })

  it('creates a camera without rotation by default', async () => {
    await buttonByText('cameras.addButton').trigger('click')
    expect(rotationSelect().element.value).toBe('0')
    await wrapper.get('input[type="password"]').setValue('secret')
    await buttonByText('common.actions.create').trigger('click')
    await flushPromises()

    expect(apiClient.post).toHaveBeenCalledWith('/api/cameras', expect.objectContaining({ rotation: 0 }))
  })
})

describe('Cameras on a phone', () => {
  beforeEach(async () => {
    wrapper.unmount()
    mobile.value = true
    wrapper = createWrapper()
    await flushPromises()
  })

  it('shows cameras as cards with status and both stream buttons', () => {
    const card = wrapper.get('.camera-card')
    expect(card.text()).toContain('Потолок')
    expect(card.text()).toContain('192.168.1.64:554')
    expect(card.text()).toContain('cameras.table.active')
    expect(card.findAll('.camera-card__actions button')).toHaveLength(2)
  })

  it('opens the stream full screen with the recognition switch allowed', async () => {
    await buttonByText('cameras.table.ai').trigger('click')
    const dialog = wrapper.getComponent(StreamDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('recognition')).toBe(true)
    expect(dialog.props('modeSwitchable')).toBe(true)

    dialog.vm.$emit('update:recognition', false)
    await flushPromises()
    expect(dialog.props('recognition')).toBe(false)
  })

  it('edits rotation from the card menu in a one-column form', async () => {
    await wrapper.get('[data-edit-camera]').trigger('click')
    expect(rotationSelect().element.value).toBe('90')
    expect(wrapper.find('.el-form--label-top').exists()).toBe(true)
  })
})
