<script lang="ts" setup>
/**
 * 渲染 useDialogHost 注册表中的所有弹窗。
 * 通过 <component :is> 动态挂载消费方注册的组件，
 * 并接管 update:modelValue 让关闭事件自动同步注册表状态。
 */
import { useDialogHost, type DialogEntry } from '@/composables/useDialogHost'

const { dialogs, close } = useDialogHost()

// 合成事件监听：消费方 on 在前，host 的 update:modelValue 在后以接管关闭
function buildListeners(d: DialogEntry) {
  return {
    ...(d.on ?? {}),
    'update:modelValue': (v: boolean) => {
      if (!v) close(d.id)
    },
  }
}
</script>

<template>
  <component
    :is="d.component"
    v-for="d in dialogs"
    :key="d.id"
    v-bind="d.props"
    :model-value="true"
    v-on="buildListeners(d)"
  />
</template>
