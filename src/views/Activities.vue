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
  actionStartThreshold?: number | null
  actionEndThreshold?: number | null
  actionMinConsecutiveStartWindows?: number | null
  actionConflictWinnerMargin?: number | null
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
  meta?: {
    source?: string
    sourceActivityIntervalId?: number
    sourceEmployeeName?: string
    sourceStartTime?: string
    sourceEndTime?: string
    sourceConfidence?: number
  } | null
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

interface TrainingJobQualityGate {
  enabled?: boolean
  passed?: boolean
  accuracy?: number | null
  f1?: number | null
  f1MetricKey?: 'f1' | 'macroF1'
  minAccuracy?: number
  minF1?: number
  reason?: string | null
}

interface TrainingJobCalibration {
  enabled?: boolean
  type?: string | null
  applied?: boolean
  temperature?: number | null
  sampleCount?: number
  nllBefore?: number | null
  nllAfter?: number | null
  reason?: string | null
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
    qualityGate?: TrainingJobQualityGate
    calibration?: TrainingJobCalibration
  } | null
}

interface TrainingPreviewFrame {
  index: number
  timeSec: number
  imageUrl: string
}

interface TrainingPreviewItem {
  index: number
  assetId: number
  assetUri: string
  sourceActivityId?: number | null
  sourceActivityCode?: string | null
  sourceActivityName?: string | null
  isAutoNegative?: boolean
  startSec: number
  endSec: number
  label: number
  labelCode: string
  cropPolicy?: string | null
  frames: TrainingPreviewFrame[]
}

interface TrainingPreviewSummary {
  trainingMode?: string
  cropPolicy?: string | null
  totalAssets?: number
  selectedAssetCount?: number
  autoNegativeAssetCount?: number
  ignoredNonVideoAssetCount?: number
  totalClips?: number
  previewClipCount?: number
  labelStats?: Record<string, number>
  labelStatsByCode?: Record<string, number>
  notes?: string[]
}

interface TrainingPreviewData {
  trainingJobId: number
  trainingJobType: string
  generatedAt: string
  previewConfig?: {
    maxPreviewClips?: number
    framesPerClip?: number
    previewSize?: number
  } | null
  summary?: TrainingPreviewSummary | null
  items: TrainingPreviewItem[]
}

type TrainingStep = 1 | 2 | 3 | 4
type DraftAnnotation = { startSec: number; endSec: number; type: 'POSITIVE' | 'NEGATIVE' }
type ActivityTableAction = 'publish' | 'deprecate' | 'edit' | 'delete' | 'training' | 'companies'
type ObjectCueSource = 'coco' | 'open_images_v7' | 'custom'
type ObjectCueRegion = 'person_bbox' | 'upper_body' | 'expanded_person_bbox'

interface ObjectClassOption {
  classId: number
  className: string
  code: string
  label: string
  source: ObjectCueSource
  modelName: string
}

interface ObjectClassCatalog {
  modelName: string
  source: string
  classes: ObjectClassOption[]
  updatedAt: string
}

interface ActivityObjectCueForm {
  enabled: boolean
  code: string
  label: string
  source: ObjectCueSource
  className: string
  classId: number | null
  region: ObjectCueRegion
  minConfidence: number
  windowFrames: number
  minDetections: number
  scoreBoost: number
  missingPenalty: number
  maxAdjustment: number
}

const RECOMMENDED_OBJECT_CUE_SETTINGS = {
  enabled: true,
  region: 'person_bbox' as ObjectCueRegion,
  minConfidence: 0.35,
  windowFrames: 8,
  minDetections: 2,
  scoreBoost: 0.1,
  missingPenalty: 0.08,
  maxAdjustment: 0.2,
} as const

const RECOMMENDED_ACTION_RECOGNITION_SETTINGS = {
  startThreshold: 0.75,
  endThreshold: 0.45,
  minConsecutiveStartWindows: 2,
  conflictWinnerMargin: 0.08,
} as const

const ACTION_RECOGNITION_THRESHOLD_KEYS = [
  'startThreshold',
  'endThreshold',
  'minConsecutiveStartWindows',
  'conflictWinnerMargin',
] as const

const ACTION_RECOGNITION_SPEC_KEYS = [
  ...ACTION_RECOGNITION_THRESHOLD_KEYS,
  'conflictGroup',
  'cropPolicy',
  'personBboxHoldSeconds',
  'objectCues',
  'vlmVerifier',
  'vlm_verifier',
] as const

type ActionRecognitionEditableSettings = {
  actionStartThreshold?: number | null
  actionEndThreshold?: number | null
  actionMinConsecutiveStartWindows?: number | null
  actionConflictWinnerMargin?: number | null
}

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
const editingDetectorSpec = ref<any | null>(null)
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
const trainingPreviewDialogVisible = ref(false)
const loadingTrainingPreview = ref(false)
const trainingPreviewData = ref<TrainingPreviewData | null>(null)
const trainingPreviewJob = ref<TrainingJob | null>(null)

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
  actionStartThreshold: null as number | null,
  actionEndThreshold: null as number | null,
  actionMinConsecutiveStartWindows: null as number | null,
  actionConflictWinnerMargin: null as number | null,
  actionConflictGroup: '',
  actionVlmPrompt: '',
  objectCues: [] as ActivityObjectCueForm[],
})
const objectClassCatalog = ref<ObjectClassCatalog | null>(null)
const objectClassOptions = ref<ObjectClassOption[]>([])
const loadingObjectClasses = ref(false)

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

const objectCueSourceOptions = computed(() => [
  { label: t('activities.dialog.objectCues.sources.coco'), value: 'coco' as ObjectCueSource },
  { label: t('activities.dialog.objectCues.sources.openImages'), value: 'open_images_v7' as ObjectCueSource },
  { label: t('activities.dialog.objectCues.sources.custom'), value: 'custom' as ObjectCueSource },
])

const objectCueRegionOptions = computed(() => [
  { label: t('activities.dialog.objectCues.regions.person_bbox'), value: 'person_bbox' as ObjectCueRegion },
  { label: t('activities.dialog.objectCues.regions.upper_body'), value: 'upper_body' as ObjectCueRegion },
  { label: t('activities.dialog.objectCues.regions.expanded_person_bbox'), value: 'expanded_person_bbox' as ObjectCueRegion },
])

const objectCueSelectOptions = computed<ObjectClassOption[]>(() => {
  const byCode = new Map<string, ObjectClassOption>()
  for (const option of objectClassOptions.value) {
    byCode.set(option.code, option)
  }
  for (const cue of form.value.objectCues) {
    if (!cue.code || byCode.has(cue.code)) continue
    byCode.set(cue.code, {
      classId: cue.classId ?? -1,
      className: cue.className || cue.code,
      code: cue.code,
      label: cue.label || cue.className || cue.code,
      source: cue.source,
      modelName: objectClassCatalog.value?.modelName || 'unknown',
    })
  }
  return Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label))
})

