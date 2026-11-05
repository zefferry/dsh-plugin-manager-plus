# 插件管理增强 · plugin-manager-plus

给 DSH 原生「插件」页加这些事，全部在展示层完成：

1. **安装不立即启用** —— 通过原生安装入口（含市场一键安装）装好的插件默认处于关闭状态。
2. **标签筛选条** —— 原生 tab 栏下方新增一行横向筛选标签：**全部 / 启用中 / 未启用**（后两个按启用开关自动归类，见 49）+ 自定义标签 + ＋新建。「内置 / 实验性 / 已安装」三个分组标签因原生页面本身已按分区展示，自 v0.9 起不再出现（见 56）。
3. **名称与简介改写** —— 每张卡片可自定义显示名称与简介，新名称以大字显示、原名以小字跟在后面，可随时恢复默认。
4. **卡片右键菜单** —— 重命名…、更改图标…、添加标签（勾选式，含新建标签）、卸载…，完全键盘可用。

v0.2 追加：

5. **搜索框** —— 筛选条第二行，名称按严格子串匹配（原生名与自定义名都参与），简介按模糊子序列匹配（仅插件卡）；与标签筛选取交集。
6. **排序** —— 搜索框右侧「排序」下拉：手动顺序 / 名称 A→Z / 名称 Z→A / 启用优先 / 版本高→低 / 最近出现。
7. **手动排序** ——「排序」左侧「调整顺序」按钮进入拖拽模式，整卡可拖，顺序按标签分区保存（`all` / `sys:<id>` / `tag:<id>`），不用排序下拉时默认就是手动顺序。
8. **AI 生成名称/简介** —— 重命名弹窗**底部**的「一键生成」：后台按可编辑提示词请求 AI 代理，host 多轮自检（格式、长度、重名）通过后由程序直接写入名称与简介，生成开始提示「AI 正在后台生成…」、成功提示「插件「旧名」已重命名为「新名」」，全程不锁界面。没有单独配置时**自动使用 DSH 的默认模型**。
9. **图标库** —— 右键「更改图标…」打开可预览图标库：内置 18 个与已上传图标**平铺在同一个网格**里，支持上传 png/jpeg/webp/gif/svg/ico 或 zip 批量入库，选中确认后替换卡片图标；删除模式下内置与上传图标都能多选删除。
10. **快速卸载** —— 右键「卸载…」确认后调用原生 `removeBundle`，只对可卸载的已安装插件出现。
11. **右键菜单修复** —— 底部/右侧溢出时自动翻转；菜单打开后点击外部第一次只关闭菜单，不会误触下面的卡片。

v0.3 追加：

12. **批量操作** —— 工具栏「批量操作」在「调整顺序」左侧；进入后分裂为「全选」（对当前可见插件全选/取消全选）与「完成」；批量态点击卡片切换选中，右键出批量菜单：批量添加标签 / 批量添加到分身 / 批量卸载（带确认，失败项保留选中）。
13. **添加到分身** —— 右键菜单在「添加标签」下方新增「添加到分身 ▸」子菜单，实时读取该分身管理的实例列表：运行中不可添加（置灰并提示先停止）、已装的置灰并标注、可装的点击即调用 `POST /plugins/instance-manager/add-plugin` 添加（添加后需重启该分身生效）；批量模式下可对多个插件一次性添加到某个分身。
14. **手动排序体验修复** —— 拖动时不再实时改卡片顺序（卡片不会在光标下跳来跳去、背景不会亮着不消），改为在落点画插入指示线、松手才提交；卡片之间的空隙也能放置。
15. **右键菜单键盘修复** —— 打开时不再预亮首项；一次 `Esc` 关闭整个菜单（含已展开的子菜单）；`↓`/`↑` 可越过带子菜单的行到达后面的项目，`→`/`Enter` 才展开子菜单。

v0.3.1 追加：

16. **拖动后残留高亮彻底修复** —— 调整顺序模式下整块面板抑制原生卡片 `:hover` 背景（`[data-pmod-ordering]` + `background: transparent !important`），退出模式即恢复；不再出现「拖过的卡片一直亮着、切页才恢复」。
17. **图标库重排** —— 内置与已上传图标不再分组，统一平铺一个网格；「恢复默认」移到对话框右上角；左下角是「添加」与「删除」，右下角是「取消」「保存」。
18. **多选删除图标** —— 点「删除」进入删除模式：按钮变为「确认删除」「取消删除」（保存暂时隐藏），内置与上传图标都可多选（v0.5 起内置也可删），确认后一次清理。
19. **ICO 支持** —— 上传接受 `image/x-icon` / `.ico`（含 zip 内），按魔数识别；同时兼容 `image/vnd.microsoft.icon` 与 `image/jpg` 这两类平台别名。

v0.4（Surface 契约 + 分身联动）追加：

20. **Surface 契约 v1** —— 插件页不再只认原生 DOM：任何页面只要按 `插件管理增强-Surface契约-v1.md` 标注 `data-plugin-surface` / `data-plugin-caps` / `data-plugin-package` / `data-plugin-title` / `data-plugin-desc` / `data-plugin-icon` / `data-plugin-list`，这套增强就会在那页面上渲染工具栏、改写名称/简介/图标、提供右键菜单；能力按 `caps` 裁剪（未声明的入口不渲染）。原生插件页是隐式 surface，零改动。
21. **添加到分身（真实联动）** —— 右键「添加到分身 ▸」不再是占位：读取分身管理插件的 `GET /plugins/instance-manager/state` 与 `/instance-plugins?id=`，列出所有分身；运行中的分身与已装该插件的分身置灰并标注原因，其余点击即调 `POST /plugins/instance-manager/add-plugin`（body `{id,name}`），成功后提示「重启该分身生效」。批量菜单里的「批量添加到分身」同理，按多选范围逐个添加。
22. **降级** —— 未安装分身管理时子菜单显示「分身管理不可用」；没有分身时显示「暂无分身」；两者都只读、不发写请求。

v0.5（AI 提示词 + 图标删除）追加：

23. **可编辑的 AI 提示词** —— 重命名弹窗底部左侧「修改提示词」打开提示词对话框：预填当前提示词（默认是五段式 markdown：角色 / 原始信息 / 要求 / 输出格式 / 自审，含 `{name}`、`{description}`、`{existingNames}` 占位），可改、可「恢复默认」、可保存；保存为空即回到内置默认。提示词随状态存进 `state.aiPrompt`。
24. **多轮自检后直接改名** —— host 侧代理把模型输出解析成 `{name, description}`，逐轮校验「合法 JSON + 两个非空字段 + 长度上限 + 名称与简介不能同时与原值相同 + 名称不与其他插件重复」，不合格就把问题作为反馈继续对话（最多 `config.ai.maxAttempts` 轮）；全部通过后客户端一次性写入覆盖并 toast。
25. **AI 区移到底部** —— 左「修改提示词」、右「一键生成」，生成中显示进度，未配置 AI 时按钮置灰并说明，不阻塞弹窗其他操作。
26. **内置图标可删** —— 删除模式下内置图标不再半透明/不可点；删除内置图标写入 `state.hiddenIcons`（只隐藏、不改代码），并清掉引用它的 `overrides.*.icon`，已用该图标的卡片回退原生图标。确认删除按钮改为普通按钮色（卸载确认仍保留红色危险色）。

v0.5.1（v0.5 复审修复）追加：

27. **能力门控补齐** —— 编辑弹窗的简介字段、简介原名行、AI 区与 `commitDialog`/`runAi` 的 `description` 写入全部按 Surface `caps` 门控：未声明 `desc` 的表面不显示简介、绝不写简介；AI 区要求 `rename`。
28. **状态版本严格** —— `PUT /state` 只接受当前版本（v0.7 起为 `version: 4`；省略或旧版本返回 400），与 `state.json` 的迁移规则一致。

v0.5.2（真机反馈修复）追加：

29. **堆叠卡片不再多一行** —— 分身设置页的插件列表是「标题块 + 简介块」上下排列（没有标题行），原名小字原先作为标题的兄弟插入，会变成第三行。现在这类卡片把 `[data-pmod-orig]` **内联进标题元素**（`aria-hidden`、小字灰色），标题仍是一行；若宿主提供了 `data-plugin-title-row`（弹性标题行），仍优先把原名小字作为标题的兄弟放在同一行。
30. **结构运行中切换不残留** —— 每帧全卡查找 `[data-pmod-orig]` 并只保留一份，`title-row` 与堆叠布局在运行中互换也不会出现两份小字（v0.5.2 / P2-21）。

v0.6.0（AI 默认模型）追加：

31. **自动使用 DSH 默认模型** —— `config.ai` / `PMP_AI_*` 都未配置时，host 自动回退到 DSH 当前默认模型（`ctx.get('llm')` + `ctx.get('agentDefaultModel').currentSelection()`，流式调用），无需再单独填 API Key；状态行显示实际模型名。
32. **生成中/完成提示** —— 点击「一键生成」立即提示「AI 正在后台生成…」（状态行 + Toast），完成后提示「插件「旧名」已重命名为「新名」」并关闭弹窗；请求后台进行，不锁界面。**生成期间用空白点击 / Esc 关闭弹窗不会取消后台运行**，完成后仍会写入改名并在页面上弹成功提示（v0.7.2）；只有「取消」按钮与手动「保存」会放弃这次生成。

v0.6.2（AI 生成失败的根因修复）追加：

33. **修掉「AI 生成失败」** —— 旧版单轮输出预算写死 300 token；当默认模型带 `reasoningEffort: max` 时推理会吃光预算，流以 `max-tokens` 结束且没有可见文本，界面只显示「AI 生成失败」。现在默认 4096（`config.ai.maxTokens` 可调，64–8192），**一旦这一轮被截断会自动用 8192 再试一次**（推理长度逐轮不同，单次 4096 不能保证每轮都够）；DSH 适配层以终止块上报的供应商/账号/配额错误（`[MISSING_CREDENTIAL]`、`[QUOTA]` 等）与截断原因都会明确返回，不再退化成 `AI response was empty`；流被中断时即使已收到半截文本也按超时（504）处理。失败的请求会在 `$DSH_HOME/plugin-manager-plus/ai-error.log`（0600）留一行 JSON 诊断，provider 静默回退会 `console.warn` 一条。机型不支持当前 `reasoningEffort` 时自动去掉该控制重试一次。

v0.7.1（v0.7 复审修复）追加：

38. **简介行在布局切换时也不重复** —— 卡片在运行中从堆叠布局切成标题行布局（或反向）时，注入的简介节点会跟着移动到新宿主，全卡只保留一份，不再出现两份简介。
39. **显式端点下隐藏模型按钮** —— 配置了 `config.ai` / `PMP_AI_*` 时，AI 行不显示模型按钮、状态行显示「将使用已配置的模型：…」、请求体不带 `pick`；host 也忽略任何 `pick`（包括指向已卸载 provider 的陈旧值），不会再因 `pick.provider is not registered` 让 AI 生成整体 400。
40. **带 `/` 的模型 id** —— `aiPick` 的 `model` 段允许再含 `/`（只按第一个 `/` 拆 provider），菜单里出现 `vendor/model` 这类 id 时选择不再被静默忽略。
41. **轮数上限收紧到 3** —— `config.ai.maxAttempts` 现在默认 3、上限 3（与「最多 3 轮」一致）；`/ai/models` 的档位探测上限从 20 提到 40，避免第 21+ 个模型没有档位信息。

v0.7.5（取消的旧生成即使 PUT 迟到也不写回）追加：

48. **被取消的旧生成绝不会写回** —— 「取消」之后那次请求可能已经在路上，若它返回时状态已被别人改过（409），客户端会用最新版本重放保存逻辑；重放时会再次确认这次生成已被取消，因此旧值不会趁重放写回。回归由垫片 V7-21 用真实 409 重放路径锁住。

v0.7.4（同一插件重新生成即作废旧结果）追加：

47. **重新生成会作废上一次** —— 同一插件生成中把弹窗关掉（后台继续），再打开它的重命名弹窗点一次「AI 生成名称简介」：旧的那次请求结果即使晚到也不会写入，最终以最新一次为准，不会出现「先显示旧名称又跳回新名称」。

v0.7.3（多弹窗与手动保存语义修复）追加：

43. **后台完成只影响自己的弹窗** —— 插件 A 的生成在后台完成时，只会关闭 A 自己的重命名弹窗；如果此时正开着插件 B 的重命名弹窗（哪怕有未保存输入），B 的弹窗不会被关掉，B 的输入也不会丢。
44. **取消/保存只作用于当前弹窗** —— 在 B 的弹窗点「取消」或「保存」只结束 B 这次 AI 生成，不会误杀 A 还在跑的生成；A 的结果返回时照常写入 A 并提示成功。
45. **手动保存优先（真正生效）** —— 生成期间手写名称并点「保存」，AI 若晚到会被直接放弃，不会再覆盖你刚保存的值，也不会弹「已重命名为」的误导提示。
46. **关窗后失败也有提示** —— 生成期间关掉弹窗后，如果请求因为「AI 未配置」失败，页面仍会弹出「AI 未配置」提示，不再静默。

v0.7.2（关闭弹窗不再取消后台生成）追加：

42. **关窗后后台生成仍完成** —— 点「AI 生成名称简介」后，即使马上用空白点击或 Esc 收起重命名弹窗，后台请求也不会被取消：模型返回并校验通过后照常写入名称/简介、更新卡片并弹出「插件「旧名」已重命名为「新名」」；失败同样会弹失败提示。「取消」按钮会放弃本次生成，「保存」会以你手写的值为准（不会随后被 AI 结果覆盖）。

v0.7（AI 模型选择 + 直连 API + 简介行修复）追加：

34. **改简介后不再重复原简介** —— 卡片只显示自定义简介，不再渲染「原简介」小字；分身设置页那种上下堆叠卡片不会再因为小字多出第三行（名称 / 自定义简介 / 原简介）。原名小字仍保留，语义同 29。
35. **AI 模型选择按钮** —— 重命名弹窗 AI 行现在是「[AI 生成名称简介] [模型按钮] [状态]」。模型按钮打开菜单：首项「跟随默认模型」（副标签显示当前默认），下面按 provider 分组列出可用模型，带推理强度的模型在行尾显示**最低档**；选择后立即写入 `state.aiPick` 并 toast「已切换 AI 模型：…」，下次打开弹窗保持同一模型；选「跟随默认模型」即清空 `aiPick`，回到跟随 DSH 默认模型。显式配置了 `config.ai` / `PMP_AI_*`（自建端点）时按钮**隐藏**——端点路径固定使用 `config.ai.model` 且不读取 `aiPick`，避免出现「切换了却没效果」的假象（v0.7.1）。
36. **直连 API 优先** —— 目标 provider 是 `deepseek-official`（有 `DEEPSEEK_API_KEY` 凭证）时，host 直接 `POST https://api.deepseek.com/v1/chat/completions`：只带系统提示词 + 一条 user 消息、**不带任何工具定义**、`temperature 0.4`、非流式，成功后响应里 `mode: "direct"`；任何失败（401/网络/超时/解析）只 `console.warn` 一次并静默回退 DSH 原生调用，不影响结果。`config.aiDirectBaseURL` 可把直连指向自建网关。
37. **原生调用是一次性会话** —— 回退到 DSH 原生时同样只发系统提示词 + 对话，不加载 agent 工具定义，调用完即丢弃；多轮只用于「程序校验不合格 → 把问题反馈给模型重答」，最多 3 轮（`config.ai.maxAttempts`，默认 3、上限 3）。带 `pick` 的模型用其元数据里的最低 `reasoningEffort`，没给档位就不传该参数。

v0.8.0（启用中 / 未启用 系统标签）追加：

49. **启用中 / 未启用 系统标签** —— v0.8 曾在「全部」之后依次放 5 个系统标签：内置 / 实验性 / 已安装 / **启用中** / **未启用**；v0.9 起只剩后两个（见 56）。状态标签是**派生标签**：卡片里的启用开关（`[role="switch"]` 的 `aria-checked`）打开就归入「启用中」，关闭就归入「未启用」——启用了自动带上、没启用自动不带，不是用户创建的标签，也不能删除或重命名。
50. **状态筛选是只读视图** —— 点「启用中 / 未启用」只按开关状态过滤，显示顺序沿用 `all` 分区的手动顺序；此时「调整顺序」与「排序」两个按钮都隐藏（跨分区的状态视图没有一致的手动顺序可维护），切回「全部」或任意用户标签即恢复。
51. **配置条目卡不参与** —— 原生「配置条目」卡（`data-plugin-item`）没有启用开关，因此既不出现在「启用中」也不出现在「未启用」；要筛它们请用搜索（v0.9 起不再有分组标签）。
52. **保留名与作用面** —— 「启用中 / 未启用 / Enabled / Disabled」以及 id（`enabled` / `disabled`）不能作为用户标签名（客户端 toast 提示 + host 400 双保险）；这两个标签只渲染在原生插件页，外部 Surface 仍只显示「全部 + 用户标签」。

v0.8.1（三态判定与批量计数即时刷新）追加：

53. **开关状态严格三态** —— `aria-checked` 只有 `true` / `false` 两个规范值参与派生归类；`mixed`、空串、`1` 等非规范值（以及缺属性）现在算「未知」，**既不出现在「启用中」也不出现在「未启用」**，不会再把不确定状态静默算成「未启用」。比较前会 trim + 转小写，`"True"` / `" FALSE "` 这类写法仍能正确归类。
54. **批量计数即时刷新** —— 批量操作中切换「启用中 / 未启用 / 全部 / 用户标签」筛选时，工具栏的「已选择 N 项」与「全选 / 取消全选」文案在同一帧立刻按新的可见选中集重算，不再落后一个轮询周期；批量添加标签 / 批量卸载本来就会实时重算，因此不会误伤隐藏卡。
55. **筛选槽位互斥（文档澄清）** —— 两个派生标签与分组标签、用户标签共用同一个筛选槽位（单选互斥）：点任一标签会替换当前筛选；搜索与批量选择可以继续叠加在筛选之上。v0.8 规格原文「可叠加」已按实际行为改正，代码未改。

v0.9.0（默认标签精简）追加：

56. **移除三个分组默认标签** —— 原生「插件」页本身已按「内置 / 实验性 / 已安装」分区展示，筛选条上再放同名标签属于重复入口，因此「内置 / 实验性 / 已安装」三个标签被移除。默认标签只剩：**全部 / 启用中 / 未启用**；用户标签与「＋新建」位置不变。
57. **右键子菜单同步精简** —— 「添加标签 ▸」的「系统标签」区只剩「启用中」「未启用」两行只读状态行，不再显示三个分组行（分组信息由页面分区承担）。
58. **兼容与保留名** —— 三个分组的数据结构保留：旧 profile 的 `state.orders` 里若有 `sys:builtin` / `sys:experimental` / `sys:installed` 分区键，加载与保存都不报错、键与数据保留（不损坏其它订单）；但 v0.9 起筛选条不再提供这三个分区的入口，因此这些历史分区的手动顺序不会被应用（仅作为数据保留，未来若恢复入口才可继续用）。同时「内置 / 实验性 / 已安装」仍是保留名，不能新建同名用户标签（客户端 toast + host 400 双保险），避免与分区标题混淆。host 无改动。

## Surface 契约（v1）

完整定义见 [`Surface契约-v1.md`](./Surface契约-v1.md)。最小集合：

```html
<div data-plugin-surface="instance"
     data-plugin-surface-version="1"
     data-plugin-caps="rename desc tags icon search clone"
     data-plugin-scope="instance:<id>">
  <div data-plugin-list>
    <div data-plugin-package="<包名>" data-plugin-kind="package" data-plugin-status="running">
      <div data-plugin-icon></div>
      <div>
        <div data-plugin-title>名称</div>
        <div data-plugin-desc>简介</div>
      </div>
      <div data-plugin-actions>…</div>
    </div>
  </div>
</div>
```

* 装饰器只写 `textContent`、`style.display`、`style.order` 与 `data-pmod-*` 标记，**不移动、不重建宿主节点**；唯一例外是原名小字 `[data-pmod-orig]`：有 `data-plugin-title-row` 时作为标题的兄弟插在行内，没有时内联进标题元素（因此宿主不要把标题的 `textContent` 当作纯名称读取）。
* `caps` 是白名单：`search tags rename desc icon clone order batch uninstall install-guard`。未列出即不渲染入口（不是渲染后禁用）——例如没有 `rename` 就完全不改写标题、没有 `desc` 不写简介、没有 `icon` 不替换图标、没有 `tags` 只显示「全部」pill 且不出现新建标签入口。
* **没有 `data-plugin-caps` 属性（或值为空）视为「什么都没声明」**：整页不建工具栏、不绘制、右键不弹菜单。
* 版本 `data-plugin-surface-version` 只支持 `"1"`；未知版本整页只读跳过。
* 「添加到分身」的实例列表缓存 15 秒，过期后再打开子菜单会重新读取（读取期间先显示「正在读取分身…」）。
* 缺少 `data-plugin-title` 的卡片会被跳过并 `console.warn`，其余卡片照常。

> 能力门控（v0.5.1）：`rename` 控制标题写入与 AI 入口，`desc` 控制简介字段与简介写入，`icon` 控制图标覆盖，`tags` 控制标签 pill 与「＋新建」；未声明的能力既不渲染入口也不写数据。

## 安装

本插件未发布到 npm，通过 DSH profile 的本地 `link:` 依赖安装：

```bash
git clone https://github.com/zefferry/dsh-plugin-manager-plus.git
```

1. 关闭 DSH；
2. 在 `<profile>/package.json` 的 `dependencies` 里加
   `"@local/dsh-plugin-manager-plus": "link:<克隆目录>"`；
3. 把 `"@local/dsh-plugin-manager-plus"` 追加到 `dsh.profile.bundles` 数组；
4. 在 `<profile>/node_modules/@local/` 下建一个指向源码目录的链接（Windows 用 junction）；
5. 重启 DSH。

它与原生插件管理器**共存**，禁用本插件后原生页面即刻回归原样。

## 包结构

```
plugin-manager-plus/
├── package.json          # dsh.bundle.patch + dsh.client（web，immediately）
├── cordis.patch.yml      # insert: plugin-manager-plus
├── host/index.js         # 状态存储 + HTTP 路由 + 变更事件
├── client.js             # 纯 DOM 叠加层（无第三方依赖）
├── locale/{zh,en}.json   # 仅 meta；界面文案内联在 client.js
├── assets/icon.svg
└── README.md
```

## 行为边界（重要）

- **只叠加展示层**：不移动、不重建原生 DOM 节点；只写文本、`style.display` / `style.order`、`data-pmod-*` 标记属性，以及添加自己的覆盖节点（原名小字、简介、图标）。
- 识别原生页面只依赖 `data-plugin-*` 锚点（`[data-plugin-panel]`、`[data-plugin-group]`、`[data-plugin-package]`、`[data-plugin-item]`），不依赖哈希类名与 nth-child。
- 原生锚点变化时静默降级，并在控制台打印 `[plugin-manager-plus] native anchors changed`。
- 行为层改动只有两处，且都可还原：安装拦截（替换远端方法的属性描述符，禁用时还原）、卸载（用户点「卸载…」确认后调用原生 `removeBundle`，不是自动行为）。
- 排序只用 CSS `order`，不改 DOM 顺序；筛选只用 `display`。拖动过程中**不写任何 `order`**：只在落点卡片上临时加一条 `box-shadow` 指示线（`drop`/`dragend`/重渲染/退出模式时清除），松手后一次性写 `orders[分区]`。

## 安装拦截怎么实现的

`ctx.remote.pluginManager` 是 DSH 的远端命名空间：它的每个方法都由 api-gateway 的
`RemoteNamespaceService.install` 以**可配置的 own accessor** 定义（只有 `get`、没有 `set`，
每次读取返回新闭包），所以直接赋值 `pm.installBundle = fn` 会被静默丢弃。
本插件替换的是**属性描述符**：

```js
const desc = Object.getOwnPropertyDescriptor(pm, 'installBundle') // 原始 getter
Object.defineProperty(pm, 'installBundle', {
  configurable: true,
  enumerable: desc.enumerable,
  get() {
    const original = desc.get.call(this)
    return (spec, options) => original.call(this, spec, { ...options, enabled: false })
  },
})
```

`enabled` 之外的选项（`registry`、`saveExact`、`requestId`、`approvedBuilds`…）原样透传，
宿主 `installBundle` 内部唯一会自动启用的分支是 `options.enabled !== false`，所以强制
`enabled:false` 即等价于「装好但不启用」。禁用插件或热重载时用 `defineProperty` 还原原始描述符。

若将来该方法变为不可配置（`defineProperty` 抛错），插件切换为**降级兜底**：
监听原生 `plugin-manager/install-state` / `plugin-manager/changed`，在任何安装动作开始时刻
用 `listBundles()` 的 `{name, enabled}` 拍快照，在 10 秒窗口内做差，只把「快照里没有、现在出现
且已启用」的 bundle 用 `setBundleEnabled(name, false)` 关掉（同一 bundle 只关一次）。
窗口内用户手动打开的既有插件不会被误关。
若连 `listBundles` 也不可用，则只在控制台告警并提示一次「安装拦截不可用」，不再假装拦截成功。

## 状态存储

`$DSH_HOME/plugin-manager-plus/state.json`（默认 `~/.dsh`），整文件替换写入：
临时文件 + `fsync` + `rename` 原子落盘，`rev` 乐观锁，冲突时返回 409 与最新状态。
文件损坏会备份为 `state.json.bak-<时间戳>` 后以空状态启动。

```jsonc
{
  "version": 4,
  "updatedAt": "2026-11-01T15:24:24.290Z",
  "tags": [{ "id": "t_1a2b_9f3c", "label": "日常", "createdAt": 1730000000000 }],
  "assignments": { "pkg:@local/dsh-foo": ["t_1a2b_9f3c"] },
  "overrides": {
    "pkg:@local/dsh-foo": { "name": "我的工具", "description": "", "icon": "ic_1a2b_7d2e" }
  },
  "orders": {
    "all": ["pkg:@local/dsh-foo", "pkg:@local/dsh-bar"],
    "tag:t_1a2b_9f3c": ["pkg:@local/dsh-bar", "pkg:@local/dsh-foo"]
  },
  "seen": { "pkg:@local/dsh-foo": "2026-11-01T15:24:24.290Z" },
  "icons": [
    { "id": "ic_1a2b_7d2e", "name": "mine.png", "mime": "image/png", "size": 2048, "createdAt": 1730000000000 }
  ],
  "aiPrompt": "",
  "hiddenIcons": ["star"],
  "aiPick": "deepseek-official/deepseek-flash"
}
```

- 主键前缀 `pkg:`（插件卡）与 `item:`（配置条目卡）不可省略。
- 标签名 1–12 字符，NFKC + 大小写不敏感唯一，且不得与系统标签同名。
- `description: ""` 表示显式清空简介；删除 `description` 键表示回落原生简介；`icon` 必须是内置 18 个 id 之一或已上传图标的 id（内置 id 不占 `icons` 数组、不是磁盘字节）。
- `updatedAt` 由 host 拥有：首次写入前为 `null`，之后为 ISO 8601 字符串；客户端传来的值一律忽略。
- `orders` 的分区键只能是 `all` / `sys:<systemId>` / `tag:t_<...>`；一个分区一份顺序，最多 500 项。
- `seen` 记录插件卡首次被看到的时间（**ISO 8601 字符串**，host 校验 `Date.parse`，数字会被 400 拒绝），用于「最近出现」排序；最多 500 项。
- `icons` 由 host 权威管理：`PUT /state` 会忽略客户端传的 `icons`，以磁盘上的记录为准；上限 100 张。
- `aiPrompt`：用户改过的提示词；空字符串表示「用内置默认」。host 只接受字符串、trim 后 ≤8000 码点。
- `hiddenIcons`：被用户删掉的内置图标 id（只接受 18 个内置 id，去重），不影响代码，只控制库里是否显示与覆盖是否生效。
- `aiPick`：`""` 表示跟随 DSH 默认模型；否则必须形如 `provider/model`（≤120 字符；`model` 段本身可含 `/`，如 `vendor/model`，只按第一个 `/` 拆 provider）。AI 生成时按「请求里的 `pick` > 该字段 > 默认模型」取模型；显式配置的 `config.ai` 端点会忽略 `aiPick`。
- `version` 只接受 `4`：`PUT /state` 带其它版本会被 400 拒绝；旧版 `version: 1` / `2` / `3` 的文件读取时内联迁移到 v4，`rev` 保持不变。
- 筛选与搜索状态只存在内存里，不持久化；排序选择也不持久化（只有手动顺序落库）。


## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/plugins/plugin-manager-plus/state` | `{ ok, value: { state, rev } }`；若刚从损坏文件恢复，额外带一次 `recovered: true` + `backupPath` |
| PUT | `/plugins/plugin-manager-plus/state` | body `{ state, rev }`；rev 不匹配返回 409 + 最新值；`state.icons` 被服务端权威值覆盖 |
| GET | `/plugins/plugin-manager-plus/health` | 计数与路径：`rev` / `tagCount` / `assignmentCount` / `overrideCount` / `iconCount` / `aiConfigured` / `path` |
| GET | `/plugins/plugin-manager-plus/icons` | `{ ok, value: { icons } }`，图标库列表 |
| POST | `/plugins/plugin-manager-plus/icons` | `{ name, dataUrl }` 单图或 `{ name, zip }`（base64）；返回 201 + 新库；库满 409 `icon-limit` |
| GET | `/plugins/plugin-manager-plus/icons/<id>` | 图标字节（按魔数判定 mime，immutable 缓存头） |
| DELETE | `/plugins/plugin-manager-plus/icons/<id>` | 删除图标并清理引用该图标的 `overrides.*.icon` |
| POST | `/plugins/plugin-manager-plus/ai/rename` | body `{ name, description, prompt?, existingNames?, pick? }`（`pick` 为 `{provider, model}` 时优先于 `state.aiPick`）；成功 `{ name, description, attempts, model, mode }`，`mode` 为 `config` / `direct` / `dsh`；未配置 501、上游失败 502、超时 504 |
| GET | `/plugins/plugin-manager-plus/ai/status` | `{ ok, value: { configured, source, model } }`，`source` 为 `config` / `dsh` / `none`；`dsh` 时另带 `provider`、`providers`（已注册 provider 列表）、`selection`（原始 `{provider, model, reasoningEffort}`） |
| GET | `/plugins/plugin-manager-plus/ai/models` | `{ ok, value: { providers: [{ id, models: [{ id, name, reasoningEfforts? }] }], default: { provider, model } \| null } }`；每个 provider 最多 40 个模型，前 40 个模型探测 `reasoningEfforts`（顺序即从低到高），结果缓存 60s；没有 llm 服务时返回空数组 200 |

## AI 代理配置

**开箱即可用**：host 优先用 `config.ai` / `PMP_AI_*`；两者都没有时会自动回退到**当前 DSH 的默认模型**
（`ctx.get('llm')` + `ctx.get('agentDefaultModel').currentSelection()`，通过 `llm.prepareCall(...)` 流式生成），
所以只要 DSH 里选好了模型，AI 按钮就能直接用，界面上会显示「将使用 DSH 模型：provider/model」；
显式配置了 `config.ai` / `PMP_AI_*` 时优先走该端点，状态行显示「将使用已配置的模型：<model>」。
配置来源优先级：`apply(ctx, config)` 传入的
`config.ai`，其次环境变量，最后 DSH 默认模型：

```js
// cordis 载入本插件时的 config
{
  ai: {
    baseURL: 'https://api.example.com/v1', // OpenAI 兼容，请求 POST {baseURL}/chat/completions
    apiKey: '...',
    model: '...',
    prompt: '...',        // 可选，模板支持 {name} / {description} / {existingNames}
    maxAttempts: 3,       // 1–3（默认 3），结果不合规时带错误反馈重试
    maxTokens: 4096,      // 64–8192，单轮输出预算（见下方「推理模型」说明）
    timeoutMs: 30000,
  },
}
```

```bash
PMP_AI_BASE_URL=...  PMP_AI_API_KEY=...  PMP_AI_MODEL=...
```

**推理模型与 `maxTokens`**：DSH 默认模型常带 `reasoningEffort`（例如 `max`），隐藏推理会先消耗
输出预算，留给可见答复的 token 不多。旧版写死 `maxTokens: 300` 时，`deepseek-flash` + `max`
推理会把预算全部用在推理上，流以 `finish: max-tokens` 结束且**没有任何可见文本**，客户端只看到
「AI 生成失败」（宿主当时的报错是 `AI response was empty`）。现在默认 **4096**，可用
`config.ai.maxTokens` 调整（上限 8192）；若仍被截断，host 会明确返回「AI 输出被截断：模型在 N 个输出
token 内没有产出可见文本（推理占满了预算）」，而不是含糊的空响应。供应商/账号/配额错误也会原样
透出（例如 `[MISSING_CREDENTIAL]`、`[QUOTA]`），不再被吞成空响应；每次失败都会在
`$DSH_HOME/plugin-manager-plus/ai-error.log` 追加一行 JSON（含 source/provider/model/
reasoningEffort/maxTokens/status/message/最后一次模型回复，超过 256KB 轮转一次）便于排查。

**直连 API（v0.7）**：目标模型属于 `deepseek-official`（`dsh-llm-deepseek-api-key`，凭证
`DEEPSEEK_API_KEY`）时，host 不再经过 DSH 适配层，而是直接 `POST https://api.deepseek.com/v1/chat/completions`
（`config.aiDirectBaseURL` 可覆盖 base）：请求只有 `system` + 一条 `user`，**不带 tools / 工具定义**，
`temperature 0.4`、`max_tokens` 同 `config.ai.maxTokens`、非流式；响应带 `mode: "direct"`。
任何失败（401、网络、超时、非 JSON）只 `console.warn` 一行并**静默回退** DSH 原生调用（`mode: "dsh"`），
用户不会因为直连不可用而失败。`deepseek-account` 这类只有账号态、没有独立 key 的 provider 永远走原生。
原生调用同样是一次性会话：只发系统提示词 + 对话，不加载 agent 工具定义，用完即丢。

**模型选择（v0.7）**：`GET /ai/models` 列出已注册 provider 的模型（带 `reasoningEfforts` 时按从低到高）；
弹窗里选中的模型存 `state.aiPick`，请求以 `pick > state.aiPick > agentDefaultModel` 的优先级取模型。
指定模型且元数据带推理档位时，host 取**最低档**（`efforts[0]`）作为 `reasoningEffort`；跟随默认时保留
当前选择的档位；模型元数据没有档位则不传该参数。

请求 body 为 `{ name, description, prompt?, existingNames?, pick? }`：`prompt`
覆盖模板（也就是用户在该插件的「修改提示词」对话框里保存的 `state.aiPrompt`），`existingNames`
是所有卡片当前显示名称（不含自身、去重、上限 500），host 用它做重名校验。

校验是**多轮对话**：模型输出被解析成 `{name, description}` 后，逐轮检查「合法 JSON + 恰好两个
非空字段 + 名称 40 / 简介 120 码点以内 + 与原值不完全相同 + 名称不与其他插件重复（NFKC + trim +
小写比较）」，任何一条不满足就把问题追加成反馈再问一次，最多 `config.ai.maxAttempts` 轮（默认 3、
上限 3），全部失败返回 502 并带最后一次问题。成功返回 `{ name, description, attempts, model }`，
客户端据此写入 `overrides` 并提示「插件「旧名」已重命名为「新名」」；生成开始时先提示一次
「AI 正在后台生成…」，整个请求在后台进行，弹窗不锁、可继续编辑或关闭。

未配置 AI 时按钮禁用并提示「AI 未配置」；配置了 DSH 默认模型时状态行显示实际模型名。

提示词有三层来源，优先级从高到低：`POST /ai/rename` 的 `prompt`（UI 保存的 `state.aiPrompt`）→
`config.ai.prompt` → 内置 `DEFAULT_AI_PROMPT`（五段式 markdown：角色 / 原始信息 / 要求 / 输出格式 /
自审，同样支持三个占位符）。UI 的默认文本与 host 内置默认各自维护，但 UI 每次都会把非空提示词
显式发过去，所以实际生效的永远是界面上看到的那份。


**多窗口/多实例同步**：客户端每 2.5 秒轮询一次 `GET /state`（rev 未变时零副作用），并在窗口
获得焦点（`focus` / `visibilitychange`）时立即刷新；因此另一个窗口的修改最迟约 2.5 秒出现。
宿主写入后仍会 `emit('plugin-manager-plus/changed')`，但该自定义事件不在 api-remotes 的转发
白名单里，客户端 `$on` 收不到，**不能**依赖它做同步（保留订阅仅为将来兼容）。

## 键盘与可达性

- 右键菜单：`↑`/`↓` 在行间移动（不自动展开子菜单），`→` 或 `Enter` 展开子菜单，`←` 收起并回到父行，`Enter`/`Space` 执行，**`Esc` 关闭整个菜单**；`role="menu"` / `menuitem` / `menuitemcheckbox`。批量菜单首行是「已选择 N 项」表头。
- 重命名对话框：打开即聚焦「显示名称」，`Tab` 循环焦点，`Ctrl/Cmd+Enter` 保存，`Esc` 取消；AI 请求进行中 `Esc` 仍可直接关闭。底部 AI 行：`Tab` 可到「修改提示词」「一键生成」。
- AI 模型菜单（v0.7）：`↑`/`↓` 在「跟随默认模型」与各模型间环绕移动，`Home`/`End` 到首尾，`Enter`/点击选中，**`Esc` 只关闭菜单不关重命名弹窗**，点击菜单外关闭；菜单本身 `role="menu"`、选项 `role="menuitemradio"` + `aria-checked`。
- 提示词对话框：`textarea` 自动聚焦，`Ctrl/Cmd+Enter` 保存，`Esc` 取消，`Tab` 在文本框与「恢复默认/取消/保存」之间循环。
- 图标库：`Tab` 在图标格与按钮间移动，`Esc` 关闭；删除模式下内置与上传图标都是多选（`aria-pressed`）。
- 确认弹窗：`Enter` 确认、`Esc` 或点击遮罩取消。
- 搜索框：输入即筛，`Esc` 清空；筛选标签为 `aria-pressed` 按钮，`＋` 输入框回车保存、`Esc` 取消。
- 批量模式：点卡片用 `data-pmod-selected="1"` 标记选中（开关、搜索框不触发选择）；工具栏右侧有 `role="status" aria-live="polite"` 的「已选择 N 项」计数；`Esc` 不退出，需点「完成」；`Tab` 会把焦点移出右键菜单并关闭它。
- 批量只作用于**仍选中且当前可见**的卡片：筛选/搜索隐藏掉的选中项保持选中但不参与批量动作，可见选中为空时「批量添加标签」「批量卸载」变为禁用。
- 手动排序模式：整卡 `draggable`（右侧 ⠿ 为视觉提示），松手 400ms 内的 click 被吞掉，避免误进详情页；退出模式后 `draggable` 与把手清除。


## 国际化与样式

- 文案内联在 `client.js` 的 `zh` / `en` 字典，跟随 DSH 当前语言实时切换；`locale/*.json` 只提供插件列表里的标题与描述。
- 样式类名一律 `pmod-` 前缀，颜色/圆角/阴影全部取自 `--dsw-alias-*`、`--dsw-radius-*`、`--dsw-elevation-*` 设计变量，不写死色值。

