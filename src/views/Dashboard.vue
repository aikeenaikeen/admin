<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { User, VideoCamera, Calendar, TrendCharts, Refresh } from '@element-plus/icons-vue'
import apiClient from '@/api/client'
import AnimatedNumber from '@/components/AnimatedNumber.vue'

const { t } = useI18n()
const router = useRouter()

const stats = ref({
  totalEmployees: 0,
  presentEmployees: 0,
  eventsToday: 0,
  activeCameras: 0,
})

const loading = ref(true)
const lastUpdated = ref<Date | null>(null)
const ticker = ref(0)

const lastUpdatedLabel = computed(() => {
  // Re-evaluate every 30s via ticker
  void ticker.value
  if (!lastUpdated.value) return ''
  const diff = Math.round((Date.now() - lastUpdated.value.getTime()) / 1000)
  if (diff < 5) return t('dashboard.lastUpdated.justNow')
  if (diff < 60) return t('dashboard.lastUpdated.secondsAgo', { n: diff })
  if (diff < 3600) return t('dashboard.lastUpdated.minutesAgo', { n: Math.floor(diff / 60) })
  return t('dashboard.lastUpdated.hoursAgo', { n: Math.floor(diff / 3600) })
})

function goTo(path: string) {
  router.push(path)
}

let tickerTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await loadStats()
  tickerTimer = setInterval(() => { ticker.value++ }, 30_000)
})

onUnmounted(() => {
  if (tickerTimer) clearInterval(tickerTimer)
})

async function loadStats() {
  loading.value = true
  try {
    const [employees, presence, cameras] = await Promise.all([
      apiClient.get('/api/employees'),
      apiClient.get('/api/presence'),
      apiClient.get('/api/cameras'),
    ])

    stats.value.totalEmployees = employees.data.length
    stats.value.presentEmployees = presence.data.filter((p: any) => p.present).length
    stats.value.activeCameras = cameras.data.filter((c: any) => c.isActive).length

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const events = await apiClient.get('/api/events', {
      params: {
        dateFrom: today.toISOString(),
        dateTo: tomorrow.toISOString(),
        type: 'IN',
        limit: 1
      },
    })
    stats.value.eventsToday = events.data.pagination.total
    lastUpdated.value = new Date()
  } catch (error) {
    console.error('Failed to load stats:', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-head">
      <h1 class="page-title">{{ t('dashboard.title') }}</h1>
      <div class="page-head__meta">
        <span v-if="lastUpdated" class="last-updated">
          {{ t('dashboard.lastUpdated.label') }} {{ lastUpdatedLabel }}
        </span>
        <el-button :icon="Refresh" :loading="loading" @click="loadStats" plain>
          {{ t('common.actions.refresh') }}
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="stats-grid">
      <el-card
        shadow="hover"
        class="stat-card"
        role="button"
        tabindex="0"
        @click="goTo('/employees')"
        @keydown.enter.space.prevent="goTo('/employees')"
      >
        <div class="stat-content">
          <div class="stat-icon primary">
            <el-icon :size="32"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="stats.totalEmployees" /></div>
            <div class="stat-label">{{ t('dashboard.stats.totalEmployees') }}</div>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="hover"
        class="stat-card"
        role="button"
        tabindex="0"
        @click="goTo('/presence')"
        @keydown.enter.space.prevent="goTo('/presence')"
      >
        <div class="stat-content">
          <div class="stat-icon success">
            <el-icon :size="32"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value success"><AnimatedNumber :value="stats.presentEmployees" /></div>
            <div class="stat-label">{{ t('dashboard.stats.presentEmployees') }}</div>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="hover"
        class="stat-card"
        role="button"
        tabindex="0"
        @click="goTo('/statistics')"
        @keydown.enter.space.prevent="goTo('/statistics')"
      >
        <div class="stat-content">
          <div class="stat-icon warning">
            <el-icon :size="32"><Calendar /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="stats.eventsToday" /></div>
            <div class="stat-label">{{ t('dashboard.stats.eventsToday') }}</div>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="hover"
        class="stat-card"
        role="button"
        tabindex="0"
        @click="goTo('/cameras')"
        @keydown.enter.space.prevent="goTo('/cameras')"
      >
        <div class="stat-content">
          <div class="stat-icon info">
            <el-icon :size="32"><VideoCamera /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber :value="stats.activeCameras" /></div>
            <div class="stat-label">{{ t('dashboard.stats.activeCameras') }}</div>
          </div>
        </div>
      </el-card>
    </div>

    <el-card shadow="never" style="margin-top: 24px">
      <template #header>
        <h2 style="margin: 0; font-size: 18px;">{{ t('dashboard.quickActions.title') }}</h2>
      </template>
      
      <div class="quick-links">
        <router-link to="/employees" class="quick-link">
          <el-icon :size="40"><User /></el-icon>
          <span>{{ t('dashboard.quickActions.employees') }}</span>
        </router-link>
        <router-link to="/cameras" class="quick-link">
          <el-icon :size="40"><VideoCamera /></el-icon>
          <span>{{ t('dashboard.quickActions.cameras') }}</span>
        </router-link>
        <router-link to="/presence" class="quick-link">
          <el-icon :size="40"><TrendCharts /></el-icon>
          <span>{{ t('dashboard.quickActions.presence') }}</span>
        </router-link>
        <router-link to="/events" class="quick-link">
          <el-icon :size="40"><Calendar /></el-icon>
          <span>{{ t('dashboard.quickActions.events') }}</span>
        </router-link>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.page-head__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-updated {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
  
  .page-container {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}

.stat-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  outline: none;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-card:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.primary {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.stat-icon.success {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.stat-icon.warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.stat-icon.info {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
  margin-bottom: 8px;
}

.stat-value.success {
  color: var(--el-color-success);
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

@media (max-width: 768px) {
  .quick-links {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}

@media (max-width: 480px) {
  .quick-links {
    grid-template-columns: 1fr 1fr;
  }
}

.quick-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  text-decoration: none;
  color: var(--el-text-color-primary);
  transition: all 0.3s;
  min-height: 120px;
}

.quick-link:hover {
  background: var(--el-color-primary);
  color: var(--el-color-white);
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
}

.quick-link span {
  font-size: 14px;
  font-weight: 500;
  text-align: center;
}
</style>
