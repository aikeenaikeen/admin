<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Plus, Edit, Check, Close, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { formatDateTime } from '@/utils/date'
import {
  translateActivityStatus,
  translateModelStatus,
  translateTrainingAnnotationType,
  translateTrainingJobStatus,
} from '@/utils/uiText'

type ActivityStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED'
type ModelVersionStatus = 'DRAFT' | 'STAGING' | 'ACTIVE' | 'DEPRECATED'

interface ModelVersion {
  id: number
  version: number
  status: ModelVersionStatus
  metrics?: any
  artifactUri?: string
  createdAt: string
}

interface Activity {
  id: number
  code: string
  name: string
  description?: string
  kind: string
  status: ActivityStatus
  detectorSpec?: any
  createdAt: string
  updatedAt: string
  modelVersions?: ModelVersion[]
  _count?: { companyActivities: number }
}

interface Company {
  id: number
  name: string
  slug: string
}

interface CompanyActivity {
  enabled: boolean
  allowedModelVersionId?: number | null
  activeModelVersionId?: number | null
  overrides?: any | null
  overridesText?: string
}

interface TrainingAnnotation {
  id: number
  startSec: number
  endSec: number
  label?: string | null
  type: 'POSITIVE' | 'NEGATIVE'
}

interface TrainingAsset {
  id: number
  uri: string
  mime: string
  sizeBytes: number
  durationSec?: number | null
  annotations?: TrainingAnnotation[]
}


const activities = ref<Activity[]>([])
const companies = ref<Company[]>([])
const { t } = useI18n()
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingActivityId = ref<number | null>(null)
const companyDialogVisible = ref(false)
const selectedActivity = ref<Activity | null>(null)
const companySettings = ref<Record<number, CompanyActivity>>({})

const trainingDialogVisible = ref(false)
const trainingActivity = ref<any | null>(null)
const uploadInputRef = ref<HTMLInputElement | null>(null)
const annotationsAssetId = ref<number | null>(null)
const annotationsDraft = ref<Array<{ startSec: number; endSec: number; type: 'POSITIVE' | 'NEGATIVE' }>>([])
const annotationForm = ref<{ startSec: number | null; endSec: number | null; type: 'POSITIVE' | 'NEGATIVE' }>({
  startSec: null,
  endSec: null,
  type: 'POSITIVE',
})

const form = ref({
  name: '',
  description: '',
})

const statusTagType = computed(() => (status: ActivityStatus) => {
  switch (status) {
    case 'ACTIVE': return 'success'
    case 'DRAFT': return 'info'
    case 'DEPRECATED': return 'danger'
    default: return 'info'
  }
})


onMounted(async () => {
  await loadActivities()
  await loadCompanies()
})

async function loadActivities() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/activities')
    activities.value = response.data
  } catch (error) {
    ElMessage.error(t('activities.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadCompanies() {
  try {
    const response = await apiClient.get('/api/companies')
    companies.value = response.data
  } catch (error) {
    ElMessage.error(t('activities.loadCompaniesError'))
  }
}

async function handleSubmit(openTrainingAfterSave: boolean = false) {
  try {
    if (isEditing.value && editingActivityId.value) {
      await apiClient.put(`/api/activities/${editingActivityId.value}`, form.value)
      ElMessage.success(t('activities.updated'))
      if (openTrainingAfterSave) {
        await openTraining({ id: editingActivityId.value } as any)
      }
    } else {
      const created = await apiClient.post('/api/activities', form.value)
      ElMessage.success(t('activities.created'))
      if (openTrainingAfterSave) {
        await openTraining(created.data)
      }
    }
    resetForm()
    await loadActivities()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('activities.saveError'))
  }
}

async function publishActivity(id: number) {
  try {
    await ElMessageBox.confirm(
      t('activities.publishConfirmText'),
      t('activities.publishConfirmTitle'),
      { confirmButtonText: t('common.actions.publish'), cancelButtonText: t('common.actions.cancel'), type: 'warning' }
    )
    await apiClient.post(`/api/activities/${id}/publish`)
    ElMessage.success(t('activities.published'))
    await loadActivities()
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error.response?.data?.error as string | undefined
      if (msg && msg.includes('needs ACTIVE modelVersion')) {
        try {
          await ElMessageBox.confirm(
            t('activities.activeModelNeededText'),
            t('activities.activeModelNeededTitle'),
            { confirmButtonText: t('common.actions.openTraining'), cancelButtonText: t('common.actions.cancel'), type: 'info' }
          )
          const act = activities.value.find((a) => a.id === id)
          if (act) await openTraining(act)
        } catch {
          // ignore cancel
        }
        return
      }
      ElMessage.error(msg || t('activities.publishError'))
    }
  }
}

