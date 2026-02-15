<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'

interface Activity {
  id: number
  name: string
  kind: string
}

interface CompanyActivity {
  activityId: number
  activity: Activity
}

interface TemplateActivity {
  activityId: number
  activity: Activity
}

interface Template {
  id: number
  name: string
  templateActivities: TemplateActivity[]
}

const loading = ref(true)
const templates = ref<Template[]>([])
const companyActivities = ref<CompanyActivity[]>([])

const dialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const form = ref({ name: '' })

const addActivityDialogVisible = ref(false)
const selectedTemplate = ref<Template | null>(null)
const selectedActivityId = ref<number | null>(null)

onMounted(async () => {
  await Promise.all([loadTemplates(), loadCompanyActivities()])
})

async function loadTemplates() {
  loading.value = true
  try {
    const res = await apiClient.get('/api/templates')
    templates.value = res.data
  } catch {
    ElMessage.error('Не удалось загрузить шаблоны')
  } finally {
    loading.value = false
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

function startCreate() {
  isEditing.value = false
  editingId.value = null
  form.value = { name: '' }
  dialogVisible.value = true
}

function startEdit(t: Template) {
  isEditing.value = true
  editingId.value = t.id
  form.value = { name: t.name }
  dialogVisible.value = true
}

async function saveTemplate() {
  try {
    if (isEditing.value && editingId.value) {
      await apiClient.put(`/api/templates/${editingId.value}`, { name: form.value.name })
      ElMessage.success('Шаблон обновлён')
    } else {
      await apiClient.post('/api/templates', { name: form.value.name })
      ElMessage.success('Шаблон создан')
    }
    dialogVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось сохранить шаблон')
  }
}

async function deleteTemplate(id: number) {
  try {
    await ElMessageBox.confirm('Удалить шаблон?', 'Подтверждение', {
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
      type: 'warning',
    })
    await apiClient.delete(`/api/templates/${id}`)
    ElMessage.success('Шаблон удалён')
    await loadTemplates()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('Не удалось удалить шаблон')
  }
}

function openAddActivity(t: Template) {
  selectedTemplate.value = t
  selectedActivityId.value = null
  addActivityDialogVisible.value = true
}

async function addActivity() {
  if (!selectedTemplate.value || !selectedActivityId.value) return
  try {
    await apiClient.post(`/api/templates/${selectedTemplate.value.id}/activities`, {
      activityId: selectedActivityId.value,
    })
    ElMessage.success('Активность добавлена')
    addActivityDialogVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось добавить активность')
  }
}

async function removeActivity(templateId: number, activityId: number) {
  try {
    await apiClient.delete(`/api/templates/${templateId}/activities/${activityId}`)
    ElMessage.success('Активность удалена')
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || 'Не удалось удалить активность')
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">Шаблоны</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">Создать шаблон</el-button>
      </template>
    </el-page-header>

    <el-row :gutter="12" v-loading="loading">
      <el-col v-for="t in templates" :key="t.id" :span="12" style="margin-bottom: 12px;">
        <el-card shadow="never">
          <div style="display:flex; align-items:center; gap: 8px;">
            <div style="font-weight: 600;">{{ t.name }}</div>
            <div style="flex:1;"></div>
            <el-button size="small" :icon="Edit" @click="startEdit(t)">Редактировать</el-button>
            <el-button size="small" type="danger" :icon="Delete" @click="deleteTemplate(t.id)">Удалить</el-button>
          </div>

          <div style="margin-top: 12px;">
            <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">Активности</div>
            <div v-if="!t.templateActivities?.length" style="color: var(--el-text-color-secondary);">—</div>
            <el-tag
              v-for="ta in t.templateActivities"
              :key="ta.activityId"
              style="margin-right: 6px; margin-bottom: 6px;"
              closable
              @close="removeActivity(t.id, ta.activityId)"
            >
              {{ ta.activity.name }}
            </el-tag>
          </div>

          <div style="margin-top: 12px;">
            <el-button size="small" @click="openAddActivity(t)">Добавить активность</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="isEditing ? 'Редактировать шаблон' : 'Создать шаблон'" width="450px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Название" required>
          <el-input v-model="form.name" placeholder="Официант" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="saveTemplate">{{ isEditing ? 'Сохранить' : 'Создать' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addActivityDialogVisible" title="Добавить активность" width="500px">
      <el-select v-model="selectedActivityId" placeholder="Выберите активность" filterable style="width: 100%">
        <el-option
          v-for="ca in companyActivities"
          :key="ca.activityId"
          :label="`${ca.activity.name} (${ca.activity.kind})`"
          :value="ca.activityId"
        />
      </el-select>
      <template #footer>
        <el-button @click="addActivityDialogVisible = false">Отмена</el-button>
        <el-button type="primary" :disabled="!selectedActivityId" @click="addActivity">Добавить</el-button>
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
</style>

