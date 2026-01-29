import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useDark, useToggle } from '@vueuse/core'

/**
 * Store для управления темой приложения
 * Использует useDark из @vueuse/core для автоматической синхронизации с localStorage
 * и применения класса 'dark' на html элемент
 */
export const useThemeStore = defineStore('theme', () => {
  // useDark автоматически:
  // - Применяет класс 'dark' к html элементу
  // - Сохраняет значение в localStorage (ключ 'vueuse-color-scheme')
  // - Восстанавливает значение при загрузке
  const isDark = useDark({
    selector: 'html',
    attribute: 'class',
    valueDark: 'dark',
    valueLight: '',
  })

  // Создаём toggle функцию для переключения темы
  const toggleTheme = useToggle(isDark)

  // Computed свойство для удобного доступа
  const currentTheme = computed(() => isDark.value ? 'dark' : 'light')

  return {
    isDark,
    currentTheme,
    toggleTheme,
  }
})