async function deprecateActivity(id: number) {
  try {
    await ElMessageBox.confirm(
      t('activities.deprecateConfirmText'),
      t('activities.publishConfirmTitle'),
      { confirmButtonText: t('activities.deprecateConfirmButton'), cancelButtonText: t('common.actions.cancel'), type: 'warning' }
    )
    await apiClient.post(`/api/activities/${id}/deprecate`)
    ElMessage.success(t('activities.deprecated'))
    await loadActivities()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('activities.updateError'))
    }
  }
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(activity: Activity) {
  isEditing.value = true
  editingActivityId.value = activity.id
  dialogVisible.value = true
  form.value = {
    name: activity.name,
    description: activity.description || '',
  }
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingActivityId.value = null
  form.value = {
    name: '',
    description: '',
  }
}

async function openTraining(activity: Activity) {
  try {
    const full = await apiClient.get(`/api/activities/${activity.id}`)
    trainingActivity.value = full.data
    trainingDialogVisible.value = true

    // default annotation editor
    const firstAsset: TrainingAsset | undefined = (trainingActivity.value?.trainingAssets || [])[0]
    annotationsAssetId.value = firstAsset?.id ?? null
    annotationsDraft.value = (firstAsset?.annotations || []).map((a: any) => ({
      startSec: Number(a.startSec),
      endSec: Number(a.endSec),
      type: (a.type as any) || 'POSITIVE',
    }))
    annotationForm.value = { startSec: null, endSec: null, type: 'POSITIVE' }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.trainingLoadError'))
  }
}

function onPickFiles() {
  uploadInputRef.value?.click()
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (!files.length || !trainingActivity.value) return

  try {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)

    await apiClient.post(`/api/activities/${trainingActivity.value.id}/training-assets`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    ElMessage.success(t('activities.filesUploaded'))
    await openTraining(trainingActivity.value)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('activities.filesUploadError'))
  } finally {
    if (input) input.value = ''
  }
}

function onSelectAssetForAnnotations(assetId: number) {
  annotationsAssetId.value = assetId
  const asset = (trainingActivity.value?.trainingAssets || []).find((a: any) => a.id === assetId)
  annotationsDraft.value = (asset?.annotations || []).map((a: any) => ({
    startSec: Number(a.startSec),
    endSec: Number(a.endSec),
    type: (a.type as any) || 'POSITIVE',
  }))
  annotationForm.value = { startSec: null, endSec: null, type: 'POSITIVE' }
}

function addAnnotationInterval() {
  if (!annotationsAssetId.value) return
  const startSec = Number(annotationForm.value.startSec)
  const endSec = Number(annotationForm.value.endSec)
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    ElMessage.error(t('activities.invalidInterval'))
    return
  }

  annotationsDraft.value = [
    ...annotationsDraft.value,
    { startSec, endSec, type: annotationForm.value.type },
  ].sort((a, b) => a.startSec - b.startSec)

  annotationForm.value.startSec = null
  annotationForm.value.endSec = null
  annotationForm.value.type = 'POSITIVE'
}

function removeAnnotationInterval(idx: number) {
  annotationsDraft.value = annotationsDraft.value.filter((_, i) => i !== idx)
}

async function saveAnnotations() {
  if (!annotationsAssetId.value) return
  try {
    // UX: if user filled the form but didn't click "Добавить интервал" — auto-add it
    const hasDraftFormValues =
      annotationForm.value.startSec !== null || annotationForm.value.endSec !== null

    if (hasDraftFormValues) {
      const startSec = Number(annotationForm.value.startSec)
      const endSec = Number(annotationForm.value.endSec)
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
        annotationsDraft.value = [
          ...annotationsDraft.value,
          { startSec, endSec, type: annotationForm.value.type },
        ].sort((a, b) => a.startSec - b.startSec)

        annotationForm.value.startSec = null
        annotationForm.value.endSec = null
        annotationForm.value.type = 'POSITIVE'
      }
    }

    await apiClient.post(`/api/training-assets/${annotationsAssetId.value}/annotations`, {
      intervals: annotationsDraft.value.map((i) => ({
        startSec: i.startSec,
        endSec: i.endSec,
        type: i.type,
      })),
    })
    ElMessage.success(t('activities.annotationsSaved'))
    await openTraining(trainingActivity.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.annotationsSaveError'))
  }
}

