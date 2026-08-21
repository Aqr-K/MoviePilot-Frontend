<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { storageAttributes } from '@/api/constants'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { configureAceEditorPadding } from '@/utils/aceEditor'
import { useServiceConfigs } from '@/composables/useServiceConfigs'
import { isStorageInstanceName } from '@/utils/storageToken'

const { t } = useI18n()
const { global: globalTheme } = useTheme()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽排序和分类编辑弹窗按需加载，避免设置框架预加载目录页时带上这些交互依赖。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const CategoryEditDialog = defineAsyncComponent(() => import('@/components/dialog/CategoryEditDialog.vue'))
const StorageInstanceDialog = defineAsyncComponent(() => import('@/components/dialog/StorageInstanceDialog.vue'))

// 所有下载目录
const directories = ref<TransferDirectoryConf[]>([])

// 存储实例配置，增删改各自走服务实例配置端点，写完即刻生效
const {
  configs: storageConfigs,
  types: storageTypes,
  canAddInstance,
  load: loadStorages,
  addConfig: addStorageConfig,
  changeConfig: changeStorageConfig,
  removeConfig: removeStorageConfig,
  applyDefaultTarget: applyStorageDefaultTarget,
} = useServiceConfigs<StorageConf>('storage')

// 存储实例列表，供目录卡片的存储下拉取用
const storages = storageConfigs

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框
const $toast = useToast()

// 数据源
const sourceItems = computed(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
  { title: t('setting.cache.recognitionSource.musicbrainz'), value: 'musicbrainz' },
  { title: t('setting.cache.recognitionSource.theaudiodb'), value: 'theaudiodb' },
  { title: t('setting.cache.recognitionSource.doubanmusic'), value: 'doubanmusic' },
])

// 可新增配置的存储类型。
// 内建类型登记在各内建模块的清单里、不在服务实例登记表中，宿主没有一份跨两处的全量目录，
// 因此把内建类型表与登记表下发的扩展类型并起来才是完整的类型菜单；能不能再加一份由
// canAddInstance 按 multi_instance 判定，而不是按「这个类型有没有配过」一刀切。
const storageOptions = computed(() => {
  const builtinOptions = storageAttributes.map(item => ({
    title: t(`storage.${item.type}`),
    value: item.type,
  }))
  const registeredOptions = storageTypes.value
    .filter(item => !storageAttributes.some(builtin => builtin.type === item.type))
    .map(item => ({ title: item.name, value: item.type }))
  return [...builtinOptions, ...registeredOptions].filter(item => canAddInstance(item.value))
})

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SCRAP_SOURCE: 'themoviedb',
    MOVIE_RENAME_FORMAT: null,
    TV_RENAME_FORMAT: null,
    MUSIC_RENAME_FORMAT: null,
  },
})

// 挂载型本地盘删除空目录开关
const mountedLocalDiskDeleteEmptyDirs = ref(true)
const mountedLocalDiskDeleteEmptyDirsKey = 'MountedLocalDiskDeleteEmptyDirs'

// 编辑器主题
// Ace 跟随 Vuetify 当前生效主题，auto 模式下也按实际明暗色渲染。
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

const renameEditorOptions = {
  fontSize: 14,
  tabSize: 2,
  showLineNumbers: true,
  showGutter: true,
}

// 打开共享分类编辑弹窗，保存后刷新本页分类配置。
function openCategoryDialog() {
  openSharedDialog(
    CategoryEditDialog,
    {},
    {
      save: loadMediaCategories,
    },
    { closeOn: ['close', 'save', 'update:modelValue'] },
  )
}

const movieRenameFormat = computed({
  get: () => SystemSettings.value.Basic.MOVIE_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.MOVIE_RENAME_FORMAT = value || null
  },
})

const tvRenameFormat = computed({
  get: () => SystemSettings.value.Basic.TV_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.TV_RENAME_FORMAT = value || null
  },
})

