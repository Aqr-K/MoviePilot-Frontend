<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import VersionHistory from '../misc/VersionHistory.vue'
import api from '@/api'
import type { Plugin } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { getDominantColor } from '@/@core/utils/image'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatDownloadCount } from '@/@core/utils/formatters'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 多语言
const { t } = useI18n()

// 背景颜色
const backgroundColor = ref('#28A9E1')

// 图片对象
const imageRef = ref<any>()

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref('')

// 获取当前插件的标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []

  return props.plugin.plugin_label
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
})

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 更新日志弹窗
const releaseDialog = ref(false)

// 插件详情弹窗
const detailDialog = ref(false)

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
  const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement
  // 从图片中提取背景色
  backgroundColor.value = await getDominantColor(imageElement)
}

// 可安装版本列表（来自 Aqr-K 清单；旧清单为空数组，使用默认单版本安装流程）
const availableReleases = computed(() => props.plugin?.releases ?? [])

// 选中的版本（默认：展示版本）
const selectedVersion = ref<string | undefined>(undefined)
watch(
  () => props.plugin,
  p => {
    selectedVersion.value = p?.plugin_version ?? undefined
  },
  { immediate: true },
)

// 选中条目（用于判断通道/兼容性）
const selectedEntry = computed(() =>
  availableReleases.value.find(e => e.version === selectedVersion.value),
)

// 选中版本是否不兼容（禁用安装按钮）
const selectedIncompatible = computed(() => selectedEntry.value?.is_compatible === false)

// 安装插件
async function installPlugin() {
  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = t('plugin.installing', {
      name: props.plugin?.plugin_name,
      version: selectedVersion.value ?? props?.plugin?.plugin_version,
    })

    const result: { [key: string]: any } = await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: props.plugin?.repo_url,
        force: props.plugin?.has_update,
        // 显式传入用户所选版本；未选择（旧清单）则不传，后端走默认规则
        ...(selectedVersion.value ? { version: selectedVersion.value } : {}),
      },
    })

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(t('plugin.installSuccess', { name: props.plugin?.plugin_name }))
      detailDialog.value = false
      // 通知父组件刷新
      emit('install')
    } else {
      $toast.error(t('plugin.installFailed', { name: props.plugin?.plugin_name, message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (imageLoadError.value) return getLogoUrl('plugin')
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      props.plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${props.plugin?.plugin_icon}`
})

// 访问插件页面
function visitPluginPage() {
  // 将raw.githubusercontent.com转换为项目地址
  let repoUrl = props.plugin?.repo_url
  if (repoUrl) {
    if (repoUrl.includes('raw.githubusercontent.com')) {
      if (!repoUrl.endsWith('/')) repoUrl += '/'

      if (repoUrl.split('/').length < 6) repoUrl = `${repoUrl}main/`

      try {
        const [user, repo] = repoUrl.split('/').slice(-4, -2)
        repoUrl = `https://github.com/${user}/${repo}`
      } catch (error) {
        return
      }
    }
  } else {
    repoUrl = props.plugin?.author_url
  }
  window.open(repoUrl, '_blank')
}

// 显示更新日志
function showUpdateHistory() {
  releaseDialog.value = true
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('plugin.projectHome'),
    value: 1,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
  {
    title: t('plugin.updateHistory'),
    value: 2,
    show: (props.plugin?.releases?.length ?? 0) > 0 || !isNullOrEmptyObject(props.plugin?.history || {}),
    props: {
      prependIcon: 'mdi-update',
      click: showUpdateHistory,
    },
  },
])
</script>

