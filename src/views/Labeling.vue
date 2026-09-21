<script setup lang="ts">
/**
 * Разметка клипов с боевого потока.
 *
 * Оценивать по одному кадру нельзя: по стоп-кадру не отличить телефон в руке от
 * руки у лица. Поэтому клип проигрывается по кругу, как и было снято.
 *
 * Скорость важнее красоты: при четырёх сотнях клипов в день разница между
 * мышкой и тремя клавишами — это разница между двадцатью минутами и часом.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'
import { formatDateTime } from '@/utils/date'

type Label = 'positive' | 'negative' | 'unclear'

interface CaptureClip {
  id: number
  path: string
  cameraId: number
  employeeId: number
  activityId: number | null
  reason: 'vlm_verdict' | 'random' | string
  capturedAt: string
  frameCount: number
  vlmDecision: string | null
  vlmConfidence: number | null
  vlmReason: string | null
  modelScore: number | null
  label: Label | null
}

const clips = ref<CaptureClip[]>([])
const index = ref(0)
const frame = ref(0)
const loading = ref(false)
const stats = ref<{ counts: Record<string, number>; total: number } | null>(null)
const reasonFilter = ref<'all' | 'vlm_verdict' | 'random'>('all')
/** Последние решения: при такой скорости промах неизбежен. */
const history = ref<Array<{ clip: CaptureClip; label: Label }>>([])

const current = computed(() => clips.value[index.value] ?? null)
const remaining = computed(() => stats.value?.counts?.unlabeled ?? 0)

let timer: number | undefined

function frameUrl(clip: CaptureClip, n: number) {
  return `/api/captures/${clip.id}/frames/${n}`
}

/** Соседние клипы подгружаются заранее, иначе на каждом переходе видна пауза. */
const preloadUrls = computed(() => {
  const next = clips.value.slice(index.value + 1, index.value + 3)
  return next.flatMap((clip) =>
    Array.from({ length: clip.frameCount }, (_, n) => frameUrl(clip, n))
  )
})

async function loadStats() {
  try {
    const { data } = await apiClient.get('/api/captures/stats')
    stats.value = data
  } catch {
    // счётчик не критичен, молчим
  }
}

async function loadClips() {
  loading.value = true
  try {
    const { data } = await apiClient.get('/api/captures', {
      params: {
        label: 'unlabeled',
        limit: 50,
        ...(reasonFilter.value === 'all' ? {} : { reason: reasonFilter.value }),
      },
    })
    clips.value = data.data ?? []
    index.value = 0
    frame.value = 0
  } catch (error) {
    ElMessage.error('Не удалось загрузить клипы')
  } finally {
    loading.value = false
  }
}

async function setLabel(label: Label) {
  const clip = current.value
  if (!clip) return
  // Переходим сразу, не дожидаясь ответа: иначе каждое нажатие упирается в сеть,
  // а на канале в два мегабита это заметно.
  history.value.unshift({ clip, label })
  history.value = history.value.slice(0, 10)
  advance()
  try {
    await apiClient.post(`/api/captures/${clip.id}/label`, { label })
    if (stats.value) {
      stats.value.counts.unlabeled = Math.max(0, (stats.value.counts.unlabeled ?? 1) - 1)
      stats.value.counts[label] = (stats.value.counts[label] ?? 0) + 1
    }
  } catch {
    ElMessage.error(`Метка для клипа ${clip.id} не сохранилась`)
  }
}

function advance() {
  frame.value = 0
  if (index.value + 1 < clips.value.length) {
    index.value += 1
    if (clips.value.length - index.value <= 5) void loadClips()
  } else {
    void loadClips()
  }
}

async function undoLast() {
  const last = history.value.shift()
  if (!last) return
  clips.value.splice(index.value, 0, last.clip)
  frame.value = 0
  ElMessage.info(`Клип ${last.clip.id} вернули, метка «${last.label}» снята`)
  try {
    await apiClient.post(`/api/captures/${last.clip.id}/label`, { label: null })
  } catch {
    // Снятие метки поддерживается не везде; клип всё равно показан заново.
  }
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const map: Record<string, Label> = { '1': 'positive', '2': 'negative', '3': 'unclear' }
  if (map[event.key]) {
    event.preventDefault()
    void setLabel(map[event.key])
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    void undoLast()
  }
}

