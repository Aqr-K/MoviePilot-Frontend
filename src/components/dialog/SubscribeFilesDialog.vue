<script setup lang="ts">
import api from '@/api'
import { SubscrbieInfo } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// i18n
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

//定义输入参数
const props = defineProps({
  subid: Number,
})

const activeTab = ref('download')

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 订阅文件信息
const subScribeInfo = ref<SubscrbieInfo>()

// 是否加载中
const loading = ref(false)

// 下载文件表头
const downloadHeaders = [
  { title: t('dialog.subscribeFiles.episodeColumn'), key: 'episode_number', sortable: true },
  { title: t('dialog.subscribeFiles.torrentColumn'), key: 'torrent_title', sortable: true },
  { title: t('dialog.subscribeFiles.fileColumn'), key: 'file_path', sortable: true },
]

// 媒体库文件表头
const libraryHeaders = [
  { title: t('dialog.subscribeFiles.episodeColumn'), key: 'episode_number', sortable: true },
  { title: t('dialog.subscribeFiles.fileColumn'), key: 'file_path', sortable: true },
]

// 调用API查询订阅文件信息
async function loadSubscribeFilesInfo() {
  try {
    loading.value = true
    subScribeInfo.value = await api.get(`subscribe/files/${props.subid}`)
  } catch (e) {
    console.log(e)
  } finally {
    loading.value = false
  }
}

// 计算下载文件列表
const downloadInfos = computed(() => {
  return Object.keys(subScribeInfo.value?.episodes ?? {}).map((key: any) => {
    const item = subScribeInfo.value?.episodes[key]
    return {
      episode_number: key,
      title: item?.title,
      download: item?.download ?? [],
    }
  })
})

// 总集数
const totalCount = computed(() => {
  return Object.keys(subScribeInfo.value?.episodes ?? {}).length
})

// 计算媒体库文件列表
const libraryInfos = computed(() => {
  return Object.keys(subScribeInfo.value?.episodes ?? {}).map((key: any) => {
    const item = subScribeInfo.value?.episodes[key]
    return {
      episode_number: key,
      title: item?.title,
      library: item?.library ?? [],
    }
  })
})

