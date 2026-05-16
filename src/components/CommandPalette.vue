<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { type AppLocale, persistLocale } from '@/i18n'
import { fuzzyMatch } from '@/utils/fuzzy'
import {
  TrendCharts,
  User,
  VideoCamera,
  Location,
  Operation,
  OfficeBuilding,
  Setting,
  Moon,
  Sunny,
  SwitchButton,
  Refresh,
  Search,
} from '@element-plus/icons-vue'

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  icon: any
  keywords?: string
  hidden?: boolean
  perform: () => unknown
}

const router = useRouter()
const { t, locale } = useI18n()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const visible = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

function close() {
  visible.value = false
  query.value = ''
  activeIndex.value = 0
}

function open() {
  visible.value = true
  query.value = ''
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}

function toggle() {
  if (visible.value) close()
  else open()
}

function setLocale(value: AppLocale) {
  locale.value = value
  persistLocale(value)
}

const commands = computed<Command[]>(() => {
  const cmds: Command[] = [
    {
      id: 'nav:dashboard',
      label: t('commandPalette.commands.goDashboard'),
      group: t('commandPalette.groups.navigation'),
      icon: TrendCharts,
      perform: () => router.push('/dashboard'),
    },
    {
      id: 'nav:employees',
      label: t('commandPalette.commands.goEmployees'),
      group: t('commandPalette.groups.navigation'),
      icon: User,
      perform: () => router.push('/employees'),
    },
    {
      id: 'nav:cameras',
      label: t('commandPalette.commands.goCameras'),
      group: t('commandPalette.groups.navigation'),
      icon: VideoCamera,
      perform: () => router.push('/cameras'),
    },
    {
      id: 'nav:presence',
      label: t('commandPalette.commands.goPresence'),
      group: t('commandPalette.groups.navigation'),
      icon: Location,
      perform: () => router.push('/presence'),
    },
    {
      id: 'nav:statistics',
      label: t('commandPalette.commands.goStatistics'),
      group: t('commandPalette.groups.navigation'),
      icon: TrendCharts,
      perform: () => router.push('/statistics'),
    },
  ]

  if (authStore.isSuperAdmin) {
    cmds.push(
      {
        id: 'nav:activities',
        label: t('commandPalette.commands.goActivities'),
        group: t('commandPalette.groups.navigation'),
        icon: Operation,
        perform: () => router.push('/activities'),
      },
      {
        id: 'nav:companies',
        label: t('commandPalette.commands.goCompanies'),
        group: t('commandPalette.groups.navigation'),
        icon: OfficeBuilding,
        perform: () => router.push('/companies'),
      },
      {
        id: 'nav:users',
        label: t('commandPalette.commands.goUsers'),
        group: t('commandPalette.groups.navigation'),
        icon: Setting,
        perform: () => router.push('/users'),
      },
    )
  }

  cmds.push(
    {
      id: 'pref:theme',
      label: themeStore.isDark
        ? t('commandPalette.commands.themeLight')
        : t('commandPalette.commands.themeDark'),
      hint: 'theme',
      group: t('commandPalette.groups.preferences'),
      icon: themeStore.isDark ? Sunny : Moon,
      keywords: 'theme dark light тема',
      perform: () => { themeStore.isDark = !themeStore.isDark },
    },
    {
      id: 'pref:locale-ru',
      label: t('commandPalette.commands.localeRu'),
      group: t('commandPalette.groups.preferences'),
      icon: Setting,
      keywords: 'russian язык',
      hidden: locale.value === 'ru',
      perform: () => setLocale('ru'),
    },
    {
      id: 'pref:locale-en',
      label: t('commandPalette.commands.localeEn'),
      group: t('commandPalette.groups.preferences'),
      icon: Setting,
      keywords: 'english language',
      hidden: locale.value === 'en',
      perform: () => setLocale('en'),
    },
    {
      id: 'action:reload',
      label: t('commandPalette.commands.reload'),
      group: t('commandPalette.groups.actions'),
      icon: Refresh,
      keywords: 'refresh reload обновить',
      perform: () => window.location.reload(),
    },
    {
      id: 'action:logout',
      label: t('commandPalette.commands.logout'),
      group: t('commandPalette.groups.actions'),
      icon: SwitchButton,
      keywords: 'sign out exit выйти',
      perform: () => {
        authStore.logout()
        router.push('/login')
      },
    },
  )

  return cmds.filter((c) => !c.hidden)
})

