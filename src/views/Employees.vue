<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Delete, User, Upload, Setting, Close, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import apiClient from '@/api/client'
import { translateActivityKind } from '@/utils/uiText'
import TableActionsMenu from '@/components/TableActionsMenu.vue'

const { t } = useI18n()

interface Employee {
  id: number
  name: string
  photoUrl: string | null
}

interface Activity {
  id: number
  code: string
  name: string
  kind: string
}

interface CompanyActivity {
  id: number
  activityId: number
  enabled: boolean
  activeModelVersionId?: number | null
  activity: Activity
}

type EmployeeTableAction = 'activities' | 'edit' | 'delete'

const employees = ref<Employee[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingEmployeeId = ref<number | null>(null)

const form = ref({
  name: '',
  photo: null as File | null,
  activityIds: [] as number[],
})

const fileList = ref<UploadFile[]>([])

// Employee activities dialog
const activitiesDialogVisible = ref(false)
const selectedEmployee = ref<Employee | null>(null)
const companyActivities = ref<CompanyActivity[]>([])
const selectedActivityIds = ref<number[]>([])

onMounted(async () => {
  await Promise.all([loadEmployees(), loadCompanyActivities()])
})

async function loadEmployees() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/employees')
    employees.value = response.data
  } catch (error) {
    ElMessage.error(t('employees.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadCompanyActivities() {
  try {
    const response = await apiClient.get('/api/company-activities')
    companyActivities.value = response.data
  } catch {
    companyActivities.value = []
  }
}

async function handleSubmit() {
  try {
    const formData = new FormData()
    formData.append('name', form.value.name)
    if (form.value.photo) {
      formData.append('photo', form.value.photo)
    }

    const url = isEditing.value && editingEmployeeId.value
      ? `/api/employees/${editingEmployeeId.value}`
      : '/api/employees'

    let savedEmployee: Employee | null = null
    if (isEditing.value) {
      const res = await apiClient.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      savedEmployee = res.data
      ElMessage.success(t('employees.updated'))
    } else {
      const res = await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      savedEmployee = res.data
      ElMessage.success(t('employees.created'))
    }

    // Assign activities immediately (new UX)
    const employeeId = isEditing.value ? editingEmployeeId.value : savedEmployee?.id
    if (employeeId) {
      try {
        await apiClient.put(`/api/employees/${employeeId}/activities`, {
          activities: (form.value.activityIds || []).map((id) => ({ activityId: id, enabled: true })),
        })
      } catch (e: any) {
        ElMessage.error(e.response?.data?.error || t('employees.savedButActivitiesFailed'))
      }
    }

    resetForm()
    await loadEmployees()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('employees.saveError'))
  }
}

function handleFileChange(file: UploadFile) {
  if (file.raw) {
    form.value.photo = file.raw
  }
  return false
}

function handleRemove() {
  form.value.photo = null
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(employee: Employee) {
  isEditing.value = true
  editingEmployeeId.value = employee.id
  dialogVisible.value = true
  form.value = {
    name: employee.name,
    photo: null,
    activityIds: [],
  }
  fileList.value = []

  // Load current assigned activities
  loadEmployeeActivityIds(employee.id).then((ids) => {
    if (editingEmployeeId.value === employee.id) {
      form.value.activityIds = ids
    }
  })
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingEmployeeId.value = null
  form.value = { name: '', photo: null, activityIds: [] }
  fileList.value = []
}

async function loadEmployeeActivityIds(employeeId: number): Promise<number[]> {
  try {
    const res = await apiClient.get(`/api/employees/${employeeId}/activities`)
    const activities = res.data?.activities || []
    return activities.filter((a: any) => a.enabled).map((a: any) => a.activityId)
  } catch {
    return []
  }
}

async function deleteEmployee(id: number) {
  try {
    await ElMessageBox.confirm(t('employees.deleteConfirmText'), t('employees.deleteConfirmTitle'), {
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      type: 'warning',
    })

    await apiClient.delete(`/api/employees/${id}`)
    ElMessage.success(t('employees.deleteSuccess'))
    await loadEmployees()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('employees.deleteError'))
    }
  }
}

async function openEmployeeActivities(employee: Employee) {
  selectedEmployee.value = employee
  selectedActivityIds.value = []
  activitiesDialogVisible.value = true

  try {
    const res = await apiClient.get(`/api/employees/${employee.id}/activities`)
    const activities = res.data?.activities || []
    selectedActivityIds.value = activities.filter((a: any) => a.enabled).map((a: any) => a.activityId)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('employees.loadActivitiesError'))
  }
}

