<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, TrendCharts, Calendar } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'
import { formatDate } from '@/utils/date'

const { t } = useI18n()

const statistics = ref<any>(null)
const loading = ref(true)

const dateFrom = ref('')
const dateTo = ref('')

onMounted(async () => {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0]
  dateTo.value = today.toISOString().split('T')[0]

  await loadStatistics()
})

async function loadStatistics() {
  loading.value = true
  try {
    // Convert to ISO format with time
    const fromDate = new Date(dateFrom.value)
    fromDate.setHours(0, 0, 0, 0)
    
    const toDate = new Date(dateTo.value)
    toDate.setHours(23, 59, 59, 999)
    
    const response = await apiClient.get('/api/statistics', {
      params: {
        dateFrom: fromDate.toISOString(),
        dateTo: toDate.toISOString(),
      },
    })
    statistics.value = response.data
  } catch (error) {
    ElMessage.error(t('statistics.loadError'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('statistics.title') }}</h1>
      </template>
      <template #extra>
        <el-button :icon="Refresh" @click="loadStatistics" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px;">
          <el-icon><Calendar /></el-icon>
          <span>{{ t('statistics.period') }}</span>
        </div>
      </template>
      
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="10">
            <el-form-item :label="t('statistics.fromDate')">
              <el-date-picker
                v-model="dateFrom"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="10">
            <el-form-item :label="t('statistics.toDate')">
              <el-date-picker
                v-model="dateTo"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="4">
            <el-form-item label="">
              <el-button type="primary" @click="loadStatistics" style="width: 100%">
                {{ t('statistics.apply') }}
              </el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <div v-loading="loading">
      <div v-if="statistics">
        <div class="stats-grid">
          <el-card shadow="hover">
            <div class="stat-content">
              <div class="stat-icon primary">
                <el-icon :size="32"><TrendCharts /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.summary.totalEvents }}</div>
                <div class="stat-label">{{ t('statistics.totalEvents') }}</div>
              </div>
            </div>
          </el-card>

          <el-card shadow="hover">
            <div class="stat-content">
              <div class="stat-icon success">
                <el-icon :size="32"><TrendCharts /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.summary.uniqueEmployees }}</div>
                <div class="stat-label">{{ t('statistics.uniqueEmployees') }}</div>
              </div>
            </div>
          </el-card>

          <el-card shadow="hover">
            <div class="stat-content">
              <div class="stat-icon warning">
                <el-icon :size="32"><Calendar /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ statistics.summary.avgEventsPerDay }}</div>
                <div class="stat-label">{{ t('statistics.avgEventsPerDay') }}</div>
              </div>
            </div>
          </el-card>
        </div>

        <el-card shadow="never" style="margin-top: 24px">
          <template #header>
            <h3 style="margin: 0;">{{ t('statistics.topEmployees') }}</h3>
          </template>
          
          <el-table :data="statistics.topEmployees" style="width: 100%">
            <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />
            <el-table-column prop="eventCount" :label="t('statistics.eventCount')" width="180" align="right" />
          </el-table>
        </el-card>

        <el-card shadow="never" style="margin-top: 24px">
          <template #header>
            <h3 style="margin: 0;">{{ t('statistics.eventsByDay') }}</h3>
          </template>
          
          <el-table :data="statistics.eventsByDay" style="width: 100%">
            <el-table-column :label="t('common.labels.date')" width="220">
              <template #default="{ row }">
                {{ formatDate(row.date) }}
              </template>
            </el-table-column>
            <el-table-column prop="count" :label="t('statistics.total')" min-width="150" align="right" />
            <el-table-column :label="t('enums.eventType.IN')" min-width="150" align="right">
              <template #default="{ row }">
                <el-tag type="success" size="small">{{ row.ins }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('enums.eventType.OUT')" min-width="150" align="right">
              <template #default="{ row }">
                <el-tag type="warning" size="small">{{ row.outs }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
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
  flex-shrink: 0;
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

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}
</style>
