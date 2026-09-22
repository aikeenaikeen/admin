import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { start as progressStart, done as progressDone } from '@/utils/progress'

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
        path: '/labeling',
        name: 'Labeling',
        component: () => import('@/views/Labeling.vue'),
        meta: { requiresCompanyAdmin: true },
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
      {
        path: ':pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('@/views/NotFound.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard
router.beforeEach((to, from, next) => {
  if (to.path !== from.path) progressStart()

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

router.afterEach(() => {
  progressDone()
})

router.onError(() => {
  progressDone()
})

export default router