## 已知限制

- 「配置条目卡」只支持改名称（其简介是各插件自己的插槽内容，改写会破坏交互；也不支持改图标）。它们没有启用开关，所以不参与「启用中 / 未启用」筛选。
- 「启用中 / 未启用」是**派生**系统标签：客户端读取卡片内 `[role="switch"]` 的 `aria-checked` 实时归类，不写 `state.json`，也无法新建/改名/删除。若宿主某天不再渲染该开关，卡片会同时从两个状态视图消失（仍可用其它标签看到）。
- 状态筛选下「调整顺序」「排序」按钮隐藏：状态视图跨内置/扩展/Bundle 三个分区，手动排序分区（`all` / `sys:*` / `tag:*`）无法表达，排序下拉也属于同一手动排序入口；退出状态筛选即恢复。
- more（实验性）视图只做名称/简介改写，不参与标签筛选与排序。
- 跨窗口同步靠 2.5 秒轮询，不是实时推送（见上文「多窗口/多实例同步」）。
- 标签名长度：客户端校验与服务端都按**码点**数判 ≤12；但新建输入框的 `maxlength=12` 是按 UTF-16 计数，纯 emoji 标签最多只能输入 6 个字符（再打会被输入框截断，不是报错）。
- 状态文件损坏会备份为 `state.json.bak-<时间戳>` 并以空状态继续，首次读取时界面会 Toast 提示一次。
- **没有真正的「发布时间 / 安装时间」**：原生 `listBundles()` 不提供这两个字段，所以排序项是「最近出现」（本插件首次看到该卡的时间，存在 `seen`）而不是安装时间。
- AI 默认使用 DSH 当前选中的默认模型（`agentDefaultModel` 的选择），也可在弹窗里用模型按钮**临时/长期改用某个模型**（存 `state.aiPick`，选「跟随默认模型」清空）；也可显式配置 `config.ai` 或 `PMP_AI_*` 走自建 OpenAI 兼容端点（优先）。两者都没有时按钮禁用并显示「AI 未配置」。提示词五段式可查看/修改，host 会多轮自检（格式/长度/重名）后才落盘，模型输出质量取决于所接模型。
- **推理强度取决于适配器是否暴露档位**：真机 `GET /ai/models` 上 `deepseek-official`、`deepseek-account` 都返回 `["off","low","high","max"]`（按从低到高），菜单显示最低档 `off` 并按它调用；若某 provider/模型没有 `reasoning` 元数据，菜单不显示档位、调用也不传 `reasoningEffort`。
- **直连 API 只对 `deepseek-official` 生效**：`deepseek-account` 是 DSH 账号态、没有可直连的独立 key，永远走原生；直连失败会静默回退原生，响应里的 `mode` 字段可区分实际走了哪条路。
- 图标库上传：单图 ≤512KB、zip ≤8MB 且 ≤40 张、库上限 100 张；支持 png/jpeg/webp/gif/svg/ico，zip 内同样接受这些扩展名，跳过目录、`__MACOSX` 与点文件。ICO 按原字节存储（内置多尺寸 16/32/48/256 都会被浏览器自适应缩放），服务端不解码。
- 图标 mime 会被归一化：`image/vnd.microsoft.icon` 与 `image/jpg` 分别等价于 `image/x-icon` 与 `image/jpeg`；声明的 mime 与字节魔数不一致会以 400 `bad-mime` 拒绝。
- 手动排序进入「调整顺序」后，卡片右侧出现 ⠿ 拖拽把手（`span.pmod-drag`，仅视觉提示、不接收事件），卡片任意位置都可拖；拖动中不重排、只画落点指示线，松手才提交顺序；拖拽结束的 400ms 内 click 被抑制，避免误进详情。
- 「添加到分身」是**真实功能**，依赖分身管理插件（`@local/dsh-instance-manager`）：未安装或读取失败时子菜单只显示一条「分身管理不可用」提示，其余功能不受影响；实例列表缓存 15s，失败后约 3s 再试；目标分身必须处于停止状态，添加成功后需重启该分身才生效。
- 批量操作与手动排序互斥：进入批量会退出调整顺序模式（反之亦然），批量态不显示「调整顺序」按钮。
- 体积：v0.9.0 的 `client.js`（219,105 B）+ `host/index.js`（89,267 B）合计 **308,372 B ≈ 301 KiB**，超过 v0.1 文档「client+host <120KB」的自定目标（约 251%），也超过 host 的 40KB 目标（功能与中文注释占大头）；如需压回可先删注释与合并重复分支。
- 真机验证：v0.3 起已能在**真实浏览器**里跑端到端（真实 desktop host + Edge headless CDP，`_dev/pmp-ui-verify.mjs`；v0.9.0 为 114 项全绿，含合成 `DragEvent` 的真实几何、`getComputedStyle` 的 hover 背景断言、弹层像素、提示词对话框、内置图标删除与 AI 完整生成链路）；另有 `_dev/probe-ai-real.mjs` 用**复制**的凭据与真实 profile 复现真实 provider 调用（v0.6.2 用它把 `AI response was empty` 复现并修掉）。未自动化的部分是**操作系统级原生拖拽手势**（用合成事件覆盖同一条代码路径）与输入法/触屏。
- 卡片背景高亮只在**非**调整顺序模式出现：进入「调整顺序」后整块面板抑制原生 `:hover` 背景（`[data-pmod-ordering]`），退出即恢复——这是按「要么不亮、要么只在拖动时亮」取舍后的实现，彻底消除拖动后残留高亮。
- AI 归类、详情页同步、生态适配器等仍不在本版范围。

