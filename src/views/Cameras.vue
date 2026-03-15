<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Connection, Delete, VideoCamera, Monitor } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'
import { resolveBaseUrl } from '@/utils/baseUrl'

const { t } = useI18n()

interface Camera {
  id: number
  name: string
  location: string | null
  ip: string
  rtspPort: number
  username: string
  rtspPath: string
  isActive: boolean
  recognitionEnabled: boolean
}

const cameras = ref<Camera[]>([])
const loading = ref(true)
const showForm = ref(false)
const isEditing = ref(false)
const dialogVisible = ref(false)
const selectedCamera = ref<number | null>(null)
const streamUrl = ref('')
const showRecognition = ref(false)
const testingCamera = ref<number | null>(null)

function withCacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}ts=${Date.now()}`
}

function getRecognitionStreamUrl(cameraId: number): string {
  const streamBase = resolveBaseUrl((import.meta as any).env?.VITE_RECOGNITION_STREAM_URL)
  return `${streamBase}/video_feed?cameraId=${cameraId}&ts=${Date.now()}`
}

const form = ref({
  name: '',
  location: '',
  ip: '',
  rtspPort: 554,
  username: 'admin',
  password: '',
  rtspPath: '',
  recognitionEnabled: true,
})

const editingCameraId = ref<number | null>(null)

onMounted(async () => {
  await loadCameras()
})

async function loadCameras() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/cameras')
    cameras.value = response.data
  } catch (error) {
    ElMessage.error(t('cameras.loadError'))
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    const payload: Record<string, any> = {
      name: form.value.name,
      location: form.value.location,
      ip: form.value.ip,
      rtspPort: form.value.rtspPort,
      username: form.value.username,
      rtspPath: form.value.rtspPath,
      recognitionEnabled: form.value.recognitionEnabled,
    }

    if (!editingCameraId.value) {
      // Для создания пароль обязателен
      if (!form.value.password) {
        ElMessage.error(t('cameras.passwordRequired'))
        return
      }
      payload.password = form.value.password
      await apiClient.post('/api/cameras', payload)
      ElMessage.success(t('cameras.created'))
    } else {
      // Для редактирования пароль опционален (отправляем только если заполнен)
      if (form.value.password) {
        payload.password = form.value.password
      }
      await apiClient.put(`/api/cameras/${editingCameraId.value}`, payload)
      ElMessage.success(t('cameras.updated'))
    }

    resetFormFields()
    showForm.value = false
    await loadCameras()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('cameras.saveError'))
  }
}

async function toggleCamera(id: number, isActive: boolean) {
  try {
    await apiClient.put(`/api/cameras/${id}`, { isActive: !isActive })
    ElMessage.success(isActive ? t('cameras.toggledOff') : t('cameras.toggledOn'))
    await loadCameras()
  } catch (error) {
    ElMessage.error(t('cameras.toggleError'))
  }
}

async function deleteCamera(id: number) {
  try {
    await ElMessageBox.confirm(t('cameras.deleteConfirmText'), t('cameras.deleteConfirmTitle'), {
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      type: 'warning',
    })
    
    await apiClient.delete(`/api/cameras/${id}`)
    ElMessage.success(t('cameras.deleteSuccess'))
    await loadCameras()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('cameras.deleteError'))
    }
  }
}

async function viewStream(id: number, withRecognition = false) {
  try {
    showRecognition.value = withRecognition
    
    if (withRecognition) {
      streamUrl.value = getRecognitionStreamUrl(id)
    } else {
      const response = await apiClient.get(`/api/cameras/${id}/stream-url`)
      streamUrl.value = withCacheBust(response.data.mjpegUrl)
    }
    
    selectedCamera.value = id
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error(t('cameras.streamUrlError'))
  }
}

function closeStream() {
  dialogVisible.value = false
  selectedCamera.value = null
  streamUrl.value = ''
  showRecognition.value = false
}

function startCreate() {
  resetFormFields()
  showForm.value = true
}

function startEdit(camera: Camera) {
  showForm.value = true
  isEditing.value = true
  editingCameraId.value = camera.id
  form.value = {
    name: camera.name,
    location: camera.location || '',
    ip: camera.ip,
    rtspPort: camera.rtspPort,
    username: camera.username,
    password: '',
    rtspPath: camera.rtspPath,
    recognitionEnabled: camera.recognitionEnabled,
  }
}

function resetFormFields() {
  form.value = {
    name: '',
    location: '',
    ip: '',
    rtspPort: 554,
    username: 'admin',
    password: '',
    rtspPath: '',
    recognitionEnabled: true,
  }
  isEditing.value = false
  editingCameraId.value = null
}

function cancelForm() {
  resetFormFields()
  showForm.value = false
}

const TEST_TIMEOUT_MS = 15000

async function testConnection(id: number) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

  try {
    testingCamera.value = id
    const response = await apiClient.get(`/api/cameras/${id}/rtsp-preview`, {
      signal: controller.signal,
    })
    ElMessage.success(
      t('cameras.rtspOk', {
        latency: response.data.latencyMs ?? t('common.misc.notAvailable'),
      })
    )
  } catch (error: any) {
    let message =
      error.response?.data?.error?.error ||
      error.response?.data?.error ||
      t('cameras.streamTestError')

    if (controller.signal.aborted && (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError')) {
      message = t('cameras.streamTestTimeout')
    }

    ElMessage.error(message)
  } finally {
    window.clearTimeout(timeoutId)
    testingCamera.value = null
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('cameras.title') }}</h1>
      </template>
      <template #extra>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showForm ? cancelForm() : startCreate()"
        >
          {{ showForm ? t('common.actions.cancel') : t('cameras.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card v-if="showForm" class="form-card" shadow="never">
      <template #header>
        <h2 style="margin: 0; font-size: 18px;">{{ isEditing ? t('cameras.editTitle') : t('cameras.addTitle') }}</h2>
      </template>
      
      <el-form :model="form" label-width="140px" label-position="left">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.name')" required>
              <el-input v-model="form.name" :placeholder="t('cameras.form.namePlaceholder')" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.location')">
              <el-input v-model="form.location" :placeholder="t('cameras.form.locationPlaceholder')" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.ipAddress')" required>
              <el-input v-model="form.ip" :placeholder="t('cameras.form.ipPlaceholder')" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.rtspPort')">
              <el-input-number v-model="form.rtspPort" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.username')" required>
              <el-input v-model="form.username" :placeholder="t('cameras.form.usernamePlaceholder')" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.password')" required>
              <el-input v-model="form.password" type="password" show-password />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.rtspPath')">
              <el-input v-model="form.rtspPath" :placeholder="t('cameras.form.rtspPathPlaceholder')" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('cameras.form.recognition')">
              <el-switch v-model="form.recognitionEnabled" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit">{{ isEditing ? t('common.actions.save') : t('common.actions.create') }}</el-button>
          <el-button @click="cancelForm">{{ t('common.actions.cancel') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="cameras" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="60" />
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="150" />
        <el-table-column prop="location" :label="t('common.labels.location')" min-width="120">
          <template #default="{ row }">
            {{ row.location || t('common.misc.none') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('cameras.table.ipAddress')" min-width="150">
          <template #default="{ row }">
            {{ row.ip }}:{{ row.rtspPort }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.labels.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
              {{ row.isActive ? t('cameras.table.active') : t('cameras.table.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('cameras.table.ai')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.recognitionEnabled ? 'success' : 'info'" size="small">
              {{ row.recognitionEnabled ? t('cameras.table.enabled') : t('cameras.table.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.labels.actions')" width="530" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="primary"
                :icon="VideoCamera"
                :disabled="!row.isActive"
                @click="viewStream(row.id, false)"
              >
                {{ t('cameras.table.video') }}
              </el-button>
              <el-button
                size="small"
                type="success"
                :icon="Monitor"
                :disabled="!row.isActive || !row.recognitionEnabled"
                @click="viewStream(row.id, true)"
              >
                {{ t('cameras.table.ai') }}
              </el-button>
              <el-button
                size="small"
                :icon="Connection"
                :loading="testingCamera === row.id"
                @click="testConnection(row.id)"
              >
                {{ t('common.actions.test') }}
              </el-button>
              <el-button
                size="small"
                @click="startEdit(row)"
              >
                {{ t('common.actions.edit') }}
              </el-button>
              <el-button
                size="small"
                @click="toggleCamera(row.id, row.isActive)"
              >
                {{ row.isActive ? t('common.actions.disable') : t('common.actions.enable') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteCamera(row.id)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="cameras.find(c => c.id === selectedCamera)?.name || t('cameras.streamTitleFallback')"
      width="90%"
      @close="closeStream"
      center
    >
      <div v-if="showRecognition" class="recognition-indicator">
        <el-tag type="success" size="large">
          <el-icon><Monitor /></el-icon>
          {{ t('cameras.recognitionMode') }}
        </el-tag>
      </div>
      
      <div class="stream-container">
        <img
          v-if="streamUrl"
          :src="streamUrl"
          :alt="t('cameras.imageAlt')"
          class="stream-image"
        />
      </div>
      
      <el-alert
        v-if="showRecognition"
        :title="t('cameras.recognitionHint')"
        type="info"
        :closable="false"
        style="margin-top: 16px"
      />
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

.form-card {
  margin-bottom: 24px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
  
  .action-buttons {
    flex-direction: column;
  }
}

.recognition-indicator {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.stream-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.stream-image {
  max-width: 100%;
  max-height: 70vh;
  display: block;
  border-radius: 8px;
}
</style>
