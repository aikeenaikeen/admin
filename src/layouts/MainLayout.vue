<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { type AppLocale, persistLocale } from '@/i18n'
import LogoIcon from '@/components/icons/LogoIcon.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { translateUserRole } from '@/utils/uiText'
import {
  Location,
  Setting,
  User,
  VideoCamera,
  TrendCharts,
  OfficeBuilding,
  Operation,
  Moon,
  Sunny,
  Fold,
  Expand,
  SwitchButton,
  Search,
  EditPen,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const { t, locale } = useI18n()

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed'
const MOBILE_BREAKPOINT = 768

const isMobile = ref(false)
const isCollapsed = ref(false)
const mobileDrawerOpen = ref(false)
const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
const commandPaletteHint = computed(() => (isMac ? '⌘K' : 'Ctrl+K'))

function openCommandPalette() {
  commandPaletteRef.value?.open()
}

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

function persistCollapsed(value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0')
}

function syncBreakpoint() {
  if (typeof window === 'undefined') return
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
}

onMounted(() => {
  isCollapsed.value = readStoredCollapsed()
  syncBreakpoint()
  window.addEventListener('resize', syncBreakpoint)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncBreakpoint)
})

watch(isCollapsed, (value) => persistCollapsed(value))
watch(() => route.fullPath, () => {
  mobileDrawerOpen.value = false
})

const activeIndex = computed(() => route.path)

const localeOptions = computed(() => [
  { value: 'ru' as AppLocale, label: t('layout.languageOptions.ru') },
  { value: 'en' as AppLocale, label: t('layout.languageOptions.en') },
])

const currentLocale = computed<AppLocale>({
  get: () => locale.value as AppLocale,
  set: (value) => {
    locale.value = value
    persistLocale(value)
  },
})

const menuItems = computed(() => {
  const items = [
    { index: '/dashboard', title: t('layout.menu.dashboard'), icon: TrendCharts },
    { index: '/employees', title: t('layout.menu.employees'), icon: User },
    { index: '/cameras', title: t('layout.menu.cameras'), icon: VideoCamera },
    { index: '/presence', title: t('layout.menu.presence'), icon: Location },
    { index: '/statistics', title: t('layout.menu.statistics'), icon: TrendCharts },
    { index: '/labeling', title: t('layout.menu.labeling'), icon: EditPen },
  ]

  if (authStore.isSuperAdmin) {
    items.push({ index: '/activities', title: t('layout.menu.activities'), icon: Operation })
    items.push({ index: '/companies', title: t('layout.menu.companies'), icon: OfficeBuilding })
    items.push({ index: '/users', title: t('layout.menu.users'), icon: Setting })
  }

  return items
})

function handleSelect(index: string) {
  router.push(index)
}

