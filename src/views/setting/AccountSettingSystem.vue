<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { VRow } from 'vuetify/lib/components/index.mjs'
import draggable from 'vuedraggable'
import api from '@/api'
import { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { copyToClipboard } from '@/@core/utils/navigator'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { downloaderOptions, mediaServerOptions } from '@/api/constants'
import { useDisplay } from 'vuetify'

const display = useDisplay()

// 国际化
const { t } = useI18n()

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    APP_DOMAIN: null,
    API_TOKEN: null,
    WALLPAPER: 'tmdb',
    MEDIASERVER_SYNC_INTERVAL: null,
    RECOGNIZE_SOURCE: 'themoviedb',
    GITHUB_TOKEN: null,
    OCR_HOST: null,
    CUSTOMIZE_WALLPAPER_API_URL: null,
  },
  // 高级系统设置
  Advanced: {
    // 全局
    AUTO_UPDATE_RESOURCE: true,
    MOVIEPILOT_AUTO_UPDATE: 'release',
    AUXILIARY_AUTH_ENABLE: false,
    GLOBAL_IMAGE_CACHE: false,
    SUBSCRIBE_STATISTIC_SHARE: true,
    PLUGIN_STATISTIC_SHARE: true,
    BIG_MEMORY_MODE: false,
    DB_WAL_ENABLE: false,
    // 系统
    AUTO_UPDATE_RESOURCE: true,
    MOVIEPILOT_AUTO_UPDATE: 'release',
    NGINX_PORT='3000',
    PORT='3001',
    NGINX_CLIENT_MAX_BODY_SIZE="10m",
    ENABLE_SSL=false,
    SSL_DOMAIN=null,
    // 媒体
    TMDB_API_DOMAIN: null,
    TMDB_IMAGE_DOMAIN: null,
    TMDB_LOCALE: null,
    META_CACHE_EXPIRE: 0,
    SCRAP_FOLLOW_TMDB: true,
    FANART_ENABLE: false,
    TMDB_SCRAP_ORIGINAL_IMAGE: null,
    // 网络
    PROXY_HOST: null,
    GITHUB_PROXY: null,
    PIP_PROXY: null,
    DOH_ENABLE: false,
    DOH_RESOLVERS: null,
    DOH_DOMAINS: null,
    SECURITY_IMAGE_DOMAINS: [],
    // 日志
    DEBUG: false,
    LOG_LEVEL: 'INFO',
    LOG_MAX_FILE_SIZE: '5',
    LOG_BACKUP_COUNT: '3',
    LOG_FILE_FORMAT: '【%(levelname)s】%(asctime)s - %(message)s',
    LOG_CONSOLE_FORMAT: '"%(leveltext)s[%(name)s] %(asctime)s %(message)s"'
    // 实验室
    PLUGIN_AUTO_RELOAD: false,
    ENCODING_DETECTION_PERFORMANCE_MODE: true,
    TOKENIZED_SEARCH: false,
  },
})

// 是否发送请求的总开关
const isRequest = ref(true)

// 选中的媒体服务器
const mediaServers = ref<MediaServerConf[]>([])

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 高级设置对话框
const advancedDialog = ref(false)

const activeTab = ref('system')

// 元数据语言
const tmdbLanguageItems = [
  { title: t('setting.system.advancedSettings.media.tmdbLocale.items.zhCN'), value: 'zh' },
  { title: t('setting.system.advancedSettings.media.tmdbLocale.items.zhTW'), value: 'zh-TW' },
  { title: t('setting.system.advancedSettings.media.tmdbLocale.items.en'), value: 'en' },
]

// 日志等级
const logLevelItems = [
  { title: t('setting.system.advancedSettings.log.logLevel.items.debug'), value: 'DEBUG' },
  { title: t('setting.system.advancedSettings.log.logLevel.items.info'), value: 'INFO' },
  { title: t('setting.system.advancedSettings.log.logLevel.items.warning'), value: 'WARNING' },
  { title: t('setting.system.advancedSettings.log.logLevel.items.error'), value: 'ERROR' },
  { title: t('setting.system.advancedSettings.log.logLevel.items.critical'), value: 'CRITICAL' },
]

