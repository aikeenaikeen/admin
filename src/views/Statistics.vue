<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, Calendar, Search, User, Right, Plus, ArrowDown } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Socket } from 'socket.io-client'
import { createReusableTemplate } from '@vueuse/core'
import apiClient from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import CameraStreamDialog from '@/components/CameraStreamDialog.vue'
import { formatDateTime, formatTimeRange } from '@/utils/date'
import { formatCameraLabel, type CameraDisplayInfo } from '@/utils/camera'
import { translateActivityKind, translateEventType } from '@/utils/uiText'
import { createRealtimeSocket } from '@/utils/realtime'
import { getIntervalEvidenceFrames, normalizeEvidenceUrl, type ActivityEvidenceFrame } from '@/utils/activityEvidence'
import { useIsMobile } from '@/composables/useIsMobile'

const { t } = useI18n()
const authStore = useAuthStore()
const isMobile = useIsMobile()

interface StatisticsResponse {
  summary: {
    totalEvents: number
    uniqueEmployees: number
    avgEventsPerDay: string
  }
}

interface Employee {
  id: number
  name: string
  photoUrl: string | null
}

interface PresenceStatus {
  id: number
  name: string
  photoUrl: string | null
  present: boolean
  lastEventType: string | null
  lastEventTime: string | null
}

interface AssignedActivity {
  activityId: number
  enabled: boolean
  activeFrom: string
  activity: {
    id: number
    code: string
    name: string
    kind: string
    status?: string
  }
}

interface EventItem {
  id: number
  employeeId: number
  type: string
  timestamp: string
  source?: string
  meta?: Record<string, any> | null
  employee: {
    name: string
  }
  camera?: CameraDisplayInfo | null
}

interface VisibilityPeriodItem {
  id: string
  employeeId: number
  employee: {
    name: string
  }
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  isOpen: boolean
  startCamera: CameraDisplayInfo | null
  endCamera: CameraDisplayInfo | null
  startEvent: {
    id: number
    type: 'IN'
    timestamp: string
    source: string
  }
  endEvent: {
    id: number
    type: 'OUT'
    timestamp: string
    source: string
  } | null
}

type EmployeeEventRow = EventItem | VisibilityPeriodItem
type EmployeeEventsTypeFilter = 'ALL' | 'IN' | 'OUT'

interface AppearanceSummaryPoint {
  timestamp: string
  cameraId: number | null
}

interface EmployeeAppearanceSummary {
  employeeId: number
  companyId: number
  firstAppearance: AppearanceSummaryPoint | null
  lastAppearance: AppearanceSummaryPoint | null
}

interface CameraInfo extends CameraDisplayInfo {
  ip: string
  rtspPort: number
  isActive: boolean
  recognitionEnabled: boolean
}

interface IntervalItem {
  id: number
  employeeId: number
  employee: {
    id: number
    name: string
  }
  activityId: number
  activity: {
    id: number
    code: string
    name: string
    kind: string
  }
  startTime: string
  endTime: string
  confidence: number
  confirmedCameraIds: number[]
  meta?: Record<string, any> | null
}

