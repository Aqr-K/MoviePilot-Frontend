<script lang="ts" setup>
/**
 * 根级 Dialog 宿主 —— 渲染 useDialogHost 注册表里所有弹窗。
 * 挂在 App.vue 的 <VApp> 下，与 <RouterView /> 同级，永不随路由/虚拟化 unmount。
 *
 * 现在是通用版：不再硬编码具体弹窗组件类型，
 * 通过 <component :is> 动态渲染消费方注册的任意组件。
 *
 * @see composables/useDialogHost.ts 对设计动机与契约的完整说明
 */
import { useDialogHost, type DialogEntry } from '@/composables/useDialogHost'

const { dialogs, close } = useDialogHost()

// 给每个弹窗合成事件监听对象：用户传的 on 放前面，host 的 update:modelValue 后挂以接管自动关闭
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
