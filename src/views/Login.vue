<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LogoIcon from '@/components/icons/LogoIcon.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const loginForm = ref({
  email: '',
  password: '',
})

const loading = ref(false)

async function handleLogin() {
  loading.value = true

  try {
    await authStore.login(loginForm.value.email, loginForm.value.password)
    ElMessage.success(t('login.success'))
    router.push('/dashboard')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('login.error'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card" shadow="always">
      <div class="login-header">
        <div class="brand">
          <LogoIcon class="brand-logo" :size="40" :title="t('common.brandLogoTitle')" />
          <h1>{{ t('common.appName') }}</h1>
        </div>
        <p class="subtitle">{{ t('login.subtitle') }}</p>
      </div>

      <el-form
        :model="loginForm"
        @submit.prevent="handleLogin"
        label-position="top"
        size="large"
      >
        <el-form-item :label="t('common.labels.email')">
          <el-input
            v-model="loginForm.email"
            :prefix-icon="User"
            type="email"
            :placeholder="t('login.placeholders.email')"
            required
          />
        </el-form-item>

        <el-form-item :label="t('common.labels.password')">
          <el-input
            v-model="loginForm.password"
            :prefix-icon="Lock"
            type="password"
            :placeholder="t('login.placeholders.password')"
            show-password
            required
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            style="width: 100%"
            size="large"
          >
            {{ loading ? t('login.submitting') : t('login.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <el-divider />
        <p class="demo-accounts">
          <strong>{{ t('login.demoTitle') }}</strong><br>
          {{ t('login.demoSuperadmin') }}<br>
          {{ t('login.demoCompanyAdmin') }}
        </p>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary) 0%, var(--el-color-primary-dark-2) 100%);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  border-radius: 12px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 40px;
  height: 40px;
}

.login-header h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.login-footer {
  margin-top: 24px;
}

.demo-accounts {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  line-height: 1.6;
}

@media (max-width: 480px) {
  .login-page {
    padding: 16px;
  }
  
  .login-header h1 {
    font-size: 24px;
  }
}
</style>
