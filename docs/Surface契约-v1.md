# 插件列表 Surface 契约 v1

> 目的：让「插件管理增强」这类**插件列表装饰器**（改名/简介、标签、图标、排序、批量、添加到分身……）
> 能识别并接管**任意页面上的插件列表**，而不依赖任何 hash 类名或 nth-child。
>
> 本契约是 `@local/dsh-plugin-manager-plus` 与其它面板（首个实现方：分身管理的「插件」子页，
> 即 `@local/dsh-instance-manager`）之间的公共接口。未来独立开发的「插件管理插件」也消费同一契约。
>
> 版本：v1（`data-plugin-surface-version="1"`）。只增不改：v1 内的属性名、取值、语义冻结；
> 新增能力用新属性名或把 `version` 升到 1.x（向后兼容），破坏性变更才升到 2。

---

## 1. 角色

| 角色 | 职责 |
|---|---|
| **Surface（宿主页面）** | 在自己的 DOM 上声明「这里是一个插件列表」+ 每张卡片是什么、标题/简介/图标/操作区在哪、自己支持哪些增强能力。**不依赖装饰器存在**。 |
| **Enhancer（装饰器）** | 只读契约属性 + 写文本/style/data 标记；不移动、不重建、不改宿主 className；宿主重渲染后可重放。 |
| **Authority（数据权威）** | 每个增强能力的数据仍归 Enhancer 自己的 host（例如标签/覆盖/顺序存在 `plugin-manager-plus` 的 state.json；「插件是否在某个分身里」归分身管理）。Surface 只负责展示。 |

装饰器**不得**假定 Surface 的实现框架（React/Vue/原生 DOM），也**不得**要求 Surface 为它加事件回调——一切通过属性与 DOM。

---

## 2. 根节点（必需）

```html
<section
  data-plugin-surface="instance"          <!-- 表面 id：小写、短横线；native 保留给原生插件页 -->
  data-plugin-surface-version="1"        <!-- 契约版本 -->
  data-plugin-caps="rename desc tags icon search clone"
  data-plugin-scope="instance:inst-1a2b" <!-- 作用域：global | instance:<id>（可选，默认 global） -->
>
```

* `data-plugin-surface`：**必需**。装饰器用它挑选表面、区分动作语义。
* `data-plugin-surface-version`：**必需**，v1 一律 `"1"`。装饰器遇到未知版本→只读不写（降级）。
* `data-plugin-caps`：**必需**，空格分隔的能力白名单。装饰器**只能**执行列出的能力；未列出即视为「不支持」，一律不渲染该入口（而不是渲染后禁用）。
* `data-plugin-scope`：可选。用于区分同一类表面的不同实例（例如不同分身）。装饰器不得据此改写数据主键（v1 标签/覆盖仍按包名全局生效），仅用于文案。

**原生插件页**是隐式表面：`[data-plugin-panel]` 等价于
`data-plugin-surface="native"`、`version=1`、`caps="rename desc tags icon order batch uninstall install-guard search clone"`、`scope=global`。
即原生页无需改任何代码，装饰器对它保持现状。

---

## 3. 列表与卡片（必需）

* 列表容器：`[data-plugin-list]`（可选）。缺失时装饰器取「包含卡片的最近公共父节点」。
* 卡片根：`[data-plugin-package="<npm 包名>"]`（包卡）或 `[data-plugin-item="<条目 id>"]`（条目卡）。
  * 与原生插件页**同名复用**，装饰器无需新选择器即可识别身份。
  * 同一表面内 key 唯一。
* 卡片内部槽位（推荐全部标注；缺失时装饰器按原生结构回退）：

| 属性 | 放在哪个元素 | 语义 | 缺失时回退 |
|---|---|---|---|
| `data-plugin-title` | 可写文本节点（建议就是承载名称的元素） | 显示名称的**唯一权威文本节点**；装饰器改它的名称文本。若卡片是「标题块 + 简介块」堆叠布局（没有标题行），装饰器会把 `[data-pmod-orig]` 小字**内联**追加进该元素（`aria-hidden`），因此宿主不要假设它的 `textContent` 恒等于名称 | 卡内第一个文本非空的 `button`；再不行取 `[data-plugin-package]` 后的第一个标题样式元素 |
| `data-plugin-desc` | 描述文本元素 | 简介文本节点；只在有 `desc` 能力时被改写 | 原生 `div.cardMain` 中 `titleRow` 之后的第一个子节点 |
| `data-plugin-icon` | 图标容器（48×48 建议） | 装饰器把覆盖图标插入/替换于此容器内，并自行还原 | 原生 `li > div.cardHead > span.cardIcon` |
| `data-plugin-actions` | 行内操作区容器 | 仅作布局参考：装饰器不在其中插入入口（入口走右键菜单/工具栏） | 不适用 |
| `data-plugin-status` | 卡片根 | `running｜disabled｜problem`（原生已有） | 视为 unknown |
| `data-plugin-kind` | 卡片根 | `package｜item`（可选） | 由 `data-plugin-package`/`data-plugin-item` 推断 |