interface DetectionEvidenceBboxNormalized {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface DetectionEvidenceFrame extends ActivityEvidenceFrame {
  bbox?: number[]
  bboxInFrame?: number[]
  bboxNormalized?: DetectionEvidenceBboxNormalized
  bboxSource?: string
  frameKind?: string
  width?: number
  height?: number
  originalWidth?: number
  originalHeight?: number
}

interface EmployeeDetails {
  loading: boolean
  loaded: boolean
  error: string | null
  activities: AssignedActivity[]
  activitiesLoading: boolean
  appearanceSummary: EmployeeAppearanceSummary | null
  appearanceSummaryLoading: boolean
  events: EmployeeEventRow[]
  eventsLoading: boolean
  eventsTypeFilter: EmployeeEventsTypeFilter
  eventsPage: number
  eventsPageSize: number
  eventsTotal: number
  intervals: IntervalItem[]
  intervalsLoading: boolean
  intervalsPage: number
  intervalsPageSize: number
  intervalsTotal: number
}

const DEFAULT_EVENTS_PAGE_SIZE = 20
const DEFAULT_INTERVALS_PAGE_SIZE = 20
const DETAIL_PAGE_SIZES = [10, 20, 50, 100]
const REALTIME_REFRESH_DEBOUNCE_MS = 500

const statistics = ref<StatisticsResponse | null>(null)
const employees = ref<Employee[]>([])
const presence = ref<PresenceStatus[]>([])
const cameras = ref<CameraInfo[]>([])
const employeeDetails = ref<Record<number, EmployeeDetails>>({})
const loading = ref(true)
const employeesLoading = ref(false)
const activeEmployeeId = ref<number | null>(null)
const streamDialogVisible = ref(false)
const streamDialogCamera = ref<CameraDisplayInfo | null>(null)
const evidenceDialogVisible = ref(false)
const evidenceDialogInterval = ref<IntervalItem | null>(null)
const detectionEvidenceDialogVisible = ref(false)
const detectionEvidenceDialogEvent = ref<EventItem | null>(null)
const addingIntervalToTrainingId = ref<number | null>(null)

const search = ref('')
const dateFrom = ref('')
const dateTo = ref('')
let socket: Socket | null = null
let presenceReloadTimer: ReturnType<typeof setTimeout> | null = null
let statisticsReloadTimer: ReturnType<typeof setTimeout> | null = null
let employeesReloadTimer: ReturnType<typeof setTimeout> | null = null
let activeEmployeeDetailsReloadTimer: ReturnType<typeof setTimeout> | null = null
let presenceRefreshInFlight = false
let statisticsRefreshInFlight = false
let employeesRefreshInFlight = false
let activeEmployeeDetailsRefreshInFlight = false

const expandedRowKeys = computed(() => (activeEmployeeId.value ? [activeEmployeeId.value] : []))

const presenceByEmployeeId = computed(() => {
  return new Map(presence.value.map((item) => [item.id, item]))
})

const camerasById = computed(() => {
  return new Map(cameras.value.map((camera) => [camera.id, camera]))
})

const selectedEvidenceFrames = computed(() => getIntervalEvidenceFrames(evidenceDialogInterval.value))
const selectedDetectionEvidenceFrames = computed(() => getEventDetectionEvidenceFrames(detectionEvidenceDialogEvent.value))
const canAddActivityEvidenceToTraining = computed(() => authStore.isSuperAdmin)
const employeesDefaultSort = { prop: 'lastEventTime', order: 'descending' as const }

const displayEmployees = computed(() => employees.value)

// На телефоне таблица заменяется карточками; сортировка как у таблицы по умолчанию — свежие события сверху.
const mobileEmployees = computed(() => {
  return [...employees.value].sort((left, right) => compareEmployeeLastEventTime(right, left))
})

const detailPaginationLayout = computed(() => (isMobile.value ? 'prev, pager, next' : 'total, sizes, prev, pager, next'))
const detailPaginationSize = computed(() => (isMobile.value ? 'small' : 'default'))
const MOBILE_INTERVAL_PREVIEW_FRAMES = 6
// На телефоне сразу открываем интервалы активностей — их показывают заказчику; на компьютере как раньше — события.
const detailsTab = ref(isMobile.value ? 'intervals' : 'events')

// Разметка раскрытого сотрудника одна на оба вида: строка таблицы (компьютер) и карточка (телефон).
const [DefineEmployeeDetails, ReuseEmployeeDetails] = createReusableTemplate<{ row: Employee }>()

onMounted(async () => {
  const today = new Date()
  dateFrom.value = today.toISOString().split('T')[0]
  dateTo.value = today.toISOString().split('T')[0]

  await loadPage()
  connectSocket()
})

onBeforeUnmount(() => {
  disconnectSocket()
})

function buildDateRange() {
  let from: string | undefined
  let to: string | undefined

  if (dateFrom.value) {
    const fromDate = new Date(dateFrom.value)
    fromDate.setHours(0, 0, 0, 0)
    from = fromDate.toISOString()
  }

  if (dateTo.value) {
    const toDate = new Date(dateTo.value)
    toDate.setHours(23, 59, 59, 999)
    to = toDate.toISOString()
  }

  return { from, to }
}

function resetEmployeeDetails() {
  employeeDetails.value = {}
}

function clearReloadTimer(handle: ReturnType<typeof setTimeout> | null): null {
  if (handle) {
    clearTimeout(handle)
  }

  return null
}

function disconnectSocket() {
  presenceReloadTimer = clearReloadTimer(presenceReloadTimer)
  statisticsReloadTimer = clearReloadTimer(statisticsReloadTimer)
  employeesReloadTimer = clearReloadTimer(employeesReloadTimer)
  activeEmployeeDetailsReloadTimer = clearReloadTimer(activeEmployeeDetailsReloadTimer)

  if (socket) {
    socket.disconnect()
    socket = null
  }
}

function schedulePresenceRefresh() {
  presenceReloadTimer = clearReloadTimer(presenceReloadTimer)
  presenceReloadTimer = setTimeout(() => {
    void refreshPresenceLive()
  }, REALTIME_REFRESH_DEBOUNCE_MS)
}

function scheduleStatisticsRefresh() {
  statisticsReloadTimer = clearReloadTimer(statisticsReloadTimer)
  statisticsReloadTimer = setTimeout(() => {
    void refreshStatisticsLive()
  }, REALTIME_REFRESH_DEBOUNCE_MS)
}

function scheduleEmployeesRefresh() {
  employeesReloadTimer = clearReloadTimer(employeesReloadTimer)
  employeesReloadTimer = setTimeout(() => {
    void refreshEmployeesLive()
  }, REALTIME_REFRESH_DEBOUNCE_MS)
}

function scheduleActiveEmployeeDetailsRefresh(targetEmployeeId?: number | null) {
  if (!activeEmployeeId.value) {
    return
  }

  if (targetEmployeeId && activeEmployeeId.value !== targetEmployeeId) {
    return
  }

  activeEmployeeDetailsReloadTimer = clearReloadTimer(activeEmployeeDetailsReloadTimer)
  activeEmployeeDetailsReloadTimer = setTimeout(() => {
    void refreshActiveEmployeeDetailsLive()
  }, REALTIME_REFRESH_DEBOUNCE_MS)
}

function connectSocket() {
  disconnectSocket()
  socket = createRealtimeSocket()

  socket.on('connect', () => {
    schedulePresenceRefresh()
    scheduleStatisticsRefresh()
    scheduleEmployeesRefresh()
    scheduleActiveEmployeeDetailsRefresh(activeEmployeeId.value)
  })

  socket.on('event:created', (payload?: { employeeId?: number }) => {
    schedulePresenceRefresh()
    scheduleStatisticsRefresh()
    scheduleActiveEmployeeDetailsRefresh(payload?.employeeId ?? null)
  })

  socket.on('activity-interval:created', (payload?: { employeeId?: number }) => {
    scheduleActiveEmployeeDetailsRefresh(payload?.employeeId ?? null)
  })

  socket.on('employee:created', () => {
    scheduleEmployeesRefresh()
  })

  socket.on('employee:updated', (payload?: { id?: number }) => {
    scheduleEmployeesRefresh()
    scheduleActiveEmployeeDetailsRefresh(payload?.id ?? null)
  })

  socket.on('employee:deleted', () => {
    scheduleEmployeesRefresh()
  })
}

function buildEmployeeParams() {
  const params: Record<string, string> = {}
  const trimmedSearch = search.value.trim()

  if (trimmedSearch) {
    params.search = trimmedSearch
  }

  return params
}

function syncActiveEmployee(nextEmployees: Employee[]) {
  if (activeEmployeeId.value && !nextEmployees.some((employee) => employee.id === activeEmployeeId.value)) {
    activeEmployeeId.value = null
  }
}

async function fetchEmployees() {
  const response = await apiClient.get('/api/employees', {
    params: buildEmployeeParams(),
  })

  return response.data as Employee[]
}

async function loadEmployees() {
  employeesLoading.value = true

  try {
    const nextEmployees = await fetchEmployees()
    employees.value = nextEmployees
    syncActiveEmployee(nextEmployees)
  } catch {
    ElMessage.error(t('employees.loadError'))
  } finally {
    employeesLoading.value = false
  }
}

async function refreshPresenceLive() {
  presenceReloadTimer = clearReloadTimer(presenceReloadTimer)

  if (loading.value || presenceRefreshInFlight) {
    return
  }

  presenceRefreshInFlight = true
  try {
    const response = await apiClient.get('/api/presence')
    presence.value = response.data
  } catch {
    // Keep background refresh silent to avoid noisy UI.
  } finally {
    presenceRefreshInFlight = false
  }
}

async function refreshStatisticsLive() {
  statisticsReloadTimer = clearReloadTimer(statisticsReloadTimer)

  if (loading.value || statisticsRefreshInFlight) {
    return
  }

  const { from, to } = buildDateRange()

  statisticsRefreshInFlight = true
  try {
    const response = await apiClient.get('/api/statistics', {
      params: {
        dateFrom: from,
        dateTo: to,
      },
    })
    statistics.value = response.data
  } catch {
    // Keep background refresh silent to avoid noisy UI.
  } finally {
    statisticsRefreshInFlight = false
  }
}

async function refreshEmployeesLive() {
  employeesReloadTimer = clearReloadTimer(employeesReloadTimer)

  if (loading.value || employeesRefreshInFlight) {
    return
  }

  employeesRefreshInFlight = true
  try {
    const nextEmployees = await fetchEmployees()
    employees.value = nextEmployees
    syncActiveEmployee(nextEmployees)
  } catch {
    // Keep background refresh silent to avoid noisy UI.
  } finally {
    employeesRefreshInFlight = false
  }
}

async function refreshActiveEmployeeDetailsLive() {
  activeEmployeeDetailsReloadTimer = clearReloadTimer(activeEmployeeDetailsReloadTimer)

  const employeeId = activeEmployeeId.value
  if (!employeeId || activeEmployeeDetailsRefreshInFlight) {
    return
  }

  const current = getEmployeeDetails(employeeId)
  if (!current?.loaded || current.loading) {
    return
  }

  activeEmployeeDetailsRefreshInFlight = true
  try {
    const [appearanceSummaryResponse, eventsResponse, intervalsResponse] = await Promise.all([
      fetchEmployeeAppearanceSummary(employeeId),
      fetchEmployeeEvents(employeeId, current.eventsPage, current.eventsPageSize, current.eventsTypeFilter),
      fetchEmployeeIntervals(employeeId, current.intervalsPage, current.intervalsPageSize),
    ])

    updateEmployeeDetails(employeeId, {
      appearanceSummary: appearanceSummaryResponse,
      events: eventsResponse.items,
      eventsPage: eventsResponse.page,
      eventsPageSize: eventsResponse.pageSize,
      eventsTotal: eventsResponse.total,
      intervals: intervalsResponse.items,
      intervalsPage: intervalsResponse.page,
      intervalsPageSize: intervalsResponse.pageSize,
      intervalsTotal: intervalsResponse.total,
    })
  } catch {
    // Silent background refresh.
  } finally {
    activeEmployeeDetailsRefreshInFlight = false
  }
}

async function loadPage() {
  loading.value = true

  try {
    const { from, to } = buildDateRange()

    const [statisticsResponse, presenceResponse, nextEmployees, nextCameras] = await Promise.all([
      apiClient.get('/api/statistics', {
        params: {
          dateFrom: from,
          dateTo: to,
        },
      }),
      apiClient.get('/api/presence'),
      fetchEmployees(),
      apiClient.get('/api/cameras').catch(() => {
        ElMessage.error(t('cameras.loadError'))
        return { data: [] }
      }),
    ])

    statistics.value = statisticsResponse.data
    presence.value = presenceResponse.data
    employees.value = nextEmployees
    cameras.value = nextCameras.data
    syncActiveEmployee(nextEmployees)
    resetEmployeeDetails()

    if (activeEmployeeId.value) {
      await loadEmployeeDetails(activeEmployeeId.value, true)
    }
  } catch (error) {
    ElMessage.error(t('statistics.loadError'))
  } finally {
    loading.value = false
  }
}

function getEmployeePresence(employeeId: number): PresenceStatus | undefined {
  return presenceByEmployeeId.value.get(employeeId)
}

function getEmployeeDetails(employeeId: number): EmployeeDetails | undefined {
  return employeeDetails.value[employeeId]
}

function createEmployeeDetailsState(current?: Partial<EmployeeDetails>): EmployeeDetails {
  return {
    loading: current?.loading ?? false,
    loaded: current?.loaded ?? false,
    error: current?.error ?? null,
    activities: current?.activities ?? [],
    activitiesLoading: current?.activitiesLoading ?? false,
    appearanceSummary: current?.appearanceSummary ?? null,
    appearanceSummaryLoading: current?.appearanceSummaryLoading ?? false,
    events: current?.events ?? [],
    eventsLoading: current?.eventsLoading ?? false,
    eventsTypeFilter: current?.eventsTypeFilter ?? 'IN',
    eventsPage: current?.eventsPage ?? 1,
    eventsPageSize: current?.eventsPageSize ?? DEFAULT_EVENTS_PAGE_SIZE,
    eventsTotal: current?.eventsTotal ?? 0,
    intervals: current?.intervals ?? [],
    intervalsLoading: current?.intervalsLoading ?? false,
    intervalsPage: current?.intervalsPage ?? 1,
    intervalsPageSize: current?.intervalsPageSize ?? DEFAULT_INTERVALS_PAGE_SIZE,
    intervalsTotal: current?.intervalsTotal ?? 0,
  }
}

function updateEmployeeDetails(employeeId: number, patch: Partial<EmployeeDetails>) {
  const current = createEmployeeDetailsState(getEmployeeDetails(employeeId))

  employeeDetails.value = {
    ...employeeDetails.value,
    [employeeId]: {
      ...current,
      ...patch,
    },
  }
}

async function fetchEmployeeActivities(employeeId: number) {
  const response = await apiClient.get(`/api/employees/${employeeId}/activities`)
  return response.data?.activities || []
}

async function fetchEmployeeAppearanceSummary(employeeId: number) {
  const { from, to } = buildDateRange()

  const response = await apiClient.get(`/api/employees/${employeeId}/appearance-summary`, {
    params: {
      dateFrom: from,
      dateTo: to,
    },
  })

  return (response.data || null) as EmployeeAppearanceSummary | null
}

async function fetchEmployeeEvents(
  employeeId: number,
  page: number,
  pageSize: number,
  type: EmployeeEventsTypeFilter
) {
  const { from, to } = buildDateRange()

  const params = {
    employeeId,
    dateFrom: from,
    dateTo: to,
    page,
    limit: pageSize,
  }

  if (type === 'ALL') {
    const response = await apiClient.get('/api/events/visibility-periods', { params })

    return {
      items: response.data?.periods || [],
      total: response.data?.pagination?.total || 0,
      page: response.data?.pagination?.page || page,
      pageSize: response.data?.pagination?.limit || pageSize,
    }
  }

  const response = await apiClient.get('/api/events', {
    params: {
      ...params,
      type,
    },
  })

  return {
    items: response.data?.events || [],
    total: response.data?.pagination?.total || 0,
    page: response.data?.pagination?.page || page,
    pageSize: response.data?.pagination?.limit || pageSize,
  }
}

async function fetchEmployeeIntervals(employeeId: number, page: number, pageSize: number) {
  const { from, to } = buildDateRange()

  const response = await apiClient.get('/api/activity-intervals', {
    params: {
      employeeId,
      from,
      to,
      page,
      pageSize,
    },
  })

  return {
    items: response.data?.items || [],
    total: response.data?.total || 0,
    page: response.data?.page || page,
    pageSize: response.data?.pageSize || pageSize,
  }
}

async function loadEmployeeDetails(employeeId: number, force = false) {
  const current = createEmployeeDetailsState(getEmployeeDetails(employeeId))

  if (current.loaded && !force) {
    return
  }

  updateEmployeeDetails(employeeId, {
    loading: true,
    loaded: false,
    error: null,
    activitiesLoading: true,
    appearanceSummaryLoading: true,
    eventsLoading: true,
    intervalsLoading: true,
  })

  try {
    const [activitiesResponse, appearanceSummaryResponse, eventsResponse, intervalsResponse] = await Promise.all([
      fetchEmployeeActivities(employeeId),
      fetchEmployeeAppearanceSummary(employeeId),
      fetchEmployeeEvents(employeeId, current.eventsPage, current.eventsPageSize, current.eventsTypeFilter),
      fetchEmployeeIntervals(employeeId, current.intervalsPage, current.intervalsPageSize),
    ])

    updateEmployeeDetails(employeeId, {
      loading: false,
      loaded: true,
      error: null,
      activitiesLoading: false,
      appearanceSummaryLoading: false,
      eventsLoading: false,
      intervalsLoading: false,
      activities: activitiesResponse,
      appearanceSummary: appearanceSummaryResponse,
      events: eventsResponse.items,
      eventsPage: eventsResponse.page,
      eventsPageSize: eventsResponse.pageSize,
      eventsTotal: eventsResponse.total,
      intervals: intervalsResponse.items,
      intervalsPage: intervalsResponse.page,
      intervalsPageSize: intervalsResponse.pageSize,
      intervalsTotal: intervalsResponse.total,
    })
  } catch (error: any) {
    updateEmployeeDetails(employeeId, {
      loading: false,
      loaded: false,
      error: error.response?.data?.error || t('statistics.employeeLoadError'),
      activitiesLoading: false,
      appearanceSummaryLoading: false,
      eventsLoading: false,
      intervalsLoading: false,
      activities: [],
      appearanceSummary: null,
      events: [],
      eventsTypeFilter: current.eventsTypeFilter,
      eventsPage: 1,
      eventsPageSize: DEFAULT_EVENTS_PAGE_SIZE,
      eventsTotal: 0,
      intervals: [],
      intervalsPage: 1,
      intervalsPageSize: DEFAULT_INTERVALS_PAGE_SIZE,
      intervalsTotal: 0,
    })
  }
}

async function loadEmployeeEvents(employeeId: number, page: number, pageSize: number) {
  const current = createEmployeeDetailsState(getEmployeeDetails(employeeId))

  updateEmployeeDetails(employeeId, {
    eventsLoading: true,
    eventsPage: page,
    eventsPageSize: pageSize,
  })

  try {
    const response = await fetchEmployeeEvents(
      employeeId,
      page,
      pageSize,
      current.eventsTypeFilter
    )

    updateEmployeeDetails(employeeId, {
      eventsLoading: false,
      events: response.items,
      eventsPage: response.page,
      eventsPageSize: response.pageSize,
      eventsTotal: response.total,
    })
  } catch (error: any) {
    updateEmployeeDetails(employeeId, {
      eventsLoading: false,
    })
    ElMessage.error(error.response?.data?.error || t('statistics.employeeLoadError'))
  }
}

async function handleEventsTypeFilterChange(employeeId: number, value: string | number | boolean) {
  const nextFilter = String(value || 'ALL') as EmployeeEventsTypeFilter

  updateEmployeeDetails(employeeId, {
    eventsTypeFilter: nextFilter,
    eventsPage: 1,
  })

  const details = createEmployeeDetailsState(getEmployeeDetails(employeeId))
  await loadEmployeeEvents(employeeId, 1, details.eventsPageSize)
}

async function loadEmployeeIntervals(employeeId: number, page: number, pageSize: number) {
  updateEmployeeDetails(employeeId, {
    intervalsLoading: true,
    intervalsPage: page,
    intervalsPageSize: pageSize,
  })

  try {
    const response = await fetchEmployeeIntervals(employeeId, page, pageSize)

    updateEmployeeDetails(employeeId, {
      intervalsLoading: false,
      intervals: response.items,
      intervalsPage: response.page,
      intervalsPageSize: response.pageSize,
      intervalsTotal: response.total,
    })
  } catch (error: any) {
    updateEmployeeDetails(employeeId, {
      intervalsLoading: false,
    })
    ElMessage.error(error.response?.data?.error || t('statistics.employeeLoadError'))
  }
}

async function applyFilters() {
  await loadPage()
}

async function handleRefresh() {
  await loadPage()
}

async function handleRowClick(row: Employee, column: { type?: string }) {
  if (column?.type === 'expand') {
    return
  }

  const nextEmployeeId = activeEmployeeId.value === row.id ? null : row.id
  activeEmployeeId.value = nextEmployeeId

  if (nextEmployeeId) {
    await loadEmployeeDetails(nextEmployeeId)
  }
}

async function toggleMobileEmployee(row: Employee) {
  await handleRowClick(row, {})
}

async function handleExpandChange(row: Employee, expandedRows: Employee[]) {
  const isExpanded = expandedRows.some((item) => item.id === row.id)
  activeEmployeeId.value = isExpanded ? row.id : null

  if (isExpanded) {
    await loadEmployeeDetails(row.id)
  }
}

async function handleEventsPageChange(employeeId: number, page: number) {
  const details = createEmployeeDetailsState(getEmployeeDetails(employeeId))
  await loadEmployeeEvents(employeeId, page, details.eventsPageSize)
}

async function handleEventsPageSizeChange(employeeId: number, pageSize: number) {
  await loadEmployeeEvents(employeeId, 1, pageSize)
}

async function handleIntervalsPageChange(employeeId: number, page: number) {
  const details = createEmployeeDetailsState(getEmployeeDetails(employeeId))
  await loadEmployeeIntervals(employeeId, page, details.intervalsPageSize)
}

async function handleIntervalsPageSizeChange(employeeId: number, pageSize: number) {
  await loadEmployeeIntervals(employeeId, 1, pageSize)
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return t('employeeActivities.durationSeconds', { value: seconds })
}

function formatClock(time: string | null | undefined): string {
  if (!time) return t('common.misc.none')
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return t('common.misc.none')
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null) {
    return t('events.inProgress')
  }

