import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElPagination } from 'element-plus'
import Events from './Events.vue'
import apiClient from '@/api/client'
import { stubViewportWidth } from '@/test-utils/viewport'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/utils/uiText', () => ({ translateEventType: (type: string) => `type:${type}` }))

const events = [
  { id: 11, employeeId: 1, type: 'IN', timestamp: '2026-10-04T09:00:00Z', employee: { name: 'Анна' }, camera: { id: 64, name: 'Вход' } },
  { id: 12, employeeId: 2, type: 'OUT', timestamp: '2026-10-04T10:00:00Z', employee: { name: 'Олег' }, camera: null },
]

// happy-dom не тянет MutationObserver настоящей таблицы — подменяем её заглушкой
const TableStub = { name: 'ElTable', template: '<div class="table-stub"><slot /></div>' }
const TableColumnStub = { name: 'ElTableColumn', template: '<div />' }
let wrapper: ReturnType<typeof mount> | undefined

async function start(width: number) {
  stubViewportWidth(width)
  vi.mocked(apiClient.get).mockResolvedValue({ data: { events, pagination: { total: 137 } } })
  wrapper = mount(Events, {
    global: { plugins: [ElementPlus], stubs: { ElTable: TableStub, ElTableColumn: TableColumnStub } },
  })
  await flushPromises()
  return wrapper
}

describe('Events', () => {
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows cards with the key fields instead of a table on phone', async () => {
    const w = await start(390)
    expect(w.findComponent(TableStub).exists()).toBe(false)
    const cards = w.findAll('[data-test="event-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Анна')
    expect(cards[0].text()).toContain('type:IN')
    expect(cards[0].text()).toContain('Вход')
    expect(cards[1].text()).toContain('type:OUT')
  })

  it('uses a compact pagination on phone', async () => {
    const w = await start(390)
    const pagination = w.getComponent(ElPagination)
    expect(pagination.props('layout')).toBe('prev, pager, next')
    expect(pagination.props('pagerCount')).toBe(5)
  })

  it('keeps the table and the full pagination on desktop', async () => {
    const w = await start(1280)
    expect(w.findComponent(TableStub).exists()).toBe(true)
    expect(w.find('[data-test="event-cards"]').exists()).toBe(false)
    expect(w.getComponent(ElPagination).props('layout')).toBe('total, prev, pager, next')
  })
})
