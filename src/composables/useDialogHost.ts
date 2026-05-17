import { ref, markRaw, getCurrentScope, onScopeDispose } from 'vue'
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
 *   1) DialogHost 把 :model-value="true" 挂到组件上，并劫持
 *      @update:model-value —— 收到 false 自动调用 close(id)。
 *      消费方不要在 on 里再传 'update:modelValue'，会被覆盖。
 *   2) 调用方组件的 setup 作用域销毁时（路由切换 / 父级 unmount），
 *      本作用域 open 的弹窗会自动 close —— 防止回调闭包读到已
 *      detached 的 props / 已停效的 ref。如果在 setup 外（如普通
 *      模块顶层）调用 open，作用域不存在，自动清理跳过，需手动管。
 */

export interface DialogEntry {
  id: string
  component: Component
  props?: Record<string, unknown>
  // Vue 3 v-on 对象语法的事件名 → 处理函数；事件名以目标组件 defineEmits 为准
  // （如 'subscribe' / 'save' / 'remove' / 'search' / 'close'）。
  on?: Record<string, (...args: any[]) => void>
}

const dialogs = ref<DialogEntry[]>([])
let nextId = 0

function removeById(id: string) {
  const i = dialogs.value.findIndex(d => d.id === id)
  if (i >= 0) dialogs.value.splice(i, 1)
}

export function useDialogHost() {
  // 本次 useDialogHost() 调用所在作用域 open 的所有 id —— 作用域销毁时自动收尾
  const ownedIds: string[] = []

  // 必须在 useDialogHost() 调用时（典型为组件 setup 同步阶段）就注册清理钩子；
  // 不能延迟到 open() 内 —— 因为 open() 通常从异步事件回调里调，那时
  // getCurrentScope() 已脱离组件作用域，注册会失败。
  // setup 内 / 手动 effectScope 内才有 scope；模块顶层调用则没有，跳过自动清理。
  if (getCurrentScope()) {
    onScopeDispose(() => {
      // 调用方组件销毁：把本作用域还挂在 host 上的弹窗一并关掉
      // 避免回调闭包读到 detached props 或失活 ref
      for (const id of ownedIds) removeById(id)
      ownedIds.length = 0
    })
  }

  function open(
    component: Component,
    props?: Record<string, unknown>,
    on?: Record<string, (...args: any[]) => void>,
  ): string {
    const id = `dlg-${++nextId}`
    // markRaw —— 组件对象不需要 Vue 响应式追踪，否则会触发递归代理告警
    dialogs.value.push({ id, component: markRaw(component) as Component, props, on })
    ownedIds.push(id)
    return id
  }

  function close(id: string) {
    removeById(id)
    const j = ownedIds.indexOf(id)
    if (j >= 0) ownedIds.splice(j, 1)
  }

  function closeAll() {
    // 注意：清空整个 host，跨作用域的弹窗也会一起关；调试 / 应急用
    dialogs.value = []
    ownedIds.length = 0
  }

  return {
    dialogs,
    open,
    close,
    closeAll,
  }
}
