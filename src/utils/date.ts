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
