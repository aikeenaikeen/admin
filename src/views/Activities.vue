<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { Plus, Edit, Check, Close, Setting, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { formatDateTime } from '@/utils/date'
import TableActionsMenu from '@/components/TableActionsMenu.vue'
import {
  translateActivityStatus,
  translateModelStatus,
  translateTrainingAnnotationType,
  translateTrainingJobStatus,
} from '@/utils/uiText'

type ActivityStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED'
type ModelVersionStatus = 'DRAFT' | 'STAGING' | 'ACTIVE' | 'DEPRECATED'
type TrainingJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

interface ModelVersion {
  id: number
  version: number
  status: ModelVersionStatus
  metrics?: any
  artifactUri?: string
  createdAt: string
}

interface Activity {
  id: number
  code: string
  name: string
  description?: string
  kind: string
  status: ActivityStatus
  detectorSpec?: any
  createdAt: string
  updatedAt: string
  modelVersions?: ModelVersion[]
  _count?: { companyActivities: number }
}

interface Company {
  id: number
  name: string
  slug: string
}

interface CompanyActivity {
  enabled: boolean
  allowedModelVersionId?: number | null
  activeModelVersionId?: number | null
  overrides?: any | null
  overridesText?: string
}

interface TrainingAnnotation {
  id: number
  startSec: number
  endSec: number
  label?: string | null
  type: 'POSITIVE' | 'NEGATIVE'
}

interface TrainingAsset {
  id: number
  uri: string
  mime: string
  sizeBytes: number
  durationSec?: number | null
  annotations?: TrainingAnnotation[]
}

interface TrainingJobLiveProgress {
  phase?: string
  percent?: number
  message?: string
  updatedAt?: string
  currentEpoch?: number
  totalEpochs?: number
  trainLoss?: number
  bestEpoch?: number
  staleEpochs?: number
  earlyStopped?: boolean
  assetCount?: number
  processedAssets?: number
  totalAssets?: number
  clipCount?: number
  durationSec?: number
  metrics?: Record<string, any>
}

interface TrainingJobLogHistoryEntry extends TrainingJobLiveProgress {
  timestamp?: string
}

interface TrainingJob {
  id: number
  status: TrainingJobStatus
  modelVersionId?: number | null
  modelVersion?: ModelVersion | null
  createdAt: string
  updatedAt: string
  error?: string | null
  logs?: {
    live?: TrainingJobLiveProgress
    history?: TrainingJobLogHistoryEntry[]
    metrics?: Record<string, any>
    bestEpoch?: number
    epochsTrained?: number
    durationSec?: number
    earlyStopped?: boolean
    dataset?: Record<string, any>
  } | null
}

type TrainingStep = 1 | 2 | 3 | 4
type DraftAnnotation = { startSec: number; endSec: number; type: 'POSITIVE' | 'NEGATIVE' }
type ActivityTableAction = 'publish' | 'deprecate' | 'edit' | 'delete' | 'training' | 'companies'

interface PersistedTrainingUiState {
  step?: TrainingStep
  trimAssetId?: number | null
  annotationAssetId?: number | null
}

const activities = ref<Activity[]>([])
const companies = ref<Company[]>([])
const { t } = useI18n()
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingActivityId = ref<number | null>(null)
const companyDialogVisible = ref(false)
const selectedActivity = ref<Activity | null>(null)
const companySettings = ref<Record<number, CompanyActivity>>({})

const trainingDialogVisible = ref(false)
const trainingActivity = ref<any | null>(null)
const uploadInputRef = ref<HTMLInputElement | null>(null)
const videoPreviewRef = ref<HTMLVideoElement | null>(null)
const trimTimelineRef = ref<HTMLDivElement | null>(null)
const annotationTimelineRef = ref<HTMLDivElement | null>(null)
const trainingStep = ref<TrainingStep>(1)
const trimAssetId = ref<number | null>(null)
const annotationsAssetId = ref<number | null>(null)
const annotationsDraft = ref<DraftAnnotation[]>([])
const annotationDraftsByAssetId = ref<Record<number, DraftAnnotation[]>>({})
const annotationForm = ref<{ startSec: number | null; endSec: number | null; type: 'POSITIVE' | 'NEGATIVE' }>({
  startSec: null,
  endSec: null,
  type: 'POSITIVE',
})
const videoCurrentTime = ref(0)
const videoDuration = ref(0)
const trimRange = ref<[number, number]>([0, 0])
const creatingClip = ref(false)
const selectedAnnotationIndex = ref<number | null>(null)
const deletingTrainingAssetId = ref<number | null>(null)
const trainingJobsPollHandle = ref<ReturnType<typeof setInterval> | null>(null)
const refreshingTrainingJobs = ref(false)

type TrimDragMode = 'start' | 'end' | 'range'
type AnnotationDragMode = 'start' | 'end' | 'range'

interface TrimDragState {
  mode: TrimDragMode
  pointerStartX: number
  initialStart: number
  initialEnd: number
}

interface AnnotationDragState {
  index: number
  mode: AnnotationDragMode
  pointerStartX: number
  initialStart: number
  initialEnd: number
}

const activeTrimDrag = ref<TrimDragState | null>(null)
const activeAnnotationDrag = ref<AnnotationDragState | null>(null)

const form = ref({
  name: '',
  description: '',
})

const statusTagType = computed(() => (status: ActivityStatus) => {
  switch (status) {
    case 'ACTIVE': return 'success'
    case 'DRAFT': return 'info'
    case 'DEPRECATED': return 'danger'
    default: return 'info'
  }
})

const trainingAssets = computed<TrainingAsset[]>(() => trainingActivity.value?.trainingAssets || [])
const trainingJobs = computed<TrainingJob[]>(() => trainingActivity.value?.trainingJobs || [])

const trainingVideoAssets = computed<TrainingAsset[]>(() =>
  trainingAssets.value.filter((asset) => isVideoAsset(asset))
)

const selectedTrimAsset = computed<TrainingAsset | null>(() => {
  if (!trimAssetId.value) return null
  return trainingAssets.value.find((asset) => asset.id === trimAssetId.value) ?? null
})

const selectedAnnotationAsset = computed<TrainingAsset | null>(() => {
  if (!annotationsAssetId.value) return null
  return trainingAssets.value.find((asset) => asset.id === annotationsAssetId.value) ?? null
})

const trimMax = computed(() => {
  const activeAsset = trainingStep.value === 2 ? selectedTrimAsset.value : selectedAnnotationAsset.value
  const assetDuration = Number(activeAsset?.durationSec || 0)
  return Math.max(assetDuration, videoDuration.value, 0)
})

const trimSelectionStyle = computed(() => {
  const duration = trimMax.value
  if (duration <= 0) return { left: '0%', width: '0%' }

  const start = Math.max(0, Math.min(trimRange.value[0], duration))
  const end = Math.max(start, Math.min(trimRange.value[1], duration))
  return {
    left: `${(start / duration) * 100}%`,
    width: `${((end - start) / duration) * 100}%`,
  }
})

const playheadStyle = computed(() => {
  const duration = trimMax.value
  if (duration <= 0) return { left: '0%' }

  const clampedTime = Math.max(0, Math.min(videoCurrentTime.value, duration))
  return { left: `${(clampedTime / duration) * 100}%` }
})

const timelineTicks = computed(() => {
  const duration = trimMax.value
  if (duration <= 0) return []

  const segments = duration <= 15 ? 4 : duration <= 60 ? 6 : 8
  return Array.from({ length: segments + 1 }, (_, index) => {
    const ratio = index / segments
    return {
      left: `${ratio * 100}%`,
      label: formatSeconds(duration * ratio),
    }
  })
})

const trainingWizardSteps = computed(() => [
  {
    id: 1 as TrainingStep,
    title: t('activities.dialog.steps.uploadTitle'),
    description: t('activities.dialog.steps.uploadDescription'),
  },
  {
    id: 2 as TrainingStep,
    title: t('activities.dialog.steps.trimTitle'),
    description: t('activities.dialog.steps.trimDescription'),
  },
  {
    id: 3 as TrainingStep,
    title: t('activities.dialog.steps.annotateTitle'),
    description: t('activities.dialog.steps.annotateDescription'),
  },
  {
    id: 4 as TrainingStep,
    title: t('activities.dialog.steps.trainTitle'),
    description: t('activities.dialog.steps.trainDescription'),
  },
])

const canGoNext = computed(() => {
  if (trainingStep.value >= 4) return false
  return canOpenStep((trainingStep.value + 1) as TrainingStep)
})

function isTrainingJobActive(status: TrainingJobStatus | string | null | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING'
}

function stopTrainingJobsPolling() {
  if (trainingJobsPollHandle.value !== null) {
    clearInterval(trainingJobsPollHandle.value)
    trainingJobsPollHandle.value = null
  }
}

async function refreshTrainingJobs() {
  if (!trainingActivity.value?.id || refreshingTrainingJobs.value) return

  try {
    refreshingTrainingJobs.value = true
    const full = await apiClient.get(`/api/activities/${trainingActivity.value.id}`)
    if (trainingActivity.value?.id === full.data?.id) {
      trainingActivity.value = full.data
    }
  } catch (error) {
    console.error('Failed to refresh training jobs', error)
  } finally {
    refreshingTrainingJobs.value = false
  }
}

function syncTrainingJobsPolling() {
  const shouldPoll =
    trainingDialogVisible.value &&
    trainingStep.value === 4 &&
    trainingJobs.value.some((job) => isTrainingJobActive(job.status))

  if (!shouldPoll) {
    stopTrainingJobsPolling()
    return
  }

  if (trainingJobsPollHandle.value !== null) return

  trainingJobsPollHandle.value = setInterval(() => {
    void refreshTrainingJobs()
  }, 5000)
  void refreshTrainingJobs()
}

function getTrainingJobStatusTagType(status: TrainingJobStatus | string | null | undefined) {
  switch (status) {
    case 'RUNNING':
      return 'warning'
    case 'SUCCEEDED':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'CANCELLED':
      return 'info'
    case 'QUEUED':
    default:
      return ''
  }
}

function getTrainingJobLiveProgress(job: TrainingJob | null | undefined): TrainingJobLiveProgress | null {
  return job?.logs?.live && typeof job.logs.live === 'object' ? job.logs.live : null
}

function getTrainingJobHistory(job: TrainingJob | null | undefined): TrainingJobLogHistoryEntry[] {
  return Array.isArray(job?.logs?.history) ? job!.logs!.history! : []
}

function getTrainingJobPhaseText(phase: string | null | undefined): string {
  if (!phase) return t('common.misc.none')
  const key = `activities.dialog.trainingPhases.${phase}`
  const translated = t(key)
  return translated === key ? phase : translated
}

function getTrainingJobProgressPercent(job: TrainingJob): number {
  const live = getTrainingJobLiveProgress(job)
  if (live && Number.isFinite(live.percent)) {
    return Math.min(Math.max(Number(live.percent), 0), 100)
  }
  if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return 100
  }
  return 0
}

