<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import enLocale from 'element-plus/es/locale/lang/en'
import ruLocale from 'element-plus/es/locale/lang/ru'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

const elementLocale = computed(() => {
  return locale.value === 'ru' ? ruLocale : enLocale
})
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div id="app">
      <RouterView />
    </div>
  </el-config-provider>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: var(--el-bg-color-page);
  color: var(--el-text-color-primary);
}

#app {
  min-height: 100vh;
}

/*
 * Прячем только кнопку «Назад» и разделитель у el-page-header.
 * В Element Plus 2.x заголовок (__content) лежит внутри __left, поэтому
 * прятать весь __left нельзя — пропадают заголовки страниц.
 */
.el-page-header__back,
.el-page-header__left > .el-divider {
  display: none !important;
}

.el-page-header__content {
  margin-left: 0 !important;
}
</style>








