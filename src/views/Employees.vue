<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Delete, User, Upload, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import apiClient from '@/api/client'

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
    ElMessage.error('Не удалось загрузить сотрудников')
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
      ElMessage.success('Сотрудник обновлён')
    } else {
      const res = await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      savedEmployee = res.data
      ElMessage.success('Сотрудник успешно добавлен')
    }

    // Assign activities immediately (new UX)
    const employeeId = isEditing.value ? editingEmployeeId.value : savedEmployee?.id
    if (employeeId) {
      try {
        await apiClient.put(`/api/employees/${employeeId}/activities`, {
          activities: (form.value.activityIds || []).map((id) => ({ activityId: id, enabled: true })),
        })
      } catch (e: any) {
        ElMessage.error(e.response?.data?.error || 'Сотрудник сохранён, но активности назначить не удалось')
      }
    }

    resetForm()
    await loadEmployees()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось сохранить сотрудника')
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
    await ElMessageBox.confirm('Вы уверены, что хотите удалить этого сотрудника?', 'Подтверждение', {
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
      type: 'warning',
    })

    await apiClient.delete(`/api/employees/${id}`)
    ElMessage.success('Сотрудник удален')
    await loadEmployees()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('Не удалось удалить сотрудника')
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
    ElMessage.error(e.response?.data?.error || 'Не удалось загрузить активности сотрудника')
  }
}

async function saveEmployeeActivities() {
  if (!selectedEmployee.value) return
  try {
    await apiClient.put(`/api/employees/${selectedEmployee.value.id}/activities`, {
      activities: selectedActivityIds.value.map((id) => ({ activityId: id, enabled: true })),
    })
    ElMessage.success('Активности сохранены')
    activitiesDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось сохранить активности')
  }
}

async function applyTemplate() {
  if (!selectedEmployee.value || !selectedTemplateId.value) return
  try {
    await apiClient.put(`/api/employees/${selectedEmployee.value.id}/template`, {
      templateId: selectedTemplateId.value,
    })
    ElMessage.success('Шаблон применён')
    await openEmployeeActivities(selectedEmployee.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось применить шаблон')
  }
}

async function removeTemplate() {
  if (!selectedEmployee.value) return
  try {
    await apiClient.delete(`/api/employees/${selectedEmployee.value.id}/template`)
    ElMessage.success('Шаблон снят')
    await openEmployeeActivities(selectedEmployee.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось снять шаблон')
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">Сотрудники</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ dialogVisible ? 'Отмена' : 'Добавить сотрудника' }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="employees" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        
        <el-table-column label="Фото" width="100">
          <template #default="{ row }">
            <el-avatar :src="row.photoUrl" :size="60">
              <el-icon :size="30"><User /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" label="Имя" min-width="180" />
        
        <el-table-column label="Должность" min-width="150">
          <template #default="{ row }">
            {{ row.role || '—' }}
          </template>
        </el-table-column>
        
        <el-table-column label="Действия" width="380" fixed="right">
          <template #default="{ row }">
              <el-button
                size="small"
                :icon="Setting"
                @click="openEmployeeActivities(row)"
              >
                Активности
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteEmployee(row.id)"
              >
                Удалить
              </el-button>
              <el-button
                size="small"
                @click="startEdit(row)"
              >
                Редактировать
              </el-button>
              
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="activitiesDialogVisible"
      title="Активности сотрудника"
      width="700px"
    >
      <div v-if="selectedEmployee" style="margin-bottom: 12px; color: var(--el-text-color-regular);">
        Сотрудник: <strong>{{ selectedEmployee.name }}</strong>
      </div>

      <el-card shadow="never" style="margin-bottom: 12px;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <div>
            <div style="font-size: 12px; color: var(--el-text-color-secondary);">Текущий шаблон</div>
            <div>{{ currentTemplate ? currentTemplate.name : '—' }}</div>
          </div>
          <div style="flex: 1;"></div>
          <el-select v-model="selectedTemplateId" placeholder="Применить шаблон" clearable style="min-width: 260px;">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
          <el-button type="primary" :disabled="!selectedTemplateId" @click="applyTemplate">Применить</el-button>
          <el-button type="danger" :disabled="!currentTemplate" @click="removeTemplate">Снять</el-button>
        </div>
      </el-card>

      <el-checkbox-group v-model="selectedActivityIds">
        <el-row :gutter="12">
          <el-col v-for="ca in companyActivities" :key="ca.activityId" :span="12" style="margin-bottom: 8px;">
            <el-checkbox :label="ca.activityId">
              {{ ca.activity.name }} <span style="color: var(--el-text-color-secondary);">({{ ca.activity.kind }})</span>
            </el-checkbox>
          </el-col>
        </el-row>
      </el-checkbox-group>

      <template #footer>
        <el-button @click="activitiesDialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="saveEmployeeActivities">Сохранить</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? 'Редактировать сотрудника' : 'Добавить сотрудника'"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item label="Имя" required>
          <el-input v-model="form.name" placeholder="Иван Иванов" />
        </el-form-item>

        <el-form-item label="Должность (текст)">
          <el-input v-model="form.roleTitle" placeholder="Необязательно (старое поле)" />
        </el-form-item>

        <el-form-item label="Активности">
          <el-select
            v-model="form.activityIds"
            multiple
            filterable
            clearable
            placeholder="Выберите активности"
            style="width: 100%"
          >
            <el-option
              v-for="ca in companyActivities"
              :key="ca.activityId"
              :label="`${ca.activity.name} (${ca.activity.kind})`"
              :value="ca.activityId"
            />
          </el-select>
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px;">
            Показываются только активности, разрешённые компании и с выбранной моделью.
          </div>
        </el-form-item>

        <el-form-item label="Фото">
          <el-upload
            v-model:file-list="fileList"
            :auto-upload="false"
            :limit="1"
            accept="image/*"
            :on-change="handleFileChange"
            :on-remove="handleRemove"
          >
            <el-button :icon="Upload">Выбрать файл</el-button>
            <template #tip>
              <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px;">
                JPG, PNG до 10MB
              </div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="handleSubmit">
          {{ isEditing ? 'Сохранить' : 'Создать' }}
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
