<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'

interface Point {
  x: number // Normalized 0..1
  y: number // Normalized 0..1
}

interface Polygon {
  points: Point[]
  label?: string
}

interface Props {
  cameraId: number
  initialPolygons?: Polygon[]
}

interface Emits {
  (e: 'save', polygons: Polygon[]): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const imgEl = ref<HTMLImageElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const imageLoaded = ref(false)
const drawing = ref(false)
const currentPolygon = ref<Point[]>([])
const polygons = ref<Polygon[]>([])
const streamUrl = ref('')

function withCacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}ts=${Date.now()}`
}

onMounted(async () => {
  await loadStreamUrl()
  if (props.initialPolygons) {
    polygons.value = JSON.parse(JSON.stringify(props.initialPolygons))
  }
})

watch(() => props.cameraId, async () => {
  await loadStreamUrl()
})

async function loadStreamUrl() {
  try {
    imageLoaded.value = false

    const response = await apiClient.get(`/api/cameras/${props.cameraId}/stream-url`)
    const mjpegUrl = response.data?.mjpegUrl
    if (!mjpegUrl) {
      ElMessage.error('Не удалось получить URL потока камеры')
      return
    }

    // MJPEG поток отображаем как <img>, полигоны рисуем поверх в canvas
    streamUrl.value = withCacheBust(mjpegUrl)

    await nextTick()
    // Канвас будет подогнан на onImgLoad
  } catch (error) {
    ElMessage.error('Ошибка при получении потока камеры')
  }
}

function handleCanvasClick(event: MouseEvent) {
  if (!canvas.value || !imageLoaded.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  
  currentPolygon.value.push({ x, y })
  redrawPolygons()
}

function finishPolygon() {
  if (currentPolygon.value.length < 3) {
    ElMessage.warning('Полигон должен содержать минимум 3 точки')
    return
  }
  
  polygons.value.push({
    points: [...currentPolygon.value],
    label: `Зона ${polygons.value.length + 1}`,
  })
  
  currentPolygon.value = []
  drawing.value = false
  redrawPolygons()
  ElMessage.success('Полигон добавлен')
}

function cancelCurrentPolygon() {
  currentPolygon.value = []
  drawing.value = false
  redrawPolygons()
}

function removeLastPolygon() {
  if (polygons.value.length > 0) {
    polygons.value.pop()
    redrawPolygons()
    ElMessage.info('Последний полигон удалён')
  }
}

function clearAll() {
  polygons.value = []
  currentPolygon.value = []
  drawing.value = false
  redrawPolygons()
  ElMessage.info('Все полигоны удалены')
}

/** Convert color from CSS var (hex or rgb) to rgba string for canvas */
function colorToRgba(colorStr: string, alpha: number): string {
  if (!colorStr || colorStr === '') return `rgba(0,0,0,${alpha})`
  const s = colorStr.trim()
  const rgbMatch = s.match(/rgb?a?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${alpha})`
  }
  const hex = s.replace('#', '')
  if (hex.length >= 6) {
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return `rgba(0,0,0,${alpha})`
}

function getElColor(varName: string): string {
  const root = document.documentElement
  return getComputedStyle(root).getPropertyValue(varName).trim() || getComputedStyle(root).getPropertyValue('--el-color-black').trim() || ''
}

function redrawPolygons() {
  if (!canvas.value) return
  
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const successColor = getElColor('--el-color-success')
  const warningColor = getElColor('--el-color-warning')
  const whiteColor = getElColor('--el-color-white')
  const blackColor = getElColor('--el-color-black')

  // Clear overlay
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)

  // Draw saved polygons
  polygons.value.forEach((polygon, index) => {
    drawPolygon(ctx, polygon.points, colorToRgba(successColor, 0.3), successColor, whiteColor, blackColor, index + 1)
  })

  // Draw current polygon
  if (currentPolygon.value.length > 0) {
    drawPolygon(ctx, currentPolygon.value, colorToRgba(warningColor, 0.3), warningColor, whiteColor, blackColor)
  }
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fillColor: string,
  strokeColor: string,
  pointStrokeColor: string,
  labelStrokeColor: string,
  label?: number
) {
  if (points.length === 0) return
  if (!canvas.value) return

  const canvasWidth = canvas.value.width
  const canvasHeight = canvas.value.height
  
  ctx.beginPath()
  ctx.moveTo(points[0].x * canvasWidth, points[0].y * canvasHeight)
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * canvasWidth, points[i].y * canvasHeight)
  }
  
  if (points.length > 2) {
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
  }
  
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Draw points
  points.forEach((point) => {
    ctx.beginPath()
    ctx.arc(point.x * canvasWidth, point.y * canvasHeight, 5, 0, 2 * Math.PI)
    ctx.fillStyle = strokeColor
    ctx.fill()
    ctx.strokeStyle = pointStrokeColor
    ctx.lineWidth = 1
    ctx.stroke()
  })
  
  // Draw label
  if (label !== undefined && points.length > 0) {
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length * canvasWidth
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length * canvasHeight
    ctx.fillStyle = pointStrokeColor
    ctx.strokeStyle = labelStrokeColor
    ctx.lineWidth = 3
    ctx.font = 'bold 20px Arial'
    ctx.strokeText(`Зона ${label}`, centerX - 30, centerY)
    ctx.fillText(`Зона ${label}`, centerX - 30, centerY)
  }
}

