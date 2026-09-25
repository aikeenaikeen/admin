<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import apiClient from '../api/client'
import { formatDateTime } from '../utils/date'

type Label = 'positive' | 'negative' | 'unclear'
interface CaptureClip {
  id: number
  companySlug: string
  cameraId: number
  employeeId: number
  activityId: number | null
  labeledActivityId?: number | null
  reason: string
  capturedAt: string
  frameCount: number
  label: Label | null
  wrongPerson?: boolean
  meta?: { nominalFps?: number }
}
interface Activity { id: number; name: string }
const { t } = useI18n()
const clips = ref<Array<CaptureClip>>([])
const frame = ref(0)
const isLoading = ref(false)
const hasLoadError = ref(false)
const isSaving = ref(false)
const isMediaLoading = ref(false)
const hasMediaError = ref(false)
const frameUrls = ref<Array<string>>([])
const activities = ref<Array<Activity>>([])
const activityId = ref<number | null>(null)
const stats = ref<{ counts: Record<string, number>; total: number } | null>(null)
const reasonFilter = ref<'all' | 'vlm_verdict' | 'random'>('all')
const history = ref<Array<CaptureClip>>([])
const current = computed(() => clips.value[0] ?? null)
const remaining = computed(() => stats.value?.counts.unlabeled ?? 0)
const canLabel = computed(() => Boolean(current.value && activityId.value && !isSaving.value
  && !isLoading.value && !isMediaLoading.value && !hasMediaError.value))
/** Судить о человеке можно только по кадрам; активность для этого не нужна. */
const canMarkWrongPerson = computed(() => Boolean(current.value && !isSaving.value
  && !isLoading.value && !isMediaLoading.value && !hasMediaError.value))
let requestId = 0
let timer: number | undefined
let isDisposed = false

async function loadStats() {
  try {
    const { data } = await apiClient.get('/api/captures/stats')
    if (!isDisposed) { stats.value = data }
  } catch { /* Сбой счётчика не блокирует разметку. */ }
}

async function loadClips() {
  const request = ++requestId
  isLoading.value = true
  hasLoadError.value = false
  try {
    const { data } = await apiClient.get('/api/captures', { params: {
      label: 'unlabeled', limit: 50,
      ...(reasonFilter.value === 'all' ? {} : { reason: reasonFilter.value }),
    } })
    if (request === requestId && !isDisposed) { clips.value = data.data ?? [] }
  } catch {
    if (request === requestId && !isDisposed) { hasLoadError.value = true }
  } finally {
    if (request === requestId && !isDisposed) { isLoading.value = false }
  }
}

/** Кадры требуют Bearer-токен, поэтому загружаются через общий API-клиент. */
watch(current, async (clip, _old, onCleanup) => {
  const controller = new AbortController()
  const urls: Array<string> = []
  let isStale = false
  onCleanup(() => {
    isStale = true
    controller.abort()
    urls.forEach((url) => URL.revokeObjectURL(url))
    if (timer !== undefined) { window.clearInterval(timer) }
  })
  frame.value = 0
  frameUrls.value = []
  activities.value = []
  activityId.value = null
  isMediaLoading.value = Boolean(clip)
  hasMediaError.value = false
  if (!clip) { return }
  try {
    const response = await apiClient.get<Array<Activity>>(`/api/captures/${clip.id}/activities`, { signal: controller.signal })
    if (isStale) { return }
    activities.value = response.data
    const candidate = clip.labeledActivityId ?? clip.activityId
    activityId.value = activities.value.some((activity) => activity.id === candidate)
      ? candidate
      // У случайного окна активности нет: оно берётся независимо от того, что
      // заподозрила модель. Когда выбор всё равно один, заставлять человека
      // открывать список на каждом клипе — чистая потеря времени.
      : (activities.value.length === 1 ? activities.value[0].id : null)
    // Ограничиваем параллелизм, не отправляем сотни запросов при смене клипа.
    for (let start = 0; start < clip.frameCount; start += 4) {
      await Promise.all(Array.from({ length: Math.min(4, clip.frameCount - start) }, async (_, offset) => {
        const index = start + offset
        const { data } = await apiClient.get<Blob>(`/api/captures/${clip.id}/frames/${index}`, {
          responseType: 'blob', signal: controller.signal,
        })
        if (!isStale) { urls[index] = URL.createObjectURL(data) }
      }))
      if (isStale) { return }
    }
    frameUrls.value = [...urls]
    const fps = Number(clip.meta?.nominalFps)
    timer = window.setInterval(() => { frame.value = (frame.value + 1) % urls.length },
      1000 / (Number.isFinite(fps) && fps > 0 ? Math.min(fps, 60) : 8))
  } catch {
    if (!isStale) {
      controller.abort()
      hasMediaError.value = true
    }
  } finally {
    if (!isStale) { isMediaLoading.value = false }
  }
})

