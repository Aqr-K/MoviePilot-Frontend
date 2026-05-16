import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * ============================================================
 * useWindowScrollMargin - 虚拟滚动 Base Layer：scrollMargin 追踪
 * ============================================================
 *
 * window scroll 模式下，virtualizer 需要知道滚动容器顶部相对文档的 Y 偏移
 * （scrollMargin = getBoundingClientRect().top + scrollY），才能把"窗口滚动量"
 * 换算成"容器内坐标"。
 *
 * 何时会变陈旧 —— 列表【上方】的内容高度变化（折叠面板展开、异步内容撑高等），
 * 会把列表整体往下推，scrollMargin 必须随之更新，否则虚拟项渲染位置整体偏移
 * （出现空隙或重叠）。四道防线覆盖：
 *   1. window resize          —— 视口尺寸变化
 *   2. body ResizeObserver    —— body 盒子自身变化（内容驱动高度的布局下，
 *                                上方内容撑高会让 body 长高 → 触发）
 *   3. scrollend（首选）       —— 滚动停止时一次性自愈；Safari 18+ / Chrome 114+
 *                                原生支持，浏览器已经做了 debounce，无需 rAF
 *   4. scroll（fallback）      —— 仅当 scrollend 不可用时启用，rAF 节流写
 *
 * iOS 兼容硬化（防 click 落空 + URL bar 抖动）：
 *   - 触摸期（touchstart → touchend）冻结所有 scrollMargin 写入。
 *     iOS Safari 把 transform 重排塞进 touch 主线程，会让卡片在 touchstart →
 *     click 之间漂移，导致点击落点指向旧节点。冻结期间所有 RO / scroll /
 *     scrollend 触发都被忽略，touchend 后再一次性 rAF 补齐。
 *   - 2px 阈值过滤亚像素噪声（iOS URL bar 折叠/展开期间的 rect.top 抖动通常
 *     <2px；真实上方面板撑高 ≥24px，绝不会被吞掉）。
 *
 * 残留边角：上方面板展开且用户【不滚动】、同时布局又非内容驱动高度 —— 此时
 * 需要消费方在已知的 toggle 时机主动调用返回的 updateScrollMargin() 即可消除。
 *
 * @param scrollEl  绑定到滚动容器根元素的模板 ref
 * @param enabled   是否启用（容器内 scroll 模式返回 false，window scroll 返回 true）
 */
export function useWindowScrollMargin(scrollEl: Ref<HTMLElement | null>, enabled: () => boolean) {
  const scrollMargin = ref(0)
  let resizeObserver: ResizeObserver | null = null
  let rafId: number | null = null
  let touchActive = false

  const SCROLL_MARGIN_THRESHOLD = 2
  // Safari 18+ / Chrome 114+ 原生支持 scrollend；不支持时回退到 rAF scroll
  const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window

  function updateScrollMargin() {
    if (!enabled() || !scrollEl.value || typeof window === 'undefined') {
      if (scrollMargin.value !== 0) scrollMargin.value = 0
      return
    }
    // 触摸期硬冻结：所有路径都不写 ref，避免 iOS 在 touch 主线程上重排 transform
    if (touchActive) return
    // overlay 锁定期硬冻结：Vuetify 打开任何 VOverlay（VDialog/VMenu/VBottomSheet 等）
    // 时会给 <html> 加 v-overlay-scroll-blocked 类并把 body 改成 position:fixed。
    // 此时 body 几何处于人为变形状态（rect.top 被偏移到负值，scrollY=0），
    // 测出来的 scrollMargin 是错的，写入会让 tanstack 把刚弹出弹窗的卡片虚拟化
    // 出 DOM。等弹窗关闭后下一次 RO/scrollend 会自然校正回正确值。
    if (document.documentElement.classList.contains('v-overlay-scroll-blocked')) return
    const next = scrollEl.value.getBoundingClientRect().top + window.scrollY
    if (Math.abs(next - scrollMargin.value) >= SCROLL_MARGIN_THRESHOLD) {
      scrollMargin.value = next
    }
  }

  // scrollend 已被浏览器 debounce，无需 rAF 节流
  function onScrollEnd() {
    updateScrollMargin()
  }

  // fallback：scroll + rAF（与原版行为一致，但接受 touch 冻结）
  function onScroll() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      updateScrollMargin()
    })
  }

  function onTouchStart() {
    touchActive = true
  }

  function onTouchEnd() {
    touchActive = false
    // 抬指后立即补一帧 —— 把触摸期内累积的 above-list 变化一次性同步到 ref。
    // 用 rAF 让 iOS 完成 touch → click 派发，再写 ref，避免末刻还在抢主线程。
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = null
      updateScrollMargin()
    })
  }

  onMounted(() => {
    updateScrollMargin()
    if (enabled() && typeof window !== 'undefined') {
      window.addEventListener('resize', updateScrollMargin, { passive: true })
      if (supportsScrollEnd) {
        window.addEventListener('scrollend', onScrollEnd, { passive: true })
      } else {
        window.addEventListener('scroll', onScroll, { passive: true })
      }
      // touch 监听只在触摸设备有意义；非触摸设备不会触发，零成本
      window.addEventListener('touchstart', onTouchStart, { passive: true })
      window.addEventListener('touchend', onTouchEnd, { passive: true })
      window.addEventListener('touchcancel', onTouchEnd, { passive: true })
      resizeObserver = new ResizeObserver(updateScrollMargin)
      if (document.body) resizeObserver.observe(document.body)
    }
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateScrollMargin)
      if (supportsScrollEnd) {
        window.removeEventListener('scrollend', onScrollEnd)
      } else {
        window.removeEventListener('scroll', onScroll)
      }
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return { scrollMargin, updateScrollMargin }
}