const musicRenameFormat = computed({
  get: () => SystemSettings.value.Basic.MUSIC_RENAME_FORMAT ?? '',
  set: value => {
    SystemSettings.value.Basic.MUSIC_RENAME_FORMAT = value || null
  },
})

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    // 将API返回的值赋值给SystemSettings
    for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
      Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          Reflect.set(SystemSettings.value[sectionKey], key, result[key])
        }
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载挂载盘空目录清理设置
async function loadMountedLocalDiskDeleteEmptyDirs() {
  try {
    const result = await api.get<{ value?: boolean | null }>(`system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`)
    mountedLocalDiskDeleteEmptyDirs.value = result.value ?? true
  } catch (error) {
    console.log(error)
  }
}

// 移动结束
function orderDirectoryCards() {
  // 更新所有目录的优先级
  directories.value.forEach((item, index) => {
    item.priority = index
  })
}

// 读取存储实例配置，失败时保留上一轮内容而不是清空
async function refreshStorages() {
  try {
    await loadStorages()
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.loadFailed'))
  }
}

// 查询目录
async function loadDirectories() {
  try {
    const result = await api.get<{ value?: TransferDirectoryConf[] }>('system/setting/public/Directories')
    directories.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存目录
async function saveDirectories() {
  orderDirectoryCards()
  try {
    const names = directories.value.map(item => item.name)
    if (new Set(names).size !== names.length) {
      $toast.error(t('setting.directory.duplicateDirectoryName'))
      return
    }
    await api.post('system/setting/Directories', directories.value, { feedback: 'silent' })
    $toast.success(t('setting.directory.directorySaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.directory.directorySaveFailed'))
  }
}

// 添加媒体库目录
function addDirectory() {
  let name = `${t('setting.directory.defaultDirName')}${directories.value.length + 1}`
  while (directories.value.some(item => item.name === name)) {
    name = `${t('setting.directory.defaultDirName')}${
      parseInt(name.split(t('setting.directory.defaultDirName'))[1]) + 1
    }`
  }
  directories.value.push({
    name: name,
    storage: 'local',
    download_path: '',
    priority: -1,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  })
  orderDirectoryCards()
}

// 移除媒体库目录
function removeDirectory(directory: TransferDirectoryConf) {
  const index = directories.value.indexOf(directory)
  if (index > -1) {
    directories.value.splice(index, 1)
  }
}

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

/**
 * 为某个存储类型排出一个未被占用的实例名。
 *
 * 第一份沿用类型标识本身，与后端「实例名缺省即回落为类型标识」一致，存量数据因此不用
 * 迁移；同类型的第二份起追加序号。实例名不得含空白，故用连字符而不是空格分隔。
 */
function nextInstanceName(storageType: string) {
  const taken = new Set(storages.value.map(item => item.name))
  if (!taken.has(storageType) && isStorageInstanceName(storageType)) return storageType
  let index = 2
  while (taken.has(`${storageType}-${index}`)) index += 1
  return `${storageType}-${index}`
}

// 添加存储实例
async function addStorage(storageType = 'custom') {
  // 自定义存储的类型标识由用户在配置弹窗里改写，此处只给一个不与已有类型冲突的初值
  const type = storageType === 'custom' ? `custom${storages.value.length + 1}` : storageType
  try {
    await addStorageConfig({ name: nextInstanceName(type), type, config: {} })
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.createFailed'))
  }
}

// 移除存储实例
async function removeStorage(storage: StorageConf) {
  try {
    await removeStorageConfig(storage)
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.deleteFailed'))
  }
}

/**
 * 保存存储实例的外壳设置。
 *
 * 实例名与裸令牌承接随配置写入，默认调用目标另走专用端点：置位受「每族至多一个」的唯一
 * 索引管辖，混进配置写入会让一次改实例名顺带把别人的置位清掉。
 */
async function saveStorageInstance(original: StorageConf, next: StorageConf) {
  try {
    await changeStorageConfig(next, original.name)
    if (next.default !== original.default) await applyStorageDefaultTarget(next.default ? next : undefined)
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.updateFailed'))
  }
}

/** 打开存储实例外壳设置弹窗。 */
function openStorageInstanceDialog(storage: StorageConf) {
  openSharedDialog(
    StorageInstanceDialog,
    { storage },
    {
      done: (next: StorageConf) => saveStorageInstance(storage, next),
    },
    { closeOn: ['close', 'done', 'update:modelValue'] },
  )
}

// 保存设置
async function saveSystemSettings(value: any) {
  try {
    await Promise.all([
      api.post('system/env', value, { feedback: 'silent' }),
      api.post(`system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`, mountedLocalDiskDeleteEmptyDirs.value, {
        feedback: 'silent',
      }),
    ])
    $toast.success(t('setting.directory.organizeSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.directory.organizeSaveFailed'))
  }
}

async function loadPageData() {
  await Promise.all([
    loadDirectories(),
    refreshStorages(),
    loadMediaCategories(),
    loadSystemSettings(),
    loadMountedLocalDiskDeleteEmptyDirs(),
  ])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.directory.storage') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.storageDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <div class="grid gap-3 grid-app-card">
            <StorageCard
              v-for="element in storages"
              :key="`${element.type}@${element.name}`"
              :storage="element"
              @close="removeStorage(element)"
              @edit="openStorageInstanceDialog(element)"
              @done="refreshStorages"
            />
          </div>
        </VCardText>
        <VCardText>
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn color="success" variant="tonal" :aria-label="t('storage.addInstance')">
              <VIcon icon="mdi-plus" />
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem v-for="item in storageOptions" :key="item.value" @click="addStorage(item.value)">
                    <VListItemTitle>{{ item.title }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="addStorage('custom')">
                    <VListItemTitle>{{ t('storage.custom') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.directory.directory') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.directoryDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="directories"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="orderDirectoryCards"
            :component-data="{ 'class': 'grid gap-3 grid-directory-card items-start' }"
          >
            <template #item="{ element }">
              <DirectoryCard
                :directory="element"
                :categories="mediaCategories"
                :storages="storages"
                @update:modelValue="
                  (value: any) => {
                    element.download_path = value?.download
                    element.library_path = value?.library
                  }
                "
                @close="removeDirectory(element)"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDirectories" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal" @click="addDirectory" class="me-2">
                <VIcon icon="mdi-plus" />
              </VBtn>
              <VSpacer />
              <VBtn color="info" variant="tonal" prepend-icon="mdi-shape-plus" @click="openCategoryDialog">
                {{ t('setting.category.title') }}
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
          <VCardTitle>{{ t('setting.directory.organizeAndScrap') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.organizeAndScrapDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SCRAP_SOURCE"
                :items="sourceItems"
                :label="t('setting.directory.scrapSource')"
                :hint="t('setting.directory.scrapSourceHint')"
                persistent-hint
                prepend-inner-icon="mdi-database"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="mountedLocalDiskDeleteEmptyDirs"
                :label="t('setting.directory.mountedLocalDiskDeleteEmptyDirs')"
                :hint="t('setting.directory.mountedLocalDiskDeleteEmptyDirsHint')"
                color="primary"
                persistent-hint
                inset
              />
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-movie-open" size="20" class="me-2" />
                  <span>{{ t('setting.directory.movieRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="movieRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.movieRenameFormatHint') }}
                </div>
              </div>
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-music-note" size="20" class="me-2" />
                  <span>{{ t('setting.directory.musicRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="musicRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.musicRenameFormatHint') }}
                </div>
              </div>
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-television" size="20" class="me-2" />
                  <span>{{ t('setting.directory.tvRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="tvRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.tvRenameFormatHint') }}
                </div>
              </div>
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSystemSettings(SystemSettings.Basic)" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style scoped>
.rename-format-editor__label {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  margin-block-end: 0.5rem;
}

.rename-format-editor__ace {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--app-field-radius);
  min-block-size: 8rem;
}

.rename-format-editor__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  line-height: 1.25rem;
  margin-block-start: 0.375rem;
}
</style>