async function saveEmployeeActivities() {
  if (!selectedEmployee.value) return
  try {
    await apiClient.put(`/api/employees/${selectedEmployee.value.id}/activities`, {
      activities: selectedActivityIds.value.map((id) => ({ activityId: id, enabled: true })),
    })
    ElMessage.success(t('employees.activitiesSaved'))
    activitiesDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('employees.activitiesSaveError'))
  }
}

function getEmployeeActions() {
  return [
    {
      key: 'activities',
      label: t('common.labels.activity'),
      icon: Setting,
    },
    {
      key: 'edit',
      label: t('common.actions.edit'),
      icon: Edit,
    },
    {
      key: 'delete',
      label: t('common.actions.delete'),
      icon: Delete,
      divided: true,
      danger: true,
    },
  ]
}

function handleEmployeeAction(action: EmployeeTableAction, row: Employee) {
  if (action === 'activities') {
    openEmployeeActivities(row)
    return
  }

  if (action === 'edit') {
    startEdit(row)
    return
  }

  deleteEmployee(row.id)
}

function onEmployeeAction(action: string, row: Employee) {
  handleEmployeeAction(action as EmployeeTableAction, row)
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('employees.title') }}</h1>
      </template>
      <template #extra>
        <el-button
          :type="dialogVisible ? 'danger' : 'primary'"
          :icon="dialogVisible ? Close : Plus"
          @click="dialogVisible ? resetForm() : startCreate()"
        >
          {{ dialogVisible ? t('common.actions.cancel') : t('employees.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="employees" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        
        <el-table-column :label="t('employees.table.photo')" width="100">
          <template #default="{ row }">
            <el-avatar :src="row.photoUrl" :size="60">
              <el-icon :size="30"><User /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" :label="t('employees.table.name')" min-width="180" />

        <el-table-column :label="t('common.labels.actions')" width="112" fixed="right" align="center">
          <template #default="{ row }">
            <TableActionsMenu
              :actions="getEmployeeActions()"
              @select="onEmployeeAction($event, row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="activitiesDialogVisible"
      :title="t('employees.activitiesDialog.title')"
      width="700px"
    >
      <div v-if="selectedEmployee" style="margin-bottom: 12px; color: var(--el-text-color-regular);">
        {{ t('employees.activitiesDialog.employee') }} <strong>{{ selectedEmployee.name }}</strong>
      </div>

      <el-checkbox-group v-model="selectedActivityIds">
        <el-row :gutter="12">
          <el-col v-for="ca in companyActivities" :key="ca.activityId" :span="12" style="margin-bottom: 8px;">
            <el-checkbox :label="ca.activityId">
              {{ ca.activity.name }} <span style="color: var(--el-text-color-secondary);">({{ translateActivityKind(ca.activity.kind) }})</span>
            </el-checkbox>
          </el-col>
        </el-row>
      </el-checkbox-group>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="activitiesDialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="saveEmployeeActivities">{{ t('common.actions.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('employees.dialog.editTitle') : t('employees.dialog.addTitle')"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('employees.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('employees.dialog.namePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('employees.dialog.activities')">
          <el-select
            v-model="form.activityIds"
            multiple
            filterable
            clearable
            :placeholder="t('employees.dialog.activitiesPlaceholder')"
            style="width: 100%"
          >
            <el-option
              v-for="ca in companyActivities"
              :key="ca.activityId"
              :label="`${ca.activity.name} (${translateActivityKind(ca.activity.kind)})`"
              :value="ca.activityId"
            />
          </el-select>
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px;">
            {{ t('employees.dialog.activitiesHint') }}
          </div>
        </el-form-item>

        <el-form-item :label="t('employees.dialog.photo')">
          <el-upload
            v-model:file-list="fileList"
            :auto-upload="false"
            :limit="1"
            accept="image/*"
            :on-change="handleFileChange"
            :on-remove="handleRemove"
          >
            <el-button :icon="Upload">{{ t('common.actions.selectFile') }}</el-button>
            <template #tip>
              <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px;">
                {{ t('employees.dialog.photoHint') }}
              </div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="dialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="handleSubmit">
          {{ isEditing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
      </template>
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

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}

.employee-actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}
</style>