async function setLabel(label: Label) {
  const clip = current.value
  if (!clip || !canLabel.value) { return }
  isSaving.value = true
  const selectedActivity = activityId.value
  try {
    await apiClient.post(`/api/captures/${clip.id}/label`, { label, activityId: selectedActivity })
    if (isDisposed) { return }
    history.value.unshift({ ...clip, labeledActivityId: selectedActivity })
    history.value = history.value.slice(0, 10)
    clips.value.shift()
    if (!clips.value.length) { await loadClips() }
    void loadStats()
  } catch {
    ElMessage.error(t('labeling.saveFailed'))
  } finally { isSaving.value = false }
}

/**
 * Узнавание лиц приписало клип не тому сотруднику. Флаг не зависит от метки
 * действия и сохраняется сразу; повторное нажатие снимает его.
 */
async function toggleWrongPerson() {
  const clip = current.value
  if (!clip || !canMarkWrongPerson.value) { return }
  isSaving.value = true
  const next = !clip.wrongPerson
  try {
    await apiClient.post(`/api/captures/${clip.id}/wrong-person`, { wrongPerson: next })
    if (isDisposed) { return }
    clip.wrongPerson = next
  } catch {
    ElMessage.error(t('labeling.wrongPersonFailed'))
  } finally { isSaving.value = false }
}

/** Откатывает только последнюю метку действия; флаг «не тот человек» не трогает. */
async function undoLast() {
  const previous = history.value[0]
  if (!previous || isSaving.value || isLoading.value) { return }
  isSaving.value = true
  try {
    await apiClient.post(`/api/captures/${previous.id}/label`, { label: null })
    if (isDisposed) { return }
    history.value.shift()
    clips.value = [previous, ...clips.value.filter((clip) => clip.id !== previous.id)]
    void loadStats()
  } catch { ElMessage.error(t('labeling.undoFailed')) }
  finally { isSaving.value = false }
}

