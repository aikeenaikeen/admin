<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { formatDate } from '@/utils/date'

interface Company {
  id: number
  name: string
  slug: string
  isActive: boolean
  createdAt: string
}

const companies = ref<Company[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const { t } = useI18n()

// Редактирование recognitionConfig
const editConfigDialogVisible = ref(false)
const editingCompanyId = ref<number | null>(null)
const editingCompanyName = ref('')
const configLoading = ref(false)
const configSaving = ref(false)

const form = ref({
  name: '',
  slug: '',
  recognitionConfig: {
    quality: { minFaceHeight: 20, minBlurVar: 50 },
    insightface: { threshold: 0.2 },
    faceTracking: { minEmbeddings: 2, trackMaxAgeSeconds: 2.0 },
    personTracking: { 
      enabled: true,
      detConf: 0.5,
      iouThreshold: 0.3,
      trackMaxAgeSeconds: 5.0,
      faceToPersonIouThreshold: 0.1,
      faceToPersonContainmentMin: 0.5,
      employeeLockStrict: true,
    },
    presence: { 
      observationMode: true, 
      observationIntervalSeconds: 2.0,
      inThresholdSeconds: 1.0,
      outThresholdSeconds: 10.0,
    },
    optimization: { 
      personDetectMode: 'on_demand' as const,
      personDetIntervalFrames: 10,
      personDetOnNewFace: true,
    },
    streaming: { streamFps: 15, streamJpegQuality: 85 },
    visualization: {
      drawFaceBoxes: true,
      drawPersonBoxes: true,
      drawNames: true,
    },
    actionRecognition: {
      startThreshold: 0.7,
      endThreshold: 0.4,
      gapSeconds: 2.0,
      minDurationSeconds: 1.0,
      maxIntervalSeconds: 0.0,
      fps: 8.0,
      maxFrames: 64,
      debug: false,
    },
  },
})

const showAdvanced = ref(false)
const showAdvancedEdit = ref(false)

const editConfig = ref({
  quality: { minFaceHeight: 20, minBlurVar: 50 },
  insightface: { threshold: 0.2 },
  faceTracking: { minEmbeddings: 2, trackMaxAgeSeconds: 2.0 },
  personTracking: { 
    enabled: true,
    detConf: 0.5,
    iouThreshold: 0.3,
    trackMaxAgeSeconds: 5.0,
    faceToPersonIouThreshold: 0.1,
    faceToPersonContainmentMin: 0.5,
    employeeLockStrict: true,
  },
  presence: { 
    observationMode: true, 
    observationIntervalSeconds: 2.0,
    inThresholdSeconds: 1.0,
    outThresholdSeconds: 10.0,
  },
  optimization: { 
    personDetectMode: 'on_demand' as const,
    personDetIntervalFrames: 10,
    personDetOnNewFace: true,
  },
  streaming: { streamFps: 15, streamJpegQuality: 85 },
  visualization: {
    drawFaceBoxes: true,
    drawPersonBoxes: true,
    drawNames: true,
  },
  actionRecognition: {
    startThreshold: 0.7,
    endThreshold: 0.4,
    gapSeconds: 2.0,
    minDurationSeconds: 1.0,
    maxIntervalSeconds: 0.0,
    fps: 8.0,
    maxFrames: 64,
    debug: false,
  },
})

// Helper для получения дефолтного конфига (DRY)
function getDefaultConfig() {
  return {
    quality: { minFaceHeight: 20, minBlurVar: 50 },
    insightface: { threshold: 0.2 },
    faceTracking: { minEmbeddings: 2, trackMaxAgeSeconds: 2.0 },
    personTracking: { 
      enabled: true,
      detConf: 0.5,
      iouThreshold: 0.3,
      trackMaxAgeSeconds: 5.0,
      faceToPersonIouThreshold: 0.1,
      faceToPersonContainmentMin: 0.5,
      employeeLockStrict: true,
    },
    presence: { 
      observationMode: true, 
      observationIntervalSeconds: 2.0,
      inThresholdSeconds: 1.0,
      outThresholdSeconds: 10.0,
    },
    optimization: { 
      personDetectMode: 'on_demand' as const,
      personDetIntervalFrames: 10,
      personDetOnNewFace: true,
    },
    streaming: { streamFps: 15, streamJpegQuality: 85 },
    visualization: {
      drawFaceBoxes: true,
      drawPersonBoxes: true,
      drawNames: true,
    },
    actionRecognition: {
      startThreshold: 0.7,
      endThreshold: 0.4,
      gapSeconds: 2.0,
      minDurationSeconds: 1.0,
      maxIntervalSeconds: 0.0,
      fps: 8.0,
      maxFrames: 64,
      debug: false,
    },
  }
}

onMounted(async () => {
  await loadCompanies()
})

async function loadCompanies() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/companies')
    companies.value = response.data
  } catch (error) {
    ElMessage.error(t('companies.loadError'))
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    await apiClient.post('/api/companies', form.value)
    ElMessage.success(t('companies.created'))
    dialogVisible.value = false
    form.value = {
      name: '',
      slug: '',
      recognitionConfig: getDefaultConfig(),
    }
    await loadCompanies()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.createError'))
  }
}

