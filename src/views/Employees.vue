<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Delete, User, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import apiClient from '@/api/client'

interface Employee {
  id: number
  name: string
  role: string | null
  photoUrl: string | null
}

const employees = ref<Employee[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingEmployeeId = ref<number | null>(null)

const form = ref({
  name: '',
  roleTitle: '',
  photo: null as File | null,
})

const fileList = ref<UploadFile[]>([])

onMounted(async () => {
  await loadEmployees()
})

async function loadEmployees() {
  loading.value = true
  try {
    const response = await apiClient.get('/api/employees')
    employees.value = response.data
  } catch (error) {
    ElMessage.error('Не удалось загрузить сотрудников')
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    const formData = new FormData()
    formData.append('name', form.value.name)
    if (form.value.roleTitle) {
      formData.append('roleTitle', form.value.roleTitle)
    }
    if (form.value.photo) {
      formData.append('photo', form.value.photo)
    }

    const url = isEditing.value && editingEmployeeId.value
      ? `/api/employees/${editingEmployeeId.value}`
      : '/api/employees'

    if (isEditing.value) {
      await apiClient.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      ElMessage.success('Сотрудник обновлён')
    } else {
      await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      ElMessage.success('Сотрудник успешно добавлен')
    }

    resetForm()
    await loadEmployees()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Не удалось сохранить сотрудника')
  }
}

function handleFileChange(file: UploadFile) {
  if (file.raw) {
    form.value.photo = file.raw
  }
  return false
}

function handleRemove() {
  form.value.photo = null
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(employee: Employee) {
  isEditing.value = true
  editingEmployeeId.value = employee.id
  dialogVisible.value = true
  form.value = {
    name: employee.name,
    roleTitle: employee.role || '',
    photo: null,
  }
  fileList.value = []
}

function resetForm() {
  dialogVisible.value = false
  isEditing.value = false
  editingEmployeeId.value = null
  form.value = { name: '', roleTitle: '', photo: null }
  fileList.value = []
}

async function deleteEmployee(id: number) {
  try {
    await ElMessageBox.confirm('Вы уверены, что хотите удалить этого сотрудника?', 'Подтверждение', {
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
      type: 'warning',
    })

    await apiClient.delete(`/api/employees/${id}`)
    ElMessage.success('Сотрудник удален')
    await loadEmployees()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('Не удалось удалить сотрудника')
    }
  }
}
</script>

<template>
  <div class="page-container">
    <el-page-header class="page-header">
      <template #content>
        <h1 class="page-title">Сотрудники</h1>
      </template>
      <template #extra>
        <el-button type="primary" :icon="Plus" @click="startCreate">
          {{ dialogVisible ? 'Отмена' : 'Добавить сотрудника' }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never">
      <el-table :data="employees" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        
        <el-table-column label="Фото" width="100">
          <template #default="{ row }">
            <el-avatar :src="row.photoUrl" :size="60">
              <el-icon :size="30"><User /></el-icon>
            </el-avatar>
          </template>
        </el-table-column>
        
        <el-table-column prop="name" label="Имя" min-width="180" />
        
        <el-table-column label="Должность" min-width="150">
          <template #default="{ row }">
            {{ row.role || '—' }}
          </template>
        </el-table-column>
        
        <el-table-column label="Действия" width="300" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              @click="deleteEmployee(row.id)"
            >
              Удалить
            </el-button>
            <el-button
              size="small"
              @click="startEdit(row)"
            >
              Редактировать
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? 'Редактировать сотрудника' : 'Добавить сотрудника'"
      width="500px"
    >
      <el-form :model="form" label-width="120px">
        <el-form-item label="Имя" required>
          <el-input v-model="form.name" placeholder="Иван Иванов" />
        </el-form-item>

        <el-form-item label="Должность">
          <el-input v-model="form.roleTitle" placeholder="Менеджер" />
        </el-form-item>

        <el-form-item label="Фото">
          <el-upload
            v-model:file-list="fileList"
            :auto-upload="false"
            :limit="1"
            accept="image/*"
            :on-change="handleFileChange"
            :on-remove="handleRemove"
          >
            <el-button :icon="Upload">Выбрать файл</el-button>
            <template #tip>
              <div style="font-size: 12px; color: #909399; margin-top: 8px;">
                JPG, PNG до 10MB
              </div>
            </template>
          </el-upload>
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
  color: #303133;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }
}
</style>