  if (seconds < 60) {
    return t('events.durationSeconds', { value: seconds })
  }

  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60

  if (minutes < 60) {
    return restSeconds > 0
      ? t('events.durationMinutesSeconds', { minutes, seconds: restSeconds })
      : t('events.durationMinutes', { value: minutes })
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  return restMinutes > 0
    ? t('events.durationHoursMinutes', { hours, minutes: restMinutes })
    : t('events.durationHours', { value: hours })
}

function formatCameraDisplay(camera?: Pick<CameraDisplayInfo, 'name' | 'location'> | null): string {
  return formatCameraLabel(camera) || t('common.misc.none')
}

function formatVisibilityPeriodCamera(period: VisibilityPeriodItem): string {
  const start = formatCameraDisplay(period.startCamera)
  const end = formatCameraDisplay(period.endCamera)

  if (!period.endCamera || start === end) {
    return start
  }

  return `${start} -> ${end}`
}

function isVisibilityPeriod(row: EmployeeEventRow): row is VisibilityPeriodItem {
  return 'startEvent' in row
}

function getVisibilityPeriodRows(employeeId: number): VisibilityPeriodItem[] {
  return (getEmployeeDetails(employeeId)?.events || []).filter(isVisibilityPeriod)
}

function getRawEventRows(employeeId: number): EventItem[] {
  return (getEmployeeDetails(employeeId)?.events || []).filter(
    (item): item is EventItem => !isVisibilityPeriod(item)
  )
}

function getFallbackCamera(cameraId: number): CameraDisplayInfo {
  return {
    id: cameraId,
    name: t('statistics.cameraFallback', { id: cameraId }),
    location: null,
  }
}

function getIntervalCameras(cameraIds: number[]): CameraDisplayInfo[] {
  return (cameraIds || []).map((cameraId) => camerasById.value.get(cameraId) || getFallbackCamera(cameraId))
}

function getAppearanceCamera(point?: AppearanceSummaryPoint | null): CameraDisplayInfo | null {
  if (!point?.cameraId) {
    return null
  }

  return camerasById.value.get(point.cameraId) || getFallbackCamera(point.cameraId)
}

function openCameraStream(camera?: CameraDisplayInfo | null) {
  if (!camera) {
    return
  }

  streamDialogCamera.value = camera
  streamDialogVisible.value = true
}

function getIntervalPreviewFrames(interval: IntervalItem): ActivityEvidenceFrame[] {
  return getIntervalEvidenceFrames(interval).slice(0, MOBILE_INTERVAL_PREVIEW_FRAMES)
}

function hasIntervalEvidence(interval: IntervalItem): boolean {
  return getIntervalEvidenceFrames(interval).length > 0
}

function openIntervalEvidence(interval: IntervalItem) {
  evidenceDialogInterval.value = interval
  evidenceDialogVisible.value = true
}

async function addIntervalToTraining(interval: IntervalItem) {
  if (!hasIntervalEvidence(interval)) {
    ElMessage.error(t('statistics.activityEvidenceAddNoFrames'))
    return
  }

  try {
    addingIntervalToTrainingId.value = interval.id
    await apiClient.post(`/api/activity-intervals/${interval.id}/training-assets`)
    ElMessage.success(
      t('statistics.activityEvidenceAddedToTraining', {
        activity: interval.activity?.name || interval.activityId,
      })
    )
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('statistics.activityEvidenceAddError'))
  } finally {
    addingIntervalToTrainingId.value = null
  }
}

