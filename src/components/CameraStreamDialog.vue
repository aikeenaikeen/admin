<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'
import { resolveBaseUrl } from '@/utils/baseUrl'
import { formatCameraLabel, type CameraDisplayInfo } from '@/utils/camera'

const props = withDefaults(defineProps<{
  modelValue: boolean
  camera: CameraDisplayInfo | null
  recognition?: boolean
}>(), {
  recognition: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()

const loading = ref(false)
const streamUrl = ref('')
const requestToken = ref(0)

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const dialogTitle = computed(() => {
  if (!props.camera) {
    return t('cameras.streamTitleFallback')
  }

  return formatCameraLabel(props.camera) || t('cameras.streamTitleFallback')
})

watch(
  () => [props.modelValue, props.camera?.id, props.recognition] as const,
  async ([isOpen, cameraId]) => {
    if (!isOpen || !cameraId) {
      resetStream()
      return
    }

    await loadStream(cameraId)
  }
)

function withCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}ts=${Date.now()}`
}

function getRecognitionStreamUrl(cameraId: number): string {
  const streamBase = resolveBaseUrl((import.meta as any).env?.VITE_RECOGNITION_STREAM_URL)
  return `${streamBase}/video_feed?cameraId=${cameraId}&ts=${Date.now()}`
}

async function loadStream(cameraId: number) {
  const currentToken = ++requestToken.value
  loading.value = true

  try {
    const nextStreamUrl = props.recognition
      ? getRecognitionStreamUrl(cameraId)
      : withCacheBust((await apiClient.get(`/api/cameras/${cameraId}/stream-url`)).data.mjpegUrl)

    if (currentToken !== requestToken.value) {
      return
    }

    streamUrl.value = nextStreamUrl
  } catch (error) {
    if (currentToken !== requestToken.value) {
      return
    }

    ElMessage.error(t('cameras.streamUrlError'))
    dialogVisible.value = false
  } finally {
    if (currentToken === requestToken.value) {
      loading.value = false
    }
  }
}

function resetStream() {
  requestToken.value += 1
  loading.value = false
  streamUrl.value = ''
}

function handleClose() {
  resetStream()
  dialogVisible.value = false
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="90%"
    center
    @close="handleClose"
  >
    <div v-if="recognition" class="recognition-indicator">
      <el-tag type="success" size="large">
        <el-icon><Monitor /></el-icon>
        {{ t('cameras.recognitionMode') }}
      </el-tag>
    </div>

    <div v-loading="loading" class="stream-container">
      <img
        v-if="streamUrl"
        :src="streamUrl"
        :alt="t('cameras.imageAlt')"
        class="stream-image"
      />
    </div>

    <el-alert
      v-if="recognition"
      :title="t('cameras.recognitionHint')"
      type="info"
      :closable="false"
      class="recognition-hint"
    />
  </el-dialog>
</template>

<style scoped>
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

.recognition-hint {
  margin-top: 16px;
}
</style>
