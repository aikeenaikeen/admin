<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import apiClient from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { translateUserRole } from '@/utils/uiText'

type UserRole = 'SUPERADMIN' | 'COMPANY_ADMIN' | 'USER'

interface UserRow {
  id: number
  email: string
  role: UserRole
  companyId: number | null
}

interface Company {
  id: number
  name: string
  slug: string
  isActive: boolean
}

const authStore = useAuthStore()
const { t } = useI18n()

const users = ref<UserRow[]>([])
const companies = ref<Company[]>([])
const loading = ref(true)
const dialogVisible = ref(false)

const form = ref({
  email: '',
  password: '',
  role: 'COMPANY_ADMIN' as UserRole,
  companyId: null as number | null,
})

const companiesById = computed(() => {
  const map = new Map<number, Company>()
  for (const c of companies.value) map.set(c.id, c)
  return map
})

const companyRequired = computed(() => form.value.role !== 'SUPERADMIN')

onMounted(async () => {
  await Promise.all([loadCompanies(), loadUsers()])
})

async function loadUsers() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/users')
    users.value = response.data
  } catch (error) {
    ElMessage.error(t('users.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadCompanies() {
  try {
    const response = await apiClient.get('/api/companies')
    companies.value = response.data
  } catch (error) {
    // Superadmin-only view; if it fails, user creation will still work for SUPERADMIN role.
    companies.value = []
  }
}

function startCreate() {
  dialogVisible.value = true
  form.value = {
    email: '',
    password: '',
    role: 'COMPANY_ADMIN',
    companyId: companies.value[0]?.id ?? null,
  }
}

async function handleSubmit() {
  try {
    if (!form.value.email || !form.value.password) {
      ElMessage.error(t('users.validationEmailPassword'))
      return
    }

    if (companyRequired.value && !form.value.companyId) {
      ElMessage.error(t('users.validationCompany'))
      return
    }

    const payload: any = {
      email: form.value.email,
      password: form.value.password,
      role: form.value.role,
    }
    if (companyRequired.value) {
      payload.companyId = form.value.companyId
    }

    await apiClient.post('/api/users', payload)
    ElMessage.success(t('users.created'))
    dialogVisible.value = false
    await loadUsers()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('users.createError'))
  }
}

async function deleteUser(userId: number) {
  try {
    await ElMessageBox.confirm(
      t('users.deleteConfirmText'),
      t('users.deleteConfirmTitle'),
      {
        confirmButtonText: t('common.actions.delete'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    await apiClient.delete(`/api/users/${userId}`)
    ElMessage.success(t('users.deleteSuccess'))
    await loadUsers()
  } catch (error: any) {
    if (error === 'cancel') return
    ElMessage.error(error.response?.data?.error || t('users.deleteError'))
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('users.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ t('users.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="users" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        <el-table-column prop="email" :label="t('common.labels.email')" min-width="240" />

        <el-table-column :label="t('common.labels.role')" width="160">
          <template #default="{ row }">
            <el-tag :type="row.role === 'SUPERADMIN' ? 'danger' : row.role === 'COMPANY_ADMIN' ? 'warning' : 'info'">
              {{ translateUserRole(row.role) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.labels.company')" min-width="220">
          <template #default="{ row }">
            <span v-if="row.companyId">
              {{ companiesById.get(row.companyId)?.name || t('users.companyFallback', { id: row.companyId }) }}
            </span>
            <span v-else>{{ t('common.misc.none') }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.labels.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              :disabled="row.id === authStore.user?.id"
              @click="deleteUser(row.id)"
            >
              {{ t('common.actions.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="t('users.dialogTitle')" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('common.labels.email')" required>
          <el-input v-model="form.email" :placeholder="t('users.emailPlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('common.labels.password')" required>
          <el-input v-model="form.password" type="password" show-password :placeholder="t('users.passwordHint')" />
        </el-form-item>

        <el-form-item :label="t('common.labels.role')" required>
          <el-select v-model="form.role" style="width: 100%">
            <el-option :label="translateUserRole('SUPERADMIN')" value="SUPERADMIN" />
            <el-option :label="translateUserRole('COMPANY_ADMIN')" value="COMPANY_ADMIN" />
            <el-option :label="translateUserRole('USER')" value="USER" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="companyRequired" :label="t('common.labels.company')" required>
          <el-select v-model="form.companyId" filterable style="width: 100%" :placeholder="t('common.placeholders.selectCompany')">
            <el-option
              v-for="c in companies"
              :key="c.id"
              :label="`${c.name} (${c.slug})`"
              :value="c.id"
            />
          </el-select>
          <template #extra>
              <span style="font-size: 12px; color: var(--el-text-color-secondary);">
              {{ t('users.companyHint') }}
              </span>
          </template>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{ t('common.actions.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}
</style>
