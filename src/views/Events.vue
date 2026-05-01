<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, Calendar, Right } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'
import { formatDateTime } from '@/utils/date'
import { translateEventType } from '@/utils/uiText'

const { t } = useI18n()

type EventTypeFilter = 'ALL' | 'IN' | 'OUT'

interface CameraInfo {
  id: number
  name: string
  location?: string | null
}

interface Event {
  id: number
  employeeId: number
  type: string
  timestamp: string
  source?: string
  employee: {
    name: string
  }
  camera?: CameraInfo | null
}

interface VisibilityPeriod {
  id: string
  employeeId: number
  employee: {
    name: string
  }
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  isOpen: boolean
  startCamera: CameraInfo | null
  endCamera: CameraInfo | null
  startEvent: {
    id: number
    type: 'IN'
    timestamp: string
    source: string
  }
  endEvent: {
    id: number
    type: 'OUT'
    timestamp: string
    source: string
  } | null
}

const events = ref<Event[]>([])
const visibilityPeriods = ref<VisibilityPeriod[]>([])
const loading = ref(true)
const currentPage = ref(1)
const pageSize = ref(50)
const total = ref(0)

const filters = ref({
  dateFrom: '',
  dateTo: '',
  type: 'IN' as EventTypeFilter,
})

const showingVisibilityPeriods = computed(() => filters.value.type === 'ALL')

onMounted(async () => {
  await loadEvents()
})

function buildRequestParams() {
  const params: Record<string, string | number | undefined> = {
    page: currentPage.value,
    limit: pageSize.value,
  }

  if (filters.value.dateFrom) {
    const fromDate = new Date(filters.value.dateFrom)
    fromDate.setHours(0, 0, 0, 0)
    params.dateFrom = fromDate.toISOString()
  }

  if (filters.value.dateTo) {
    const toDate = new Date(filters.value.dateTo)
    toDate.setHours(23, 59, 59, 999)
    params.dateTo = toDate.toISOString()
  }

  return params
}

async function loadEvents() {
  loading.value = true
  try {
    const params = buildRequestParams()

    if (showingVisibilityPeriods.value) {
      const response = await apiClient.get('/api/events/visibility-periods', { params })
      visibilityPeriods.value = response.data.periods
      events.value = []
      total.value = response.data.pagination.total
      return
    }

    params.type = filters.value.type
    const response = await apiClient.get('/api/events', { params })
    events.value = response.data.events
    visibilityPeriods.value = []
    total.value = response.data.pagination.total
  } catch (error) {
    ElMessage.error(t('events.loadError'))
  } finally {
    loading.value = false
  }
}

function formatTime(time: string | null | undefined): string {
  return formatDateTime(time)
}

function formatClock(time: string | null | undefined): string {
  if (!time) return t('common.misc.none')
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return t('common.misc.none')
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatCamera(camera?: CameraInfo | null): string {
  if (!camera) return t('common.misc.none')
  return camera.location ? `${camera.name} · ${camera.location}` : camera.name
}

function formatPeriodCamera(period: VisibilityPeriod): string {
  const start = formatCamera(period.startCamera)
  const end = formatCamera(period.endCamera)

  if (!period.endCamera || start === end) {
    return start
  }

  return `${start} -> ${end}`
}

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null) {
    return t('events.inProgress')
  }

  if (seconds < 60) {
    return t('events.durationSeconds', { value: seconds })
  }

  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60

  if (minutes < 60) {
    return restSeconds > 0
      ? t('events.durationMinutesSeconds', { minutes, seconds: restSeconds })
      : t('events.durationMinutes', { value: minutes })
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  return restMinutes > 0
    ? t('events.durationHoursMinutes', { hours, minutes: restMinutes })
    : t('events.durationHours', { value: hours })
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadEvents()
}

function handleFilterChange() {
  currentPage.value = 1
  loadEvents()
}

function resetFilters() {
  filters.value = { dateFrom: '', dateTo: '', type: 'IN' }
  currentPage.value = 1
  loadEvents()
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('events.title') }}</h1>
      </template>
      <template #extra>
        <el-button :icon="Refresh" @click="loadEvents" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px;">
          <el-icon><Calendar /></el-icon>
          <span>{{ t('events.filters') }}</span>
        </div>
      </template>
      
      <el-form :model="filters" label-width="100px">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-form-item :label="t('events.fromDate')">
              <el-date-picker
                v-model="filters.dateFrom"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="handleFilterChange"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="8">
            <el-form-item :label="t('events.toDate')">
              <el-date-picker
                v-model="filters.dateTo"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="handleFilterChange"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="8">
            <el-form-item :label="t('events.type')">
              <el-select v-model="filters.type" :placeholder="t('common.placeholders.all')" style="width: 100%" @change="handleFilterChange">
                <el-option :label="t('common.placeholders.all')" value="ALL" />
                <el-option :label="translateEventType('IN')" value="IN" />
                <el-option :label="translateEventType('OUT')" value="OUT" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item>
          <el-button @click="resetFilters">{{ t('events.resetFilters') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table
        v-if="showingVisibilityPeriods"
        :data="visibilityPeriods"
        v-loading="loading"
        :empty-text="t('events.noVisibilityPeriods')"
        style="width: 100%"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-descriptions :column="2" border class="period-details">
              <el-descriptions-item :label="translateEventType('IN')">
                #{{ row.startEvent.id }} · {{ formatTime(row.startTime) }} · {{ row.startEvent.source }}
              </el-descriptions-item>
              <el-descriptions-item :label="translateEventType('OUT')">
                <span v-if="row.endEvent">
                  #{{ row.endEvent.id }} · {{ formatTime(row.endTime) }} · {{ row.endEvent.source }}
                </span>
                <span v-else>{{ t('events.inProgress') }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.labels.period')" min-width="300">
          <template #default="{ row }">
            <div class="period-line">
              <el-tag type="success">{{ translateEventType('IN') }} {{ formatClock(row.startTime) }}</el-tag>
              <el-icon class="period-line__arrow"><Right /></el-icon>
              <el-tag :type="row.isOpen ? 'success' : 'warning'" effect="plain">
                {{ row.isOpen ? t('events.now') : `${translateEventType('OUT')} ${formatClock(row.endTime)}` }}
              </el-tag>
            </div>
            <div class="period-line__date">{{ formatTime(row.startTime) }}</div>
          </template>
        </el-table-column>

        <el-table-column prop="employee.name" :label="t('events.employee')" min-width="180" />

        <el-table-column :label="t('events.duration')" width="140">
          <template #default="{ row }">
            {{ formatDurationSeconds(row.durationSeconds) }}
          </template>
        </el-table-column>

        <el-table-column :label="t('events.camera')" min-width="220">
          <template #default="{ row }">
            {{ formatPeriodCamera(row) }}
          </template>
        </el-table-column>
      </el-table>

      <el-table
        v-else
        :data="events"
        v-loading="loading"
        :empty-text="t('events.noEvents')"
        style="width: 100%"
      >
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        
        <el-table-column :label="t('common.labels.time')" width="200">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        
        <el-table-column prop="employee.name" :label="t('events.employee')" min-width="180" />

        <el-table-column :label="t('events.type')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'IN' ? 'success' : 'warning'">
              {{ translateEventType(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('events.camera')" min-width="150">
          <template #default="{ row }">
            {{ formatCamera(row.camera) }}
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
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

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.period-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.period-line__arrow {
  color: var(--el-text-color-secondary);
}

.period-line__date {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.period-details {
  margin: 8px 0;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}
</style>
