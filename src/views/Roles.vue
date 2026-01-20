<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Edit, Delete, VideoCamera } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'
import RoiEditor from '@/components/RoiEditor.vue'

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
    ElMessage.error('Не удалось загрузить роли')
  } finally {
    loading.value = false
  }
}

async function loadAvailableActivities() {
  try {
    const response = await apiClient.get('/api/company-activities')
    availableActivities.value = response.data
  } catch (error) {
    ElMessage.error('Не удалось загрузить доступные активности')
  }
}

async function loadCameras() {
  try {
    const response = await apiClient.get('/api/cameras')
    cameras.value = response.data
  } catch (error) {
    ElMessage.error('Не удалось загрузить камеры')
  }
}

async function handleSubmit() {
  try {
    if (isEditing.value && editingRoleId.value) {
      await apiClient.put(`/api/roles/${editingRoleId.value}`, form.value)
      ElMessage.success('Роль обновлена')
    } else {
      await apiClient.post('/api/roles', form.value)
      ElMessage.success('Роль создана')
    }
    resetForm()
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось сохранить роль')
  }
}

async function deleteRole(id: number) {
  try {
    await ElMessageBox.confirm('Вы уверены, что хотите удалить эту роль?', 'Подтверждение', {
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
      type: 'warning',
    })
    
    await apiClient.delete(`/api/roles/${id}`)
    ElMessage.success('Роль удалена')
    await loadRoles()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('Не удалось удалить роль')
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
    
    // Add new activities
    const toAdd = selectedActivities.value.filter(id => !currentActivityIds.includes(id))
    for (const activityId of toAdd) {
      await apiClient.post(`/api/roles/${roleId}/activities`, {
        activityId,
        enabled: true,
      })
    }
    
    // Remove removed activities
    const toRemove = currentActivityIds.filter(id => !selectedActivities.value.includes(id))
    for (const activityId of toRemove) {
      await apiClient.delete(`/api/roles/${roleId}/activities/${activityId}`)
    }
    
    ElMessage.success('Активности роли обновлены')
    activityDialogVisible.value = false
    await loadRoles()
  } catch (error) {
    ElMessage.error('Не удалось обновить активности')
  }
}

function openCameraConfig(roleId: number, activityId: number) {
  selectedRoleActivity.value = { roleId, activityId }
  cameraConfigDialogVisible.value = true
}

async function configureCameraROI(roleId: number, activityId: number, cameraId: number) {
  // Find existing polygons if already configured
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
    ElMessage.success('ROI зоны сохранены')
    roiEditorVisible.value = false
    roiEditorTarget.value = null
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось сохранить ROI')
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
        <h1 class="page-title">Роли сотрудников</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          Создать роль
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="roles" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="Название" min-width="200" />
        
        <el-table-column label="Активностей" width="120" align="center">
          <template #default="{ row }">
            {{ row.roleActivities?.length || 0 }}
          </template>
        </el-table-column>
        
        <el-table-column label="Сотрудников" width="120" align="center">
          <template #default="{ row }">
            {{ row._count?.employeeAssignments || 0 }}
          </template>
        </el-table-column>
        
        <el-table-column label="Действия" width="400" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="primary"
                @click="openActivitySettings(row)"
              >
                Активности
              </el-button>
              
              <el-button
                size="small"
                :icon="Edit"
                @click="startEdit(row)"
              >
                Редактировать
              </el-button>
              
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteRole(row.id)"
              >
                Удалить
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Создание/редактирование роли -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? 'Редактировать роль' : 'Создать роль'"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item label="Название" required>
          <el-input v-model="form.name" placeholder="Официант, Кассир, Уборщик..." />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="handleSubmit">
          {{ isEditing ? 'Сохранить' : 'Создать' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Настройка активностей роли -->
    <el-dialog
      v-model="activityDialogVisible"
      :title="`Активности роли — ${selectedRole?.name}`"
      width="900px"
    >
      <div style="margin-bottom: 16px">
        <el-checkbox-group v-model="selectedActivities">
          <div v-for="companyActivity in availableActivities" :key="companyActivity.activityId">
            <el-checkbox :value="companyActivity.activityId" style="margin-bottom: 12px">
              <strong>{{ companyActivity.activity.name }}</strong>
              <el-tag size="small" style="margin-left: 8px">{{ companyActivity.activity.kind }}</el-tag>
            </el-checkbox>
            
            <!-- Настройка по камерам (если активность выбрана) -->
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
                Настроить камеры и зоны
              </el-button>
            </div>
          </div>
        </el-checkbox-group>
      </div>

      <template #footer>
        <el-button @click="activityDialogVisible = false">Отмена</el-button>
        <el-button type="primary" @click="saveActivitySettings">
          Сохранить
        </el-button>
      </template>
    </el-dialog>

    <!-- Настройка камер для активности -->
    <el-dialog
      v-model="cameraConfigDialogVisible"
      title="Настройка камер и зон (ROI)"
      width="1000px"
    >
      <el-alert
        title="Настройка зон (ROI)"
        type="info"
        :closable="false"
        style="margin-bottom: 16px"
      >
        Для каждой камеры вы можете настроить области (ROI), расписание и пороги активности.
      </el-alert>
      
      <el-table :data="cameras" style="width: 100%">
        <el-table-column prop="name" label="Камера" min-width="200" />
        <el-table-column prop="location" label="Расположение" min-width="150" />
        
        <el-table-column label="Действия" width="200">
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
              Настроить ROI
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="cameraConfigDialogVisible = false">Закрыть</el-button>
      </template>
    </el-dialog>

    <!-- ROI Editor -->
    <el-dialog
      v-model="roiEditorVisible"
      title="Редактор зон (ROI)"
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
  color: #303133;
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
