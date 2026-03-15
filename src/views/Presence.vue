<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { io, Socket } from 'socket.io-client'
import apiClient from '@/api/client'
import { resolveBaseUrl } from '@/utils/baseUrl'
import { formatDateTime } from '@/utils/date'
import { translateEventType } from '@/utils/uiText'

const { t } = useI18n()

interface PresenceStatus {
  id: number
  name: string
  photoUrl: string | null
  present: boolean
  lastEventType: string | null
  lastEventTime: string | null
}

const presence = ref<PresenceStatus[]>([])
const loading = ref(true)
let socket: Socket | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  await loadPresence()
  connectSocket()
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
  if (reloadTimer) {
    clearTimeout(reloadTimer)
  }
})

async function loadPresence() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/presence')
    presence.value = response.data
  } catch (error) {
    ElMessage.error(t('presence.loadError'))
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
  const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)
  
  socket = io(API_BASE_URL, {
    path: '/ws',
  })

  socket.on('connect', () => {
    console.log('Socket connected')
  })

  socket.on('event:created', () => {
    debouncedReload()
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
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
        <h1 class="page-title">{{ t('presence.title') }}</h1>
      </template>
      <template #extra>
        <el-button :icon="Refresh" @click="loadPresence" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <div v-loading="loading" class="presence-grid">
      <el-card
        v-for="emp in presence"
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

    <el-empty v-if="!loading && presence.length === 0" :description="t('presence.empty')" />
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
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
  transition: all 0.3s;
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
