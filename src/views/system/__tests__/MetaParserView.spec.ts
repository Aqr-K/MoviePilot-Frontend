import type { MetaParserPipeline, MetaParserRing } from '@/api/types'
import MetaParserView from '@/views/system/MetaParserView.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: mocks.toastSuccess }),
}))

// vuedraggable 在 jsdom 下依赖真实拖拽事件，替换为可手动触发换位的桩以便断言排序载荷。
vi.mock('vuedraggable', () => ({
  default: {
    name: 'DraggableStub',
    props: ['modelValue'],
    emits: ['end', 'update:modelValue'],
    methods: {
      reverseOrder(this: { $emit: (event: string, ...args: unknown[]) => void; modelValue: unknown[] }) {
        this.$emit('update:modelValue', [...this.modelValue].reverse())
        this.$emit('end')
      },
    },
    template: `
      <div>
        <button type="button" data-testid="stub-reorder" @click="reverseOrder"></button>
        <template v-for="(element, index) in modelValue" :key="element.parser">
          <slot name="item" :element="element" :index="index" />
        </template>
      </div>
    `,
  },
}))

function createRing(overrides: Partial<MetaParserRing> = {}): MetaParserRing {
  return {
    configured: true,
    distribution: 'market',
    enabled: true,
    extension_id: 'AIMetaPlugin',
    instance_id: 'default',
    name: 'LLM 识别',
    order: 1,
    owner: 'AIMetaPlugin',
    parser: 'AIMetaPlugin#llm',
    parser_id: 'llm',
    pinned: false,
    priority: 0,
    ...overrides,
  }
}

const builtinRing: MetaParserRing = {
  configured: false,
  distribution: 'builtin',
  enabled: true,
  extension_id: null,
  instance_id: null,
  name: '内建识别',
  order: 0,
  owner: null,
  parser: 'builtin',
  parser_id: 'builtin',
  pinned: true,
  priority: 0,
}

function createPipeline(rings: MetaParserRing[]): MetaParserPipeline {
  return { rings }
}

beforeEach(() => {
  mocks.apiGet.mockReset()
  mocks.apiPost.mockReset()
  mocks.toastSuccess.mockReset()
})

describe('MetaParserView', () => {
  it('按生效顺序展示解析环，并标注宿主固定的内建环', async () => {
    mocks.apiGet.mockResolvedValue(
      createPipeline([builtinRing, createRing(), createRing({ name: '正则识别', order: 2, parser: 'RegexPlugin#re' })]),
    )

    await renderWithProviders(MetaParserView)

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('metaparser/pipeline'))
    await screen.findByText('内建识别')
    expect(screen.getByText('固定')).toBeTruthy()
    expect(screen.getByText('由宿主固定执行，无法排序或停用')).toBeTruthy()
    // 拖拽列表是异步组件，等待其解析后再断言扩展环。
    await screen.findByText('LLM 识别')
    expect(screen.getByText('正则识别')).toBeTruthy()
  })

  it('未被用户排过的解析环标记为默认顺序', async () => {
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing, createRing({ configured: false })]))

    await renderWithProviders(MetaParserView)

    await screen.findByText('LLM 识别')
    expect(screen.getByText('默认顺序')).toBeTruthy()
  })

  it('没有扩展提供解析环时展示空态', async () => {
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing]))

    await renderWithProviders(MetaParserView)

    await screen.findByText('暂无扩展提供的解析环')
  })

  it('启停解析环时按标识提交，并按返回结果重绘', async () => {
    const disabledRing = createRing({ enabled: false })
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing, createRing()]))
    mocks.apiPost.mockResolvedValue(createPipeline([builtinRing, disabledRing]))

    const { container } = await renderWithProviders(MetaParserView)

    await screen.findByText('LLM 识别')
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(toggle).toBeTruthy()
    toggle!.click()

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('metaparser/toggle', {
        enabled: false,
        parser: 'AIMetaPlugin#llm',
      }),
    )
    await waitFor(() => expect(toggle!.checked).toBe(false))
  })

  it('拖拽结束后提交整份顺序，内建环不参与提交', async () => {
    const second = createRing({ name: '正则识别', order: 2, parser: 'RegexPlugin#re' })
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing, createRing(), second]))
    mocks.apiPost.mockResolvedValue(createPipeline([builtinRing, { ...second, order: 1 }, createRing({ order: 2 })]))

    await renderWithProviders(MetaParserView)

    await screen.findByText('正则识别')
    screen.getByTestId('stub-reorder').click()

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('metaparser/order', [
        { enabled: true, parser: 'RegexPlugin#re' },
        { enabled: true, parser: 'AIMetaPlugin#llm' },
      ]),
    )
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
  })

  it('顺序未变化时不提交写入请求', async () => {
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing, createRing()]))

    await renderWithProviders(MetaParserView)

    await screen.findByText('LLM 识别')
    // 单个解析环反转后位置不变，等同于原位放下。
    screen.getByTestId('stub-reorder').click()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(1))
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('保存顺序失败时回退到服务端确认过的顺序', async () => {
    const second = createRing({ name: '正则识别', order: 2, parser: 'RegexPlugin#re' })
    mocks.apiGet.mockResolvedValue(createPipeline([builtinRing, createRing(), second]))
    mocks.apiPost.mockRejectedValue(new Error('内建识别环由宿主固定执行，无法排定顺序'))

    await renderWithProviders(MetaParserView)

    await screen.findByText('正则识别')
    screen.getByTestId('stub-reorder').click()

    // 失败后重新拉取管道，界面不保留未落盘的拖拽结果。
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