function getEventDetectionEvidenceFrames(event?: EventItem | null): DetectionEvidenceFrame[] {
  const evidence = event?.meta?.evidence
  if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.frames)) {
    return []
  }

  return evidence.frames
    .map((frame: any) => {
      const url = normalizeEvidenceUrl(frame?.url)
      if (!url) {
        return null
      }

      return {
        ...frame,
        url,
        capturedAt: frame?.capturedAt || evidence?.capturedAt || event?.timestamp,
        score: Number(frame?.score ?? evidence?.score ?? evidence?.confidence ?? 0),
        cropPolicy: frame?.cropPolicy || evidence?.cropPolicy,
        frameSource: frame?.frameSource || evidence?.frameSource,
        bboxSource: frame?.bboxSource || evidence?.cropPolicy,
        frameKind: typeof frame?.frameKind === 'string' ? frame.frameKind : undefined,
      } as DetectionEvidenceFrame
    })
    .filter((frame: DetectionEvidenceFrame | null): frame is DetectionEvidenceFrame => Boolean(frame))
}

function clampEvidenceUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function getFiniteDetectionBbox(frame: DetectionEvidenceFrame): Required<DetectionEvidenceBboxNormalized> | null {
  if (frame.frameKind !== 'full_frame') {
    return null
  }

  const bbox = frame.bboxNormalized
  const x = Number(bbox?.x)
  const y = Number(bbox?.y)
  const width = Number(bbox?.width)
  const height = Number(bbox?.height)

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

function getDetectionBboxStyle(frame: DetectionEvidenceFrame): Record<string, string> | null {
  const bbox = getFiniteDetectionBbox(frame)
  if (!bbox) {
    return null
  }

  const left = clampEvidenceUnit(bbox.x)
  const top = clampEvidenceUnit(bbox.y)
  const right = clampEvidenceUnit(bbox.x + bbox.width)
  const bottom = clampEvidenceUnit(bbox.y + bbox.height)
  const boxWidth = right - left
  const boxHeight = bottom - top

  if (boxWidth <= 0 || boxHeight <= 0) {
    return null
  }

  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${boxWidth * 100}%`,
    height: `${boxHeight * 100}%`,
  }
}

function getDetectionZoomStyle(frame: DetectionEvidenceFrame): Record<string, string> | null {
  const bbox = getFiniteDetectionBbox(frame)
  if (!bbox) {
    return null
  }

  const centerX = clampEvidenceUnit(bbox.x + bbox.width / 2)
  const centerY = clampEvidenceUnit(bbox.y + bbox.height / 2)
  const cropWidth = clampEvidenceUnit(Math.max(0.18, Math.min(0.72, bbox.width * 2.8)))
  const cropHeight = clampEvidenceUnit(Math.max(0.18, Math.min(0.72, bbox.height * 2.8)))
  const cropLeft = clampEvidenceUnit(Math.min(Math.max(centerX - cropWidth / 2, 0), 1 - cropWidth))
  const cropTop = clampEvidenceUnit(Math.min(Math.max(centerY - cropHeight / 2, 0), 1 - cropHeight))
  const backgroundX = cropWidth >= 1 ? 50 : (cropLeft / (1 - cropWidth)) * 100
  const backgroundY = cropHeight >= 1 ? 50 : (cropTop / (1 - cropHeight)) * 100

  return {
    backgroundImage: `url("${frame.url}")`,
    backgroundSize: `${100 / cropWidth}% ${100 / cropHeight}%`,
    backgroundPosition: `${backgroundX}% ${backgroundY}%`,
  }
}

function parseSortTime(value?: string | null): number {
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function compareNumberValues(left: number, right: number): number {
  const safeLeft = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY
  const safeRight = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY
  return safeLeft === safeRight ? 0 : safeLeft > safeRight ? 1 : -1
}

function compareTextValues(left?: string | null, right?: string | null): number {
  return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' })
}

function compareEmployeeName(left: Employee, right: Employee): number {
  return compareTextValues(left.name, right.name)
}

function compareEmployeePresence(left: Employee, right: Employee): number {
  return compareNumberValues(
    getEmployeePresence(left.id)?.present ? 1 : 0,
    getEmployeePresence(right.id)?.present ? 1 : 0
  )
}

function compareEmployeeLastEventType(left: Employee, right: Employee): number {
  return compareTextValues(
    translateEventType(getEmployeePresence(left.id)?.lastEventType || ''),
    translateEventType(getEmployeePresence(right.id)?.lastEventType || '')
  )
}

function compareEmployeeLastEventTime(left: Employee, right: Employee): number {
  return compareNumberValues(
    parseSortTime(getEmployeePresence(left.id)?.lastEventTime),
    parseSortTime(getEmployeePresence(right.id)?.lastEventTime)
  )
}

function compareVisibilityPeriodStart(left: VisibilityPeriodItem, right: VisibilityPeriodItem): number {
  return compareNumberValues(parseSortTime(left.startTime), parseSortTime(right.startTime))
}

function compareVisibilityPeriodDuration(left: VisibilityPeriodItem, right: VisibilityPeriodItem): number {
  return compareNumberValues(left.durationSeconds ?? -1, right.durationSeconds ?? -1)
}

function compareEventTime(left: EventItem, right: EventItem): number {
  return compareNumberValues(parseSortTime(left.timestamp), parseSortTime(right.timestamp))
}

function compareEventType(left: EventItem, right: EventItem): number {
  return compareTextValues(translateEventType(left.type), translateEventType(right.type))
}

function compareIntervalActivity(left: IntervalItem, right: IntervalItem): number {
  return compareTextValues(left.activity?.name || String(left.activityId), right.activity?.name || String(right.activityId))
}

function compareIntervalStart(left: IntervalItem, right: IntervalItem): number {
  return compareNumberValues(parseSortTime(left.startTime), parseSortTime(right.startTime))
}

function compareIntervalEnd(left: IntervalItem, right: IntervalItem): number {
  return compareNumberValues(parseSortTime(left.endTime), parseSortTime(right.endTime))
}

function compareIntervalDuration(left: IntervalItem, right: IntervalItem): number {
  const leftDuration = parseSortTime(left.endTime) - parseSortTime(left.startTime)
  const rightDuration = parseSortTime(right.endTime) - parseSortTime(right.startTime)
  return compareNumberValues(leftDuration, rightDuration)
}

function compareIntervalConfidence(left: IntervalItem, right: IntervalItem): number {
  return compareNumberValues(Number(left.confidence ?? 0), Number(right.confidence ?? 0))
}

function hasEventDetectionEvidence(event: EventItem): boolean {
  return getEventDetectionEvidenceFrames(event).length > 0
}

function openEventDetectionEvidence(event: EventItem) {
  detectionEvidenceDialogEvent.value = event
  detectionEvidenceDialogVisible.value = true
}

function formatEvidenceScore(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return t('common.misc.none')
  }
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <div class="page-container">
    <DefineEmployeeDetails v-slot="{ row }">
      <div v-loading="getEmployeeDetails(row.id)?.loading" class="employee-expand">
        <el-alert
          v-if="getEmployeeDetails(row.id)?.error"
          :title="getEmployeeDetails(row.id)?.error || t('statistics.employeeLoadError')"
          type="error"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />

        <el-row :gutter="16">
          <el-col :xs="24" :lg="9">
            <el-card shadow="never">
              <div class="employee-summary">
                <el-avatar :src="row.photoUrl" :size="96">
                  <el-icon :size="42"><User /></el-icon>
                </el-avatar>

                <div class="employee-summary__meta">
                  <div class="employee-summary__name">{{ row.name }}</div>

                  <div class="employee-summary__tags">
                    <el-tag :type="getEmployeePresence(row.id)?.present ? 'success' : 'info'">
                      {{ getEmployeePresence(row.id)?.present ? t('statistics.present') : t('statistics.absent') }}
                    </el-tag>
                    <el-tag type="primary" effect="plain">ID: {{ row.id }}</el-tag>
                  </div>
                </div>
              </div>

              <el-descriptions :column="1" border style="margin-top: 16px">
                <el-descriptions-item :label="t('statistics.lastEvent')">
                  <span v-if="getEmployeePresence(row.id)?.lastEventType">
                    {{ translateEventType(getEmployeePresence(row.id)?.lastEventType || '') }}
                  </span>
                  <span v-else>{{ t('common.misc.none') }}</span>
                </el-descriptions-item>
                <el-descriptions-item :label="t('statistics.lastEventTime')">
                  {{ formatDateTime(getEmployeePresence(row.id)?.lastEventTime || null) }}
                </el-descriptions-item>
                <el-descriptions-item :label="t('statistics.assignedActivities')">
                  {{ getEmployeeDetails(row.id)?.activities.length || 0 }}
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="15">
            <el-row :gutter="12">
              <el-col :xs="8" :sm="8">
                <el-card shadow="hover">
                  <el-statistic
                    :value="getEmployeeDetails(row.id)?.eventsTotal || 0"
                    :title="t('statistics.totalEvents')"
                  />
                </el-card>
              </el-col>

              <el-col :xs="8" :sm="8">
                <el-card shadow="hover">
                  <el-statistic
                    :value="getEmployeeDetails(row.id)?.intervalsTotal || 0"
                    :title="t('statistics.totalActivityIntervals')"
                  />
                </el-card>
              </el-col>

              <el-col :xs="8" :sm="8">
                <el-card shadow="hover">
                  <el-statistic
                    :value="getEmployeeDetails(row.id)?.activities.length || 0"
                    :title="t('statistics.totalAssignedActivities')"
                  />
                </el-card>
              </el-col>
            </el-row>

            <el-card shadow="never" style="margin-top: 16px">
              <template #header>
                <span>{{ t('statistics.assignedActivities') }}</span>
              </template>

              <div
                v-if="(getEmployeeDetails(row.id)?.activities.length || 0) > 0"
                class="tag-list"
              >
                <el-tag
                  v-for="assignment in getEmployeeDetails(row.id)?.activities || []"
                  :key="assignment.activityId"
                  effect="plain"
                >
                  {{ assignment.activity.name }} ({{ translateActivityKind(assignment.activity.kind) }})
                </el-tag>
              </div>

              <el-empty
                v-else
                :description="t('statistics.noAssignedActivities')"
                :image-size="72"
              />
            </el-card>
          </el-col>
        </el-row>

        <el-card shadow="never" style="margin-top: 16px">
          <el-tabs v-model="detailsTab">
            <el-tab-pane name="events" :label="t('statistics.recentEvents')">
              <div class="employee-events-section">
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  class="employee-events-alert"
                  :title="t('statistics.appearanceSummaryHint')"
                />

                <div
                  v-loading="getEmployeeDetails(row.id)?.appearanceSummaryLoading"
                  class="events-summary-grid"
                >
                  <el-card shadow="never" class="appearance-summary-card">
                    <template #header>
                      <span>{{ t('statistics.firstAppearance') }}</span>
                    </template>

                    <div class="appearance-summary-card__value">
                      {{ formatDateTime(getEmployeeDetails(row.id)?.appearanceSummary?.firstAppearance?.timestamp || null) }}
                    </div>

                    <div class="appearance-summary-card__meta">
                      <span class="appearance-summary-card__meta-label">{{ t('events.camera') }}</span>
                      <el-button
                        v-if="getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.firstAppearance)"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.firstAppearance))"
                      >
                        {{ formatCameraDisplay(getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.firstAppearance)) }}
                      </el-button>
                      <span v-else>{{ t('common.misc.none') }}</span>
                    </div>
                  </el-card>

                  <el-card shadow="never" class="appearance-summary-card">
                    <template #header>
                      <span>{{ t('statistics.lastAppearance') }}</span>
                    </template>

                    <div class="appearance-summary-card__value">
                      {{ formatDateTime(getEmployeeDetails(row.id)?.appearanceSummary?.lastAppearance?.timestamp || null) }}
                    </div>

                    <div class="appearance-summary-card__meta">
                      <span class="appearance-summary-card__meta-label">{{ t('events.camera') }}</span>
                      <el-button
                        v-if="getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.lastAppearance)"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.lastAppearance))"
                      >
                        {{ formatCameraDisplay(getAppearanceCamera(getEmployeeDetails(row.id)?.appearanceSummary?.lastAppearance)) }}
                      </el-button>
                      <span v-else>{{ t('common.misc.none') }}</span>
                    </div>
                  </el-card>
                </div>

                <div class="employee-events-toolbar">
                  <span class="employee-events-toolbar__label">{{ t('statistics.eventTypeFilter') }}</span>
                  <el-radio-group
                    :model-value="getEmployeeDetails(row.id)?.eventsTypeFilter || 'IN'"
                    size="small"
                    @change="handleEventsTypeFilterChange(row.id, $event)"
                  >
                    <el-radio-button label="ALL">{{ t('common.placeholders.all') }}</el-radio-button>
                    <el-radio-button label="IN">{{ t('enums.eventType.IN') }}</el-radio-button>
                    <el-radio-button label="OUT">{{ t('enums.eventType.OUT') }}</el-radio-button>
                  </el-radio-group>
                </div>
              </div>

              <template v-if="!isMobile">
                <el-table
                  v-if="(getEmployeeDetails(row.id)?.eventsTypeFilter || 'IN') === 'ALL' && (getEmployeeDetails(row.id)?.events.length || 0) > 0"
                  v-loading="getEmployeeDetails(row.id)?.eventsLoading"
                  :data="getVisibilityPeriodRows(row.id)"
                  style="width: 100%"
                >
                  <el-table-column
                    :label="t('common.labels.period')"
                    min-width="300"
                    sortable
                    :sort-method="compareVisibilityPeriodStart"
                  >
                    <template #default="{ row: periodRow }">
                      <div class="period-line">
                        <el-tag type="success">{{ translateEventType('IN') }} {{ formatClock(periodRow.startTime) }}</el-tag>
                        <el-icon class="period-line__arrow"><Right /></el-icon>
                        <el-tag :type="periodRow.isOpen ? 'success' : 'warning'" effect="plain">
                          {{ periodRow.isOpen ? t('events.now') : `${translateEventType('OUT')} ${formatClock(periodRow.endTime)}` }}
                        </el-tag>
                      </div>
                      <div class="period-line__date">{{ formatDateTime(periodRow.startTime) }}</div>
                    </template>
                  </el-table-column>

                  <el-table-column
                    :label="t('events.duration')"
                    width="140"
                    sortable
                    :sort-method="compareVisibilityPeriodDuration"
                  >
                    <template #default="{ row: periodRow }">
                      {{ formatDurationSeconds(periodRow.durationSeconds) }}
                    </template>
                  </el-table-column>

                  <el-table-column :label="t('events.camera')" min-width="180">
                    <template #default="{ row: periodRow }">
                      {{ formatVisibilityPeriodCamera(periodRow) }}
                    </template>
                  </el-table-column>
                </el-table>

                <el-table
                  v-else-if="(getEmployeeDetails(row.id)?.events.length || 0) > 0"
                  v-loading="getEmployeeDetails(row.id)?.eventsLoading"
                  :data="getRawEventRows(row.id)"
                  style="width: 100%"
                >
                  <el-table-column prop="id" :label="t('common.labels.number')" width="80" sortable />
                  <el-table-column
                    :label="t('common.labels.time')"
                    min-width="220"
                    sortable
                    :sort-method="compareEventTime"
                  >
                    <template #default="{ row: eventRow }">
                      {{ formatDateTime(eventRow.timestamp) }}
                    </template>
                  </el-table-column>
                  <el-table-column
                    :label="t('events.type')"
                    width="150"
                    sortable
                    :sort-method="compareEventType"
                  >
                    <template #default="{ row: eventRow }">
                      <div class="event-type-cell">
                        <el-tag :type="eventRow.type === 'IN' ? 'success' : 'warning'">
                          {{ translateEventType(eventRow.type) }}
                        </el-tag>
                        <el-button
                          v-if="hasEventDetectionEvidence(eventRow)"
                          link
                          type="primary"
                          class="activity-evidence-link"
                          @click.stop="openEventDetectionEvidence(eventRow)"
                        >
                          {{ t('statistics.viewDetectionEvidence', { count: getEventDetectionEvidenceFrames(eventRow).length }) }}
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('events.camera')" min-width="180">
                    <template #default="{ row: eventRow }">
                      <el-button
                        v-if="eventRow.camera?.id"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(eventRow.camera)"
                      >
                        {{ formatCameraDisplay(eventRow.camera) }}
                      </el-button>
                      <span v-else>
                        {{ formatCameraDisplay(eventRow.camera) }}
                      </span>
                    </template>
                  </el-table-column>
                </el-table>
              </template>
              <template v-else>
                <div
                  v-if="(getEmployeeDetails(row.id)?.eventsTypeFilter || 'IN') === 'ALL' && (getEmployeeDetails(row.id)?.events.length || 0) > 0"
                  v-loading="getEmployeeDetails(row.id)?.eventsLoading"
                  class="mobile-card-list"
                  data-test="mobile-period-cards"
                >
                  <div v-for="periodRow in getVisibilityPeriodRows(row.id)" :key="periodRow.id" class="mobile-item-card">
                    <div class="period-line">
                      <el-tag type="success">{{ translateEventType('IN') }} {{ formatClock(periodRow.startTime) }}</el-tag>
                      <el-icon class="period-line__arrow"><Right /></el-icon>
                      <el-tag :type="periodRow.isOpen ? 'success' : 'warning'" effect="plain">
                        {{ periodRow.isOpen ? t('events.now') : `${translateEventType('OUT')} ${formatClock(periodRow.endTime)}` }}
                      </el-tag>
                    </div>
                    <div class="mobile-item-card__meta">
                      <span>{{ formatDateTime(periodRow.startTime) }}</span>
                      <span>{{ t('events.duration') }}: {{ formatDurationSeconds(periodRow.durationSeconds) }}</span>
                    </div>
                    <div class="mobile-item-card__meta">
                      <span>{{ t('events.camera') }}: {{ formatVisibilityPeriodCamera(periodRow) }}</span>
                    </div>
                  </div>
                </div>

                <div
                  v-else-if="(getEmployeeDetails(row.id)?.events.length || 0) > 0"
                  v-loading="getEmployeeDetails(row.id)?.eventsLoading"
                  class="mobile-card-list"
                  data-test="mobile-event-cards"
                >
                  <div v-for="eventRow in getRawEventRows(row.id)" :key="eventRow.id" class="mobile-item-card">
                    <div class="mobile-item-card__head">
                      <el-tag :type="eventRow.type === 'IN' ? 'success' : 'warning'">
                        {{ translateEventType(eventRow.type) }}
                      </el-tag>
                      <span class="mobile-item-card__time">{{ formatDateTime(eventRow.timestamp) }}</span>
                    </div>
                    <div class="mobile-item-card__meta">
                      <el-button
                        v-if="eventRow.camera?.id"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(eventRow.camera)"
                      >
                        {{ formatCameraDisplay(eventRow.camera) }}
                      </el-button>
                      <span v-else>{{ formatCameraDisplay(eventRow.camera) }}</span>
                      <el-button
                        v-if="hasEventDetectionEvidence(eventRow)"
                        link
                        type="primary"
                        class="activity-evidence-link"
                        @click.stop="openEventDetectionEvidence(eventRow)"
                      >
                        {{ t('statistics.viewDetectionEvidence', { count: getEventDetectionEvidenceFrames(eventRow).length }) }}
                      </el-button>
                    </div>
                  </div>
                </div>
              </template>

              <div v-if="(getEmployeeDetails(row.id)?.eventsTotal || 0) > 0" class="detail-pagination">
                <el-pagination
                  :current-page="getEmployeeDetails(row.id)?.eventsPage || 1"
                  :page-size="getEmployeeDetails(row.id)?.eventsPageSize || DEFAULT_EVENTS_PAGE_SIZE"
                  :page-sizes="DETAIL_PAGE_SIZES"
                  :total="getEmployeeDetails(row.id)?.eventsTotal || 0"
                  :layout="detailPaginationLayout"
                  :size="detailPaginationSize"
                  :pager-count="isMobile ? 5 : 7"
                  @current-change="handleEventsPageChange(row.id, $event)"
                  @size-change="handleEventsPageSizeChange(row.id, $event)"
                />
              </div>

              <el-empty
                v-else
                v-loading="getEmployeeDetails(row.id)?.eventsLoading"
                :description="(getEmployeeDetails(row.id)?.eventsTypeFilter || 'IN') === 'ALL' ? t('events.noVisibilityPeriods') : t('statistics.noEvents')"
                :image-size="72"
              />
            </el-tab-pane>

            <el-tab-pane name="intervals" :label="t('statistics.activityIntervals')">
              <el-table
                v-if="!isMobile && (getEmployeeDetails(row.id)?.intervals.length || 0) > 0"
                v-loading="getEmployeeDetails(row.id)?.intervalsLoading"
                :data="getEmployeeDetails(row.id)?.intervals || []"
                style="width: 100%"
              >
                <el-table-column prop="id" :label="t('common.labels.number')" width="80" sortable />
                <el-table-column
                  :label="t('common.labels.activity')"
                  min-width="220"
                  sortable
                  :sort-method="compareIntervalActivity"
                >
                  <template #default="{ row: intervalRow }">
                    <div class="interval-activity-cell">
                      <span>{{ intervalRow.activity?.name || intervalRow.activityId }}</span>
                      <el-button
                        v-if="hasIntervalEvidence(intervalRow)"
                        link
                        type="primary"
                        class="activity-evidence-link"
                        @click.stop="openIntervalEvidence(intervalRow)"
                      >
                        {{ t('statistics.viewActivityEvidence', { count: getIntervalEvidenceFrames(intervalRow).length }) }}
                      </el-button>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('statistics.startTime')"
                  min-width="180"
                  sortable
                  :sort-method="compareIntervalStart"
                >
                  <template #default="{ row: intervalRow }">
                    {{ formatDateTime(intervalRow.startTime) }}
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('statistics.endTime')"
                  min-width="180"
                  sortable
                  :sort-method="compareIntervalEnd"
                >
                  <template #default="{ row: intervalRow }">
                    {{ formatDateTime(intervalRow.endTime) }}
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('statistics.duration')"
                  width="110"
                  sortable
                  :sort-method="compareIntervalDuration"
                >
                  <template #default="{ row: intervalRow }">
                    {{ formatDuration(intervalRow.startTime, intervalRow.endTime) }}
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('statistics.confidence')"
                  width="110"
                  sortable
                  :sort-method="compareIntervalConfidence"
                >
                  <template #default="{ row: intervalRow }">
                    {{ intervalRow.confidence?.toFixed?.(2) ?? intervalRow.confidence }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('statistics.cameras')" min-width="180">
                  <template #default="{ row: intervalRow }">
                    <div
                      v-if="(intervalRow.confirmedCameraIds || []).length > 0"
                      class="camera-link-list"
                    >
                      <el-button
                        v-for="camera in getIntervalCameras(intervalRow.confirmedCameraIds || [])"
                        :key="camera.id"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(camera)"
                      >
                        {{ formatCameraDisplay(camera) }}
                      </el-button>
                    </div>
                    <span v-else>{{ t('common.misc.none') }}</span>
                  </template>
                </el-table-column>
              </el-table>

              <div
                v-else-if="isMobile && (getEmployeeDetails(row.id)?.intervals.length || 0) > 0"
                v-loading="getEmployeeDetails(row.id)?.intervalsLoading"
                class="mobile-card-list"
                data-test="mobile-interval-cards"
              >
                <article
                  v-for="intervalRow in getEmployeeDetails(row.id)?.intervals || []"
                  :key="intervalRow.id"
                  class="mobile-item-card interval-card"
                >
                  <div class="mobile-item-card__head">
                    <strong class="interval-card__activity">{{ intervalRow.activity?.name || intervalRow.activityId }}</strong>
                    <el-tag type="primary" effect="plain" size="small">
                      {{ formatDuration(intervalRow.startTime, intervalRow.endTime) }}
                    </el-tag>
                  </div>
                  <div class="interval-card__time">{{ formatTimeRange(intervalRow.startTime, intervalRow.endTime) }}</div>
                  <div class="mobile-item-card__meta">
                    <span>{{ t('statistics.confidence') }}: {{ formatEvidenceScore(intervalRow.confidence) }}</span>
                    <template v-if="(intervalRow.confirmedCameraIds || []).length > 0">
                      <el-button
                        v-for="camera in getIntervalCameras(intervalRow.confirmedCameraIds || [])"
                        :key="camera.id"
                        link
                        type="primary"
                        class="camera-link"
                        @click.stop="openCameraStream(camera)"
                      >
                        {{ formatCameraDisplay(camera) }}
                      </el-button>
                    </template>
                  </div>
                  <template v-if="hasIntervalEvidence(intervalRow)">
                    <div class="interval-card__frames" data-test="interval-frames-strip">
                      <button
                        v-for="(frame, index) in getIntervalPreviewFrames(intervalRow)"
                        :key="`${frame.url}-${index}`"
                        type="button"
                        class="interval-card__frame"
                        @click.stop="openIntervalEvidence(intervalRow)"
                      >
                        <img
                          :src="frame.url"
                          :alt="t('statistics.activityEvidenceFrameAlt', { index: index + 1 })"
                          loading="lazy"
                        >
                      </button>
                    </div>
                    <div class="interval-card__frames-footer">
                      <span v-if="getIntervalPreviewFrames(intervalRow).length > 2" class="scroll-hint">
                        {{ t('statistics.swipeHint') }}
                      </span>
                      <el-button
                        type="primary"
                        plain
                        size="small"
                        class="interval-card__evidence-button"
                        data-test="interval-evidence-button"
                        @click.stop="openIntervalEvidence(intervalRow)"
                      >
                        {{ t('statistics.viewActivityEvidence', { count: getIntervalEvidenceFrames(intervalRow).length }) }}
                      </el-button>
                    </div>
                  </template>
                </article>
              </div>

              <div v-if="(getEmployeeDetails(row.id)?.intervalsTotal || 0) > 0" class="detail-pagination">
                <el-pagination
                  :current-page="getEmployeeDetails(row.id)?.intervalsPage || 1"
                  :page-size="getEmployeeDetails(row.id)?.intervalsPageSize || DEFAULT_INTERVALS_PAGE_SIZE"
                  :page-sizes="DETAIL_PAGE_SIZES"
                  :total="getEmployeeDetails(row.id)?.intervalsTotal || 0"
                  :layout="detailPaginationLayout"
                  :size="detailPaginationSize"
                  :pager-count="isMobile ? 5 : 7"
                  @current-change="handleIntervalsPageChange(row.id, $event)"
                  @size-change="handleIntervalsPageSizeChange(row.id, $event)"
                />
              </div>

              <el-empty
                v-else
                v-loading="getEmployeeDetails(row.id)?.intervalsLoading"
                :description="t('statistics.noActivityIntervals')"
                :image-size="72"
              />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </div>
    </DefineEmployeeDetails>

    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('statistics.title') }}</h1>
      </template>
      <template #extra>
        <el-button :icon="Refresh" @click="handleRefresh" :loading="loading">
          {{ t('common.actions.refresh') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px;">
          <el-icon><Calendar /></el-icon>
          <span>{{ t('statistics.period') }}</span>
        </div>
      </template>

      <el-form label-position="top">
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-form-item :label="t('statistics.fromDate')">
              <el-date-picker
                v-model="dateFrom"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>

          <el-col :xs="24" :md="8">
            <el-form-item :label="t('statistics.toDate')">
              <el-date-picker
                v-model="dateTo"
                type="date"
                :placeholder="t('common.placeholders.selectDate')"
                style="width: 100%"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>

          <el-col :xs="24" :md="5" :lg="4">
            <el-form-item class="filter-actions">
              <el-button type="primary" class="apply-filters-button" @click="applyFilters">
                {{ t('statistics.apply') }}
              </el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <div v-loading="loading">
      <div class="stats-grid">
        <el-card shadow="hover">
          <el-statistic :value="statistics?.summary.totalEvents || 0" :title="t('statistics.totalEvents')" />
        </el-card>

        <el-card shadow="hover">
          <el-statistic :value="statistics?.summary.uniqueEmployees || 0" :title="t('statistics.uniqueEmployees')" />
        </el-card>

        <el-card shadow="hover">
          <el-statistic :value="statistics?.summary.avgEventsPerDay || '0'" :title="t('statistics.avgEventsPerDay')" />
        </el-card>
      </div>

      <el-card shadow="never" style="margin-top: 24px">
        <template #header>
          <div class="section-header">
            <span>{{ t('statistics.employeesList') }}</span>
            <div class="section-header__actions">
              <el-tag type="info" effect="plain">
                {{ t('statistics.totalEmployeesLabel', { count: employees.length }) }}
              </el-tag>
              <el-input
                v-model="search"
                :placeholder="t('statistics.employeeSearchPlaceholder')"
                clearable
                :prefix-icon="Search"
                class="section-search"
                @keyup.enter="loadEmployees"
                @clear="loadEmployees"
              />
              <el-button type="primary" :icon="Search" @click="loadEmployees">
                {{ t('common.actions.search') }}
              </el-button>
            </div>
          </div>
        </template>

        <el-table
          v-if="!isMobile && displayEmployees.length > 0"
          v-loading="employeesLoading"
          class="employee-stats-table"
          :data="displayEmployees"
          :default-sort="employeesDefaultSort"
          row-key="id"
          :expand-row-keys="expandedRowKeys"
          @row-click="handleRowClick"
          @expand-change="handleExpandChange"
          style="width: 100%"
        >
          <el-table-column type="expand">
            <template #default="{ row }">
              <ReuseEmployeeDetails :row="row" />
            </template>
          </el-table-column>

          <el-table-column :label="t('employees.table.photo')" width="110">
            <template #default="{ row }">
              <el-avatar :src="row.photoUrl" :size="56">
                <el-icon :size="24"><User /></el-icon>
              </el-avatar>
            </template>
          </el-table-column>

          <el-table-column
            prop="name"
            :label="t('common.labels.employee')"
            min-width="220"
            sortable
            :sort-method="compareEmployeeName"
          />

          <el-table-column
            prop="present"
            :label="t('common.labels.status')"
            width="160"
            sortable
            :sort-method="compareEmployeePresence"
          >
            <template #default="{ row }">
              <el-tag :type="getEmployeePresence(row.id)?.present ? 'success' : 'info'">
                {{ getEmployeePresence(row.id)?.present ? t('statistics.present') : t('statistics.absent') }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column
            prop="lastEventType"
            :label="t('statistics.lastEvent')"
            min-width="220"
            sortable
            :sort-method="compareEmployeeLastEventType"
          >
            <template #default="{ row }">
              <span v-if="getEmployeePresence(row.id)?.lastEventType">
                {{ translateEventType(getEmployeePresence(row.id)?.lastEventType || '') }}
              </span>
              <span v-else>{{ t('common.misc.none') }}</span>
            </template>
          </el-table-column>

          <el-table-column
            prop="lastEventTime"
            :label="t('statistics.lastEventTime')"
            min-width="280"
            sortable
            :sort-method="compareEmployeeLastEventTime"
          >
            <template #default="{ row }">
              {{ formatDateTime(getEmployeePresence(row.id)?.lastEventTime || null) }}
            </template>
          </el-table-column>
        </el-table>

        <div
          v-else-if="isMobile && displayEmployees.length > 0"
          v-loading="employeesLoading"
          class="mobile-employee-list"
          data-test="mobile-employee-cards"
        >
          <section
            v-for="employee in mobileEmployees"
            :key="employee.id"
            class="mobile-employee"
            :class="{ 'mobile-employee--active': activeEmployeeId === employee.id }"
          >
            <button
              type="button"
              class="mobile-employee__header"
              :aria-expanded="activeEmployeeId === employee.id"
              data-test="mobile-employee-toggle"
              @click="toggleMobileEmployee(employee)"
            >
              <el-avatar :src="employee.photoUrl" :size="44">
                <el-icon :size="20"><User /></el-icon>
              </el-avatar>
              <span class="mobile-employee__info">
                <span class="mobile-employee__name">{{ employee.name }}</span>
                <span class="mobile-employee__last">
                  <template v-if="getEmployeePresence(employee.id)?.lastEventType">
                    {{ translateEventType(getEmployeePresence(employee.id)?.lastEventType || '') }} ·
                  </template>
                  {{ formatDateTime(getEmployeePresence(employee.id)?.lastEventTime || null) }}
                </span>
              </span>
              <el-tag :type="getEmployeePresence(employee.id)?.present ? 'success' : 'info'" size="small">
                {{ getEmployeePresence(employee.id)?.present ? t('statistics.present') : t('statistics.absent') }}
              </el-tag>
              <el-icon class="mobile-employee__chevron"><ArrowDown /></el-icon>
            </button>

            <div v-if="activeEmployeeId === employee.id" class="mobile-employee__details">
              <ReuseEmployeeDetails :row="employee" />
            </div>
          </section>
        </div>

        <el-empty
          v-else
          :description="t('statistics.emptyEmployees')"
          :image-size="88"
        />
      </el-card>
    </div>

    <CameraStreamDialog
      v-model="streamDialogVisible"
      :camera="streamDialogCamera"
    />

    <el-dialog
      v-model="detectionEvidenceDialogVisible"
      :title="t('statistics.detectionEvidenceTitle')"
      width="920px"
      :fullscreen="isMobile"
      class="activity-evidence-dialog"
    >
      <div v-if="detectionEvidenceDialogEvent" class="activity-evidence-summary">
        <div>
          <strong>{{ translateEventType(detectionEvidenceDialogEvent.type) }}</strong>
          <span>{{ formatDateTime(detectionEvidenceDialogEvent.timestamp) }}</span>
        </div>
        <el-tag v-if="selectedDetectionEvidenceFrames[0]?.score" type="success">
          {{ t('statistics.confidence') }}: {{ formatEvidenceScore(selectedDetectionEvidenceFrames[0].score) }}
        </el-tag>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="activity-evidence-alert"
        :title="t('statistics.detectionEvidenceHint')"
      />

      <div v-if="selectedDetectionEvidenceFrames.length > 0" class="activity-evidence-grid">
        <figure
          v-for="(frame, index) in selectedDetectionEvidenceFrames"
          :key="`${frame.url}-${index}`"
          class="activity-evidence-card"
        >
          <div class="detection-evidence-views">
            <div class="detection-evidence-frame">
              <img
                :src="frame.url"
                :alt="t('statistics.detectionEvidenceFrameAlt', { index: index + 1 })"
                class="activity-evidence-image detection-evidence-image"
                loading="lazy"
              >
              <span
                v-if="getDetectionBboxStyle(frame)"
                class="detection-evidence-bbox"
                :style="getDetectionBboxStyle(frame)"
              />
            </div>
            <div
              v-if="getDetectionZoomStyle(frame)"
              class="detection-evidence-zoom"
              :style="getDetectionZoomStyle(frame)"
              role="img"
              :aria-label="t('statistics.detectionEvidenceZoomAlt', { index: index + 1 })"
            />
          </div>
          <figcaption class="activity-evidence-meta">
            <span>{{ t('statistics.activityEvidenceFrame', { index: index + 1 }) }}</span>
            <span>{{ t('statistics.confidence') }}: {{ formatEvidenceScore(frame.score) }}</span>
            <span v-if="frame.capturedAt">{{ formatDateTime(frame.capturedAt) }}</span>
            <span v-if="frame.frameSource === 'recognition_detection'">{{ t('statistics.detectionEvidenceSourceRecognition') }}</span>
            <span v-if="frame.bboxSource">{{ t('statistics.cropPolicy') }}: {{ frame.bboxSource }}</span>
          </figcaption>
        </figure>
      </div>

      <el-empty
        v-else
        :description="t('statistics.noDetectionEvidence')"
        :image-size="72"
      />
    </el-dialog>

    <el-dialog
      v-model="evidenceDialogVisible"
      :title="t('statistics.activityEvidenceTitle')"
      width="860px"
      :fullscreen="isMobile"
      class="activity-evidence-dialog"
    >
      <div v-if="evidenceDialogInterval" class="activity-evidence-summary">
        <div>
          <strong>{{ evidenceDialogInterval.activity?.name || evidenceDialogInterval.activityId }}</strong>
          <span v-if="isMobile">{{ formatTimeRange(evidenceDialogInterval.startTime, evidenceDialogInterval.endTime) }}</span>
          <span v-else>
            {{ formatDateTime(evidenceDialogInterval.startTime) }}
            -
            {{ formatDateTime(evidenceDialogInterval.endTime) }}
          </span>
        </div>
        <el-tag type="success">
          {{ t('statistics.confidence') }}: {{ formatEvidenceScore(evidenceDialogInterval.confidence) }}
        </el-tag>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="activity-evidence-alert"
        :title="t('statistics.activityEvidenceHint')"
      />

      <div v-if="selectedEvidenceFrames.length > 0" class="activity-evidence-grid">
        <figure
          v-for="(frame, index) in selectedEvidenceFrames"
          :key="`${frame.url}-${index}`"
          class="activity-evidence-card"
        >
          <img
            :src="frame.url"
            :alt="t('statistics.activityEvidenceFrameAlt', { index: index + 1 })"
            class="activity-evidence-image"
            loading="lazy"
          >
          <figcaption class="activity-evidence-meta">
            <span>{{ t('statistics.activityEvidenceFrame', { index: index + 1 }) }}</span>
            <span v-if="frame.windowRank">{{ t('statistics.activityEvidenceWindow', { index: frame.windowRank }) }}</span>
            <span>{{ t('statistics.confidence') }}: {{ formatEvidenceScore(frame.score) }}</span>
            <span v-if="typeof frame.frameOffset === 'number' && typeof frame.requiredFrames === 'number'">
              {{ t('statistics.activityEvidenceFrameOffset', { index: frame.frameOffset + 1, total: frame.requiredFrames }) }}
            </span>
            <span v-if="frame.capturedAt">{{ formatDateTime(frame.capturedAt) }}</span>
            <span v-if="frame.frameSource === 'model_input'">{{ t('statistics.activityEvidenceSourceModel') }}</span>
            <span v-if="frame.cropPolicy">{{ t('statistics.cropPolicy') }}: {{ frame.cropPolicy }}</span>
            <span v-if="frame.modelVersionId">{{ t('statistics.modelVersionShort') }}: {{ frame.modelVersionId }}</span>
          </figcaption>
        </figure>
      </div>

      <el-empty
        v-else
        :description="t('statistics.noActivityEvidence')"
        :image-size="72"
      />

      <template #footer>
        <el-button @click="evidenceDialogVisible = false">
          {{ t('common.actions.close') }}
        </el-button>
        <el-button
          v-if="canAddActivityEvidenceToTraining"
          type="primary"
          :icon="Plus"
          :disabled="!evidenceDialogInterval || selectedEvidenceFrames.length === 0"
          :loading="addingIntervalToTrainingId === evidenceDialogInterval?.id"
          @click="evidenceDialogInterval && addIntervalToTraining(evidenceDialogInterval)"
        >
          {{ t('statistics.addActivityEvidenceToTraining') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1440px;
  margin: 0 auto;
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

.filter-actions {
  margin-top: 30px;
}

:deep(.filter-actions .el-form-item__content) {
  justify-content: flex-start;
}

.apply-filters-button {
  width: 100%;
  min-width: 160px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.section-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.section-search {
  width: 280px;
}

.employee-expand {
  padding: 8px 0;
}

:deep(.el-table__body tr) {
  cursor: pointer;
}

:deep(.el-table__body tr:hover > td) {
  background-color: var(--el-fill-color-light);
}

:deep(.employee-stats-table .el-table__header .cell) {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

:deep(.employee-stats-table .el-table__header .caret-wrapper) {
  flex: 0 0 auto;
}

.employee-summary {
  display: flex;
  align-items: center;
  gap: 16px;
}

.employee-summary__meta {
  min-width: 0;
  flex: 1;
}

.employee-summary__name {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.employee-summary__tags {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.employee-events-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.employee-events-alert {
  margin-bottom: 0;
}

.events-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.appearance-summary-card__value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.appearance-summary-card__meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
}

.appearance-summary-card__meta-label {
  color: var(--el-text-color-secondary);
}

.employee-events-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.employee-events-toolbar__label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.event-type-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.period-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.period-line__arrow {
  color: var(--el-text-color-secondary);
}

.period-line__date {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.period-details {
  margin: 8px 0;
}

.camera-link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.camera-link {
  height: auto;
  padding: 0;
  text-align: left;
  white-space: normal;
}

.interval-activity-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.activity-evidence-link {
  height: auto;
  padding: 0;
  font-size: 12px;
}

.activity-evidence-summary {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.activity-evidence-summary > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--el-text-color-regular);
}

.activity-evidence-alert {
  margin-bottom: 16px;
}

.activity-evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.activity-evidence-card {
  margin: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
}

.activity-evidence-image {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  background: var(--el-fill-color-dark);
}

.detection-evidence-frame {
  position: relative;
  width: 100%;
  background: var(--el-fill-color-dark);
}

.detection-evidence-views {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(180px, 0.8fr);
  gap: 10px;
  align-items: start;
  padding: 10px;
  background: var(--el-fill-color-light);
}

.detection-evidence-image {
  height: auto;
  aspect-ratio: auto;
  object-fit: contain;
}

.detection-evidence-frame,
.detection-evidence-zoom {
  border-radius: 8px;
  overflow: hidden;
}

.detection-evidence-zoom {
  width: 100%;
  min-height: 180px;
  aspect-ratio: 1;
  background-color: var(--el-fill-color-dark);
  background-repeat: no-repeat;
}

.detection-evidence-bbox {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--el-color-success);
  border-radius: 3px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.82),
    0 0 10px rgba(0, 0, 0, 0.38);
  pointer-events: none;
}

.activity-evidence-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.detail-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* Мобильные карточки: рендерятся только при isMobile, на компьютерный вид не влияют. */
.mobile-employee-list,
.mobile-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-employee {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.mobile-employee--active {
  border-color: var(--el-color-primary-light-5);
}

.mobile-employee__header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 60px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mobile-employee__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mobile-employee__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-employee__last {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-employee__chevron {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
}

.mobile-employee--active .mobile-employee__chevron {
  transform: rotate(180deg);
}

.mobile-employee__details {
  padding: 0 8px 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.mobile-item-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  min-width: 0;
}

.mobile-item-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-item-card__time {
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-align: right;
}

.mobile-item-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.mobile-item-card__meta .el-button + .el-button {
  margin-left: 0;
}

.interval-card__activity {
  min-width: 0;
  font-size: 15px;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}

.interval-card__time {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

/* Лента кадров: горизонтальная прокрутка только внутри карточки, страница не скроллится вбок. */
.interval-card__frames {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}

.interval-card__frame {
  flex: 0 0 auto;
  width: 112px;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-dark);
  scroll-snap-align: start;
  cursor: pointer;
}

.interval-card__frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.interval-card__frames-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.interval-card__evidence-button {
  margin-left: auto;
}

.scroll-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .page-header {
    margin-bottom: 12px;
  }

  .page-container :deep(.el-card__header) {
    padding: 12px;
  }

  .page-container :deep(.el-card__body) {
    padding: 12px;
  }

  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .stats-grid :deep(.el-statistic__head),
  .employee-expand :deep(.el-statistic__head) {
    font-size: 11px;
    line-height: 1.3;
  }

  .stats-grid :deep(.el-statistic__content),
  .employee-expand :deep(.el-statistic__content) {
    font-size: 18px;
  }

  .section-header__actions {
    width: 100%;
  }

  .section-header__actions .section-search {
    flex: 1 1 160px;
  }

  .employee-summary :deep(.el-avatar) {
    --el-avatar-size: 64px !important;
  }

  .activity-evidence-grid {
    grid-template-columns: 1fr;
  }

  .employee-summary {
    align-items: flex-start;
  }

  .section-search {
    width: 100%;
  }

  .filter-actions {
    margin-top: 0;
  }

  .apply-filters-button {
    min-width: 0;
  }

  .detail-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .employee-events-toolbar {
    align-items: flex-start;
  }

  .activity-evidence-summary {
    flex-direction: column;
  }

  .detection-evidence-views {
    grid-template-columns: 1fr;
  }
}
</style>
