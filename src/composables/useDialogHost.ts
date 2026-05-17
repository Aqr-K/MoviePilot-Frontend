import { ref, markRaw, getCurrentScope, onScopeDispose } from 'vue'
import type { Component } from 'vue'

/**
 * useDialogHost - 全局 Dialog 注册表
 *
 *   const { open, close, closeAll } = useDialogHost()
 *   const id = open(MyDialog, { foo: 1 }, { save: () => close(id), close: () => close(id) })
 *
 * 自动关闭契约：
 *   1) <DialogHost /> 给每个弹窗挂 :model-value="true" 并劫持 @update:model-value
 *      —— 收到 false 自动 close(id)。消费方不要在 on 里再传 'update:modelValue'。
 *   2) 调用方的 setup 作用域销毁时，本作用域 open 的弹窗会自动 close。
 *      在 setup 外（如模块顶层）调用则跳过自动清理，需手动管。
 */

export interface DialogEntry {
  id: string
  component: Component
  props?: Record<string, unknown>
  // 事件名以目标组件 defineEmits 为准（如 'subscribe' / 'save' / 'remove' / 'search' / 'close'）
  on?: Record<string, (...args: any[]) => void>
}

const dialogs = ref<DialogEntry[]>([])
let nextId = 0

function removeById(id: string) {
  const i = dialogs.value.findIndex(d => d.id === id)
  if (i >= 0) dialogs.value.splice(i, 1)
}

export function useDialogHost() {
  // 本次 useDialogHost() 调用所在作用域 open 的所有 id
  const ownedIds: string[] = []

  // onScopeDispose 必须在 useDialogHost() 同步调用阶段注册；open() 通常运行在
  // 异步事件回调中，那时 getCurrentScope() 已脱离组件作用域，注册会无效。
  // 仅 setup 内 / effectScope 内有 scope；模块顶层调用跳过自动清理。
  if (getCurrentScope()) {
    onScopeDispose(() => {
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
    // markRaw 防止 Vue 递归代理组件对象触发告警
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
    // 清空整个 host，跨作用域的弹窗也会一并关闭
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
