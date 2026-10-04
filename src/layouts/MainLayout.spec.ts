import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus, { ElDrawer, ElMenu } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import MainLayout from './MainLayout.vue'
import { stubViewportWidth } from '@/test-utils/viewport'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('ru') }) }))
vi.mock('@/i18n', () => ({ persistLocale: vi.fn() }))
vi.mock('@/utils/uiText', () => ({ translateUserRole: (role?: string) => role ?? '' }))

const Page = { template: '<div class="page">page</div>' }
let wrapper: ReturnType<typeof mount> | undefined
let router: Router

async function start(width: number) {
  stubViewportWidth(width)
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/',
      component: MainLayout,
      children: [
        { path: '/dashboard', component: Page },
        { path: '/presence', component: Page },
      ],
    }],
  })
  await router.push('/dashboard')
  await router.isReady()
  wrapper = mount(MainLayout, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, router], stubs: { CommandPalette: true, transition: false } },
  })
  await flushPromises()
  return wrapper
}

describe('MainLayout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
  })

  it('on desktop keeps the sidebar and has no burger button', async () => {
    const w = await start(1280)
    expect(w.find('.el-aside.sidebar').exists()).toBe(true)
    expect(w.find('[data-test="menu-toggle"]').exists()).toBe(false)
    expect(w.findComponent(ElDrawer).exists()).toBe(false)
  })

  it('on phone hides the sidebar behind a burger-opened drawer', async () => {
    const w = await start(390)
    expect(w.find('.el-aside').exists()).toBe(false)
    const toggle = w.get('[data-test="menu-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()
    expect(w.getComponent(ElDrawer).props('modelValue')).toBe(true)
    expect(document.body.querySelector('[data-test="mobile-nav"]')).not.toBeNull()
  })

  it('closes the drawer after navigating from the menu', async () => {
    const w = await start(390)
    await w.get('[data-test="menu-toggle"]').trigger('click')
    await flushPromises()

    w.getComponent(ElMenu).vm.$emit('select', '/presence')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/presence')
    expect(w.getComponent(ElDrawer).props('modelValue')).toBe(false)
  })

  it('closes the drawer even when the current page is chosen again', async () => {
    const w = await start(390)
    await w.get('[data-test="menu-toggle"]').trigger('click')
    await flushPromises()

    w.getComponent(ElMenu).vm.$emit('select', '/dashboard')
    await flushPromises()

    expect(w.getComponent(ElDrawer).props('modelValue')).toBe(false)
  })
})
