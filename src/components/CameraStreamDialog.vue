<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'
import { formatCameraLabel, type CameraDisplayInfo } from '@/utils/camera'
import { useIsMobile } from '@/composables/useIsMobile'

const props = withDefaults(defineProps<{
  modelValue: boolean
  camera: CameraDisplayInfo | null
  recognition?: boolean
  // Разрешить переключать режим распознавания прямо в окне (сейчас — только на телефоне,
  // где кнопки «Видео»/«ИИ» в карточке камеры неудобно перебирать).
  modeSwitchable?: boolean
}>(), {
  recognition: false,
  modeSwitchable: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:recognition', value: boolean): void
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

// Прозрачный GIF 1x1. Подставляется в <img> перед его удалением: смена src
// заставляет браузер оборвать MJPEG-соединение. Если просто убрать элемент
// из DOM, отсоединённая картинка может продолжать тянуть поток.
const BLANK_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

// Паузы перед повторным подключением после обрыва потока. Длина массива — сколько
// попыток подряд делаем, прежде чем показать «Поток недоступен» и кнопку «Повторить».
const RECONNECT_DELAYS_MS = [2000, 5000, 10000, 10000, 10000]

const loading = ref(false)
const streamUrl = ref('')
const requestToken = ref(0)
const streamImage = ref<HTMLImageElement | null>(null)
const reconnectAttempts = ref(0)
const streamUnavailable = ref(false)
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const showModeSwitch = computed(() => isMobile.value && props.modeSwitchable)

function onRecognitionSwitch(value: string | number | boolean) {
  emit('update:recognition', Boolean(value))
}

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

    resetReconnect()
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
  return withCacheBust(recognitionUrl)
}

// reconnect = true: повторное подключение после обрыва. Тогда ошибка запроса ссылки
// не закрывает окно, а считается неудачной попыткой.
async function loadStream(cameraId: number, reconnect = false) {
  // Смена камеры или режима: сначала закрываем текущий поток, потом открываем новый.
  clearReconnectTimer()
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

    if (reconnect) {
      scheduleReconnect(cameraId)
      return
    }

    ElMessage.error(t('cameras.streamUrlError'))
    dialogVisible.value = false
  } finally {
    if (currentToken === requestToken.value && !reconnectTimer) {
      loading.value = false
    }
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function resetReconnect() {
  clearReconnectTimer()
  reconnectAttempts.value = 0
  streamUnavailable.value = false
}

// Подписанная ссылка истекла, шлюз перезапустился или оборвалась сеть: берём у backend
// свежую ссылку и открываем поток заново. Таймер привязан к requestToken: закрытие окна,
// смена камеры или режима делают отложенную попытку пустой.
function scheduleReconnect(cameraId: number) {
  clearReconnectTimer()
  stopStream()

  if (reconnectAttempts.value >= RECONNECT_DELAYS_MS.length) {
    loading.value = false
    streamUnavailable.value = true
    return
  }

  const delay = RECONNECT_DELAYS_MS[reconnectAttempts.value]
  reconnectAttempts.value += 1
  const token = requestToken.value
  loading.value = true
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (token !== requestToken.value) {
      return
    }
    void loadStream(cameraId, true)
  }, delay)
}

// События от уже заменённой картинки (пустой GIF при обрыве, старая ссылка) игнорируем.
function isCurrentStreamEvent(event: Event): boolean {
  const image = event.target as HTMLImageElement | null
  return Boolean(streamUrl.value) && image?.getAttribute('src') === streamUrl.value
}

function onStreamError(event: Event) {
  const cameraId = props.camera?.id
  if (!cameraId || !isCurrentStreamEvent(event) || reconnectTimer) {
    return
  }

  scheduleReconnect(cameraId)
}

function onStreamLoad(event: Event) {
  if (isCurrentStreamEvent(event)) {
    reconnectAttempts.value = 0
  }
}

function onRetry() {
  const cameraId = props.camera?.id
  if (!cameraId) {
    return
  }

  resetReconnect()
  void loadStream(cameraId)
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
  resetReconnect()
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
    :fullscreen="isMobile"
    :class="{ 'camera-stream-dialog--mobile': isMobile }"
    @close="handleClose"
  >
    <div v-if="showModeSwitch" class="recognition-switch">
      <el-switch
        :model-value="recognition"
        :active-text="t('cameras.recognitionSwitch')"
        data-test="recognition-switch"
        @update:model-value="onRecognitionSwitch"
      />
    </div>

    <div v-else-if="recognition" class="recognition-indicator">
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
        @load="onStreamLoad"
        @error="onStreamError"
      />
      <div v-else-if="streamUnavailable" class="stream-unavailable" data-test="stream-unavailable">
        <span>{{ t('cameras.streamUnavailable') }}</span>
        <el-button type="primary" data-test="stream-retry" @click="onRetry">
          {{ t('cameras.streamRetry') }}
        </el-button>
      </div>
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

.stream-unavailable {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.recognition-hint {
  margin-top: 16px;
}

.recognition-switch {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

/* Телефон: окно на весь экран, картинка по ширине экрана. */
.camera-stream-dialog--mobile .stream-container {
  min-height: 200px;
  border-radius: 0;
}

.camera-stream-dialog--mobile .stream-image {
  width: 100%;
  max-height: none;
  height: auto;
  border-radius: 0;
}
</style>