async function startTraining() {
  if (!trainingActivity.value) return
  try {
    await apiClient.post(`/api/activities/${trainingActivity.value.id}/train`, {})
    ElMessage.success(t('activities.trainingStarted'))
    await openTraining(trainingActivity.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.trainingStartError'))
  }
}

async function promoteModelVersion(modelVersionId: number) {
  try {
    await apiClient.post(`/api/models/${modelVersionId}/promote`, {})
    ElMessage.success(t('activities.modelActivated'))
    if (trainingActivity.value) await openTraining(trainingActivity.value)
    if (selectedActivity.value) {
      const full = await apiClient.get(`/api/activities/${selectedActivity.value.id}`)
      selectedActivity.value = full.data
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.modelActivateError'))
  }
}

async function openCompanySettings(activity: Activity) {
  // Load full activity (including companyActivities + modelVersions)
  try {
    const full = await apiClient.get(`/api/activities/${activity.id}`)
    selectedActivity.value = full.data
  } catch (error) {
    ElMessage.error(t('activities.detailsLoadError'))
    return
  }

  companyDialogVisible.value = true

  // Build map of existing settings for this activity
  const existingByCompanyId = new Map<number, any>()
  const caList = (selectedActivity.value as any)?.companyActivities || []
  for (const ca of caList) {
    if (ca?.companyId) existingByCompanyId.set(ca.companyId, ca)
  }

  // Initialize settings for all companies
  const next: Record<number, CompanyActivity> = {}
  for (const c of companies.value) {
    const existing = existingByCompanyId.get(c.id)
    const overrides = existing?.overrides ?? null
    next[c.id] = {
      enabled: Boolean(existing?.enabled),
      allowedModelVersionId: existing?.allowedModelVersionId ?? null,
      activeModelVersionId: existing?.activeModelVersionId ?? null,
      overrides,
      overridesText: overrides ? JSON.stringify(overrides, null, 2) : '',
    }
  }

  companySettings.value = next
}

async function saveCompanySettings() {
  if (!selectedActivity.value) return

  try {
    const activityId = selectedActivity.value.id
    const promises = companies.value.map((company: Company) => {
      const settings = companySettings.value[company.id] || { enabled: false }

      // Parse overrides JSON (if provided)
      let overrides: any | null | undefined = null
      if (settings.overridesText && settings.overridesText.trim().length > 0) {
        try {
          overrides = JSON.parse(settings.overridesText)
        } catch (e) {
          throw new Error(t('activities.invalidOverridesJson', { name: company.name }))
        }
      } else {
        overrides = null
      }

      return apiClient.post(`/api/activities/${activityId}/companies/${company.id}/enable`, {
        enabled: Boolean(settings.enabled),
        allowedModelVersionId: settings.allowedModelVersionId ?? null,
        activeModelVersionId: settings.activeModelVersionId ?? null,
        overrides,
      })
    })

    await Promise.all(promises)
    ElMessage.success(t('activities.companySettingsSaved'))
    companyDialogVisible.value = false
    await loadActivities()
  } catch (error) {
    ElMessage.error((error as any)?.message || t('activities.companySettingsSaveError'))
  }
}

function toggleCompanyAccess(companyId: number, enabled: boolean) {
  if (!companySettings.value[companyId]) {
    companySettings.value[companyId] = { enabled, allowedModelVersionId: null, activeModelVersionId: null, overrides: null, overridesText: '' }
  } else {
    companySettings.value[companyId].enabled = enabled
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('activities.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ t('activities.createButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="activities" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="60" />
        
        <el-table-column prop="code" :label="t('activities.table.code')" min-width="150">
          <template #default="{ row }">
            <el-tag>{{ row.code }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />
        
        <el-table-column :label="t('common.labels.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ translateActivityStatus(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('activities.table.companiesCount')" width="100" align="center">
          <template #default="{ row }">
            {{ row._count?.companyActivities || 0 }}
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.actions')" width="450" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                v-if="row.status === 'DRAFT'"
                size="small"
                type="success"
                :icon="Check"
                @click="publishActivity(row.id)"
              >
                {{ t('common.actions.publish') }}
              </el-button>
              
              <el-button
                v-if="row.status === 'ACTIVE'"
                size="small"
                type="warning"
                :icon="Close"
                @click="deprecateActivity(row.id)"
              >
                {{ t('activities.deprecateButton') }}
              </el-button>
              
              <el-button
                v-if="row.status !== 'DEPRECATED'"
                size="small"
                :icon="Edit"
                @click="startEdit(row)"
              >
                {{ t('common.actions.edit') }}
              </el-button>

              <el-button
                size="small"
                @click="openTraining(row)"
              >
                {{ t('common.actions.openTraining') }}
              </el-button>
              
              <el-button
                v-if="row.status === 'ACTIVE'"
                size="small"
                type="primary"
                :icon="Setting"
                @click="openCompanySettings(row)"
              >
                {{ t('layout.menu.companies') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Создание/редактирование активности -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('activities.dialog.editTitle') : t('activities.dialog.createTitle')"
      width="600px"
    >
      <el-form :model="form" label-width="150px">
        <el-form-item :label="t('activities.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('activities.dialog.namePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('activities.dialog.description')">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :placeholder="t('activities.dialog.descriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit(false)">
          {{ isEditing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
        <el-button type="success" @click="handleSubmit(true)">
          {{ isEditing ? t('activities.dialog.saveAndTrainEdit') : t('activities.dialog.saveAndTrainCreate') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Обучение / данные активности -->
    <el-dialog
      v-model="trainingDialogVisible"
      :title="t('activities.dialog.trainingTitle', { name: trainingActivity?.name || '' })"
      width="1100px"
    >
      <el-row :gutter="12">
        <el-col :span="12">
          <el-card shadow="never">
            <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
              <div style="font-weight: 600;">{{ t('activities.dialog.dataAssets') }}</div>
              <div style="flex:1;"></div>
              <input ref="uploadInputRef" type="file" multiple style="display:none" @change="onFilesSelected" />
              <el-button type="primary" @click="onPickFiles">{{ t('common.actions.upload') }}</el-button>
            </div>

            <el-table :data="trainingActivity?.trainingAssets || []" style="width: 100%">
              <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
              <el-table-column :label="t('activities.dialog.link')" min-width="240">
                <template #default="{ row }">
                  <el-link :href="row.uri" target="_blank">{{ row.uri }}</el-link>
                </template>
              </el-table-column>
              <el-table-column prop="mime" :label="t('activities.dialog.mimeType')" width="150" />
              <el-table-column prop="sizeBytes" :label="t('activities.dialog.size')" width="110" />
              <el-table-column :label="t('activities.dialog.annotations')" width="110">
                <template #default="{ row }">{{ (row.annotations || []).length }}</template>
              </el-table-column>
              <el-table-column label="" width="120">
                <template #default="{ row }">
                  <el-button size="small" @click="onSelectAssetForAnnotations(row.id)">{{ t('activities.dialog.annotationEditShort') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <el-col :span="12">
          <el-card shadow="never" style="margin-bottom: 12px;">
            <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
              <div style="font-weight: 600;">{{ t('activities.dialog.annotationsTitle') }}</div>
              <div style="flex:1;"></div>
              <el-button type="primary" :disabled="!annotationsAssetId" @click="saveAnnotations">{{ t('common.actions.save') }}</el-button>
            </div>

            <div v-if="!annotationsAssetId" style="color: var(--el-text-color-secondary);">
              {{ t('activities.dialog.pickAssetHint') }}
            </div>

            <div v-else>
              <el-table :data="annotationsDraft" style="width: 100%; margin-bottom: 12px;">
                <el-table-column :label="t('activities.dialog.intervalStart')" width="140">
                  <template #default="{ row }">{{ row.startSec }}</template>
                </el-table-column>
                <el-table-column :label="t('activities.dialog.intervalEnd')" width="140">
                  <template #default="{ row }">{{ row.endSec }}</template>
                </el-table-column>
                <el-table-column :label="t('common.labels.type')" width="140">
                  <template #default="{ row }">{{ translateTrainingAnnotationType(row.type) }}</template>
                </el-table-column>
                <el-table-column label="" width="120">
                  <template #default="{ $index }">
                    <el-button size="small" type="danger" @click="removeAnnotationInterval($index)">
                      {{ t('common.actions.delete') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>

              <el-row :gutter="12">
                <el-col :span="8">
                  <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('activities.dialog.intervalStart') }}</div>
                  <el-input-number v-model="annotationForm.startSec" :min="0" :step="0.1" style="width: 100%;" />
                </el-col>
                <el-col :span="8">
                  <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('activities.dialog.intervalEnd') }}</div>
                  <el-input-number v-model="annotationForm.endSec" :min="0" :step="0.1" style="width: 100%;" />
                </el-col>
                <el-col :span="8">
                  <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px;">{{ t('common.labels.type') }}</div>
                  <el-select v-model="annotationForm.type" style="width: 100%;">
                    <el-option :label="translateTrainingAnnotationType('POSITIVE')" value="POSITIVE" />
                    <el-option :label="translateTrainingAnnotationType('NEGATIVE')" value="NEGATIVE" />
                  </el-select>
                </el-col>
              </el-row>
              <div style="margin-top: 12px;">
                <el-button type="primary" @click="addAnnotationInterval">{{ t('activities.dialog.addInterval') }}</el-button>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
              <div style="font-weight: 600;">{{ t('activities.dialog.trainingJobs') }}</div>
              <div style="flex:1;"></div>
              <el-button type="success" @click="startTraining">{{ t('activities.dialog.startTraining') }}</el-button>
            </div>
            <el-table :data="trainingActivity?.trainingJobs || []" style="width: 100%">
              <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
              <el-table-column :label="t('common.labels.status')" width="120">
                <template #default="{ row }">
                  {{ translateTrainingJobStatus(row.status) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.modelVersion')" min-width="140">
                <template #default="{ row }">
                  {{ row.modelVersion?.id || row.modelVersionId || t('common.misc.none') }}
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.createdAt')" min-width="180">
                <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('common.labels.actions')" width="160">
                <template #default="{ row }">
                  <el-button
                    v-if="(row.modelVersion?.id || row.modelVersionId) && ((row.modelVersion?.status || ((trainingActivity?.modelVersions || []).find((m:any)=>m.id===row.modelVersionId)?.status)) === 'STAGING')"
                    size="small"
                    type="primary"
                    @click="promoteModelVersion(row.modelVersion?.id || row.modelVersionId)"
                  >
                    {{ t('common.actions.activate') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" style="margin-top: 12px;">
            <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
              <div style="font-weight: 600;">{{ t('activities.dialog.modelVersions') }}</div>
              <div style="flex:1;"></div>
              <div style="font-size: 12px; color: var(--el-text-color-secondary);">
                {{ t('activities.dialog.modelPublishHint') }}
              </div>
            </div>
            <el-table :data="trainingActivity?.modelVersions || []" style="width: 100%">
              <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
              <el-table-column prop="version" :label="t('activities.dialog.modelVersion')" width="90">
                <template #default="{ row }">v{{ row.version }}</template>
              </el-table-column>
              <el-table-column :label="t('common.labels.status')" width="120">
                <template #default="{ row }">
                  {{ translateModelStatus(row.status) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.artifact')" min-width="260">
                <template #default="{ row }">
                  <span v-if="row.artifactUri" style="word-break: break-all;">{{ row.artifactUri }}</span>
                  <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('common.labels.actions')" width="160">
                <template #default="{ row }">
                  <el-button
                    v-if="row.status === 'STAGING'"
                    size="small"
                    type="primary"
                    @click="promoteModelVersion(row.id)"
                  >
                    {{ t('common.actions.activate') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <template #footer>
        <el-button @click="trainingDialogVisible = false">{{ t('common.actions.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- Настройки доступа для компаний -->
    <el-dialog
      v-model="companyDialogVisible"
      :title="t('activities.dialog.companySettingsTitle', { name: selectedActivity?.name || '' })"
      width="1100px"
    >
      <el-table :data="companies" style="width: 100%">
        <el-table-column prop="name" :label="t('common.labels.company')" min-width="200" />
        
        <el-table-column :label="t('activities.dialog.access')" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="companySettings[row.id]?.enabled || false"
              @change="(val: boolean) => toggleCompanyAccess(row.id, val)"
            />
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.allowedModel')" width="220">
          <template #default="{ row }">
            <el-select
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].allowedModelVersionId"
              :placeholder="t('common.misc.none')"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="mv in (selectedActivity?.modelVersions || [])"
                :key="mv.id"
                :label="`v${mv.version} (${translateModelStatus(mv.status)})`"
                :value="mv.id"
              />
            </el-select>
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.activeModel')" width="220">
          <template #default="{ row }">
            <el-select
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].activeModelVersionId"
              :placeholder="t('common.misc.none')"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="mv in (selectedActivity?.modelVersions || []).filter((m: any) => m.status === 'ACTIVE')"
                :key="mv.id"
                :label="`v${mv.version} (${translateModelStatus(mv.status)})`"
                :value="mv.id"
              />
            </el-select>
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.overrides')" min-width="350">
          <template #default="{ row }">
            <el-input
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].overridesText"
              type="textarea"
              :rows="3"
              :placeholder="t('activities.dialog.overridesPlaceholder')"
            />
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="companyDialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="saveCompanySettings">
          {{ t('common.actions.save') }}
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

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-buttons :deep(.el-button) {
  margin: 0;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
  
  .action-buttons {
    flex-direction: column;
  }
}
</style>