function onKey(event: KeyboardEvent) {
  if (event.repeat || (event.target instanceof HTMLElement
    && event.target.closest('input,textarea,select,button,[contenteditable="true"],[role="combobox"]'))) { return }
  const map: Record<string, Label> = { '1': 'positive', '2': 'negative', '3': 'unclear' }
  if (map[event.key]) {
    event.preventDefault()
    void setLabel(map[event.key])
  } else if (event.key === '4') {
    event.preventDefault()
    void toggleWrongPerson()
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    void undoLast()
  }
}
watch(reasonFilter, () => { clips.value = []; void loadClips() })
onMounted(() => { void loadClips(); void loadStats(); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => {
  isDisposed = true
  requestId += 1
  window.removeEventListener('keydown', onKey)
  if (timer !== undefined) { window.clearInterval(timer) }
})
</script>

<template>
  <div class="labeling">
    <div class="labeling__header">
      <div><h2>{{ t('labeling.title') }}</h2><p>{{ t('labeling.shortcuts') }}</p></div>
      <div class="labeling__counters">
        <el-tag>{{ t('labeling.remaining') }}: {{ remaining }}</el-tag>
        <el-tag type="success">{{ t('labeling.completed') }}: {{ (stats?.total ?? 0) - remaining }}</el-tag>
        <el-radio-group v-model="reasonFilter" :disabled="isSaving || isLoading">
          <el-radio-button value="all">{{ t('labeling.all') }}</el-radio-button>
          <el-radio-button value="vlm_verdict">{{ t('labeling.verdicts') }}</el-radio-button>
          <el-radio-button value="random">{{ t('labeling.random') }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <el-alert v-if="hasLoadError" :title="t('labeling.loadFailed')" type="error" :closable="false" />
    <el-button v-if="hasLoadError" @click="loadClips">{{ t('labeling.retry') }}</el-button>
    <p v-if="isLoading">{{ t('labeling.loading') }}</p>
    <el-empty v-else-if="!current && !hasLoadError" :description="t('labeling.empty')" />
    <div v-else-if="current" class="labeling__body">
      <div class="labeling__player">
        <p v-if="isMediaLoading">{{ t('labeling.loading') }}</p>
        <el-alert v-else-if="hasMediaError" :title="t('labeling.mediaFailed')" type="error" :closable="false" />
        <img v-for="(url, n) in frameUrls" v-show="n === frame" :key="url" :src="url"
          class="labeling__frame" :alt="t('labeling.frame', { number: n + 1 })" @error="hasMediaError = true" />
        <div v-if="frameUrls.length" class="labeling__progress">{{ frame + 1 }} / {{ frameUrls.length }}</div>
      </div>
      <div class="labeling__side">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('labeling.company')">{{ current.companySlug }}</el-descriptions-item>
          <el-descriptions-item :label="t('labeling.employee')">
            <div class="labeling__employee">
              <span :class="{ 'labeling__employee-id--wrong': current.wrongPerson }">{{ current.employeeId }}</span>
              <el-button data-test="wrong-person" size="small" type="warning" :plain="!current.wrongPerson"
                :aria-pressed="Boolean(current.wrongPerson)" :title="t('labeling.wrongPersonHint')"
                :disabled="!canMarkWrongPerson" @click="toggleWrongPerson">
                4 · {{ t('labeling.wrongPerson') }}
              </el-button>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('labeling.camera')">{{ current.cameraId }}</el-descriptions-item>
          <el-descriptions-item :label="t('labeling.captured')">{{ formatDateTime(current.capturedAt) }}</el-descriptions-item>
        </el-descriptions>
        <label>{{ t('labeling.activity') }}</label>
        <el-select v-model="activityId" :placeholder="t('labeling.selectActivity')" :disabled="isSaving || isMediaLoading">
          <el-option v-for="activity in activities" :key="activity.id" :value="activity.id" :label="activity.name" />
        </el-select>
        <p v-if="!isMediaLoading && !activities.length">{{ t('labeling.noActivities') }}</p>
        <div class="labeling__buttons">
          <el-button data-test="positive" type="success" :disabled="!canLabel" @click="setLabel('positive')">1 · {{ t('labeling.positive') }}</el-button>
          <el-button data-test="negative" type="danger" :disabled="!canLabel" @click="setLabel('negative')">2 · {{ t('labeling.negative') }}</el-button>
          <el-button data-test="unclear" :disabled="!canLabel" @click="setLabel('unclear')">3 · {{ t('labeling.unclear') }}</el-button>
        </div>
        <el-button v-if="hasMediaError" :disabled="isSaving" @click="loadClips">{{ t('labeling.retry') }}</el-button>
      </div>
    </div>
    <el-button data-test="undo" :disabled="!history.length || isSaving || isLoading" @click="undoLast">{{ t('labeling.undo') }}</el-button>
  </div>
</template>

<style scoped>
.labeling { padding: 16px; }
.labeling__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.labeling__counters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.labeling__body { display: flex; gap: 20px; margin: 16px 0; flex-wrap: wrap; }
.labeling__player { position: relative; width: 448px; max-width: 100%; background: #000; color: white; border-radius: 8px; overflow: hidden; }
.labeling__frame { width: 100%; display: block; }
.labeling__progress { position: absolute; right: 8px; bottom: 8px; color: #fff; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 4px; }
.labeling__side { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
.labeling__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.labeling__employee { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.labeling__employee-id--wrong { text-decoration: line-through; color: var(--el-color-warning); }
</style>