<template>
  <div>
    <VHover>
      <template #default="hover">
        <VCard
          v-bind="hover.props"
          :width="props.width"
          :height="props.height"
          @click="detailDialog = true"
          class="flex flex-col h-full"
          :class="{
            'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
          }"
        >
          <div
            class="flex-grow"
            :style="`background: linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.5) 100%), linear-gradient(${backgroundColor} 0%, ${backgroundColor} 100%)`"
          >
            <VCardText class="px-2 pt-2 pb-0">
              <VCardTitle
                class="text-white px-2 pb-0 text-lg text-shadow whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {{ props.plugin?.plugin_name }}
                <span class="text-sm mt-1 text-gray-200"> v{{ props.plugin?.plugin_version }} </span>
              </VCardTitle>
            </VCardText>
            <div class="relative flex flex-row items-start px-2 justify-between grow">
              <div class="relative flex-1 min-w-0">
                <div
                  class="text-white text-sm px-2 py-1 text-shadow overflow-hidden ..."
                  :class="{ 'line-clamp-3': !props.plugin?.plugin_label, 'line-clamp-2': props.plugin?.plugin_label }"
                >
                  {{ props.plugin?.plugin_desc }}
                </div>
                <!-- 插件标签 -->
                <div v-if="pluginLabels.length > 0" class="plugin-app-card__tags-section px-2">
                  <VChip
                    v-for="tag in pluginLabels"
                    :key="tag"
                    size="x-small"
                    variant="tonal"
                    color="info"
                    class="me-1 mb-1"
                    tile
                  >
                    {{ tag }}
                  </VChip>
                </div>
              </div>
              <div class="relative flex-shrink-0 self-center pb-3">
                <VAvatar size="48">
                  <VImg
                    ref="imageRef"
                    :src="iconPath"
                    aspect-ratio="4/3"
                    cover
                    @load="imageLoaded"
                    @error="imageLoadError = true"
                  />
                </VAvatar>
              </div>
            </div>
          </div>
          <VCardText
            class="flex flex-col align-self-baseline justify-between px-2 py-2 w-full overflow-hidden max-h-10 min-h-10"
          >
            <div class="flex flex-nowrap items-center w-full pe-10">
              <div class="flex flex-nowrap max-w-40 items-center align-middle">
                <VIcon icon="mdi-github" class="me-1" />
                <a
                  class="overflow-hidden text-ellipsis whitespace-nowrap"
                  :href="props.plugin?.author_url"
                  target="_blank"
                  @click.stop
                >
                  {{ props.plugin?.plugin_author }}
                </a>
              </div>
              <div v-if="props.count" class="ms-2 flex-shrink-0 download-count align-middle items-center">
                <VIcon size="small" icon="mdi-download" />
                <span class="text-sm">{{ formatDownloadCount(props.count) }}</span>
              </div>
            </div>
            <div class="absolute bottom-0 right-0">
              <IconBtn>
                <VIcon size="small" icon="mdi-dots-vertical" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem v-for="(item, i) in dropdownItems" v-show="item.show" :key="i" @click="item.props.click">
                      <template #prepend>
                        <VIcon :icon="item.props.prependIcon" />
                      </template>
                      <VListItemTitle v-text="item.title" />
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </VCardText>
        </VCard>
      </template>
    </VHover>
    <!-- 安装插件进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
    <!-- 更新日志 -->
    <VDialog v-if="releaseDialog" v-model="releaseDialog" width="600" scrollable>
      <VCard :title="t('plugin.updateHistoryTitle', { name: props.plugin?.plugin_name })">
        <VDialogCloseBtn @click="releaseDialog = false" />
        <VDivider />
        <VersionHistory :releases="props.plugin?.releases ?? []" :history="props.plugin?.history" />
      </VCard>
    </VDialog>
    <!-- 插件详情-->
    <VDialog v-if="detailDialog" v-model="detailDialog" max-width="30rem">
      <VCard>
        <VDialogCloseBtn @click="detailDialog = false" />
        <VCardText>
          <VCol>
            <div class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
              <div class="mx-auto mt-5">
                <VAvatar size="64">
                  <VImg
                    ref="imageRef"
                    :src="iconPath"
                    aspect-ratio="4/3"
                    cover
                    @load="imageLoaded"
                    @error="imageLoadError = true"
                  />
                </VAvatar>
              </div>
              <div class="flex-grow">
                <VCardItem>
                  <VCardTitle class="text-center text-md-left">
                    {{ props.plugin?.plugin_name }}
                  </VCardTitle>
                  <VCardSubtitle
                    class="text-center text-md-left break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis ..."
                  >
                    {{ props.plugin?.plugin_desc }}
                  </VCardSubtitle>
                  <VList lines="one">
                    <VListItem class="ps-0">
                      <VListItemTitle class="text-center text-md-left">
                        <span class="font-weight-medium">{{ t('common.version') }}：</span>
                        <span class="text-body-1"> v{{ props.plugin?.plugin_version }}</span>
                      </VListItemTitle>
                    </VListItem>
                    <VListItem class="ps-0">
                      <VListItemTitle class="text-center text-md-left">
                        <span class="font-weight-medium">{{ t('common.author') }}：</span>
                        <span class="text-body-1 cursor-pointer" @click="visitPluginPage">
                          {{ props.plugin?.plugin_author }}
                        </span>
                      </VListItemTitle>
                    </VListItem>
                  </VList>
                  <div class="text-center text-md-left">
                    <!-- 版本选择器：仅当清单提供了 releases 列表时显示 -->
                    <VSelect
                      v-if="availableReleases.length > 0"
                      v-model="selectedVersion"
                      :items="availableReleases.map(e => ({
                        title: e.version,
                        value: e.version,
                        subtitle: e.channel === 'prerelease' ? 'pre-release' : 'stable',
                        props: { disabled: e.is_compatible === false },
                      }))"
                      :label="t('common.version')"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2 max-w-56"
                      item-title="title"
                      item-value="value"
                    >
                      <template #selection="{ item }">
                        <div class="d-flex align-center gap-2">
                          <span>v{{ item.raw.value }}</span>
                          <VChip
                            v-if="item.raw.subtitle === 'pre-release'"
                            size="x-small"
                            color="warning"
                            variant="tonal"
                          >
                            pre
                          </VChip>
                        </div>
                      </template>
                    </VSelect>
                    <div v-if="selectedIncompatible" class="text-xs text-error mb-1">
                      与当前后端版本不兼容（需要 {{ selectedEntry?.requires_version?.backend }}）
                    </div>
                    <VBtn
                      color="primary"
                      :disabled="selectedIncompatible"
                      @click="installPlugin"
                      prepend-icon="mdi-download"
                    >
                      {{ t('plugin.installToLocal') }}
                    </VBtn>
                    <div class="text-xs mt-2" v-if="props.count">
                      <VIcon icon="mdi-fire" />{{
                        t('plugin.totalDownloads', { count: formatDownloadCount(props.count) })
                      }}
                    </div>
                  </div>
                </VCardItem>
              </div>
            </div>
          </VCol>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
