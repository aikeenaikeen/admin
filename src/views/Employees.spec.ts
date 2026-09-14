import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, inject, provide } from 'vue'
import ElementPlus, { ElMessage, ElMessageBox, ElUpload } from 'element-plus'
import Employees from './Employees.vue'
import apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const DialogStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<section v-if="modelValue">
    <button data-close-dialog @click="$emit('update:modelValue', false)">Close</button>
    <slot /><slot name="footer" />
  </section>`,
})

const MenuStub = defineComponent({
  emits: ['select'],
  template: `<button data-edit-employee @click="$emit('select', 'edit')">Edit</button>`,
})

const tableRowsKey = Symbol('employee-table-rows')
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

function createWrapper() {
  return mount(Employees, {
    global: {
      plugins: [ElementPlus],
      stubs: { ElDialog: DialogStub, ElTable: TableStub, ElTableColumn: TableColumnStub, TableActionsMenu: MenuStub },
    },
  })
}

type Wrapper = ReturnType<typeof createWrapper>
let wrapper: Wrapper

async function editEmployee(index: number) {
  await wrapper.findAll('[data-edit-employee]')[index].trigger('click')
  await flushPromises()
}

async function selectPhoto(filename: string) {
  const input = wrapper.get('.gallery-field input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File(['photo'], filename, { type: 'image/jpeg' })],
  })
  await input.trigger('change')
  await flushPromises()
}

function galleryUpload() {
  return wrapper.findAllComponents(ElUpload).find((upload) => upload.props('multiple'))!
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close() {} }))
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close() {} }))
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: url === '/api/employees'
      ? [{ id: 1, name: 'A', photoUrl: null }, { id: 2, name: 'B', photoUrl: null }]
      : [],
  }))
  wrapper = createWrapper()
  await flushPromises()
})

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

describe('Employee gallery request isolation', () => {
  it.each([0, 1])('keeps new selections when an old upload completes after opening row %i', async (nextRow) => {
    const upload = deferred<{ data: unknown[] }>()
    vi.mocked(apiClient.post).mockReturnValueOnce(upload.promise)
    await editEmployee(0)
    await selectPhoto('old.jpg')
    await wrapper.get('.gallery-field__submit').trigger('click')
    await wrapper.get('[data-close-dialog]').trigger('click')
    await editEmployee(nextRow)
    await selectPhoto('new.jpg')

    upload.resolve({ data: [{ id: 10, employeeId: 1 }] })
    await flushPromises()

    expect(wrapper.get('.gallery-field').text()).toContain('new.jpg')
    expect(wrapper.find('.gallery-field__submit').exists()).toBe(true)
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('does not clear the busy state of a newer upload', async () => {
    const oldUpload = deferred<{ data: unknown[] }>()
    const newUpload = deferred<{ data: unknown[] }>()
    vi.mocked(apiClient.post).mockReturnValueOnce(oldUpload.promise).mockReturnValueOnce(newUpload.promise)
    await editEmployee(0)
    await selectPhoto('old.jpg')
    await wrapper.get('.gallery-field__submit').trigger('click')
    await wrapper.get('[data-close-dialog]').trigger('click')
    await editEmployee(1)
    await selectPhoto('new.jpg')
    await wrapper.get('.gallery-field__submit').trigger('click')

    oldUpload.resolve({ data: [] })
    await flushPromises()
    expect(galleryUpload().props('disabled')).toBe(true)
    expect(wrapper.get('.gallery-field').text()).toContain('new.jpg')

    newUpload.resolve({ data: [] })
    await flushPromises()
    expect(galleryUpload().props('disabled')).toBe(false)
  })

  it('suppresses errors from a closed gallery session', async () => {
    const upload = deferred<{ data: unknown[] }>()
    vi.mocked(apiClient.post).mockReturnValueOnce(upload.promise)
    await editEmployee(0)
    await selectPhoto('old.jpg')
    await wrapper.get('.gallery-field__submit').trigger('click')
    await wrapper.get('[data-close-dialog]').trigger('click')
    await editEmployee(1)
    upload.reject(new Error('Old upload failed'))
    await flushPromises()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('ignores an old list response after reopening the same employee', async () => {
    const oldList = deferred<{ data: unknown[] }>()
    vi.mocked(apiClient.get).mockImplementationOnce(() => oldList.promise)
    await editEmployee(0)
    await wrapper.get('[data-close-dialog]').trigger('click')
    await editEmployee(0)
    oldList.resolve({ data: [{ id: 99, employeeId: 1, url: '/stale.jpg' }] })
    await flushPromises()
    expect(wrapper.findAll('.gallery-field__item')).toHaveLength(0)
  })

  it('does not let an initial list response overwrite the post-upload refresh', async () => {
    const oldList = deferred<{ data: unknown[] }>()
    vi.mocked(apiClient.get).mockImplementationOnce(() => oldList.promise)
    await editEmployee(0)
    await selectPhoto('new.jpg')
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: [{ id: 10, employeeId: 1 }] })
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ id: 10, employeeId: 1, url: '/new.jpg' }] })
    await wrapper.get('.gallery-field__submit').trigger('click')
    await flushPromises()
    oldList.resolve({ data: [] })
    await flushPromises()
    expect(wrapper.findAll('.gallery-field__item')).toHaveLength(1)
  })

  it('cancels a pending deletion confirmation when the employee changes', async () => {
    const confirmation = deferred<unknown>()
    vi.spyOn(ElMessageBox, 'confirm').mockReturnValueOnce(confirmation.promise as ReturnType<typeof ElMessageBox.confirm>)
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ id: 10, employeeId: 1, url: '/photo.jpg' }] })
    await editEmployee(0)
    await wrapper.get('.gallery-field__remove').trigger('click')
    await wrapper.get('[data-close-dialog]').trigger('click')
    await editEmployee(1)
    confirmation.resolve('confirm')
    await flushPromises()
    expect(apiClient.delete).not.toHaveBeenCalled()
  })
})
