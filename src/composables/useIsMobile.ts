import { useMediaQuery } from '@vueuse/core'

// Общий брейкпоинт телефонной вёрстки. Совпадает с @media (max-width: 768px) в стилях.
export const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

/** true, пока окно не шире 768px. Реагирует на поворот экрана и изменение размера окна. */
export function useIsMobile() {
  return useMediaQuery(MOBILE_MEDIA_QUERY)
}