watch(reasonFilter, () => void loadClips())

onMounted(() => {
  void loadClips()
  void loadStats()
  window.addEventListener('keydown', onKey)
  timer = window.setInterval(() => {
    const clip = current.value
    if (clip && clip.frameCount > 0) frame.value = (frame.value + 1) % clip.frameCount
  }, 250)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="labeling">
    <div class="labeling__header">
      <div>
        <h2>Разметка клипов</h2>
        <p class="labeling__hint">
          Клавиши: <b>1</b> — пользуется телефоном, <b>2</b> — не пользуется,
          <b>3</b> — по кадрам не понять, <b>Backspace</b> — вернуть предыдущий.
        </p>
      </div>
      <div class="labeling__counters">
        <el-tag type="warning" size="large">Осталось: {{ remaining }}</el-tag>
        <el-tag type="success" size="large">Размечено: {{ (stats?.total ?? 0) - remaining }}</el-tag>
        <el-radio-group v-model="reasonFilter" size="small">
          <el-radio-button label="all">Все</el-radio-button>
          <el-radio-button label="vlm_verdict">Вердикты</el-radio-button>
          <el-radio-button label="random">Случайные</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <el-empty v-if="!loading && !current" description="Неразмеченных клипов нет" />

    <div v-else-if="current" class="labeling__body">
      <div class="labeling__player">
        <img
          v-for="n in current.frameCount"
          v-show="n - 1 === frame"
          :key="n"
          :src="frameUrl(current, n - 1)"
          class="labeling__frame"
          alt=""
        />
        <div class="labeling__progress">{{ frame + 1 }} / {{ current.frameCount }}</div>
      </div>

      <div class="labeling__side">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="Сотрудник">{{ current.employeeId }}</el-descriptions-item>
          <el-descriptions-item label="Камера">{{ current.cameraId }}</el-descriptions-item>
          <el-descriptions-item label="Снято">{{ formatDateTime(current.capturedAt) }}</el-descriptions-item>
          <el-descriptions-item label="Источник">
            <el-tag :type="current.reason === 'random' ? 'info' : 'warning'" size="small">
              {{ current.reason === 'random' ? 'случайное окно' : 'вердикт модели' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- Подсказка показывается только там, где она есть: у случайных окон
             её нет намеренно, они и нужны, чтобы ловить пропуски. -->
        <el-alert
          v-if="current.vlmReason"
          :title="`Модель: ${current.vlmDecision ?? '—'}`"
          type="info"
          :closable="false"
          class="labeling__verdict"
        >
          <p>{{ current.vlmReason }}</p>
        </el-alert>

        <div class="labeling__buttons">
          <el-button type="success" size="large" @click="setLabel('positive')">
            1 · Пользуется
          </el-button>
          <el-button type="danger" size="large" @click="setLabel('negative')">
            2 · Не пользуется
          </el-button>
          <el-button size="large" @click="setLabel('unclear')">
            3 · Не понять
          </el-button>
        </div>
        <el-button link :disabled="!history.length" @click="undoLast">
          ← Вернуть предыдущий
        </el-button>
      </div>
    </div>

    <div class="labeling__preload">
      <img v-for="url in preloadUrls" :key="url" :src="url" alt="" />
    </div>
  </div>
</template>

<style scoped>
.labeling { padding: 16px; }
.labeling__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.labeling__hint { color: var(--el-text-color-secondary); font-size: 13px; margin: 4px 0 0; }
.labeling__counters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.labeling__body { display: flex; gap: 20px; margin-top: 16px; flex-wrap: wrap; }
.labeling__player { position: relative; width: 448px; max-width: 100%; background: #000; border-radius: 8px; overflow: hidden; }
.labeling__frame { width: 100%; display: block; image-rendering: auto; }
.labeling__progress { position: absolute; right: 8px; bottom: 8px; color: #fff; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.labeling__side { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
.labeling__verdict :deep(p) { margin: 4px 0 0; line-height: 1.4; }
.labeling__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.labeling__preload { position: absolute; width: 0; height: 0; overflow: hidden; }
</style>
