<script lang="ts" setup>
/**
 * 根级 Dialog 宿主 —— 渲染 useDialogHost 单例驱动的 3 个 MediaCard 弹窗。
 * 挂在 App.vue 的 <VApp> 下，与 <RouterView /> 同级，永不随路由/虚拟化 unmount。
 *
 * @see composables/useDialogHost.ts 对设计动机的完整说明
 */
import SubscribeSeasonDialog from './dialog/SubscribeSeasonDialog.vue'
import SubscribeEditDialog from './dialog/SubscribeEditDialog.vue'
import SearchSiteDialog from './dialog/SearchSiteDialog.vue'
import { useDialogHost } from '@/composables/useDialogHost'

const {
  seasonDialog,
  editDialog,
  siteDialog,
  closeSeasonDialog,
  closeEditDialog,
  closeSiteDialog,
} = useDialogHost()

function handleSeasonSubscribe(
  seasons: any,
  seasonNoExists: { [key: number]: number },
  groupId: string,
) {
  // 先回调，再关闭：消费方需要在状态可读时拿到结果
  if (seasonDialog.value) seasonDialog.value.onSubscribe(seasons, seasonNoExists, groupId)
  closeSeasonDialog()
}

function handleSiteSearch(siteIds: number[]) {
  if (siteDialog.value) siteDialog.value.onSearch(siteIds)
  closeSiteDialog()
}

function handleEditSave() {
  if (editDialog.value?.onSave) editDialog.value.onSave()
  closeEditDialog()
}

function handleEditRemove() {
  if (editDialog.value?.onRemove) editDialog.value.onRemove()
  closeEditDialog()
}
</script>

<template>
  <!-- 订阅季度选择 -->
  <SubscribeSeasonDialog
    v-if="seasonDialog"
    :model-value="true"
    :media="seasonDialog.media"
    @subscribe="handleSeasonSubscribe"
    @close="closeSeasonDialog"
    @update:model-value="(v: boolean) => { if (!v) closeSeasonDialog() }"
  />

  <!-- 订阅参数编辑（来自 MediaCard 的"订阅成功后弹出编辑"路径） -->
  <SubscribeEditDialog
    v-if="editDialog"
    :model-value="true"
    :subid="editDialog.subid"
    @close="closeEditDialog"
    @save="handleEditSave"
    @remove="handleEditRemove"
    @update:model-value="(v: boolean) => { if (!v) closeEditDialog() }"
  />

  <!-- 搜索站点选择 -->
  <SearchSiteDialog
    v-if="siteDialog"
    :model-value="true"
    :sites="siteDialog.sites"
    :selected="siteDialog.selected"
    @search="handleSiteSearch"
    @close="closeSiteDialog"
    @update:model-value="(v: boolean) => { if (!v) closeSiteDialog() }"
  />
</template>