function startDrawing() {
  drawing.value = true
  currentPolygon.value = []
  ElMessage.info('Кликайте на изображении, чтобы нарисовать полигон. Нажмите "Завершить полигон" когда закончите.')
}

function handleSave() {
  if (currentPolygon.value.length > 0) {
    ElMessage.warning('Завершите или отмените текущий полигон перед сохранением')
    return
  }
  
  if (polygons.value.length === 0) {
    ElMessage.warning('Добавьте хотя бы один полигон')
    return
  }
  
  emit('save', polygons.value)
}

function handleCancel() {
  emit('cancel')
}

function onImgLoad() {
  imageLoaded.value = true
  // Подгоняем overlay canvas под реальный размер картинки на странице
  if (!imgEl.value || !canvas.value) {
    redrawPolygons()
    return
  }

  const rect = imgEl.value.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    canvas.value.width = Math.round(rect.width)
    canvas.value.height = Math.round(rect.height)
  }
  redrawPolygons()
}
</script>

<template>
  <div class="roi-editor">
    <div class="editor-toolbar">
      <el-space>
        <el-button
          v-if="!drawing"
          type="primary"
          @click="startDrawing"
        >
          Начать рисование
        </el-button>
        
        <el-button
          v-if="drawing"
          type="success"
          @click="finishPolygon"
          :disabled="currentPolygon.length < 3"
        >
          Завершить полигон
        </el-button>
        
        <el-button
          v-if="drawing"
          type="warning"
          @click="cancelCurrentPolygon"
        >
          Отменить
        </el-button>
        
        <el-button
          v-if="!drawing && polygons.length > 0"
          type="danger"
          @click="removeLastPolygon"
        >
          Удалить последний
        </el-button>
        
        <el-button
          v-if="!drawing && polygons.length > 0"
          type="danger"
          @click="clearAll"
        >
          Очистить всё
        </el-button>
      </el-space>
    </div>
    
    <div class="canvas-container">
      <div class="preview">
        <img
          ref="imgEl"
          class="preview-image"
          :src="streamUrl"
          alt="Camera stream"
          @load="onImgLoad"
        />
        <canvas
          ref="canvas"
          class="overlay-canvas"
          @click="handleCanvasClick"
          :style="{ cursor: drawing ? 'crosshair' : 'default' }"
        />
      </div>
    </div>
    
    <div class="editor-info">
      <el-alert type="info" :closable="false">
        <p><strong>Инструкция:</strong></p>
        <ul>
          <li>Нажмите "Начать рисование" и кликайте на изображении для создания полигона</li>
          <li>Полигон должен содержать минимум 3 точки</li>
          <li>Нажмите "Завершить полигон" когда закончите</li>
          <li>Координаты сохраняются в нормализованном виде (0..1)</li>
        </ul>
        <p><strong>Полигонов создано:</strong> {{ polygons.length }}</p>
      </el-alert>
    </div>
    
    <div class="editor-actions">
      <el-button @click="handleCancel">Отмена</el-button>
      <el-button type="primary" @click="handleSave">
        Сохранить зоны
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.roi-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-toolbar {
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.canvas-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-color-black);
  border-radius: 4px;
  padding: 8px;
}

.preview {
  position: relative;
  width: 100%;
  max-width: 1000px;
}

.preview-image {
  width: 100%;
  height: auto;
  display: block;
  border: 2px solid var(--el-border-color);
  border-radius: 4px;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.editor-info {
  padding: 12px;
}

.editor-info ul {
  margin: 8px 0;
  padding-left: 20px;
}

.editor-info li {
  margin: 4px 0;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid var(--el-border-color);
}
</style>
