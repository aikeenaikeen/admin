/**
 * Кадры-доказательства интервала активности (meta.evidence), общие для «Статистики» и «Активностей сотрудников».
 * Окна интервала сортируются по уверенности (сначала самые уверенные), кадры внутри окна — в исходном порядке.
 */

export interface ActivityEvidenceFrame {
  url: string
  capturedAt?: string
  score?: number
  rawScore?: number
  effectiveScore?: number
  smoothScore?: number
  cropPolicy?: string
  modelVersionId?: number
  windowIndex?: number
  windowRank?: number
  frameOffset?: number
  requiredFrames?: number
  frameSource?: string
  frameSelection?: string
}

export interface EvidenceInterval {
  confidence?: number | null
  meta?: Record<string, any> | null
}

export function normalizeEvidenceUrl(url?: string | null): string {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return value.startsWith('/') ? value : `/${value}`
}

function getIntervalEvidenceWindows(interval?: EvidenceInterval | null): any[] {
  const evidence = interval?.meta?.evidence
  if (!evidence || typeof evidence !== 'object') {
    return []
  }

  if (Array.isArray(evidence.windows)) {
    return evidence.windows
  }

  if (Array.isArray(evidence.frames)) {
    return [evidence]
  }

  return []
}

function getEvidenceWindowScore(window: any, interval?: EvidenceInterval | null): number {
  return Number(window?.score ?? window?.smoothScore ?? interval?.confidence ?? 0)
}

function getSortedIntervalEvidenceWindows(interval?: EvidenceInterval | null): any[] {
  return [...getIntervalEvidenceWindows(interval)].sort((left, right) => {
    const scoreDiff = getEvidenceWindowScore(right, interval) - getEvidenceWindowScore(left, interval)
    if (Math.abs(scoreDiff) > Number.EPSILON) {
      return scoreDiff
    }

    const leftCapturedAt = String(left?.capturedAt || '')
    const rightCapturedAt = String(right?.capturedAt || '')
    return rightCapturedAt.localeCompare(leftCapturedAt)
  })
}

export function getIntervalEvidenceFrames(interval?: EvidenceInterval | null): ActivityEvidenceFrame[] {
  const frames: ActivityEvidenceFrame[] = []

  getSortedIntervalEvidenceWindows(interval).forEach((window, windowIndex) => {
    const windowFrames = Array.isArray(window?.frames) ? window.frames : []
    windowFrames.forEach((frame: any) => {
      const url = normalizeEvidenceUrl(frame?.url)
      if (!url) {
        return
      }

      frames.push({
        ...frame,
        url,
        capturedAt: frame?.capturedAt || window?.capturedAt,
        score: Number(frame?.score ?? window?.score ?? window?.smoothScore ?? interval?.confidence ?? 0),
        rawScore: Number(frame?.rawScore ?? window?.rawScore ?? 0),
        effectiveScore: Number(frame?.effectiveScore ?? window?.effectiveScore ?? 0),
        smoothScore: Number(frame?.smoothScore ?? window?.smoothScore ?? frame?.score ?? window?.score ?? 0),
        cropPolicy: frame?.cropPolicy || window?.cropPolicy,
        modelVersionId: Number(frame?.modelVersionId ?? window?.modelVersionId ?? 0) || undefined,
        requiredFrames: Number(frame?.requiredFrames ?? window?.requiredFrames ?? 0) || undefined,
        frameSource: frame?.frameSource || window?.frameSource,
        frameSelection: frame?.frameSelection || window?.frameSelection,
        windowIndex,
        windowRank: windowIndex + 1,
      })
    })
  })

  return frames
}
