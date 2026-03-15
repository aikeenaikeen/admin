<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { User, VideoCamera, Calendar, TrendCharts } from '@element-plus/icons-vue'
import apiClient from '@/api/client'

const { t } = useI18n()

const stats = ref({
  totalEmployees: 0,
  presentEmployees: 0,
  eventsToday: 0,
  activeCameras: 0,
})

const loading = ref(true)

onMounted(async () => {
  await loadStats()
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
        limit: 1
      },
    })
    stats.value.eventsToday = events.data.pagination.total
  } catch (error) {
    console.error('Failed to load stats:', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <h1 class="page-title">{{ t('dashboard.title') }}</h1>

    <div v-loading="loading" class="stats-grid">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-content">
          <div class="stat-icon primary">
            <el-icon :size="32"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalEmployees }}</div>
            <div class="stat-label">{{ t('dashboard.stats.totalEmployees') }}</div>
          </div>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-content">
          <div class="stat-icon success">
            <el-icon :size="32"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value success">{{ stats.presentEmployees }}</div>
            <div class="stat-label">{{ t('dashboard.stats.presentEmployees') }}</div>
          </div>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-content">
          <div class="stat-icon warning">
            <el-icon :size="32"><Calendar /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.eventsToday }}</div>
            <div class="stat-label">{{ t('dashboard.stats.eventsToday') }}</div>
          </div>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-content">
          <div class="stat-icon info">
            <el-icon :size="32"><VideoCamera /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.activeCameras }}</div>
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

.page-title {
  margin: 0 0 24px 0;
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
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-4px);
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
