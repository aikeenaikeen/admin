<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { formatDate } from '@/utils/date'
import RecognitionConfigForm from '@/components/RecognitionConfigForm.vue'

interface Company {
  id: number
  name: string
  slug: string
  isActive: boolean
  createdAt: string
}

type RecognitionConfig = Record<string, any>

interface RecognitionConfigDefaultsResponse {
  recognitionConfigDefaults: RecognitionConfig
}

interface RecognitionConfigSnapshot {
  recognitionConfigDefaults: RecognitionConfig
  rawRecognitionConfig: RecognitionConfig | null
  resolvedRecognitionConfig: RecognitionConfig
  recognitionConfigUpdatedAt: string | null
}

const companies = ref<Company[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const { t } = useI18n()

// Редактирование recognitionConfig
const editConfigDialogVisible = ref(false)
const editingCompanyId = ref<number | null>(null)
const editingCompanyName = ref('')
const configLoading = ref(false)
const configSaving = ref(false)
const recognitionConfigDefaults = ref<RecognitionConfig | null>(null)

const form = ref({
  name: '',
  slug: '',
  recognitionConfig: {} as RecognitionConfig,
})

const showAdvanced = ref(false)
const showAdvancedEdit = ref(false)

const editConfig = ref<RecognitionConfig | null>(null)

function cloneRecognitionConfig(config: RecognitionConfig): RecognitionConfig {
  return JSON.parse(JSON.stringify(config))
}

function resetCreateForm() {
  form.value = {
    name: '',
    slug: '',
    recognitionConfig: recognitionConfigDefaults.value
      ? cloneRecognitionConfig(recognitionConfigDefaults.value)
      : ({} as RecognitionConfig),
  }
}

onMounted(async () => {
  try {
    await ensureRecognitionConfigDefaultsLoaded()
    resetCreateForm()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configLoadError'))
  }
  await loadCompanies()
})

async function loadCompanies() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/companies')
    companies.value = response.data
  } catch (error) {
    ElMessage.error(t('companies.loadError'))
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    await apiClient.post('/api/companies', form.value)
    ElMessage.success(t('companies.created'))
    dialogVisible.value = false
    resetCreateForm()
    await loadCompanies()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.createError'))
  }
}

async function toggleCompany(id: number, isActive: boolean) {
  try {
    await apiClient.put(`/api/companies/${id}`, { isActive: !isActive })
    ElMessage.success(isActive ? t('companies.deactivated') : t('companies.activated'))
    await loadCompanies()
  } catch (error) {
    ElMessage.error(t('companies.toggleError'))
  }
}

async function deleteCompany(id: number) {
  try {
    await ElMessageBox.confirm(
      t('companies.deleteConfirmText'),
      t('companies.deleteConfirmTitle'),
      {
        confirmButtonText: t('common.actions.delete'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    await apiClient.delete(`/api/companies/${id}`)
    ElMessage.success(t('companies.deleted'))
    await loadCompanies()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('companies.deleteError'))
    }
  }
}

function generateSlug() {
  form.value.slug = form.value.name
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureRecognitionConfigDefaultsLoaded() {
  if (recognitionConfigDefaults.value) {
    return
  }

  const response = await apiClient.get<RecognitionConfigDefaultsResponse>(
    '/api/companies/recognition-config/defaults'
  )
  recognitionConfigDefaults.value = response.data.recognitionConfigDefaults
}

async function openCreateDialog() {
  try {
    await ensureRecognitionConfigDefaultsLoaded()
    resetCreateForm()
    showAdvanced.value = false
    dialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configLoadError'))
  }
}

async function openEditConfig(company: Company) {
  editingCompanyId.value = company.id
  editingCompanyName.value = company.name
  configLoading.value = true
  editConfig.value = null
  editConfigDialogVisible.value = true
  showAdvancedEdit.value = false
  
  try {
    await ensureRecognitionConfigDefaultsLoaded()
    const response = await apiClient.get<RecognitionConfigSnapshot>(
      `/api/companies/${company.id}/recognition-config`
    )
    recognitionConfigDefaults.value = response.data.recognitionConfigDefaults
    editConfig.value = cloneRecognitionConfig(response.data.resolvedRecognitionConfig)
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configLoadError'))
    editConfigDialogVisible.value = false
    editConfig.value = null
  } finally {
    configLoading.value = false
  }
}

async function saveConfig() {
  if (!editingCompanyId.value || !editConfig.value) return
  
  configSaving.value = true
  try {
    await apiClient.put(
      `/api/companies/${editingCompanyId.value}/recognition-config`,
      editConfig.value
    )
    ElMessage.success(t('companies.configSaved'))
    editConfigDialogVisible.value = false
    editingCompanyId.value = null
    editingCompanyName.value = ''
    editConfig.value = null
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('companies.configSaveError'))
  } finally {
    configSaving.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('companies.title') }}</h1>
      </template>
      <template #extra>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
        >
          {{ t('companies.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="companies" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />
        
        <el-table-column :label="t('companies.table.slug')" min-width="180">
          <template #default="{ row }">
            <el-tag type="info">{{ row.slug }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'">
              {{ row.isActive ? t('companies.table.active') : t('companies.table.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column :label="t('companies.table.createdAt')" width="150">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        
        <el-table-column :label="t('common.labels.actions')" width="420" fixed="right">
          <template #default="{ row }">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <el-button
                size="small"
                type="primary"
                @click="openEditConfig(row)"
              >
                {{ t('companies.configureRecognition') }}
              </el-button>
              <el-button
                size="small"
                :type="row.isActive ? 'warning' : 'success'"
                @click="toggleCompany(row.id, row.isActive)"
              >
                {{ row.isActive ? t('common.actions.disable') : t('common.actions.enable') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteCompany(row.id)"
              >
                {{ t('common.actions.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-if="recognitionConfigDefaults"
      v-model="dialogVisible"
      :title="t('companies.dialog.addTitle')"
      width="800px"
    >
      <el-form :model="form" label-width="200px">
        <el-form-item :label="t('companies.dialog.name')" required>
          <el-input
            v-model="form.name"
            :placeholder="t('companies.dialog.namePlaceholder')"
            @input="generateSlug"
          />
        </el-form-item>

        <el-form-item :label="t('companies.dialog.slug')" required>
          <el-input
            v-model="form.slug"
            :placeholder="t('companies.dialog.slugPlaceholder')"
          >
            <template #prepend>/</template>
          </el-input>
          <template #extra>
            <span style="font-size: 12px; color: var(--el-text-color-secondary);">
              {{ t('companies.dialog.slugHint') }}
            </span>
          </template>
        </el-form-item>

        <RecognitionConfigForm
          :config="form.recognitionConfig"
          :show-advanced="showAdvanced"
          :with-divider="true"
          @update:show-advanced="showAdvanced = $event"
        />
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{ t('common.actions.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- Диалог редактирования recognitionConfig -->
    <el-dialog
      v-if="editConfig"
      v-model="editConfigDialogVisible"
      :title="t('companies.dialog.configTitle', { name: editingCompanyName })"
      width="800px"
      v-loading="configLoading"
    >
      <el-form :model="editConfig" label-width="200px">
        <RecognitionConfigForm
          :config="editConfig"
          :show-advanced="showAdvancedEdit"
          @update:show-advanced="showAdvancedEdit = $event"
        />
      </el-form>

      <template #footer>
        <el-button @click="editConfigDialogVisible = false" :disabled="configSaving">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="saveConfig" :loading="configSaving">{{ t('common.actions.save') }}</el-button>
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
