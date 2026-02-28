<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Edit, Delete, VideoCamera } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'
import RoiEditor from '@/components/RoiEditor.vue'
import { translateActivityKind } from '@/utils/uiText'

const { t } = useI18n()

interface Activity {
  id: number
  code: string
  name: string
  kind: string
  status: string
}

interface CompanyActivity {
  id: number
  activityId: number
  activity: Activity
  enabled: boolean
}

interface RoleActivity {
  id: number
  activityId: number
  activity: Activity
  enabled: boolean
  kpi?: any
  cameraConfigs?: CameraConfig[]
}

interface CameraConfig {
  id: number
  cameraId: number
  camera: {
    id: number
    name: string
    location?: string
  }
  roiPolygons: any
  schedule?: any
  thresholds?: any
}

interface Role {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  roleActivities?: RoleActivity[]
  _count?: { employeeAssignments: number }
}

interface Camera {
  id: number
  name: string
  location?: string
}

const roles = ref<Role[]>([])
const availableActivities = ref<CompanyActivity[]>([])
const cameras = ref<Camera[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingRoleId = ref<number | null>(null)
const activityDialogVisible = ref(false)
const selectedRole = ref<Role | null>(null)
const cameraConfigDialogVisible = ref(false)
const selectedRoleActivity = ref<{ roleId: number; activityId: number } | null>(null)
const roiEditorVisible = ref(false)
const roiEditorCameraId = ref<number | null>(null)
const roiEditorInitialPolygons = ref<any[]>([])
const roiEditorTarget = ref<{ roleId: number; activityId: number; cameraId: number } | null>(null)

const form = ref({
  name: '',
})

const selectedActivities = ref<number[]>([])

onMounted(async () => {
  await Promise.all([
    loadRoles(),
    loadAvailableActivities(),
    loadCameras(),
  ])
})

async function loadRoles() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/roles')
    roles.value = response.data
  } catch (error) {
    ElMessage.error(t('roles.loadRolesError'))
  } finally {
    loading.value = false
  }
}

async function loadAvailableActivities() {
  try {
    const response = await apiClient.get('/api/company-activities')
    availableActivities.value = response.data
  } catch (error) {
    ElMessage.error(t('roles.loadActivitiesError'))
  }
}

async function loadCameras() {
  try {
    const response = await apiClient.get('/api/cameras')
    cameras.value = response.data
  } catch (error) {
    ElMessage.error(t('roles.loadCamerasError'))
  }
}

async function handleSubmit() {
  try {
    if (isEditing.value && editingRoleId.value) {
      await apiClient.put(`/api/roles/${editingRoleId.value}`, form.value)
      ElMessage.success(t('roles.updated'))
    } else {
      await apiClient.post('/api/roles', form.value)
      ElMessage.success(t('roles.created'))
    }
    resetForm()
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('roles.saveError'))
  }
}

async function deleteRole(id: number) {
  try {
    await ElMessageBox.confirm(t('roles.deleteConfirmText'), t('roles.deleteConfirmTitle'), {
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      type: 'warning',
    })

    await apiClient.delete(`/api/roles/${id}`)
    ElMessage.success(t('roles.deleted'))
    await loadRoles()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('roles.deleteError'))
    }
  }
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(role: Role) {
  isEditing.value = true
  editingRoleId.value = role.id
  dialogVisible.value = true
  form.value = {
    name: role.name,
  }
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingRoleId.value = null
  form.value = { name: '' }
}

async function openActivitySettings(role: Role) {
  selectedRole.value = role
  selectedActivities.value = role.roleActivities?.map(ra => ra.activityId) || []
  activityDialogVisible.value = true
}

async function saveActivitySettings() {
  if (!selectedRole.value) return

  try {
    const roleId = selectedRole.value.id
    const currentActivityIds = selectedRole.value.roleActivities?.map(ra => ra.activityId) || []

    const toAdd = selectedActivities.value.filter(id => !currentActivityIds.includes(id))
    for (const activityId of toAdd) {
      await apiClient.post(`/api/roles/${roleId}/activities`, {
        activityId,
        enabled: true,
      })
    }

    const toRemove = currentActivityIds.filter(id => !selectedActivities.value.includes(id))
    for (const activityId of toRemove) {
      await apiClient.delete(`/api/roles/${roleId}/activities/${activityId}`)
    }

    ElMessage.success(t('roles.activitiesUpdated'))
    activityDialogVisible.value = false
    await loadRoles()
  } catch (error) {
    ElMessage.error(t('roles.activitiesUpdateError'))
  }
}

function openCameraConfig(roleId: number, activityId: number) {
  selectedRoleActivity.value = { roleId, activityId }
  cameraConfigDialogVisible.value = true
}

