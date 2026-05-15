/**
 * Tiny lazy top progress bar (zero dependencies).
 * Inspired by nprogress but ~30 LOC.
 *
 * Calls are reference-counted: start() can be invoked many times in
 * parallel; the bar finishes only when the last matching done() arrives.
 */

let counter = 0
let trickleTimer: number | null = null
let progress = 0

function ensureBar(): HTMLElement {
  const existing = document.getElementById('app-progress-bar')
  if (existing) return existing

  const el = document.createElement('div')
  el.id = 'app-progress-bar'
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'height:2px',
    'background:linear-gradient(90deg,var(--el-color-primary),var(--el-color-success))',
    'z-index:9999',
    'transform-origin:0 50%',
    'transform:scaleX(0)',
    'transition:transform 0.18s ease, opacity 0.25s ease',
    'opacity:0',
    'pointer-events:none',
    'box-shadow:0 0 8px currentColor',
  ].join(';')
  document.body.appendChild(el)
  return el
}

function render() {
  const bar = ensureBar()
  bar.style.opacity = counter > 0 ? '1' : '0'
  bar.style.transform = `scaleX(${progress})`
}

function trickle() {
  // creep towards 0.9
  progress = Math.min(0.9, progress + (1 - progress) * 0.08)
  render()
  trickleTimer = window.setTimeout(trickle, 350)
}

export function start() {
  counter += 1
  if (counter === 1) {
    progress = 0.08
    render()
    if (trickleTimer) clearTimeout(trickleTimer)
    trickleTimer = window.setTimeout(trickle, 250)
  }
}

export function done() {
  if (counter === 0) return
  counter -= 1
  if (counter === 0) {
    progress = 1
    render()
    if (trickleTimer) {
      clearTimeout(trickleTimer)
      trickleTimer = null
    }
    window.setTimeout(() => {
      if (counter === 0) {
        progress = 0
        render()
      }
    }, 220)
  }
}

export function reset() {
  counter = 0
  progress = 0
  if (trickleTimer) {
    clearTimeout(trickleTimer)
    trickleTimer = null
  }
  render()
}
