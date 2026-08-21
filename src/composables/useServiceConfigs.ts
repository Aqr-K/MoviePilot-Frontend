import { computed, ref, type Ref } from 'vue'
import {
  clearServiceDefaultTarget,
  createServiceConfig,
  deleteServiceConfig,
  fetchServiceConfigs,
  fetchServiceTypes,
  fromServiceInstanceConfig,
  serviceSupportsDefaultTarget,
  setServiceDefaultTarget,
  updateServiceConfig,
  type ServiceInstanceForm,
  type ServiceInstanceShell,
} from '@/api/serviceConfig'
import type { ServiceInstanceConfigInfo, ServiceTypeInfo } from '@/api/types'

/**
 * 一族服务实例配置的读写。
 *
 * 增删改各自走自己的端点、写完即刻生效，页面上不再有「攒一批再整份提交」这一步：
 * 整份提交会让两位管理员同时改不同的配置互相覆盖，而这几族的配置里装着凭据，覆盖回去
 * 的后果是服务连不上。
 */
export function useServiceConfigs<T extends ServiceInstanceShell = ServiceInstanceForm>(capability: string) {
  // 平铺形状的配置列表，与各族配置卡片消费的形状一致；泛型让各族用自己的配置模型
  const configs = ref<T[]>([]) as Ref<T[]>
  // 下发形状的配置列表，留作掩码路径与置位状态的事实源
  const infos = ref<ServiceInstanceConfigInfo[]>([])
  // 扩展声明的服务实例类型目录；内建类型不在其中
  const types = ref<ServiceTypeInfo[]>([])
  const loading = ref(false)

  // 该族有没有默认调用目标，据此决定要不要给出「设为默认」入口
  const supportsDefaultTarget = computed(() => serviceSupportsDefaultTarget(capability))

  // 当前的默认调用目标，没有置位时为 undefined
  const defaultTarget = computed(() => infos.value.find(info => info.is_default_target))

  /** 按身份取该条配置被掩码的字段路径，供表单跳过对掩码的校验。 */
  function maskedFieldsOf(serviceType?: string, name?: string): string[] {
    const info = infos.value.find(item => item.type === serviceType && item.name === name)
    return info?.masked_fields ?? []
  }

  /** 按类型标识取类型目录条目，内建类型查不到即为 undefined。 */
  function typeInfoOf(serviceType?: string): ServiceTypeInfo | undefined {
    return types.value.find(item => item.type === serviceType)
  }

  /**
   * 判断该类型还能不能再加一份配置。
   *
   * 只有登记表知道一个类型能配几份；未登记的类型（内建类型都在此列）一律按可配多份
   * 处理，与后端「声明缺省即多实例」的口径一致。
   */
  function canAddInstance(serviceType: string): boolean {
    const info = typeInfoOf(serviceType)
    if (!info || info.multi_instance) return true
    return !configs.value.some(item => item.type === serviceType)
  }

  /** 读取该族的类型目录与全部实例配置。 */
  async function load() {
    loading.value = true
    try {
      const [typeList, configList] = await Promise.all([
        fetchServiceTypes(capability).catch(() => [] as ServiceTypeInfo[]),
        fetchServiceConfigs(capability),
      ])
      types.value = typeList
      infos.value = configList
      configs.value = configList.map(fromServiceInstanceConfig) as T[]
    } finally {
      loading.value = false
    }
  }

  /** 新增一条配置并刷新列表。 */
  async function addConfig(form: ServiceInstanceShell) {
    await createServiceConfig(capability, form)
    await load()
  }

  /**
   * 更新一条配置并刷新列表。
   *
   * `originalName` 是这条配置改动前的实例名，用于在库里定位那一行；表单上的实例名与它
   * 不同即为改名。凭据字段回传掩码即表示未改动，服务端从库里取回原值。
   */
  async function changeConfig(form: ServiceInstanceShell, originalName: string) {
    const serviceType = form.type ?? ''
    await updateServiceConfig(capability, serviceType, originalName, form)
    await load()
  }

  /** 删除一条配置并刷新列表。 */
  async function removeConfig(form: ServiceInstanceShell) {
    await deleteServiceConfig(capability, form.type ?? '', form.name ?? '')
    await load()
  }

  /**
   * 把一条配置设为该族的默认调用目标，或清除该族的置位。
   *
   * 置位不随配置载荷写入：它受「每族至多一个」的唯一索引管辖，混进配置写入会让一次改
   * 端口号顺带把别人的置位清掉。没有默认调用目标的族直接跳过，后端对该族一律 400 退回。
   */
  async function applyDefaultTarget(form?: ServiceInstanceShell) {
    if (!supportsDefaultTarget.value) return
    if (form) await setServiceDefaultTarget(capability, form.type ?? '', form.name ?? '')
    else await clearServiceDefaultTarget(capability)
    await load()
  }

  return {
    configs,
    infos,
    types,
    loading,
    supportsDefaultTarget,
    defaultTarget,
    maskedFieldsOf,
    typeInfoOf,
    canAddInstance,
    load,
    addConfig,
    changeConfig,
    removeConfig,
    applyDefaultTarget,
  }
}
