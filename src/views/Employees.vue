<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Delete, User, Upload, Setting, Close, Edit, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import apiClient from '@/api/client'
import { translateActivityKind } from '@/utils/uiText'
import TableActionsMenu from '@/components/TableActionsMenu.vue'
import { extractErrorMessage, isCancelledMessageBox } from '@/utils/error'

const { t } = useI18n()

interface Employee {
  id: number
  name: string
  photoUrl: string | null
  photoUrls?: string[]
}

interface EmployeePhoto {
  id: number
  employeeId: number
  url: string
  source: string
  createdAt: string
}

interface Activity {
  id: number
  code: string
  name: string
  kind: string
}

interface CompanyActivity {
  id: number
  activityId: number
  enabled: boolean
  activeModelVersionId?: number | null
  activity: Activity
}

type EmployeeTableAction = 'activities' | 'edit' | 'delete'

const employees = ref<Employee[]>([])
const loading = ref(true)
const query = ref('')

const filteredEmployees = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return employees.value
  return employees.value.filter((e) => e.name.toLowerCase().includes(q))
})
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingEmployeeId = ref<number | null>(null)
const editingEmployeePhotoUrl = ref<string | null>(null)

const form = ref({
  name: '',
  photo: null as File | null,
  activityIds: [] as number[],
})

const fileList = ref<UploadFile[]>([])
const photoPreviewUrl = ref<string | null>(null)

function setPhotoPreview(file: File | null) {
  // Revoke the previous object URL — leaving them around leaks memory
  // across multiple file picks in the same dialog session.
  if (photoPreviewUrl.value) {
    URL.revokeObjectURL(photoPreviewUrl.value)
    photoPreviewUrl.value = null
  }
  if (file) {
    photoPreviewUrl.value = URL.createObjectURL(file)
  }
}

// Галерея дополнительных фото сотрудника
const MAX_EXTRA_PHOTOS = 20
const galleryPhotos = ref<EmployeePhoto[]>([])
const galleryPending = ref<File[]>([])
const galleryFileList = ref<UploadFile[]>([])
const galleryBusy = ref(false)

function resetGallery() {
  galleryPhotos.value = []
  galleryPending.value = []
  galleryFileList.value = []
  galleryBusy.value = false
}

async function loadEmployeePhotos(employeeId: number) {
  try {
    const res = await apiClient.get(`/api/employees/${employeeId}/photos`)
    // Пока грузили, диалог могли переключить на другого сотрудника.
    if (editingEmployeeId.value !== employeeId) return
    galleryPhotos.value = res.data || []
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, t('employees.dialog.galleryLoadError')))
  }
}

function handleGalleryChange(file: UploadFile, files: UploadFile[]) {
  if (file.raw && !file.raw.type.startsWith('image/')) {
    ElMessage.error(t('employees.dialog.photoNotImage'))
    galleryFileList.value = files.filter((f) => f.uid !== file.uid)
    syncGalleryPending()
    return
  }

  if (file.raw && file.raw.size > MAX_PHOTO_BYTES) {
    ElMessage.error(t('employees.dialog.photoTooLarge', { mb: 5 }))
    galleryFileList.value = files.filter((f) => f.uid !== file.uid)
    syncGalleryPending()
    return
  }

  syncGalleryPending()
}

function syncGalleryPending() {
  const files: File[] = []
  for (const item of galleryFileList.value) {
    if (item.raw) {
      files.push(item.raw)
    }
  }
  galleryPending.value = files
}