**约束**：
* `data-plugin-title` 元素内只放名称文本；不要把 tag、开关等塞进同一个元素（否则装饰器改写名称会丢内容）。
* 建议把标题放进一个 **标题行** 容器并声明 `data-plugin-title-row`：该容器必须真是横向排布（例如 `display:flex; flex-direction:row; align-items:baseline; gap:8px`）。这样原名小字会作为标题的兄弟插在该行内，标题元素本身保持纯名称。**把 `data-plugin-title-row` 打在纵向（column）容器上会让小字再占一行**（外观与 v0.5.2 修复前的三行 bug 相同），此时宁可不要声明该属性。
* 没有 `data-plugin-title-row` 的堆叠卡片仍然可用：装饰器自动把原名小字内联进标题，绝不额外占一行（v0.5.2 / BUG-V5-2）。
* 布局允许在运行中切换（加/去 `data-plugin-title-row`、重建卡片节点）：装饰器每次 apply 都全卡查找 `[data-pmod-orig]`、只保留一份并按当前布局就位，不会出现两份小字（v0.5.2 / P2-21）。
* 卡片根必须是列表的直接子元素（或至少在重渲染时保持稳定），装饰器用 `style.display` 隐藏卡片、`style.order` 排序，**不移动节点**。
* 图标容器内可放原生图标节点；装饰器覆盖时把其它子节点 `style.display='none'`，还原时恢复。不要依赖图标容器的 `firstElementChild` 作为唯一图标。

---

## 4. 能力（caps）

| 能力 | 含义 | 装饰器行为 | 典型表面 |
|---|---|---|---|
| `search` | 支持文本搜索 | 在列表上方渲染搜索框；名称严格子串、简介模糊（子序列） | 全部 |
| `tags` | 支持用户标签 | 标签筛选 pill、右键「添加标签」、数据写 `pkg:<name>` | 全部 |
| `rename` | 支持改名 | 右键「重命名…」、标题覆盖 + 原名称小字 | 全部 |
| `desc` | 支持改简介 | 重命名弹窗中的简介覆盖（需 `data-plugin-desc`） | native / instance |
| `icon` | 支持换图标 | 右键「更改图标…」、图标库 | 全部（无 `data-plugin-icon` 则自动降级） |
| `clone` | 支持「添加到分身」 | 右键「添加到分身 ▸」与批量入口；经分身管理 HTTP 执行 | native / instance |
| `order` | 支持手动排序 | 「调整顺序」+拖拽、「排序」下拉；写 `li.style.order` | 仅 native（分身子页的目录/已装是两种语义，不排） |
| `batch` | 支持批量操作 | 「批量操作」按钮、全选/完成、批量菜单 | 仅 native（v1） |
| `uninstall` | 支持卸载 | 右键「卸载…」（走本插件 host 的插件管理器 API） | 仅 native |
| `install-guard` | 安装拦截（F1） | 包装 `remote.pluginManager.installBundle` 强制 `enabled:false` | 仅 native |

未列出的能力 → 装饰器不渲染入口、不写数据、不监听。
`search` 与 `tags` 独立：只有 `tags` 时仍渲染 pill；只有 `search` 时只渲染搜索框。

---

## 5. 分组（可选）

原生页用 `section[data-plugin-group="basic|extensions|bundles|more"]`。其它表面 v1 **不要求分组**：
* 无分组表面：系统标签（内置/实验性/已安装）不渲染；筛选条只显示「全部」+ 用户标签；`more` 语义不存在。
* 若将来需要分组，用同样属性名 `data-plugin-group="<id>"`，并在 `caps` 加 `groups`（v1 未定义，遇到即忽略）。

---

## 6. 数据与事件

* 装饰器数据（标签、覆盖、顺序、seen、图标）**只**写自己的 host：`DSH_HOME/plugin-manager-plus/state.json`，按包名/条目 id 为键，跨表面共享（同一包名在原生页与分身页显示同一个自定义名称/简介/图标/标签）。
* 分身成员关系以分身管理为权威：装饰器只读（`GET /plugins/instance-manager/state`、`GET /plugins/instance-manager/instance-plugins?id=<id>`），写只通过 `POST /plugins/instance-manager/add-plugin` / `remove-plugin`。
* 无跨插件事件（DSH 的 `ctx.remote.$on` 白名单不含第三方事件），装饰器对分身管理用 **HTTP + 缓存轮询**；对自身状态用 2.5s 轮询 + `focus/visibilitychange`。
* 表面重渲染：装饰器通过 body `MutationObserver` + 1.5s tick + rAF 重放；Surface 不需要通知装饰器。装饰器必须幂等（同值不写、标记用 `data-pmod-*`）。

---

## 7. 降级与自检

* 根节点缺失 `data-plugin-surface`/`version`/`caps` → 装饰器对该区域不做任何事。
* `version` 不是 `1` → 只读（可显示"表面契约版本不受支持"的 console.warn），不写 DOM。
* 锚点缺失（如没有 `data-plugin-title` 也找不到可写标题）→ 该卡跳过并 `console.warn('[plugin-manager-plus] surface card without title anchor', key)`；**不得**猜测类名。
* 装饰器被禁用/卸载 → 必须完全还原：文本、`aria-label`、图标槽、`style.order`、`style.display`、`data-pmod-*`、注入的 style 标签与所有监听器/定时器。

---

## 8. 一个最小的合规表面（示例）

```html
<section data-plugin-surface="instance"
         data-plugin-surface-version="1"
         data-plugin-caps="rename desc tags icon search clone"
         data-plugin-scope="instance:inst-1a2b">
  <ul data-plugin-list>
    <li class="im-plugin-row" data-plugin-package="billion-context" data-plugin-kind="package">
      <span class="im-plugin-icon" data-plugin-icon>…</span>
      <div class="im-plugin-main">
        <div class="im-plugin-name" data-plugin-title>billion-context</div>
        <div class="im-plugin-desc" data-plugin-desc>A context-compression plugin…</div>
      </div>
      <div class="im-plugin-actions" data-plugin-actions>…</div>
    </li>
  </ul>
</section>
```

装饰器在这块 DOM 上能做的：改名/改简介/换图标/打标签/搜索/通过右键「添加到分身」把插件加进其它分身；
**不能**：排序、批量、卸载、F1 拦截（caps 未声明）。

---

## 9. 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-11-02 | 首版：surface 根 + caps + 卡片槽位 + 原生页隐式表面 + 分身联动 HTTP 约定 |
