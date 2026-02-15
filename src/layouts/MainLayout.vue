<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import LogoIcon from '@/components/icons/LogoIcon.vue'
import {
  Location,
  Document,
  Setting,
  User,
  VideoCamera,
  TrendCharts,
  OfficeBuilding,
  Monitor,
  Operation,
  Briefcase,
  Moon,
  Sunny,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const THEME_TOGGLE_INDEX = '__theme_toggle__'

const activeIndex = computed(() => route.path)

const menuItems = computed(() => {
  const items = [
    { index: '/dashboard', title: 'Дашборд', icon: TrendCharts },
    { index: '/employees', title: 'Сотрудники', icon: User },
    { index: '/templates', title: 'Шаблоны', icon: Briefcase },
    { index: '/cameras', title: 'Камеры', icon: VideoCamera },
    { index: '/presence', title: 'Присутствие', icon: Location },
    { index: '/events', title: 'События', icon: Document },
    { index: '/statistics', title: 'Статистика', icon: TrendCharts },
    { index: '/employee-activities', title: 'Активности сотрудников', icon: Operation },
    { index: '/live', title: 'Прямые трансляции', icon: Monitor },
  ]
  
  if (authStore.isSuperAdmin) {
    items.push({ index: '/activities', title: 'Активности', icon: Operation })
    items.push({ index: '/companies', title: 'Компании', icon: OfficeBuilding })
    items.push({ index: '/users', title: 'Пользователи', icon: Setting })
  }
  
  return items
})

function handleSelect(index: string) {
  if (index === THEME_TOGGLE_INDEX) {
    themeStore.isDark = !themeStore.isDark
    return
  }
  router.push(index)
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <el-container class="layout-container">
    <el-aside width="250px" class="sidebar">
      <div class="logo">
        <LogoIcon class="logo-image" :size="36" />
        <h2>Aikeen</h2>
      </div>
      
      <el-menu
        :default-active="activeIndex"
        class="sidebar-menu"
        @select="handleSelect"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.index"
          :index="item.index"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>

        <el-menu-item :index="THEME_TOGGLE_INDEX">
          <el-icon><component :is="themeStore.isDark ? Moon : Sunny" /></el-icon>
          <span>Тема</span>
        </el-menu-item>
      </el-menu>
      
      <div class="user-section">
        <div class="user-info">
          <el-icon size="20"><User /></el-icon>
          <div class="user-details">
            <div class="user-email">{{ authStore.user?.email }}</div>
            <div class="user-role">{{ authStore.user?.role }}</div>
          </div>
        </div>
        
        
        <el-button type="danger" size="small" @click="logout" style="width: 100%">
          Выйти
        </el-button>
      </div>
    </el-aside>

    <el-container>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout-container {
  min-height: 100vh;
}

.sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
}

.logo {
  padding: 10px 10px 10px 15px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.logo-image {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

.user-section {
  padding: 16px;
  border-top: 1px solid var(--el-border-color);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-email {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.main-content {
  background: var(--el-bg-color-page);
  padding: 0;
}

@media (max-width: 768px) {
  .sidebar {
    width: 200px !important;
  }
  
  .logo h2 {
    font-size: 16px;
  }
}
</style>