// 重启更新模式
const MOVIEPILOT_UPDATE = [
  { title: "release 模式", value: 'release' },
  { title: "DEV 模式", value: 'dev' },
  { title: "不更新", value: 'false' },
]

// 安全域名添加变量
const newSecurityDomain = ref('')

// 添加安全域名
function addSecurityDomain() {
  if (
    newSecurityDomain.value &&
    !SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.includes(newSecurityDomain.value)
  ) {
    SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.push(newSecurityDomain.value)
    newSecurityDomain.value = ''
  }
}

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    downloaders.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 重载系统生效配置
async function reloadSystem() {
  progressDialog.value = true
  try {
    const result: { [key: string]: any } = await api.get('system/reload')
    if (result.success) $toast.success(t('setting.system.reloadSuccess'))
    else $toast.error(t('setting.system.task.reloadFailed'))
  } catch (error) {
    console.log(error)
  }
  progressDialog.value = false
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  try {
    // 提取启用的下载器
    const enabledDownloaders = downloaders.value.filter(item => item.enabled)
    // 有启动的下载器时
    if (enabledDownloaders.length > 0) {
      downloaders.value = handleDefaultDownloaders(enabledDownloaders, downloaders.value)
    }
    const result: { [key: string]: any } = await api.post('system/setting/Downloaders', downloaders.value)
    if (result.success) $toast.success(t('setting.system.downloader.task.saveSuccess'))
    else $toast.error(t('setting.system.downloader.task.saveFailed'))

    await loadDownloaderSetting()
    await reloadSystem()
  } catch (error) {
    console.log(error)
  }
}

// 处理默认下载器状态
function handleDefaultDownloaders(enabledDownloaders: any[], downloaders: any[]) {
  const enabledDefaultDownloader = enabledDownloaders.find(item => item.default)
  if (enabledDownloaders.length > 0 && !enabledDefaultDownloader) {
    downloaders = downloaders.map(item => {
      if (item === enabledDownloaders[0]) {
        $toast.info(t('setting.system.downloader.task.noDefaultNotice', { name: item.name }))
        return { ...item, default: true }
      }
      // 清除其他下载器的默认下载器状态
      return { ...item, default: false }
    })
  }
  return downloaders
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/MediaServers', mediaServers.value)
    if (result.success) $toast.success(t('setting.system.mediaServers.task.saveSuccess'))
    else $toast.error(t('setting.system.mediaServers.saveFailed'))

    await loadMediaServerSetting()
    await reloadSystem()
  } catch (error) {
    console.log(error)
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      return true
    } else {
      $toast.error(t('setting.system.task.saveFailed', { message: result?.message }))
      return false
    }
  } catch (error) {
    console.log(error)
  }
  return false
}

// 保存基础设置
async function saveBasicSettings() {
  if (await saveSystemSetting(SystemSettings.value.Basic)) {
    $toast.success(t('setting.system.basicSaveSuccess'))
    await reloadSystem()
  }
}

// 保存高级设置
async function saveAdvancedSettings() {
  cleanEmptyFields(SystemSettings.value.Advanced, ['LOG_FILE_FORMAT'])

  if (await saveSystemSetting(SystemSettings.value.Advanced)) {
    advancedDialog.value = false
    $toast.success(t('setting.system.advancedSaveSuccess'))
    await reloadSystem()
  }
}

// 当字段为空时，将其设置为 null 提交，以便后端恢复为默认值
function cleanEmptyFields(settings: any, fields: string[]) {
  fields.forEach(field => {
    if (settings[field]?.trim?.() === '') {
      settings[field] = null
    }
  })
}

// 快捷复制到剪贴板
async function copyValue(value: string) {
  try {
    let success
    success = copyToClipboard(value)
    if (await success) $toast.success(t('setting.system.task.copySuccess'))
    else $toast.error(t('setting.system.task.copyFailed'))
  } catch (error) {
    $toast.error(t('setting.system.task.copyError'))
    console.log(error)
  }
}