async function configureCameraROI(roleId: number, activityId: number, cameraId: number) {
  const role = roles.value.find(r => r.id === roleId)
  const roleActivity = role?.roleActivities?.find(ra => ra.activityId === activityId)
  const existingConfig = roleActivity?.cameraConfigs?.find(cc => cc.cameraId === cameraId)

  roiEditorInitialPolygons.value = existingConfig?.roiPolygons || []
  roiEditorCameraId.value = cameraId
  roiEditorTarget.value = { roleId, activityId, cameraId }
  roiEditorVisible.value = true
}

async function saveRoiPolygons(polygons: any[]) {
  if (!roiEditorTarget.value) return

  const { roleId, activityId, cameraId } = roiEditorTarget.value

  try {
    await apiClient.put(`/api/roles/${roleId}/activities/${activityId}/cameras/${cameraId}`, {
      roiPolygons: polygons,
      schedule: null,
      thresholds: null,
    })
    ElMessage.success(t('roles.zonesSaved'))
    roiEditorVisible.value = false
    roiEditorTarget.value = null
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('roles.zonesSaveError'))
  }
}

function cancelRoiEditor() {
  roiEditorVisible.value = false
  roiEditorTarget.value = null
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">{{ t('roles.title') }}</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ t('roles.createButton') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="roles" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" :label="t('common.labels.number')" width="60" />
        <el-table-column prop="name" :label="t('common.labels.name')" min-width="200" />

        <el-table-column :label="t('roles.table.activitiesCount')" width="120" align="center">
          <template #default="{ row }">
            {{ row.roleActivities?.length || 0 }}
          </template>
        </el-table-column>

        <el-table-column :label="t('roles.table.employeesCount')" width="120" align="center">
          <template #default="{ row }">
            {{ row._count?.employeeAssignments || 0 }}
          </template>
        </el-table-column>

        <el-table-column :label="t('common.labels.actions')" width="400" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="primary"
                @click="openActivitySettings(row)"
              >
                {{ t('common.labels.activity') }}
              </el-button>

              <el-button
                size="small"
                :icon="Edit"
                @click="startEdit(row)"
              >
                {{ t('common.actions.edit') }}
              </el-button>

              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteRole(row.id)"
              >
                {{ t('common.actions.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('roles.dialog.editTitle') : t('roles.dialog.createTitle')"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('roles.dialog.name')" required>
          <el-input v-model="form.name" :placeholder="t('roles.dialog.namePlaceholder')" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit">
          {{ isEditing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="activityDialogVisible"
      :title="t('roles.dialog.roleActivitiesTitle', { name: selectedRole?.name || '' })"
      width="900px"
    >
      <div style="margin-bottom: 16px">
        <el-checkbox-group v-model="selectedActivities">
          <div v-for="companyActivity in availableActivities" :key="companyActivity.activityId">
            <el-checkbox :value="companyActivity.activityId" style="margin-bottom: 12px">
              <strong>{{ companyActivity.activity.name }}</strong>
              <el-tag size="small" style="margin-left: 8px">{{ translateActivityKind(companyActivity.activity.kind) }}</el-tag>
            </el-checkbox>

            <div
              v-if="selectedActivities.includes(companyActivity.activityId) && selectedRole"
              style="margin-left: 32px; margin-top: 8px; margin-bottom: 16px"
            >
              <el-button
                size="small"
                type="primary"
                :icon="VideoCamera"
                @click="openCameraConfig(selectedRole.id, companyActivity.activityId)"
              >
                {{ t('roles.dialog.configureCamerasAndZones') }}
              </el-button>
            </div>
          </div>
        </el-checkbox-group>
      </div>

      <template #footer>
        <el-button @click="activityDialogVisible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" @click="saveActivitySettings">
          {{ t('common.actions.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="cameraConfigDialogVisible"
      :title="t('roles.dialog.cameraConfigTitle')"
      width="1000px"
    >
      <el-alert
        :title="t('roles.dialog.zonesConfigTitle')"
        type="info"
        :closable="false"
        style="margin-bottom: 16px"
      >
        {{ t('roles.dialog.zonesConfigHint') }}
      </el-alert>

      <el-table :data="cameras" style="width: 100%">
        <el-table-column prop="name" :label="t('common.labels.camera')" min-width="200" />
        <el-table-column prop="location" :label="t('common.labels.location')" min-width="150" />

        <el-table-column :label="t('common.labels.actions')" width="200">
          <template #default="{ row }">
            <el-button
              v-if="selectedRoleActivity"
              size="small"
              type="primary"
              @click="configureCameraROI(
                selectedRoleActivity.roleId,
                selectedRoleActivity.activityId,
                row.id
              )"
            >
              {{ t('roles.dialog.configureZones') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="cameraConfigDialogVisible = false">{{ t('common.actions.close') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="roiEditorVisible"
      :title="t('roles.dialog.zoneEditorTitle')"
      width="1100px"
      top="3vh"
      destroy-on-close
    >
      <RoiEditor
        v-if="roiEditorCameraId !== null"
        :camera-id="roiEditorCameraId"
        :initial-polygons="roiEditorInitialPolygons"
        @save="saveRoiPolygons"
        @cancel="cancelRoiEditor"
      />
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

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
