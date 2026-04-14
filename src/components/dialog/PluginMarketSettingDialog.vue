<script lang="ts" setup>
import api from '@/api'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()
const $toast = useToast()

// 插件仓库设置字符串
const repoString = ref('')
// 用于显示的仓库地址数组
const repoArray = ref<string[]>([])
// 是否纳入插件预发布版本（PLUGIN_INCLUDE_PRERELEASE）
const includePrerelease = ref(false)

// 计算属性：在数组和换行符分隔的字符串之间转换
const displayRepos = computed({
  get: () => repoArray.value.join('\n'),
  set: (value: string) => {
    repoArray.value = value.split('\n').filter((repo: string) => repo.trim() !== '')
  },
})

// 定义事件
const emit = defineEmits(['save', 'close'])

// 查询已设置的插件仓库
async function queryMarketRepoSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/PLUGIN_MARKET')
    if (result && result.data && result.data.value) {
      repoString.value = result.data.value
      repoArray.value = result.data.value.split(',').filter((repo: string) => repo.trim() !== '')
    }
  } catch (error) {
    console.log(error)
  }
}

// 查询预发布开关
async function queryPrereleaseSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/PLUGIN_INCLUDE_PRERELEASE')
    includePrerelease.value = result?.data?.value === true || result?.data?.value === 'true'
  } catch (error) {
    console.log(error)
  }
}

// 保存设置
async function saveHandle() {
  try {
    // 将数组转换为逗号分隔的字符串
    const repoStringToSave = repoArray.value.join(',')
    const result: { [key: string]: any } = await api.post('system/setting/PLUGIN_MARKET', repoStringToSave)
    // 同步保存预发布开关；失败不阻断主流程
    try {
      await api.post('system/setting/PLUGIN_INCLUDE_PRERELEASE', includePrerelease.value)
    } catch (e) {
      console.log(e)
    }

    if (result.success) {
      $toast.success(t('dialog.pluginMarketSetting.saveSuccess'))
      emit('save')
    } else $toast.error(t('dialog.pluginMarketSetting.saveFailed', { message: result?.message }))
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  queryMarketRepoSetting()
  queryPrereleaseSetting()
})
</script>

<template>
  <VDialog width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-store-cog" class="me-2" />
          {{ t('dialog.pluginMarketSetting.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText class="pt-2">
        <VTextarea
          v-model="displayRepos"
          :placeholder="t('dialog.pluginMarketSetting.repoPlaceholder')"
          :hint="t('dialog.pluginMarketSetting.repoHint')"
          persistent-hint
          auto-grow
        />
        <VSwitch
          v-model="includePrerelease"
          class="mt-4"
          label="显示并允许安装插件预发布版本 (pre_release)"
          hint="仅对采用 Aqr-K 清单格式 (release / pre_release) 的仓库生效；已安装预发布版本时，更新提示按语义化版本比较，失败则回退字符串不等。"
          persistent-hint
          color="warning"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn @click="saveHandle" prepend-icon="mdi-content-save-check" class="px-5 me-3">
          {{ t('dialog.pluginMarketSetting.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
