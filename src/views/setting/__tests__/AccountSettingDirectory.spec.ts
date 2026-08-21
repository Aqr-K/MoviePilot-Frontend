import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
    delete: mocks.apiDelete,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/components/cards/DirectoryCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'DirectoryCardStub',
      props: { directory: { type: Object, required: true } },
      emits: ['close', 'update:modelValue'],
      template: `
      <section :aria-label="'directory-' + directory.name">
        <span>{{ directory.name }}</span>
        <button :aria-label="'rename-' + directory.name" @click="directory.name = '目录1'">rename</button>
        <button :aria-label="'remove-' + directory.name" @click="$emit('close')">remove</button>
        <button
          :aria-label="'paths-' + directory.name"
          @click="directory.download_path = '/new-download'; directory.library_path = '/new-library'"
        >paths</button>
      </section>
    `,
    }),
  }
})

vi.mock('@/components/cards/StorageCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'StorageCardStub',
      props: { storage: { type: Object, required: true } },
      emits: ['close', 'done', 'edit'],
      template: `
      <section :aria-label="'storage-' + storage.name">
        <span>{{ storage.name }}</span>
        <button :aria-label="'remove-' + storage.name" @click="$emit('close')">remove</button>
        <button :aria-label="'reload-' + storage.name" @click="$emit('done')">done</button>
        <button :aria-label="'edit-' + storage.name" @click="$emit('edit', storage)">edit</button>
      </section>
    `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue', 'end'],
      setup(props, { emit, slots }) {
        const reverse = () => {
          emit('update:modelValue', [...props.modelValue].reverse())
          emit('end')
        }
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h('button', { 'aria-label': `reverse-${items[0]?.name ?? 'empty'}`, onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: { value: { type: String, default: '' } },
  emits: ['update:value'],
  template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
})

// 服务实例配置端点下发的形状：宿主载荷装在 host_config 里，凭据已掩码
const storagesFixture = [
  {
    capability: 'storage',
    name: '本地存储',
    type: 'local',
    enabled: true,
    config: {},
    host_config: { bare_token_target: true },
    is_default_target: true,
    provider: '__builtin__',
    masked_fields: [],
    type_available: true,
    type_name: '本地',
  },
  {
    capability: 'storage',
    name: '自定义存储 1',
    type: 'custom1',
    enabled: true,
    config: {},
    host_config: { bare_token_target: true },
    is_default_target: false,
    provider: '__builtin__',
    masked_fields: [],
    type_available: true,
    type_name: '自定义',
  },
]

// 扩展声明的存储类型；内建类型不在登记表里，故此处只有一条
const storageTypesFixture = [
  {
    capability: 'storage',
    type: 'p123',
    name: '123网盘',
    icon: null,
    multi_instance: false,
    config_form_available: false,
    config_schema: null,
    provider: 'P123Helper',
    distribution: 'plugin',
  },
]

const directoriesFixture = [
  {
    name: '目录1',
    storage: 'local',
    download_path: '/downloads/a',
    library_path: '/media/a',
    priority: 8,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  },
  {
    name: '目录3',
    storage: 'local',
    download_path: '/downloads/b',
    library_path: '/media/b',
    priority: 2,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  },
]

function mockLoadedSettings(options: { mountedDisk?: boolean | null } = {}) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Directories')
      return { data: { value: structuredClone(directoriesFixture) } }
    if (endpoint === 'service/configs/storage') return structuredClone(storagesFixture)
    if (endpoint === 'service/types/storage') return structuredClone(storageTypesFixture)
    if (endpoint === 'media/category') return { 电影: ['华语'] }
    if (endpoint === 'system/env') {
      return {
        success: true,
        data: {
          MOVIE_RENAME_FORMAT: '{{ title }}',
          TV_RENAME_FORMAT: '{{ name }}',
          MUSIC_RENAME_FORMAT: '{{ artist }}',
          UNRELATED: 'ignored',
        },
      }
    }
    if (endpoint === 'system/setting/MountedLocalDiskDeleteEmptyDirs') {
      return { data: { value: options.mountedDisk ?? null }, success: true }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockResolvedValue({ success: true })
  mocks.apiPut.mockResolvedValue({ success: true })
  mocks.apiDelete.mockResolvedValue({ success: true })
}

async function renderDirectorySettings() {
  return renderWithProviders(AccountSettingDirectory, {
    global: { stubs: { VAceEditor: AceEditorStub } },
  })
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getRenameEditors() {
  return screen.getAllByRole('textbox').filter(element => element.tagName === 'TEXTAREA')
}

describe('AccountSettingDirectory', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.apiDelete.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mockLoadedSettings()
  })

  it('loads owned values, keeps the mounted-disk default, and follows active refresh state', async () => {
    const { rerender } = await renderDirectorySettings()

    expect(await screen.findByText('目录1')).toBeInTheDocument()
    expect(screen.getByText('目录3')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '挂载盘删除空目录' })).toBeChecked()
    expect(getRenameEditors().map(input => (input as HTMLTextAreaElement).value)).toEqual([
      '{{ title }}',
      '{{ artist }}',
      '{{ name }}',
    ])

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(computed(() => refreshOptions.active.value).value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('adds a non-conflicting directory name, updates paths, and saves current priority order', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')
    const directoryCard = getCard('目录')
    const actionButtons = directoryCard.getAllByRole('button')
    await user.click(actionButtons.at(-2)!)

    expect(screen.getByText('目录4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'paths-目录1' }))
    await user.click(screen.getByRole('button', { name: 'reverse-目录1' }))
    await user.click(directoryCard.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Directories', [
        expect.objectContaining({ name: '目录4', priority: 0 }),
        expect.objectContaining({ name: '目录3', priority: 1 }),
        expect.objectContaining({
          name: '目录1',
          priority: 2,
          download_path: '/new-download',
          library_path: '/new-library',
        }),
      ])
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('目录设置保存成功')
  })

  it('blocks duplicate directory names before the API call', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')
    await user.click(screen.getByRole('button', { name: 'rename-目录3' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/setting/Directories', expect.anything())
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复目录名称！无法保存，请修改！')
  })

  it('removes a directory as a whole collection but a storage instance on its own endpoint', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')

    await user.click(screen.getByRole('button', { name: 'remove-目录1' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Directories', [
      expect.objectContaining({ name: '目录3', priority: 0 }),
    ])

    // 存储改成逐条删除：只动这一行，同族其余配置不进请求体
    await user.click(screen.getByRole('button', { name: 'remove-自定义存储 1' }))
    await waitFor(() => {
      expect(mocks.apiDelete).toHaveBeenCalledWith('service/configs/storage/custom1', {
        params: { name: '自定义存储 1' },
      })
    })
    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/setting/Storages', expect.anything())
  })

  it('offers a storage type again once it is configured, because a type may hold several instances', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('自定义存储 1')
    await user.click(screen.getByRole('button', { name: '添加实例' }))

    // 已配置过的类型仍然可选：一个存储类型可以配多份实例
    expect(await screen.findByText('本地', { selector: '.v-list-item-title' })).toBeInTheDocument()
    await user.click(screen.getByText('自定义', { selector: '.v-list-item-title' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('service/configs/storage', {
        name: 'custom3',
        type: 'custom3',
        enabled: false,
        config: {},
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存')
  })

  it('hides a single-instance type once it already has a configuration', async () => {
    const user = userEvent.setup()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'service/types/storage') return structuredClone(storageTypesFixture)
      if (endpoint === 'service/configs/storage')
        return [{ ...structuredClone(storagesFixture[0]), type: 'p123', name: '123网盘' }]
      if (endpoint === 'system/setting/public/Directories') return { data: { value: [] } }
      if (endpoint === 'media/category') return {}
      if (endpoint === 'system/env') return { success: true, data: {} }
      return { data: { value: null }, success: true }
    })
    await renderDirectorySettings()
    await screen.findByText('123网盘')
    await user.click(screen.getByRole('button', { name: '添加实例' }))

    // multi_instance 为 false 的类型只接受一份配置，配过之后不再给出新增入口
    await screen.findByText('本地', { selector: '.v-list-item-title' })
    expect(screen.queryByText('123网盘', { selector: '.v-list-item-title' })).not.toBeInTheDocument()
  })

  it('saves the instance shell through the config endpoint and the default target through its own', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('自定义存储 1')

    await user.click(screen.getByRole('button', { name: 'edit-自定义存储 1' }))
    const [, , handlers] = mocks.openSharedDialog.mock.calls.at(-1) as [
      unknown,
      unknown,
      Record<string, (payload: unknown) => Promise<void>>,
    ]
    await handlers.done({
      type: 'custom1',
      name: '改名后的存储',
      config: {},
      bare_token_target: false,
      default: true,
    })

    // 实例名与裸令牌承接随配置写入，默认调用目标另走专用端点，两者互不换算
    expect(mocks.apiPut).toHaveBeenCalledWith(
      'service/configs/storage/custom1',
      expect.objectContaining({ name: '改名后的存储', bare_token_target: false }),
      { params: { name: '自定义存储 1' } },
    )
    expect(mocks.apiPut.mock.calls[0][1]).not.toHaveProperty('default')
    expect(mocks.apiPut).toHaveBeenCalledWith('service/default_target/storage/custom1', undefined, {
      params: { name: '改名后的存储' },
    })
  })

  it('converts cleared rename formats to null and requires both organization saves to succeed', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('整理 & 刮削')
    for (const editor of getRenameEditors()) await fireEvent.update(editor, '')
    await user.click(screen.getByRole('checkbox', { name: '挂载盘删除空目录' }))
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/env', {
        SCRAP_SOURCE: 'themoviedb',
        MOVIE_RENAME_FORMAT: null,
        TV_RENAME_FORMAT: null,
        MUSIC_RENAME_FORMAT: null,
      })
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/MountedLocalDiskDeleteEmptyDirs', false)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('整理选项设置保存成功')

    mocks.apiPost.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false })
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理选项设置保存失败！'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('reports HTTP failures for storage, directory, and organization saves', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    mocks.apiDelete.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'remove-自定义存储 1' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除配置失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: '添加实例' }))
    await user.click(await screen.findByText('自定义', { selector: '.v-list-item-title' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('新增配置失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('目录设置保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理选项设置保存失败！'))
  })

  it('opens the shared category editor and reloads storage data after a card completes', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('本地存储')
    const directoryCard = getCard('目录')
    await user.click(directoryCard.getByRole('button', { name: '分类策略' }))
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()

    const initialStorageLoads = mocks.apiGet.mock.calls.filter(([url]) => url === 'service/configs/storage').length
    await user.click(screen.getByRole('button', { name: 'reload-本地存储' }))
    await waitFor(() => {
      expect(mocks.apiGet.mock.calls.filter(([url]) => url === 'service/configs/storage')).toHaveLength(
        initialStorageLoads + 1,
      )
    })
  })
})
