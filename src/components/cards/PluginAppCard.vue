<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import VersionHistory from '../misc/VersionHistory.vue'
import api from '@/api'
import type { Plugin } from '@/api/types'
import noImage from '@images/logos/plugin.png'
import { getDominantColor } from '@/@core/utils/image'
import { isNullOrEmptyObject } from '@/@core/utils'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { VIcon } from "vuetify/components";

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
  count: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['install'])

// 背景颜色
const backgroundColor = ref('#28A9E1')

// 图片对象
const imageRef = ref<any>()

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref('正在安装插件...')

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 更新日志弹窗
const releaseDialog = ref(false)

// 计算插件标签
const pluginLabels = computed(() => {
  if (!props.plugin?.plugin_label) return []
  return props.plugin.plugin_label.split(',')
})

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
  const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement
  // 从图片中提取背景色
  backgroundColor.value = await getDominantColor(imageElement)
}

// 安装插件
async function installPlugin() {
  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = `正在安装 ${props.plugin?.plugin_name} v${props?.plugin?.plugin_version} ...`

    const result: { [key: string]: any } = await api.get(`plugin/install/${props.plugin?.id}`, {
      params: {
        repo_url: props.plugin?.repo_url,
        force: props.plugin?.has_update,
      },
    })

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 安装成功！`)

      // 通知父组件刷新
      emit('install')
    } else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 安装失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算图标路径
const iconPath: Ref<string> = computed(() => {
  if (imageLoadError.value) return noImage
  // 如果是网络图片则使用代理后返回
  if (props.plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(props.plugin?.plugin_icon)}`

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
    title: '项目主页',
    value: 1,
    show: true,
    props: {
      prependIcon: 'mdi-github',
      click: visitPluginPage,
    },
  },
  {
    title: '更新说明',
    value: 2,
    show: !isNullOrEmptyObject(props.plugin?.history || {}),
    props: {
      prependIcon: 'mdi-update',
      click: showUpdateHistory,
    },
  },
])
</script>

<template>
  <VCard :width="props.width" :height="props.height" @click="installPlugin" class="flex flex-col">
    <!-- 顶部信息 -->
    <div class="relative flex flex-row items-start pa-3 justify-between grow"
         :style="{ background: `${backgroundColor}` }">
      <!-- 背景图片 -->
      <div class="absolute inset-0 bg-cover bg-center"
           :style="{ background: `${backgroundColor}`, filter: 'brightness(0.5)' }"/>
      <!-- 左侧 -->
      <div class="relative flex-1 min-w-0 ml-2">
        <!-- 插件名称 -->
        <VCardTitle class="px-0 py-1 text-white text-shadow whitespace-nowrap overflow-hidden text-ellipsis">
          {{ props.plugin?.plugin_name }}
          <span class="text-sm mt-1 text-gray-200">v{{ props.plugin?.plugin_version }}</span>
        </VCardTitle>
        <!-- 插件描述 -->
        <VCardText class="pa-0 mr-2 text-white text-shadow overflow-y-auto line-clamp-3 overflow-clip">
          {{ props.plugin?.plugin_desc }}
        </VCardText>
      </div>
      <!-- 右侧 -->
      <div class="relative flex-shrink-0 self-center pl-1 mr-2">
        <!-- 图标 -->
        <VAvatar size="64">
          <VImg
            ref="imageRef"
            :src="iconPath"
            aspect-ratio="4/3"
            cover
            :class="{ shadow: isImageLoaded }"
            @load="imageLoaded"
            @error="imageLoadError = true"
          />
        </VAvatar>
      </div>
    </div>
    <!--  底部信息栏  -->
    <VCardText class="flex flex-none align-self-baseline py-1 px-1.5 w-full align-center justify-between">
      <!-- 作者信息 -->
      <span class="ml-2 whitespace-no-wrap overflow-hidden overflow-ellipsis " style="max-width: 60%">
        <VIcon icon="mdi-github" class="me-0.5"/>
        <a :href="props.plugin?.author_url" target="_blank" @click.stop>
          {{ props.plugin?.plugin_author }}
        </a>
      </span>
      <!-- 下载次数 -->
      <span v-if="props.count" class="mx-2 whitespace-no-wrap overflow-hidden overflow-ellipsis">
        <VIcon icon="mdi-download"/>
        <span class="text-sm ">
          {{ props.count?.toLocaleString() }}
        </span>
      </span>
      <!-- 更多选项 -->
      <IconBtn class="ml-auto">
        <VIcon icon="mdi-dots-vertical"/>
        <VMenu activator="parent" close-on-content-click>
          <VList>
            <VListItem v-for="(item, i) in dropdownItems"
                       v-show="item.show"
                       :key="i"
                       variant="plain"
                       :base-color="item.props.color"
                       @click="item.props.click">
              <template #prepend>
                <VIcon :icon="item.props.prependIcon"/>
              </template>
              <VListItemTitle v-text="item.title"/>
            </VListItem>
          </VList>
        </VMenu>
      </IconBtn>
    </VCardText>
  </VCard>
  <!-- 安装插件进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText"/>
  <!-- 更新日志 -->
  <VDialog v-if="releaseDialog" v-model="releaseDialog" width="600" scrollable>
    <VCard :title="`${props.plugin?.plugin_name} 更新说明`">
      <DialogCloseBtn @click="releaseDialog = false"/>
      <VDivider/>
      <VersionHistory :history="props.plugin?.history"/>
    </VCard>
  </VDialog>
</template>
