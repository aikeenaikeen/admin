import { io, type Socket } from 'socket.io-client'
import { resolveBaseUrl } from '@/utils/baseUrl'

export function createRealtimeSocket(): Socket {
  const apiBaseUrl = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL)

  return io(apiBaseUrl, {
    path: '/ws',
  })
}
