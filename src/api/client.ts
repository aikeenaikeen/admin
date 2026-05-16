import axios, { AxiosInstance } from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'
import { resolveBaseUrl } from '@/utils/baseUrl'
import { start as progressStart, done as progressDone } from '@/utils/progress'

const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

type RequestMeta = { silent?: boolean }

function isSilent(config: any): boolean {
  return (config?.meta as RequestMeta | undefined)?.silent === true
}

// Request interceptor - add auth token + progress bar
apiClient.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    if (authStore.accessToken) {
      config.headers.Authorization = `Bearer ${authStore.accessToken}`
    }
    if (!isSilent(config)) progressStart()
    return config
  },
  (error) => {
    progressDone()
    return Promise.reject(error)
  }
)

// Token refresh mutex: prevents multiple parallel 401s from each triggering a refresh
let refreshPromise: Promise<void> | null = null

apiClient.interceptors.response.use(
  (response) => {
    if (!isSilent(response.config)) progressDone()
    return response
  },
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      if (!isSilent(originalRequest)) progressDone()

      const authStore = useAuthStore()

      try {
        // If a refresh is already in progress, wait for it instead of starting another
        if (!refreshPromise) {
          refreshPromise = authStore.refreshTokenFn().finally(() => {
            refreshPromise = null
          })
        }
        await refreshPromise

        // Retry original request with new token; the failed attempt was already balanced above.
        return apiClient(originalRequest)
      } catch (refreshError) {
        authStore.logout()
        router.push('/login')
        return Promise.reject(refreshError)
      }
    }

    if (!isSilent(originalRequest)) progressDone()
    return Promise.reject(error)
  }
)

export default apiClient