function formatTrainingMetric(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '—'
  return Number(value).toFixed(3)
}

function getTrainingJobSecondaryText(job: TrainingJob): string {
  const live = getTrainingJobLiveProgress(job)
  const parts: string[] = []

  if (live?.currentEpoch && live?.totalEpochs) {
    parts.push(`${t('activities.dialog.currentEpoch')}: ${live.currentEpoch}/${live.totalEpochs}`)
  }
  if (Number.isFinite(live?.trainLoss)) {
    parts.push(`loss: ${formatTrainingMetric(live?.trainLoss)}`)
  }
  if (Number.isFinite(live?.metrics?.f1)) {
    parts.push(`F1: ${formatTrainingMetric(live?.metrics?.f1)}`)
  }
  if (parts.length > 0) return parts.join(' · ')

  if (job.status === 'FAILED' && job.error) return job.error

  if (job.status === 'SUCCEEDED') {
    const bestEpoch = Number(job.logs?.bestEpoch || 0)
    const epochsTrained = Number(job.logs?.epochsTrained || 0)
    const summary: string[] = []
    if (bestEpoch > 0) summary.push(`${t('activities.dialog.bestEpoch')}: ${bestEpoch}`)
    if (epochsTrained > 0) summary.push(`${t('activities.dialog.epochsTrained')}: ${epochsTrained}`)
    if (Number.isFinite(job.logs?.durationSec)) {
      summary.push(`${t('activities.dialog.trainingDuration')}: ${Math.round(Number(job.logs?.durationSec))}s`)
    }
    if (summary.length > 0) return summary.join(' · ')
  }

  if (job.status === 'QUEUED') return t('activities.dialog.trainingQueuedHint')
  if (job.status === 'RUNNING') return t('activities.dialog.trainingRunningHint')
  if (job.status === 'CANCELLED') return t('activities.dialog.trainingCancelled')

  return '—'
}

function getTrainingJobHeartbeat(job: TrainingJob): string {
  const live = getTrainingJobLiveProgress(job)
  return formatDateTime(live?.updatedAt || job.updatedAt || job.createdAt)
}

function getTrainingJobHistoryText(entry: TrainingJobLogHistoryEntry): string {
  const parts: string[] = []
  if (entry.message) parts.push(entry.message)
  if (entry.currentEpoch && entry.totalEpochs) {
    parts.push(`${t('activities.dialog.currentEpoch')}: ${entry.currentEpoch}/${entry.totalEpochs}`)
  }
  if (Number.isFinite(entry.trainLoss)) {
    parts.push(`loss: ${formatTrainingMetric(entry.trainLoss)}`)
  }
  if (Number.isFinite(entry.metrics?.f1)) {
    parts.push(`F1: ${formatTrainingMetric(entry.metrics?.f1)}`)
  }
  return parts.join(' · ')
}

onMounted(async () => {
  await loadActivities()
  await loadCompanies()
})

onBeforeUnmount(() => {
  detachTrimDragListeners()
  detachAnnotationDragListeners()
  stopTrainingJobsPolling()
})

watch(
  [trainingDialogVisible, trainingStep, trainingJobs],
  () => {
    syncTrainingJobsPolling()
  },
  { deep: true }
)

function getTrainingUiStateStorageKey(activityId: number): string {
  return `activity-training-ui:${activityId}`
}

function loadPersistedTrainingUiState(activityId: number): PersistedTrainingUiState {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(getTrainingUiStateStorageKey(activityId))
    if (!raw) return {}

    const parsed = JSON.parse(raw) as PersistedTrainingUiState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistTrainingUiState() {
  if (typeof window === 'undefined' || !trainingActivity.value?.id) return

  const state: PersistedTrainingUiState = {
    step: trainingStep.value,
    trimAssetId: trimAssetId.value,
    annotationAssetId: annotationsAssetId.value,
  }

  window.localStorage.setItem(
    getTrainingUiStateStorageKey(trainingActivity.value.id),
    JSON.stringify(state)
  )
}

function setTrainingStep(step: TrainingStep) {
  trainingStep.value = step
  persistTrainingUiState()
}

function goToPreviousTrainingStep() {
  if (trainingStep.value > 1) {
    setTrainingStep((trainingStep.value - 1) as TrainingStep)
  }
}

function goToNextTrainingStep() {
  if (trainingStep.value < 4) {
    setTrainingStep((trainingStep.value + 1) as TrainingStep)
  }
}

function canOpenStep(step: TrainingStep): boolean {
  if (step === 1) return true
  if (step === 2) return trainingAssets.value.length > 0
  if (step === 3) return trainingAssets.value.length > 0
  if (step === 4) return trainingAssets.value.length > 0
  return false
}

function openTrainingStep(step: TrainingStep) {
  if (!canOpenStep(step)) return
  setTrainingStep(step)
}

async function loadActivities() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/activities')
    activities.value = response.data
  } catch (error) {
    ElMessage.error(t('activities.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadCompanies() {
  try {
    const response = await apiClient.get('/api/companies')
    companies.value = response.data
  } catch (error) {
    ElMessage.error(t('activities.loadCompaniesError'))
  }
}

async function handleSubmit(openTrainingAfterSave: boolean = false) {
  try {
    if (isEditing.value && editingActivityId.value) {
      await apiClient.put(`/api/activities/${editingActivityId.value}`, form.value)
      ElMessage.success(t('activities.updated'))
      if (openTrainingAfterSave) {
        await openTraining({ id: editingActivityId.value } as any)
      }
    } else {
      const created = await apiClient.post('/api/activities', form.value)
      ElMessage.success(t('activities.created'))
      if (openTrainingAfterSave) {
        await openTraining(created.data)
      }
    }
    resetForm()
    await loadActivities()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('activities.saveError'))
  }
}

async function publishActivity(id: number) {
  try {
    await ElMessageBox.confirm(
      t('activities.publishConfirmText'),
      t('activities.publishConfirmTitle'),
      { confirmButtonText: t('common.actions.publish'), cancelButtonText: t('common.actions.cancel'), type: 'warning' }
    )
    await apiClient.post(`/api/activities/${id}/publish`)
    ElMessage.success(t('activities.published'))
    await loadActivities()
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error.response?.data?.error as string | undefined
      if (msg && msg.includes('needs ACTIVE modelVersion')) {
        try {
          await ElMessageBox.confirm(
            t('activities.activeModelNeededText'),
            t('activities.activeModelNeededTitle'),
            { confirmButtonText: t('common.actions.openTraining'), cancelButtonText: t('common.actions.cancel'), type: 'info' }
          )
          const act = activities.value.find((a) => a.id === id)
          if (act) await openTraining(act)
        } catch {
          // ignore cancel
        }
        return
      }
      ElMessage.error(msg || t('activities.publishError'))
    }
  }
}

async function deprecateActivity(id: number) {
  try {
    await ElMessageBox.confirm(
      t('activities.deprecateConfirmText'),
      t('activities.publishConfirmTitle'),
      { confirmButtonText: t('activities.deprecateConfirmButton'), cancelButtonText: t('common.actions.cancel'), type: 'warning' }
    )
    await apiClient.post(`/api/activities/${id}/deprecate`)
    ElMessage.success(t('activities.deprecated'))
    await loadActivities()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('activities.updateError'))
    }
  }
}

async function deleteActivity(id: number) {
  try {
    await ElMessageBox.confirm(
      t('activities.deleteConfirmText'),
      t('activities.deleteConfirmTitle'),
      { confirmButtonText: t('common.actions.delete'), cancelButtonText: t('common.actions.cancel'), type: 'warning' }
    )
    await apiClient.delete(`/api/activities/${id}`)
    ElMessage.success(t('activities.deleted'))
    await loadActivities()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('activities.deleteError'))
    }
  }
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(activity: Activity) {
  isEditing.value = true
  editingActivityId.value = activity.id
  dialogVisible.value = true
  form.value = {
    name: activity.name,
    description: activity.description || '',
  }
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingActivityId.value = null
  form.value = {
    name: '',
    description: '',
  }
}

