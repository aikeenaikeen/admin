import { i18n } from '@/i18n'

const USER_ROLE_KEYS: Record<string, string> = {
  SUPERADMIN: 'enums.userRole.SUPERADMIN',
  COMPANY_ADMIN: 'enums.userRole.COMPANY_ADMIN',
  USER: 'enums.userRole.USER',
}

const EVENT_TYPE_KEYS: Record<string, string> = {
  IN: 'enums.eventType.IN',
  OUT: 'enums.eventType.OUT',
}

const ACTIVITY_STATUS_KEYS: Record<string, string> = {
  DRAFT: 'enums.activityStatus.DRAFT',
  ACTIVE: 'enums.activityStatus.ACTIVE',
  DEPRECATED: 'enums.activityStatus.DEPRECATED',
}

const ACTIVITY_KIND_KEYS: Record<string, string> = {
  ZONE_KPI: 'enums.activityKind.ZONE_KPI',
  OBJECT_DETECTION: 'enums.activityKind.OBJECT_DETECTION',
  ACTION_RECOGNITION: 'enums.activityKind.ACTION_RECOGNITION',
  HYBRID: 'enums.activityKind.HYBRID',
}

const MODEL_STATUS_KEYS: Record<string, string> = {
  DRAFT: 'enums.modelStatus.DRAFT',
  STAGING: 'enums.modelStatus.STAGING',
  ACTIVE: 'enums.modelStatus.ACTIVE',
  DEPRECATED: 'enums.modelStatus.DEPRECATED',
}

const TRAINING_JOB_STATUS_KEYS: Record<string, string> = {
  QUEUED: 'enums.trainingJobStatus.QUEUED',
  RUNNING: 'enums.trainingJobStatus.RUNNING',
  SUCCEEDED: 'enums.trainingJobStatus.SUCCEEDED',
  FAILED: 'enums.trainingJobStatus.FAILED',
  CANCELLED: 'enums.trainingJobStatus.CANCELLED',
}

const TRAINING_ANNOTATION_TYPE_KEYS: Record<string, string> = {
  POSITIVE: 'enums.trainingAnnotationType.POSITIVE',
  NEGATIVE: 'enums.trainingAnnotationType.NEGATIVE',
}

function translateByMap(
  map: Record<string, string>,
  value: string | null | undefined
): string {
  if (!value) return i18n.global.t('common.misc.none')
  const key = map[value]
  if (!key) return value
  return i18n.global.t(key)
}

export function translateUserRole(role: string | null | undefined): string {
  return translateByMap(USER_ROLE_KEYS, role)
}

export function translateEventType(type: string | null | undefined): string {
  return translateByMap(EVENT_TYPE_KEYS, type)
}

export function translateActivityStatus(status: string | null | undefined): string {
  return translateByMap(ACTIVITY_STATUS_KEYS, status)
}

export function translateActivityKind(kind: string | null | undefined): string {
  return translateByMap(ACTIVITY_KIND_KEYS, kind)
}

export function translateModelStatus(status: string | null | undefined): string {
  return translateByMap(MODEL_STATUS_KEYS, status)
}

export function translateTrainingJobStatus(status: string | null | undefined): string {
  return translateByMap(TRAINING_JOB_STATUS_KEYS, status)
}

export function translateTrainingAnnotationType(type: string | null | undefined): string {
  return translateByMap(TRAINING_ANNOTATION_TYPE_KEYS, type)
}
