import axios, { AxiosInstance } from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'
import { resolveBaseUrl } from '@/utils/baseUrl'

const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    if (authStore.accessToken) {
      config.headers.Authorization = `Bearer ${authStore.accessToken}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Token refresh mutex: prevents multiple parallel 401s from each triggering a refresh
let refreshPromise: Promise<void> | null = null

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const authStore = useAuthStore()

      try {
        // If a refresh is already in progress, wait for it instead of starting another
        if (!refreshPromise) {
          refreshPromise = authStore.refreshTokenFn().finally(() => {
            refreshPromise = null
          })
        }
        await refreshPromise

        // Retry original request with new token
        return apiClient(originalRequest)
      } catch (refreshError) {
        authStore.logout()
        router.push('/login')
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient



