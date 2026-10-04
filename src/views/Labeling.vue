<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import apiClient from '../api/client'
import { formatDateTime } from '../utils/date'

type Label = 'positive' | 'negative' | 'unclear'
type Reason = 'all' | 'vlm_verdict' | 'random'
type VlmDecision = 'confirmed' | 'rejected' | 'uncertain' | 'error'
type Order = 'asc' | 'desc'
/** Срез клипов. Источник истины — адресная строка: нужный срез открывается ссылкой. */
interface Filters {
  reason: Reason
  employeeId: number | null
  cameraId: number | null
  from: string | null
  to: string | null
  vlmDecision: VlmDecision | null
  minScore: number | null
  maxScore: number | null
  order: Order
}
interface Option { id: number; name: string }
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
type HistoryEntry = CaptureClip & { filterKey: string }
interface Activity { id: number; name: string }
/** error — Квен не ответил или ответ не разобрался; распознавание пишет это решение как есть. */
const VLM_DECISIONS: ReadonlyArray<VlmDecision> = ['confirmed', 'rejected', 'uncertain', 'error']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function queryText(query: LocationQuery, key: string): string | null {
  const raw = query[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
function queryId(query: LocationQuery, key: string): number | null {
  const value = Number(queryText(query, key))
  return Number.isInteger(value) && value > 0 ? value : null
}
function queryScore(query: LocationQuery, key: string): number | null {
  const text = queryText(query, key)
  const value = Number(text)
  return text !== null && Number.isFinite(value) ? value : null
}
function queryDate(query: LocationQuery, key: string): string | null {
  const value = queryText(query, key)
  return value && DATE_PATTERN.test(value) && dayjs(value).isValid() ? value : null
}
/** Мусор в адресе не ломает страницу: неизвестное значение равно «не задано». */
function parseFilters(query: LocationQuery): Filters {
  const reason = queryText(query, 'reason')
  const vlmDecision = queryText(query, 'vlmDecision')
  return {
    reason: reason === 'vlm_verdict' || reason === 'random' ? reason : 'all',
    employeeId: queryId(query, 'employeeId'),
    cameraId: queryId(query, 'cameraId'),
    from: queryDate(query, 'from'),
    to: queryDate(query, 'to'),
    vlmDecision: VLM_DECISIONS.find((decision) => decision === vlmDecision) ?? null,
    minScore: queryScore(query, 'minScore'),
    maxScore: queryScore(query, 'maxScore'),
    order: queryText(query, 'order') === 'desc' ? 'desc' : 'asc',
  }
}
/** В адрес попадают только заданные значения, чтобы ссылка оставалась короткой. */
function toQuery(filters: Filters): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.reason !== 'all') { query.reason = filters.reason }
  if (filters.employeeId) { query.employeeId = String(filters.employeeId) }
  if (filters.cameraId) { query.cameraId = String(filters.cameraId) }
  if (filters.from) { query.from = filters.from }
  if (filters.to) { query.to = filters.to }
  if (filters.vlmDecision) { query.vlmDecision = filters.vlmDecision }
  if (filters.minScore !== null) { query.minScore = String(filters.minScore) }
  if (filters.maxScore !== null) { query.maxScore = String(filters.maxScore) }
  if (filters.order === 'desc') { query.order = 'desc' }
  return query
}
/** Даты в адресе — календарные дни; серверу уходят границы местных суток. */
function toParams(filters: Filters) {
  return {
    label: 'unlabeled', limit: 50, order: filters.order,
    ...(filters.reason === 'all' ? {} : { reason: filters.reason }),
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.cameraId ? { cameraId: filters.cameraId } : {}),
    ...(filters.from ? { from: dayjs(filters.from).startOf('day').toISOString() } : {}),
    ...(filters.to ? { to: dayjs(filters.to).endOf('day').toISOString() } : {}),
    ...(filters.vlmDecision ? { vlmDecision: filters.vlmDecision } : {}),
    ...(filters.minScore !== null ? { minScore: filters.minScore } : {}),
    ...(filters.maxScore !== null ? { maxScore: filters.maxScore } : {}),
  }
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const filters = computed(() => parseFilters(route.query))
const filterKey = computed(() => JSON.stringify(filters.value))
const hasFilters = computed(() => Object.keys(toQuery(filters.value)).length > 0)
const rangeError = computed(() => {
  const { from, to, minScore, maxScore } = filters.value
  if (from && to && from > to) { return t('labeling.filters.badDates') }
  if (minScore !== null && maxScore !== null && minScore > maxScore) { return t('labeling.filters.badScores') }
  return ''
})
const employees = ref<Array<Option>>([])
const cameras = ref<Array<Option>>([])
const listTotal = ref<number | null>(null)
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
const history = ref<Array<HistoryEntry>>([])
const current = computed(() => clips.value[0] ?? null)
/** Сколько неразмеченных осталось именно в текущем срезе. */
const remaining = computed(() => listTotal.value ?? stats.value?.counts.unlabeled ?? 0)
const completed = computed(() => (stats.value?.total ?? 0) - (stats.value?.counts.unlabeled ?? 0))
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