async function uploadGalleryPhotos() {
  const employeeId = editingEmployeeId.value
  if (!employeeId) {
    ElMessage.warning(t('employees.dialog.gallerySaveFirst'))
    return
  }
  if (galleryPending.value.length === 0) return

  if (galleryPhotos.value.length + galleryPending.value.length > MAX_EXTRA_PHOTOS) {
    ElMessage.error(t('employees.dialog.galleryLimit', { max: MAX_EXTRA_PHOTOS }))
    return
  }

  galleryBusy.value = true
  try {
    const formData = new FormData()
    for (const file of galleryPending.value) {
      formData.append('photos', file)
    }

    const res = await apiClient.post(`/api/employees/${employeeId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    const added: EmployeePhoto[] = res.data || []
    ElMessage.success(t('employees.dialog.galleryUploaded', { count: added.length }))
    galleryFileList.value = []
    galleryPending.value = []
    await loadEmployeePhotos(employeeId)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, t('employees.dialog.galleryUploadError')))
  } finally {
    galleryBusy.value = false
  }
}

async function deleteGalleryPhoto(photo: EmployeePhoto) {
  const employeeId = editingEmployeeId.value
  if (!employeeId) return

  try {
    await ElMessageBox.confirm(
      t('employees.dialog.galleryDeleteConfirm'),
      t('employees.deleteConfirmTitle'),
      {
        confirmButtonText: t('common.actions.delete'),
        cancelButtonText: t('common.actions.cancel'),
        type: 'warning',
      }
    )

    await apiClient.delete(`/api/employees/${employeeId}/photos/${photo.id}`)
    galleryPhotos.value = galleryPhotos.value.filter((p) => p.id !== photo.id)
    ElMessage.success(t('employees.dialog.galleryDeleted'))
  } catch (error) {
    if (isCancelledMessageBox(error)) return
    ElMessage.error(extractErrorMessage(error, t('employees.dialog.galleryDeleteError')))
  }
}

// Employee activities dialog
const activitiesDialogVisible = ref(false)
const selectedEmployee = ref<Employee | null>(null)
const companyActivities = ref<CompanyActivity[]>([])
const selectedActivityIds = ref<number[]>([])

onMounted(async () => {
  await Promise.all([loadEmployees(), loadCompanyActivities()])
})

onUnmounted(() => {
  setPhotoPreview(null)
})

async function loadEmployees() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/employees')
    employees.value = response.data
  } catch (error) {
    ElMessage.error(t('employees.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadCompanyActivities() {
  try {
    const response = await apiClient.get('/api/company-activities')
    companyActivities.value = response.data
  } catch {
    companyActivities.value = []
  }
}

async function handleSubmit() {
  try {
    const formData = new FormData()
    formData.append('name', form.value.name)
    if (form.value.photo) {
      formData.append('photo', form.value.photo)
    }

    const url = isEditing.value && editingEmployeeId.value
      ? `/api/employees/${editingEmployeeId.value}`
      : '/api/employees'

    let savedEmployee: Employee | null = null
    if (isEditing.value) {
      const res = await apiClient.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      savedEmployee = res.data
      ElMessage.success(t('employees.updated'))
    } else {
      const res = await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      savedEmployee = res.data
      ElMessage.success(t('employees.created'))
    }

    // Assign activities immediately (new UX)
    const employeeId = isEditing.value ? editingEmployeeId.value : savedEmployee?.id
    if (employeeId) {
      try {
        await apiClient.put(`/api/employees/${employeeId}/activities`, {
          activities: (form.value.activityIds || []).map((id) => ({ activityId: id, enabled: true })),
        })
      } catch (e) {
        ElMessage.error(extractErrorMessage(e, t('employees.savedButActivitiesFailed')))
      }
    }

    resetForm()
    await loadEmployees()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, t('employees.saveError')))
  }
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

function handleFileChange(file: UploadFile) {
  if (!file.raw) return false

  if (!file.raw.type.startsWith('image/')) {
    ElMessage.error(t('employees.dialog.photoNotImage'))
    fileList.value = []
    form.value.photo = null
    return false
  }

  if (file.raw.size > MAX_PHOTO_BYTES) {
    ElMessage.error(t('employees.dialog.photoTooLarge', { mb: 5 }))
    fileList.value = []
    form.value.photo = null
    return false
  }

  form.value.photo = file.raw
  setPhotoPreview(file.raw)
  return false
}

function handleRemove() {
  form.value.photo = null
  setPhotoPreview(null)
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(employee: Employee) {
  isEditing.value = true
  editingEmployeeId.value = employee.id
  editingEmployeePhotoUrl.value = employee.photoUrl
  dialogVisible.value = true
  form.value = {
    name: employee.name,
    photo: null,
    activityIds: [],
  }
  fileList.value = []
  setPhotoPreview(null)
  resetGallery()
  loadEmployeePhotos(employee.id)

  // Load current assigned activities
  loadEmployeeActivityIds(employee.id).then((ids) => {
    if (editingEmployeeId.value === employee.id) {
      form.value.activityIds = ids
    }
  })
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingEmployeeId.value = null
  editingEmployeePhotoUrl.value = null
  form.value = { name: '', photo: null, activityIds: [] }
  fileList.value = []
  setPhotoPreview(null)
  resetGallery()
}

async function loadEmployeeActivityIds(employeeId: number): Promise<number[]> {
  try {
    const res = await apiClient.get(`/api/employees/${employeeId}/activities`)
    const activities = res.data?.activities || []
    return activities.filter((a: any) => a.enabled).map((a: any) => a.activityId)
  } catch {
    return []
  }
}

async function deleteEmployee(id: number) {
  try {
    await ElMessageBox.confirm(t('employees.deleteConfirmText'), t('employees.deleteConfirmTitle'), {
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      type: 'warning',
    })

    await apiClient.delete(`/api/employees/${id}`)
    ElMessage.success(t('employees.deleteSuccess'))
    await loadEmployees()
  } catch (error) {
    if (isCancelledMessageBox(error)) return
    ElMessage.error(extractErrorMessage(error, t('employees.deleteError')))
  }
}

async function openEmployeeActivities(employee: Employee) {
  selectedEmployee.value = employee
  selectedActivityIds.value = []
  activitiesDialogVisible.value = true

  try {
    const res = await apiClient.get(`/api/employees/${employee.id}/activities`)
    const activities = res.data?.activities || []
    selectedActivityIds.value = activities.filter((a: any) => a.enabled).map((a: any) => a.activityId)
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, t('employees.loadActivitiesError')))
  }
}

async function saveEmployeeActivities() {
  if (!selectedEmployee.value) return
  try {
    await apiClient.put(`/api/employees/${selectedEmployee.value.id}/activities`, {
      activities: selectedActivityIds.value.map((id) => ({ activityId: id, enabled: true })),
    })
    ElMessage.success(t('employees.activitiesSaved'))
    activitiesDialogVisible.value = false
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, t('employees.activitiesSaveError')))
  }
}

function getEmployeeActions() {
  return [
    {
      key: 'activities',
      label: t('common.labels.activity'),
      icon: Setting,
    },
    {
      key: 'edit',
      label: t('common.actions.edit'),
      icon: Edit,
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

function handleEmployeeAction(action: EmployeeTableAction, row: Employee) {
  if (action === 'activities') {
    openEmployeeActivities(row)
    return
  }

  if (action === 'edit') {
    startEdit(row)
    return
  }

  deleteEmployee(row.id)
}

function onEmployeeAction(action: string, row: Employee) {
  handleEmployeeAction(action as EmployeeTableAction, row)
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <div class="title-row">
          <h1 class="page-title">{{ t('employees.title') }}</h1>
          <el-tag
            v-if="!loading && employees.length > 0"
            type="info"
            effect="plain"
            class="count-chip"
          >
            {{ t('employees.countSummary', { n: employees.length }) }}
          </el-tag>
        </div>
      </template>
      <template #extra>
        <el-button
          :type="dialogVisible ? 'danger' : 'primary'"
          :icon="dialogVisible ? Close : Plus"
          @click="dialogVisible ? resetForm() : startCreate()"
        >
          {{ dialogVisible ? t('common.actions.cancel') : t('employees.addButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-empty
        v-if="!loading && employees.length === 0"
        :description="t('employees.empty')"
      >
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ t('employees.addButton') }}
        </el-button>
      </el-empty>

      <template v-else>
        <div class="list-toolbar">
          <el-input
            v-model="query"
            :prefix-icon="Search"
            :placeholder="t('employees.searchPlaceholder')"
            clearable
            class="list-toolbar__search"
          />
        </div>

        <el-empty
          v-if="!loading && filteredEmployees.length === 0"
          :description="t('employees.emptyFiltered')"
        />

        <el-table
          v-else
          :data="filteredEmployees"
          v-loading="loading"
          style="width: 100%"
        >
        <el-table-column prop="id" :label="t('common.labels.number')" width="80" />
        
        <el-table-column :label="t('employees.table.photo')" width="100">
          <template #default="{ row }">
            <el-avatar :src="row.photoUrl" :size="60">
              <el-icon :size="30"><User /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" :label="t('employees.table.name')" min-width="180" />

        <el-table-column :label="t('common.labels.actions')" width="112" fixed="right" align="center">
          <template #default="{ row }">
            <TableActionsMenu
              :actions="getEmployeeActions()"
              @select="onEmployeeAction($event, row)"
            />
          </template>
        </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-dialog
      v-model="activitiesDialogVisible"
      :title="t('employees.activitiesDialog.title')"
      width="700px"
    >
      <div v-if="selectedEmployee" style="margin-bottom: 12px; color: var(--el-text-color-regular);">
        {{ t('employees.activitiesDialog.employee') }} <strong>{{ selectedEmployee.name }}</strong>
      </div>

      <el-checkbox-group v-model="selectedActivityIds">
        <el-row :gutter="12">
          <el-col v-for="ca in companyActivities" :key="ca.activityId" :span="12" style="margin-bottom: 8px;">
            <el-checkbox :value="ca.activityId">
              {{ ca.activity.name }} <span style="color: var(--el-text-color-secondary);">({{ translateActivityKind(ca.activity.kind) }})</span>
            </el-checkbox>
          </el-col>
        </el-row>
      </el-checkbox-group>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="activitiesDialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="saveEmployeeActivities">{{ t('common.actions.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('employees.dialog.editTitle') : t('employees.dialog.addTitle')"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('employees.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('employees.dialog.namePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('employees.dialog.activities')">
          <el-select
            v-model="form.activityIds"
            multiple
            filterable
            clearable
            :placeholder="t('employees.dialog.activitiesPlaceholder')"
            style="width: 100%"
          >
            <el-option
              v-for="ca in companyActivities"
              :key="ca.activityId"
              :label="`${ca.activity.name} (${translateActivityKind(ca.activity.kind)})`"
              :value="ca.activityId"
            />
          </el-select>
          <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 6px;">
            {{ t('employees.dialog.activitiesHint') }}
          </div>
        </el-form-item>

        <el-form-item :label="t('employees.dialog.photo')">
          <div class="photo-field">
            <el-avatar
              v-if="photoPreviewUrl || editingEmployeePhotoUrl"
              :src="photoPreviewUrl || editingEmployeePhotoUrl || undefined"
              :size="72"
              shape="square"
              class="photo-field__preview"
            >
              <el-icon :size="32"><User /></el-icon>
            </el-avatar>
            <div class="photo-field__upload">
              <el-upload
                v-model:file-list="fileList"
                :auto-upload="false"
                :limit="1"
                accept="image/*"
                :on-change="handleFileChange"
                :on-remove="handleRemove"
              >
                <el-button :icon="Upload">{{ t('common.actions.selectFile') }}</el-button>
                <template #tip>
                  <div class="photo-field__hint">
                    {{ t('employees.dialog.photoHint') }}
                  </div>
                </template>
              </el-upload>
            </div>
          </div>
        </el-form-item>

        <el-form-item v-if="isEditing" :label="t('employees.dialog.gallery')">
          <div class="gallery-field">
            <div v-if="galleryPhotos.length" class="gallery-field__grid">
              <div v-for="photo in galleryPhotos" :key="photo.id" class="gallery-field__item">
                <el-image
                  :src="photo.url"
                  fit="cover"
                  class="gallery-field__image"
                  :preview-src-list="galleryPhotos.map((p) => p.url)"
                  :initial-index="galleryPhotos.findIndex((p) => p.id === photo.id)"
                  preview-teleported
                />
                <el-button
                  class="gallery-field__remove"
                  type="danger"
                  :icon="Delete"
                  circle
                  size="small"
                  :disabled="galleryBusy"
                  @click="deleteGalleryPhoto(photo)"
                />
                <span v-if="photo.source === 'camera'" class="gallery-field__badge">
                  {{ t('employees.dialog.gallerySourceCamera') }}
                </span>
              </div>
            </div>
            <div v-else class="photo-field__hint">{{ t('employees.dialog.galleryEmpty') }}</div>

            <el-upload
              v-model:file-list="galleryFileList"
              :auto-upload="false"
              multiple
              accept="image/*"
              :limit="MAX_EXTRA_PHOTOS"
              :on-change="handleGalleryChange"
              :on-remove="syncGalleryPending"
            >
              <el-button :icon="Upload" :disabled="galleryBusy">
                {{ t('common.actions.selectFile') }}
              </el-button>
            </el-upload>

            <el-button
              v-if="galleryPending.length"
              type="primary"
              :loading="galleryBusy"
              class="gallery-field__submit"
              @click="uploadGalleryPhotos"
            >
              {{ t('employees.dialog.galleryUpload', { count: galleryPending.length }) }}
            </el-button>

            <div class="photo-field__hint">{{ t('employees.dialog.galleryHint') }}</div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="danger" plain :icon="Close" @click="dialogVisible = false">
          {{ t('common.actions.cancel') }}
        </el-button>
        <el-button type="primary" @click="handleSubmit">
          {{ isEditing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
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

.photo-field {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
}

.photo-field__preview {
  flex-shrink: 0;
  background: var(--el-fill-color-light);
}

.photo-field__upload {
  flex: 1;
  min-width: 0;
}

.gallery-field {
  width: 100%;
}

.gallery-field__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.gallery-field__item {
  position: relative;
  width: 72px;
  height: 72px;
}

.gallery-field__image {
  width: 72px;
  height: 72px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}

.gallery-field__remove {
  position: absolute;
  top: -6px;
  right: -6px;
}

.gallery-field__badge {
  position: absolute;
  left: 0;
  bottom: 0;
  right: 0;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 0 0 4px 4px;
}

.gallery-field__submit {
  margin-top: 8px;
}

.photo-field__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
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

.employee-actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}
</style>