function isVideoAsset(asset: TrainingAsset | null | undefined): boolean {
  return Boolean(asset?.mime?.startsWith('video/'))
}

function isImageAsset(asset: TrainingAsset | null | undefined): boolean {
  return Boolean(asset?.mime?.startsWith('image/'))
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '—'
  const total = Number(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const secondsText = seconds >= 10 ? seconds.toFixed(1).padStart(4, '0') : seconds.toFixed(1).padStart(3, '0')

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondsText}`
  }

  return `${String(minutes).padStart(2, '0')}:${secondsText}`
}

function resetTrimForAsset(asset: TrainingAsset | null | undefined) {
  detachTrimDragListeners()
  videoCurrentTime.value = 0
  videoDuration.value = Number(asset?.durationSec || 0)
  const duration = Math.max(Number(asset?.durationSec || 0), 0)
  trimRange.value = duration > 0 ? [0, duration] : [0, 0]
  selectedAnnotationIndex.value = null
}

async function openTraining(activity: Activity, preferredAssetId?: number) {
  try {
    const full = await apiClient.get(`/api/activities/${activity.id}`)
    trainingActivity.value = full.data
    trainingDialogVisible.value = true
    const assets: TrainingAsset[] = trainingActivity.value?.trainingAssets || []
    const persistedUiState = loadPersistedTrainingUiState(activity.id)
    const persistedStep = persistedUiState.step && canOpenStep(persistedUiState.step) ? persistedUiState.step : 1

    annotationDraftsByAssetId.value = {}

    const preferredAnnotationAsset =
      assets.find((asset) => asset.id === preferredAssetId) ||
      assets.find((asset) => asset.id === persistedUiState.annotationAssetId) ||
      assets.find((asset) => asset.id === annotationsAssetId.value) ||
      assets[0] ||
      null

    const preferredTrimAsset =
      assets.find((asset) => asset.id === persistedUiState.trimAssetId && isVideoAsset(asset)) ||
      assets.find((asset) => asset.id === trimAssetId.value && isVideoAsset(asset)) ||
      assets.find((asset) => asset.id === preferredAssetId && isVideoAsset(asset)) ||
      assets.find((asset) => isVideoAsset(asset)) ||
      null

    if (preferredTrimAsset) {
      onSelectAssetForTrim(preferredTrimAsset.id)
    } else {
      trimAssetId.value = null
      resetTrimForAsset(null)
    }

    if (preferredAnnotationAsset) {
      onSelectAssetForAnnotations(preferredAnnotationAsset.id)
    } else {
      annotationsAssetId.value = null
      annotationsDraft.value = []
      annotationForm.value = { startSec: null, endSec: null, type: 'POSITIVE' }
      selectedAnnotationIndex.value = null
    }

    setTrainingStep(persistedStep)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.trainingLoadError'))
  }
}

function onPickFiles() {
  uploadInputRef.value?.click()
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (!files.length || !trainingActivity.value) return

  try {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)

    await apiClient.post(`/api/activities/${trainingActivity.value.id}/training-assets`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    ElMessage.success(t('activities.filesUploaded'))
    await openTraining(trainingActivity.value)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('activities.filesUploadError'))
  } finally {
    if (input) input.value = ''
  }
}

function onSelectAssetForAnnotations(assetId: number) {
  if (annotationsAssetId.value !== null) {
    annotationDraftsByAssetId.value[annotationsAssetId.value] = [...annotationsDraft.value]
  }

  annotationsAssetId.value = assetId
  const asset = trainingAssets.value.find((a) => a.id === assetId)
  const existingDraft = annotationDraftsByAssetId.value[assetId]
  annotationsDraft.value = existingDraft
    ? [...existingDraft]
    : (asset?.annotations || []).map((a: any) => ({
        startSec: Number(a.startSec),
        endSec: Number(a.endSec),
        type: (a.type as any) || 'POSITIVE',
      }))
  annotationForm.value = { startSec: null, endSec: null, type: 'POSITIVE' }
  selectedAnnotationIndex.value = null
  persistTrainingUiState()
}

function syncCurrentAnnotationDrafts() {
  if (annotationsAssetId.value === null) return
  annotationDraftsByAssetId.value[annotationsAssetId.value] = annotationsDraft.value.map((interval) => ({
    startSec: interval.startSec,
    endSec: interval.endSec,
    type: interval.type,
  }))
}

function onSelectAssetForTrim(assetId: number) {
  trimAssetId.value = assetId
  const asset = trainingAssets.value.find((a) => a.id === assetId)
  resetTrimForAsset(asset)
  persistTrainingUiState()
}

function onVideoLoadedMetadata(event: Event) {
  const video = event.target as HTMLVideoElement
  if (!video) return

  videoDuration.value = Number.isFinite(video.duration) ? video.duration : 0
  if (trimRange.value[1] <= 0 && videoDuration.value > 0) {
    trimRange.value = [0, videoDuration.value]
  }
}

function onVideoTimeUpdate(event: Event) {
  const video = event.target as HTMLVideoElement
  if (!video) return
  videoCurrentTime.value = Number.isFinite(video.currentTime) ? video.currentTime : 0
}

function seekVideoTo(value: number | null | undefined) {
  if (!videoPreviewRef.value || !Number.isFinite(value)) return
  const max = trimMax.value
  const clamped = Math.min(Math.max(Number(value), 0), max > 0 ? max : Number(value))
  videoPreviewRef.value.currentTime = clamped
  videoCurrentTime.value = clamped
}

function clampToDuration(value: number): number {
  const duration = trimMax.value
  if (duration <= 0) return 0
  return Math.min(Math.max(value, 0), duration)
}

function roundToStep(value: number): number {
  return Number(value.toFixed(1))
}

function timeToPercent(value: number): number {
  const duration = trimMax.value
  if (duration <= 0) return 0
  return (clampToDuration(value) / duration) * 100
}

function getAnnotationSegmentStyle(interval: { startSec: number; endSec: number }) {
  const duration = trimMax.value
  if (duration <= 0) {
    return { left: '0%', width: '0%' }
  }

  const start = Math.max(0, Math.min(interval.startSec, duration))
  const end = Math.max(start, Math.min(interval.endSec, duration))
  return {
    left: `${(start / duration) * 100}%`,
    width: `${Math.max(((end - start) / duration) * 100, 1)}%`,
  }
}

function pointerClientXToTime(clientX: number, timeline: HTMLDivElement | null): number {
  const duration = trimMax.value
  if (!timeline || duration <= 0) return 0

  const rect = timeline.getBoundingClientRect()
  if (rect.width <= 0) return 0

  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  return ratio * duration
}

function seekVideoFromTimeline(event: MouseEvent) {
  if (activeTrimDrag.value || activeAnnotationDrag.value) return

  const timeline =
    trainingStep.value === 3
      ? annotationTimelineRef.value
      : trimTimelineRef.value

  seekVideoTo(pointerClientXToTime(event.clientX, timeline))
}

function beginTrimDrag(mode: TrimDragMode, event: PointerEvent) {
  if (trimMax.value <= 0) return

  event.preventDefault()
  event.stopPropagation()

  activeTrimDrag.value = {
    mode,
    pointerStartX: event.clientX,
    initialStart: trimRange.value[0],
    initialEnd: trimRange.value[1],
  }

  window.addEventListener('pointermove', onTrimPointerMove)
  window.addEventListener('pointerup', finishTrimDrag)
}

function onTrimPointerMove(event: PointerEvent) {
  const drag = activeTrimDrag.value
  const timeline = trimTimelineRef.value
  const duration = trimMax.value
  if (!drag || !timeline || duration <= 0) return

  const rect = timeline.getBoundingClientRect()
  if (rect.width <= 0) return

  const deltaSeconds = ((event.clientX - drag.pointerStartX) / rect.width) * duration
  const minimumSpan = 0.1

  if (drag.mode === 'start') {
    const nextStart = roundToStep(Math.min(clampToDuration(drag.initialStart + deltaSeconds), trimRange.value[1] - minimumSpan))
    trimRange.value = [nextStart, trimRange.value[1]]
    return
  }

  if (drag.mode === 'end') {
    const nextEnd = roundToStep(Math.max(clampToDuration(drag.initialEnd + deltaSeconds), trimRange.value[0] + minimumSpan))
    trimRange.value = [trimRange.value[0], nextEnd]
    return
  }

  const span = drag.initialEnd - drag.initialStart
  const maxStart = Math.max(duration - span, 0)
  const nextStart = Math.min(Math.max(drag.initialStart + deltaSeconds, 0), maxStart)
  const roundedStart = roundToStep(nextStart)
  trimRange.value = [roundedStart, roundToStep(roundedStart + span)]
}

function finishTrimDrag() {
  detachTrimDragListeners()
}

function detachTrimDragListeners() {
  activeTrimDrag.value = null
  window.removeEventListener('pointermove', onTrimPointerMove)
  window.removeEventListener('pointerup', finishTrimDrag)
}

function beginAnnotationDrag(index: number, mode: AnnotationDragMode, event: PointerEvent) {
  const interval = annotationsDraft.value[index]
  if (!interval || trimMax.value <= 0) return

  event.preventDefault()
  event.stopPropagation()

  selectAnnotationInterval(index)
  activeAnnotationDrag.value = {
    index,
    mode,
    pointerStartX: event.clientX,
    initialStart: interval.startSec,
    initialEnd: interval.endSec,
  }

  window.addEventListener('pointermove', onAnnotationPointerMove)
  window.addEventListener('pointerup', finishAnnotationDrag)
}

function onAnnotationPointerMove(event: PointerEvent) {
  const drag = activeAnnotationDrag.value
  const timeline = annotationTimelineRef.value
  const duration = trimMax.value
  if (!drag || !timeline || duration <= 0) return

  const currentInterval = annotationsDraft.value[drag.index]
  if (!currentInterval) {
    finishAnnotationDrag()
    return
  }

  const rect = timeline.getBoundingClientRect()
  if (rect.width <= 0) return

  const deltaSeconds = ((event.clientX - drag.pointerStartX) / rect.width) * duration
  const minimumSpan = 0.1
  let nextStart = drag.initialStart
  let nextEnd = drag.initialEnd

  if (drag.mode === 'start') {
    nextStart = Math.min(clampToDuration(drag.initialStart + deltaSeconds), drag.initialEnd - minimumSpan)
  } else if (drag.mode === 'end') {
    nextEnd = Math.max(clampToDuration(drag.initialEnd + deltaSeconds), drag.initialStart + minimumSpan)
  } else {
    const span = drag.initialEnd - drag.initialStart
    const maxStart = Math.max(duration - span, 0)
    nextStart = Math.min(Math.max(drag.initialStart + deltaSeconds, 0), maxStart)
    nextEnd = nextStart + span
  }

  const roundedStart = roundToStep(nextStart)
  const roundedEnd = roundToStep(Math.max(nextEnd, roundedStart + minimumSpan))
  annotationsDraft.value[drag.index] = {
    ...currentInterval,
    startSec: roundedStart,
    endSec: roundedEnd,
  }
  syncCurrentAnnotationDrafts()

  if (selectedAnnotationIndex.value === drag.index) {
    annotationForm.value.startSec = roundedStart
    annotationForm.value.endSec = roundedEnd
    annotationForm.value.type = annotationsDraft.value[drag.index].type
  }
}

function finishAnnotationDrag() {
  detachAnnotationDragListeners()
}

function detachAnnotationDragListeners() {
  activeAnnotationDrag.value = null
  window.removeEventListener('pointermove', onAnnotationPointerMove)
  window.removeEventListener('pointerup', finishAnnotationDrag)
}

function setTrimStartFromCurrentTime() {
  const max = trimRange.value[1]
  const nextStart = Math.min(videoCurrentTime.value, max > 0 ? max : videoCurrentTime.value)
  trimRange.value = [Number(nextStart.toFixed(1)), trimRange.value[1]]
}

function setTrimEndFromCurrentTime() {
  const min = trimRange.value[0]
  const nextEnd = Math.max(videoCurrentTime.value, min)
  trimRange.value = [trimRange.value[0], Number(nextEnd.toFixed(1))]
}

function setAnnotationStartFromCurrentTime() {
  annotationForm.value.startSec = Number(videoCurrentTime.value.toFixed(1))
}

function setAnnotationEndFromCurrentTime() {
  annotationForm.value.endSec = Number(videoCurrentTime.value.toFixed(1))
}

function useTrimRangeForAnnotation() {
  annotationForm.value.startSec = roundToStep(trimRange.value[0])
  annotationForm.value.endSec = roundToStep(trimRange.value[1])
}

function selectAnnotationInterval(index: number) {
  const interval = annotationsDraft.value[index]
  if (!interval) return

  selectedAnnotationIndex.value = index
  annotationForm.value.startSec = interval.startSec
  annotationForm.value.endSec = interval.endSec
  annotationForm.value.type = interval.type
  seekVideoTo(interval.startSec)
}

function clearAnnotationSelection() {
  selectedAnnotationIndex.value = null
  annotationForm.value.startSec = null
  annotationForm.value.endSec = null
  annotationForm.value.type = 'POSITIVE'
}

function startNewAnnotationInterval() {
  const nextType = annotationForm.value.type
  selectedAnnotationIndex.value = null
  annotationForm.value.type = nextType

  if (isVideoAsset(selectedAnnotationAsset.value)) {
    const startSec = roundToStep(videoCurrentTime.value)
    const rawEnd = trimMax.value > 0 ? Math.min(startSec + 1, trimMax.value) : startSec + 1
    const endSec = roundToStep(rawEnd > startSec ? rawEnd : startSec + 0.1)
    annotationForm.value.startSec = startSec
    annotationForm.value.endSec = endSec
    return
  }

  annotationForm.value.startSec = null
  annotationForm.value.endSec = null
}

async function createClipFromSelection() {
  const asset = selectedTrimAsset.value
  if (!asset) return

  if (!isVideoAsset(asset)) {
    ElMessage.error(t('activities.clipOnlyForVideo'))
    return
  }

  const [startSec, endSec] = trimRange.value
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    ElMessage.error(t('activities.invalidTrimRange'))
    return
  }

  try {
    creatingClip.value = true
    const response = await apiClient.post(`/api/training-assets/${asset.id}/clips`, {
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
    })
    ElMessage.success(t('activities.clipCreated'))
    await openTraining(trainingActivity.value, response.data.id)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.clipCreateError'))
  } finally {
    creatingClip.value = false
  }
}

async function deleteTrainingAsset(asset: TrainingAsset) {
  try {
    await ElMessageBox.confirm(
      t('activities.dialog.deleteAssetConfirmText'),
      t('activities.dialog.deleteAssetConfirmTitle'),
      {
        confirmButtonText: t('common.actions.delete'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    deletingTrainingAssetId.value = asset.id
    await apiClient.delete(`/api/training-assets/${asset.id}`)
    ElMessage.success(t('activities.dialog.deleteAssetSuccess'))

    if (trainingActivity.value) {
      await openTraining(trainingActivity.value)
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('activities.dialog.deleteAssetError'))
    }
  } finally {
    deletingTrainingAssetId.value = null
  }
}

function addOrUpdateAnnotationInterval() {
  if (!annotationsAssetId.value) return
  const startSec = Number(annotationForm.value.startSec)
  const endSec = Number(annotationForm.value.endSec)
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    ElMessage.error(t('activities.invalidInterval'))
    return
  }

  if (selectedAnnotationIndex.value !== null && annotationsDraft.value[selectedAnnotationIndex.value]) {
    annotationsDraft.value[selectedAnnotationIndex.value] = {
      startSec,
      endSec,
      type: annotationForm.value.type,
    }
  } else {
    annotationsDraft.value = [
      ...annotationsDraft.value,
      { startSec, endSec, type: annotationForm.value.type },
    ].sort((a, b) => a.startSec - b.startSec)
  }

  syncCurrentAnnotationDrafts()
  clearAnnotationSelection()
}

function removeAnnotationInterval(idx: number) {
  annotationsDraft.value = annotationsDraft.value.filter((_, i) => i !== idx)
  syncCurrentAnnotationDrafts()
  if (selectedAnnotationIndex.value === idx) {
    clearAnnotationSelection()
  } else if (selectedAnnotationIndex.value !== null && selectedAnnotationIndex.value > idx) {
    selectedAnnotationIndex.value -= 1
  }
}

async function saveAnnotations() {
  if (!annotationsAssetId.value) return
  try {
    // UX: if user filled the form but didn't click "Добавить интервал" — auto-add it
    const hasDraftFormValues =
      annotationForm.value.startSec !== null || annotationForm.value.endSec !== null

    if (hasDraftFormValues) {
      const startSec = Number(annotationForm.value.startSec)
      const endSec = Number(annotationForm.value.endSec)
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
        if (selectedAnnotationIndex.value !== null && annotationsDraft.value[selectedAnnotationIndex.value]) {
          annotationsDraft.value[selectedAnnotationIndex.value] = {
            startSec,
            endSec,
            type: annotationForm.value.type,
          }
        } else {
          annotationsDraft.value = [
            ...annotationsDraft.value,
            { startSec, endSec, type: annotationForm.value.type },
          ].sort((a, b) => a.startSec - b.startSec)
        }

        syncCurrentAnnotationDrafts()
        clearAnnotationSelection()
      }
    }

    await apiClient.post(`/api/training-assets/${annotationsAssetId.value}/annotations`, {
      intervals: annotationsDraft.value.map((i) => ({
        startSec: i.startSec,
        endSec: i.endSec,
        type: i.type,
      })),
    })
    annotationDraftsByAssetId.value[annotationsAssetId.value] = [...annotationsDraft.value]
    ElMessage.success(t('activities.annotationsSaved'))
    await openTraining(trainingActivity.value, annotationsAssetId.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.annotationsSaveError'))
  }
}

async function startTraining() {
  if (!trainingActivity.value) return
  try {
    await apiClient.post(`/api/activities/${trainingActivity.value.id}/train`, {})
    ElMessage.success(t('activities.trainingStarted'))
    await openTraining(trainingActivity.value, annotationsAssetId.value ?? undefined)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.trainingStartError'))
  }
}

async function cancelTraining(job: TrainingJob) {
  try {
    await ElMessageBox.confirm(
      t('activities.dialog.cancelTrainingConfirmText', { id: job.id }),
      t('activities.dialog.cancelTrainingConfirmTitle'),
      {
        confirmButtonText: t('activities.dialog.cancelTraining'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    await apiClient.post(`/api/training-jobs/${job.id}/cancel`, {})
    ElMessage.success(t('activities.dialog.cancelTrainingSuccess'))
    await refreshTrainingJobs()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('activities.dialog.cancelTrainingError'))
    }
  }
}

async function promoteModelVersion(modelVersionId: number) {
  try {
    await apiClient.post(`/api/models/${modelVersionId}/promote`, {})
    ElMessage.success(t('activities.modelActivated'))
    if (trainingActivity.value) await openTraining(trainingActivity.value, annotationsAssetId.value ?? undefined)
    if (selectedActivity.value) {
      const full = await apiClient.get(`/api/activities/${selectedActivity.value.id}`)
      selectedActivity.value = full.data
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || t('activities.modelActivateError'))
  }
}

async function openCompanySettings(activity: Activity) {
  // Load full activity (including companyActivities + modelVersions)
  try {
    const full = await apiClient.get(`/api/activities/${activity.id}`)
    selectedActivity.value = full.data
  } catch (error) {
    ElMessage.error(t('activities.detailsLoadError'))
    return
  }

  companyDialogVisible.value = true

  // Build map of existing settings for this activity
  const existingByCompanyId = new Map<number, any>()
  const caList = (selectedActivity.value as any)?.companyActivities || []
  for (const ca of caList) {
    if (ca?.companyId) existingByCompanyId.set(ca.companyId, ca)
  }

  // Initialize settings for all companies
  const next: Record<number, CompanyActivity> = {}
  for (const c of companies.value) {
    const existing = existingByCompanyId.get(c.id)
    const overrides = existing?.overrides ?? null
    next[c.id] = {
      enabled: Boolean(existing?.enabled),
      allowedModelVersionId: existing?.allowedModelVersionId ?? null,
      activeModelVersionId: existing?.activeModelVersionId ?? null,
      overrides,
      overridesText: overrides ? JSON.stringify(overrides, null, 2) : '',
    }
  }

  companySettings.value = next
}

async function saveCompanySettings() {
  if (!selectedActivity.value) return

  try {
    const activityId = selectedActivity.value.id
    const promises = companies.value.map((company: Company) => {
      const settings = companySettings.value[company.id] || { enabled: false }

      // Parse overrides JSON (if provided)
      let overrides: any | null | undefined = null
      if (settings.overridesText && settings.overridesText.trim().length > 0) {
        try {
          overrides = JSON.parse(settings.overridesText)
        } catch (e) {
          throw new Error(t('activities.invalidOverridesJson', { name: company.name }))
        }
      } else {
        overrides = null
      }

      return apiClient.post(`/api/activities/${activityId}/companies/${company.id}/enable`, {
        enabled: Boolean(settings.enabled),
        allowedModelVersionId: settings.allowedModelVersionId ?? null,
        activeModelVersionId: settings.activeModelVersionId ?? null,
        overrides,
      })
    })

    await Promise.all(promises)
    ElMessage.success(t('activities.companySettingsSaved'))
    companyDialogVisible.value = false
    await loadActivities()
  } catch (error) {
    ElMessage.error((error as any)?.message || t('activities.companySettingsSaveError'))
  }
}

function toggleCompanyAccess(companyId: number, enabled: boolean) {
  if (!companySettings.value[companyId]) {
    companySettings.value[companyId] = { enabled, allowedModelVersionId: null, activeModelVersionId: null, overrides: null, overridesText: '' }
  } else {
    companySettings.value[companyId].enabled = enabled
  }
}

function getActivityActions(row: Activity) {
  const actions = []

  if (row.status === 'DRAFT') {
    actions.push({
      key: 'publish',
      label: t('common.actions.publish'),
      icon: Check,
    })
  }

  if (row.status === 'ACTIVE') {
    actions.push({
      key: 'deprecate',
      label: t('activities.deprecateButton'),
      icon: Close,
    })
  }

  if (row.status !== 'DEPRECATED') {
    actions.push({
      key: 'edit',
      label: t('common.actions.edit'),
      icon: Edit,
    })
  }

  actions.push({
    key: 'training',
    label: t('common.actions.openTraining'),
  })

  if (row.status === 'ACTIVE') {
    actions.push({
      key: 'companies',
      label: t('layout.menu.companies'),
      icon: Setting,
    })
  }

  actions.push({
    key: 'delete',
    label: t('common.actions.delete'),
    icon: Delete,
    divided: true,
    danger: true,
  })

  return actions
}

function handleActivityAction(action: ActivityTableAction, row: Activity) {
  if (action === 'publish') {
    publishActivity(row.id)
    return
  }

  if (action === 'deprecate') {
    deprecateActivity(row.id)
    return
  }

  if (action === 'edit') {
    startEdit(row)
    return
  }

  if (action === 'training') {
    openTraining(row)
    return
  }

  if (action === 'companies') {
    openCompanySettings(row)
    return
  }

  deleteActivity(row.id)
}

function onActivityAction(action: string, row: Activity) {
  handleActivityAction(action as ActivityTableAction, row)
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('activities.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ t('activities.createButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="activities" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="60" />
        
        <el-table-column prop="code" :label="t('activities.table.code')" min-width="150">
          <template #default="{ row }">
            <el-tag>{{ row.code }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />
        
        <el-table-column :label="t('common.labels.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ translateActivityStatus(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('activities.table.companiesCount')" width="100" align="center">
          <template #default="{ row }">
            {{ row._count?.companyActivities || 0 }}
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.actions')" width="112" fixed="right" align="center">
          <template #default="{ row }">
            <TableActionsMenu
              :actions="getActivityActions(row)"
              @select="onActivityAction($event, row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Создание/редактирование активности -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('activities.dialog.editTitle') : t('activities.dialog.createTitle')"
      width="600px"
    >
      <el-form :model="form" label-width="150px">
        <el-form-item :label="t('activities.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('activities.dialog.namePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('activities.dialog.description')">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :placeholder="t('activities.dialog.descriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="dialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="handleSubmit(false)">
          {{ isEditing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
        <el-button type="success" @click="handleSubmit(true)">
          {{ isEditing ? t('activities.dialog.saveAndTrainEdit') : t('activities.dialog.saveAndTrainCreate') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Обучение / данные активности -->
    <el-dialog
      v-model="trainingDialogVisible"
      :title="t('activities.dialog.trainingTitle', { name: trainingActivity?.name || '' })"
      width="1100px"
    >
      <div class="training-wizard">
        <div class="training-step-grid">
          <button
            v-for="step in trainingWizardSteps"
            :key="step.id"
            type="button"
            class="training-step-card"
            :class="{ 'is-active': trainingStep === step.id, 'is-locked': !canOpenStep(step.id) }"
            :disabled="!canOpenStep(step.id)"
            @click="openTrainingStep(step.id)"
          >
            <span class="training-step-index">{{ step.id }}</span>
            <span class="training-step-copy">
              <span class="training-step-title">{{ step.title }}</span>
              <span class="training-step-description">{{ step.description }}</span>
            </span>
          </button>
        </div>

        <div v-if="trainingStep === 1">
          <el-card shadow="never">
            <div class="training-step-header">
              <div>
                <div class="training-step-content-title">{{ t('activities.dialog.steps.uploadTitle') }}</div>
                <div class="training-step-content-hint">{{ t('activities.dialog.stepUploadHint') }}</div>
              </div>
              <div style="flex:1;"></div>
              <input ref="uploadInputRef" type="file" multiple style="display:none" @change="onFilesSelected" />
              <el-button type="primary" @click="onPickFiles">{{ t('common.actions.upload') }}</el-button>
            </div>

            <div v-if="trainingAssets.length === 0" class="training-empty-state">
              {{ t('activities.dialog.stepUploadEmpty') }}
            </div>

            <el-table v-else :data="trainingAssets" style="width: 100%">
              <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
              <el-table-column :label="t('activities.dialog.link')" min-width="240">
                <template #default="{ row }">
                  <el-link :href="row.uri" target="_blank">{{ row.uri }}</el-link>
                </template>
              </el-table-column>
              <el-table-column prop="mime" :label="t('activities.dialog.mimeType')" width="160" />
              <el-table-column :label="t('activities.dialog.duration')" width="110">
                <template #default="{ row }">{{ formatSeconds(row.durationSec) }}</template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.annotations')" width="110">
                <template #default="{ row }">{{ (row.annotations || []).length }}</template>
              </el-table-column>
              <el-table-column width="120">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    type="danger"
                    :loading="deletingTrainingAssetId === row.id"
                    @click="deleteTrainingAsset(row)"
                  >
                    {{ t('common.actions.delete') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>

        <div v-else-if="trainingStep === 2">
          <el-row :gutter="12">
            <el-col :span="10">
              <el-card shadow="never">
                <div class="training-step-header">
                  <div>
                    <div class="training-step-content-title">{{ t('activities.dialog.steps.trimTitle') }}</div>
                    <div class="training-step-content-hint">{{ t('activities.dialog.stepTrimHint') }}</div>
                  </div>
                </div>

                <div v-if="trainingVideoAssets.length === 0" class="training-empty-state">
                  {{ t('activities.dialog.stepTrimEmpty') }}
                </div>

                <el-table v-else :data="trainingVideoAssets" style="width: 100%">
                  <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
                  <el-table-column :label="t('activities.dialog.link')" min-width="220">
                    <template #default="{ row }">
                      <el-link :href="row.uri" target="_blank">{{ row.uri }}</el-link>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('activities.dialog.duration')" width="100">
                    <template #default="{ row }">{{ formatSeconds(row.durationSec) }}</template>
                  </el-table-column>
                  <el-table-column width="120">
                    <template #default="{ row }">
                      <el-button size="small" :type="trimAssetId === row.id ? 'primary' : undefined" @click="onSelectAssetForTrim(row.id)">
                        {{ t('activities.dialog.selectVideo') }}
                      </el-button>
                    </template>
                  </el-table-column>
                  <el-table-column width="120">
                    <template #default="{ row }">
                      <el-button
                        size="small"
                        type="danger"
                        :loading="deletingTrainingAssetId === row.id"
                        @click="deleteTrainingAsset(row)"
                      >
                        {{ t('common.actions.delete') }}
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :span="14">
              <el-card shadow="never">
                <div v-if="!selectedTrimAsset" class="training-empty-state">
                  {{ t('activities.dialog.selectVideoHint') }}
                </div>

                <div v-else class="asset-preview-card" style="margin-bottom: 0;">
                  <div class="asset-preview-header">
                    <div class="asset-preview-title">{{ t('activities.dialog.previewTitle') }}</div>
                    <div class="asset-preview-meta">
                      <span>{{ t('activities.dialog.currentTime') }}: {{ formatSeconds(videoCurrentTime) }}</span>
                      <span>{{ t('activities.dialog.duration') }}: {{ formatSeconds(selectedTrimAsset?.durationSec ?? videoDuration) }}</span>
                    </div>
                  </div>

                  <div class="asset-preview-body">
                    <video
                      ref="videoPreviewRef"
                      class="training-video"
                      :src="selectedTrimAsset?.uri"
                      controls
                      preload="metadata"
                      @loadedmetadata="onVideoLoadedMetadata"
                      @timeupdate="onVideoTimeUpdate"
                    />

                    <div class="trim-panel">
                      <div class="trim-panel-header">
                        <div class="trim-panel-title">{{ t('activities.dialog.trimTitle') }}</div>
                        <div class="trim-panel-hint">{{ t('activities.dialog.trimHint') }}</div>
                      </div>

                      <div class="editor-timeline-header">
                        <div class="editor-timeline-title">{{ t('activities.dialog.timelineTitle') }}</div>
                        <div class="editor-timeline-hint">{{ t('activities.dialog.timelineHint') }}</div>
                      </div>

                      <div
                        ref="trimTimelineRef"
                        class="editor-timeline-shell"
                        :class="{ 'is-dragging': Boolean(activeTrimDrag) }"
                        @click="seekVideoFromTimeline"
                      >
                        <div class="editor-timeline-lane editor-timeline-lane--trim">
                          <div class="editor-lane-base"></div>
                          <button
                            type="button"
                            class="trim-selection-band"
                            :style="trimSelectionStyle"
                            @pointerdown="beginTrimDrag('range', $event)"
                          />
                          <button
                            type="button"
                            class="trim-handle trim-handle--start"
                            :style="{ left: `${timeToPercent(trimRange[0])}%` }"
                            @pointerdown="beginTrimDrag('start', $event)"
                          />
                          <button
                            type="button"
                            class="trim-handle trim-handle--end"
                            :style="{ left: `${timeToPercent(trimRange[1])}%` }"
                            @pointerdown="beginTrimDrag('end', $event)"
                          />
                        </div>
                        <div class="editor-playhead" :style="playheadStyle"></div>
                      </div>

                      <div class="editor-ticks">
                        <span
                          v-for="tick in timelineTicks"
                          :key="tick.left"
                          class="editor-tick"
                          :style="{ left: tick.left }"
                        >
                          {{ tick.label }}
                        </span>
                      </div>

                      <div class="trim-values">
                        <button class="trim-chip" type="button" @click="seekVideoTo(trimRange[0])">
                          {{ t('activities.dialog.trimStart') }}: {{ formatSeconds(trimRange[0]) }}
                        </button>
                        <button class="trim-chip" type="button" @click="seekVideoTo(trimRange[1])">
                          {{ t('activities.dialog.trimEnd') }}: {{ formatSeconds(trimRange[1]) }}
                        </button>
                      </div>

                      <div class="trim-actions">
                        <el-button size="small" @click="setTrimStartFromCurrentTime">
                          {{ t('activities.dialog.setTrimStartFromCurrent') }}
                        </el-button>
                        <el-button size="small" @click="setTrimEndFromCurrentTime">
                          {{ t('activities.dialog.setTrimEndFromCurrent') }}
                        </el-button>
                        <el-button size="small" @click="useTrimRangeForAnnotation">
                          {{ t('activities.dialog.useTrimRangeForAnnotation') }}
                        </el-button>
                        <el-button type="primary" size="small" :loading="creatingClip" @click="createClipFromSelection">
                          {{ t('activities.dialog.createClip') }}
                        </el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <div v-else-if="trainingStep === 3">
          <el-row :gutter="12">
            <el-col :span="10">
              <el-card shadow="never">
                <div class="training-step-header">
                  <div>
                    <div class="training-step-content-title">{{ t('activities.dialog.steps.annotateTitle') }}</div>
                    <div class="training-step-content-hint">{{ t('activities.dialog.stepAnnotateHint') }}</div>
                  </div>
                </div>

                <div v-if="trainingAssets.length === 0" class="training-empty-state">
                  {{ t('activities.dialog.stepAnnotateEmpty') }}
                </div>

                <el-table v-else :data="trainingAssets" style="width: 100%">
                  <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
                  <el-table-column :label="t('activities.dialog.link')" min-width="220">
                    <template #default="{ row }">
                      <el-link :href="row.uri" target="_blank">{{ row.uri }}</el-link>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('activities.dialog.annotations')" width="100">
                    <template #default="{ row }">{{ (row.annotations || []).length }}</template>
                  </el-table-column>
                  <el-table-column width="120">
                    <template #default="{ row }">
                      <el-button size="small" :type="annotationsAssetId === row.id ? 'primary' : undefined" @click="onSelectAssetForAnnotations(row.id)">
                        {{ t('activities.dialog.annotationEditShort') }}
                      </el-button>
                    </template>
                  </el-table-column>
                  <el-table-column width="120">
                    <template #default="{ row }">
                      <el-button
                        size="small"
                        type="danger"
                        :loading="deletingTrainingAssetId === row.id"
                        @click="deleteTrainingAsset(row)"
                      >
                        {{ t('common.actions.delete') }}
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>

            <el-col :span="14">
              <el-card shadow="never">
                <div class="training-step-header">
                  <div>
                    <div class="training-step-content-title">{{ t('activities.dialog.annotationsTitle') }}</div>
                    <div class="training-step-content-hint">{{ t('activities.dialog.annotationStepHint') }}</div>
                  </div>
                  <div style="flex:1;"></div>
                  <el-button type="primary" :disabled="!annotationsAssetId" @click="saveAnnotations">{{ t('common.actions.save') }}</el-button>
                </div>

                <div v-if="!annotationsAssetId" class="training-empty-state">
                  {{ t('activities.dialog.pickAssetHint') }}
                </div>

                <div v-else>
                  <div class="asset-preview-card">
                    <div class="asset-preview-header">
                      <div class="asset-preview-title">{{ t('activities.dialog.previewTitle') }}</div>
                    <div class="asset-preview-meta">
                      <span>{{ t('activities.dialog.currentTime') }}: {{ formatSeconds(videoCurrentTime) }}</span>
                      <span>{{ t('activities.dialog.duration') }}: {{ formatSeconds(selectedAnnotationAsset?.durationSec) }}</span>
                    </div>
                    </div>

                    <div v-if="isVideoAsset(selectedAnnotationAsset)" class="asset-preview-body">
                      <video
                        ref="videoPreviewRef"
                        class="training-video"
                        :src="selectedAnnotationAsset?.uri"
                        controls
                        preload="metadata"
                        @loadedmetadata="onVideoLoadedMetadata"
                        @timeupdate="onVideoTimeUpdate"
                      />

      <div class="editor-timeline-header">
                        <div class="editor-timeline-title">{{ t('activities.dialog.annotationTimelineTitle') }}</div>
                        <div class="editor-timeline-hint">{{ t('activities.dialog.annotationTimelineHint') }}</div>
                      </div>

                      <div
                        ref="annotationTimelineRef"
                        class="editor-timeline-shell"
                        :class="{ 'is-dragging': Boolean(activeAnnotationDrag) }"
                        @click="seekVideoFromTimeline"
                      >
                        <div class="editor-timeline-lane editor-timeline-lane--annotations">
                          <div class="editor-lane-base"></div>
                          <div
                            v-for="(interval, index) in annotationsDraft"
                            :key="`${interval.startSec}-${interval.endSec}-${index}`"
                            class="annotation-segment"
                            :class="[
                              interval.type === 'NEGATIVE' ? 'annotation-segment--negative' : 'annotation-segment--positive',
                              { 'is-selected': selectedAnnotationIndex === index },
                            ]"
                            :style="getAnnotationSegmentStyle(interval)"
                          >
                            <button
                              type="button"
                              class="annotation-segment-body"
                              @pointerdown="beginAnnotationDrag(index, 'range', $event)"
                              @click.stop="selectAnnotationInterval(index)"
                            >
                              <span class="annotation-segment-index">{{ index + 1 }}</span>
                              <span class="annotation-segment-time">
                                {{ formatSeconds(interval.startSec) }} - {{ formatSeconds(interval.endSec) }}
                              </span>
                            </button>
                            <button
                              type="button"
                              class="annotation-handle annotation-handle--start"
                              @pointerdown="beginAnnotationDrag(index, 'start', $event)"
                            />
                            <button
                              type="button"
                              class="annotation-handle annotation-handle--end"
                              @pointerdown="beginAnnotationDrag(index, 'end', $event)"
                            />
                          </div>
                        </div>
                        <div class="editor-playhead" :style="playheadStyle"></div>
                      </div>

                      <div class="editor-ticks">
                        <span
                          v-for="tick in timelineTicks"
                          :key="tick.left"
                          class="editor-tick"
                          :style="{ left: tick.left }"
                        >
                          {{ tick.label }}
                        </span>
                      </div>
                    </div>

                    <div v-else-if="isImageAsset(selectedAnnotationAsset)" class="asset-preview-body">
                      <img class="training-image" :src="selectedAnnotationAsset?.uri" :alt="selectedAnnotationAsset?.uri" />
                    </div>

                    <div v-else class="trim-image-hint">
                      {{ t('activities.dialog.unsupportedAssetHint') }}
                    </div>
                  </div>

                  <el-table :data="annotationsDraft" style="width: 100%; margin-bottom: 12px;">
                    <el-table-column :label="t('activities.dialog.intervalStart')" width="140">
                      <template #default="{ row }">{{ row.startSec }}</template>
                    </el-table-column>
                    <el-table-column :label="t('activities.dialog.intervalEnd')" width="140">
                      <template #default="{ row }">{{ row.endSec }}</template>
                    </el-table-column>
                    <el-table-column :label="t('common.labels.type')" width="140">
                      <template #default="{ row }">{{ translateTrainingAnnotationType(row.type) }}</template>
                    </el-table-column>
                    <el-table-column label="" width="120">
                      <template #default="{ $index }">
                        <el-button size="small" type="danger" @click="removeAnnotationInterval($index)">
                          {{ t('common.actions.delete') }}
                        </el-button>
                      </template>
                    </el-table-column>
                  </el-table>

                  <div
                    class="annotation-mode-banner"
                    :class="{ 'is-editing': selectedAnnotationIndex !== null }"
                  >
                    <template v-if="selectedAnnotationIndex !== null">
                      {{ t('activities.dialog.editingIntervalHint', { index: selectedAnnotationIndex + 1 }) }}
                    </template>
                    <template v-else>
                      {{ t('activities.dialog.newIntervalHint') }}
                    </template>
                  </div>

                  <el-row :gutter="12">
                    <el-col :span="8">
                      <div class="training-field-label">{{ t('activities.dialog.intervalStart') }}</div>
                      <el-input-number v-model="annotationForm.startSec" :min="0" :step="0.1" style="width: 100%;" />
                      <el-button text size="small" @click="setAnnotationStartFromCurrentTime">
                        {{ t('activities.dialog.useCurrentTimeForStart') }}
                      </el-button>
                    </el-col>
                    <el-col :span="8">
                      <div class="training-field-label">{{ t('activities.dialog.intervalEnd') }}</div>
                      <el-input-number v-model="annotationForm.endSec" :min="0" :step="0.1" style="width: 100%;" />
                      <el-button text size="small" @click="setAnnotationEndFromCurrentTime">
                        {{ t('activities.dialog.useCurrentTimeForEnd') }}
                      </el-button>
                    </el-col>
                    <el-col :span="8">
                      <div class="training-field-label">{{ t('common.labels.type') }}</div>
                      <el-select v-model="annotationForm.type" style="width: 100%;">
                        <el-option :label="translateTrainingAnnotationType('POSITIVE')" value="POSITIVE" />
                        <el-option :label="translateTrainingAnnotationType('NEGATIVE')" value="NEGATIVE" />
                      </el-select>
                    </el-col>
                  </el-row>

                  <div style="margin-top: 12px;">
                    <el-button type="primary" @click="addOrUpdateAnnotationInterval">
                      {{ selectedAnnotationIndex !== null ? t('activities.dialog.updateInterval') : t('activities.dialog.addInterval') }}
                    </el-button>
                    <el-button @click="startNewAnnotationInterval">
                      {{ t('activities.dialog.newInterval') }}
                    </el-button>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <div v-else>
          <el-card shadow="never" style="margin-bottom: 12px;">
            <div class="training-step-header">
              <div>
                <div class="training-step-content-title">{{ t('activities.dialog.steps.trainTitle') }}</div>
                <div class="training-step-content-hint">{{ t('activities.dialog.stepTrainHint') }}</div>
              </div>
              <div style="flex:1;"></div>
              <el-button type="success" @click="startTraining">{{ t('activities.dialog.startTraining') }}</el-button>
            </div>

            <el-table :data="trainingJobs" row-key="id" style="width: 100%">
              <el-table-column type="expand" width="48">
                <template #default="{ row }">
                  <div class="training-job-details">
                    <el-descriptions :column="2" border size="small">
                      <el-descriptions-item :label="t('activities.dialog.progress')">
                        {{ getTrainingJobPhaseText(getTrainingJobLiveProgress(row)?.phase || row.status) }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.lastHeartbeat')">
                        {{ getTrainingJobHeartbeat(row) }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.bestEpoch')">
                        {{ row.logs?.bestEpoch || t('common.misc.none') }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.epochsTrained')">
                        {{ row.logs?.epochsTrained || t('common.misc.none') }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.trainingDuration')">
                        <span v-if="row.logs?.durationSec">{{ Math.round(Number(row.logs.durationSec)) }}s</span>
                        <span v-else>{{ t('common.misc.none') }}</span>
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.trainingError')">
                        {{ row.error || t('common.misc.none') }}
                      </el-descriptions-item>
                    </el-descriptions>

                    <div class="training-job-history">
                      <div class="training-job-history-title">{{ t('activities.dialog.trainingLogHistory') }}</div>
                      <el-timeline v-if="getTrainingJobHistory(row).length > 0">
                        <el-timeline-item
                          v-for="(entry, index) in getTrainingJobHistory(row)"
                          :key="`${row.id}-${index}`"
                          :timestamp="formatDateTime(entry.timestamp)"
                        >
                          <div class="training-job-history-entry">
                            <div class="training-job-history-phase">
                              {{ getTrainingJobPhaseText(entry.phase) }}
                            </div>
                            <div class="training-job-history-text">
                              {{ getTrainingJobHistoryText(entry) || t('common.misc.none') }}
                            </div>
                          </div>
                        </el-timeline-item>
                      </el-timeline>
                      <el-empty v-else :description="t('activities.dialog.noTrainingLogs')" />
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="id" :label="t('common.labels.number')" width="70" />
              <el-table-column :label="t('common.labels.status')" width="120">
                <template #default="{ row }">
                  <el-tag :type="getTrainingJobStatusTagType(row.status)" effect="light">
                    {{ translateTrainingJobStatus(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.modelVersion')" min-width="140">
                <template #default="{ row }">
                  {{ row.modelVersion?.id || row.modelVersionId || t('common.misc.none') }}
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.progress')" min-width="320">
                <template #default="{ row }">
                  <div class="training-job-progress-cell">
                    <div class="training-job-progress-topline">
                      <span class="training-job-progress-phase">
                        {{ getTrainingJobPhaseText(getTrainingJobLiveProgress(row)?.phase || row.status) }}
                      </span>
                      <span class="training-job-progress-heartbeat">
                        {{ t('activities.dialog.lastHeartbeat') }}: {{ getTrainingJobHeartbeat(row) }}
                      </span>
                    </div>
                    <el-progress
                      :percentage="getTrainingJobProgressPercent(row)"
                      :status="row.status === 'FAILED' ? 'exception' : row.status === 'SUCCEEDED' ? 'success' : undefined"
                      :stroke-width="10"
                    />
                    <div class="training-job-progress-text">
                      {{ getTrainingJobLiveProgress(row)?.message || getTrainingJobSecondaryText(row) }}
                    </div>
                    <div v-if="getTrainingJobSecondaryText(row) !== (getTrainingJobLiveProgress(row)?.message || '')" class="training-job-progress-subtext">
                      {{ getTrainingJobSecondaryText(row) }}
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.createdAt')" min-width="180">
                <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('common.labels.actions')" width="220">
                <template #default="{ row }">
                  <el-button
                    v-if="isTrainingJobActive(row.status)"
                    size="small"
                    type="danger"
                    plain
                    :icon="Close"
                    @click="cancelTraining(row)"
                  >
                    {{ t('activities.dialog.cancelTraining') }}
                  </el-button>
                  <el-button
                    v-if="(row.modelVersion?.id || row.modelVersionId) && ((row.modelVersion?.status || ((trainingActivity?.modelVersions || []).find((m:any)=>m.id===row.modelVersionId)?.status)) === 'STAGING')"
                    size="small"
                    type="primary"
                    @click="promoteModelVersion(row.modelVersion?.id || row.modelVersionId)"
                  >
                    {{ t('common.actions.activate') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never">
            <div class="training-step-header">
              <div>
                <div class="training-step-content-title">{{ t('activities.dialog.modelVersions') }}</div>
                <div class="training-step-content-hint">{{ t('activities.dialog.modelPublishHint') }}</div>
              </div>
            </div>

            <el-table :data="trainingActivity?.modelVersions || []" style="width: 100%">
              <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
              <el-table-column prop="version" :label="t('activities.dialog.modelVersion')" width="90">
                <template #default="{ row }">v{{ row.version }}</template>
              </el-table-column>
              <el-table-column :label="t('common.labels.status')" width="120">
                <template #default="{ row }">
                  {{ translateModelStatus(row.status) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('activities.dialog.artifact')" min-width="260">
                <template #default="{ row }">
                  <span v-if="row.artifactUri" style="word-break: break-all;">{{ row.artifactUri }}</span>
                  <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('common.labels.actions')" width="160">
                <template #default="{ row }">
                  <el-button
                    v-if="row.status === 'STAGING'"
                    size="small"
                    type="primary"
                    @click="promoteModelVersion(row.id)"
                  >
                    {{ t('common.actions.activate') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="trainingDialogVisible = false">
          {{ t('common.actions.close') }}
        </el-button>
        <el-button v-if="trainingStep > 1" @click="goToPreviousTrainingStep">
          {{ t('activities.dialog.previousStep') }}
        </el-button>
        <el-button v-if="trainingStep < 4" type="primary" :disabled="!canGoNext" @click="goToNextTrainingStep">
          {{ t('activities.dialog.nextStep') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Настройки доступа для компаний -->
    <el-dialog
      v-model="companyDialogVisible"
      :title="t('activities.dialog.companySettingsTitle', { name: selectedActivity?.name || '' })"
      width="1100px"
    >
      <el-table :data="companies" style="width: 100%">
        <el-table-column prop="name" :label="t('common.labels.company')" min-width="200" />
        
        <el-table-column :label="t('activities.dialog.access')" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="companySettings[row.id]?.enabled || false"
              @change="(val: boolean) => toggleCompanyAccess(row.id, val)"
            />
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.allowedModel')" width="220">
          <template #default="{ row }">
            <el-select
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].allowedModelVersionId"
              :placeholder="t('common.misc.none')"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="mv in (selectedActivity?.modelVersions || [])"
                :key="mv.id"
                :label="`v${mv.version} (${translateModelStatus(mv.status)})`"
                :value="mv.id"
              />
            </el-select>
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.activeModel')" width="220">
          <template #default="{ row }">
            <el-select
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].activeModelVersionId"
              :placeholder="t('common.misc.none')"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="mv in (selectedActivity?.modelVersions || []).filter((m: any) => m.status === 'ACTIVE')"
                :key="mv.id"
                :label="`v${mv.version} (${translateModelStatus(mv.status)})`"
                :value="mv.id"
              />
            </el-select>
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('activities.dialog.overrides')" min-width="350">
          <template #default="{ row }">
            <el-input
              v-if="companySettings[row.id]?.enabled"
              v-model="companySettings[row.id].overridesText"
              type="textarea"
              :rows="3"
              :placeholder="t('activities.dialog.overridesPlaceholder')"
            />
            <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="companyDialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="saveCompanySettings">
          {{ t('common.actions.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  --training-accent: var(--el-color-primary);
  --training-accent-strong: var(--el-color-primary-dark-2);
  --training-card-bg-start: var(--el-fill-color-blank);
  --training-card-bg-end: var(--el-fill-color-light);
  --training-card-shadow: rgba(16, 24, 40, 0.08);
  --training-card-shadow-strong: rgba(16, 24, 40, 0.14);
  --training-lane-grid: rgba(128, 128, 128, 0.18);
  --training-lane-bg-start: var(--el-fill-color-light);
  --training-lane-bg-end: var(--el-fill-color);
  --training-lane-border: var(--el-border-color);
  --training-handle-bg: var(--el-bg-color);
  --training-handle-border: var(--el-color-primary);
  --training-banner-success-bg: var(--el-color-success-light-9);
  --training-banner-success-border: var(--el-color-success-light-5);
  --training-banner-success-text: var(--el-color-success-dark-2);
  --training-banner-primary-bg: var(--el-color-primary-light-9);
  --training-banner-primary-border: var(--el-color-primary-light-5);
  --training-banner-primary-text: var(--el-color-primary-dark-2);
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

.training-wizard {
  display: grid;
  gap: 16px;
}

.training-step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.training-step-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color);
  background: linear-gradient(180deg, var(--training-card-bg-start) 0%, var(--training-card-bg-end) 100%);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.training-step-card:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--training-accent);
  box-shadow: 0 12px 24px var(--training-card-shadow);
}

.training-step-card.is-active {
  border-color: var(--training-accent);
  box-shadow: 0 14px 28px var(--training-card-shadow-strong);
}

.training-step-card.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

.training-step-index {
  width: 30px;
  height: 30px;
  min-width: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--training-accent-strong);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.training-step-copy {
  display: grid;
  gap: 4px;
}

.training-step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.training-step-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.training-step-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.training-step-content-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.training-step-content-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.training-empty-state {
  padding: 18px;
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.training-field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.annotation-mode-banner {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--training-banner-success-border);
  background: var(--training-banner-success-bg);
  color: var(--training-banner-success-text);
  font-size: 12px;
  line-height: 1.5;
}

.annotation-mode-banner.is-editing {
  border-color: var(--training-banner-primary-border);
  background: var(--training-banner-primary-bg);
  color: var(--training-banner-primary-text);
}

.asset-preview-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  background: linear-gradient(180deg, var(--el-fill-color-blank) 0%, var(--el-fill-color-light) 100%);
}

.asset-preview-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.asset-preview-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.asset-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-preview-body {
  display: grid;
  gap: 16px;
}

.training-video,
.training-image {
  width: 100%;
  max-height: 320px;
  border-radius: 10px;
  background: #000;
  object-fit: contain;
}

.trim-panel {
  display: grid;
  gap: 12px;
}

.editor-timeline-header {
  display: grid;
  gap: 4px;
}

.editor-timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.editor-timeline-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.editor-timeline-shell {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 14px 0 4px;
  cursor: pointer;
}

.editor-timeline-shell.is-dragging {
  cursor: ew-resize;
}

.editor-timeline-lane {
  position: relative;
  height: 28px;
}

.editor-lane-base {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background:
    linear-gradient(90deg, var(--training-lane-grid) 1px, transparent 1px) 0 0 / 10% 100%,
    linear-gradient(180deg, var(--training-lane-bg-start) 0%, var(--training-lane-bg-end) 100%);
  border: 1px solid var(--training-lane-border);
}

.trim-selection-band {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--training-accent-strong) 0%, var(--training-accent) 100%);
  box-shadow: 0 8px 18px rgba(31, 93, 59, 0.18);
  cursor: grab;
}

.trim-selection-band:active {
  cursor: grabbing;
}

.trim-handle {
  position: absolute;
  top: -4px;
  width: 16px;
  height: 36px;
  margin-left: -8px;
  border: 2px solid var(--training-handle-border);
  border-radius: 999px;
  background: var(--training-handle-bg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  cursor: ew-resize;
  z-index: 2;
}

.annotation-segment {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 999px;
  overflow: visible;
  opacity: 0.92;
  transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
}

.annotation-segment:hover {
  transform: translateY(-1px);
  opacity: 1;
}

.annotation-segment.is-selected {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}

.annotation-segment--positive {
  background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%);
}

.annotation-segment--negative {
  background: linear-gradient(90deg, #dc2626 0%, #b91c1c 100%);
}

.annotation-segment-body {
  position: absolute;
  inset: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: grab;
}

.annotation-segment-body:active {
  cursor: grabbing;
}

.annotation-segment-index {
  flex-shrink: 0;
}

.annotation-segment-time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.annotation-handle {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 12px;
  border: 2px solid var(--el-bg-color);
  border-radius: 999px;
  background: var(--el-text-color-secondary);
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.2);
  cursor: ew-resize;
}

.annotation-handle--start {
  left: -4px;
}

.annotation-handle--end {
  right: -4px;
}

.editor-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 0 0 1px var(--el-bg-color);
  pointer-events: none;
}

.editor-ticks {
  position: relative;
  height: 18px;
}

.editor-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.trim-panel-header {
  display: grid;
  gap: 4px;
}

.trim-panel-title {
  font-size: 14px;
  font-weight: 600;
}

.trim-panel-hint,
.trim-image-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.trim-values {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.trim-chip {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  padding: 6px 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.trim-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.trim-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.training-job-progress-cell {
  display: grid;
  gap: 8px;
}

.training-job-progress-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
}

.training-job-progress-phase {
  font-weight: 600;
}

.training-job-progress-heartbeat,
.training-job-progress-text,
.training-job-progress-subtext,
.training-job-history-text {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.training-job-progress-subtext {
  margin-top: -4px;
}

.training-job-details {
  display: grid;
  gap: 16px;
  padding: 4px 8px 12px;
}

.training-job-history {
  display: grid;
  gap: 12px;
}

.training-job-history-title,
.training-job-history-phase {
  font-weight: 600;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }

  .training-step-grid {
    grid-template-columns: 1fr;
  }

  .training-step-header {
    flex-direction: column;
  }

  .asset-preview-header {
    flex-direction: column;
  }
}
</style>
