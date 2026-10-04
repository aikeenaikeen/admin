<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { formatDateTime, formatTimeRange } from '@/utils/date'
import { translateActivityKind } from '@/utils/uiText'
import { getIntervalEvidenceFrames, type ActivityEvidenceFrame } from '@/utils/activityEvidence'
import { useIsMobile } from '@/composables/useIsMobile'

const { t } = useI18n()
const isMobile = useIsMobile()
const MOBILE_PREVIEW_FRAMES = 6

interface Employee {
  id: number
  name: string
}

interface Activity {
  id: number
  name: string
  kind: string
}

interface CompanyActivity {
  activityId: number
  activity: Activity
}

interface IntervalItem {
  id: number
  employeeId: number
  employee: Employee
  activityId: number
  activity: Activity
  startTime: string
  endTime: string
  confidence: number
  confirmedCameraIds: number[]
  meta?: Record<string, any> | null
}

const loading = ref(true)
const employees = ref<Employee[]>([])
const companyActivities = ref<CompanyActivity[]>([])

const filters = ref({
  employeeId: null as number | null,
  activityId: null as number | null,
  from: null as Date | null,
  to: null as Date | null,
})

const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const items = ref<IntervalItem[]>([])

const evidenceDialogVisible = ref(false)
const evidenceDialogInterval = ref<IntervalItem | null>(null)
const selectedEvidenceFrames = computed(() => getIntervalEvidenceFrames(evidenceDialogInterval.value))
const paginationLayout = computed(() => (isMobile.value ? 'prev, pager, next' : 'total, sizes, prev, pager, next'))

onMounted(async () => {
  await Promise.all([loadEmployees(), loadCompanyActivities()])
  await loadIntervals()
})

async function loadEmployees() {
  try {
    const res = await apiClient.get('/api/employees')
    employees.value = res.data
  } catch {
    employees.value = []
  }
}

async function loadCompanyActivities() {
  try {
    const res = await apiClient.get('/api/company-activities')
    companyActivities.value = res.data
  } catch {
    companyActivities.value = []
  }
}

async function loadIntervals() {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
    }
    if (filters.value.employeeId) params.employeeId = filters.value.employeeId
    if (filters.value.activityId) params.activityId = filters.value.activityId
    if (filters.value.from) params.from = dayjs(filters.value.from).toISOString()
    if (filters.value.to) params.to = dayjs(filters.value.to).toISOString()

    const res = await apiClient.get('/api/activity-intervals', { params })
    items.value = res.data.items
    total.value = res.data.total
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('employeeActivities.loadError'))
  } finally {
    loading.value = false
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const sec = Math.max(0, Math.round((end - start) / 1000))
  return t('employeeActivities.durationSeconds', { value: sec })
}

function getPreviewFrames(interval: IntervalItem): ActivityEvidenceFrame[] {
  return getIntervalEvidenceFrames(interval).slice(0, MOBILE_PREVIEW_FRAMES)
}

function openEvidence(interval: IntervalItem) {
  evidenceDialogInterval.value = interval
  evidenceDialogVisible.value = true
}

function formatScore(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}