// 登录首页壁纸来源
const wallpaperItems = [
  { title: t('setting.system.basicSettings.wallpaper.items.tmdb'), value: 'tmdb' },
  { title: t('setting.system.basicSettings.wallpaper.items.bing'), value: 'bing' },
  { title: t('setting.system.basicSettings.wallpaper.items.mediaserver'), value: 'mediaserver' },
  { title: t('setting.system.basicSettings.wallpaper.items.customize'), value: 'customize' },
  { title: t('setting.system.basicSettings.wallpaper.items.none'), value: '' },
]

// 预设部分Github加速站
const githubMirrorsItems: string[] = [
  // str: 'https://mirror.ghproxy.com/', // GitHub Proxy
  // str: 'https://ghp.ci/', // GitHub Proxy 子站
]

// 预设部分PIP镜像站
const pipMirrorsItems = [
  'https://pypi.tuna.tsinghua.edu.cn/simple', // 清华大学
  'https://pypi.mirrors.ustc.edu.cn/simple', // 中国科技大学
  'https://mirrors.pku.edu.cn/pypi/web/simple', // 北京大学
  'https://mirrors.aliyun.com/pypi/simple', // 阿里云
  'https://mirrors.cloud.tencent.com/pypi/simple', // 腾讯云
  'https://mirrors.163.com/pypi/simple', // 网易云
  'https://pypi.doubanio.com/simple', // 豆瓣
  'https://mirrors.hust.edu.cn/pypi/web/simple', // 华中理工大学
  'https://mirrors.bfsu.edu.cn/pypi/web/simple', // 北京外国语大学
]

// Github加速代理显示处理
const githubProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.GITHUB_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.GITHUB_PROXY = val === null ? '' : val
  },
})

// PIP加速代理显示处理
const pipProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.PIP_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.PIP_PROXY = val === null ? '' : val
  },
})

// 创建随机字符串
function createRandomString() {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  SystemSettings.value.Basic.API_TOKEN = Array.from(array, byte => charset[byte % charset.length]).join('')
}

// 添加下载器
function addDownloader(downloader: string) {
  let name = `下载器${downloaders.value.length + 1}`
  while (downloaders.value.some(item => item.name === name)) {
    name = `下载器${parseInt(name.split('下载器')[1]) + 1}`
  }
  downloaders.value.push({
    name: name,
    type: downloader,
    default: false,
    enabled: false,
    config: {},
  })
}

// 删除下载器
function removeDownloader(ele: DownloaderConf) {
  const index = downloaders.value.indexOf(ele)
  downloaders.value.splice(index, 1)
}

// 下载器变化
function onDownloaderChange(downloader: DownloaderConf, name: string) {
  const index = downloaders.value.findIndex(item => item.name === name)
  if (index !== -1) downloaders.value[index] = downloader
}

// 添加媒体服务器
function addMediaServer(mediaserver: string) {
  let name = `服务器${mediaServers.value.length + 1}`
  while (mediaServers.value.some(item => item.name === name)) {
    name = `服务器${parseInt(name.split('服务器')[1]) + 1}`
  }
  mediaServers.value.push({
    name: name,
    type: mediaserver,
    enabled: false,
    config: {},
  })
}

// 删除媒体服务器
function removeMediaServer(ele: MediaServerConf) {
  const index = mediaServers.value.indexOf(ele)
  if (index !== -1) mediaServers.value.splice(index, 1)
}

// 变更媒体服务器
function onMediaServerChange(mediaserver: MediaServerConf, name: string) {
  const index = mediaServers.value.findIndex(item => item.name === name)
  if (index !== -1) mediaServers.value[index] = mediaserver
}

// 加载数据
onMounted(() => {
  loadDownloaderSetting()
  loadMediaServerSetting()
  loadSystemSettings()
})

onActivated(async () => {
  isRequest.value = true
})

onDeactivated(() => {
  isRequest.value = false
})
</script>

