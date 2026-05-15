<script setup lang="ts">
import { MoreFilled } from '@element-plus/icons-vue'
import type { Component } from 'vue'

interface ActionItem {
  key: string
  label: string
  icon?: Component
  disabled?: boolean
  divided?: boolean
  danger?: boolean
}

const props = defineProps<{
  actions: ActionItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
}>()

function handleCommand(command: string) {
  emit('select', command)
}
</script>

<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button
      size="small"
      circle
      :icon="MoreFilled"
      :loading="loading"
      :disabled="props.actions.length === 0"
      :aria-label="$t('common.labels.actions')"
    />

    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="action in props.actions"
          :key="action.key"
          :command="action.key"
          :icon="action.icon"
          :disabled="action.disabled"
          :divided="action.divided"
          :class="{ 'table-actions-menu__item--danger': action.danger }"
        >
          {{ action.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.table-actions-menu__item--danger {
  color: var(--el-color-danger);
}
</style>
