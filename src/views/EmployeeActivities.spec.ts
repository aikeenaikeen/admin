import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import ElementPlus, { ElPagination } from 'element-plus'
import EmployeeActivities from './EmployeeActivities.vue'
import apiClient from '../api/client'

const { mobile } = vi.hoisted(() => ({ mobile: { value: false } }))

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  return { useIsMobile: () => ref(mobile.value) }
})

const TableStub = defineComponent({ template: '<div class="table-stub"><slot /></div>' })

const interval = {
  id: 77,
  employeeId: 7,
  employee: { id: 7, name: 'Иван' },
  activityId: 10,
  activity: { id: 10, name: 'Телефон', kind: 'BEHAVIOR' },
  startTime: '2026-10-04T09:00:05Z',
  endTime: '2026-10-04T09:00:41Z',
  confidence: 0.87,
  confirmedCameraIds: [3, 4],
  meta: { evidence: { frames: [{ url: '/e/1.jpg' }, { url: '/e/2.jpg' }, { url: '/e/3.jpg' }] } },
}

let wrapper: ReturnType<typeof mount>

async function mountPage(isMobile: boolean) {
  mobile.value = isMobile
  wrapper = mount(EmployeeActivities, {
    global: { plugins: [ElementPlus], stubs: { ElTable: TableStub, ElTableColumn: true } },
    attachTo: document.body,
  })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => ({
    data: url === '/api/activity-intervals' ? { items: [interval], total: 1 } : [],
  }))
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('EmployeeActivities', () => {
  it('на телефоне показывает интервалы карточками с лентой кадров и компактной пагинацией', async () => {
    await mountPage(true)

    expect(wrapper.find('.table-stub').exists()).toBe(false)
    const card = wrapper.get('[data-test="mobile-interval-cards"] .interval-card')
    expect(card.text()).toContain('Иван')
    expect(card.text()).toContain('Телефон')
    expect(card.text()).toContain('87%')
    expect(card.findAll('[data-test="interval-frames-strip"] img')).toHaveLength(3)

    const pagination = wrapper.getComponent(ElPagination)
    expect(pagination.props('layout')).toBe('prev, pager, next')
    expect(pagination.props('pagerCount')).toBe(5)
  })

  it('по касанию на кадр открывает кадры на весь экран, по одному в ряд', async () => {
    await mountPage(true)
    await wrapper.get('.interval-card__frame').trigger('click')
    await flushPromises()

    expect(document.body.querySelector('.el-dialog.is-fullscreen')).not.toBeNull()
    expect(document.body.querySelectorAll('[data-test="evidence-grid"] img')).toHaveLength(3)
  })

  it('на компьютере остаётся таблица и полная пагинация', async () => {
    await mountPage(false)

    expect(wrapper.find('.table-stub').exists()).toBe(true)
    expect(wrapper.find('[data-test="mobile-interval-cards"]').exists()).toBe(false)
    expect(wrapper.getComponent(ElPagination).props('layout')).toBe('total, sizes, prev, pager, next')
  })
})
