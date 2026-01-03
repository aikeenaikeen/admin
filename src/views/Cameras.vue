<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Connection, Delete, VideoCamera, Monitor } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'

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

const form = ref({
  name: 'children',
  location: '1',
  ip: '188.0.191.153',
  rtspPort: 8554,
  username: 'aikeen',
  password: 'aikeen',
  rtspPath: '/user=admin_password=admin_channel=1_stream=0',
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
    ElMessage.error('Не удалось загрузить камеры')
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
        ElMessage.error('Укажите пароль для камеры')
        return
      }
      payload.password = form.value.password
      await apiClient.post('/api/cameras', payload)
      ElMessage.success('Камера успешно добавлена')
    } else {
      // Для редактирования пароль опционален (отправляем только если заполнен)
      if (form.value.password) {
        payload.password = form.value.password
      }
      await apiClient.put(`/api/cameras/${editingCameraId.value}`, payload)
      ElMessage.success('Камера обновлена')
    }

    resetFormFields()
    showForm.value = false
    await loadCameras()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось создать камеру')
  }
}

async function toggleCamera(id: number, isActive: boolean) {
  try {
    await apiClient.put(`/api/cameras/${id}`, { isActive: !isActive })
    ElMessage.success(isActive ? 'Камера отключена' : 'Камера включена')
    await loadCameras()
  } catch (error) {
    ElMessage.error('Не удалось обновить камеру')
  }
}

async function deleteCamera(id: number) {
  try {
    await ElMessageBox.confirm('Вы уверены, что хотите удалить эту камеру?', 'Подтверждение', {
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
      type: 'warning',
    })
    
    await apiClient.delete(`/api/cameras/${id}`)
    ElMessage.success('Камера удалена')
    await loadCameras()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('Не удалось удалить камеру')
    }
  }
}

async function viewStream(id: number, withRecognition = false) {
  try {
    showRecognition.value = withRecognition
    
    if (withRecognition) {
      streamUrl.value = `http://localhost:${5000 + id}/video_feed?ts=${Date.now()}`
    } else {
      const response = await apiClient.get(`/api/cameras/${id}/stream-url`)
      streamUrl.value = `${response.data.mjpegUrl}?ts=${Date.now()}`
    }
    
    selectedCamera.value = id
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error('Не удалось получить stream URL')
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
    name: 'children',
    location: '1',
    ip: '188.0.191.153',
    rtspPort: 8554,
    username: 'aikeen',
    password: 'aikeen',
    rtspPath: '/user=admin_password=admin_channel=1_stream=0',
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
    ElMessage.success(`RTSP OK (latency ${response.data.latencyMs ?? 'n/a'} ms)`)
  } catch (error: any) {
    let message =
      error.response?.data?.error?.error ||
      error.response?.data?.error ||
      'Не удалось проверить поток'

    if (controller.signal.aborted && (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError')) {
      message = 'Проверка потока прервана по тайм-ауту (15 секунд)'
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
        <h1 class="page-title">Камеры</h1>
      </template>
      <template #extra>
        <el-button
          type="primary"
          :icon="Plus"
          @click="showForm ? cancelForm() : startCreate()"
        >
          {{ showForm ? 'Отмена' : 'Добавить камеру' }}
        </el-button>
      </template>
    </el-page-header>

    <el-card v-if="showForm" class="form-card" shadow="never">
      <template #header>
        <h2 style="margin: 0; font-size: 18px;">{{ isEditing ? 'Редактировать камеру' : 'Добавить камеру' }}</h2>
      </template>
      
      <el-form :model="form" label-width="140px" label-position="left">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="Название" required>
              <el-input v-model="form.name" placeholder="Например, Вход в офис" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item label="Расположение">
              <el-input v-model="form.location" placeholder="Например, 1 этаж" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="IP адрес" required>
              <el-input v-model="form.ip" placeholder="192.168.1.10" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item label="RTSP порт">
              <el-input-number v-model="form.rtspPort" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="Имя пользователя" required>
              <el-input v-model="form.username" placeholder="admin" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item label="Пароль" required>
              <el-input v-model="form.password" type="password" show-password />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="RTSP путь">
              <el-input v-model="form.rtspPath" placeholder="/ISAPI/Streaming/Channels/101" />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="12">
            <el-form-item label="Распознавание">
              <el-switch v-model="form.recognitionEnabled" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit">{{ isEditing ? 'Сохранить' : 'Создать' }}</el-button>
          <el-button @click="cancelForm">Отмена</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="cameras" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="Название" min-width="150" />
        <el-table-column prop="location" label="Расположение" min-width="120">
          <template #default="{ row }">
            {{ row.location || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="IP" min-width="150">
          <template #default="{ row }">
            {{ row.ip }}:{{ row.rtspPort }}
          </template>
        </el-table-column>
        <el-table-column label="Статус" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
              {{ row.isActive ? 'Активна' : 'Неактивна' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI" width="100">
          <template #default="{ row }">
            <el-tag :type="row.recognitionEnabled ? 'success' : 'info'" size="small">
              {{ row.recognitionEnabled ? 'Вкл' : 'Выкл' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Действия" width="530" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="primary"
                :icon="VideoCamera"
                :disabled="!row.isActive"
                @click="viewStream(row.id, false)"
              >
                Видео
              </el-button>
              <el-button
                size="small"
                type="success"
                :icon="Monitor"
                :disabled="!row.isActive || !row.recognitionEnabled"
                @click="viewStream(row.id, true)"
              >
                AI
              </el-button>
              <el-button
                size="small"
                :icon="Connection"
                :loading="testingCamera === row.id"
                @click="testConnection(row.id)"
              >
                Тест
              </el-button>
              <el-button
                size="small"
                @click="startEdit(row)"
              >
                Редактировать
              </el-button>
              <el-button
                size="small"
                @click="toggleCamera(row.id, row.isActive)"
              >
                {{ row.isActive ? 'Выкл' : 'Вкл' }}
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
      :title="cameras.find(c => c.id === selectedCamera)?.name || 'Камера'"
      width="90%"
      @close="closeStream"
      center
    >
      <div v-if="showRecognition" class="recognition-indicator">
        <el-tag type="success" size="large">
          <el-icon><Monitor /></el-icon>
          Режим распознавания
        </el-tag>
      </div>
      
      <div class="stream-container">
        <img
          v-if="streamUrl"
          :src="streamUrl"
          alt="Camera stream"
          class="stream-image"
        />
      </div>
      
      <el-alert
        v-if="showRecognition"
        title="Зеленые рамки обозначают распознанные лица"
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
  color: #303133;
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
  background: #f5f7fa;
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
