<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'

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
    ElMessage.error('Не удалось загрузить компании')
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    await apiClient.post('/api/companies', form.value)
    ElMessage.success('Компания успешно создана')
    dialogVisible.value = false
    form.value = {
      name: '',
      slug: '',
      recognitionConfig: getDefaultConfig(),
    }
    await loadCompanies()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось создать компанию')
  }
}

async function toggleCompany(id: number, isActive: boolean) {
  try {
    await apiClient.put(`/api/companies/${id}`, { isActive: !isActive })
    ElMessage.success(isActive ? 'Компания деактивирована' : 'Компания активирована')
    await loadCompanies()
  } catch (error) {
    ElMessage.error('Не удалось обновить компанию')
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
    ElMessage.error(error.response?.data?.error || 'Не удалось загрузить настройки компании')
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
    ElMessage.success('Настройки распознавания сохранены')
    editConfigDialogVisible.value = false
    editingCompanyId.value = null
    editingCompanyName.value = ''
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось сохранить настройки')
  } finally {
    configSaving.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">Компании</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="dialogVisible = true">
          Добавить компанию
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="companies" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        
        <el-table-column prop="name" label="Название" min-width="200" />
        
        <el-table-column label="Slug" min-width="180">
          <template #default="{ row }">
            <el-tag type="info">{{ row.slug }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="Статус" width="120">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'">
              {{ row.isActive ? 'Активна' : 'Неактивна' }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="Создана" width="150">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleDateString('ru-RU') }}
          </template>
        </el-table-column>
        
        <el-table-column label="Действия" width="420" fixed="right">
          <template #default="{ row }">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <el-button
                size="small"
                type="primary"
                @click="openEditConfig(row)"
              >
                Настроить распознавание
              </el-button>
              <el-button
                size="small"
                :type="row.isActive ? 'warning' : 'success'"
                @click="toggleCompany(row.id, row.isActive)"
              >
                {{ row.isActive ? 'Деактивировать' : 'Активировать' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="Добавить компанию"
      width="800px"
    >
      <el-form :model="form" label-width="200px">
        <el-form-item label="Название" required>
          <el-input
            v-model="form.name"
            placeholder="Название компании"
            @input="generateSlug"
          />
        </el-form-item>

        <el-form-item label="Slug" required>
          <el-input
            v-model="form.slug"
            placeholder="company-slug"
          >
            <template #prepend>/</template>
          </el-input>
          <template #extra>
            <span style="font-size: 12px; color: #909399;">
              Только строчные буквы, цифры и дефисы
            </span>
          </template>
        </el-form-item>

        <el-divider content-position="left">Настройки распознавания</el-divider>

        <el-form-item label="Трекинг людей">
          <el-switch v-model="form.recognitionConfig.personTracking.enabled" />
        </el-form-item>

        <el-form-item label="Режим наблюдений">
          <el-switch v-model="form.recognitionConfig.presence.observationMode" />
        </el-form-item>

        <el-form-item label="Режим детекции людей">
          <el-select v-model="form.recognitionConfig.optimization.personDetectMode">
            <el-option label="По требованию (рекомендуется)" value="on_demand" />
            <el-option label="Всегда" value="always" />
          </el-select>
        </el-form-item>

        <el-link type="primary" @click="showAdvanced = !showAdvanced" style="margin-bottom: 16px">
          {{ showAdvanced ? 'Скрыть' : 'Показать' }} расширенные настройки
        </el-link>

        <div v-show="showAdvanced">
          <el-collapse>
            <el-collapse-item title="Качество" name="quality">
              <el-form label-width="280px">
              <el-form-item label="Мин. высота лица (px)">
                <el-input-number v-model="form.recognitionConfig.quality.minFaceHeight" :min="10" :max="200" />
              </el-form-item>
              <el-form-item label="Мин. резкость">
                <el-input-number v-model="form.recognitionConfig.quality.minBlurVar" :min="0" :max="500" :step="10" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Дисперсия Лапласиана (выше = требуется более чёткое изображение)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Распознавание (InsightFace)" name="insightface">
              <el-form label-width="280px">
              <el-form-item label="Порог сходства (0..1)">
                <el-input-number v-model="form.recognitionConfig.insightface.threshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Ниже = строже (меньше ложных срабатываний)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Трекинг лиц" name="faceTracking">
              <el-form label-width="280px">
              <el-form-item label="Мин. эмбеддингов">
                <el-input-number v-model="form.recognitionConfig.faceTracking.minEmbeddings" :min="1" :max="10" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько кадров накопить перед распознаванием</span>
                </template>
              </el-form-item>
              <el-form-item label="Время жизни трека (сек)">
                <el-input-number v-model="form.recognitionConfig.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько секунд трек лица живёт без обновлений</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Трекинг людей (расширенные)" name="personTracking">
              <el-form label-width="280px">
              <el-form-item label="Порог уверенности детектора (0..1)">
                <el-input-number v-model="form.recognitionConfig.personTracking.detConf" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Минимальная уверенность YOLO для детекции человека</span>
                </template>
              </el-form-item>
              <el-form-item label="IoU для матчинга треков (0..1)">
                <el-input-number v-model="form.recognitionConfig.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Пересечение bbox для связывания с треком</span>
                </template>
              </el-form-item>
              <el-form-item label="Время жизни person-трека (сек)">
                <el-input-number v-model="form.recognitionConfig.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько секунд трек человека живёт без обновлений</span>
                </template>
              </el-form-item>
              <el-form-item label="IoU лицо→человек (0..1)">
                <el-input-number v-model="form.recognitionConfig.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Минимальное пересечение для привязки лица к человеку</span>
                </template>
              </el-form-item>
              <el-form-item label="Вложенность лица в bbox (0..1)">
                <el-input-number v-model="form.recognitionConfig.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Какая часть лица должна быть внутри bbox человека</span>
                </template>
              </el-form-item>
              <el-form-item label="Строгая фиксация трека">
                <el-switch v-model="form.recognitionConfig.personTracking.employeeLockStrict" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Запретить переназначение трека на другого сотрудника</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Присутствие/Наблюдения" name="presence">
              <el-form label-width="280px">
              <el-form-item label="Интервал наблюдений (сек)">
                <el-input-number v-model="form.recognitionConfig.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Как часто отправлять heartbeat (режим наблюдений)</span>
                </template>
              </el-form-item>
              <el-form-item label="Порог IN (сек, legacy)">
                <el-input-number v-model="form.recognitionConfig.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Секунд устойчивого присутствия до события IN (если режим наблюдений выключен)</span>
                </template>
              </el-form-item>
              <el-form-item label="Порог OUT (сек, legacy)">
                <el-input-number v-model="form.recognitionConfig.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Секунд отсутствия до события OUT (если режим наблюдений выключен)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Оптимизация" name="optimization">
              <el-form label-width="280px">
              <el-form-item label="Интервал детекции YOLO (кадры)">
                <el-input-number v-model="form.recognitionConfig.optimization.personDetIntervalFrames" :min="1" :max="120" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Через сколько кадров запускать YOLO для активных треков (режим "по требованию")</span>
                </template>
              </el-form-item>
              <el-form-item label="YOLO при новом лице">
                <el-switch v-model="form.recognitionConfig.optimization.personDetOnNewFace" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Запускать YOLO сразу при распознавании нового лица</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Видеопоток" name="streaming">
              <el-form label-width="280px">
              <el-form-item label="FPS потока">
                <el-input-number v-model="form.recognitionConfig.streaming.streamFps" :min="1" :max="30" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Кадров в секунду в MJPEG-потоке для UI</span>
                </template>
              </el-form-item>
              <el-form-item label="Качество JPEG (30..95)">
                <el-input-number v-model="form.recognitionConfig.streaming.streamJpegQuality" :min="30" :max="95" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Качество сжатия JPEG (выше = лучше, но больше трафик)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Визуализация" name="visualization">
              <el-form label-width="280px">
              <el-form-item label="Рисовать рамки лиц">
                <el-switch v-model="form.recognitionConfig.visualization.drawFaceBoxes" />
              </el-form-item>
              <el-form-item label="Рисовать рамки людей">
                <el-switch v-model="form.recognitionConfig.visualization.drawPersonBoxes" />
              </el-form-item>
              <el-form-item label="Показывать имена/ID">
                <el-switch v-model="form.recognitionConfig.visualization.drawNames" />
              </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="handleSubmit">Создать</el-button>
      </template>
    </el-dialog>

    <!-- Диалог редактирования recognitionConfig -->
    <el-dialog
      v-model="editConfigDialogVisible"
      :title="`Настройки распознавания — ${editingCompanyName}`"
      width="800px"
      v-loading="configLoading"
    >
      <el-form :model="editConfig" label-width="200px">
        <el-form-item label="Трекинг людей">
          <el-switch v-model="editConfig.personTracking.enabled" />
        </el-form-item>

        <el-form-item label="Режим наблюдений">
          <el-switch v-model="editConfig.presence.observationMode" />
        </el-form-item>

        <el-form-item label="Режим детекции людей">
          <el-select v-model="editConfig.optimization.personDetectMode">
            <el-option label="По требованию (рекомендуется)" value="on_demand" />
            <el-option label="Всегда" value="always" />
          </el-select>
        </el-form-item>

        <el-link type="primary" @click="showAdvancedEdit = !showAdvancedEdit" style="margin-bottom: 16px">
          {{ showAdvancedEdit ? 'Скрыть' : 'Показать' }} расширенные настройки
        </el-link>

        <div v-show="showAdvancedEdit">
          <el-collapse>
            <el-collapse-item title="Качество" name="quality">
              <el-form label-width="280px">
              <el-form-item label="Мин. высота лица (px)">
                <el-input-number v-model="editConfig.quality.minFaceHeight" :min="10" :max="200" />
              </el-form-item>
              <el-form-item label="Мин. резкость">
                <el-input-number v-model="editConfig.quality.minBlurVar" :min="0" :max="500" :step="10" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Дисперсия Лапласиана (выше = требуется более чёткое изображение)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Распознавание (InsightFace)" name="insightface">
              <el-form label-width="280px">
              <el-form-item label="Порог сходства (0..1)">
                <el-input-number v-model="editConfig.insightface.threshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Ниже = строже (меньше ложных срабатываний)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Трекинг лиц" name="faceTracking">
              <el-form label-width="280px">
              <el-form-item label="Мин. эмбеддингов">
                <el-input-number v-model="editConfig.faceTracking.minEmbeddings" :min="1" :max="10" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько кадров накопить перед распознаванием</span>
                </template>
              </el-form-item>
              <el-form-item label="Время жизни трека (сек)">
                <el-input-number v-model="editConfig.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько секунд трек лица живёт без обновлений</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Трекинг людей (расширенные)" name="personTracking">
              <el-form label-width="280px">
              <el-form-item label="Порог уверенности детектора (0..1)">
                <el-input-number v-model="editConfig.personTracking.detConf" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Минимальная уверенность YOLO для детекции человека</span>
                </template>
              </el-form-item>
              <el-form-item label="IoU для матчинга треков (0..1)">
                <el-input-number v-model="editConfig.personTracking.iouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Пересечение bbox для связывания с треком</span>
                </template>
              </el-form-item>
              <el-form-item label="Время жизни person-трека (сек)">
                <el-input-number v-model="editConfig.personTracking.trackMaxAgeSeconds" :min="0.5" :max="30" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Сколько секунд трек человека живёт без обновлений</span>
                </template>
              </el-form-item>
              <el-form-item label="IoU лицо→человек (0..1)">
                <el-input-number v-model="editConfig.personTracking.faceToPersonIouThreshold" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Минимальное пересечение для привязки лица к человеку</span>
                </template>
              </el-form-item>
              <el-form-item label="Вложенность лица в bbox (0..1)">
                <el-input-number v-model="editConfig.personTracking.faceToPersonContainmentMin" :min="0" :max="1" :step="0.05" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Какая часть лица должна быть внутри bbox человека</span>
                </template>
              </el-form-item>
              <el-form-item label="Строгая фиксация трека">
                <el-switch v-model="editConfig.personTracking.employeeLockStrict" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Запретить переназначение трека на другого сотрудника</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Присутствие/Наблюдения" name="presence">
              <el-form label-width="280px">
              <el-form-item label="Интервал наблюдений (сек)">
                <el-input-number v-model="editConfig.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Как часто отправлять heartbeat (режим наблюдений)</span>
                </template>
              </el-form-item>
              <el-form-item label="Порог IN (сек, legacy)">
                <el-input-number v-model="editConfig.presence.inThresholdSeconds" :min="0" :max="60" :step="0.5" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Секунд устойчивого присутствия до события IN (если режим наблюдений выключен)</span>
                </template>
              </el-form-item>
              <el-form-item label="Порог OUT (сек, legacy)">
                <el-input-number v-model="editConfig.presence.outThresholdSeconds" :min="0" :max="300" :step="1" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Секунд отсутствия до события OUT (если режим наблюдений выключен)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Оптимизация" name="optimization">
              <el-form label-width="280px">
              <el-form-item label="Интервал детекции YOLO (кадры)">
                <el-input-number v-model="editConfig.optimization.personDetIntervalFrames" :min="1" :max="120" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Через сколько кадров запускать YOLO для активных треков (режим "по требованию")</span>
                </template>
              </el-form-item>
              <el-form-item label="YOLO при новом лице">
                <el-switch v-model="editConfig.optimization.personDetOnNewFace" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Запускать YOLO сразу при распознавании нового лица</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Видеопоток" name="streaming">
              <el-form label-width="280px">
              <el-form-item label="FPS потока">
                <el-input-number v-model="editConfig.streaming.streamFps" :min="1" :max="30" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Кадров в секунду в MJPEG-потоке для UI</span>
                </template>
              </el-form-item>
              <el-form-item label="Качество JPEG (30..95)">
                <el-input-number v-model="editConfig.streaming.streamJpegQuality" :min="30" :max="95" />
                <template #extra>
                  <span style="font-size: 12px; color: #909399;">Качество сжатия JPEG (выше = лучше, но больше трафик)</span>
                </template>
              </el-form-item>
              </el-form>
            </el-collapse-item>

            <el-collapse-item title="Визуализация" name="visualization">
              <el-form label-width="280px">
              <el-form-item label="Рисовать рамки лиц">
                <el-switch v-model="editConfig.visualization.drawFaceBoxes" />
              </el-form-item>
              <el-form-item label="Рисовать рамки людей">
                <el-switch v-model="editConfig.visualization.drawPersonBoxes" />
              </el-form-item>
              <el-form-item label="Показывать имена/ID">
                <el-switch v-model="editConfig.visualization.drawNames" />
              </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="editConfigDialogVisible = false" :disabled="configSaving">Отмена</el-button>
        <el-button type="primary" @click="saveConfig" :loading="configSaving">Сохранить</el-button>
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
  color: #303133;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}
</style>