const selectedObjectCueCodes = computed<string[]>({
  get() {
    return form.value.objectCues.map((cue) => cue.code).filter(Boolean)
  },
  set(codes) {
    const existingByCode = new Map(form.value.objectCues.map((cue) => [cue.code, cue]))
    const optionByCode = new Map(objectCueSelectOptions.value.map((option) => [option.code, option]))
    form.value.objectCues = codes
      .map((code) => existingByCode.get(code) ?? createObjectCueFromOption(optionByCode.get(code)))
      .filter((cue): cue is ActivityObjectCueForm => Boolean(cue))
  },
})

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
  const liveF1 = Number.isFinite(live?.metrics?.macroF1) ? live?.metrics?.macroF1 : live?.metrics?.f1
  const liveF1Label = Number.isFinite(live?.metrics?.macroF1) ? 'macroF1' : 'F1'
  if (Number.isFinite(liveF1)) {
    parts.push(`${liveF1Label}: ${formatTrainingMetric(liveF1)}`)
  }
  if (parts.length > 0) return parts.join(' · ')

  if (job.status === 'FAILED') {
    const qualityGate = getTrainingJobQualityGate(job)
    if (qualityGate?.enabled && qualityGate.passed === false) {
      return getTrainingJobQualityGateSummary(job)
    }
    if (job.error) return job.error
  }

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

