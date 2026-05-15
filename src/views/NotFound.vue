<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Back, HomeFilled } from '@element-plus/icons-vue'

const router = useRouter()
const { t } = useI18n()

function goHome() {
  router.replace('/dashboard')
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    goHome()
  }
}
</script>

<template>
  <div class="not-found">
    <div class="card">
      <div class="code" aria-hidden="true">404</div>
      <h1>{{ t('notFound.title') }}</h1>
      <p>{{ t('notFound.description') }}</p>
      <div class="actions">
        <el-button :icon="Back" @click="goBack">{{ t('notFound.back') }}</el-button>
        <el-button type="primary" :icon="HomeFilled" @click="goHome">
          {{ t('notFound.home') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 96px);
  padding: 24px;
}

.card {
  text-align: center;
  max-width: 460px;
  padding: 40px 32px;
  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.code {
  font-size: 96px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -2px;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-success));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 16px;
}

h1 {
  margin: 0 0 8px 0;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

p {
  margin: 0 0 24px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