<template>
  <ProgressDialog
    v-if="progressDialog"
    v-model="progressDialog"
    :text="t('setting.system.task.reloading')"
    :indeterminate="true"
  />

  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t("setting.system.basicSettings.title") }}</VCardTitle>
          <VCardSubtitle>{{
            t("setting.system.basicSettings.subtitle")
          }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.APP_DOMAIN"
                  :label="t('setting.system.basicSettings.appDomain.label')"
                  :hint="t('setting.system.basicSettings.appDomain.hint')"
                  :placeholder="
                    t('setting.system.basicSettings.appDomain.placeholder')
                  "
                  persistent-hint
                />
              </VCol>

              <VCol cols="12" md="6">
                <VRow>
                  <VCol
                    cols="12"
                    :md="
                      SystemSettings.Basic.WALLPAPER === 'customize' ? 6 : 12
                    "
                  >
                    <VSelect
                      v-model="SystemSettings.Basic.WALLPAPER"
                      :label="t('setting.system.basicSettings.wallpaper.label')"
                      :hint="t('setting.system.basicSettings.wallpaper.hint')"
                      persistent-hint
                      :items="wallpaperItems"
                    />
                  </VCol>

                  <VCol
                    v-if="SystemSettings.Basic.WALLPAPER === 'customize'"
                    cols="12"
                    md="6"
                  >
                    <VTextField
                      v-model="SystemSettings.Basic.CUSTOMIZE_WALLPAPER_API_URL"
                      :label="
                        t(
                          'setting.system.basicSettings.customizeWallpaperApi.label'
                        )
                      "
                      :hint="
                        t(
                          'setting.system.basicSettings.customizeWallpaperApi.hint'
                        )
                      "
                      :placeholder="
                        t('setting.system.basicSettings.customizeWallpaperApi')
                      "
                      persistent-hint
                      :rules="[
                        (v) =>
                          !!v ||
                          t(
                            'setting.system.basicSettings.customizeWallpaperApi.rules.required'
                          ),
                      ]"
                    />
                  </VCol>
                </VRow>
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.RECOGNIZE_SOURCE"
                  :label="
                    t('setting.system.basicSettings.recognizeSource.label')
                  "
                  :hint="t('setting.system.basicSettings.recognizeSource.hint')"
                  persistent-hint
                  :items="[
                    {
                      title: t(
                        'setting.system.basicSettings.recognizeSource.items.tmdb.title'
                      ),
                      value: 'themoviedb',
                    },
                    {
                      title: t(
                        'setting.system.basicSettings.recognizeSource.items.douban.title'
                      ),
                      value: 'douban',
                    },
                  ]"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.MEDIASERVER_SYNC_INTERVAL"
                  :label="
                    t(
                      'setting.system.basicSettings.mediaServerSyncInterval.labl'
                    )
                  "
                  :hint="
                    t(
                      'setting.system.basicSettings.mediaServerSyncInterval.hint'
                    )
                  "
                  persistent-hint
                  :suffix="
                    t(
                      'setting.system.basicSettings.mediaServerSyncInterval.unit'
                    )
                  "
                  type="number"
                  min="1"
                  :rules="[
                    (v: any) => !!v || t('setting.system.basicSettings.mediaServerSyncInterval.rules.required'),
                    (v: any) => !isNaN(v) || t('setting.system.basicSettings.mediaServerSyncInterval.rules.numbersOnly'),
                    (v: any) => v >= 1 || t('setting.system.basicSettings.mediaServerSyncInterval.rules.min'),
                  ]"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.API_TOKEN"
                  :label="t('setting.system.basicSettings.apiToken.label')"
                  :hint="t('setting.system.basicSettings.apiToken.hint')"
                  :placeholder="
                    t('setting.system.basicSettings.apiToken.placeholder')
                  "
                  persistent-hint
                  prependInnerIcon="mdi-reload"
                  :appendInnerIcon="
                    SystemSettings.Basic.API_TOKEN ? 'mdi-content-copy' : ''
                  "
                  @click:prependInner="createRandomString"
                  @click:appendInner="copyValue(SystemSettings.Basic.API_TOKEN)"
                  :rules="[
                    (v: string) => !!v || t('setting.system.basicSettings.apiToken.rules.required'),
                    (v: string) => v.length >= 16 || t('setting.system.basicSettings.apiToken.rules.min'),
                  ]"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.GITHUB_TOKEN"
                  :label="t('setting.system.githubToken')"
                  :placeholder="t('setting.system.githubTokenFormat')"
                  :hint="t('setting.system.githubToken.hint')"
                  persistent-hint
                >
                </VTextField>
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.OCR_HOST"
                  :label="t('setting.system.basicSettings.ocrHost.label')"
                  :placeholder="
                    t('setting.system.basicSettings.ocrHost.placeholder')
                  "
                  :hint="t('setting.system.basicSettings.ocrHost.hint')"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveBasicSettings">
                {{ t("common.save") }}
              </VBtn>
              <VSpacer />
              <VBtn
                color="error"
                @click="advancedDialog = true"
                prepend-icon="mdi-cog"
                append-icon="mdi-dots-horizontal"
              >
                {{ t("setting.system.advancedSettings") }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t("setting.system.downloaders") }}</VCardTitle>
          <VCardSubtitle>{{
            t("setting.system.downloadersDesc")
          }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="downloaders"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ class: 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <DownloaderCard
                :downloader="element"
                :downloaders="downloaders"
                @close="removeDownloader(element)"
                @change="onDownloaderChange"
                :allow-refresh="isRequest"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDownloaderSetting">
                {{ t("common.save") }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem
                      v-for="item in downloaderOptions"
                      @click="addDownloader(item.value)"
                    >
                      <VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addDownloader('custom')">
                      <VListItemTitle>{{
                        t("setting.system.custom")
                      }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t("setting.system.mediaServers") }}</VCardTitle>
          <VCardSubtitle>{{
            t("setting.system.mediaServersDesc")
          }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="mediaServers"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ class: 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <MediaServerCard
                :mediaserver="element"
                :mediaservers="mediaServers"
                @close="removeMediaServer(element)"
                @change="onMediaServerChange"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveMediaServerSetting">
                {{ t("common.save") }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem
                      v-for="item in mediaServerOptions"
                      @click="addMediaServer(item.value)"
                    >
                      <VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addMediaServer('custom')">
                      <VListItemTitle>{{
                        t("setting.system.custom")
                      }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- 高级系统设置 -->
  <VDialog
    v-if="advancedDialog"
    v-model="advancedDialog"
    scrollable
    max-width="60rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <VDialogCloseBtn @click="advancedDialog = false" />
        <VCardTitle>{{
          t("setting.system.advancedSettings.title")
        }}</VCardTitle>
        <VCardSubtitle>{{
          t("setting.system.advancedSetting.subtitle")
        }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VTabs v-model="activeTab" show-arrows>
          <VTab value="system">
            <div>{{ t("setting.advancedSettings.tabs.system") }}</div>
          </VTab>
          <VTab value="media">
            <div>{{ t("setting.advancedSettings.tabs.media") }}</div>
          </VTab>
          <VTab value="network">
            <div>{{ t("setting.advancedSettings.tabs.network") }}</div>
          </VTab>
          <VTab value="log">
            <div>{{ t("setting.advancedSettings.tabs.log") }}</div>
          </VTab>
          <VTab value="dev">
            <div>{{ t("setting.advancedSettings.tabs.lab") }}</div>
          </VTab>
        </VTabs>
        <VWindow
          v-model="activeTab"
          class="mt-5 disable-tab-transition"
          :touch="false"
        >
          <VWindowItem value="system">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.AUXILIARY_AUTH_ENABLE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.auxAuthEnable.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.auxAuthEnable.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.GLOBAL_IMAGE_CACHE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.globalImageCache.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.globalImageCache.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SUBSCRIBE_STATISTIC_SHARE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.subscribeStatisticShare.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.subscribeStatisticShare.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_STATISTIC_SHARE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.pluginStatisticShare.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.pluginStatisticShare.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.BIG_MEMORY_MODE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.bigMemoryMode.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.bigMemoryMode.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DB_WAL_ENABLE"
                    :label="
                      t(
                        'setting.system.advancedSettings.system.dbWalEnable.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.system.dbWalEnable.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="media">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_API_DOMAIN"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.tmdbApiDomain.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.media.tmdbApiDomain.placeholder'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.tmdbApiDomain.hint'
                      )
                    "
                    persistent-hint
                    :items="['api.themoviedb.org', 'api.tmdb.org']"
                    :rules="[(v: string) => !!v || t('setting.system.advancedSettings.media.tmdbApiDomain.rules.required')]"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_IMAGE_DOMAIN"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.tmdbImageDomain.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.media.tmdbImageDomain.placeholder'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.tmdbImageDomain.hint'
                      )
                    "
                    persistent-hint
                    :items="['image.tmdb.org', 'static-mdb.v.geilijiasu.com']"
                    :rules="[(v: string) => !!v || t('setting.system.advancedSettings.media.tmdbImageDomain.rules.required')]"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSelect
                    v-model="SystemSettings.Advanced.TMDB_LOCALE"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.tmdbLocale.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.media.tmdbLocale.placeholder'
                      )
                    "
                    :hint="
                      t('setting.system.advancedSettings.media.tmdbLocale.hint')
                    "
                    persistent-hint
                    :items="tmdbLanguageItems"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.META_CACHE_EXPIRE"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.metaCacheExpire.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.metaCacheExpire.hint'
                      )
                    "
                    persistent-hint
                    min="0"
                    type="number"
                    :suffix="
                      t(
                        'setting.system.advancedSettings.media.metaCacheExpire.unit'
                      )
                    "
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.advancedSettings.media.metaCacheExpire.rules.required'),
                      (v: any) => v >= 0 || t('setting.system.advancedSettings.media.metaCacheExpire.rules.min'),
                    ]"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SCRAP_FOLLOW_TMDB"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.scrapFollowTmdb.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.scrapFollowTmdb.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.TMDB_SCRAP_ORIGINAL_IMAGE"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.scrapOriginalImage.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.scrapOriginalImage.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.FANART_ENABLE"
                    :label="
                      t(
                        'setting.system.advancedSettings.media.fanartEnable.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.media.fanartEnable.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="network">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="githubProxyDisplay"
                    :label="
                      t(
                        'setting.system.advancedSettings.network.githubProxy.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.network.githubProxy.placeholder'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.network.githubProxy.hint'
                      )
                    "
                    persistent-hint
                    :items="githubMirrorsItems"
                    clearable
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="pipProxyDisplay"
                    :label="
                      t(
                        'setting.system.advancedSettings.network.pipProxy.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.network.pipProxy.placeholder'
                      )
                    "
                    :hint="
                      t('setting.system.advancedSettings.network.pipProxy.hint')
                    "
                    persistent-hint
                    :items="pipMirrorsItems"
                    clearable
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DOH_ENABLE"
                    :label="
                      t(
                        'setting.system.advancedSettings.network.dohEnable.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.network.dohEnable.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_RESOLVERS"
                    :label="
                      t(
                        'setting.system.advancedSettings.network.dohResolvers.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.network.dohResolvers.placeholder'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.network.dohResolvers.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_DOMAINS"
                    :label="
                      t(
                        'setting.system.advancedSettings.network.dohDomains.label'
                      )
                    "
                    :placeholder="
                      t(
                        'setting.system.advancedSettings.network.dohDomains.placeholder'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.network.dohDomains.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12">
                  <!-- 安全域名 -->
                  <VCard>
                    <VCardItem>
                      <VCardTitle>{{
                        t(
                          "setting.system.advancedSettings.network.securityImageDomains.title"
                        )
                      }}</VCardTitle>
                      <VCardSubtitle>{{
                        t(
                          "setting.system.advancedSettings.network.securityImageDomains.subtitle"
                        )
                      }}</VCardSubtitle>
                    </VCardItem>
                    <VCardText>
                      <div class="d-flex flex-wrap gap-2 mb-3">
                        <VChip
                          v-for="(domain, index) in SystemSettings.Advanced
                            .SECURITY_IMAGE_DOMAINS"
                          :key="index"
                          closable
                          @click:close="
                            SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS.splice(
                              index,
                              1
                            )
                          "
                        >
                          {{ domain }}
                        </VChip>
                        <VChip
                          v-if="
                            SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS
                              .length === 0
                          "
                          color="warning"
                        >
                          {{
                            t(
                              "setting.system.advancedSettings.network.securityImageDomains.noData"
                            )
                          }}
                        </VChip>
                      </div>
                      <div class="d-flex align-center gap-2">
                        <VTextField
                          v-model="newSecurityDomain"
                          :placeholder="
                            t(
                              'setting.system.advancedSettings.network.securityImageDomains.placeholder'
                            )
                          "
                          hide-details
                          density="compact"
                        >
                          <template #append>
                            <VBtn
                              icon
                              color="primary"
                              @click="addSecurityDomain"
                              :disabled="!newSecurityDomain"
                            >
                              <VIcon icon="mdi-plus" />
                            </VBtn>
                          </template>
                        </VTextField>
                      </div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="log">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DEBUG"
                    :label="
                      t('setting.system.advancedSettings.log.debug.label')
                    "
                    :hint="t('setting.system.advancedSettings.log.debug.hint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSelect
                    v-if="!SystemSettings.Advanced.DEBUG"
                    v-model="SystemSettings.Advanced.LOG_LEVEL"
                    :label="
                      t('setting.system.advancedSettings.log.logLevel.label')
                    "
                    :hint="
                      t('setting.system.advancedSettings.log.logLevel.hint')
                    "
                    persistent-hint
                    :items="logLevelItems"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_MAX_FILE_SIZE"
                    :label="
                      t(
                        'setting.system.advancedSettings.log.logMaxFileSize.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.log.logMaxFileSize.hint'
                      )
                    "
                    persistent-hint
                    min="1"
                    type="number"
                    :suffix="
                      t(
                        'setting.system.advancedSettings.log.logMaxFileSize.unit'
                      )
                    "
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.advancedSettings.log.logMaxFileSize.rules.required'),
                      (v: any) => v >= 1 || t('setting.system.advancedSettings.log.logMaxFileSize.rules.min')
                      ]"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_BACKUP_COUNT"
                    :label="
                      t(
                        'setting.system.advancedSettings.log.logBackupCount.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.log.logBackupCount.hint'
                      )
                    "
                    persistent-hint
                    min="1"
                    type="number"
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.advancedSettings.log.logBackupCount.rules.required'), 
                      (v: any) => v >= 1 || t('setting.system.advancedSettings.log.logBackupCount.rules.min')
                      ]"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_FILE_FORMAT"
                    :label="
                      t(
                        'setting.system.advancedSettings.log.logFileFormat.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.log.logFileFormat.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="dev">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_AUTO_RELOAD"
                    :label="
                      t(
                        'setting.system.advancedSettings.lab.pluginAutoReload.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.lab.pluginAutoReload.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="
                      SystemSettings.Advanced
                        .ENCODING_DETECTION_PERFORMANCE_MODE
                    "
                    :label="
                      t(
                        'setting.system.advancedSettings.lab.encodingDetectionPerformanceMode.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.lab.encodingDetectionPerformanceMode.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.TOKENIZED_SEARCH"
                    :label="
                      t(
                        'setting.system.advancedSettings.lab.tokenizedSearch.label'
                      )
                    "
                    :hint="
                      t(
                        'setting.system.advancedSettings.lab.tokenizedSearch.hint'
                      )
                    "
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
        </VWindow>
      </VCardText>
      <VCardActions class="pt-3">
        <VForm @submit.prevent="() => {}">
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn
              color="primary"
              prepend-icon="mdi-content-save"
              @click="saveAdvancedSettings"
              class="px-5"
            >
              {{ t("common.save") }}
            </VBtn>
          </div>
        </VForm>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