/** Списки для фильтров; без них фильтр по номеру из ссылки всё равно работает. */
async function loadOptions() {
  const [employeeList, cameraList] = await Promise.allSettled([
    apiClient.get<Array<Option>>('/api/employees'),
    apiClient.get<Array<Option>>('/api/cameras'),
  ])
  if (isDisposed) { return }
  if (employeeList.status === 'fulfilled' && Array.isArray(employeeList.value.data)) { employees.value = employeeList.value.data }
  if (cameraList.status === 'fulfilled' && Array.isArray(cameraList.value.data)) { cameras.value = cameraList.value.data }
}

function updateFilters(patch: Partial<Filters>) {
  void router.replace({ query: toQuery({ ...filters.value, ...patch }) })
}
const DEFAULT_FILTERS = parseFilters({})
/** Очищенное поле возвращает значение по умолчанию; адрес потом проходит ту же проверку, что и ссылка. */
function onFilter(key: keyof Filters, value: unknown) {
  const isEmpty = value === undefined || value === null || value === ''
  updateFilters({ [key]: isEmpty ? DEFAULT_FILTERS[key] : value })
}
function resetFilters() {
  void router.replace({ query: {} })
}

async function loadClips() {
  const request = ++requestId
  if (rangeError.value) {
    clips.value = []
    listTotal.value = null
    isLoading.value = false
    hasLoadError.value = false
    return
  }
  isLoading.value = true
  hasLoadError.value = false
  try {
    const { data } = await apiClient.get('/api/captures', { params: toParams(filters.value) })
    if (request === requestId && !isDisposed) {
      clips.value = data.data ?? []
      listTotal.value = typeof data.total === 'number' ? data.total : null
    }
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
    history.value.unshift({ ...clip, labeledActivityId: selectedActivity, filterKey: filterKey.value })
    history.value = history.value.slice(0, 10)
    clips.value.shift()
    if (listTotal.value !== null) { listTotal.value = Math.max(listTotal.value - 1, 0) }
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
    // Клип из другого среза в счётчик текущего не входит.
    if (listTotal.value !== null && previous.filterKey === filterKey.value) { listTotal.value += 1 }
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
watch(filterKey, () => { clips.value = []; listTotal.value = null; void loadClips() })
onMounted(() => {
  void loadClips()
  void loadStats()
  void loadOptions()
  window.addEventListener('keydown', onKey)
})
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
        <el-tag data-test="remaining" :title="t('labeling.remainingHint')">{{ t('labeling.remaining') }}: {{ remaining }}</el-tag>
        <el-tag type="success">{{ t('labeling.completed') }}: {{ completed }}</el-tag>
      </div>
    </div>
    <el-card shadow="never" class="labeling__filters" data-test="filters">
      <div class="labeling__filters-grid">
        <div class="labeling__filter labeling__filter--wide">
          <div class="labeling__caption">{{ t('labeling.filters.source') }}</div>
          <el-radio-group :model-value="filters.reason" :disabled="isSaving"
            @update:model-value="onFilter('reason', $event)">
            <el-radio-button value="all">{{ t('labeling.all') }}</el-radio-button>
            <el-radio-button value="vlm_verdict">{{ t('labeling.verdicts') }}</el-radio-button>
            <el-radio-button value="random">{{ t('labeling.random') }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.employee') }}</div>
          <el-select data-test="filter-employee" :model-value="filters.employeeId ?? undefined" clearable filterable
            :placeholder="t('labeling.filters.any')" :disabled="isSaving"
            @update:model-value="onFilter('employeeId', $event)">
            <el-option v-for="employee in employees" :key="employee.id" :value="employee.id"
              :label="`${employee.name} · ${employee.id}`" />
          </el-select>
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.camera') }}</div>
          <el-select data-test="filter-camera" :model-value="filters.cameraId ?? undefined" clearable filterable
            :placeholder="t('labeling.filters.any')" :disabled="isSaving"
            @update:model-value="onFilter('cameraId', $event)">
            <el-option v-for="camera in cameras" :key="camera.id" :value="camera.id"
              :label="`${camera.name} · ${camera.id}`" />
          </el-select>
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.filters.from') }}</div>
          <el-date-picker data-test="filter-from" :model-value="filters.from ?? undefined" type="date"
            value-format="YYYY-MM-DD" format="DD.MM.YYYY" :placeholder="t('labeling.filters.anyDate')"
            :disabled="isSaving" style="width: 100%"
            @update:model-value="onFilter('from', $event)" />
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.filters.to') }}</div>
          <el-date-picker data-test="filter-to" :model-value="filters.to ?? undefined" type="date"
            value-format="YYYY-MM-DD" format="DD.MM.YYYY" :placeholder="t('labeling.filters.anyDate')"
            :disabled="isSaving" style="width: 100%"
            @update:model-value="onFilter('to', $event)" />
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.filters.vlmDecision') }}</div>
          <el-select data-test="filter-vlm" :model-value="filters.vlmDecision ?? undefined" clearable
            :placeholder="t('labeling.filters.any')" :disabled="isSaving"
            @update:model-value="onFilter('vlmDecision', $event)">
            <el-option v-for="decision in VLM_DECISIONS" :key="decision" :value="decision"
              :label="t(`labeling.filters.decisions.${decision}`)" />
          </el-select>
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.filters.score') }}</div>
          <div class="labeling__range">
            <el-input-number data-test="filter-min-score" :model-value="filters.minScore ?? undefined" :min="0" :max="1"
              :step="0.05" :precision="2" :controls="false" :value-on-clear="null" :placeholder="t('labeling.filters.scoreFrom')"
              :disabled="isSaving" @update:model-value="onFilter('minScore', $event)" />
            <span>—</span>
            <el-input-number data-test="filter-max-score" :model-value="filters.maxScore ?? undefined" :min="0" :max="1"
              :step="0.05" :precision="2" :controls="false" :value-on-clear="null" :placeholder="t('labeling.filters.scoreTo')"
              :disabled="isSaving" @update:model-value="onFilter('maxScore', $event)" />
          </div>
        </div>
        <div class="labeling__filter">
          <div class="labeling__caption">{{ t('labeling.filters.order') }}</div>
          <el-select data-test="filter-order" :model-value="filters.order" :disabled="isSaving"
            @update:model-value="onFilter('order', $event)">
            <el-option value="asc" :label="t('labeling.filters.oldestFirst')" />
            <el-option value="desc" :label="t('labeling.filters.newestFirst')" />
          </el-select>
        </div>
        <div class="labeling__filter labeling__filter--action">
          <el-button data-test="filter-reset" :disabled="!hasFilters || isSaving" @click="resetFilters">
            {{ t('labeling.filters.reset') }}
          </el-button>
        </div>
      </div>
    </el-card>
    <el-alert v-if="rangeError" :title="rangeError" type="warning" :closable="false" />
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
        <el-select v-model="activityId" data-test="activity" :placeholder="t('labeling.selectActivity')" :disabled="isSaving || isMediaLoading">
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
.labeling__filters { margin: 12px 0; }
.labeling__filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; align-items: end; }
.labeling__filter { display: flex; flex-direction: column; min-width: 0; }
@media (min-width: 640px) { .labeling__filter--wide { grid-column: span 2; } }
.labeling__filter--action { justify-content: flex-end; }
.labeling__caption { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.labeling__range { display: flex; gap: 6px; align-items: center; }
.labeling__range .el-input-number { flex: 1; min-width: 0; }
.labeling__body { display: flex; gap: 20px; margin: 16px 0; flex-wrap: wrap; }
.labeling__player { position: relative; width: 448px; max-width: 100%; background: #000; color: white; border-radius: 8px; overflow: hidden; }
.labeling__frame { width: 100%; display: block; }
.labeling__progress { position: absolute; right: 8px; bottom: 8px; color: #fff; background: rgba(0,0,0,.55); padding: 2px 8px; border-radius: 4px; }
.labeling__side { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
.labeling__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.labeling__employee { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.labeling__employee-id--wrong { text-decoration: line-through; color: var(--el-color-warning); }
</style>
