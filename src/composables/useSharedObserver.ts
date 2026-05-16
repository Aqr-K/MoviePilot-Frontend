import { onBeforeUnmount, onDeactivated } from 'vue'

/**
 * ============================================================
 * useSharedObserver - 全局共享单例 IntersectionObserver
 * ============================================================
 *
 * 设计动机：
 *   - 卡片列表里每张卡都 `new IntersectionObserver` 时，N 张卡 = N 个 observer。
 *     每个 observer 在浏览器层都要维护一份 root + threshold + 目标列表，
 *     创建/销毁伴随 ResizeObserver 风格的 RefCount 簿记。
 *   - 单 root（viewport）+ 单 threshold 场景下，一个 observer 就能管所有目标
 *     —— 这是 Pinterest Gestalt / Twitter web 的标准做法。
 *
 * 适用条件：
 *   - 所有消费方共享相同的 root（默认 viewport）和相同的 threshold（0.1）。
 *   - 不同 threshold/rootMargin 需要不同 observer 实例；当前实现只暴露默认配置。
 *   - 如果将来需要多种配置，可以扩展为按 opts 序列化作 key 的 observer 池。
 *
 * 使用示例：
 *   const { observe, unobserve } = useSharedObserver()
 *   onMounted(() => {
 *     observe(elRef.value, entry => {
 *       if (entry.isIntersecting) {
 *         doLazyWork()
 *         unobserve(elRef.value)   // fire-and-forget 场景显式取消
 *       }
 *     })
 *   })
 *
 * 生命周期：
 *   - 组件 unmount/deactivate 时自动 unobserve 所有自己注册的元素，
 *     避免 detached DOM 被钉住（与 useVirtualizerBridge.measureRef(null) 同思路）。
 */

type IOCallback = (entry: IntersectionObserverEntry) => void

const callbacks = new Map<Element, IOCallback>()
let sharedObserver: IntersectionObserver | null = null

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null
  if (sharedObserver) return sharedObserver
  sharedObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        const cb = callbacks.get(entry.target)
        if (cb) cb(entry)
      })
    },
    { threshold: 0.1 },
  )
  return sharedObserver
}

export function useSharedObserver() {
  // 本 hook 调用域内注册过的元素 —— 仅用于组件生命周期自动清理，
  // 不影响 callbacks 全局 Map 里其它消费方的条目。
  const owned = new Set<Element>()

  function observe(el: Element | null | undefined, cb: IOCallback) {
    if (!el) return
    const observer = getSharedObserver()
    if (!observer) return
    callbacks.set(el, cb)
    owned.add(el)
    observer.observe(el)
  }

  function unobserve(el: Element | null | undefined) {
    if (!el) return
    callbacks.delete(el)
    owned.delete(el)
    sharedObserver?.unobserve(el)
  }

  function cleanup() {
    owned.forEach(el => {
      callbacks.delete(el)
      sharedObserver?.unobserve(el)
    })
    owned.clear()
  }

  onBeforeUnmount(cleanup)
  onDeactivated(cleanup)

  return { observe, unobserve }
}
