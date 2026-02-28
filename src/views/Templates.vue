<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'
import { translateActivityKind } from '@/utils/uiText'

const { t } = useI18n()

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
    ElMessage.error(t('templates.loadError'))
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
      ElMessage.success(t('templates.updated'))
    } else {
      await apiClient.post('/api/templates', { name: form.value.name })
      ElMessage.success(t('templates.created'))
    }
    dialogVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('templates.saveError'))
  }
}

async function deleteTemplate(id: number) {
  try {
    await ElMessageBox.confirm(t('templates.deleteConfirmText'), t('templates.deleteConfirmTitle'), {
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      type: 'warning',
    })
    await apiClient.delete(`/api/templates/${id}`)
    ElMessage.success(t('templates.deleted'))
    await loadTemplates()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(t('templates.deleteError'))
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
    ElMessage.success(t('templates.activityAdded'))
    addActivityDialogVisible.value = false
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('templates.activityAddError'))
  }
}

async function removeActivity(templateId: number, activityId: number) {
  try {
    await apiClient.delete(`/api/templates/${templateId}/activities/${activityId}`)
    ElMessage.success(t('templates.activityRemoved'))
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('templates.activityRemoveError'))
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('templates.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">{{ t('templates.createButton') }}</el-button>
      </template>
    </el-page-header>

    <el-row :gutter="12" v-loading="loading">
      <el-col v-for="template in templates" :key="template.id" :span="12" style="margin-bottom: 12px;">
        <el-card shadow="never">
          <div style="display:flex; align-items:center; gap: 8px;">
            <div style="font-weight: 600;">{{ template.name }}</div>
            <div style="flex:1;"></div>
            <el-button size="small" :icon="Edit" @click="startEdit(template)">{{ t('common.actions.edit') }}</el-button>
            <el-button size="small" type="danger" :icon="Delete" @click="deleteTemplate(template.id)">{{ t('common.actions.delete') }}</el-button>
          </div>

          <div style="margin-top: 12px;">
            <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('templates.activities') }}</div>
            <div v-if="!template.templateActivities?.length" style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</div>
            <el-tag
              v-for="ta in template.templateActivities"
              :key="ta.activityId"
              style="margin-right: 6px; margin-bottom: 6px;"
              closable
              @close="removeActivity(template.id, ta.activityId)"
            >
              {{ ta.activity.name }}
            </el-tag>
          </div>

          <div style="margin-top: 12px;">
            <el-button size="small" @click="openAddActivity(template)">{{ t('templates.addActivity') }}</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="isEditing ? t('templates.dialog.editTitle') : t('templates.dialog.createTitle')" width="450px">
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('templates.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('templates.dialog.namePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="saveTemplate">{{ isEditing ? t('common.actions.save') : t('common.actions.create') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addActivityDialogVisible" :title="t('templates.addActivityTitle')" width="500px">
      <el-select v-model="selectedActivityId" :placeholder="t('common.placeholders.selectActivity')" filterable style="width: 100%">
        <el-option
          v-for="ca in companyActivities"
          :key="ca.activityId"
          :label="`${ca.activity.name} (${translateActivityKind(ca.activity.kind)})`"
          :value="ca.activityId"
        />
      </el-select>
      <template #footer>
        <el-button @click="addActivityDialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :disabled="!selectedActivityId" @click="addActivity">{{ t('common.actions.add') }}</el-button>
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

