<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    /** Format function for the displayed value */
    format?: (n: number) => string
  }>(),
  {
    duration: 600,
    format: (n: number) => Math.round(n).toLocaleString(),
  },
)

const display = ref(props.value)
let raf: number | null = null
let prefersReducedMotion = false

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function animateTo(target: number) {
  if (raf !== null) cancelAnimationFrame(raf)

  if (prefersReducedMotion) {
    display.value = target
    return
  }

  const start = display.value
  const delta = target - start
  if (delta === 0) return

  const startedAt = performance.now()

  function tick(now: number) {
    const elapsed = now - startedAt
    const progress = Math.min(1, elapsed / props.duration)
    display.value = start + delta * easeOutCubic(progress)
    if (progress < 1) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = null
      display.value = target
    }
  }

  raf = requestAnimationFrame(tick)
}

watch(() => props.value, (next) => animateTo(next))

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  // first paint without an animation — values come from API after onMounted,
  // letting them animate the first time gives a satisfying "load" feel.
})

onUnmounted(() => {
  if (raf !== null) cancelAnimationFrame(raf)
})
</script>

<template>
  <span>{{ format(display) }}</span>
</template>
