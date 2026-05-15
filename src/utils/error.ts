import type { AxiosError } from 'axios'
import { i18n } from '@/i18n'

interface ApiErrorBody {
  error?: string | { error?: string; message?: string }
  message?: string
}

/**
 * Pull a user-readable message out of an arbitrary error.
 * Handles Axios responses, plain Errors, strings, and ElMessageBox "cancel".
 *
 * Why: every view re-implements this same fallback chain inline, often
 * forgetting that `error.response.data.error` can itself be an object
 * (the cameras RTSP endpoint, for example).
 */
export function extractErrorMessage(
  error: unknown,
  fallback?: string,
): string {
  const fb = fallback ?? i18n.global.t('common.errors.generic')

  if (!error) return fb
  if (typeof error === 'string') return error || fb

  if (typeof error === 'object') {
    const axiosErr = error as AxiosError<ApiErrorBody>
    const data = axiosErr.response?.data

    if (data) {
      if (typeof data.error === 'string' && data.error) return data.error
      if (data.error && typeof data.error === 'object') {
        const nested = data.error.error || data.error.message
        if (nested) return nested
      }
      if (data.message) return data.message
    }

    if ('message' in (error as Record<string, unknown>)) {
      const m = (error as { message?: unknown }).message
      if (typeof m === 'string' && m) return m
    }
  }

  return fb
}

export function isCancelledMessageBox(error: unknown): boolean {
  return error === 'cancel' || error === 'close'
}
