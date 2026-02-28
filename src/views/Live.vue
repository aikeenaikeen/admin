<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { VideoCamera, Monitor } from '@element-plus/icons-vue'
import apiClient from '@/api/client'
import { resolveBaseUrl } from '@/utils/baseUrl'

const { t } = useI18n()

interface Camera {
  id: number
  name: string
  location: string | null
  isActive: boolean
  recognitionEnabled: boolean
  streamUrl?: string
}

const cameras = ref<Camera[]>([])
const loading = ref(true)
const selectedCamera = ref<number | null>(null)
const streamUrls = ref<Record<number, string>>({})
const showRecognition = ref(false)
const dialogVisible = ref(false)

function withCacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}ts=${Date.now()}`
}

function getRecognitionStreamUrl(cameraId: number): string {
  const streamBase = resolveBaseUrl((import.meta as any).env?.VITE_RECOGNITION_STREAM_URL)
  return `${streamBase}/video_feed?cameraId=${cameraId}&ts=${Date.now()}`
}

onMounted(async () => {
  await loadCameras()
})

async function loadCameras() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/cameras')
    cameras.value = response.data
  } catch (error) {
    console.error('Failed to load cameras', error)
  } finally {
    loading.value = false
  }
}

async function openStream(cameraId: number, withRecognition = false) {
  try {
    showRecognition.value = withRecognition
    
    if (withRecognition) {
      streamUrls.value[cameraId] = getRecognitionStreamUrl(cameraId)
    } else {
      const response = await apiClient.get(`/api/cameras/${cameraId}/stream-url`)
      streamUrls.value[cameraId] = withCacheBust(response.data.mjpegUrl)
    }
    
    selectedCamera.value = cameraId
    dialogVisible.value = true
  } catch (error) {
    console.error('Failed to get stream URL', error)
  }
}

function closeModal() {
  dialogVisible.value = false
  selectedCamera.value = null
  showRecognition.value = false
}

function handleStreamError() {
  if (showRecognition.value) {
    alert(t('live.recognitionServiceError'))
  } else {
    alert(t('live.streamError'))
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <div class="header-content">
          <h1 class="page-title">{{ t('live.title') }}</h1>
        </div>
      </template>
      <template #extra>
        <el-button @click="loadCameras" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else class="cameras-grid">
      <el-card
        v-for="camera in cameras"
        :key="camera.id"
        class="camera-card"
        shadow="hover"
      >
        <template #header>
          <div class="card-header">
            <div class="camera-info">
              <h3 class="camera-name">{{ camera.name }}</h3>
              <p class="camera-location">{{ camera.location || t('common.misc.none') }}</p>
            </div>
            <el-tag :type="camera.isActive ? 'success' : 'danger'" size="small">
              {{ camera.isActive ? t('live.active') : t('live.inactive') }}
            </el-tag>
          </div>
        </template>

        <div class="button-group">
          <el-button
            type="primary"
            :icon="VideoCamera"
            :disabled="!camera.isActive"
            @click="openStream(camera.id, false)"
            style="flex: 1"
          >
            {{ t('live.video') }}
          </el-button>
          <el-button
            type="success"
            :icon="Monitor"
            :disabled="!camera.isActive || !camera.recognitionEnabled"
            @click="openStream(camera.id, true)"
            style="flex: 1"
          >
            {{ t('live.ai') }}
          </el-button>
        </div>
      </el-card>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="cameras.find(c => c.id === selectedCamera)?.name || t('live.streamTitleFallback')"
      width="90%"
      @close="closeModal"
      center
    >
      <div v-if="showRecognition" class="recognition-indicator">
        <el-tag type="success" size="large">
          <el-icon><Monitor /></el-icon>
          {{ t('live.recognitionMode') }}
        </el-tag>
      </div>
      
      <div class="stream-container">
        <img
          v-if="selectedCamera && streamUrls[selectedCamera]"
          :src="streamUrls[selectedCamera]"
          :alt="t('live.imageAlt')"
          class="stream-image"
          @error="handleStreamError"
        />
      </div>
      
      <el-alert
        v-if="showRecognition"
        :title="t('live.recognitionHint')"
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

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.loading-container {
  padding: 24px;
}

.cameras-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .cameras-grid {
    grid-template-columns: 1fr;
  }
  
  .page-container {
    padding: 16px;
  }
}

.camera-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.camera-info {
  flex: 1;
  min-width: 0;
}

.camera-name {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.camera-location {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.button-group {
  display: flex;
  gap: 8px;
}

@media (max-width: 480px) {
  .button-group {
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