async function toggleCompany(id: number, isActive: boolean) {
  try {
    await apiClient.put(`/api/companies/${id}`, { isActive: !isActive })
    ElMessage.success(isActive ? t('companies.deactivated') : t('companies.activated'))
    await loadCompanies()
  } catch (error) {
    ElMessage.error(t('companies.toggleError'))
  }
}

function generateSlug() {
  form.value.slug = form.value.name
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Deep merge helper для recognitionConfig
function deepMerge(defaults: any, overrides: any): any {
  const result = { ...defaults }
  
  for (const key in result) {
    if (overrides && overrides[key] !== undefined) {
      if (typeof result[key] === 'object' && !Array.isArray(result[key]) && result[key] !== null) {
        result[key] = deepMerge(result[key], overrides[key])
      } else {
        result[key] = overrides[key]
      }
    }
  }
  
  return result
}

async function openEditConfig(company: Company) {
  editingCompanyId.value = company.id
  editingCompanyName.value = company.name
  configLoading.value = true
  editConfigDialogVisible.value = true
  showAdvancedEdit.value = false
  
  try {
    const response = await apiClient.get(`/api/companies/${company.id}`)
    const companyData = response.data
    
    // Deep merge: defaults + company.recognitionConfig
    const defaults = getDefaultConfig()
    const merged = deepMerge(defaults, companyData.recognitionConfig || {})
    
    editConfig.value = merged
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configLoadError'))
    editConfigDialogVisible.value = false
  } finally {
    configLoading.value = false
  }
}

async function saveConfig() {
  if (!editingCompanyId.value) return
  
  configSaving.value = true
  try {
    await apiClient.put(
      `/api/companies/${editingCompanyId.value}/recognition-config`,
      editConfig.value
    )
    ElMessage.success(t('companies.configSaved'))
    editConfigDialogVisible.value = false
    editingCompanyId.value = null
    editingCompanyName.value = ''
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configSaveError'))
  } finally {
    configSaving.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('companies.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="dialogVisible = true">
          {{ t('companies.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="companies" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />
        
        <el-table-column :label="t('companies.table.slug')" min-width="180">
          <template #default="{ row }">
            <el-tag type="info">{{ row.slug }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'">
              {{ row.isActive ? t('companies.table.active') : t('companies.table.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('companies.table.createdAt')" width="150">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.actions')" width="420" fixed="right">
          <template #default="{ row }">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <el-button
                size="small"
                type="primary"
                @click="openEditConfig(row)"
              >
                {{ t('companies.configureRecognition') }}
              </el-button>
              <el-button
                size="small"
                :type="row.isActive ? 'warning' : 'success'"
                @click="toggleCompany(row.id, row.isActive)"
              >
                {{ row.isActive ? t('common.actions.disable') : t('common.actions.enable') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="t('companies.dialog.addTitle')"
      width="800px"
    >
      <el-form :model="form" label-width="200px">
        <el-form-item :label="t('companies.dialog.name')" required>
          <el-input
            v-model="form.name"
            :placeholder="t('companies.dialog.namePlaceholder')"
            @input="generateSlug"
          />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.slug')" required>
          <el-input
            v-model="form.slug"
            :placeholder="t('companies.dialog.slugPlaceholder')"
          >
            <template #prepend>/</template>
          </el-input>
          <template #extra>
            <span style="font-size: 12px; color: var(--el-text-color-secondary);">
              {{ t('companies.dialog.slugHint') }}
            </span>
          </template>
        </el-form-item>

        <el-divider content-position="left">{{ t('companies.dialog.recognitionSettings') }}</el-divider>

        <el-form-item :label="t('companies.dialog.peopleTracking')">
          <el-switch v-model="form.recognitionConfig.personTracking.enabled" />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.observationMode')">
          <el-switch v-model="form.recognitionConfig.presence.observationMode" />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.personDetectionMode')">
          <el-select v-model="form.recognitionConfig.optimization.personDetectMode">
            <el-option :label="t('companies.dialog.personDetectionOnDemand')" value="on_demand" />
            <el-option :label="t('companies.dialog.always')" value="always" />
          </el-select>
        </el-form-item>

        <el-link type="primary" @click="showAdvanced = !showAdvanced" style="margin-bottom: 16px">
          {{ showAdvanced ? t('companies.dialog.hideAdvanced') : t('companies.dialog.showAdvanced') }}
        </el-link>

        <div v-show="showAdvanced">
          <el-collapse>
            <el-collapse-item :title="t('companies.dialog.section.quality')" name="quality">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.minFaceHeight')">
                <el-input-number v-model="form.recognitionConfig.quality.minFaceHeight" :min="10" :max="200" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.minBlur')">
                <el-input-number v-model="form.recognitionConfig.quality.minBlurVar" :min="0" :max="500" :step="10" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.minBlur') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.recognition')" name="insightface">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.similarityThreshold')">
                <el-input-number v-model="form.recognitionConfig.insightface.threshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.similarityThreshold') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.faceTracking')" name="faceTracking">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.minEmbeddings')">
                <el-input-number v-model="form.recognitionConfig.faceTracking.minEmbeddings" :min="1" :max="10" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.minEmbeddings') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceTrackMaxAgeSeconds')">
                <el-input-number v-model="form.recognitionConfig.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceTrackMaxAgeSeconds') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.personTracking')" name="personTracking">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.personDetectorConfidence')">
                <el-input-number v-model="form.recognitionConfig.personTracking.detConf" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetectorConfidence') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personIouThreshold')">
                <el-input-number v-model="form.recognitionConfig.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personIouThreshold') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personTrackMaxAgeSeconds')">
                <el-input-number v-model="form.recognitionConfig.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personTrackMaxAgeSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceToPersonIouThreshold')">
                <el-input-number v-model="form.recognitionConfig.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceToPersonIouThreshold') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceToPersonContainmentMin')">
                <el-input-number v-model="form.recognitionConfig.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceToPersonContainmentMin') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.employeeLockStrict')">
                <el-switch v-model="form.recognitionConfig.personTracking.employeeLockStrict" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.employeeLockStrict') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.presence')" name="presence">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.observationIntervalSeconds')">
                <el-input-number v-model="form.recognitionConfig.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.observationIntervalSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.inThresholdSeconds')">
                <el-input-number v-model="form.recognitionConfig.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.inThresholdSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.outThresholdSeconds')">
                <el-input-number v-model="form.recognitionConfig.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.outThresholdSeconds') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.optimization')" name="optimization">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.personDetIntervalFrames')">
                <el-input-number v-model="form.recognitionConfig.optimization.personDetIntervalFrames" :min="1" :max="120" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetIntervalFrames') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personDetOnNewFace')">
                <el-switch v-model="form.recognitionConfig.optimization.personDetOnNewFace" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetOnNewFace') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.streaming')" name="streaming">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.streamFps')">
                <el-input-number v-model="form.recognitionConfig.streaming.streamFps" :min="1" :max="30" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.streamFps') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.streamJpegQuality')">
                <el-input-number v-model="form.recognitionConfig.streaming.streamJpegQuality" :min="30" :max="95" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.streamJpegQuality') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.actionRecognition')" name="actionRecognition">
              <el-form label-width="280px">
                <el-form-item :label="t('companies.dialog.fields.actionStartThreshold')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.startThreshold" :min="0" :max="1" :step="0.01" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionStartThreshold') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionEndThreshold')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.endThreshold" :min="0" :max="1" :step="0.01" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionEndThreshold') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionGapSeconds')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.gapSeconds" :min="0.1" :max="30" :step="0.1" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionGapSeconds') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMinDurationSeconds')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.minDurationSeconds" :min="0" :max="60" :step="0.1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMaxIntervalSeconds')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.maxIntervalSeconds" :min="0" :max="3600" :step="1" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionMaxIntervalSeconds') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionFps')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.fps" :min="1" :max="30" :step="1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMaxFrames')">
                  <el-input-number v-model="form.recognitionConfig.actionRecognition.maxFrames" :min="16" :max="512" :step="1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionDebug')">
                  <el-switch v-model="form.recognitionConfig.actionRecognition.debug" />
                </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.visualization')" name="visualization">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.drawFaceBoxes')">
                <el-switch v-model="form.recognitionConfig.visualization.drawFaceBoxes" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.drawPersonBoxes')">
                <el-switch v-model="form.recognitionConfig.visualization.drawPersonBoxes" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.drawNames')">
                <el-switch v-model="form.recognitionConfig.visualization.drawNames" />
              </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{ t('common.actions.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- Диалог редактирования recognitionConfig -->
    <el-dialog
      v-model="editConfigDialogVisible"
      :title="t('companies.dialog.configTitle', { name: editingCompanyName })"
      width="800px"
      v-loading="configLoading"
    >
      <el-form :model="editConfig" label-width="200px">
        <el-form-item :label="t('companies.dialog.peopleTracking')">
          <el-switch v-model="editConfig.personTracking.enabled" />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.observationMode')">
          <el-switch v-model="editConfig.presence.observationMode" />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.personDetectionMode')">
          <el-select v-model="editConfig.optimization.personDetectMode">
            <el-option :label="t('companies.dialog.personDetectionOnDemand')" value="on_demand" />
            <el-option :label="t('companies.dialog.always')" value="always" />
          </el-select>
        </el-form-item>

        <el-link type="primary" @click="showAdvancedEdit = !showAdvancedEdit" style="margin-bottom: 16px">
          {{ showAdvancedEdit ? t('companies.dialog.hideAdvanced') : t('companies.dialog.showAdvanced') }}
        </el-link>

        <div v-show="showAdvancedEdit">
          <el-collapse>
            <el-collapse-item :title="t('companies.dialog.section.quality')" name="quality">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.minFaceHeight')">
                <el-input-number v-model="editConfig.quality.minFaceHeight" :min="10" :max="200" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.minBlur')">
                <el-input-number v-model="editConfig.quality.minBlurVar" :min="0" :max="500" :step="10" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.minBlur') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.recognition')" name="insightface">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.similarityThreshold')">
                <el-input-number v-model="editConfig.insightface.threshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.similarityThreshold') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.faceTracking')" name="faceTracking">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.minEmbeddings')">
                <el-input-number v-model="editConfig.faceTracking.minEmbeddings" :min="1" :max="10" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.minEmbeddings') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceTrackMaxAgeSeconds')">
                <el-input-number v-model="editConfig.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceTrackMaxAgeSeconds') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.personTracking')" name="personTracking">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.personDetectorConfidence')">
                <el-input-number v-model="editConfig.personTracking.detConf" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetectorConfidence') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personIouThreshold')">
                <el-input-number v-model="editConfig.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personIouThreshold') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personTrackMaxAgeSeconds')">
                <el-input-number v-model="editConfig.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personTrackMaxAgeSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceToPersonIouThreshold')">
                <el-input-number v-model="editConfig.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceToPersonIouThreshold') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.faceToPersonContainmentMin')">
                <el-input-number v-model="editConfig.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.faceToPersonContainmentMin') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.employeeLockStrict')">
                <el-switch v-model="editConfig.personTracking.employeeLockStrict" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.employeeLockStrict') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.presence')" name="presence">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.observationIntervalSeconds')">
                <el-input-number v-model="editConfig.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.observationIntervalSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.inThresholdSeconds')">
                <el-input-number v-model="editConfig.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.inThresholdSeconds') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.outThresholdSeconds')">
                <el-input-number v-model="editConfig.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.outThresholdSeconds') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.optimization')" name="optimization">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.personDetIntervalFrames')">
                <el-input-number v-model="editConfig.optimization.personDetIntervalFrames" :min="1" :max="120" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetIntervalFrames') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.personDetOnNewFace')">
                <el-switch v-model="editConfig.optimization.personDetOnNewFace" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.personDetOnNewFace') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.streaming')" name="streaming">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.streamFps')">
                <el-input-number v-model="editConfig.streaming.streamFps" :min="1" :max="30" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.streamFps') }}</span>
                </template>
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.streamJpegQuality')">
                <el-input-number v-model="editConfig.streaming.streamJpegQuality" :min="30" :max="95" />
                <template #extra>
                  <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.streamJpegQuality') }}</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.actionRecognition')" name="actionRecognition">
              <el-form label-width="280px">
                <el-form-item :label="t('companies.dialog.fields.actionStartThreshold')">
                  <el-input-number v-model="editConfig.actionRecognition.startThreshold" :min="0" :max="1" :step="0.01" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionStartThreshold') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionEndThreshold')">
                  <el-input-number v-model="editConfig.actionRecognition.endThreshold" :min="0" :max="1" :step="0.01" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionEndThreshold') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionGapSeconds')">
                  <el-input-number v-model="editConfig.actionRecognition.gapSeconds" :min="0.1" :max="30" :step="0.1" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionGapSeconds') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMinDurationSeconds')">
                  <el-input-number v-model="editConfig.actionRecognition.minDurationSeconds" :min="0" :max="60" :step="0.1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMaxIntervalSeconds')">
                  <el-input-number v-model="editConfig.actionRecognition.maxIntervalSeconds" :min="0" :max="3600" :step="1" />
                  <template #extra>
                    <span style="font-size: 12px; color: var(--el-text-color-secondary);">{{ t('companies.dialog.hints.actionMaxIntervalSeconds') }}</span>
                  </template>
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionFps')">
                  <el-input-number v-model="editConfig.actionRecognition.fps" :min="1" :max="30" :step="1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionMaxFrames')">
                  <el-input-number v-model="editConfig.actionRecognition.maxFrames" :min="16" :max="512" :step="1" />
                </el-form-item>
                <el-form-item :label="t('companies.dialog.fields.actionDebug')">
                  <el-switch v-model="editConfig.actionRecognition.debug" />
                </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item :title="t('companies.dialog.section.visualization')" name="visualization">
              <el-form label-width="280px">
              <el-form-item :label="t('companies.dialog.fields.drawFaceBoxes')">
                <el-switch v-model="editConfig.visualization.drawFaceBoxes" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.drawPersonBoxes')">
                <el-switch v-model="editConfig.visualization.drawPersonBoxes" />
              </el-form-item>
              <el-form-item :label="t('companies.dialog.fields.drawNames')">
                <el-switch v-model="editConfig.visualization.drawNames" />
              </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="editConfigDialogVisible = false" :disabled="configSaving">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="saveConfig" :loading="configSaving">{{ t('common.actions.save') }}</el-button>
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
</style>