function getTrainingJobDatasetWarnings(job: TrainingJob): string[] {
  const warnings = job.logs?.dataset?.warnings
  return Array.isArray(warnings) ? warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function getTrainingJobQualityGate(job: TrainingJob): TrainingJobQualityGate | null {
  return job.logs?.qualityGate && typeof job.logs.qualityGate === 'object' ? job.logs.qualityGate : null
}

function getTrainingJobQualityGateSummary(job: TrainingJob): string {
  const qualityGate = getTrainingJobQualityGate(job)
  if (!qualityGate?.enabled) return t('common.misc.none')
  if (qualityGate.passed) {
    const parts: string[] = [t('activities.dialog.qualityGatePassed')]
    if (Number.isFinite(qualityGate.accuracy)) parts.push(`acc: ${formatTrainingMetric(qualityGate.accuracy)}`)
    if (Number.isFinite(qualityGate.f1)) {
      const label = qualityGate.f1MetricKey === 'macroF1' ? 'macroF1' : 'F1'
      parts.push(`${label}: ${formatTrainingMetric(qualityGate.f1)}`)
    }
    return parts.join(' · ')
  }
  return qualityGate.reason || t('activities.dialog.qualityGateFailed')
}

function getTrainingJobCalibration(job: TrainingJob): TrainingJobCalibration | null {
  return job.logs?.calibration && typeof job.logs.calibration === 'object' ? job.logs.calibration : null
}

function getTrainingJobCalibrationSummary(job: TrainingJob): string {
  const calibration = getTrainingJobCalibration(job)
  if (!calibration?.enabled) return t('common.misc.none')
  const temperature = Number.isFinite(calibration.temperature) ? formatTrainingMetric(calibration.temperature) : '—'
  if (calibration.applied) return `${t('activities.dialog.calibrationApplied')} · T=${temperature}`
  return calibration.reason || t('activities.dialog.calibrationSkipped')
}

function canPreviewTrainingJob(job: TrainingJob): boolean {
  return !isTrainingJobActive(job.status)
}

function getTrainingPreviewLabelStats(summary: TrainingPreviewSummary | null | undefined): Array<[string, number]> {
  const source = summary?.labelStatsByCode && Object.keys(summary.labelStatsByCode).length > 0
    ? summary.labelStatsByCode
    : (summary?.labelStats || {})
  return Object.entries(source).filter(([, value]) => Number.isFinite(value))
}

async function openTrainingPreview(job: TrainingJob) {
  try {
    loadingTrainingPreview.value = true
    trainingPreviewJob.value = job
    trainingPreviewDialogVisible.value = true
    trainingPreviewData.value = null

    const response = await apiClient.get(`/api/training-jobs/${job.id}/preview`, {
      params: {
        maxPreviewClips: 12,
        framesPerClip: 4,
        previewSize: 160,
      },
    })
    trainingPreviewData.value = response.data as TrainingPreviewData
  } catch (error: any) {
    trainingPreviewDialogVisible.value = false
    trainingPreviewJob.value = null
    trainingPreviewData.value = null
    ElMessage.error(error.response?.data?.error || t('activities.dialog.trainingPreviewError'))
  } finally {
    loadingTrainingPreview.value = false
  }
}

function closeTrainingPreview() {
  trainingPreviewDialogVisible.value = false
  trainingPreviewJob.value = null
  trainingPreviewData.value = null
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
  const historyF1 = Number.isFinite(entry.metrics?.macroF1) ? entry.metrics?.macroF1 : entry.metrics?.f1
  const historyF1Label = Number.isFinite(entry.metrics?.macroF1) ? 'macroF1' : 'F1'
  if (Number.isFinite(historyF1)) {
    parts.push(`${historyF1Label}: ${formatTrainingMetric(historyF1)}`)
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

async function loadObjectClasses(refresh = false) {
  if (loadingObjectClasses.value) return

  try {
    loadingObjectClasses.value = true
    const response = await apiClient.get('/api/object-classes', {
      params: refresh ? { refresh: true } : undefined,
    })
    const catalog = response.data as ObjectClassCatalog
    objectClassCatalog.value = catalog
    objectClassOptions.value = Array.isArray(catalog.classes)
      ? catalog.classes.map(normalizeObjectClassOption).filter((item): item is ObjectClassOption => Boolean(item))
      : []
  } catch (error) {
    console.error('Failed to load object classes', error)
    ElMessage.warning(t('activities.dialog.objectCues.loadError'))
  } finally {
    loadingObjectClasses.value = false
  }
}

function ensureObjectClassesLoaded() {
  if (objectClassOptions.value.length === 0) {
    void loadObjectClasses()
  }
}

async function handleSubmit(openTrainingAfterSave: boolean = false) {
  try {
    const payload = buildActivityPayload()
    if (isEditing.value && editingActivityId.value) {
      await apiClient.put(`/api/activities/${editingActivityId.value}`, payload)
      ElMessage.success(t('activities.updated'))
      if (openTrainingAfterSave) {
        await openTraining({ id: editingActivityId.value } as any)
      }
    } else {
      const created = await apiClient.post('/api/activities', payload)
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
  ensureObjectClassesLoaded()
  dialogVisible.value = true
}

function startEdit(activity: Activity) {
  isEditing.value = true
  editingActivityId.value = activity.id
  editingDetectorSpec.value = activity.detectorSpec ?? null
  dialogVisible.value = true
  const actionSettings = extractActionRecognitionSettings(activity.detectorSpec)
  form.value = {
    name: activity.name,
    description: activity.description || '',
    actionStartThreshold: actionSettings.actionStartThreshold,
    actionEndThreshold: actionSettings.actionEndThreshold,
    actionMinConsecutiveStartWindows: actionSettings.actionMinConsecutiveStartWindows,
    actionConflictWinnerMargin: actionSettings.actionConflictWinnerMargin,
    actionConflictGroup: actionSettings.actionConflictGroup,
    actionVlmPrompt: actionSettings.actionVlmPrompt,
    objectCues: extractObjectCuesFromDetectorSpec(activity.detectorSpec),
  }
  ensureObjectClassesLoaded()
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingActivityId.value = null
  editingDetectorSpec.value = null
  form.value = {
    name: '',
    description: '',
    actionStartThreshold: null,
    actionEndThreshold: null,
    actionMinConsecutiveStartWindows: null,
    actionConflictWinnerMargin: null,
    actionConflictGroup: '',
    actionVlmPrompt: '',
    objectCues: [],
  }
}

function createDefaultObjectCue(): ActivityObjectCueForm {
  return {
    enabled: RECOMMENDED_OBJECT_CUE_SETTINGS.enabled,
    code: '',
    label: '',
    source: 'open_images_v7',
    className: '',
    classId: null,
    region: RECOMMENDED_OBJECT_CUE_SETTINGS.region,
    minConfidence: RECOMMENDED_OBJECT_CUE_SETTINGS.minConfidence,
    windowFrames: RECOMMENDED_OBJECT_CUE_SETTINGS.windowFrames,
    minDetections: RECOMMENDED_OBJECT_CUE_SETTINGS.minDetections,
    scoreBoost: RECOMMENDED_OBJECT_CUE_SETTINGS.scoreBoost,
    missingPenalty: RECOMMENDED_OBJECT_CUE_SETTINGS.missingPenalty,
    maxAdjustment: RECOMMENDED_OBJECT_CUE_SETTINGS.maxAdjustment,
  }
}

function normalizeObjectCueSource(value: unknown): ObjectCueSource {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'open_images_v7' || normalized === 'open-images-v7' || normalized === 'oiv7') {
    return 'open_images_v7'
  }
  return normalized === 'custom' ? 'custom' : 'coco'
}

function normalizeObjectClassOption(raw: any): ObjectClassOption | null {
  const classId = Number(raw?.classId)
  const className = String(raw?.className || '').trim()
  const label = String(raw?.label || className).trim()
  const code = String(raw?.code || className.toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim()
  if (!Number.isInteger(classId) || !className || !code) return null

  return {
    classId,
    className,
    code,
    label: label || className,
    source: normalizeObjectCueSource(raw?.source),
    modelName: String(raw?.modelName || objectClassCatalog.value?.modelName || '').trim(),
  }
}

function createObjectCueFromOption(option: ObjectClassOption | undefined): ActivityObjectCueForm | null {
  if (!option) return null
  return {
    ...createDefaultObjectCue(),
    code: option.code,
    label: option.label,
    source: option.source,
    className: option.className,
    classId: option.classId >= 0 ? option.classId : null,
  }
}

function normalizeObjectCue(raw: any): ActivityObjectCueForm {
  const next = createDefaultObjectCue()
  const region = String(raw?.region || '').trim() as ObjectCueRegion

  return {
    ...next,
    enabled: raw?.enabled !== false,
    code: String(raw?.code || ''),
    label: String(raw?.label || ''),
    source: normalizeObjectCueSource(raw?.source),
    className: String(raw?.className || ''),
    classId: Number.isInteger(raw?.classId) ? Number(raw.classId) : null,
    region: ['person_bbox', 'upper_body', 'expanded_person_bbox'].includes(region) ? region : 'person_bbox',
    minConfidence: clampUnitNumber(raw?.minConfidence, next.minConfidence),
    windowFrames: clampInt(raw?.windowFrames, next.windowFrames, 1, 120),
    minDetections: clampInt(raw?.minDetections, next.minDetections, 1, 120),
    scoreBoost: clampUnitNumber(raw?.scoreBoost, next.scoreBoost),
    missingPenalty: clampUnitNumber(raw?.missingPenalty, next.missingPenalty),
    maxAdjustment: clampUnitNumber(raw?.maxAdjustment, next.maxAdjustment),
  }
}

function clampUnitNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(1, numeric))
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.max(min, Math.min(max, numeric))
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function extractActionRecognitionSection(source: any): Record<string, any> {
  if (!isRecord(source)) return {}
  const nested = isRecord(source.actionRecognition) ? source.actionRecognition : null
  if (!nested) return source

  const { actionRecognition: _ignored, ...topLevel } = source
  return {
    ...topLevel,
    ...nested,
  }
}

function normalizeOptionalUnitNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.min(1, numeric))
}

function normalizeOptionalPositiveInt(value: unknown, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(1, Math.min(max, Math.trunc(numeric)))
}

function extractActionRecognitionSettings(source: any) {
  const actionRecognition = extractActionRecognitionSection(source)

  return {
    actionStartThreshold: normalizeOptionalUnitNumber(actionRecognition.startThreshold) ?? null,
    actionEndThreshold: normalizeOptionalUnitNumber(actionRecognition.endThreshold) ?? null,
    actionMinConsecutiveStartWindows: normalizeOptionalPositiveInt(actionRecognition.minConsecutiveStartWindows, 20) ?? null,
    actionConflictWinnerMargin: normalizeOptionalUnitNumber(actionRecognition.conflictWinnerMargin) ?? null,
    actionConflictGroup: typeof actionRecognition.conflictGroup === 'string' ? actionRecognition.conflictGroup : '',
    actionVlmPrompt: extractActionVlmPrompt(actionRecognition),
  }
}

function extractActionVlmPrompt(actionRecognition: Record<string, any>): string {
  const cfg = isRecord(actionRecognition.vlmVerifier)
    ? actionRecognition.vlmVerifier
    : isRecord(actionRecognition.vlm_verifier)
      ? actionRecognition.vlm_verifier
      : null
  const prompt = typeof cfg?.prompt === 'string' ? cfg.prompt : typeof cfg?.question === 'string' ? cfg.question : ''
  return prompt
}

function applyActionRecognitionThresholds(
  actionRecognition: Record<string, any>,
  settings: ActionRecognitionEditableSettings
) {
  const startThreshold = normalizeOptionalUnitNumber(settings.actionStartThreshold)
  const endThreshold = normalizeOptionalUnitNumber(settings.actionEndThreshold)
  const minConsecutiveStartWindows = normalizeOptionalPositiveInt(settings.actionMinConsecutiveStartWindows, 20)
  const conflictWinnerMargin = normalizeOptionalUnitNumber(settings.actionConflictWinnerMargin)

  if (startThreshold !== undefined) actionRecognition.startThreshold = startThreshold
  else delete actionRecognition.startThreshold

  if (endThreshold !== undefined) actionRecognition.endThreshold = endThreshold
  else delete actionRecognition.endThreshold

  if (minConsecutiveStartWindows !== undefined) actionRecognition.minConsecutiveStartWindows = minConsecutiveStartWindows
  else delete actionRecognition.minConsecutiveStartWindows

  if (conflictWinnerMargin !== undefined) actionRecognition.conflictWinnerMargin = conflictWinnerMargin
  else delete actionRecognition.conflictWinnerMargin
}

function applyRecommendedActionRecognitionSettings(target: ActionRecognitionEditableSettings) {
  target.actionStartThreshold = RECOMMENDED_ACTION_RECOGNITION_SETTINGS.startThreshold
  target.actionEndThreshold = RECOMMENDED_ACTION_RECOGNITION_SETTINGS.endThreshold
  target.actionMinConsecutiveStartWindows = RECOMMENDED_ACTION_RECOGNITION_SETTINGS.minConsecutiveStartWindows
  target.actionConflictWinnerMargin = RECOMMENDED_ACTION_RECOGNITION_SETTINGS.conflictWinnerMargin
}

function clearActionRecognitionSettings(target: ActionRecognitionEditableSettings) {
  target.actionStartThreshold = null
  target.actionEndThreshold = null
  target.actionMinConsecutiveStartWindows = null
  target.actionConflictWinnerMargin = null
}

function getActionRecognitionRecommendedHint(): string {
  return t('activities.dialog.actionRecognition.recommendedHint', {
    startThreshold: formatCueNumber(RECOMMENDED_ACTION_RECOGNITION_SETTINGS.startThreshold),
    endThreshold: formatCueNumber(RECOMMENDED_ACTION_RECOGNITION_SETTINGS.endThreshold),
    minConsecutiveStartWindows: RECOMMENDED_ACTION_RECOGNITION_SETTINGS.minConsecutiveStartWindows,
    conflictWinnerMargin: formatCueNumber(RECOMMENDED_ACTION_RECOGNITION_SETTINGS.conflictWinnerMargin),
  })
}

function buildCompanyOverrides(settings: CompanyActivity, parsedOverrides: any): any | null {
  const overrides = isRecord(parsedOverrides) ? { ...parsedOverrides } : {}
  const actionRecognition = isRecord(overrides.actionRecognition)
    ? { ...overrides.actionRecognition }
    : {}

  for (const key of ACTION_RECOGNITION_THRESHOLD_KEYS) {
    if (actionRecognition[key] === undefined && overrides[key] !== undefined) {
      actionRecognition[key] = overrides[key]
    }
    delete overrides[key]
  }

  applyActionRecognitionThresholds(actionRecognition, settings)

  if (Object.keys(actionRecognition).length > 0) {
    overrides.actionRecognition = actionRecognition
  } else {
    delete overrides.actionRecognition
  }

  return Object.keys(overrides).length > 0 ? overrides : null
}

function extractObjectCuesFromDetectorSpec(detectorSpec: any): ActivityObjectCueForm[] {
  const actionRecognition =
    detectorSpec && typeof detectorSpec === 'object'
      ? detectorSpec.actionRecognition || detectorSpec
      : null
  const cues = Array.isArray(actionRecognition?.objectCues) ? actionRecognition.objectCues : []
  return cues.map((cue: any) => normalizeObjectCue(cue))
}

function buildActivityPayload() {
  const objectCues = form.value.objectCues
    .map((cue) => normalizeObjectCue(cue))
    .filter((cue) => cue.code.trim() || cue.className.trim() || cue.label.trim())
    .map((cue) => ({
      enabled: cue.enabled,
      code: cue.code.trim() || cue.className.trim() || cue.label.trim(),
      label: cue.label.trim() || undefined,
      source: cue.source,
      className: cue.className.trim() || undefined,
      classId: cue.classId ?? undefined,
      region: cue.region,
      minConfidence: cue.minConfidence,
      windowFrames: cue.windowFrames,
      minDetections: Math.min(cue.minDetections, cue.windowFrames),
      scoreBoost: cue.scoreBoost,
      missingPenalty: cue.missingPenalty,
      maxAdjustment: cue.maxAdjustment,
    }))

  const detectorSpec =
    editingDetectorSpec.value && typeof editingDetectorSpec.value === 'object'
      ? { ...editingDetectorSpec.value }
      : {}
  const actionRecognition =
    detectorSpec.actionRecognition && typeof detectorSpec.actionRecognition === 'object'
      ? { ...detectorSpec.actionRecognition }
      : {}

  for (const key of ACTION_RECOGNITION_SPEC_KEYS) {
    if (actionRecognition[key] === undefined && detectorSpec[key] !== undefined) {
      actionRecognition[key] = detectorSpec[key]
    }
    delete detectorSpec[key]
  }

  applyActionRecognitionThresholds(actionRecognition, form.value)

  const conflictGroup = form.value.actionConflictGroup.trim()
  if (conflictGroup) {
    actionRecognition.conflictGroup = conflictGroup
  } else {
    delete actionRecognition.conflictGroup
  }

  if (objectCues.length) {
    actionRecognition.objectCues = objectCues
  } else {
    delete actionRecognition.objectCues
  }

  const prompt = form.value.actionVlmPrompt.trim()
  const vlmVerifier = isRecord(actionRecognition.vlmVerifier)
    ? { ...actionRecognition.vlmVerifier }
    : isRecord(actionRecognition.vlm_verifier)
      ? { ...actionRecognition.vlm_verifier }
      : {}
  delete actionRecognition.vlm_verifier
  if (prompt) {
    vlmVerifier.prompt = prompt
    delete vlmVerifier.question
    actionRecognition.vlmVerifier = vlmVerifier
  } else {
    delete vlmVerifier.prompt
    delete vlmVerifier.question
    if (Object.keys(vlmVerifier).length > 0) {
      actionRecognition.vlmVerifier = vlmVerifier
    } else {
      delete actionRecognition.vlmVerifier
    }
  }

  if (Object.keys(actionRecognition).length > 0) {
    detectorSpec.actionRecognition = actionRecognition
  } else {
    delete detectorSpec.actionRecognition
  }

  return {
    name: form.value.name,
    description: form.value.description,
    detectorSpec: Object.keys(detectorSpec).length ? detectorSpec : null,
  }
}

function removeObjectCue(index: number) {
  form.value.objectCues.splice(index, 1)
}

function getObjectCueSourceLabel(source: ObjectCueSource | string): string {
  const option = objectCueSourceOptions.value.find((item) => item.value === source)
  return option?.label || source
}

function formatCueNumber(value: number): string {
  return Number(value).toFixed(2).replace(/\.?0+$/, '')
}

function getObjectCueRecommendedHint(): string {
  return t('activities.dialog.objectCues.recommendedHint', {
    region: t(`activities.dialog.objectCues.regions.${RECOMMENDED_OBJECT_CUE_SETTINGS.region}`),
    minConfidence: formatCueNumber(RECOMMENDED_OBJECT_CUE_SETTINGS.minConfidence),
    windowFrames: RECOMMENDED_OBJECT_CUE_SETTINGS.windowFrames,
    minDetections: RECOMMENDED_OBJECT_CUE_SETTINGS.minDetections,
    scoreBoost: formatCueNumber(RECOMMENDED_OBJECT_CUE_SETTINGS.scoreBoost),
    missingPenalty: formatCueNumber(RECOMMENDED_OBJECT_CUE_SETTINGS.missingPenalty),
    maxAdjustment: formatCueNumber(RECOMMENDED_OBJECT_CUE_SETTINGS.maxAdjustment),
  })
}

function applyRecommendedObjectCueSettings(cue: ActivityObjectCueForm) {
  cue.enabled = RECOMMENDED_OBJECT_CUE_SETTINGS.enabled
  cue.region = RECOMMENDED_OBJECT_CUE_SETTINGS.region
  cue.minConfidence = RECOMMENDED_OBJECT_CUE_SETTINGS.minConfidence
  cue.windowFrames = RECOMMENDED_OBJECT_CUE_SETTINGS.windowFrames
  cue.minDetections = RECOMMENDED_OBJECT_CUE_SETTINGS.minDetections
  cue.scoreBoost = RECOMMENDED_OBJECT_CUE_SETTINGS.scoreBoost
  cue.missingPenalty = RECOMMENDED_OBJECT_CUE_SETTINGS.missingPenalty
  cue.maxAdjustment = RECOMMENDED_OBJECT_CUE_SETTINGS.maxAdjustment
}

function isVideoAsset(asset: TrainingAsset | null | undefined): boolean {
  return Boolean(asset?.mime?.startsWith('video/'))
}

function isImageAsset(asset: TrainingAsset | null | undefined): boolean {
  return Boolean(asset?.mime?.startsWith('image/'))
}

function isActivityIntervalTrainingAsset(asset: TrainingAsset | null | undefined): boolean {
  return asset?.meta?.source === 'activity_interval'
}

function getTrainingAssetSourceLabel(asset: TrainingAsset): string {
  return isActivityIntervalTrainingAsset(asset)
    ? t('activities.dialog.assetSourceActivityInterval')
    : t('activities.dialog.assetSourceUpload')
}

function getTrainingAssetSourceTitle(asset: TrainingAsset): string {
  if (!isActivityIntervalTrainingAsset(asset)) {
    return t('activities.dialog.assetSourceUpload')
  }

  const parts = [
    asset.meta?.sourceActivityIntervalId
      ? t('activities.dialog.assetSourceInterval', { id: asset.meta.sourceActivityIntervalId })
      : null,
    asset.meta?.sourceEmployeeName || null,
    asset.meta?.sourceStartTime ? formatDateTime(asset.meta.sourceStartTime) : null,
  ].filter(Boolean)

  return parts.join(' · ') || t('activities.dialog.assetSourceActivityInterval')
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

async function deleteModelVersion(modelVersion: ModelVersion) {
  try {
    await ElMessageBox.confirm(
      t('activities.dialog.deleteModelVersionConfirmText', {
        version: modelVersion.version,
        id: modelVersion.id,
      }),
      t('activities.dialog.deleteModelVersionConfirmTitle'),
      {
        confirmButtonText: t('common.actions.delete'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    await apiClient.delete(`/api/models/${modelVersion.id}`)
    ElMessage.success(t('activities.dialog.deleteModelVersionSuccess'))

    if (trainingActivity.value) {
      await openTraining(trainingActivity.value, annotationsAssetId.value ?? undefined)
    }

    const currentSelectedActivityId = selectedActivity.value?.id
    if (currentSelectedActivityId && currentSelectedActivityId === trainingActivity.value?.id) {
      const full = await apiClient.get(`/api/activities/${currentSelectedActivityId}`)
      selectedActivity.value = full.data
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('activities.dialog.deleteModelVersionError'))
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
    const actionSettings = extractActionRecognitionSettings(overrides)
    next[c.id] = {
      enabled: Boolean(existing?.enabled),
      allowedModelVersionId: existing?.allowedModelVersionId ?? null,
      activeModelVersionId: existing?.activeModelVersionId ?? null,
      overrides,
      overridesText: overrides ? JSON.stringify(overrides, null, 2) : '',
      actionStartThreshold: actionSettings.actionStartThreshold,
      actionEndThreshold: actionSettings.actionEndThreshold,
      actionMinConsecutiveStartWindows: actionSettings.actionMinConsecutiveStartWindows,
      actionConflictWinnerMargin: actionSettings.actionConflictWinnerMargin,
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
      let parsedOverrides: any | null = null
      if (settings.overridesText && settings.overridesText.trim().length > 0) {
        try {
          parsedOverrides = JSON.parse(settings.overridesText)
        } catch (e) {
          throw new Error(t('activities.invalidOverridesJson', { name: company.name }))
        }
      }
      const overrides = buildCompanyOverrides(settings, parsedOverrides)

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
    companySettings.value[companyId] = {
      enabled,
      allowedModelVersionId: null,
      activeModelVersionId: null,
      overrides: null,
      overridesText: '',
      actionStartThreshold: null,
      actionEndThreshold: null,
      actionMinConsecutiveStartWindows: null,
      actionConflictWinnerMargin: null,
    }
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
      width="min(900px, calc(100vw - 32px))"
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

        <el-divider content-position="left">
          {{ t('activities.dialog.actionRecognition.title') }}
        </el-divider>

        <el-alert
          class="action-recognition-hint"
          type="info"
          :closable="false"
          :title="t('activities.dialog.actionRecognition.hint')"
        />

        <div class="action-recognition-settings">
          <div class="action-recognition-settings-bar">
            <span>{{ getActionRecognitionRecommendedHint() }}</span>
            <div class="action-recognition-settings-actions">
              <el-button type="primary" plain size="small" @click="applyRecommendedActionRecognitionSettings(form)">
                {{ t('activities.dialog.actionRecognition.applyRecommended') }}
              </el-button>
              <el-button plain size="small" @click="clearActionRecognitionSettings(form)">
                {{ t('activities.dialog.actionRecognition.clear') }}
              </el-button>
            </div>
          </div>

          <el-row :gutter="12">
            <el-col :xs="24" :sm="12">
              <el-form-item :label="t('activities.dialog.actionRecognition.startThreshold')" label-width="150px">
                <el-input-number v-model="form.actionStartThreshold" :min="0" :max="1" :step="0.01" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item :label="t('activities.dialog.actionRecognition.endThreshold')" label-width="150px">
                <el-input-number v-model="form.actionEndThreshold" :min="0" :max="1" :step="0.01" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item :label="t('activities.dialog.actionRecognition.minConsecutiveStartWindows')" label-width="150px">
                <el-input-number v-model="form.actionMinConsecutiveStartWindows" :min="1" :max="20" :step="1" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item :label="t('activities.dialog.actionRecognition.conflictWinnerMargin')" label-width="150px">
                <el-input-number v-model="form.actionConflictWinnerMargin" :min="0" :max="1" :step="0.01" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24">
              <el-form-item :label="t('activities.dialog.actionRecognition.conflictGroup')" label-width="150px">
                <el-input v-model="form.actionConflictGroup" :placeholder="t('activities.dialog.actionRecognition.conflictGroupPlaceholder')" />
              </el-form-item>
            </el-col>
            <el-col :xs="24">
              <el-form-item :label="t('activities.dialog.actionRecognition.vlmPrompt')" label-width="150px">
                <el-input
                  v-model="form.actionVlmPrompt"
                  type="textarea"
                  :rows="4"
                  maxlength="2000"
                  show-word-limit
                  :placeholder="t('activities.dialog.actionRecognition.vlmPromptPlaceholder')"
                />
                <div class="form-help-text">
                  {{ t('activities.dialog.actionRecognition.vlmPromptHelp') }}
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <el-divider content-position="left">
          {{ t('activities.dialog.objectCues.title') }}
        </el-divider>

        <el-alert
          class="object-cues-hint"
          type="info"
          :closable="false"
          :title="t('activities.dialog.objectCues.hint')"
        />

        <div class="object-cues-list">
          <el-form-item :label="t('activities.dialog.objectCues.objects')" label-width="150px">
            <div class="object-cue-select">
              <el-select
                v-model="selectedObjectCueCodes"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="3"
                :loading="loadingObjectClasses"
                :placeholder="t('activities.dialog.objectCues.selectPlaceholder')"
                style="width: 100%"
              >
                <el-option
                  v-for="option in objectCueSelectOptions"
                  :key="option.code"
                  :label="option.label"
                  :value="option.code"
                >
                  <div class="object-cue-option">
                    <span>{{ option.label }}</span>
                    <small>#{{ option.classId }} · {{ getObjectCueSourceLabel(option.source) }}</small>
                  </div>
                </el-option>
              </el-select>
              <div class="object-cue-select-meta">
                <span v-if="objectClassCatalog">
                  {{ t('activities.dialog.objectCues.catalogMeta', {
                    model: objectClassCatalog.modelName,
                    count: objectClassOptions.length,
                  }) }}
                </span>
                <span v-else>{{ t('activities.dialog.objectCues.catalogEmpty') }}</span>
                <el-button
                  link
                  type="primary"
                  :loading="loadingObjectClasses"
                  @click="loadObjectClasses(true)"
                >
                  {{ t('common.actions.refresh') }}
                </el-button>
              </div>
            </div>
          </el-form-item>

          <el-empty
            v-if="form.objectCues.length === 0"
            :description="t('activities.dialog.objectCues.empty')"
            :image-size="64"
          />

          <template v-else>
            <el-card
              v-for="(cue, index) in form.objectCues"
              :key="index"
              class="object-cue-card"
              shadow="never"
            >
              <template #header>
                <div class="object-cue-card-header">
                  <el-switch v-model="cue.enabled" />
                  <div class="object-cue-card-title">
                    <strong>{{ cue.label || cue.code || cue.className || t('activities.dialog.objectCues.untitled') }}</strong>
                    <span>
                      {{ cue.className || cue.code }}
                      <template v-if="cue.classId !== null">#{{ cue.classId }}</template>
                      · {{ getObjectCueSourceLabel(cue.source) }}
                    </span>
                  </div>
                  <el-button type="primary" plain size="small" @click="applyRecommendedObjectCueSettings(cue)">
                    {{ t('activities.dialog.objectCues.applyRecommended') }}
                  </el-button>
                  <el-button type="danger" plain size="small" :icon="Delete" @click="removeObjectCue(index)">
                    {{ t('common.actions.delete') }}
                  </el-button>
                </div>
              </template>

              <div class="object-cue-card-hint">
                {{ getObjectCueRecommendedHint() }}
              </div>

              <el-row :gutter="12">
                <el-col :xs="24" :sm="12">
                  <el-form-item :label="t('activities.dialog.objectCues.region')" label-width="130px">
                    <el-select v-model="cue.region" style="width: 100%">
                      <el-option
                        v-for="option in objectCueRegionOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item :label="t('activities.dialog.objectCues.minConfidence')" label-width="130px">
                    <el-input-number v-model="cue.minConfidence" :min="0" :max="1" :step="0.05" :precision="2" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="8">
                  <el-form-item :label="t('activities.dialog.objectCues.windowFrames')" label-width="130px">
                    <el-input-number v-model="cue.windowFrames" :min="1" :max="120" :step="1" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="8">
                  <el-form-item :label="t('activities.dialog.objectCues.minDetections')" label-width="130px">
                    <el-input-number v-model="cue.minDetections" :min="1" :max="cue.windowFrames" :step="1" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="8">
                  <el-form-item :label="t('activities.dialog.objectCues.maxAdjustment')" label-width="130px">
                    <el-input-number v-model="cue.maxAdjustment" :min="0" :max="1" :step="0.05" :precision="2" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item :label="t('activities.dialog.objectCues.scoreBoost')" label-width="130px">
                    <el-input-number v-model="cue.scoreBoost" :min="0" :max="1" :step="0.05" :precision="2" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item :label="t('activities.dialog.objectCues.missingPenalty')" label-width="130px">
                    <el-input-number v-model="cue.missingPenalty" :min="0" :max="1" :step="0.05" :precision="2" style="width: 100%" />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-card>
          </template>
        </div>
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
      width="min(1240px, calc(100vw - 32px))"
    >
      <div class="training-wizard">
        <div class="training-step-strip">
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
        </div>

        <div v-if="trainingStep === 1">
          <el-card shadow="never">
            <div class="training-step-header">
              <div>
                <div class="training-step-content-title">{{ t('activities.dialog.steps.uploadTitle') }}</div>
                <div class="training-step-content-hint">{{ t('activities.dialog.stepUploadHint') }}</div>
                <div class="training-step-content-hint" style="margin-top: 6px;">{{ t('activities.dialog.stepUploadPersonHint') }}</div>
              </div>
              <div class="training-step-header-actions">
                <input ref="uploadInputRef" type="file" multiple style="display:none" @change="onFilesSelected" />
                <el-button type="primary" @click="onPickFiles">{{ t('common.actions.upload') }}</el-button>
              </div>
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
              <el-table-column :label="t('activities.dialog.source')" width="130">
                <template #default="{ row }">
                  <el-tag
                    :type="isActivityIntervalTrainingAsset(row) ? 'warning' : 'info'"
                    :title="getTrainingAssetSourceTitle(row)"
                  >
                    {{ getTrainingAssetSourceLabel(row) }}
                  </el-tag>
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
                  <el-table-column :label="t('activities.dialog.source')" width="130">
                    <template #default="{ row }">
                      <el-tag
                        :type="isActivityIntervalTrainingAsset(row) ? 'warning' : 'info'"
                        :title="getTrainingAssetSourceTitle(row)"
                      >
                        {{ getTrainingAssetSourceLabel(row) }}
                      </el-tag>
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
                  <div class="training-step-header-actions">
                    <el-button type="primary" :disabled="!annotationsAssetId" @click="saveAnnotations">{{ t('common.actions.save') }}</el-button>
                  </div>
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
              <div class="training-step-header-actions">
                <el-button type="success" @click="startTraining">{{ t('activities.dialog.startTraining') }}</el-button>
              </div>
            </div>

            <div class="training-table-shell">
              <el-table :data="trainingJobs" row-key="id" class="training-table training-table--jobs">
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
                      <el-descriptions-item :label="t('activities.dialog.qualityGate')">
                        {{ getTrainingJobQualityGateSummary(row) }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.calibration')">
                        {{ getTrainingJobCalibrationSummary(row) }}
                      </el-descriptions-item>
                      <el-descriptions-item :label="t('activities.dialog.datasetWarnings')">
                        <span v-if="getTrainingJobDatasetWarnings(row).length > 0">{{ getTrainingJobDatasetWarnings(row).length }}</span>
                        <span v-else>{{ t('common.misc.none') }}</span>
                      </el-descriptions-item>
                    </el-descriptions>

                    <el-alert
                      v-if="getTrainingJobQualityGate(row)?.enabled && getTrainingJobQualityGate(row)?.passed === false"
                      :title="t('activities.dialog.qualityGateFailed')"
                      :description="getTrainingJobQualityGateSummary(row)"
                      type="error"
                      show-icon
                      :closable="false"
                      style="margin-top: 12px;"
                    />

                    <el-alert
                      v-if="getTrainingJobCalibration(row)?.enabled"
                      :title="t('activities.dialog.calibration')"
                      :description="getTrainingJobCalibrationSummary(row)"
                      :type="getTrainingJobCalibration(row)?.applied ? 'success' : 'info'"
                      show-icon
                      :closable="false"
                      style="margin-top: 12px;"
                    />

                    <el-alert
                      v-if="getTrainingJobDatasetWarnings(row).length > 0"
                      :title="t('activities.dialog.datasetWarnings')"
                      type="warning"
                      show-icon
                      :closable="false"
                      style="margin-top: 12px;"
                    >
                      <template #default>
                        <div class="training-job-warning-list">
                          <div v-for="(warning, index) in getTrainingJobDatasetWarnings(row)" :key="`${row.id}-warning-${index}`">
                            {{ warning }}
                          </div>
                        </div>
                      </template>
                    </el-alert>

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
              <el-table-column :label="t('common.labels.actions')" width="320">
                <template #default="{ row }">
                  <div class="training-table-actions">
                    <el-button
                      v-if="canPreviewTrainingJob(row)"
                      size="small"
                      plain
                      @click="openTrainingPreview(row)"
                    >
                      {{ t('activities.dialog.trainingPreviewButton') }}
                    </el-button>
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
                      v-if="row.status === 'SUCCEEDED' && (row.modelVersion?.id || row.modelVersionId) && ((row.modelVersion?.status || ((trainingActivity?.modelVersions || []).find((m:any)=>m.id===row.modelVersionId)?.status)) === 'STAGING')"
                      size="small"
                      type="primary"
                      :icon="Check"
                      @click="promoteModelVersion(row.modelVersion?.id || row.modelVersionId)"
                    >
                      {{ t('common.actions.activate') }}
                    </el-button>
                  </div>
                </template>
              </el-table-column>
              </el-table>
            </div>
          </el-card>

          <el-card shadow="never">
            <div class="training-step-header">
              <div>
                <div class="training-step-content-title">{{ t('activities.dialog.modelVersions') }}</div>
                <div class="training-step-content-hint">{{ t('activities.dialog.modelPublishHint') }}</div>
              </div>
            </div>

            <div class="training-table-shell">
              <el-table :data="trainingActivity?.modelVersions || []" class="training-table training-table--models">
                <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
                <el-table-column prop="version" :label="t('activities.dialog.modelVersion')" width="90">
                  <template #default="{ row }">v{{ row.version }}</template>
                </el-table-column>
                <el-table-column :label="t('common.labels.status')" width="120">
                  <template #default="{ row }">
                    {{ translateModelStatus(row.status) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('activities.dialog.artifact')" min-width="320">
                  <template #default="{ row }">
                    <span v-if="row.artifactUri" style="word-break: break-all;">{{ row.artifactUri }}</span>
                    <span v-else style="color: var(--el-text-color-secondary);">{{ t('common.misc.none') }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('common.labels.actions')" width="220">
                  <template #default="{ row }">
                    <div class="training-table-actions">
                      <el-button
                        v-if="row.status === 'STAGING'"
                        size="small"
                        type="primary"
                        :icon="Check"
                        @click="promoteModelVersion(row.id)"
                      >
                        {{ t('common.actions.activate') }}
                      </el-button>
                      <el-button
                        size="small"
                        type="danger"
                        plain
                        :icon="Delete"
                        @click="deleteModelVersion(row)"
                      >
                        {{ t('common.actions.delete') }}
                      </el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
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

        <el-table-column :label="t('activities.dialog.actionRecognition.companyColumn')" min-width="520">
          <template #default="{ row }">
            <div v-if="companySettings[row.id]?.enabled" class="company-action-settings">
              <div class="company-action-settings-hint">
                {{ t('activities.dialog.actionRecognition.companyHint') }}
              </div>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item :label="t('activities.dialog.actionRecognition.startThreshold')" label-width="115px">
                    <el-input-number v-model="companySettings[row.id].actionStartThreshold" :min="0" :max="1" :step="0.01" :precision="2" size="small" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="t('activities.dialog.actionRecognition.endThreshold')" label-width="115px">
                    <el-input-number v-model="companySettings[row.id].actionEndThreshold" :min="0" :max="1" :step="0.01" :precision="2" size="small" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="t('activities.dialog.actionRecognition.minConsecutiveStartWindowsShort')" label-width="115px">
                    <el-input-number v-model="companySettings[row.id].actionMinConsecutiveStartWindows" :min="1" :max="20" :step="1" size="small" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item :label="t('activities.dialog.actionRecognition.conflictWinnerMargin')" label-width="115px">
                    <el-input-number v-model="companySettings[row.id].actionConflictWinnerMargin" :min="0" :max="1" :step="0.01" :precision="2" size="small" style="width: 100%" />
                  </el-form-item>
                </el-col>
              </el-row>
              <div class="company-action-settings-actions">
                <el-button link type="primary" @click="applyRecommendedActionRecognitionSettings(companySettings[row.id])">
                  {{ t('activities.dialog.actionRecognition.applyRecommended') }}
                </el-button>
                <el-button link @click="clearActionRecognitionSettings(companySettings[row.id])">
                  {{ t('activities.dialog.actionRecognition.clear') }}
                </el-button>
              </div>
            </div>
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

    <el-dialog
      v-model="trainingPreviewDialogVisible"
      :title="t('activities.dialog.trainingPreviewTitle', { id: trainingPreviewJob?.id || '' })"
      width="min(1180px, calc(100vw - 32px))"
      @closed="closeTrainingPreview"
    >
      <div v-loading="loadingTrainingPreview" class="training-preview-dialog">
        <el-alert
          type="info"
          :closable="false"
          :title="t('activities.dialog.trainingPreviewHint')"
          style="margin-bottom: 16px;"
        />

        <template v-if="trainingPreviewData">
          <el-descriptions :column="3" border size="small" class="training-preview-summary">
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewGeneratedAt')">
              {{ formatDateTime(trainingPreviewData.generatedAt) }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewMode')">
              {{
                trainingPreviewData.summary?.trainingMode === 'multiclass'
                  ? t('activities.dialog.trainingPreviewModeMulticlass')
                  : t('activities.dialog.trainingPreviewModeBinary')
              }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewCropPolicy')">
              {{ trainingPreviewData.summary?.cropPolicy || t('common.misc.none') }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewAssets')">
              {{ trainingPreviewData.summary?.selectedAssetCount || 0 }} / {{ trainingPreviewData.summary?.totalAssets || 0 }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewAutoNegatives')">
              {{ trainingPreviewData.summary?.autoNegativeAssetCount || 0 }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('activities.dialog.trainingPreviewClips')">
              {{ trainingPreviewData.summary?.previewClipCount || 0 }} / {{ trainingPreviewData.summary?.totalClips || 0 }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="getTrainingPreviewLabelStats(trainingPreviewData.summary).length > 0" class="training-preview-label-stats">
            <div class="training-preview-section-title">{{ t('activities.dialog.trainingPreviewLabelStats') }}</div>
            <div class="training-preview-label-tags">
              <el-tag
                v-for="[label, count] in getTrainingPreviewLabelStats(trainingPreviewData.summary)"
                :key="`${label}-${count}`"
                effect="plain"
              >
                {{ label }}: {{ count }}
              </el-tag>
            </div>
          </div>

          <el-alert
            v-if="Array.isArray(trainingPreviewData.summary?.notes) && trainingPreviewData.summary?.notes.length > 0"
            type="warning"
            show-icon
            :closable="false"
            style="margin-top: 16px;"
          >
            <template #title>{{ t('activities.dialog.trainingPreviewNotes') }}</template>
            <template #default>
              <div class="training-preview-notes">
                <div v-for="(note, index) in trainingPreviewData.summary?.notes || []" :key="`${index}-${note}`">
                  {{ note }}
                </div>
              </div>
            </template>
          </el-alert>

          <div class="training-sample-preview-grid">
            <el-card
              v-for="item in trainingPreviewData.items"
              :key="`${item.assetId}-${item.index}`"
              shadow="never"
              class="training-sample-preview-card"
            >
              <template #header>
                <div class="training-sample-preview-header">
                  <div class="training-sample-preview-title">
                    <strong>{{ t('activities.dialog.trainingPreviewClipTitle', { index: item.index }) }}</strong>
                    <span>
                      {{ formatSeconds(item.startSec) }} - {{ formatSeconds(item.endSec) }}
                    </span>
                  </div>
                  <div class="training-sample-preview-tags">
                    <el-tag size="small" effect="plain">{{ item.labelCode }}</el-tag>
                    <el-tag v-if="item.isAutoNegative" size="small" type="warning" effect="plain">
                      {{ t('activities.dialog.trainingPreviewAutoNegativeTag') }}
                    </el-tag>
                  </div>
                </div>
              </template>

              <div class="training-sample-preview-meta">
                <div><strong>{{ t('activities.dialog.trainingPreviewAsset') }}:</strong> #{{ item.assetId }}</div>
                <div v-if="item.sourceActivityName">
                  <strong>{{ t('activities.dialog.trainingPreviewSourceActivity') }}:</strong> {{ item.sourceActivityName }}
                </div>
                <div><strong>{{ t('activities.dialog.trainingPreviewCropPolicy') }}:</strong> {{ item.cropPolicy || t('common.misc.none') }}</div>
              </div>

              <div class="training-sample-preview-frames">
                <div
                  v-for="frame in item.frames"
                  :key="`${item.index}-${frame.index}`"
                  class="training-sample-preview-frame"
                >
                  <img :src="frame.imageUrl" :alt="`${item.labelCode}-${frame.index}`" />
                  <span>{{ formatSeconds(frame.timeSec) }}</span>
                </div>
              </div>
            </el-card>
          </div>
        </template>

        <el-empty
          v-else-if="!loadingTrainingPreview"
          :description="t('activities.dialog.trainingPreviewEmpty')"
        />
      </div>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="closeTrainingPreview">
          {{ t('common.actions.close') }}
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

.action-recognition-hint {
  margin-bottom: 12px;
}

.action-recognition-settings {
  display: grid;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-fill-color-light);
}

.action-recognition-settings-bar,
.company-action-settings-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-recognition-settings-bar span,
.company-action-settings-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.action-recognition-settings-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-recognition-settings :deep(.el-form-item),
.company-action-settings :deep(.el-form-item) {
  margin-bottom: 8px;
}

.form-help-text {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.company-action-settings {
  display: grid;
  gap: 8px;
}

.object-cues-hint {
  margin-bottom: 12px;
}

.object-cues-list {
  display: grid;
  gap: 12px;
  width: 100%;
}

.object-cue-select {
  display: grid;
  gap: 6px;
  width: 100%;
}

.object-cue-select-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.object-cue-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.object-cue-option small {
  color: var(--el-text-color-secondary);
}

.object-cue-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.object-cue-card-title {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.object-cue-card-title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-cue-card-title span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.object-cue-card-hint {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.object-cue-card :deep(.el-form-item) {
  margin-bottom: 12px;
}

.training-step-strip {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 4px;
}

.training-step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 12px;
  min-width: 1032px;
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
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.training-step-header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
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

.training-table-shell {
  width: 100%;
  overflow-x: auto;
}

.training-table {
  min-width: 100%;
}

.training-table--jobs {
  min-width: 1180px;
}

.training-table--models {
  min-width: 920px;
}

.training-table-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.training-table-actions .el-button + .el-button {
  margin-left: 0;
}

.training-table-actions .el-button {
  white-space: nowrap;
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

.training-preview-dialog {
  display: grid;
  gap: 16px;
}

.training-preview-summary {
  width: 100%;
}

.training-preview-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.training-preview-label-stats,
.training-preview-notes {
  display: grid;
  gap: 8px;
}

.training-preview-label-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.training-sample-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.training-sample-preview-card {
  border-radius: 14px;
}

.training-sample-preview-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.training-sample-preview-title {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.training-sample-preview-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.training-sample-preview-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.training-sample-preview-frames {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.training-sample-preview-frame {
  display: grid;
  gap: 6px;
}

.training-sample-preview-frame img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: #111827;
}

.training-sample-preview-frame span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }

  .training-step-strip {
    overflow-x: visible;
  }

  .training-step-grid {
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .training-step-header {
    flex-direction: column;
  }

  .training-step-header-actions {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }

  .asset-preview-header {
    flex-direction: column;
  }

  .training-sample-preview-header {
    flex-direction: column;
  }

  .training-sample-preview-tags {
    justify-content: flex-start;
  }
}
</style>
