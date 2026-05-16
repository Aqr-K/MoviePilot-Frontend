import { ref, markRaw } from 'vue'
import type { Component } from 'vue'

/**
 * ============================================================
 * useDialogHost - 全局通用 Dialog 注册表
 * ============================================================
 *
 * 任意位置 useDialogHost().open(Component, props, on) 即可把一个弹窗挂到
 * <DialogHost /> 上集中渲染。DialogHost 挂在 App.vue 根（<VApp> 内、
 * <RouterView /> 同级），不随路由/虚拟化 unmount —— 触发方（卡片）即使被
 * VirtualGrid/VirtualList 销毁，弹窗也不会随之销毁。
 *
 * 为什么需要这个：
 *   Vuetify VDialog/VBottomSheet 默认 scrollStrategy="block" 会给 <html>
 *   加 v-overlay-scroll-blocked 类并把 body 置为 position:fixed。虚拟化容器
 *   的 scrollMargin 测量会因此错乱，触发触发方卡片被虚拟化出 DOM —— 自持
 *   弹窗会跟着 unmount。把弹窗实例从卡片生命周期里拎出来即可根治。
 *
 * 用法：
 *   const { open, close } = useDialogHost()
 *   const id = open(SubscribeEditDialog, { subid }, {
 *     save: () => { reload(); close(id) },
 *     remove: () => { reload(); close(id) },
 *     close: () => close(id),
 *   })
 *
 * 自动关闭契约：
 *   DialogHost 会把 :model-value="true" 直接挂到组件上，并劫持
 *   @update:model-value —— 收到 false 自动调用 close(id)。消费方
 *   不要在 on 里再传 'update:modelValue'，会被覆盖。
 */

export interface DialogEntry {
  id: string
  component: Component
  props?: Record<string, unknown>
  // Vue 3 v-on 对象语法的事件名 → 处理函数；事件名用 camelCase（如 'updateModelValue'
  // 由 Vue 自动归一化），自定义事件如 'subscribe' / 'save' / 'remove' / 'search' / 'close'
  on?: Record<string, (...args: any[]) => void>
}

const dialogs = ref<DialogEntry[]>([])
let nextId = 0

export function useDialogHost() {
  function open(
    component: Component,
    props?: Record<string, unknown>,
    on?: Record<string, (...args: any[]) => void>,
  ): string {
    const id = `dlg-${++nextId}`
    // markRaw —— 组件对象不需要 Vue 响应式追踪，否则会触发递归代理告警
    dialogs.value.push({ id, component: markRaw(component) as Component, props, on })
    return id
  }

  function close(id: string) {
    const i = dialogs.value.findIndex(d => d.id === id)
    if (i >= 0) dialogs.value.splice(i, 1)
  }

  function closeAll() {
    dialogs.value = []
  }

  return {
    dialogs,
    open,
    close,
    closeAll,
  }
}
