import dayjs from 'dayjs'
import 'dayjs/locale/ru'

dayjs.locale('ru')

function safeParse(value: string | null | undefined) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export function formatDate(value: string | null | undefined): string {
  const parsed = safeParse(value)
  return parsed ? parsed.format('DD MMMM YYYY') : '—'
}

export function formatDateTime(value: string | null | undefined): string {
  const parsed = safeParse(value)
  return parsed ? parsed.format('DD MMMM YYYY, HH:mm') : '—'
}

/**
 * Компактный диапазон времени с секундами: «04.10 12:00:05 – 12:00:41».
 * Если конец в другой день, дата повторяется у конца. Для узких экранов, где полная дата не помещается.
 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const from = safeParse(start)
  const to = safeParse(end)
  if (!from) return '—'
  const head = from.format('DD.MM HH:mm:ss')
  if (!to) return `${head} – …`
  return to.isSame(from, 'day') ? `${head} – ${to.format('HH:mm:ss')}` : `${head} – ${to.format('DD.MM HH:mm:ss')}`
}
