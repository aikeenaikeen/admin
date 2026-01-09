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

const form = ref({
  name: '',
  slug: '',
  recognitionConfig: {
    quality: { minFaceHeight: 20, minBlurVar: 50 },
    insightface: { threshold: 0.2 },
    faceTracking: { minEmbeddings: 2, trackMaxAgeSeconds: 2.0 },
    personTracking: { enabled: true },
    presence: { observationMode: true, observationIntervalSeconds: 2.0 },
    optimization: { 
      personDetectMode: 'on_demand' as const,
      personDetIntervalFrames: 10,
      personDetOnNewFace: true,
    },
    streaming: { streamFps: 15, streamJpegQuality: 85 },
  },
})

const showAdvanced = ref(false)

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
      recognitionConfig: {
        quality: { minFaceHeight: 20, minBlurVar: 50 },
        insightface: { threshold: 0.2 },
        faceTracking: { minEmbeddings: 2, trackMaxAgeSeconds: 2.0 },
        personTracking: { enabled: true },
        presence: { observationMode: true, observationIntervalSeconds: 2.0 },
        optimization: { 
          personDetectMode: 'on_demand' as const,
          personDetIntervalFrames: 10,
          personDetOnNewFace: true,
        },
        streaming: { streamFps: 15, streamJpegQuality: 85 },
      },
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
        
        <el-table-column label="Действия" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              :type="row.isActive ? 'warning' : 'success'"
              @click="toggleCompany(row.id, row.isActive)"
            >
              {{ row.isActive ? 'Деактивировать' : 'Активировать' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="Добавить компанию"
      width="500px"
    >
      <el-form :model="form" label-width="100px">
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

        <el-form-item label="Person Tracking">
          <el-switch v-model="form.recognitionConfig.personTracking.enabled" />
        </el-form-item>

        <el-form-item label="Observation Mode">
          <el-switch v-model="form.recognitionConfig.presence.observationMode" />
        </el-form-item>

        <el-form-item label="Режим YOLO">
          <el-select v-model="form.recognitionConfig.optimization.personDetectMode">
            <el-option label="On Demand (рекомендуется)" value="on_demand" />
            <el-option label="Always" value="always" />
          </el-select>
        </el-form-item>

        <el-link type="primary" @click="showAdvanced = !showAdvanced" style="margin-bottom: 16px">
          {{ showAdvanced ? 'Скрыть' : 'Показать' }} расширенные настройки
        </el-link>

        <div v-show="showAdvanced">
          <el-collapse>
            <el-collapse-item title="Качество" name="quality">
              <el-form-item label="Min Face Height">
                <el-input-number v-model="form.recognitionConfig.quality.minFaceHeight" :min="10" :max="200" />
              </el-form-item>
              <el-form-item label="Min Blur Var">
                <el-input-number v-model="form.recognitionConfig.quality.minBlurVar" :min="0" :max="500" :step="10" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="InsightFace" name="insightface">
              <el-form-item label="Threshold">
                <el-input-number v-model="form.recognitionConfig.insightface.threshold" :min="0" :max="1" :step="0.05" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="Face Tracking" name="faceTracking">
              <el-form-item label="Min Embeddings">
                <el-input-number v-model="form.recognitionConfig.faceTracking.minEmbeddings" :min="1" :max="10" />
              </el-form-item>
              <el-form-item label="Track Max Age (сек)">
                <el-input-number v-model="form.recognitionConfig.faceTracking.trackMaxAgeSeconds" :min="0.5" :max="10" :step="0.5" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="Presence/Observations" name="presence">
              <el-form-item label="Observation Interval (сек)">
                <el-input-number v-model="form.recognitionConfig.presence.observationIntervalSeconds" :min="0.2" :max="10" :step="0.5" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="Optimization" name="optimization">
              <el-form-item label="YOLO Interval (кадры)">
                <el-input-number v-model="form.recognitionConfig.optimization.personDetIntervalFrames" :min="1" :max="120" />
              </el-form-item>
              <el-form-item label="YOLO on New Face">
                <el-switch v-model="form.recognitionConfig.optimization.personDetOnNewFace" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="Streaming" name="streaming">
              <el-form-item label="Stream FPS">
                <el-input-number v-model="form.recognitionConfig.streaming.streamFps" :min="1" :max="30" />
              </el-form-item>
              <el-form-item label="JPEG Quality">
                <el-input-number v-model="form.recognitionConfig.streaming.streamJpegQuality" :min="30" :max="95" />
              </el-form-item>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="handleSubmit">Создать</el-button>
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
