<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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

// Прозрачный GIF 1x1. Подставляется в <img> перед его удалением: смена src
// заставляет браузер оборвать MJPEG-соединение. Если просто убрать элемент
// из DOM, отсоединённая картинка может продолжать тянуть поток.
const BLANK_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

const loading = ref(false)
const streamUrl = ref('')
const requestToken = ref(0)
const streamImage = ref<HTMLImageElement | null>(null)

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

// Подписанный адрес /video_feed?cameraId=..&exp=..&sig=.. выдаёт backend
// (как и mjpegUrl), ссылка живёт несколько минут: при каждом открытии берём новую.
function getRecognitionStreamUrl(recognitionUrl: string): string {
  const streamBase = resolveBaseUrl((import.meta as any).env?.VITE_RECOGNITION_STREAM_URL)
  return withCacheBust(/^https?:\/\//.test(recognitionUrl) ? recognitionUrl : `${streamBase}${recognitionUrl}`)
}

async function loadStream(cameraId: number) {
  // Смена камеры или режима: сначала закрываем текущий поток, потом открываем новый.
  stopStream()
  const currentToken = ++requestToken.value
  loading.value = true

  try {
    const { data } = await apiClient.get(`/api/cameras/${cameraId}/stream-url`)
    const nextStreamUrl = props.recognition
      ? getRecognitionStreamUrl(data.recognitionUrl)
      : withCacheBust(data.mjpegUrl)

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

function stopStream() {
  const image = streamImage.value
  if (image && image.getAttribute('src') !== BLANK_IMAGE_SRC) {
    image.src = BLANK_IMAGE_SRC
  }
  streamUrl.value = ''
}

function resetStream() {
  requestToken.value += 1
  loading.value = false
  stopStream()
}

onBeforeUnmount(resetStream)

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
        ref="streamImage"
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
