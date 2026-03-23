import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
      {
        path: '/employees',
        name: 'Employees',
        component: () => import('@/views/Employees.vue'),
      },
      {
        path: '/cameras',
        name: 'Cameras',
        component: () => import('@/views/Cameras.vue'),
      },
      {
        path: '/presence',
        name: 'Presence',
        component: () => import('@/views/Presence.vue'),
      },
      {
        path: '/events',
        redirect: '/statistics',
      },
      {
        path: '/statistics',
        name: 'Statistics',
        component: () => import('@/views/Statistics.vue'),
      },
      {
        path: '/companies',
        name: 'Companies',
        component: () => import('@/views/Companies.vue'),
        meta: { requiresSuperAdmin: true },
      },
      {
        path: '/users',
        name: 'Users',
        component: () => import('@/views/Users.vue'),
        meta: { requiresSuperAdmin: true },
      },
      {
        path: '/activities',
        name: 'Activities',
        component: () => import('@/views/Activities.vue'),
        meta: { requiresSuperAdmin: true },
      },
      {
        path: '/employee-activities',
        redirect: '/statistics',
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  if (to.meta.requiresSuperAdmin && !authStore.isSuperAdmin) {
    next('/dashboard')
    return
  }

  if (to.meta.requiresCompanyAdmin && !(authStore.isSuperAdmin || authStore.isCompanyAdmin)) {
    next('/dashboard')
    return
  }

  if (to.path === '/login' && authStore.isAuthenticated) {
    next('/dashboard')
    return
  }

  next()
})

export default router


