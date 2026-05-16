import { ref } from 'vue'
import type { MediaInfo, MediaSeason, Site } from '@/api/types'

/**
 * ============================================================
 * useDialogHost - 全局单例 Dialog 宿主
 * ============================================================
 *
 * 目的：把 MediaCard 内部的 3 个弹窗（Season / Edit / SearchSite）从
 * 虚拟化卡片的生命周期里彻底剥离。任意 MediaCard 实例在弹窗显示期间被
 * VirtualGrid/VirtualList unmount 都不会再牵连销毁弹窗。
 *
 * 设计：
 *   - 模块级单例 ref（应用内任意位置 useDialogHost() 拿到同一份状态）
 *   - 真正的弹窗实例渲染在 <DialogHost /> 里，该组件挂在 App.vue 根
 *     （在 VApp 内，<RouterView /> 同级），与所有路由/虚拟化解耦
 *   - 消费方（MediaCard 等）只调用 openXxx(...)；不再持有 dialog 实例
 *
 * 与 P2-SubscribeListView 提升模式的关系：
 *   - SubscribeListView 路径已经把 SubscribeEditDialog/Files/Share 提到了
 *     视图级（足以脱离 VirtualGrid 的影响），那里继续保留视图级宿主即可
 *   - 本文件主要服务 MediaCard：它出现在 MediaCardListView/SlideView/
 *     SubscribePopularView 三处不同的虚拟化容器里，逐个视图托管成本高，
 *     用根级宿主一劳永逸
 */

interface SeasonDialogState {
  media: MediaInfo
  onSubscribe: (
    seasons: MediaSeason[],
    seasonNoExists: { [key: number]: number },
    groupId: string,
  ) => void
}

interface EditDialogState {
  subid: number
  onSave?: () => void
  onRemove?: () => void
}

interface SiteDialogState {
  sites: Site[]
  selected: number[]
  onSearch: (siteIds: number[]) => void
}

// 模块级单例 —— useDialogHost() 任意位置调用返回同一份引用
const seasonDialog = ref<SeasonDialogState | null>(null)
const editDialog = ref<EditDialogState | null>(null)
const siteDialog = ref<SiteDialogState | null>(null)

export function useDialogHost() {
  function openSeasonDialog(state: SeasonDialogState) {
    seasonDialog.value = state
  }
  function closeSeasonDialog() {
    seasonDialog.value = null
  }
  function openEditDialog(state: EditDialogState) {
    editDialog.value = state
  }
  function closeEditDialog() {
    editDialog.value = null
  }
  function openSiteDialog(state: SiteDialogState) {
    siteDialog.value = state
  }
  function closeSiteDialog() {
    siteDialog.value = null
  }

  return {
    // 状态（只读访问交给 DialogHost.vue 即可）
    seasonDialog,
    editDialog,
    siteDialog,
    // 操作
    openSeasonDialog,
    closeSeasonDialog,
    openEditDialog,
    closeEditDialog,
    openSiteDialog,
    closeSiteDialog,
  }
}
