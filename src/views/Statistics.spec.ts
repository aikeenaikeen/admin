import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, inject, provide } from 'vue'
import ElementPlus, { ElPagination } from 'element-plus'
import Statistics from './Statistics.vue'
import apiClient from '../api/client'

const { mobile } = vi.hoisted(() => ({ mobile: { value: false } }))

vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('@/utils/realtime', () => ({ createRealtimeSocket: () => ({ on: vi.fn(), disconnect: vi.fn() }) }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref: vueRef } = await vi.importActual<typeof import('vue')>('vue')
  return { useIsMobile: () => vueRef(mobile.value) }
})

const interval = {
  id: 501,
  employeeId: 7,
  employee: { id: 7, name: 'Иван' },
  activityId: 10,
  activity: { id: 10, code: 'phone', name: 'Телефон', kind: 'BEHAVIOR' },
  startTime: '2026-10-04T09:00:05Z',
  endTime: '2026-10-04T09:00:41Z',
  confidence: 0.93,
  confirmedCameraIds: [3],
  meta: {
    evidence: {
      windows: [
        { score: 0.9, frames: [{ url: 'evidence/a1.jpg' }, { url: 'evidence/a2.jpg' }, { url: 'evidence/a3.jpg' }] },
        { score: 0.95, frames: [{ url: '/evidence/b1.jpg' }] },
      ],
    },
  },
}

function mockApi() {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const routes: Record<string, unknown> = {
      '/api/statistics': { summary: { totalEvents: 12, uniqueEmployees: 2, avgEventsPerDay: '6' } },
      '/api/presence': [
        { id: 7, name: 'Иван', photoUrl: null, present: true, lastEventType: 'IN', lastEventTime: '2026-10-04T09:10:00Z' },
        { id: 8, name: 'Пётр', photoUrl: null, present: false, lastEventType: 'OUT', lastEventTime: '2026-10-04T08:00:00Z' },
      ],
      '/api/employees': [
        { id: 8, name: 'Пётр', photoUrl: null },
        { id: 7, name: 'Иван', photoUrl: null },
      ],
      '/api/cameras': [{ id: 3, name: 'Холл', location: 'Офис' }],
      '/api/employees/7/activities': { activities: [] },
      '/api/employees/7/appearance-summary': null,
      '/api/events': {
        events: [{ id: 1, employeeId: 7, type: 'IN', timestamp: '2026-10-04T09:10:00Z', employee: { name: 'Иван' } }],
        pagination: { total: 1, page: 1, limit: 20 },
      },
      '/api/activity-intervals': { items: [interval], total: 1, page: 1, pageSize: 20 },
    }
    return { data: routes[url] }
  })
}

// el-table не работает в happy-dom (MutationObserver), поэтому на компьютерном виде — простые заглушки.
const tableRowsKey = Symbol('table-rows')
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  emits: ['row-click', 'expand-change'],
  setup(props) {
    provide(tableRowsKey, () => props.data)
  },
  template: '<div class="table-stub"><slot /></div>',
})
const TableColumnStub = defineComponent({
  setup() {
    return { rows: inject<() => unknown[]>(tableRowsKey, () => []) }
  },
  template: '<div><slot v-for="row in rows()" :row="row" /></div>',
})

let wrapper: ReturnType<typeof mount>

async function mountStatistics(isMobile: boolean) {
  mobile.value = isMobile
  wrapper = mount(Statistics, {
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: isMobile ? {} : { ElTable: TableStub, ElTableColumn: TableColumnStub },
    },
    attachTo: document.body,
  })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi()
})

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('Statistics: телефон', () => {
  it('показывает сотрудников карточками вместо таблицы, свежие события сверху', async () => {
    await mountStatistics(true)

    expect(wrapper.find('.employee-stats-table').exists()).toBe(false)
    const cards = wrapper.findAll('[data-test="mobile-employee-toggle"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Иван')
  })

  it('по касанию раскрывает сотрудника: интервалы карточками, лента кадров внутри карточки', async () => {
    await mountStatistics(true)
    await wrapper.get('[data-test="mobile-employee-toggle"]').trigger('click')
    await flushPromises()

    expect(apiClient.get).toHaveBeenCalledWith('/api/activity-intervals', expect.objectContaining({
      params: expect.objectContaining({ employeeId: 7 }),
    }))
    const intervalCards = wrapper.get('[data-test="mobile-interval-cards"]')
    expect(intervalCards.text()).toContain('Телефон')
    expect(intervalCards.text()).toMatch(/\d{2}\.10 \d{2}:00:05 – \d{2}:00:41/)

    const strip = intervalCards.get('[data-test="interval-frames-strip"]')
    const images = strip.findAll('img')
    expect(images).toHaveLength(4)
    // Самое уверенное окно идёт первым, относительные пути нормализуются.
    expect(images[0].attributes('src')).toBe('/evidence/b1.jpg')
    expect(images[1].attributes('src')).toBe('/evidence/a1.jpg')

    expect(wrapper.find('[data-test="mobile-event-cards"]').exists()).toBe(true)
    expect(wrapper.find('.el-table').exists()).toBe(false)
  })

  it('пагинация деталей получает компактные мобильные опции, кадры открываются на весь экран', async () => {
    await mountStatistics(true)
    await wrapper.get('[data-test="mobile-employee-toggle"]').trigger('click')
    await flushPromises()

    const paginations = wrapper.findAllComponents(ElPagination)
    expect(paginations.length).toBeGreaterThan(0)
    for (const pagination of paginations) {
      expect(pagination.props('layout')).toBe('prev, pager, next')
      expect(pagination.props('size')).toBe('small')
      expect(pagination.props('pagerCount')).toBe(5)
    }

    await wrapper.get('[data-test="interval-evidence-button"]').trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.activity-evidence-dialog.is-fullscreen')
    expect(dialog).not.toBeNull()
  })
})

describe('Statistics: компьютер', () => {
  it('оставляет таблицу сотрудников и полную пагинацию', async () => {
    await mountStatistics(false)

    expect(wrapper.find('.employee-stats-table').exists()).toBe(true)
    expect(wrapper.find('[data-test="mobile-employee-cards"]').exists()).toBe(false)

    const employeesTable = wrapper.findAllComponents(TableStub).find((table) => table.classes('employee-stats-table'))
    employeesTable?.vm.$emit('row-click', { id: 7, name: 'Иван', photoUrl: null }, {})
    await flushPromises()

    expect(apiClient.get).toHaveBeenCalledWith('/api/activity-intervals', expect.anything())

    expect(wrapper.find('[data-test="mobile-interval-cards"]').exists()).toBe(false)
    const layouts = wrapper.findAllComponents(ElPagination).map((pagination) => pagination.props('layout'))
    expect(layouts.length).toBeGreaterThan(0)
    expect(layouts.every((layout) => layout === 'total, sizes, prev, pager, next')).toBe(true)
  })
})
