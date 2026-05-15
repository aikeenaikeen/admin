<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Delete, Close, Setting, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import apiClient from '@/api/client'
import { formatDate } from '@/utils/date'
import { extractErrorMessage, isCancelledMessageBox } from '@/utils/error'
import RecognitionConfigForm from '@/components/RecognitionConfigForm.vue'
import TableActionsMenu from '@/components/TableActionsMenu.vue'
import {
  RECOMMENDED_RECOGNITION_CONFIG,
  type RecognitionConfig,
} from '@/constants/recognitionConfig'

interface Company {
  id: number
  name: string
  slug: string
  isActive: boolean
  createdAt: string
}

interface RecognitionConfigSnapshot {
  rawRecognitionConfig: RecognitionConfig | null
  resolvedRecognitionConfig: RecognitionConfig
  recognitionConfigUpdatedAt: string | null
}

type CompanyTableAction = 'configure' | 'toggle' | 'delete'

const companies = ref<Company[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const { t } = useI18n()
const query = ref('')

const activeCount = computed(() => companies.value.filter((c) => c.isActive).length)
const filteredCompanies = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return companies.value
  return companies.value.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(q))
})

// Редактирование recognitionConfig
const editConfigDialogVisible = ref(false)
const editingCompanyId = ref<number | null>(null)
const editingCompanyName = ref('')
const configLoading = ref(false)
const configSaving = ref(false)

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
    recognitionConfig: cloneRecognitionConfig(RECOMMENDED_RECOGNITION_CONFIG),
  }
}

onMounted(async () => {
  resetCreateForm()
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
    ElMessage.error(extractErrorMessage(error, t('companies.createError')))
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
  } catch (error) {
    if (isCancelledMessageBox(error)) return
    ElMessage.error(extractErrorMessage(error, t('companies.deleteError')))
  }
}

function generateSlug() {
  form.value.slug = form.value.name
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, '-')
    .replace(/^-|-$/g, '')
}

function openCreateDialog() {
  resetCreateForm()
  showAdvanced.value = false
  dialogVisible.value = true
}

async function openEditConfig(company: Company) {
  editingCompanyId.value = company.id
  editingCompanyName.value = company.name
  configLoading.value = true
  editConfig.value = null
  editConfigDialogVisible.value = true
  showAdvancedEdit.value = false
  
  try {
    const response = await apiClient.get<RecognitionConfigSnapshot>(
      `/api/companies/${company.id}/recognition-config`
    )
    editConfig.value = cloneRecognitionConfig(response.data.resolvedRecognitionConfig)
  } catch (error: any) {
    ElMessage.error(extractErrorMessage(error, t('companies.configLoadError')))
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
    ElMessage.error(extractErrorMessage(error, t('companies.configSaveError')))
  } finally {
    configSaving.value = false
  }
}

function getCompanyActions(row: Company) {
  return [
    {
      key: 'configure',
      label: t('companies.configureRecognition'),
      icon: Setting,
    },
    {
      key: 'toggle',
      label: row.isActive ? t('common.actions.disable') : t('common.actions.enable'),
    },
    {
      key: 'delete',
      label: t('common.actions.delete'),
      icon: Delete,
      divided: true,
      danger: true,
    },
  ]
}

function handleCompanyAction(action: CompanyTableAction, row: Company) {
  if (action === 'configure') {
    openEditConfig(row)
    return
  }

  if (action === 'toggle') {
    toggleCompany(row.id, row.isActive)
    return
  }

  deleteCompany(row.id)
}

function onCompanyAction(action: string, row: Company) {
  handleCompanyAction(action as CompanyTableAction, row)
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <div class="title-row">
          <h1 class="page-title">{{ t('companies.title') }}</h1>
          <el-tag
            v-if="!loading && companies.length > 0"
            type="info"
            effect="plain"
            class="count-chip"
          >
            {{ t('companies.countSummary', { active: activeCount, total: companies.length }) }}
          </el-tag>
        </div>
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
      <el-empty
        v-if="!loading && companies.length === 0"
        :description="t('companies.empty')"
      >
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">
          {{ t('companies.addButton') }}
        </el-button>
      </el-empty>

      <template v-else>
        <div class="list-toolbar">
          <el-input
            v-model="query"
            :prefix-icon="Search"
            :placeholder="t('companies.searchPlaceholder')"
            clearable
            class="list-toolbar__search"
          />
        </div>

        <el-empty
          v-if="!loading && filteredCompanies.length === 0"
          :description="t('companies.emptyFiltered')"
        />

        <el-table
          v-else
          :data="filteredCompanies"
          v-loading="loading"
          style="width: 100%"
        >
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
        
        <el-table-column :label="t('common.labels.actions')" width="112" fixed="right" align="center">
          <template #default="{ row }">
            <TableActionsMenu
              :actions="getCompanyActions(row)"
              @select="onCompanyAction($event, row)"
            />
          </template>
        </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-dialog
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
        <el-button type="danger" plain :icon="Close" @click="dialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
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
        <el-button
          type="danger"
          plain
          :icon="Close"
          @click="editConfigDialogVisible = false"
          :disabled="configSaving"
        >
          {{ t('common.actions.cancel') }}
        </el-button>
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

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.count-chip {
  font-variant-numeric: tabular-nums;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.list-toolbar__search {
  flex: 1 1 240px;
  max-width: 360px;
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
