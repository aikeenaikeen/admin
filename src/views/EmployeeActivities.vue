<script setup lang="ts">
import { ref, onMounted } from 'vue'
import apiClient from '@/api/client'
import { ElMessage } from 'element-plus'

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
}

const loading = ref(true)
const employees = ref<Employee[]>([])
const companyActivities = ref<CompanyActivity[]>([])

const filters = ref({
  employeeId: null as number | null,
  activityId: null as number | null,
  from: '' as string,
  to: '' as string,
})

const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const items = ref<IntervalItem[]>([])

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
    if (filters.value.from) params.from = filters.value.from
    if (filters.value.to) params.to = filters.value.to

    const res = await apiClient.get('/api/activity-intervals', { params })
    items.value = res.data.items
    total.value = res.data.total
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось загрузить интервалы')
  } finally {
    loading.value = false
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const sec = Math.max(0, Math.round((end - start) / 1000))
  return `${sec}s`
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
        <h1 class="page-title">Активности сотрудников</h1>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-bottom: 12px;">
      <el-row :gutter="12">
        <el-col :span="8">
          <div style="font-size: 12px; color:#909399; margin-bottom: 6px;">Сотрудник</div>
          <el-select v-model="filters.employeeId" clearable filterable placeholder="Все" style="width: 100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-col>
        <el-col :span="8">
          <div style="font-size: 12px; color:#909399; margin-bottom: 6px;">Активность</div>
          <el-select v-model="filters.activityId" clearable filterable placeholder="Все" style="width: 100%">
            <el-option
              v-for="ca in companyActivities"
              :key="ca.activityId"
              :label="`${ca.activity.name} (${ca.activity.kind})`"
              :value="ca.activityId"
            />
          </el-select>
        </el-col>
        <el-col :span="4">
          <div style="font-size: 12px; color:#909399; margin-bottom: 6px;">From (ISO)</div>
          <el-input v-model="filters.from" placeholder="2026-01-17T00:00:00Z" />
        </el-col>
        <el-col :span="4">
          <div style="font-size: 12px; color:#909399; margin-bottom: 6px;">To (ISO)</div>
          <el-input v-model="filters.to" placeholder="2026-01-17T23:59:59Z" />
        </el-col>
      </el-row>
      <div style="margin-top: 12px;">
        <el-button type="primary" @click="onSearch">Поиск</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="items" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="Сотрудник" min-width="180">
          <template #default="{ row }">{{ row.employee?.name || row.employeeId }}</template>
        </el-table-column>
        <el-table-column label="Активность" min-width="200">
          <template #default="{ row }">{{ row.activity?.name || row.activityId }}</template>
        </el-table-column>
        <el-table-column prop="startTime" label="Start" min-width="220" />
        <el-table-column prop="endTime" label="End" min-width="220" />
        <el-table-column label="Dur" width="90">
          <template #default="{ row }">{{ formatDuration(row.startTime, row.endTime) }}</template>
        </el-table-column>
        <el-table-column label="Conf" width="100">
          <template #default="{ row }">{{ row.confidence?.toFixed?.(2) ?? row.confidence }}</template>
        </el-table-column>
        <el-table-column label="Cameras" min-width="180">
          <template #default="{ row }">{{ (row.confirmedCameraIds || []).join(', ') }}</template>
        </el-table-column>
      </el-table>

      <div style="display:flex; justify-content:flex-end; margin-top: 12px;">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadIntervals"
          @size-change="loadIntervals"
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
  color: #303133;
}
</style>

