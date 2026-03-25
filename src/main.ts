import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import './style.css'

const app = createApp(App)

type MessageParams = Parameters<typeof ElMessage.success>[0]

function withClosableMessage(options: MessageParams) {
  if (typeof options === 'string') {
    return {
      message: options,
      showClose: true,
    }
  }

  return {
    showClose: true,
    ...(options || {}),
  }
}

for (const method of ['success', 'warning', 'info', 'error'] as const) {
  const original = ElMessage[method]
  ElMessage[method] = ((options: MessageParams) => original(withClosableMessage(options) as any)) as typeof original
}

// Register Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(i18n)
app.use(router)
app.use(ElementPlus)

app.mount('#app')





