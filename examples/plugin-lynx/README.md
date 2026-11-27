# Lynx 插件数据页

本示例用 ReactLynx 编写页面，通过 MoviePilot 插件的 `get_page()` 提供给三端 App。页面通过 `useInitData()` 读取当前实例的数据，点击标题可展开详情。

## 构建与发布

构建目标是 Lynx 3.6，以覆盖鸿蒙 API 12。使用 Node.js 24 和 Yarn 1 在本目录运行以下命令。

```sh
yarn install --frozen-lockfile
yarn build
```

将 `dist/main.lynx.bundle` 和 `lynx_page.py` 放在 Python 插件的 `__init__.py` 旁，保留插件原有的 `vuetify` 渲染模式。在插件类中返回数据页：

```python
from pathlib import Path
from .lynx_page import lynx_page

def get_page(self):
    data = {"title": "最近同步", "details": "本次同步了 12 条记录"}
    return lynx_page(
        Path(__file__).with_name("main.lynx.bundle"),
        data,
        [{"component": "VCard", "props": {"title": data["title"]},
          "content": [{"component": "span", "text": data["details"]}]}],
    )
```

浏览器和旧版 App 渲染 `content`。支持 Lynx 插件数据页的 App 从同一份已鉴权页面响应取得模板与 `initialData`。版本 1 支持单个自包含 bundle，大小上限为 1 MiB。图片、字体等静态依赖请内联，示例通过 `useState()` 管理展开状态。此入口提供插件传入的 JSON 数据；现有 Vue 插件通过 `hostSdk` 调用的设备能力仍由联邦宿主提供。

## Vue 插件双产物

对于 `render_mode = "vue"` 的插件，Web 与 App 可以共用一份 Vue 单文件组件。在 Vite 配置中，把同一个 `exposes` 对象交给模块联邦和 `lynxPluginPages({ exposes, navKeys })`。一次 Vite 构建生成 `dist/assets/remoteEntry.js`、`dist/lynx/manifest.json` 及按 SHA-256 命名的 Lynx bundle。将整个 `dist` 放入 Python 插件目录。构建示例见 [Vite 配置](fixtures/vite.config.js)。

计数和提醒开关示例分别使用 Vue 的 `ref` 和 `v-model`，两者都从 `initialConfig` 读取当前物理实例的配置，通过 `emit('save', 完整配置对象)` 提交。完成仓库根目录和本目录的 Yarn 依赖安装后，在本目录运行以下命令。

```sh
yarn build:fixtures
```

清单中的 `entries` 列出实际导出的 `Config`、`Page`、`Dashboard`、`AppPage` 等入口，`navKeys` 把命名导航映射到导出名，如 `{"settings":"Config"}`。页面可发送 `close`、`switch` 和 `navigate` 事件，`navigate` 的参数是清单中的导航键。清单版本和宿主控件 ABI 的首个版本均为 1。

控件随 App 分发。每个插件 bundle 提供 Vue 组件工厂，宿主注入 Vue 运行时和当前实例数据。版本 1 支持卡片、卡片标题与正文、行列布局、按钮的点击与禁用、开关的标签与双向绑定，以及 `div`、`p`、`span`、插值与条件渲染。请按构建器给出的文件、行、列修正不支持的标签、指令、样式或浏览器 API。App 会在成功加载后缓存经过摘要校验的插件代码。离线时可重开已缓存的页面，配置保存需要连接实例。