const filtered = computed(() => {
  const q = query.value.trim()
  return commands.value.filter((c) =>
    fuzzyMatch(`${c.label} ${c.keywords || ''} ${c.group}`, q),
  )
})

const grouped = computed(() => {
  const groups: Record<string, Command[]> = {}
  for (const cmd of filtered.value) {
    if (!groups[cmd.group]) groups[cmd.group] = []
    groups[cmd.group].push(cmd)
  }
  return Object.entries(groups)
})

watch(query, () => { activeIndex.value = 0 })
watch(filtered, () => { activeIndex.value = 0 })

function runActive() {
  const cmd = filtered.value[activeIndex.value]
  runCommand(cmd)
}

function runCommand(cmd: Command | undefined) {
  if (!cmd) return
  close()
  try {
    cmd.perform()
  } catch (err) {
    console.error('Command failed', err)
  }
}

function moveActive(delta: number) {
  const len = filtered.value.length
  if (len === 0) return
  activeIndex.value = (activeIndex.value + delta + len) % len
  nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView() {
  const el = listRef.value?.querySelector(`[data-idx="${activeIndex.value}"]`) as HTMLElement | null
  el?.scrollIntoView({ block: 'nearest' })
}

function indexFor(cmd: Command): number {
  return filtered.value.findIndex((c) => c.id === cmd.id)
}

function handleKeydown(event: KeyboardEvent) {
  const cmdOrCtrl = event.metaKey || event.ctrlKey
  if (cmdOrCtrl && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    toggle()
    return
  }
  if (event.key === 'Escape' && visible.value) {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

defineExpose({ open, close, toggle })
</script>

<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    :modal="true"
    align-center
    width="min(560px, 92vw)"
    class="command-palette-dialog"
    @close="close"
  >
    <div class="command-palette" @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)" @keydown.enter.prevent="runActive">
      <div class="input-row">
        <el-icon class="search-icon"><Search /></el-icon>
        <input
          ref="inputRef"
          v-model="query"
          class="search-input"
          :placeholder="t('commandPalette.placeholder')"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="hint-kbd">Esc</kbd>
      </div>

      <div ref="listRef" class="results">
        <template v-if="filtered.length === 0">
          <div class="empty">{{ t('commandPalette.noResults') }}</div>
        </template>
        <template v-else>
          <div v-for="[group, items] in grouped" :key="group" class="group">
            <div class="group-label">{{ group }}</div>
            <button
              v-for="cmd in items"
              :key="cmd.id"
              type="button"
              class="result"
              :class="{ active: indexFor(cmd) === activeIndex }"
              :data-idx="indexFor(cmd)"
              @mouseenter="activeIndex = indexFor(cmd)"
              @click="runCommand(cmd)"
            >
              <el-icon class="result-icon"><component :is="cmd.icon" /></el-icon>
              <span class="result-label">{{ cmd.label }}</span>
              <span v-if="indexFor(cmd) === activeIndex" class="result-hint">↵</span>
            </button>
          </div>
        </template>
      </div>

      <div class="footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('commandPalette.footer.navigate') }}</span>
        <span><kbd>↵</kbd> {{ t('commandPalette.footer.select') }}</span>
        <span><kbd>Esc</kbd> {{ t('commandPalette.footer.close') }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.command-palette {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px 14px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.search-icon {
  color: var(--el-text-color-secondary);
  font-size: 20px;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: var(--el-text-color-primary);
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--el-text-color-placeholder);
}

.hint-kbd {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.results {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.group + .group {
  margin-top: 4px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--el-text-color-secondary);
  padding: 6px 8px;
}

.result {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-family: inherit;
  transition: background 0.12s ease;
}

.result.active {
  background: var(--el-color-primary-light-9);
}

.result-icon {
  color: var(--el-text-color-secondary);
  font-size: 18px;
}

.result.active .result-icon {
  color: var(--el-color-primary);
}

.result-label {
  flex: 1;
}

.result-hint {
  color: var(--el-color-primary);
  font-size: 12px;
}

.empty {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 32px 12px;
  font-size: 14px;
}

.footer {
  display: flex;
  gap: 16px;
  padding: 10px 4px 0 4px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.footer kbd {
  display: inline-block;
  font-size: 10px;
  padding: 1px 5px;
  margin-right: 4px;
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>

<style>
.command-palette-dialog .el-dialog__header {
  display: none;
}

.command-palette-dialog .el-dialog__body {
  padding: 16px 16px 12px 16px;
}
</style>
