import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, inject, provide } from 'vue'
import ElementPlus, { ElMessage, ElMessageBox, ElUpload } from 'element-plus'
import Employees from './Employees.vue'
import apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ref(mobile.value) }
})
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
  mobile.value = false
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

describe('Employees on a phone', () => {
  beforeEach(async () => {
    wrapper.unmount()
    mobile.value = true
    wrapper = createWrapper()
    await flushPromises()
  })

  it('shows employees as cards instead of the table', () => {
    const cards = wrapper.findAll('.employee-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('A')
    expect(wrapper.find('[data-test="employee-cards"]').exists()).toBe(true)
  })

  it('opens the employee with the gallery on card tap', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ id: 10, employeeId: 2, url: '/photo.jpg' }] })
    await wrapper.findAll('.employee-card__main')[1].trigger('click')
    await flushPromises()

    expect(apiClient.get).toHaveBeenCalledWith('/api/employees/2/photos')
    expect(wrapper.findAll('.gallery-field__item')).toHaveLength(1)
  })

  it('lets the phone pick photos from the camera or gallery', async () => {
    await wrapper.findAll('.employee-card__main')[0].trigger('click')
    await flushPromises()
    const inputs = wrapper.findAll('input[type="file"]')
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every((input) => input.attributes('accept') === 'image/*')).toBe(true)
  })
})

describe('Employee bib number and shift color', () => {
  const employeesWithBib = [
    { id: 1, name: 'A', photoUrl: null, bibNumber: '17', shiftColor: 'blue' },
    { id: 2, name: 'B', photoUrl: null, bibNumber: null, shiftColor: null },
  ]

  async function remount(isPhone: boolean) {
    wrapper.unmount()
    mobile.value = isPhone
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({
      data: url === '/api/employees' ? employeesWithBib : [],
    }))
    wrapper = createWrapper()
    await flushPromises()
  }

  function sentForm() {
    const [, body] = vi.mocked(apiClient.put).mock.calls[0]
    return body as FormData
  }

  it.each([false, true])('shows bib number and shift mark in the list (phone: %s)', async (isPhone) => {
    await remount(isPhone)
    expect(wrapper.findAll('[data-test="employee-bib"]')).toHaveLength(1)
    const shift = wrapper.findAll('[data-test="employee-shift"]')
    expect(shift).toHaveLength(1)
    expect(shift[0].classes()).toContain('shift-mark--blue')
    expect(shift[0].text()).toContain('employees.shiftColors.blue')
  })

  it('sends both fields on save and empty values to clear them', async () => {
    await remount(false)
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} })
    await editEmployee(0)
    expect((wrapper.get('input[data-test="bib-number-input"]').element as HTMLInputElement).value).toBe('17')
    await wrapper.get('input[data-test="bib-number-input"]').setValue(' 21 ')
    await wrapper.findAll('button').find((b) => b.text() === 'common.actions.save')!.trigger('click')
    await flushPromises()
    expect(sentForm().get('bibNumber')).toBe('21')
    expect(sentForm().get('shiftColor')).toBe('blue')

    vi.mocked(apiClient.put).mockClear()
    await editEmployee(1)
    await wrapper.findAll('button').find((b) => b.text() === 'common.actions.save')!.trigger('click')
    await flushPromises()
    expect(sentForm().get('bibNumber')).toBe('')
    expect(sentForm().get('shiftColor')).toBe('')
  })

  function clickSave() {
    return wrapper.findAll('button').find((b) => b.text() === 'common.actions.save')!.trigger('click')
  }

  it('explains a duplicate bib number in the shift', async () => {
    await remount(false)
    vi.mocked(apiClient.put).mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'Номер 17 уже занят в синей смене', code: 'BIB_NUMBER_TAKEN', bibNumber: '17', shiftColor: 'blue' },
      },
    })
    await editEmployee(0)
    await clickSave()
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('employees.bibNumberTakenInShift')
  })

  it('asks for a shift color when only the bib number is entered', async () => {
    await remount(false)
    await editEmployee(1)
    const shiftItem = () => wrapper.get('[data-test="shift-color-select"]').element.closest('.el-form-item')!
    expect(shiftItem().classList.contains('is-error')).toBe(false)
    await wrapper.get('input[data-test="bib-number-input"]').setValue('5')
    await flushPromises()
    expect(shiftItem().classList.contains('is-error')).toBe(true)
    await clickSave()
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('employees.dialog.shiftColorRequired')
    expect(apiClient.put).not.toHaveBeenCalled()
  })

  it('explains the server refusal of a bib number without shift color', async () => {
    await remount(false)
    vi.mocked(apiClient.put).mockRejectedValueOnce({
      response: { status: 400, data: { error: 'Shift color is required', code: 'SHIFT_COLOR_REQUIRED' } },
    })
    await editEmployee(0)
    await clickSave()
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('employees.dialog.shiftColorRequired')
  })
})
