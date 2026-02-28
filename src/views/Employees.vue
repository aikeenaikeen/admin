<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Delete, User, Upload, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import apiClient from '@/api/client'
import { translateActivityKind } from '@/utils/uiText'

const { t } = useI18n()

interface Employee {
  id: number
  name: string
  role: string | null
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

interface TemplateItem {
  id: number
  name: string
}

const employees = ref<Employee[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingEmployeeId = ref<number | null>(null)

const form = ref({
  name: '',
  roleTitle: '',
  photo: null as File | null,
  activityIds: [] as number[],
})

const fileList = ref<UploadFile[]>([])

// Employee activities dialog
const activitiesDialogVisible = ref(false)
const selectedEmployee = ref<Employee | null>(null)
const companyActivities = ref<CompanyActivity[]>([])
const templates = ref<TemplateItem[]>([])
const selectedActivityIds = ref<number[]>([])
const selectedTemplateId = ref<number | null>(null)
const currentTemplate = ref<{ templateId: number; name: string } | null>(null)

onMounted(async () => {
  await Promise.all([loadEmployees(), loadCompanyActivities(), loadTemplates()])
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

async function loadTemplates() {
  try {
    const response = await apiClient.get('/api/templates')
    templates.value = response.data
  } catch {
    templates.value = []
  }
}

async function handleSubmit() {
  try {
    const formData = new FormData()
    formData.append('name', form.value.name)
    if (form.value.roleTitle) {
      formData.append('roleTitle', form.value.roleTitle)
    }
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
    roleTitle: employee.role || '',
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
  form.value = { name: '', roleTitle: '', photo: null, activityIds: [] }
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
  selectedTemplateId.value = null
  currentTemplate.value = null
  selectedActivityIds.value = []
  activitiesDialogVisible.value = true

  try {
    const res = await apiClient.get(`/api/employees/${employee.id}/activities`)
    const activities = res.data?.activities || []
    selectedActivityIds.value = activities.filter((a: any) => a.enabled).map((a: any) => a.activityId)
    currentTemplate.value = res.data?.template
      ? { templateId: res.data.template.templateId, name: res.data.template.name }
      : null
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

async function applyTemplate() {
  if (!selectedEmployee.value || !selectedTemplateId.value) return
  try {
    await apiClient.put(`/api/employees/${selectedEmployee.value.id}/template`, {
      templateId: selectedTemplateId.value,
    })
    ElMessage.success(t('employees.templateApplied'))
    await openEmployeeActivities(selectedEmployee.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('employees.templateApplyError'))
  }
}

async function removeTemplate() {
  if (!selectedEmployee.value) return
  try {
    await apiClient.delete(`/api/employees/${selectedEmployee.value.id}/template`)
    ElMessage.success(t('employees.templateRemoved'))
    await openEmployeeActivities(selectedEmployee.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('employees.templateRemoveError'))
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('employees.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
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
        
        <el-table-column :label="t('employees.table.position')" min-width="150">
          <template #default="{ row }">
            {{ row.role || t('common.misc.none') }}
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.actions')" width="380" fixed="right">
          <template #default="{ row }">
              <el-button
                size="small"
                :icon="Setting"
                @click="openEmployeeActivities(row)"
              >
                {{ t('common.labels.activity') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteEmployee(row.id)"
              >
                {{ t('common.actions.delete') }}
              </el-button>
              <el-button
                size="small"
                @click="startEdit(row)"
              >
                {{ t('common.actions.edit') }}
              </el-button>
              
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

      <el-card shadow="never" style="margin-bottom: 12px;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <div>
            <div style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('employees.activitiesDialog.currentTemplate') }}</div>
            <div>{{ currentTemplate ? currentTemplate.name : t('common.misc.none') }}</div>
          </div>
          <div style="flex: 1;"></div>
          <el-select v-model="selectedTemplateId" :placeholder="t('common.placeholders.selectTemplate')" clearable style="min-width: 260px;">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
          <el-button type="primary" :disabled="!selectedTemplateId" @click="applyTemplate">{{ t('employees.activitiesDialog.applyTemplate') }}</el-button>
          <el-button type="danger" :disabled="!currentTemplate" @click="removeTemplate">{{ t('employees.activitiesDialog.removeTemplate') }}</el-button>
        </div>
      </el-card>

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
        <el-button @click="activitiesDialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
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

        <el-form-item :label="t('employees.dialog.roleText')">
          <el-input v-model="form.roleTitle" :placeholder="t('employees.dialog.rolePlaceholder')" />
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
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
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