async function onSearch() {
  page.value = 1
  await loadIntervals()
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('employeeActivities.title') }}</h1>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-bottom: 12px;">
      <el-row :gutter="12" class="filters-row">
        <el-col :xs="24" :span="8">
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('common.labels.employee') }}</div>
          <el-select v-model="filters.employeeId" clearable filterable :placeholder="t('common.placeholders.all')" style="width: 100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-col>
        <el-col :xs="24" :span="8">
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('common.labels.activity') }}</div>
          <el-select v-model="filters.activityId" clearable filterable :placeholder="t('common.placeholders.all')" style="width: 100%">
            <el-option
              v-for="ca in companyActivities"
              :key="ca.activityId"
              :label="`${ca.activity.name} (${translateActivityKind(ca.activity.kind)})`"
              :value="ca.activityId"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :span="4">
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('common.labels.from') }}</div>
          <el-date-picker
            v-model="filters.from"
            type="datetime"
            :placeholder="t('common.placeholders.selectDateTime')"
            format="DD.MM.YYYY HH:mm"
            style="width: 100%"
          />
        </el-col>
        <el-col :xs="24" :span="4">
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('common.labels.to') }}</div>
          <el-date-picker
            v-model="filters.to"
            type="datetime"
            :placeholder="t('common.placeholders.selectDateTime')"
            format="DD.MM.YYYY HH:mm"
            style="width: 100%"
          />
        </el-col>
      </el-row>
      <div style="margin-top: 12px;">
        <el-button type="primary" class="search-button" @click="onSearch">{{ t('common.actions.search') }}</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table v-if="!isMobile" :data="items" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        <el-table-column :label="t('common.labels.employee')" min-width="180">
          <template #default="{ row }">{{ row.employee?.name || row.employeeId }}</template>
        </el-table-column>
        <el-table-column :label="t('common.labels.activity')" min-width="200">
          <template #default="{ row }">{{ row.activity?.name || row.activityId }}</template>
        </el-table-column>
        <el-table-column :label="t('employeeActivities.start')" min-width="220">
          <template #default="{ row }">{{ formatDateTime(row.startTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('employeeActivities.end')" min-width="220">
          <template #default="{ row }">{{ formatDateTime(row.endTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('employeeActivities.duration')" width="90">
          <template #default="{ row }">{{ formatDuration(row.startTime, row.endTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('employeeActivities.confidence')" width="100">
          <template #default="{ row }">{{ row.confidence?.toFixed?.(2) ?? row.confidence }}</template>
        </el-table-column>
        <el-table-column :label="t('employeeActivities.cameras')" min-width="180">
          <template #default="{ row }">{{ (row.confirmedCameraIds || []).join(', ') }}</template>
        </el-table-column>
      </el-table>

      <div v-else v-loading="loading" class="interval-cards" data-test="mobile-interval-cards">
        <article v-for="row in items" :key="row.id" class="interval-card">
          <div class="interval-card__head">
            <strong class="interval-card__employee">{{ row.employee?.name || row.employeeId }}</strong>
            <el-tag type="primary" effect="plain" size="small">{{ formatDuration(row.startTime, row.endTime) }}</el-tag>
          </div>
          <div class="interval-card__activity">{{ row.activity?.name || row.activityId }}</div>
          <div class="interval-card__time">{{ formatTimeRange(row.startTime, row.endTime) }}</div>
          <div class="interval-card__meta">
            <span>{{ t('employeeActivities.confidence') }} {{ formatScore(row.confidence) }}</span>
            <span v-if="(row.confirmedCameraIds || []).length > 0">
              {{ t('employeeActivities.cameras') }}: {{ (row.confirmedCameraIds || []).join(', ') }}
            </span>
            <span class="interval-card__id">#{{ row.id }}</span>
          </div>
          <template v-if="getPreviewFrames(row).length > 0">
            <div class="interval-card__frames" data-test="interval-frames-strip">
              <button
                v-for="(frame, index) in getPreviewFrames(row)"
                :key="`${frame.url}-${index}`"
                type="button"
                class="interval-card__frame"
                @click="openEvidence(row)"
              >
                <img :src="frame.url" :alt="t('statistics.activityEvidenceFrameAlt', { index: index + 1 })" loading="lazy">
              </button>
            </div>
            <div class="interval-card__frames-footer">
              <span v-if="getPreviewFrames(row).length > 2" class="scroll-hint">{{ t('statistics.swipeHint') }}</span>
              <el-button type="primary" plain size="small" class="interval-card__evidence-button" @click="openEvidence(row)">
                {{ t('statistics.viewActivityEvidence', { count: getIntervalEvidenceFrames(row).length }) }}
              </el-button>
            </div>
          </template>
        </article>
        <el-empty v-if="!loading && items.length === 0" :image-size="72" />
      </div>

      <div class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          :layout="paginationLayout"
          :size="isMobile ? 'small' : 'default'"
          :pager-count="isMobile ? 5 : 7"
          @current-change="loadIntervals"
          @size-change="loadIntervals"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="evidenceDialogVisible"
      :title="t('statistics.activityEvidenceTitle')"
      width="860px"
      :fullscreen="isMobile"
    >
      <div v-if="evidenceDialogInterval" class="evidence-summary">
        <strong>{{ evidenceDialogInterval.activity?.name || evidenceDialogInterval.activityId }}</strong>
        <span>{{ evidenceDialogInterval.employee?.name || evidenceDialogInterval.employeeId }}</span>
        <span>{{ formatTimeRange(evidenceDialogInterval.startTime, evidenceDialogInterval.endTime) }}</span>
      </div>
      <div class="evidence-grid" data-test="evidence-grid">
        <figure v-for="(frame, index) in selectedEvidenceFrames" :key="`${frame.url}-${index}`" class="evidence-card">
          <img :src="frame.url" :alt="t('statistics.activityEvidenceFrameAlt', { index: index + 1 })" loading="lazy">
          <figcaption>
            <span>{{ t('statistics.activityEvidenceFrame', { index: index + 1 }) }}</span>
            <span v-if="frame.windowRank">{{ t('statistics.activityEvidenceWindow', { index: frame.windowRank }) }}</span>
            <span>{{ t('statistics.confidence') }}: {{ formatScore(frame.score) }}</span>
          </figcaption>
        </figure>
      </div>
    </el-dialog>
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
.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* Мобильные карточки и диалог кадров: рендерятся только при isMobile. */
.interval-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 80px;
}
.interval-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
}
.interval-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.interval-card__employee {
  min-width: 0;
  font-size: 15px;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.interval-card__activity {
  color: var(--el-text-color-regular);
}
.interval-card__time {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.interval-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.interval-card__id {
  margin-left: auto;
}
/* Лента кадров: прокрутка вбок только внутри карточки. */
.interval-card__frames {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.interval-card__frame {
  flex: 0 0 auto;
  width: 112px;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-dark);
  scroll-snap-align: start;
  cursor: pointer;
}
.interval-card__frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.interval-card__frames-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.interval-card__evidence-button {
  margin-left: auto;
}
.scroll-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.evidence-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.evidence-card {
  margin: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
}
.evidence-card img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  background: var(--el-fill-color-dark);
}
.evidence-card figcaption {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }
  .page-header {
    margin-bottom: 12px;
  }
  .page-title {
    font-size: 20px;
  }
  .page-container :deep(.el-card__body) {
    padding: 12px;
  }
  .filters-row {
    row-gap: 12px;
  }
  .search-button {
    width: 100%;
  }
  .pagination-row {
    justify-content: center;
  }
  /* Кадры-доказательства по ширине экрана, по одному в ряд. */
  .evidence-grid {
    grid-template-columns: 1fr;
  }
}
</style>

