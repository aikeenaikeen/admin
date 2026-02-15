<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import apiClient from '@/api/client'
import { useAuthStore } from '@/stores/auth'

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
    ElMessage.error('Не удалось загрузить пользователей')
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
      ElMessage.error('Укажите email и пароль')
      return
    }

    if (companyRequired.value && !form.value.companyId) {
      ElMessage.error('Выберите компанию')
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
    ElMessage.success('Пользователь создан')
    dialogVisible.value = false
    await loadUsers()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось создать пользователя')
  }
}

async function deleteUser(userId: number) {
  try {
    await ElMessageBox.confirm(
      'Вы уверены, что хотите удалить этого пользователя?',
      'Подтверждение',
      {
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена',
        type: 'warning',
      }
    )

    await apiClient.delete(`/api/users/${userId}`)
    ElMessage.success('Пользователь удалён')
    await loadUsers()
  } catch (error: any) {
    if (error === 'cancel') return
    ElMessage.error(error.response?.data?.error || 'Не удалось удалить пользователя')
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">Пользователи</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          Добавить пользователя
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="users" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="email" label="Email" min-width="240" />

        <el-table-column label="Роль" width="160">
          <template #default="{ row }">
            <el-tag :type="row.role === 'SUPERADMIN' ? 'danger' : row.role === 'COMPANY_ADMIN' ? 'warning' : 'info'">
              {{ row.role }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Компания" min-width="220">
          <template #default="{ row }">
            <span v-if="row.companyId">
              {{ companiesById.get(row.companyId)?.name || `Company #${row.companyId}` }}
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>

        <el-table-column label="Действия" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              :disabled="row.id === authStore.user?.id"
              @click="deleteUser(row.id)"
            >
              Удалить
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="Добавить пользователя" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Email" required>
          <el-input v-model="form.email" placeholder="user@company.com" />
        </el-form-item>

        <el-form-item label="Пароль" required>
          <el-input v-model="form.password" type="password" show-password placeholder="Минимум 6 символов" />
        </el-form-item>

        <el-form-item label="Роль" required>
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="SUPERADMIN" value="SUPERADMIN" />
            <el-option label="COMPANY_ADMIN" value="COMPANY_ADMIN" />
            <el-option label="USER" value="USER" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="companyRequired" label="Компания" required>
          <el-select v-model="form.companyId" filterable style="width: 100%" placeholder="Выберите компанию">
            <el-option
              v-for="c in companies"
              :key="c.id"
              :label="`${c.name} (${c.slug})`"
              :value="c.id"
            />
          </el-select>
          <template #extra>
            <span style="font-size: 12px; color: var(--el-text-color-secondary);">
              Для SUPERADMIN компания не привязывается
            </span>
          </template>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="handleSubmit">Создать</el-button>
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


