import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue'

/** Ширина, до которой (включительно) показываем мобильную раскладку. */
export const MOBILE_BREAKPOINT = 768
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`

function readIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
  }
  return window.innerWidth <= MOBILE_BREAKPOINT
}

/**
 * Реактивный признак «узкий экран» (≤ 768px).
 *
 * Значение вычисляется сразу при вызове (без мигания компьютерной раскладки
 * на первом кадре) и обновляется при изменении размера окна. Подписка
 * снимается вместе со scope компонента/эффекта.
 */
export function useIsMobile(): Readonly<Ref<boolean>> {
  const isMobile = ref(readIsMobile())
  if (typeof window === 'undefined') return readonly(isMobile)

  const sync = () => {
    isMobile.value = readIsMobile()
  }

  const mql = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_MEDIA_QUERY) : null
  if (mql && typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', sync)
  }
  // resize — запасной путь: старые Safari и тестовые окружения не всегда шлют change
  window.addEventListener('resize', sync)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (mql && typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', sync)
      }
      window.removeEventListener('resize', sync)
    })
  }

  return readonly(isMobile)
}