onBeforeMount(() => {
  loadSubscribeFilesInfo()
})
</script>
<template>
  <VDialog scrollable max-width="80rem" :fullscreen="!display.smAndUp.value">
    <VCard>
      <VCardItem class="my-2">
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <LoadingBanner v-if="loading" />
      <VCardText v-else>
        <div class="media-page">
          <div class="media-header">
            <div class="media-poster">
              <VImg
                :src="subScribeInfo?.subscribe?.poster"
                cover
                class="object-cover aspect-w-2 aspect-h-3 ring-1 ring-gray-500"
              >
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                  </div>
                </template>
              </VImg>
            </div>
            <div class="media-title">
              <h1 class="d-flex flex-column flex-lg-row align-baseline justify-center justify-lg-start">
                <div class="align-self-center align-self-lg-end">
                  {{ subScribeInfo?.subscribe?.name }}
                </div>
                <div v-if="subScribeInfo?.subscribe?.season" class="text-lg align-self-center align-self-lg-end ms-3">
                  {{ t('dialog.subscribeFiles.season', { number: subScribeInfo?.subscribe?.season }) }}
                </div>
              </h1>
              <div>{{ subScribeInfo?.subscribe?.year }}</div>
              <div class="media-overview">
                <div class="media-overview-left">
                  <p>{{ subScribeInfo?.subscribe?.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-7">
          <VTabs v-model="activeTab" show-arrows class="v-tabs-pill">
            <VTab value="download" selected-class="v-slide-group-item--active v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-download" />
                {{ t('dialog.subscribeFiles.downloadTab') }}
              </div>
            </VTab>
            <VTab value="library" selected-class="v-slide-group-item--active v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-filmstrip-box-multiple" />
                {{ t('dialog.subscribeFiles.libraryTab') }}
              </div>
            </VTab>
          </VTabs>
          <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
            <VWindowItem value="download">
              <transition name="fade-slide" appear>
                <div>
                  <VDataTable
                    items-per-page="50"
                    :headers="downloadHeaders"
                    :items="downloadInfos"
                    :items-length="totalCount"
                    density="compact"
                    item-value="title"
                    return-object
                    fixed-header
                    hover
                    :items-per-page-text="t('dialog.subscribeFiles.itemsPerPage')"
                    :page-text="t('dialog.subscribeFiles.pageText')"
                    :loading-text="t('dialog.subscribeFiles.loadingText')"
                  >
                    <template #item.episode_number="{ item }">
                      <div class="text-high-emphasis pt-1">{{ item.episode_number }}. {{ item.title }}</div>
                    </template>
                    <template #item.torrent_title="{ item }">
                      <div class="text-xs" v-for="file in item.download">
                        【{{ file.site_name }}】{{ file.torrent_title }}
                      </div>
                    </template>
                    <template #item.file_path="{ item }">
                      <div class="text-xs" v-for="file in item.download">{{ file.file_path }}</div>
                    </template>
                    <template #no-data> {{ t('dialog.subscribeFiles.noData') }} </template>
                  </VDataTable>
                </div>
              </transition>
            </VWindowItem>
            <VWindowItem value="library">
              <transition name="fade-slide" appear>
                <div>
                  <VDataTable
                    items-per-page="50"
                    :headers="libraryHeaders"
                    :items="libraryInfos"
                    :items-length="totalCount"
                    density="compact"
                    item-value="title"
                    return-object
                    fixed-header
                    hover
                    :items-per-page-text="t('dialog.subscribeFiles.itemsPerPage')"
                    :page-text="t('dialog.subscribeFiles.pageText')"
                    :loading-text="t('dialog.subscribeFiles.loadingText')"
                  >
                    <template #item.episode_number="{ item }">
                      <div class="text-high-emphasis pt-1">{{ item.episode_number }}. {{ item.title }}</div>
                    </template>
                    <template #item.file_path="{ item }">
                      <div class="text-xs" v-for="file in item.library">{{ file.file_path }}</div>
                    </template>
                    <template #no-data> {{ t('dialog.subscribeFiles.noData') }} </template>
                  </VDataTable>
                </div>
              </transition>
            </VWindowItem>
          </VWindow>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.vue-media-back {
  background-image: linear-gradient(
      180deg,
      rgba(var(--v-theme-background), 0) 50%,
      rgba(var(--v-theme-background), 1) 100%
    ),
    linear-gradient(90deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%),
    linear-gradient(270deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%);
  box-shadow: 0 0 0 2px rgb(var(--v-theme-background));
  margin-block-start: calc(-70px - env(safe-area-inset-top));
}

.media-page {
  position: relative;
  background-position: 50%;
  background-size: cover;
  margin-block-start: calc(-4rem - env(safe-area-inset-top));
  padding-block-start: calc(4rem + env(safe-area-inset-top));
  padding-inline: 1rem;
}

.media-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-block-start: 1rem;
}

@media (width >= 1280px) {
  .media-header {
    flex-direction: row;
    align-items: flex-end;
  }
}

.media-overview {
  display: flex;
  flex-direction: column;
  padding-block: 1rem;
}

@media (width >= 1024px) {
  .media-overview {
    flex-direction: row;
  }
}

.media-poster {
  overflow: hidden;
  border-radius: 0.25rem;
  box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
  inline-size: 8rem;

  --tw-shadow: 0 1px 3px 0 rgba(0, 0, 0, 10%), 0 1px 2px -1px rgba(0, 0, 0, 10%);
  --tw-shadow-colored: 0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color);
}

@media (width >= 1280px) {
  .media-poster {
    inline-size: 13rem;
    margin-inline-end: 1rem;
  }
}

@media (width >= 768px) {
  .media-poster {
    border-radius: 0.5rem;
    box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
    inline-size: 11rem;

    --tw-shadow: 0 25px 50px -12px rgba(0, 0, 0, 25%);
    --tw-shadow-colored: 0 25px 50px -12px var(--tw-shadow-color);
  }
}

.media-title {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  margin-block-start: 1rem;
  text-align: center;
}

@media (width >= 1280px) {
  .media-title {
    margin-block-start: 0;
    margin-inline-end: 1rem;
    text-align: start;
  }
}

.media-title > h1 {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;
}

@media (width >= 1280px) {
  .media-title > h1 {
    font-size: 2.25rem;
    line-height: 2.5rem;
  }
}
</style>
