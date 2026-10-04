import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue'

export const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

/**
 * Реактивный признак узкого экрана (телефон): true при ширине окна ≤ 768px.
 * Подписывается на matchMedia и отписывается при размонтировании компонента.
 */
export function useIsMobile(): Ref<boolean> {
  const isMobile = ref(false)

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return isMobile
  }

  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  isMobile.value = mediaQuery.matches

  const onChange = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }

  mediaQuery.addEventListener('change', onChange)

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      mediaQuery.removeEventListener('change', onChange)
    })
  }

  return isMobile
}
