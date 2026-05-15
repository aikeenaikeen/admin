<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, User, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Socket } from 'socket.io-client'
import apiClient from '@/api/client'
import { formatDateTime } from '@/utils/date'
import { translateEventType } from '@/utils/uiText'
import { createRealtimeSocket } from '@/utils/realtime'
import { extractErrorMessage } from '@/utils/error'

const { t } = useI18n()

interface PresenceStatus {
  id: number
  name: string
  photoUrl: string | null
  present: boolean
  lastEventType: string | null
  lastEventTime: string | null
}

type StatusFilter = 'ALL' | 'PRESENT' | 'ABSENT'

const presence = ref<PresenceStatus[]>([])
const loading = ref(true)
const query = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const socketConnected = ref(false)

let socket: Socket | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return presence.value.filter((p) => {
    if (statusFilter.value === 'PRESENT' && !p.present) return false
    if (statusFilter.value === 'ABSENT' && p.present) return false
    if (!q) return true
    return p.name.toLowerCase().includes(q)
  })
})

const presentCount = computed(() => presence.value.filter((p) => p.present).length)
const totalCount = computed(() => presence.value.length)

onMounted(async () => {
  await loadPresence()
  connectSocket()
})

onUnmounted(() => {
  if (socket) socket.disconnect()
  if (reloadTimer) clearTimeout(reloadTimer)
})

async function loadPresence() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/presence')
    presence.value = response.data
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, t('presence.loadError')))
  } finally {
    loading.value = false
  }
}

function debouncedReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    loadPresence()
  }, 2000)
}

function connectSocket() {
  socket = createRealtimeSocket()

  socket.on('connect', () => {
    socketConnected.value = true
    debouncedReload()
  })

  socket.on('disconnect', () => {
    socketConnected.value = false
  })

  socket.on('connect_error', () => {
    socketConnected.value = false
  })

  socket.on('event:created', () => {
    debouncedReload()
  })
}

function formatTime(time: string | null): string {
  return formatDateTime(time)
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <div class="title-row">
          <h1 class="page-title">{{ t('presence.title') }}</h1>
          <el-tooltip
            :content="socketConnected ? t('presence.liveOn') : t('presence.liveOff')"
            placement="bottom"
          >
            <span class="live-dot" :class="{ 'live-dot--on': socketConnected }" aria-hidden="true" />
          </el-tooltip>
        </div>
      </template>
      <template #extra>
        <el-button :icon="Refresh" @click="loadPresence" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <div class="toolbar">
      <el-input
        v-model="query"
        :prefix-icon="Search"
        :placeholder="t('presence.searchPlaceholder')"
        clearable
        class="search"
      />
      <el-radio-group v-model="statusFilter" size="default">
        <el-radio-button label="ALL">
          {{ t('presence.filters.all') }} ({{ totalCount }})
        </el-radio-button>
        <el-radio-button label="PRESENT">
          {{ t('presence.filters.present') }} ({{ presentCount }})
        </el-radio-button>
        <el-radio-button label="ABSENT">
          {{ t('presence.filters.absent') }} ({{ totalCount - presentCount }})
        </el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="loading" class="presence-grid">
      <el-card
        v-for="emp in filtered"
        :key="emp.id"
        shadow="hover"
        :class="['presence-card', emp.present ? 'present' : 'absent']"
      >
        <div class="employee-content">
          <el-avatar :src="emp.photoUrl" :size="100">
            <el-icon :size="50"><User /></el-icon>
          </el-avatar>

          <div class="employee-info">
            <h3 class="employee-name">{{ emp.name }}</h3>

            <el-tag :type="emp.present ? 'success' : 'info'" size="large" style="margin-top: 12px;">
              {{ emp.present ? t('presence.present') : t('presence.absent') }}
            </el-tag>

            <div v-if="emp.lastEventTime" class="last-event">
              {{ t('presence.lastEvent', { type: translateEventType(emp.lastEventType), time: formatTime(emp.lastEventTime) }) }}
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <el-empty
      v-if="!loading && filtered.length === 0"
      :description="presence.length === 0 ? t('presence.empty') : t('presence.emptyFiltered')"
    />
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--el-color-info);
  position: relative;
  transition: background 0.2s ease;
}

.live-dot--on {
  background: var(--el-color-success);
  box-shadow: 0 0 0 0 var(--el-color-success-light-5);
  animation: live-pulse 1.6s ease-out infinite;
}

@keyframes live-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.55);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.search {
  flex: 1 1 220px;
  max-width: 360px;
}

.presence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .presence-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .page-container {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .presence-grid {
    grid-template-columns: 1fr;
  }
}

.presence-card {
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.presence-card.present {
  border-left: 4px solid var(--el-color-success);
}

.presence-card.absent {
  border-left: 4px solid var(--el-color-info);
}

.presence-card:hover {
  transform: translateY(-4px);
}

.employee-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.employee-info {
  width: 100%;
  margin-top: 16px;
}

.employee-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.last-event {
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
