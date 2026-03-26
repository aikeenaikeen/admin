export interface CameraDisplayInfo {
  id: number
  name: string
  location?: string | null
}

export function formatCameraLabel(camera?: Pick<CameraDisplayInfo, 'name' | 'location'> | null): string {
  if (!camera) {
    return ''
  }

  const location = camera.location?.trim()
  return location ? `${camera.name} (${location})` : camera.name
}
