import { createI18n } from 'vue-i18n'
import en from './messages/en'
import ru from './messages/ru'

export const LOCALE_STORAGE_KEY = 'admin-locale'
export const SUPPORTED_LOCALES = ['ru', 'en'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function resolveInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'ru'

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored && isSupportedLocale(stored)) return stored

  const browserLocale = window.navigator.language.toLowerCase()
  if (browserLocale.startsWith('ru')) return 'ru'

  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messages: { ru, en },
  missingWarn: false,
  fallbackWarn: false,
})

function syncDocumentLang(locale: AppLocale) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = locale
  }
}

syncDocumentLang(i18n.global.locale.value as AppLocale)

export function persistLocale(locale: AppLocale) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  syncDocumentLang(locale)
}