function toggleTheme() {
  themeStore.isDark = !themeStore.isDark
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileDrawerOpen.value = !mobileDrawerOpen.value
  } else {
    isCollapsed.value = !isCollapsed.value
  }
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <a class="skip-link" href="#main-content">{{ t('layout.skipToContent') }}</a>
  <el-container class="layout-container">
    <!-- Desktop sidebar -->
    <el-aside
      v-if="!isMobile"
      :width="isCollapsed ? '64px' : '250px'"
      class="sidebar"
      :class="{ collapsed: isCollapsed }"
    >
      <div class="logo" :class="{ 'logo--collapsed': isCollapsed }">
        <LogoIcon
          class="logo-image"
          :size="36"
          :title="t('common.brandLogoTitle')"
        />
        <h2 v-show="!isCollapsed">{{ t('common.appName') }}</h2>
      </div>

      <div class="palette-trigger-wrap" :class="{ 'palette-trigger-wrap--collapsed': isCollapsed }">
        <el-tooltip
          :content="`${t('commandPalette.openHint')} (${commandPaletteHint})`"
          placement="right"
          :disabled="!isCollapsed"
        >
          <button
            type="button"
            class="palette-trigger"
            :class="{ 'palette-trigger--collapsed': isCollapsed }"
            :aria-label="t('commandPalette.openHint')"
            @click="openCommandPalette"
          >
            <el-icon><Search /></el-icon>
            <span v-show="!isCollapsed" class="palette-trigger__label">{{ t('commandPalette.openHint') }}</span>
            <span v-show="!isCollapsed" class="palette-trigger__kbd">{{ commandPaletteHint }}</span>
          </button>
        </el-tooltip>
      </div>

      <el-menu
        :default-active="activeIndex"
        :collapse="isCollapsed"
        :collapse-transition="false"
        class="sidebar-menu"
        @select="handleSelect"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.index"
          :index="item.index"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>

      <div class="user-section">
        <el-tooltip
          :disabled="!isCollapsed"
          :content="authStore.user?.email || ''"
          placement="right"
        >
          <div class="user-info" :class="{ 'user-info--collapsed': isCollapsed }">
            <el-icon size="20"><User /></el-icon>
            <div v-show="!isCollapsed" class="user-details">
              <div class="user-email">{{ authStore.user?.email }}</div>
              <div class="user-role">{{ translateUserRole(authStore.user?.role) }}</div>
            </div>
          </div>
        </el-tooltip>

        <div v-if="!isCollapsed" class="locale-switch">
          <div class="locale-label">{{ t('layout.language') }}</div>
          <el-select v-model="currentLocale" size="small">
            <el-option
              v-for="option in localeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>

        <div class="action-row" :class="{ stacked: !isCollapsed }">
          <el-tooltip :content="t('layout.theme')" placement="right">
            <el-button
              :icon="themeStore.isDark ? Sunny : Moon"
              circle
              plain
              :aria-label="t('layout.theme')"
              @click="toggleTheme"
            />
          </el-tooltip>

          <el-tooltip
            :content="isCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')"
            placement="right"
          >
            <el-button
              :icon="isCollapsed ? Expand : Fold"
              circle
              plain
              :aria-label="isCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')"
              @click="toggleSidebar"
            />
          </el-tooltip>

          <el-tooltip :content="t('common.actions.logout')" placement="right">
            <el-button
              type="danger"
              :icon="SwitchButton"
              circle
              plain
              :aria-label="t('common.actions.logout')"
              @click="logout"
            />
          </el-tooltip>
        </div>
      </div>
    </el-aside>

    <!-- Mobile drawer -->
    <el-drawer
      v-if="isMobile"
      v-model="mobileDrawerOpen"
      direction="ltr"
      size="260px"
      :with-header="false"
      :modal="true"
    >
      <div class="sidebar mobile">
        <div class="logo">
          <LogoIcon class="logo-image" :size="36" :title="t('common.brandLogoTitle')" />
          <h2>{{ t('common.appName') }}</h2>
        </div>

        <el-menu
          :default-active="activeIndex"
          class="sidebar-menu"
          @select="handleSelect"
        >
          <el-menu-item
            v-for="item in menuItems"
            :key="item.index"
            :index="item.index"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </el-menu>

        <div class="user-section">
          <div class="user-info">
            <el-icon size="20"><User /></el-icon>
            <div class="user-details">
              <div class="user-email">{{ authStore.user?.email }}</div>
              <div class="user-role">{{ translateUserRole(authStore.user?.role) }}</div>
            </div>
          </div>

          <div class="locale-switch">
            <div class="locale-label">{{ t('layout.language') }}</div>
            <el-select v-model="currentLocale" size="small">
              <el-option
                v-for="option in localeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>

          <div class="action-row stacked">
            <el-button :icon="themeStore.isDark ? Sunny : Moon" plain @click="toggleTheme">
              {{ t('layout.theme') }}
            </el-button>
            <el-button type="danger" :icon="SwitchButton" plain @click="logout">
              {{ t('common.actions.logout') }}
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-container>
      <el-header v-if="isMobile" class="mobile-header">
        <el-button
          :icon="Expand"
          text
          :aria-label="t('layout.openMenu')"
          @click="toggleSidebar"
        />
        <div class="mobile-brand">
          <LogoIcon :size="28" :title="t('common.brandLogoTitle')" />
          <span>{{ t('common.appName') }}</span>
        </div>
        <div class="mobile-header__actions">
          <el-button
            :icon="Search"
            circle
            plain
            :aria-label="t('commandPalette.openHint')"
            @click="openCommandPalette"
          />
          <el-button
            :icon="themeStore.isDark ? Sunny : Moon"
            circle
            plain
            :aria-label="t('layout.theme')"
            @click="toggleTheme"
          />
        </div>
      </el-header>

      <el-main id="main-content" class="main-content" tabindex="-1">
        <router-view v-slot="{ Component, route: r }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="r.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <CommandPalette ref="commandPaletteRef" />
  </el-container>
</template>

<style scoped>
.skip-link {
  position: absolute;
  left: 12px;
  top: -40px;
  z-index: 9999;
  padding: 8px 14px;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  border-radius: 6px;
  font-size: 13px;
  text-decoration: none;
  transition: top 0.18s ease;
}

.skip-link:focus,
.skip-link:focus-visible {
  top: 12px;
  outline: 2px solid var(--el-color-primary-light-3);
  outline-offset: 2px;
}

.layout-container {
  min-height: 100vh;
}

.sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  height: 100vh;
  position: sticky;
  top: 0;
}

.sidebar.collapsed {
  align-items: stretch;
}

.sidebar.mobile {
  height: 100vh;
  border-right: none;
}

.logo {
  padding: 14px 10px 14px 16px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
}

.logo--collapsed {
  justify-content: center;
  padding: 14px 0;
}

.logo h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logo-image {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
  overflow-y: auto;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 100%;
}

.user-section {
  padding: 16px;
  border-top: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sidebar.collapsed .user-section {
  padding: 12px 8px;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.user-info--collapsed {
  justify-content: center;
  padding: 8px;
  width: 100%;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-email {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.locale-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.action-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.action-row.stacked {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.sidebar.mobile .action-row.stacked {
  grid-template-columns: 1fr 1fr;
}

.main-content {
  background: var(--el-bg-color-page);
  padding: 0;
  min-height: calc(100vh - 0px);
}

.main-content:focus {
  outline: none;
}

.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  position: sticky;
  top: 0;
  z-index: 10;
  height: 56px;
}

.mobile-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mobile-header__actions {
  display: flex;
  gap: 8px;
}

/* Command palette trigger */
.palette-trigger-wrap {
  padding: 10px 12px 4px 12px;
}

.palette-trigger-wrap--collapsed {
  padding: 10px 8px 4px 8px;
}

.palette-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.palette-trigger:hover {
  border-color: var(--el-color-primary);
  color: var(--el-text-color-primary);
}

.palette-trigger--collapsed {
  padding: 8px 0;
  justify-content: center;
}

.palette-trigger__label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-trigger__kbd {
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Page transition */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
