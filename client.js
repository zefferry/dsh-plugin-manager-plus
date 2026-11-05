// Plugin Manager Plus — client half (DSH web UI plugin bundle).
// A pure DOM overlay on top of the native plugin manager page: it never moves,
// rebuilds or mutates native data, it only writes text and inline display.
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-manager-plus',
  factory: () => {
    const NS = 'plugin-manager-plus'
    const ROOT = '/plugins/' + NS
    const SERVICE = 'plugin-manager-plus/changed'
    // Cross-window refresh cadence (the custom event is not forwarded by
    // api-remotes, so polling is the working sync path; see subscribeRemote).
    const REMOTE_POLL_MS = 2500

    // Group tags are fixed; each maps onto one native group section. v0.9 no
    // longer renders them as filter pills (the native surface already shows the
    // three sections), but they stay: legacy saved orders may still carry
    // `sys:*` partitions, and their names remain reserved when creating tags.
    const SYSTEM = [
      { id: 'builtin', group: 'basic' },
      { id: 'experimental', group: 'extensions' },
      { id: 'installed', group: 'bundles' },
    ]
    // v0.8: two derived system tags for the enable switch state. Unlike the
    // group tags above they cut across sections; item cards have no switch and
    // therefore take part in neither.
    const STATE_SYSTEM = [
      { id: 'enabled' },
      { id: 'disabled' },
    ]
    const FILTER_SYSTEM = SYSTEM.concat(STATE_SYSTEM)
    function isStateSystemId(id) {
      return id === 'enabled' || id === 'disabled'
    }
    // true = enabled, false = disabled, null = no switch / unknown.
    function cardEnabledState(card) {
      if (!card || typeof card.querySelector !== 'function') return null
      const toggle = card.querySelector('[role="switch"]')
      if (!toggle || !toggle.hasAttribute('aria-checked')) return null
      // v0.8.1 (P2-2): only strict true/false are classified. Anything else
      // ("mixed", "True", "", "1", ...) is unknown and shown under neither
      // derived tag, instead of silently falling into "未启用".
      const value = String(toggle.getAttribute('aria-checked')).trim().toLowerCase()
      if (value === 'true') return true
      if (value === 'false') return false
      return null
    }
    const GROUPS = ['basic', 'extensions', 'bundles']
    const GROUP_SELECTOR = '[data-plugin-group="basic"], [data-plugin-group="extensions"], [data-plugin-group="bundles"]'
    const ANY_GROUP_SELECTOR = GROUP_SELECTOR + ', [data-plugin-group="more"]'
    const CARD_SELECTOR = '[data-plugin-package], [data-plugin-item]'
    // Surface contract v1 (see 插件管理增强-Surface契约-v1.md). The native plugin
    // page is an implicit surface; other host pages opt in with data-plugin-*.
    const SURFACE_VERSION = '1'
    const NATIVE_CAPS = new Set(['rename', 'desc', 'tags', 'icon', 'order', 'batch', 'uninstall', 'search', 'install-guard', 'clone'])
    const INSTANCE_ROOT = '/plugins/instance-manager'
    const CLONE_TTL_MS = 15000
    const CLONE_TIMEOUT_MS = 120000

    // i18n (inline dictionaries; locale files only carry the meta block)
    let LANG = 'zh'
    const DICT = {
      zh: {
        all: '全部',
        builtin: '内置',
        experimental: '实验性',
        installed: '已安装',
        enabled: '启用中',
        disabled: '未启用',
        add: '＋ 新建标签',
        addGlyph: '＋',
        addPlaceholder: '新标签名',
        rename: '重命名…',
        addTag: '添加标签',
        addClone: '添加到分身',
        cloneEmpty: '暂无分身',
        cloneLoading: '正在读取分身…',
        cloneUnavailable: '分身管理不可用',
        cloneRunning: '运行中，需先停止',
        cloneInstalled: '已在分身中',
        cloneAdded: '已添加到「{name}」',
        cloneAddedPartial: '已添加 {added} 个，{failed} 个失败',
        cloneAddFailed: '添加失败：{reason}',
        cloneRestartHint: '重启该分身生效',
        cloneNoSelection: '先选择插件',
        batch: '批量操作',
        batchSelectAll: '全选',
        batchDeselectAll: '取消全选',
        batchDone: '完成',
        batchCount: '已选择 {n} 项',
        batchTag: '批量添加标签',
        batchClone: '批量添加到分身',
        batchUninstall: '批量卸载…',
        batchUninstallTitle: '批量卸载插件',
        batchUninstallBody: '将卸载选中的 {n} 个插件，它们提供的功能会消失。',
        batchUninstallConfirm: '卸载 {n} 个',
        batchUninstallDone: '已卸载 {n} 个插件',
        batchUninstallPartial: '{n} 个中 {failed} 个失败：{reason}',
        batchEmpty: '先选择插件',
        batchTagEmpty: '暂无标签',
        systemTags: '系统标签',
        myTags: '我的标签',
        colon: '：',
        dialogTitle: '重命名插件',
        origName: '原名称',
        origDesc: '原简介',
        displayName: '显示名称',
        displayDesc: '显示简介',
        namePlaceholder: '留空则显示原名',
        descPlaceholder: '留空则显示原简介',
        hint: '只改列表里显示的文字，不影响插件本身。',
        save: '保存',
        cancel: '取消',
        restore: '恢复默认',
        saveFailed: '保存失败，已还原',
        conflict: '状态已更新，请重试',
        loadFailed: '状态加载失败',
        tagInvalid: '标签名需 1–12 个字符',
        tagDuplicated: '已有同名标签',
        tagSystem: '不能与系统标签同名',
        deleteTag: '删除标签',
        tagCurrent: '当前',
        tagEmptyHint: '暂无标签，可在筛选栏 ＋ 新建',
        stateRecovered: '状态文件损坏，已备份并重置',
        guardUnavailable: '安装拦截不可用，插件可能被自动启用',
        emptyFiltered: '没有带「{tag}」标签的插件',
        emptySearch: '没有匹配「{q}」的插件',
        filterLabel: '按标签筛选',
        searchPlaceholder: '搜索名称或简介',
        searchLabel: '搜索插件',
        orderMode: '调整顺序',
        orderModeOn: '完成排序',
        orderHint: '拖拽卡片调整当前标签下的顺序',
        sortLabel: '排序',
        sortCustom: '自定义顺序',
        sortNameAsc: '名称 A→Z',
        sortNameDesc: '名称 Z→A',
        sortEnabled: '启用优先',
        sortVersion: '版本 高→低',
        sortRecent: '最近出现 新→旧',
        iconChange: '更改图标…',
        iconDialogTitle: '更改插件图标',
        iconAdd: '添加',
        iconEmpty: '还没有上传图标',
        iconDefault: '恢复默认',
        iconDelete: '删除',
        iconDeleteConfirm: '确认删除',
        iconDeleteCancel: '取消删除',
        iconDeleteHint: '选择要删除的图标（上传与内置图标都可删除）',
        iconDeleteNone: '请先选择要删除的图标',
        iconDeleteDone: '已删除 {n} 个图标',
        iconDeleteFailed: '删除失败：{reason}',
        iconUploading: '上传中…',
        iconUploadFailed: '图标上传失败',
        iconLimit: '图标库已满（最多 100 个）',
        iconBadFile: '只支持 png/jpg/webp/gif/svg/ico 或 zip',
        uninstallMenu: '卸载…',
        uninstallTitle: '卸载插件',
        uninstallBody: '卸载「{name}」后，它提供的功能会消失。',
        uninstallConfirm: '卸载',
        uninstallDone: '已卸载 {name}',
        uninstallFailed: '卸载失败：{reason}',
        aiButton: 'AI 生成名称简介',
        aiRunning: '生成中…第 {n} 次',
        aiNotConfigured: 'AI 未配置',
        aiDone: '已生成，可修改后保存',
        aiFailed: 'AI 生成失败',
        aiHint: '在后台按提示词生成并直接改好名称与简介。',
        aiPromptEdit: '修改提示词',
        aiPromptTitle: 'AI 提示词',
        aiPromptHint: '提示词中的 {name}、{description}、{existingNames} 会自动替换成当前插件信息。留空则使用默认提示词。',
        aiPromptReset: '恢复默认',
        aiPromptTooLong: '提示词过长（上限 8000 字符）',
        aiSaved: '提示词已保存',
        aiGenerating: 'AI 正在后台生成…',
        aiModelHint: '将使用 DSH 模型：{model}',
        aiConfigHint: '将使用已配置的模型：{model}',
        aiModelPick: '选择模型',
        aiModelFollow: '跟随默认模型',
        aiModelMenuTitle: 'AI 模型',
        aiModelLoading: '正在读取模型…',
        aiModelNone: '没有可用模型',
        aiModelTools: '提示：两种调用都不带工具定义，只发系统提示词与对话；最多 3 轮。',
        aiPickSaved: '已切换 AI 模型：{model}',
        aiModeDirect: '直连 API',
        aiModeNative: 'DSH 原生调用',
        aiSuccessRename: '插件「{old}」已重命名为「{new}」',
        aiSuccess: '插件「{name}」已修改名称简介',
        aiFailedReason: 'AI 生成失败：{reason}',
      },
      en: {
        all: 'All',
        builtin: 'Built-in',
        experimental: 'Experimental',
        installed: 'Installed',
        enabled: 'Enabled',
        disabled: 'Disabled',
        add: '＋ New tag',
        addGlyph: '+',
        addPlaceholder: 'New tag name',
        rename: 'Rename…',
        addTag: 'Add tag',
        addClone: 'Add to clones',
        cloneEmpty: 'No instances',
        cloneLoading: 'Loading instances…',
        cloneUnavailable: 'Instance manager unavailable',
        cloneRunning: 'Running — stop it first',
        cloneInstalled: 'Already in this instance',
        cloneAdded: 'Added to “{name}”',
        cloneAddedPartial: 'Added {added}, {failed} failed',
        cloneAddFailed: 'Add failed: {reason}',
        cloneRestartHint: 'Restart that instance to apply',
        cloneNoSelection: 'Select plugins first',
        batch: 'Batch',
        batchSelectAll: 'Select all',
        batchDeselectAll: 'Deselect all',
        batchDone: 'Done',
        batchCount: '{n} selected',
        batchTag: 'Tag selected',
        batchClone: 'Add selected to clones',
        batchUninstall: 'Uninstall selected…',
        batchUninstallTitle: 'Uninstall plugins',
        batchUninstallBody: 'This uninstalls {n} plugins; what they provide goes away.',
        batchUninstallConfirm: 'Uninstall {n}',
        batchUninstallDone: 'Uninstalled {n} plugins',
        batchUninstallPartial: '{failed} of {n} failed: {reason}',
        batchEmpty: 'Select plugins first',
        batchTagEmpty: 'No tags yet',
        systemTags: 'System tags',
        myTags: 'My tags',
        colon: ': ',
        dialogTitle: 'Rename plugin',
        origName: 'Original name',
        origDesc: 'Original description',
        displayName: 'Display name',
        displayDesc: 'Display description',
        namePlaceholder: 'Empty to use the original name',
        descPlaceholder: 'Empty to use the original description',
        hint: 'Changes the list text only — the plugin itself is untouched.',
        save: 'Save',
        cancel: 'Cancel',
        restore: 'Restore default',
        saveFailed: 'Save failed — reverted',
        conflict: 'State changed, try again',
        loadFailed: 'Could not load state',
        tagInvalid: 'Tag names must be 1–12 characters',
        tagDuplicated: 'That tag name already exists',
        tagSystem: 'Cannot reuse a system tag name',
        deleteTag: 'Delete tag',
        tagCurrent: 'Current',
        tagEmptyHint: 'No tags yet — create one with ＋',
        stateRecovered: 'State file was corrupt — backed up and reset',
        guardUnavailable: 'Install guard unavailable — the plugin may be auto-enabled',
        emptyFiltered: 'No plugins tagged “{tag}”',
        emptySearch: 'No plugins matching “{q}”',
        filterLabel: 'Filter by tag',
        searchPlaceholder: 'Search name or description',
        searchLabel: 'Search plugins',
        orderMode: 'Adjust order',
        orderModeOn: 'Done ordering',
        orderHint: 'Drag cards to reorder them under this tag',
        sortLabel: 'Sort',
        sortCustom: 'Custom order',
        sortNameAsc: 'Name A→Z',
        sortNameDesc: 'Name Z→A',
        sortEnabled: 'Enabled first',
        sortVersion: 'Version high→low',
        sortRecent: 'Recently seen first',
        iconChange: 'Change icon…',
        iconDialogTitle: 'Change plugin icon',
        iconAdd: 'Add',
        iconEmpty: 'No uploaded icons yet',
        iconDefault: 'Restore default',
        iconDelete: 'Delete',
        iconDeleteConfirm: 'Delete selected',
        iconDeleteCancel: 'Cancel',
        iconDeleteHint: 'Select icons to delete (uploaded and built-in)',
        iconDeleteNone: 'Select at least one icon first',
        iconDeleteDone: 'Deleted {n} icon(s)',
        iconDeleteFailed: 'Delete failed: {reason}',
        iconUploading: 'Uploading…',
        iconUploadFailed: 'Icon upload failed',
        iconLimit: 'Icon library is full (100 max)',
        iconBadFile: 'Only png/jpg/webp/gif/svg/ico or zip',
        uninstallMenu: 'Uninstall…',
        uninstallTitle: 'Uninstall plugin',
        uninstallBody: 'Once “{name}” is uninstalled, what it provides goes away.',
        uninstallConfirm: 'Uninstall',
        uninstallDone: 'Uninstalled {name}',
        uninstallFailed: 'Uninstall failed: {reason}',
        aiButton: 'AI generate name & description',
        aiRunning: 'Generating… attempt {n}',
        aiNotConfigured: 'AI not configured',
        aiDone: 'Generated — edit and save',
        aiFailed: 'AI generation failed',
        aiHint: 'Generates in the background and applies the name and description directly.',
        aiPromptEdit: 'Edit prompt',
        aiPromptTitle: 'AI prompt',
        aiPromptHint: 'Placeholders {name}, {description} and {existingNames} are filled with the current plugin. Leave blank to use the default prompt.',
        aiPromptReset: 'Restore default',
        aiPromptTooLong: 'Prompt is too long (8000 characters max)',
        aiSaved: 'Prompt saved',
        aiGenerating: 'AI is generating in the background…',
        aiModelHint: 'Using DSH model: {model}',
        aiConfigHint: 'Using configured model: {model}',
        aiModelPick: 'Choose model',
        aiModelFollow: 'Follow default model',
        aiModelMenuTitle: 'AI model',
        aiModelLoading: 'Loading models…',
        aiModelNone: 'No models available',
        aiModelTools: 'Both paths send only the system prompt and the conversation — no tool definitions — with at most 3 rounds.',
        aiPickSaved: 'AI model switched to {model}',
        aiModeDirect: 'Direct API',
        aiModeNative: 'Native DSH call',
        aiSuccessRename: 'Plugin “{old}” renamed to “{new}”',
        aiSuccess: 'Plugin “{name}” renamed with a new description',
        aiFailedReason: 'AI generation failed: {reason}',
      },
    }
    const t = (key, vars) => {
      const dict = DICT[LANG] || DICT.zh
      let text = dict[key] != null ? dict[key] : key
      if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
      return text
    }

    // store
    const store = {
      loaded: false,
      error: '',
      rev: 0,
      data: { version: 4, updatedAt: 0, tags: [], assignments: {}, overrides: {}, orders: {}, seen: {}, icons: [], aiPrompt: '', hiddenIcons: [], aiPick: '' },
      filter: null, // null | { kind:'system', id } | { kind:'user', tagId }
      search: '', // in-memory text filter (F5)
      sort: 'custom', // F6: custom | name-asc | name-desc | enabled | version | recent
      orderMode: false, // F7 drag ordering
      batch: false, // F13 batch mode
      selection: new Set(), // F13 selected card keys while batch mode is on
      bundles: null, // last listBundles() snapshot (enabled/version/removable)
      bundlesAt: 0,
      aiConfigured: null, // null unknown | true | false
      aiModel: '', // model label reported by GET /ai/status
      aiSource: '', // 'config' | 'dsh' | 'none'
      aiModels: null, // GET /ai/models payload (v0.7 model picker)
      aiModelsAt: 0,
      aiModelsBusy: false,
      listeners: new Set(),
    }
    let ctxRef = null
    let disposed = false
    // The host may report a recovered corrupt state file in the value or beside it.
    let lastRecovery = null
    let recoveryNotified = false

    const notify = () => {
      for (const listener of [...store.listeners]) {
        try {
          listener()
        } catch {
          /* ignored */
        }
      }
      schedule()
    }

    const EMPTY_STATE = () => ({ version: 4, updatedAt: 0, tags: [], assignments: {}, overrides: {}, orders: {}, seen: {}, icons: [], aiPrompt: '', hiddenIcons: [], aiPick: '' })

    // Model-selection value: '' follows the DSH default; anything else is
    // `provider/model` (the host re-validates it).
    // P2-2 (v0.7.1): model ids may themselves contain `/` (e.g. `vendor/model`);
    // only the first segment is the provider.
    const AI_PICK_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+$/
    function normaliseAiPick(value) {
      return typeof value === 'string' && AI_PICK_PATTERN.test(value) ? value.slice(0, 120) : ''
    }

    const PARTITION_SYSTEMS = new Set(SYSTEM.map((entry) => entry.id))
    // The order partition a view belongs to (F6/F7: one order list per tag).
    function partitionKey() {
      const filter = store.filter
      if (!filter) return 'all'
      if (filter.kind === 'system') return isStateSystemId(filter.id) ? 'all' : 'sys:' + filter.id
      if (filter.kind === 'user') return 'tag:' + filter.tagId
      return 'all'
    }

    function normaliseList(raw, keep) {
      const out = []
      if (!Array.isArray(raw)) return out
      for (const item of raw) {
        if (typeof item !== 'string' || !item) continue
        if (keep && !keep(item)) continue
        if (!out.includes(item)) out.push(item)
      }
      return out.slice(0, 500)
    }

    function normaliseState(raw) {
      const out = EMPTY_STATE()
      if (!raw || typeof raw !== 'object') return out
      out.updatedAt = Number(raw.updatedAt) || 0
      if (Array.isArray(raw.tags)) {
        for (const tag of raw.tags) {
          if (!tag || typeof tag.id !== 'string' || typeof tag.label !== 'string') continue
          out.tags.push({ id: tag.id, label: tag.label, createdAt: Number(tag.createdAt) || 0 })
        }
      }
      const tagIds = new Set(out.tags.map((tag) => tag.id))
      if (raw.assignments && typeof raw.assignments === 'object') {
        for (const key of Object.keys(raw.assignments)) {
          const list = raw.assignments[key]
          if (!Array.isArray(list)) continue
          const ids = list.filter((id) => typeof id === 'string' && tagIds.has(id))
          if (ids.length) out.assignments[key] = [...new Set(ids)]
        }
      }
      if (raw.icons && Array.isArray(raw.icons)) {
        for (const icon of raw.icons) {
          if (!icon || typeof icon.id !== 'string' || !icon.id) continue
          out.icons.push({
            id: icon.id,
            name: typeof icon.name === 'string' ? icon.name : '',
            mime: typeof icon.mime === 'string' ? icon.mime : '',
            size: Number(icon.size) || 0,
            createdAt: Number(icon.createdAt) || 0,
          })
        }
      }
      const iconIds = new Set(out.icons.map((icon) => icon.id))
      if (raw.overrides && typeof raw.overrides === 'object') {
        for (const key of Object.keys(raw.overrides)) {
          const value = raw.overrides[key]
          if (!value || typeof value !== 'object') continue
          const entry = {}
          if (typeof value.name === 'string') entry.name = value.name
          if (typeof value.description === 'string') entry.description = value.description
          if (typeof value.icon === 'string' && (iconIds.has(value.icon) || BUILTIN_ICON_ID_SET.has(value.icon))) entry.icon = value.icon
          if (entry.name !== undefined || entry.description !== undefined || entry.icon !== undefined) out.overrides[key] = entry
        }
      }
      if (raw.orders && typeof raw.orders === 'object') {
        for (const key of Object.keys(raw.orders)) {
          if (key !== 'all' && !/^(sys|tag):/.test(key)) continue
          if (key.startsWith('sys:') && !PARTITION_SYSTEMS.has(key.slice(4))) continue
          if (key.startsWith('tag:') && !tagIds.has(key.slice(4))) continue
          const list = normaliseList(raw.orders[key])
          if (list.length) out.orders[key] = list
        }
      }
      if (typeof raw.aiPrompt === 'string') out.aiPrompt = raw.aiPrompt.slice(0, 8000)
      out.aiPick = normaliseAiPick(raw.aiPick)
      if (Array.isArray(raw.hiddenIcons)) {
        for (const id of raw.hiddenIcons) {
          if (typeof id === 'string' && BUILTIN_ICON_ID_SET.has(id) && !out.hiddenIcons.includes(id)) out.hiddenIcons.push(id)
        }
      }
      if (raw.seen && typeof raw.seen === 'object') {
        for (const key of Object.keys(raw.seen)) {
          if (!/^(pkg|item):/.test(key)) continue
          const at = raw.seen[key]
          const ms = typeof at === 'number' ? at : Date.parse(at)
          // host contract: seen values must be ISO strings (see host validateSeen)
          if (Number.isFinite(ms)) out.seen[key] = new Date(ms).toISOString()
        }
      }
      return out
    }

    function adopt(payload, recovery) {
      if (!payload) return
      const nextState = normaliseState(payload.state)
      const nextRev = Number(payload.rev) || 0
      const marker = recovery || (payload.recovered ? { recovered: true, backupPath: payload.backupPath || '' } : null)
      if (marker && marker.recovered) reportRecovery(marker)
      // Polling/focus refreshes are side-effect free while rev is unchanged.
      // A late response for an older rev must never roll the store back (N1),
      // unless the host reported a recovered/reset state file.
      if (store.loaded && !store.error && nextRev < store.rev && !(marker && marker.recovered)) return
      const unchanged = store.loaded && !store.error && nextRev === store.rev
      if (unchanged) return
      store.data = nextState
      store.rev = nextRev
      store.loaded = true
      store.error = ''
      if (store.filter && store.filter.kind === 'user' && !store.data.tags.some((tag) => tag.id === store.filter.tagId)) {
        store.filter = null
      }
      notify()
    }

    function reportRecovery(info) {
      if (recoveryNotified || !info) return
      recoveryNotified = true
      toast(t('stateRecovered'))
      if (info.backupPath) {
        console.warn('[plugin-manager-plus] state file was corrupt; backup written to', info.backupPath)
      } else {
        console.warn('[plugin-manager-plus] state file was corrupt; the host reset it')
      }
    }

    // host API
    // A hung request must not leave stateBusy stuck (N4): race a 4s timeout.
    const REQUEST_TIMEOUT_MS = 4000
    async function fetchWithTimeout(url, options, timeoutMs) {
      const limit = Number(timeoutMs) > 0 ? Number(timeoutMs) : REQUEST_TIMEOUT_MS
      let controller = null
      try {
        if (typeof AbortController === 'function') controller = new AbortController()
      } catch {
        controller = null
      }
      let timer = 0
      const timeout = new Promise((_resolve, reject) => {
        timer = window.setTimeout(() => {
          try {
            if (controller) controller.abort()
          } catch {
            /* ignored */
          }
          const error = Error('request timed out')
          error.timeout = true
          reject(error)
        }, limit)
      })
      try {
        const signal = controller ? { signal: controller.signal } : {}
        return await Promise.race([fetch(url, { ...options, ...signal }), timeout])
      } finally {
        window.clearTimeout(timer)
      }
    }

    async function api(path, init, timeoutMs) {
      const response = await fetchWithTimeout(ROOT + path, {
        credentials: 'same-origin',
        ...(init || {}),
        headers: { 'content-type': 'application/json', ...(init && init.headers ? init.headers : {}) },
      }, timeoutMs)
      const text = await response.text()
      let body = {}
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        body = {}
      }
      if (!response.ok || body.ok !== true) {
        const error = Error((body && body.error && body.error.message) || `HTTP ${response.status}`)
        error.status = response.status
        error.payload = body && body.value
        throw error
      }
      if (body && body.recovered) lastRecovery = { recovered: true, backupPath: body.backupPath || '' }
      else if (body && body.value && body.value.recovered) {
        lastRecovery = { recovered: true, backupPath: body.value.backupPath || '' }
      }
      return body.value
    }

    const takeRecovery = () => {
      const value = lastRecovery
      lastRecovery = null
      return value
    }

    let stateBusy = false
    async function loadState() {
      if (disposed || stateBusy) return
      stateBusy = true
      try {
        const value = await api('/state')
        adopt(value, takeRecovery())
      } catch (error) {
        const message = String((error && error.message) || error)
        if (store.error !== message || !store.loaded) {
          store.error = message
          store.loaded = true
          console.warn('[plugin-manager-plus] state unavailable:', message)
          notify()
        }
      } finally {
        stateBusy = false
      }
    }

    // Optimistic write; a 409 re-adopts the newest state and replays the
    // mutator up to 3 times before giving up (spec §6.8 / §9).
    const CONFLICT_RETRIES = 3
    async function mutate(mutator, options) {
      const silent = !!(options && options.silent)
      const fail = (key) => {
        if (!silent) toast(t(key))
      }
      const previous = JSON.parse(JSON.stringify(store.data))
      const previousRev = store.rev
      let draft = JSON.parse(JSON.stringify(store.data))
      let result
      try {
        result = mutator(draft)
      } catch (error) {
        toast(String((error && error.message) || error))
        return { ok: false, result: undefined }
      }
      draft.updatedAt = Date.now()
      store.data = normaliseState(draft)
      notify()
      let rev = previousRev
      for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt += 1) {
        try {
          adopt(await api('/state', { method: 'PUT', body: JSON.stringify({ state: draft, rev }) }))
          return { ok: true, result }
        } catch (error) {
          if (error && error.status === 409 && error.payload && attempt < CONFLICT_RETRIES) {
            adopt(error.payload, takeRecovery())
            rev = store.rev
            draft = JSON.parse(JSON.stringify(store.data))
            try {
              result = mutator(draft)
            } catch (mutationError) {
              toast(String((mutationError && mutationError.message) || mutationError))
              return { ok: false, result: undefined }
            }
            draft.updatedAt = Date.now()
            store.data = normaliseState(draft)
            notify()
            continue
          }
          if (error && error.status === 409 && error.payload) {
            adopt(error.payload, takeRecovery())
            fail('conflict')
          } else {
            store.data = previous
            store.rev = previousRev
            notify()
            fail('saveFailed')
          }
          return { ok: false, result: undefined }
        }
      }
      return { ok: false, result: undefined }
    }

    // ---- v0.2 host helpers (F5–F10) ---------------------------------------
    // The host runs up to `maxAttempts` (default 3) model rounds of 30s each, so the
    // client must out-wait all of them instead of aborting in the middle.
    const AI_TIMEOUT_MS = 120000
    const ICON_TIMEOUT_MS = 20000

    function pluginManagerApi() {
      try {
        return ctxRef && ctxRef.remote && ctxRef.remote.pluginManager ? ctxRef.remote.pluginManager : null
      } catch {
        return null
      }
    }

    function bundleInfo(name) {
      if (!store.bundles || !name) return null
      return Object.prototype.hasOwnProperty.call(store.bundles, name) ? store.bundles[name] : null
    }

    let bundlesBusy = false
    async function refreshBundles(force) {
      const manager = pluginManagerApi()
      if (!manager || typeof manager.listBundles !== 'function') return false
      if (!force && store.bundles && Date.now() - store.bundlesAt < 5000) return true
      if (bundlesBusy) return false
      bundlesBusy = true
      try {
        const value = await manager.listBundles()
        const rows = Array.isArray(value) ? value : value && Array.isArray(value.bundles) ? value.bundles : []
        const map = {}
        for (const row of rows) {
          if (row && typeof row.name === 'string') map[row.name] = row
        }
        store.bundles = map
        store.bundlesAt = Date.now()
        notify()
        return true
      } catch {
        return false
      } finally {
        bundlesBusy = false
      }
    }

    async function refreshAiStatus(force) {
      if (!force && typeof store.aiConfigured === 'boolean') return store.aiConfigured
      try {
        const value = await api('/ai/status')
        store.aiConfigured = !!(value && value.configured)
        store.aiModel = value && typeof value.model === 'string' ? value.model : ''
        store.aiSource = value && typeof value.source === 'string' ? value.source : ''
      } catch {
        store.aiConfigured = false
        store.aiModel = ''
        store.aiSource = ''
      }
      return store.aiConfigured
    }

    async function aiRename(name, description, prompt, existingNames, pick) {
      const body = {
        name: name || '',
        description: description || '',
        prompt: typeof prompt === 'string' ? prompt : '',
        existingNames: Array.isArray(existingNames) ? existingNames : [],
      }
      if (pick && typeof pick === 'object') {
        const provider = typeof pick.provider === 'string' ? pick.provider.trim() : ''
        const model = typeof pick.model === 'string' ? pick.model.trim() : ''
        if (provider && model) body.pick = { provider, model }
      }
      return api('/ai/rename', { method: 'POST', body: JSON.stringify(body) }, AI_TIMEOUT_MS)
    }

    // v0.7 model picker: providers/models come from the host (llm registry) and
    // are cached briefly; a pick is stored in state as `provider/model`.
    async function loadAiModels(force) {
      if (!force && store.aiModels && Date.now() - store.aiModelsAt < 60000) return store.aiModels
      if (store.aiModelsBusy) return store.aiModels
      store.aiModelsBusy = true
      try {
        const value = await api('/ai/models', {}, 15000)
        if (value && Array.isArray(value.providers)) {
          store.aiModels = value
          store.aiModelsAt = Date.now()
        }
      } catch {
        /* keep the old list; the menu shows an empty state */
      } finally {
        store.aiModelsBusy = false
      }
      return store.aiModels
    }

    function aiPickParts() {
      const value = normaliseAiPick(store.loaded && store.data ? store.data.aiPick : '')
      if (!value) return null
      const slash = value.indexOf('/')
      if (slash <= 0) return null
      return { provider: value.slice(0, slash), model: value.slice(slash + 1) }
    }

    function aiPickLabel() {
      const pick = aiPickParts()
      // Keep the provider prefix: two providers may expose the same model id, and the
      // button must read the same right after choosing and after reopening the dialog
      // (BUG-V7-1). CSS truncates long labels with an ellipsis.
      if (!pick) return t('aiModelFollow')
      return pick.provider + '/' + pick.model
    }

    async function uploadIcons(payload) {
      return api('/icons', { method: 'POST', body: JSON.stringify(payload) }, ICON_TIMEOUT_MS)
    }

    async function uninstallBundle(name) {
      const manager = pluginManagerApi()
      if (!manager || typeof manager.removeBundle !== 'function') {
        throw Error('removeBundle unavailable')
      }
      return manager.removeBundle(name)
    }

    // small DOM helpers
    function h(tag, props, children) {
      const node = document.createElement(tag)
      if (props) {
        for (const key of Object.keys(props)) {
          const value = props[key]
          if (value == null || value === false) continue
          if (key === 'text') node.textContent = String(value)
          else if (key === 'class') node.className = String(value)
          else if (key === 'on') {
            for (const type of Object.keys(value)) node.addEventListener(type, value[type])
          } else if (key === 'dataset') {
            for (const name of Object.keys(value)) node.dataset[name] = String(value[name])
          } else node.setAttribute(key, value === true ? '' : String(value))
        }
      }
      if (children != null) {
        for (const child of Array.isArray(children) ? children : [children]) {
          if (child == null || child === false) continue
          node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
        }
      }
      return node
    }

    const trim = (text) => (text == null ? '' : String(text)).trim()

    // card identity + original values (cached once per card node)
    function cardKey(card) {
      const pkg = card.getAttribute('data-plugin-package')
      if (pkg) return 'pkg:' + pkg
      const item = card.getAttribute('data-plugin-item')
      if (item) return 'item:' + item
      return ''
    }

    function titleButton(card) {
      const candidate = card.querySelector('button')
      if (candidate && trim(candidate.textContent)) return candidate
      return null
    }

    // --- surface contract v1 ---------------------------------------------
    // The native plugin page is an implicit surface; other host pages opt in by
    // declaring data-plugin-surface / -version / -caps. Everything painted goes
    // through titleEl()/hostDesc()/iconSlot() so the same painter serves both.
    function titleEl(card) {
      const explicit = card.querySelector('[data-plugin-title]')
      if (explicit) return explicit
      return titleButton(card)
    }

    // Name text of a title element, ignoring the inline "[data-pmod-orig]"
    // hint we may have appended for stacked surfaces (BUG-V5-2).
    function titleNameText(title) {
      if (!title) return ''
      let out = ''
      for (const node of title.childNodes) {
        if (node.nodeType === 3) out += node.nodeValue || ''
        else if (node.nodeType === 1 && !(node.hasAttribute && node.hasAttribute('data-pmod-orig'))) out += node.textContent || ''
      }
      return out
    }

    // Adopters may wrap the title in a flex row (like the native titleRow).
    // Without one, a sibling hint becomes its own line on a stacked card.
    function hasTitleRow(holder) {
      return !!(holder && holder.hasAttribute && holder.hasAttribute('data-plugin-title-row'))
    }

    function isNativeCard(card) {
      return !!card.closest('[data-plugin-panel]')
    }

    function surfaceDescriptor(root) {
      if (root.getAttribute('data-plugin-surface-version') !== SURFACE_VERSION) return null
      // Contract v1: an absent/empty caps attribute means "declare nothing", so
      // the enhancer must not touch the page at all (no bar, no paint, no menu).
      if (!root.hasAttribute('data-plugin-caps')) return null
      const caps = new Set(String(root.getAttribute('data-plugin-caps') || '').split(/\s+/).filter(Boolean))
      if (!caps.size) return null
      return {
        kind: 'external',
        root,
        caps,
        scope: root.getAttribute('data-plugin-scope') || 'global',
        id: root.getAttribute('data-plugin-surface') || 'external',
      }
    }

    function surfaceOf(card) {
      const panel = card.closest('[data-plugin-panel]')
      if (panel) return { kind: 'native', root: panel, caps: NATIVE_CAPS, scope: 'global' }
      const root = card.closest('[data-plugin-surface]')
      if (!root) return null
      return surfaceDescriptor(root)
    }

    function listSurfaces() {
      const surfaces = []
      for (const panel of document.querySelectorAll('[data-plugin-panel]')) {
        surfaces.push({ kind: 'native', root: panel, caps: NATIVE_CAPS, scope: 'global' })
      }
      for (const root of document.querySelectorAll('[data-plugin-surface]')) {
        if (root.closest('[data-plugin-panel]')) continue
        // The native page keeps its own attribute so third-party code can detect
        // it; it is not a second surface.
        if (root.getAttribute('data-plugin-surface') === 'native') continue
        const descriptor = surfaceDescriptor(root)
        if (descriptor) surfaces.push(descriptor)
      }
      return surfaces
    }

    function surfaceList(surface) {
      const explicit = surface.root.querySelector('[data-plugin-list]')
      if (explicit) return explicit
      const firstCard = surface.root.querySelector(CARD_SELECTOR)
      return firstCard ? firstCard.parentElement : null
    }

    // Host description node: explicit slot first, else the native cardDesc.
    function hostDesc(card) {
      const explicit = card.querySelector('[data-plugin-desc]')
      if (explicit) return explicit
      if (!isNativeCard(card)) return null
      const button = titleButton(card)
      if (!button) return null
      const titleRow = button.parentElement
      const cardMain = titleRow && titleRow.parentElement
      if (!cardMain) return null
      return descNode(card, cardMain, titleRow)
    }

    // The native description node is the first non-title child of cardMain.
    function descNode(card, cardMain, titleRow) {
      for (const child of cardMain.children) {
        if (child === titleRow) continue
        if (child.hasAttribute('data-pmod-desc')) continue
        return child
      }
      return null
    }

    function captureOriginal(card) {
      const key = cardKey(card)
      const override = (key && store.data.overrides[key]) || {}
      const painted = typeof override.name === 'string' && trim(override.name) ? trim(override.name) : ''
      const title = titleEl(card)
      if (!title) return
      const text = trim(titleNameText(title))
      // Never capture our own painted title as the "original" (R8: the native
      // text may not have re-rendered yet after a locale switch).
      if (painted && text === painted) return
      card.dataset.pmodOrig = text
      const aria = isNativeCard(card) ? title.getAttribute('aria-label') || '' : ''
      card.dataset.pmodOrigAria = painted && aria.includes(painted) ? (card.dataset.pmodOrigAria || '') : aria
      const desc = hostDesc(card)
      card.dataset.pmodOrigDesc = desc ? trim(desc.textContent) : ''
      card.dataset.pmodCaptured = '1'
    }

    const overridesFor = (key) => (key && store.data.overrides[key]) || {}

    // painting: title / small original name / description
    // Restore the host icon when the surface does not grant the `icon` capability
    // (contract v1: a cap that is not listed must not be written at all).
    function clearIcon(card) {
      const slot = iconSlot(card)
      if (!slot) return
      const stale = slot.querySelector('[data-pmod-ico]')
      if (stale) stale.remove()
      for (const child of slot.children) {
        if (child.style && child.style.display === 'none') child.style.display = ''
      }
      slot.removeAttribute('data-pmod-icon')
    }

    function paintCard(card) {
      const key = cardKey(card)
      if (!key) return
      const title = titleEl(card)
      if (!title) return
      const holder = title.parentElement
      if (!holder) return
      const native = isNativeCard(card)
      const surface = surfaceOf(card)
      const caps = surface ? surface.caps : NATIVE_CAPS
      const canRename = caps.has('rename')
      const canDesc = caps.has('desc')
      const canIcon = caps.has('icon')

      if (!card.dataset.pmodCaptured) captureOriginal(card)
      const origName = card.dataset.pmodOrig || ''
      const origDesc = card.dataset.pmodOrigDesc || ''
      const override = overridesFor(key)
      const custom = typeof override.name === 'string' && trim(override.name) ? trim(override.name) : ''
      const name = canRename ? custom : ''
      // Description overrides belong to package cards only (N9): an injected
      // item: override would hide the card's native interactive content.
      const hasDescOverride = canDesc && key.startsWith('pkg:') && Object.prototype.hasOwnProperty.call(override, 'description')

      // --- title text -------------------------------------------------
      // Stacked surfaces (title block + description block in one column, like
      // the instance settings sub-pages) cannot host a sibling hint: it would
      // render as a third line. There we inline the hint inside the title.
      const inlineOrig = !native && !hasTitleRow(holder)
      const wantedTitle = name || origName
      if (inlineOrig) {
        const head = title.firstChild
        if (head && head.nodeType === 3) {
          if (head.nodeValue !== wantedTitle) head.nodeValue = wantedTitle
        } else {
          title.insertBefore(document.createTextNode(wantedTitle), title.firstChild || null)
        }
      } else if (titleNameText(title) !== wantedTitle) {
        title.textContent = wantedTitle
      }

      // --- small original name next to (or inside) the title ----------
      // Search the whole card: a surface can switch between the stacked layout
      // (hint inside the title) and a title row (hint beside it) while the page
      // stays mounted, so a stale hint may sit on either side. Keep exactly one
      // hint and park it at its current layout position.
      let origSpan = null
      for (const node of card.querySelectorAll('[data-pmod-orig]')) {
        if (origSpan) node.remove()
        else origSpan = node
      }
      if (name && origName) {
        if (!origSpan) origSpan = h('span', { class: 'pmod-orig', 'data-pmod-orig': '', 'aria-hidden': 'true' })
        if (inlineOrig) {
          if (origSpan.parentElement !== title || origSpan.nextSibling) title.appendChild(origSpan)
        } else if (origSpan.parentElement !== holder || origSpan.previousElementSibling !== title) {
          if (title.nextSibling) holder.insertBefore(origSpan, title.nextSibling)
          else holder.appendChild(origSpan)
        }
        if (origSpan.textContent !== origName) origSpan.textContent = origName
      } else if (origSpan) {
        origSpan.remove()
      }

      // --- aria-label keeps the accessible name in sync (native only) --
      const aria = native ? card.dataset.pmodOrigAria || '' : ''
      if (aria && title.tagName === 'BUTTON') {
        const wanted = name ? aria.split(origName).join(name) : aria
        if (title.getAttribute('aria-label') !== wanted) title.setAttribute('aria-label', wanted)
      }

      // --- description ------------------------------------------------
      const hostNode = hostDesc(card)
      const descHost = native ? holder.parentElement || holder : holder
      // P2-1 (v0.7.1): a running layout switch can leave the injected node in
      // the previous holder; keep a single copy and move it into the current one.
      let ourDesc = null
      for (const node of card.querySelectorAll('[data-pmod-desc]')) {
        if (ourDesc) node.remove()
        else ourDesc = node
      }
      const baseDesc = hostNode ? trim(hostNode.textContent) : origDesc
      if (hasDescOverride) {
        if (hostNode) {
          hostNode.style.display = 'none'
          hostNode.setAttribute('data-pmod-hid', '')
        }
        if (ourDesc && ourDesc.parentElement !== descHost) descHost.appendChild(ourDesc)
        if (!ourDesc) {
          ourDesc = h('span', { class: 'pmod-desc', 'data-pmod-desc': '' })
          if (native) descHost.appendChild(ourDesc)
          else if (title.nextSibling) descHost.insertBefore(ourDesc, title.nextSibling)
          else descHost.appendChild(ourDesc)
        }
        const text = override.description || ''
        // An explicit empty description hides the injected row (spec §9).
        ourDesc.style.display = text ? '' : 'none'
        // v0.7: only the custom description is rendered — the original one is
        // not repeated as a hint. On stacked cards that hint used to become a
        // third line (name / custom description / original description).
        const full = text
        if (ourDesc.dataset.pmodFull !== full) {
          ourDesc.textContent = ''
          ourDesc.dataset.pmodFull = full
          if (text) ourDesc.appendChild(document.createTextNode(text))
        }
        if (ourDesc.dataset.pmodFullBase !== baseDesc) ourDesc.dataset.pmodFullBase = baseDesc
      } else {
        if (hostNode && hostNode.style.display === 'none') {
          hostNode.style.display = ''
          hostNode.removeAttribute('data-pmod-hid')
        }
        if (ourDesc) ourDesc.remove()
      }

      if (card.dataset.pmodKey !== key) card.dataset.pmodKey = key
      if (canIcon) paintIcon(card, key, override)
      else clearIcon(card)
    }

    // ---- icon library (F9) ------------------------------------------------
    const SVG_OPEN = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    const BUILTIN_ICONS = [
      ['cube', '<path d="M12 3l8 4.5v9L12 21 4 16.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>'],
      ['sparkles', '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>'],
      ['bolt', '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'],
      ['bubble', '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-5.4A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7z"/><path d="M8.5 11h7M8.5 14.5h4"/>'],
      ['gear', '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.4 12l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>'],
      ['shield', '<path d="M12 3l7 3v6c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>'],
      ['heart', '<path d="M12 20S4 15 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15 12 20 12 20z"/>'],
      ['star', '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.7l5.9-.8z"/>'],
      ['terminal', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9l3.5 3L7 15M12.5 15H17"/>'],
      ['database', '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'],
      ['globe', '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5S14.3 18.2 12 20.5C9.7 18.2 8.5 15.2 8.5 12S9.7 5.8 12 3.5z"/>'],
      ['code', '<path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 4l-3 16"/>'],
      ['palette', '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-.8-2-.8-3c0-1.2 1-2 2.3-2H18a3.5 3.5 0 0 0 3-3.5C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.2" r="1.2"/>'],
      ['rocket', '<path d="M14 4c3 1 5 3 6 6-2.5 4-6 6.5-9.5 7.5L8 15 5.5 17.5 4 14c1-3.5 3.5-7 7.5-9.5z"/><circle cx="14.5" cy="9.5" r="1.6"/><path d="M7 17l-2 3"/>'],
      ['book', '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/><path d="M8 7h7"/>'],
      ['clock', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'],
      ['cloud', '<path d="M7 18a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17 18z"/>'],
      ['grid', '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'],
    ].map(([id, paths]) => ({ id, svg: SVG_OPEN + paths + '</svg>' }))

    const BUILTIN_ICON_ID_SET = new Set(BUILTIN_ICONS.map((icon) => icon.id))
    const hiddenIconSet = () => new Set(Array.isArray(store.data.hiddenIcons) ? store.data.hiddenIcons : [])
    // Deleting a built-in icon hides it from the library and from existing
    // overrides (the bytes live in code, so "delete" means "remove from view").
    const builtinIcon = (id) => (hiddenIconSet().has(id) ? null : BUILTIN_ICONS.find((icon) => icon.id === id) || null)
    const visibleBuiltinIcons = () => BUILTIN_ICONS.filter((icon) => !hiddenIconSet().has(icon.id))
    const uploadedIcon = (id) => store.data.icons.find((icon) => icon.id === id) || null

    function iconSlot(card) {
      // Surface contract: an explicit icon slot wins; the native layout keeps
      // the 48px box as the first child of the head row.
      const explicit = card.querySelector('[data-plugin-icon]')
      if (explicit) return explicit
      const head = card.firstElementChild
      if (!head) return null
      const slot = head.firstElementChild
      if (!slot || slot.nodeType !== 1) return null
      return slot
    }

    function paintIcon(card, key, override) {
      const slot = iconSlot(card)
      if (!slot) return
      const iconId = typeof override.icon === 'string' ? override.icon : ''
      const builtin = iconId ? builtinIcon(iconId) : null
      const uploaded = iconId ? uploadedIcon(iconId) : null
      let node = null
      for (const child of slot.children) {
        if (child.hasAttribute && child.hasAttribute('data-pmod-ico')) node = child
      }
      if (!builtin && !uploaded) {
        if (node) node.remove()
        for (const child of slot.children) {
          if (child.style && child.style.display === 'none') child.style.display = ''
        }
        slot.removeAttribute('data-pmod-icon')
        return
      }
      slot.setAttribute('data-pmod-icon', iconId)
      const wantTag = builtin ? 'span' : 'img'
      if (node && node.tagName.toLowerCase() !== wantTag) {
        node.remove()
        node = null
      }
      if (!node) {
        node = builtin
          ? h('span', { class: 'pmod-ico', 'data-pmod-ico': '', 'aria-hidden': 'true' })
          : h('img', { class: 'pmod-ico', 'data-pmod-ico': '', alt: '', width: '40', height: '40' })
        slot.appendChild(node)
      }
      if (builtin) {
        const signature = 'b:' + iconId
        if (node.dataset.pmodIco !== signature) {
          node.innerHTML = builtin.svg
          node.dataset.pmodIco = signature
        }
      } else {
        const signature = 'u:' + iconId
        if (node.dataset.pmodIco !== signature) {
          node.setAttribute('src', ROOT + '/icons/' + encodeURIComponent(iconId))
          node.dataset.pmodIco = signature
        }
      }
      for (const child of slot.children) {
        if (child === node) continue
        if (child.style && child.style.display !== 'none') child.style.display = 'none'
      }
    }

    // ---- text search (F5) -------------------------------------------------
    const normText = (text) => String(text == null ? '' : text).normalize('NFKC').toLowerCase()
    const normLoose = (text) => normText(text).replace(/[\s\p{P}\p{S}]+/gu, '')

    function isSubsequence(needle, haystack) {
      if (!needle) return true
      let index = 0
      for (const char of haystack) {
        if (char === needle[index]) index += 1
        if (index >= needle.length) return true
      }
      return false
    }

    function cardMatchesSearch(card, key) {
      const raw = trim(store.search)
      if (!raw) return true
      const override = overridesFor(key)
      const button = titleEl(card)
      const nativeName = card.dataset.pmodOrig || (button ? trim(button.textContent) : '')
      const names = [nativeName, typeof override.name === 'string' ? override.name : '']
      const needle = normText(raw)
      for (const name of names) {
        if (name && normText(name).includes(needle)) return true
      }
      if (!key.startsWith('pkg:')) return false
      const looseNeedle = normLoose(raw)
      if (!looseNeedle) return false
      const descs = [
        card.dataset.pmodOrigDesc || '',
        typeof override.description === 'string' ? override.description : '',
      ]
      return descs.some((desc) => desc && isSubsequence(looseNeedle, normLoose(desc)))
    }

    // ---- ordering (F6/F7) -------------------------------------------------
    const SORT_OPTIONS = ['custom', 'name-asc', 'name-desc', 'enabled', 'version', 'recent']
    const sortKey = (id) => 'sort' + id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')

    function displayName(card, key) {
      const surface = surfaceOf(card)
      const caps = surface ? surface.caps : NATIVE_CAPS
      const override = overridesFor(key)
      const custom = typeof override.name === 'string' && trim(override.name) ? trim(override.name) : ''
      const name = caps.has('rename') ? custom : ''
      if (name) return name
      const button = titleEl(card)
      return (card.dataset.pmodOrig || (button ? trim(button.textContent) : '')).toLowerCase()
    }

    function normalisedOrder(partition, cards) {
      const keys = cards.map((card) => cardKey(card))
      const known = []
      const stored = store.data.orders[partition]
      if (Array.isArray(stored)) {
        for (const key of stored) {
          if (keys.includes(key) && !known.includes(key)) known.push(key)
        }
      }
      for (const key of keys) {
        if (!known.includes(key)) known.push(key)
      }
      return known
    }

    function orderedKeys(partition, cards) {
      const keys = cards.map((card) => cardKey(card))
      if (store.sort === 'custom' || !cards.length) return normalisedOrder(partition, cards)
      const byKey = new Map(cards.map((card, index) => [cardKey(card), { card, index }]))
      const version = (key) => {
        const row = bundleInfo(key.slice(4))
        return row && row.version ? String(row.version) : ''
      }
      const seenAt = (key) => Date.parse(store.data.seen[key]) || 0
      const sorted = [...keys]
      const compare = (left, right) => {
        const a = byKey.get(left)
        const b = byKey.get(right)
        if (store.sort === 'name-asc' || store.sort === 'name-desc') {
          const an = displayName(a.card, left)
          const bn = displayName(b.card, right)
          const order = an.localeCompare(bn, LANG === 'en' ? 'en' : 'zh-Hans-CN')
          return store.sort === 'name-asc' ? order : -order
        }
        if (store.sort === 'enabled') {
          const ae = bundleInfo(left.slice(4))
          const be = bundleInfo(right.slice(4))
          const av = ae && ae.enabled ? 0 : 1
          const bv = be && be.enabled ? 0 : 1
          return av - bv || a.index - b.index
        }
        if (store.sort === 'version') {
          const av = version(left)
          const bv = version(right)
          const order = av === bv ? 0 : av < bv ? 1 : -1
          return order || a.index - b.index
        }
        if (store.sort === 'recent') {
          return seenAt(right) - seenAt(left) || a.index - b.index
        }
        return a.index - b.index
      }
      sorted.sort(compare)
      return sorted
    }

    function applyOrdering(surface) {
      if (!surface.caps.has('order')) return
      const panel = surface.root
      const partition = partitionKey()
      for (const section of panel.querySelectorAll(GROUP_SELECTOR)) {
        const cards = [...section.querySelectorAll(CARD_SELECTOR)]
        if (!cards.length) continue
        const sequence = orderedKeys(partition, cards)
        for (let index = 0; index < cards.length; index += 1) {
          const card = cards[index]
          const slot = sequence.indexOf(cardKey(card))
          const value = String(slot >= 0 ? slot : sequence.length + index)
          if (card.style.order !== value) card.style.order = value
        }
      }
      const more = panel.querySelector('[data-plugin-group="more"]')
      if (more) {
        for (const card of more.querySelectorAll(CARD_SELECTOR)) {
          if (card.style.order) card.style.order = ''
        }
      }
    }

    // filtering (never reorders nodes, only writes inline display)
    function cardVisibleUnder(card, key, filter) {
      if (!filter) return true
      if (filter.kind === 'system') return true // sections handle system filtering
      const list = store.data.assignments[key]
      return Array.isArray(list) && list.includes(filter.tagId)
    }

    function applyFilter() {
      const filter = store.filter
      const searching = !!trim(store.search)
      for (const surface of listSurfaces()) {
        // Loading suppresses filtering: native cards are replaced by the
        // skeleton, and painting display there would hide stale nodes.
        if (surface.root.querySelector('[data-plugin-loading]')) continue
        if (surface.kind === 'native') {
          const panel = surface.root
          for (const section of panel.querySelectorAll(GROUP_SELECTOR)) {
            const group = section.getAttribute('data-plugin-group')
            let visible = 0
            const cards = section.querySelectorAll(CARD_SELECTOR)
            for (const card of cards) {
              const key = cardKey(card)
              let show = true
              if (filter && filter.kind === 'system') {
                if (isStateSystemId(filter.id)) show = cardEnabledState(card) === (filter.id === 'enabled')
                else show = filter.groupOf === group
              }
              if (show && filter && filter.kind === 'user') show = cardVisibleUnder(card, key, filter)
              if (show && searching) show = cardMatchesSearch(card, key)
              if (card.style.display !== (show ? '' : 'none')) card.style.display = show ? '' : 'none'
              if (show) visible += 1
            }
            const restricted = !!filter || searching
            const sectionVisible = restricted ? visible > 0 : true
            if (section.style.display !== (sectionVisible ? '' : 'none')) section.style.display = sectionVisible ? '' : 'none'
          }
          const more = panel.querySelector('[data-plugin-group="more"]')
          if (more) {
            for (const card of more.querySelectorAll(CARD_SELECTOR)) {
              if (card.style.display) card.style.display = ''
            }
          }
          applyOrdering(surface)
          continue
        }
        // External surface: it has no native groups, so a system tag filter
        // does not apply (the bar hides those pills there).
        for (const card of surface.root.querySelectorAll(CARD_SELECTOR)) {
          const key = cardKey(card)
          let show = true
          if (filter && filter.kind === 'user') show = cardVisibleUnder(card, key, filter)
          if (show && searching) show = cardMatchesSearch(card, key)
          if (card.style.display !== (show ? '' : 'none')) card.style.display = show ? '' : 'none'
        }
      }
      paintEmptyState()
      // v0.8.1 (P2-4): `applyFilter` just rewrote `style.display`, so the
      // batch counter and the select-all label must be recomputed now;
      // renderBar ran before this point and would otherwise lag one tick.
      syncBatchChrome()
    }

    function paintEmptyState() {
      for (const surface of listSurfaces()) {
        const root = surface.root
        const filter = store.filter
        const query = trim(store.search)
        const effective = filter && surface.kind === 'external' && filter.kind === 'system' ? null : filter
        let host = root.querySelector('[data-pmod-empty]')
        if ((!effective && !query) || root.querySelector('[data-plugin-loading]')) {
          if (host) host.remove()
          continue
        }
        const anyVisible =
          surface.kind === 'native'
            ? [...root.querySelectorAll(GROUP_SELECTOR)].some((section) => section.style.display !== 'none')
            : [...root.querySelectorAll(CARD_SELECTOR)].some((card) => card.style.display !== 'none')
        if (anyVisible) {
          if (host) host.remove()
          continue
        }
        const container = surface.kind === 'native' ? listContainer(root) : surfaceList(surface)
        if (!container) continue
        const parent = container.parentElement || root
        if (!host) {
          host = h('div', { class: 'pmod-empty', 'data-pmod-empty': '' })
          parent.insertBefore(host, container)
        }
        const text = effective
          ? t('emptyFiltered', { tag: effective.kind === 'system' ? t(effective.id) : filterLabel(effective) })
          : t('emptySearch', { q: query })
        if (host.textContent !== text) host.textContent = text
      }
    }

    const filterLabel = (filter) => {
      if (!filter) return ''
      if (filter.kind === 'system') return t(filter.id)
      const tag = store.data.tags.find((entry) => entry.id === filter.tagId)
      return tag ? tag.label : ''
    }

    // ---- batch selection (F13) --------------------------------------------
    function selectedKeys() {
      const keys = []
      for (const key of store.selection) {
        if (cardByKey(key)) keys.push(key)
      }
      return keys
    }

    function toggleSelected(key) {
      if (!key) return
      if (store.selection.has(key)) store.selection.delete(key)
      else store.selection.add(key)
      schedule()
    }

    function visibleCards() {
      const cards = []
      for (const surface of listSurfaces()) {
        if (surface.root.querySelector('[data-plugin-loading]')) continue
        if (surface.kind === 'native') {
          for (const section of surface.root.querySelectorAll(GROUP_SELECTOR)) {
            if (section.style.display === 'none') continue
            for (const card of section.querySelectorAll(CARD_SELECTOR)) {
              if (card.style.display === 'none') continue
              if (cardKey(card)) cards.push(card)
            }
          }
          continue
        }
        for (const card of surface.root.querySelectorAll(CARD_SELECTOR)) {
          if (card.style.display === 'none') continue
          if (cardKey(card)) cards.push(card)
        }
      }
      return cards
    }

    // Batch actions only ever touch cards the user can still see: a selection can
    // outlive a filter/search change, and "批量卸载" is destructive, so hidden
    // cards must never be silently included (review v0.3 P1).
    function selectedVisibleKeys() {
      const visible = new Set(visibleCards().map((card) => cardKey(card)))
      const keys = []
      for (const key of store.selection) {
        if (visible.has(key) && cardByKey(key)) keys.push(key)
      }
      return keys
    }

    function allVisibleSelected() {
      const cards = visibleCards()
      return cards.length > 0 && cards.every((card) => store.selection.has(cardKey(card)))
    }

    // v0.8.1 (P2-4): cheap, idempotent refresh of the batch-only chrome.
    function syncBatchChrome() {
      if (!store.batch) return
      const count = selectedVisibleKeys().length
      const all = allVisibleSelected()
      for (const bar of document.querySelectorAll('[data-pmod-bar]')) {
        const status = bar.querySelector('[data-pmod-batch-status]')
        if (status) {
          const label = t('batchCount', { n: count })
          if (status.textContent !== label) status.textContent = label
        }
        const selectAll = bar.querySelector('[data-pmod-selectall]')
        if (selectAll) {
          const label = t(all ? 'batchDeselectAll' : 'batchSelectAll')
          if (selectAll.textContent !== label) selectAll.textContent = label
          selectAll.classList.toggle('pmod-tool-on', all)
        }
      }
    }

    function selectAllVisible() {
      const cards = visibleCards()
      if (!cards.length) return
      const clear = cards.every((card) => store.selection.has(cardKey(card)))
      for (const card of cards) {
        const key = cardKey(card)
        if (clear) store.selection.delete(key)
        else store.selection.add(key)
      }
      schedule()
    }

    function enterBatch() {
      if (store.batch) return
      closeMenu()
      store.batch = true
      store.selection.clear()
      store.orderMode = false
      finishDrag()
      schedule()
    }

    function exitBatch() {
      if (!store.batch) return
      store.batch = false
      store.selection.clear()
      closeMenu()
      schedule()
    }

    function pruneSelection() {
      if (!store.selection.size) return
      for (const key of [...store.selection]) {
        if (!cardByKey(key)) store.selection.delete(key)
      }
    }

    function paintSelection() {
      for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        const key = cardKey(card)
        const on = !!(store.batch && key && store.selection.has(key))
        const marked = card.getAttribute('data-pmod-selected') === '1'
        if (on && !marked) card.setAttribute('data-pmod-selected', '1')
        else if (!on && marked) card.removeAttribute('data-pmod-selected')
      }
    }

    // filter bar
    const transients = new Set()
    function track(node) {
      transients.add(node)
      return node
    }
    function untrack(node) {
      transients.delete(node)
      if (node && node.parentNode) node.parentNode.removeChild(node)
    }

    function listContainer(panel) {
      const first = panel.querySelector(ANY_GROUP_SELECTOR)
      if (first) return first.parentElement
      // While loading, the groups are absent and the panel holds only the
      // skeleton; the bar must still sit before that container (spec §6.3).
      const loading = panel.querySelector('[data-plugin-loading]')
      if (!loading) return null
      let node = loading
      while (node && node.parentElement && node.parentElement !== panel) node = node.parentElement
      return node && node.parentElement === panel ? node : null
    }

    function ensureBar(surface) {
      const root = surface.root
      const existing = surface.kind === 'native' ? root.querySelector(':scope > [data-pmod-bar]') : root.querySelector('[data-pmod-bar]')
      const container = surface.kind === 'native' ? listContainer(root) : surfaceList(surface)
      const hasMainList =
        surface.kind === 'native'
          ? !!root.querySelector(GROUP_SELECTOR) || !!root.querySelector('[data-plugin-loading]')
          : !!container
      if (!hasMainList || !container) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
        return null
      }
      const bar = existing || buildBar()
      const caps = [...surface.caps].join(' ')
      if (bar.getAttribute('data-pmod-bar-caps') !== caps) bar.setAttribute('data-pmod-bar-caps', caps)
      if (bar.getAttribute('data-pmod-bar-surface') !== surface.kind) bar.setAttribute('data-pmod-bar-surface', surface.kind)
      // On the native page the bar must stay a direct child of the panel,
      // immediately before the list container (native CSS keys off direct
      // children); on a declared surface it sits right before the list.
      const parent = surface.kind === 'native' ? root : container.parentElement || root
      if (bar.parentElement !== parent || bar.nextElementSibling !== container) {
        parent.insertBefore(bar, container)
      }
      renderBar(bar)
      return bar
    }

    function buildBar() {
      const bar = h('div', {
        class: 'pmod-bar',
        'data-pmod-bar': '',
        role: 'toolbar',
        'aria-label': t('filterLabel'),
      })
      const pillsRow = h('div', { class: 'pmod-row pmod-row-pills' })
      pillsRow.appendChild(h('div', { class: 'pmod-pills', 'data-pmod-pills': '' }))
      bar.appendChild(pillsRow)

      const tools = h('div', { class: 'pmod-row pmod-tools' })
      const search = h('input', {
        class: 'pmod-search',
        type: 'search',
        'data-pmod-search': '',
        placeholder: t('searchPlaceholder'),
        'aria-label': t('searchLabel'),
        autocomplete: 'off',
        spellcheck: 'false',
      })
      search.addEventListener('input', () => {
        store.search = search.value
        schedule()
      })
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          search.value = ''
          store.search = ''
          schedule()
        }
      })
      tools.appendChild(search)
      // F13: while batch mode is on the single "Batch" button splits into
      // "Select all" + "Done" (spec §2.1), always left of "Adjust order".
      const batch = h('button', {
        class: 'pmod-tool',
        'data-pmod-batch': '',
        type: 'button',
        'aria-pressed': 'false',
        text: t('batch'),
      })
      batch.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        enterBatch()
      })
      tools.appendChild(batch)
      const selectAll = h('button', {
        class: 'pmod-tool',
        'data-pmod-selectall': '',
        type: 'button',
        'aria-pressed': 'false',
        text: t('batchSelectAll'),
      })
      selectAll.style.display = 'none'
      selectAll.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        selectAllVisible()
      })
      tools.appendChild(selectAll)
      const done = h('button', {
        class: 'pmod-tool',
        'data-pmod-batch-done': '',
        type: 'button',
        text: t('batchDone'),
      })
      done.style.display = 'none'
      done.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        exitBatch()
      })
      tools.appendChild(done)
      // Live region: screen readers hear the selection count without opening the
      // context menu (review v0.3 P2-3, copy key `batchCount`).
      const batchStatus = h('span', {
        class: 'pmod-batch-status',
        'data-pmod-batch-status': '',
        role: 'status',
        'aria-live': 'polite',
      })
      batchStatus.style.display = 'none'
      tools.appendChild(batchStatus)
      const order = h('button', {
        class: 'pmod-tool',
        'data-pmod-order': '',
        type: 'button',
        'aria-pressed': 'false',
        text: t('orderMode'),
      })
      order.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleOrderMode()
      })
      tools.appendChild(order)
      const sort = h('button', {
        class: 'pmod-tool pmod-sort',
        'data-pmod-sort': '',
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        text: t('sortLabel'),
      })
      sort.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        openSortMenu(sort)
      })
      tools.appendChild(sort)
      bar.appendChild(tools)
      return bar
    }

    function barSignature() {
      return JSON.stringify([
        store.loaded ? 1 : 0,
        store.error ? 1 : 0,
        store.data.tags.map((tag) => tag.id + ':' + tag.label),
        store.filter ? store.filter.kind + ':' + (store.filter.tagId || store.filter.id) : '',
        LANG,
      ])
    }

    function barCaps(bar) {
      return new Set(String(bar.getAttribute('data-pmod-bar-caps') || '').split(/\s+/).filter(Boolean))
    }

    function renderBar(bar) {
      const pillsHost = bar.querySelector('[data-pmod-pills]')
      if (!pillsHost) return
      const caps = barCaps(bar)
      const nativeSurface = bar.getAttribute('data-pmod-bar-surface') !== 'external'
      const signature = barSignature() + '|' + [...caps].sort().join(',') + '|' + (nativeSurface ? 'n' : 'e')
      if (bar.dataset.pmodEditing !== '1' && pillsHost.dataset.pmodSig !== signature) {
        pillsHost.dataset.pmodSig = signature
        pillsHost.textContent = ''
        bar.setAttribute('aria-label', t('filterLabel'))

        pillsHost.appendChild(makePill('all', t('all'), !store.filter, () => setFilter(null)))
        // v0.9: the default pills are just "All" plus the two derived state
        // tags. The native surface already renders the built-in / experimental
        // / installed group sections, so repeating them as filters was noise.
        // A surface without native groups only offers "All" plus user tags
        // (contract v1).
        if (nativeSurface) {
          for (const system of STATE_SYSTEM) {
            const active = !!store.filter && store.filter.kind === 'system' && store.filter.id === system.id
            pillsHost.appendChild(makePill('system', t(system.id), active, () => toggleSystem(system.id), { id: system.id }))
          }
        }
        // Tags are an opt-in capability: a surface without `tags` gets "All"
        // only and never sees the new-tag affordance (contract v1).
        if (caps.has('tags')) {
          for (const tag of store.data.tags) {
            const active = !!store.filter && store.filter.kind === 'user' && store.filter.tagId === tag.id
            pillsHost.appendChild(makePill('user', tag.label, active, () => toggleUser(tag.id), tag))
          }
          pillsHost.appendChild(h('button', {
            class: 'pmod-pill pmod-add',
            'data-pmod-add': '',
            type: 'button',
            title: t('add'),
            text: store.data.tags.length ? t('addGlyph') : t('add'),
            on: { click: (event) => { event.preventDefault(); event.stopPropagation(); openTagInput(bar) } },
          }))
        }
        if (store.error) {
          pillsHost.appendChild(h('span', { class: 'pmod-status', 'data-pmod-status': 'error', title: t('loadFailed'), text: '!' }))
        } else if (!store.loaded) {
          pillsHost.appendChild(h('span', { class: 'pmod-status', 'data-pmod-status': 'loading', text: '…' }))
        }
      }

      const search = bar.querySelector('[data-pmod-search]')
      if (search) {
        if (search.getAttribute('placeholder') !== t('searchPlaceholder')) {
          search.setAttribute('placeholder', t('searchPlaceholder'))
          search.setAttribute('aria-label', t('searchLabel'))
        }
        if (document.activeElement !== search && search.value !== store.search) search.value = store.search
        const searchVisible = caps.has('search')
        if (search.style.display !== (searchVisible ? '' : 'none')) search.style.display = searchVisible ? '' : 'none'
      }

      // Capability gating: an entry the surface did not declare is not painted
      // at all (contract v1: absent caps means dropped entry, not disabled).
      const canBatch = caps.has('batch')
      const canOrder = caps.has('order')
      const batchButton = bar.querySelector('[data-pmod-batch]')
      if (batchButton) {
        if (batchButton.textContent !== t('batch')) batchButton.textContent = t('batch')
        const show = canBatch && !store.batch
        if (batchButton.style.display !== (show ? '' : 'none')) batchButton.style.display = show ? '' : 'none'
        batchButton.classList.toggle('pmod-tool-on', store.batch)
      }
      const selectAll = bar.querySelector('[data-pmod-selectall]')
      if (selectAll) {
        const label = t(allVisibleSelected() ? 'batchDeselectAll' : 'batchSelectAll')
        if (selectAll.textContent !== label) selectAll.textContent = label
        const show = canBatch && store.batch
        if (selectAll.style.display !== (show ? '' : 'none')) selectAll.style.display = show ? '' : 'none'
        selectAll.classList.toggle('pmod-tool-on', show && allVisibleSelected())
      }
      const batchDone = bar.querySelector('[data-pmod-batch-done]')
      if (batchDone) {
        if (batchDone.textContent !== t('batchDone')) batchDone.textContent = t('batchDone')
        const show = canBatch && store.batch
        if (batchDone.style.display !== (show ? '' : 'none')) batchDone.style.display = show ? '' : 'none'
      }
      const batchStatus = bar.querySelector('[data-pmod-batch-status]')
      if (batchStatus) {
        const show = canBatch && store.batch
        const count = show ? selectedVisibleKeys().length : 0
        const label = show ? t('batchCount', { n: count }) : ''
        if (batchStatus.textContent !== label) batchStatus.textContent = label
        if (batchStatus.style.display !== (show ? '' : 'none')) batchStatus.style.display = show ? '' : 'none'
      }
      const order = bar.querySelector('[data-pmod-order]')
      if (order) {
        const stateFilter = !!store.filter && store.filter.kind === 'system' && isStateSystemId(store.filter.id)
        const show = canOrder && !store.batch && !stateFilter
        if (order.style.display !== (show ? '' : 'none')) order.style.display = show ? '' : 'none'
        const label = t(store.orderMode ? 'orderModeOn' : 'orderMode')
        if (order.textContent !== label) order.textContent = label
        if (order.getAttribute('aria-pressed') !== (store.orderMode ? 'true' : 'false')) {
          order.setAttribute('aria-pressed', store.orderMode ? 'true' : 'false')
        }
        order.classList.toggle('pmod-tool-on', store.orderMode)
      }

      const sort = bar.querySelector('[data-pmod-sort]')
      if (sort) {
        const label = t('sortLabel') + ' · ' + t(sortKey(store.sort))
        if (sort.textContent !== label) sort.textContent = label
        // v0.8: a cross-section state filter hides the whole ordering pair.
        const stateFilter = !!store.filter && store.filter.kind === 'system' && isStateSystemId(store.filter.id)
        const sortVisible = canOrder && !stateFilter
        if (sort.style.display !== (sortVisible ? '' : 'none')) sort.style.display = sortVisible ? '' : 'none'
      }
    }

    function toggleOrderMode() {
      if (!store.orderMode && store.filter && store.filter.kind === 'system' && isStateSystemId(store.filter.id)) return
      store.orderMode = !store.orderMode
      if (store.orderMode) {
        store.sort = 'custom'
        // Batch selection and drag ordering are mutually exclusive (spec §2.1).
        if (store.batch) {
          store.batch = false
          store.selection.clear()
        }
      }
      schedule()
      if (store.orderMode) toast(t('orderHint'))
    }

    // ---- sort dropdown (F6) -----------------------------------------------
    let sortMenuNode = null
    let sortMenuCleanup = null

    function closeSortMenu() {
      if (sortMenuNode && sortMenuNode.parentNode) sortMenuNode.parentNode.removeChild(sortMenuNode)
      sortMenuNode = null
      if (sortMenuCleanup) sortMenuCleanup()
      sortMenuCleanup = null
      for (const button of document.querySelectorAll('[data-pmod-sort]')) button.setAttribute('aria-expanded', 'false')
    }

    function openSortMenu(anchor) {
      closeSortMenu()
      const menu = h('div', {
        class: 'pmod-menu pmod-sortmenu',
        'data-pmod-sortmenu': '',
        role: 'menu',
        'aria-label': t('sortLabel'),
      })
      for (const id of SORT_OPTIONS) {
        const active = store.sort === id
        const item = h('button', {
          class: 'pmod-menu-item' + (active ? ' pmod-menu-item-on' : ''),
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': active ? 'true' : 'false',
          'data-sort-id': id,
        }, [
          h('span', { class: 'pmod-menu-label', text: t(sortKey(id)) }),
          active ? h('span', { class: 'pmod-menu-mark', 'aria-hidden': 'true', text: '✓' }) : null,
        ])
        item.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          store.sort = id
          if (id !== 'custom') store.orderMode = false
          if (id === 'enabled' || id === 'version' || id === 'recent') void refreshBundles(false)
          closeSortMenu()
          schedule()
        })
        menu.appendChild(item)
      }
      document.body.appendChild(menu)
      positionPopup(menu, anchor.getBoundingClientRect())
      anchor.setAttribute('aria-expanded', 'true')
      const outside = (event) => {
        if (menu.contains(event.target) || event.target === anchor) return
        closeSortMenu()
      }
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeSortMenu()
          anchor.focus()
        }
      }
      document.addEventListener('mousedown', outside, true)
      document.addEventListener('keydown', onKey, true)
      sortMenuCleanup = () => {
        document.removeEventListener('mousedown', outside, true)
        document.removeEventListener('keydown', onKey, true)
      }
      sortMenuNode = menu
      const current = menu.querySelector('[role="menuitemradio"][aria-checked="true"]') || menu.firstElementChild
      if (current) current.focus()
    }

    // Place a popup under an anchor rect, flipping up/left when it would leave
    // the viewport (F11: no popup may overflow the window).
    function positionPopup(popup, rect) {
      const width = popup.offsetWidth
      const height = popup.offsetHeight
      const margin = 8
      let left = rect.right - width
      if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
      if (left < margin) left = margin
      let top = rect.bottom + 6
      if (top + height > window.innerHeight - margin) top = rect.top - height - 6
      if (top < margin) top = margin
      popup.style.left = left + 'px'
      popup.style.top = top + 'px'
    }

    // ---- drag ordering (F7) -----------------------------------------------
    // v0.3 (B1/B2): never rewrite the native order while dragging. Reordering
    // in place under the pointer made cards hop around (stale :hover, jittery
    // drop targets, "cannot drop in the gap"). Instead a thin insertion line is
    // painted on the target card and the whole order is committed once on drop.
    let dragCard = null
    let dragPartition = ''
    let dragIndex = -1
    let dragPointY = 0
    let dragRaf = 0
    let dragIndicator = null
    let dragScrollBound = false
    let dropSuppressUntil = 0

    function dragCardOf(event) {
      const target = event.target && event.target.closest ? event.target.closest(CARD_SELECTOR) : null
      return target
    }

    function clearDragVisuals() {
      if (dragRaf) {
        window.cancelAnimationFrame(dragRaf)
        dragRaf = 0
      }
      if (dragIndicator) {
        dragIndicator.style.boxShadow = ''
        dragIndicator = null
      }
      if (dragCard) dragCard.classList.remove('pmod-dragging')
    }

    function unbindDragScroll() {
      if (!dragScrollBound) return
      dragScrollBound = false
      document.removeEventListener('scroll', onDragScroll, true)
    }

    function finishDrag() {
      clearDragVisuals()
      dragCard = null
      dragPartition = ''
      dragIndex = -1
      dragPointY = 0
      unbindDragScroll()
    }

    // Cards in the same list, in the order the user currently sees them
    // (style.order is what applyOrdering writes; DOM order is only the tie).
    function dragSiblings(card) {
      const parent = card && card.parentElement
      if (!parent) return []
      const others = [...parent.querySelectorAll(CARD_SELECTOR)].filter(
        (item) => item !== card && item.style.display !== 'none',
      )
      return others.sort((left, right) => {
        const a = Number(left.style.order)
        const b = Number(right.style.order)
        if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b
        return 0
      })
    }

    function dropIndexAt(y) {
      if (!dragCard) return 0
      const others = dragSiblings(dragCard)
      const mids = others.map((item) => {
        const rect = item.getBoundingClientRect()
        return rect.top + rect.height / 2
      })
      let index = mids.findIndex((mid) => y < mid)
      if (index < 0) index = others.length
      // Hysteresis: keep the current slot while the pointer stays comfortably
      // inside it, so the insertion line does not flicker around a midpoint.
      if (dragIndex >= 0 && dragIndex <= others.length) {
        const lower = dragIndex > 0 ? mids[dragIndex - 1] : -Infinity
        const upper = dragIndex < mids.length ? mids[dragIndex] : Infinity
        if (y > lower + 6 && y < upper - 6) index = dragIndex
      }
      return index
    }

    function showDropLine(index) {
      if (dragIndicator) {
        dragIndicator.style.boxShadow = ''
        dragIndicator = null
      }
      if (!dragCard) return
      const others = dragSiblings(dragCard)
      if (!others.length) return
      const target = index >= others.length ? others[others.length - 1] : others[index]
      if (!target || target === dragCard) return
      const edge = index >= others.length ? 'after' : 'before'
      target.style.boxShadow =
        edge === 'before'
          ? 'inset 0 2px 0 0 var(--dsw-alias-state-business-primary)'
          : 'inset 0 -2px 0 0 var(--dsw-alias-state-business-primary)'
      dragIndicator = target
    }

    function dragInsideList(event) {
      if (!dragCard || !dragCard.parentElement) return false
      const rect = dragCard.parentElement.getBoundingClientRect()
      return (
        event.clientX >= rect.left - 48 &&
        event.clientX <= rect.right + 48 &&
        event.clientY >= rect.top - 24 &&
        event.clientY <= rect.bottom + 24
      )
    }

    function onDragScroll() {
      if (!dragCard || dragRaf) return
      scheduleDropIndex()
    }

    function scheduleDropIndex() {
      if (dragRaf) return
      dragRaf = window.requestAnimationFrame(() => {
        dragRaf = 0
        if (!dragCard) return
        const index = dropIndexAt(dragPointY)
        if (index !== dragIndex || !dragIndicator) {
          dragIndex = index
          showDropLine(index)
        }
      })
    }

    function onDragStart(event) {
      if (!store.orderMode || store.batch) return
      const card = dragCardOf(event)
      if (!card || card.getAttribute('data-pmod-draggable') !== '1') return
      finishDrag()
      dragCard = card
      dragPartition = partitionKey()
      dragIndex = -1
      card.classList.add('pmod-dragging')
      if (!dragScrollBound) {
        dragScrollBound = true
        document.addEventListener('scroll', onDragScroll, true)
      }
      try {
        if (event.dataTransfer) {
          event.dataTransfer.setData('text/plain', cardKey(card))
          event.dataTransfer.effectAllowed = 'move'
        }
      } catch {
        /* ignored */
      }
    }

    function onDragOver(event) {
      if (!store.orderMode || store.batch || !dragCard) return
      if (!dragInsideList(event)) {
        // Outside the source list: let the browser reject the drop.
        if (dragIndicator) {
          dragIndicator.style.boxShadow = ''
          dragIndicator = null
        }
        return
      }
      // Anywhere inside the list rect counts (gaps included), so releasing in
      // the whitespace between two cards no longer cancels the move (B2).
      event.preventDefault()
      try {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      } catch {
        /* ignored */
      }
      dragPointY = event.clientY
      scheduleDropIndex()
    }

    async function onDrop(event) {
      if (!store.orderMode || store.batch || !dragCard) return
      if (!dragInsideList(event)) {
        finishDrag()
        schedule()
        return
      }
      event.preventDefault()
      dragPointY = event.clientY
      const card = dragCard
      const partition = dragPartition || partitionKey()
      const siblings = dragSiblings(card).map((item) => cardKey(item)).filter(Boolean)
      const draggedKey = cardKey(card)
      let index = dropIndexAt(event.clientY)
      finishDrag()
      dropSuppressUntil = Date.now() + 400
      if (!draggedKey || !siblings.length) {
        schedule()
        return
      }
      index = Math.max(0, Math.min(index, siblings.length))
      const anchor = siblings[index]
      const all = normalisedOrder(partition, [...card.parentElement.querySelectorAll(CARD_SELECTOR)])
      const sequence = all.filter((key) => key !== draggedKey)
      let insertAt = anchor ? sequence.indexOf(anchor) : sequence.length
      if (insertAt < 0) insertAt = sequence.length
      sequence.splice(insertAt, 0, draggedKey)
      const current = store.data.orders[partition] || []
      if (JSON.stringify(sequence) === JSON.stringify(current)) {
        schedule()
        return
      }
      await mutate((draft) => {
        draft.orders = draft.orders || {}
        draft.orders[partition] = sequence
      }, { silent: true })
      schedule()
    }

    function onDragEnd() {
      finishDrag()
      schedule()
    }

    // While ordering, a plain click on a card must not open its detail page,
    // and the click that ends a drop must be swallowed (F7). In batch mode a
    // click toggles the card selection instead (F13).
    function onOrderCaptureClick(event) {
      if (Date.now() < dropSuppressUntil) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return
      }
      if (store.batch) {
        const target = event.target
        if (!target || typeof target.closest !== 'function') return
        if (target.closest(CARD_SELECTOR)) {
          if (target.closest('[role="switch"], input, [data-pmod-bar], [data-pmod-menu], [data-pmod-sortmenu], [data-pmod-mask]')) return
          const card = target.closest(CARD_SELECTOR)
          const surface = surfaceOf(card)
          if (!surface || !surface.caps.has('batch')) return
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          toggleSelected(cardKey(card))
        }
        return
      }
      if (!store.orderMode) return
      const card = event.target && event.target.closest ? event.target.closest(CARD_SELECTOR) : null
      if (!card) return
      const surface = surfaceOf(card)
      if (!surface || !surface.caps.has('order')) return
      if (event.target.closest && event.target.closest('[role="switch"], [data-pmod-search]')) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }


    function makePill(kind, label, active, onClick, tag) {
      const props = {
        class: 'pmod-pill' + (active ? ' pmod-pill-on' : ''),
        type: 'button',
        'data-pmod-pill': kind,
        'aria-pressed': active ? 'true' : 'false',
        title: label,
        text: label,
        on: {
          click: (event) => {
            event.preventDefault()
            event.stopPropagation()
            onClick()
          },
        },
      }
      if (kind === 'system') props['data-system'] = tag && tag.id ? tag.id : label
      if (kind === 'user' && tag) {
        props['data-tag'] = tag.id
        props.on.contextmenu = (event) => {
          event.preventDefault()
          event.stopPropagation()
          menuForTagsAt(event.clientX, event.clientY, tag)
        }
      }
      return h('button', props)
    }

    function setFilter(filter) {
      store.filter = filter
      notify()
    }

    function toggleSystem(id) {
      const active = !!store.filter && store.filter.kind === 'system' && store.filter.id === id
      if (active) return setFilter(null)
      const system = FILTER_SYSTEM.find((entry) => entry.id === id)
      // A cross-section state filter has no coherent manual order: leave it.
      if (isStateSystemId(id) && store.orderMode) {
        store.orderMode = false
        finishDrag()
      }
      setFilter({ kind: 'system', id, groupOf: system ? system.group : '' })
    }

    function toggleUser(tagId) {
      const active = !!store.filter && store.filter.kind === 'user' && store.filter.tagId === tagId
      if (active) return setFilter(null)
      setFilter({ kind: 'user', tagId })
    }

    // inline "new tag" input
    function openTagInput(bar) {
      if (bar.dataset.pmodEditing === '1') return
      bar.dataset.pmodEditing = '1'
      const wrapper = h('div', { class: 'pmod-tagin', 'data-pmod-tagin': '' })
      const input = h('input', {
        class: 'pmod-tagin-input',
        type: 'text',
        maxlength: '12',
        placeholder: t('addPlaceholder'),
        'aria-label': t('add'),
      })
      wrapper.appendChild(input)
      const addButton = bar.querySelector('[data-pmod-add]')
      if (addButton && addButton.parentNode) addButton.parentNode.insertBefore(wrapper, addButton)
      else bar.appendChild(wrapper)
      input.focus()
      let done = false
      const close = () => {
        if (done) return
        done = true
        bar.dataset.pmodEditing = ''
        untrack(wrapper)
        const pillsHost = bar.querySelector('[data-pmod-pills]')
        if (pillsHost) pillsHost.dataset.pmodSig = ''
        schedule()
      }
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          const value = trim(input.value)
          close()
          void createTag(value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      })
      input.addEventListener('blur', () => window.setTimeout(close, 120))
    }

    async function createTag(label) {
      if (!label || [...label].length > 12) {
        toast(t('tagInvalid'))
        return ''
      }
      const normalised = label.normalize('NFKC').toLowerCase()
      const systemNames = new Set()
      for (const lang of Object.keys(DICT)) {
        for (const system of FILTER_SYSTEM) systemNames.add(DICT[lang][system.id].toLowerCase())
      }
      for (const system of FILTER_SYSTEM) systemNames.add(system.id)
      if (systemNames.has(normalised)) {
        toast(t('tagSystem'))
        return ''
      }
      if (store.data.tags.some((tag) => tag.label.normalize('NFKC').toLowerCase() === normalised)) {
        toast(t('tagDuplicated'))
        return ''
      }
      const id = 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
      const outcome = await mutate((draft) => {
        draft.tags.push({ id, label, createdAt: Date.now() })
        return id
      })
      if (!outcome.ok) return ''
      setFilter({ kind: 'user', tagId: id })
      return id
    }

    // tag assignment
    function isAssigned(key, tagId) {
      const list = store.data.assignments[key]
      return Array.isArray(list) && list.includes(tagId)
    }

    // Intent based so a 409 replay is idempotent (N2): the desired state is
    // captured once, re-applying it can never flip the value back.
    async function setAssignment(key, tagId, desired) {
      if (!key) return
      await mutate((draft) => {
        const list = Array.isArray(draft.assignments[key]) ? [...draft.assignments[key]] : []
        const index = list.indexOf(tagId)
        if (desired && index < 0) list.push(tagId)
        else if (!desired && index >= 0) list.splice(index, 1)
        if (list.length) draft.assignments[key] = list
        else delete draft.assignments[key]
      })
    }

    // toast
    let toastNode = null
    let toastTimer = 0
    function toast(message) {
      if (disposed) return
      if (toastNode) untrack(toastNode)
      toastNode = track(h('div', { class: 'pmod-toast', role: 'status', 'aria-live': 'polite', text: message }))
      document.body.appendChild(toastNode)
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        if (toastNode) {
          untrack(toastNode)
          toastNode = null
        }
      }, 2600)
    }

    // context menu
    let menuNode = null
    let menuState = null

    function closeMenu() {
      if (!menuNode) return
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('scroll', onMenuDismiss, true)
        window.removeEventListener('resize', onMenuDismiss)
      }
      untrack(menuNode)
      menuNode = null
      menuState = null
      document.removeEventListener('keydown', onMenuKey, true)
      document.removeEventListener('mousedown', onMenuOutside, true)
    }

    function onMenuDismiss() {
      closeMenu()
    }

    let swallowTimer = 0
    function onMenuOutside(event) {
      if (!menuNode) return
      if (event.target && menuNode.contains(event.target)) return
      // F12: the first click outside only dismisses the menu. Swallow both the
      // press and the following click so the page underneath stays untouched.
      event.preventDefault()
      event.stopPropagation()
      const swallow = (clickEvent) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
        clickEvent.stopImmediatePropagation()
      }
      document.addEventListener('click', swallow, true)
      window.clearTimeout(swallowTimer)
      swallowTimer = window.setTimeout(() => document.removeEventListener('click', swallow, true), 800)
      closeMenu()
    }

    function cardByKey(key) {
      if (!key) return null
      if (key.startsWith('pkg:')) return document.querySelector(`[data-plugin-package="${cssEscape(key.slice(4))}"]`)
      if (key.startsWith('item:')) return document.querySelector(`[data-plugin-item="${cssEscape(key.slice(5))}"]`)
      return null
    }

    function canUninstall(key) {
      if (!key.startsWith('pkg:')) return false
      const row = bundleInfo(key.slice(4))
      if (!row) return true
      if (row.removable === false) return false
      if (row.installed === false) return false
      if (row.readOnlyReason) return false
      return true
    }

    function menuItemsFor(surface, key, fromCard) {
      const caps = surface.caps
      const entries = []
      if (caps.has('rename')) {
        entries.push({ id: 'rename', label: t('rename'), action: () => openDialog(key, fromCard) })
      }
      if (caps.has('icon') && key.startsWith('pkg:')) {
        entries.push({ id: 'icon', label: t('iconChange'), action: () => openIconDialog(key, fromCard) })
      }
      if (caps.has('tags')) {
        const submenu = []
        if (surface.kind === 'native') {
          // v0.9: only the two derived state tags are listed. The group tags
          // (built-in / experimental / installed) were dropped together with
          // their filter pills because the native sections already show them.
          submenu.push({ kind: 'group', label: t('systemTags') })
          for (const system of STATE_SYSTEM) {
            const current = cardEnabledState(cardByKey(key)) === (system.id === 'enabled')
            submenu.push({
              id: 'system:' + system.id,
              label: t(system.id),
              disabled: true,
              current,
            })
          }
          submenu.push({ kind: 'separator' }, { kind: 'group', label: t('myTags') })
        }
        const tags = store.data.tags
        if (tags.length) {
          for (const tag of tags) {
            submenu.push({
              id: 'tag:' + tag.id,
              label: tag.label,
              kind: 'checkbox',
              checked: isAssigned(key, tag.id),
              isChecked: () => isAssigned(key, tag.id),
              action: () => setAssignment(key, tag.id, !isAssigned(key, tag.id)),
            })
          }
        } else {
          submenu.push({ id: 'none', label: t('tagEmptyHint'), disabled: true })
        }
        if (entries.length) entries.push({ kind: 'separator' })
        entries.push({ id: 'add', label: t('addTag'), submenu })
      }
      if (caps.has('clone') && key.startsWith('pkg:')) {
        const packageName = key.slice(4)
        if (entries.length) entries.push({ kind: 'separator' })
        entries.push({
          id: 'addClone',
          label: t('addClone'),
          submenuOf: () => cloneMenuEntries([packageName]),
          lazy: true,
        })
      }
      if (caps.has('uninstall') && canUninstall(key)) {
        entries.push({ kind: 'separator' }, { id: 'uninstall', label: t('uninstallMenu'), action: () => void uninstallAt(key) })
      }
      return entries
    }

    // ---- clone linking (v0.4 "add to clone") -------------------------------
    // The instance-manager plugin is a separate bundle. Its changes are not on
    // the remote event whitelist, so the only supported channel is same-origin
    // HTTP: read /state + /instance-plugins, write /add-plugin. Reads are cached
    // for CLONE_TTL_MS so opening a context menu stays cheap.
    const cloneState = { loaded: false, error: '', at: 0, epoch: 0, reloading: false, instances: [], membership: new Map() }
    let cloneInflight = null

    async function instanceApi(path, init, timeoutMs) {
      const response = await fetchWithTimeout(INSTANCE_ROOT + path, {
        credentials: 'same-origin',
        ...(init || {}),
        headers: { 'content-type': 'application/json', ...(init && init.headers ? init.headers : {}) },
      }, timeoutMs)
      const text = await response.text()
      let body = {}
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        body = {}
      }
      if (!response.ok || body.ok !== true) {
        const error = Error((body && body.error && body.error.message) || `HTTP ${response.status}`)
        error.status = response.status
        error.code = (body && body.error && body.error.code) || ''
        throw error
      }
      return body.value
    }

    function cloneKey(instanceId, packageName) {
      return instanceId + '\u0000' + packageName
    }

    function cloneHash() {
      return JSON.stringify([cloneState.loaded, cloneState.error, cloneState.instances])
    }

    async function loadClones(force) {
      if (!force && cloneState.at && Date.now() - cloneState.at < CLONE_TTL_MS) return cloneState
      if (cloneInflight) return cloneInflight
      // A refresh that lands on top of already-rendered instances still has to
      // look like a load, otherwise the stale list is painted for a frame
      // (BUG-V4-2).
      cloneState.reloading = cloneState.loaded
      cloneInflight = (async () => {
        try {
          const value = await instanceApi('/state', undefined, CLONE_TTL_MS)
          const instances = Array.isArray(value && value.instances) ? value.instances : []
          const membership = new Map()
          const readers = instances
            .filter((item) => item && typeof item.id === 'string')
            .map(async (item) => {
              try {
                const payload = await instanceApi('/instance-plugins?id=' + encodeURIComponent(item.id), undefined, CLONE_TTL_MS)
                const entries = Array.isArray(payload && payload.entries) ? payload.entries : []
                for (const entry of entries) {
                  if (entry && typeof entry.name === 'string') {
                    membership.set(cloneKey(item.id, entry.name), !!entry.enabled)
                  }
                }
              } catch {
                /* one instance failing must not hide the others */
              }
            })
          await Promise.all(readers)
          cloneState.loaded = true
          cloneState.error = ''
          cloneState.instances = instances
            .filter((item) => item && typeof item.id === 'string')
            .map((item) => ({
              id: item.id,
              name: item.name || item.id,
              status: item.status || 'stopped',
              pluginCount: typeof item.pluginCount === 'number' ? item.pluginCount : null,
            }))
          cloneState.membership = membership
        } catch (error) {
          cloneState.loaded = false
          cloneState.error = (error && (error.code || error.message)) || 'unavailable'
          cloneState.instances = []
          cloneState.membership = new Map()
        } finally {
          cloneInflight = null
          cloneState.reloading = false
          // A failed read retries after ~3s instead of hammering on every open.
          cloneState.at = cloneState.loaded ? Date.now() : Date.now() - (CLONE_TTL_MS - 3000)
          // BUG-V4-1: lazy submenus repaint only after a read actually lands.
          // Without an epoch, the fresh-cache branch resolves immediately and
          // the repaint re-enters the lazy path forever (microtask spin).
          cloneState.epoch += 1
        }
        return cloneState
      })()
      return cloneInflight
    }

    function cloneMenuEntries(packageNames) {
      const names = (packageNames || []).filter((name) => typeof name === 'string' && name)
      if (!cloneState.loaded || cloneState.reloading) {
        if (cloneInflight) return [{ id: 'cloneLoading', label: t('cloneLoading'), disabled: true }]
        if (!cloneState.loaded) return [{ id: 'cloneUnavailable', label: t('cloneUnavailable'), disabled: true }]
      }
      if (!cloneState.instances.length) return [{ id: 'cloneEmpty', label: t('cloneEmpty'), disabled: true }]
      const entries = []
      for (const instance of cloneState.instances) {
        const installed = names.filter((name) => cloneState.membership.has(cloneKey(instance.id, name))).length
        const running = instance.status === 'running' || instance.status === 'starting'
        let suffix = ''
        if (installed && names.length && installed === names.length) suffix = ' · ' + t('cloneInstalled')
        else if (installed) suffix = ' · ' + t('cloneInstalled') + ' ' + installed + '/' + names.length
        else if (running) suffix = ' · ' + t('cloneRunning')
        const blocked = running || (names.length > 0 && installed === names.length)
        entries.push({
          id: 'clone:' + instance.id,
          label: instance.name + suffix,
          disabled: blocked,
          action: blocked ? undefined : () => void cloneTo(instance.id, names),
        })
      }
      return entries
    }

    async function cloneTo(instanceId, packageNames) {
      const names = (packageNames || []).filter((name) => cloneState.membership.has(cloneKey(instanceId, name)) === false)
      if (!names.length) {
        toast(t('cloneNoSelection'))
        return
      }
      const instance = cloneState.instances.find((item) => item.id === instanceId)
      const label = instance ? instance.name : instanceId
      let added = 0
      let failed = 0
      let reason = ''
      for (const name of names) {
        try {
          await instanceApi('/add-plugin', { method: 'POST', body: JSON.stringify({ id: instanceId, name }) }, CLONE_TIMEOUT_MS)
          added += 1
        } catch (error) {
          failed += 1
          reason = (error && (error.code || error.message)) || 'failed'
        }
      }
      await loadClones(true)
      if (!failed) toast(t('cloneAdded', { name: label }) + ' · ' + t('cloneRestartHint'))
      else if (added) toast(t('cloneAddedPartial', { added, failed }) + ' · ' + t('cloneRestartHint'))
      else toast(t('cloneAddFailed', { reason: String(reason || '') }))
    }

    function submenuItems(entry) {
      // Lazy entries kick their read here so the first paint already says
      // "loading…" instead of briefly claiming the list is unavailable.
      if (entry.lazy && !cloneInflight && (!cloneState.loaded || Date.now() - cloneState.at >= CLONE_TTL_MS)) {
        void loadClones(false)
      }
      if (typeof entry.submenuOf === 'function') {
        const items = entry.submenuOf()
        return Array.isArray(items) ? items : []
      }
      return Array.isArray(entry.submenu) ? entry.submenu : []
    }

    // Submenus can be static arrays or lazily built (clone targets, which need
    // an HTTP read before they can list instances).
    function hasSubmenu(entry) {
      return !!(entry && (Array.isArray(entry.submenu) || typeof entry.submenuOf === 'function'))
    }

    // F13: batch menu — always acts on the current selection.
    function batchMenuItems(surface) {
      const caps = surface ? surface.caps : NATIVE_CAPS
      const keys = selectedVisibleKeys()
      const tags = store.data.tags
      const empty = keys.length === 0
      const items = [{ kind: 'head', label: t('batchCount', { n: keys.length }) }, { kind: 'separator' }]
      if (caps.has('tags')) {
        const tagSubmenu = [{ kind: 'group', label: t('myTags') }]
        if (tags.length) {
          for (const tag of tags) {
            const allHave = () => {
              const now = selectedVisibleKeys()
              return now.length > 0 && now.every((key) => isAssigned(key, tag.id))
            }
            tagSubmenu.push({
              id: 'btag:' + tag.id,
              label: tag.label,
              kind: 'checkbox',
              checked: allHave(),
              isChecked: allHave,
              action: () => setSelectionTag(tag.id, !allHave()),
            })
          }
        } else {
          tagSubmenu.push({ id: 'btagNone', label: t('batchTagEmpty'), disabled: true })
        }
        items.push(
          empty
            ? { id: 'batchTag', label: t('batchTag'), disabled: true }
            : { id: 'batchTag', label: t('batchTag'), submenu: tagSubmenu },
        )
      }
      if (caps.has('clone')) {
        const names = keys.filter((key) => key.startsWith('pkg:')).map((key) => key.slice(4))
        items.push({
          id: 'batchClone',
          label: t('batchClone'),
          submenuOf: () => cloneMenuEntries(names),
          lazy: true,
        })
      }
      if (caps.has('uninstall')) {
        items.push({ kind: 'separator' })
        items.push(
          empty
            ? { id: 'batchUninstall', label: t('batchUninstall'), disabled: true }
            : { id: 'batchUninstall', label: t('batchUninstall'), action: () => void batchUninstall() },
        )
      }
      return items
    }

    function setSelectionTag(tagId, desired) {
      const keys = selectedVisibleKeys()
      if (!keys.length) return Promise.resolve({ ok: false })
      return mutate((draft) => {
        draft.assignments = draft.assignments || {}
        for (const key of keys) {
          const list = Array.isArray(draft.assignments[key]) ? [...draft.assignments[key]] : []
          const at = list.indexOf(tagId)
          if (desired && at < 0) list.push(tagId)
          if (!desired && at >= 0) list.splice(at, 1)
          if (list.length) draft.assignments[key] = list
          else delete draft.assignments[key]
        }
      })
    }

    async function batchUninstall() {
      const keys = selectedVisibleKeys().filter((key) => key.startsWith('pkg:'))
      const names = keys.map((key) => key.slice(4))
      if (!names.length) {
        toast(t('batchEmpty'))
        return
      }
      const confirmed = await openConfirm({
        title: t('batchUninstallTitle'),
        body: t('batchUninstallBody', { n: names.length }),
        confirm: t('batchUninstallConfirm', { n: names.length }),
        danger: true,
      })
      if (!confirmed) return
      let failed = 0
      let reason = ''
      const removed = []
      for (const name of names) {
        try {
          const result = await uninstallBundle(name)
          const bad = !!result && (result.error || result.application === 'failed' || result.application === 'cancelled')
          if (bad) {
            failed += 1
            reason = (result.error && (result.error.message || result.error.code)) || String(result.application || 'failed')
            continue
          }
          removed.push(name)
          store.selection.delete('pkg:' + name)
        } catch (error) {
          failed += 1
          reason = error && error.message ? error.message : String(error)
        }
      }
      if (removed.length) {
        void mutate((draft) => {
          for (const name of removed) {
            const key = 'pkg:' + name
            delete draft.overrides[key]
            delete draft.assignments[key]
            delete draft.seen[key]
            for (const partition of Object.keys(draft.orders || {})) {
              const list = Array.isArray(draft.orders[partition]) ? draft.orders[partition].filter((item) => item !== key) : null
              if (list && list.length) draft.orders[partition] = list
              else delete draft.orders[partition]
            }
          }
        }, { silent: true })
      }
      await refreshBundles(true)
      if (failed) toast(t('batchUninstallPartial', { n: names.length, failed, reason }))
      else toast(t('batchUninstallDone', { n: names.length }))
      schedule()
    }

    function menuForTagsAt(x, y, tag) {
      const entries = [
        {
          id: 'delete:' + tag.id,
          label: t('deleteTag'),
          action: () => void deleteTag(tag.id),
        },
      ]
      buildMenu(entries, x, y)
    }

    async function deleteTag(tagId) {
      await mutate((draft) => {
        draft.tags = draft.tags.filter((tag) => tag.id !== tagId)
        for (const key of Object.keys(draft.assignments)) {
          const list = draft.assignments[key].filter((id) => id !== tagId)
          if (list.length) draft.assignments[key] = list
          else delete draft.assignments[key]
        }
      })
      if (store.filter && store.filter.kind === 'user' && store.filter.tagId === tagId) setFilter(null)
    }


    const cssEscape = (value) => (window.CSS && window.CSS.escape ? window.CSS.escape(value) : String(value).replace(/"/g, '\\"'))

    function menuEntryNode(entry) {
      if (entry.kind === 'separator') {
        return { node: h('div', { class: 'pmod-menu-sep', role: 'separator' }) }
      }
      if (entry.kind === 'group') {
        return { node: h('div', { class: 'pmod-menu-group', role: 'presentation', text: entry.label }) }
      }
      if (entry.kind === 'head') {
        return { node: h('div', { class: 'pmod-menu-head', role: 'presentation', 'data-pmod-menu-head': '', text: entry.label }) }
      }
      const button = h('button', {
        class: 'pmod-menu-item' + (entry.disabled ? ' is-disabled' : '') + (entry.kind === 'checkbox' ? ' is-check' : ''),
        type: 'button',
        role: entry.kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitem',
        'aria-checked': entry.kind === 'checkbox' ? (entry.checked ? 'true' : 'false') : null,
        'aria-haspopup': hasSubmenu(entry) ? 'true' : null,
        'aria-disabled': entry.disabled ? 'true' : null,
      })
      const check = h('span', { class: 'pmod-menu-check', 'aria-hidden': 'true', text: entry.kind === 'checkbox' ? (entry.checked ? '✓' : '') : '' })
      button.appendChild(check)
      button.appendChild(h('span', { class: 'pmod-menu-label', text: entry.label }))
      if (entry.current) button.appendChild(h('span', { class: 'pmod-menu-current', text: t('tagCurrent') }))
      if (hasSubmenu(entry)) button.appendChild(h('span', { class: 'pmod-menu-arrow', 'aria-hidden': 'true', text: '›' }))
      return { node: button, button, check }
    }

    function syncMenuCheck(entry, button, check) {
      if (!entry || entry.kind !== 'checkbox' || !button || !check) return
      const checked = typeof entry.isChecked === 'function' ? !!entry.isChecked() : !!entry.checked
      entry.checked = checked
      button.setAttribute('aria-checked', checked ? 'true' : 'false')
      const mark = checked ? '✓' : ''
      if (check.textContent !== mark) check.textContent = mark
    }

    function buildMenu(entries, x, y) {
      closeMenu()
      const menu = h('div', { class: 'pmod-menu', role: 'menu', 'data-pmod-menu': '' })
      const flat = []
      for (const entry of entries) {
        const rendered = menuEntryNode(entry)
        if (!rendered.button) {
          menu.appendChild(rendered.node)
          continue
        }
        const button = rendered.button
        if (!entry.disabled) {
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (hasSubmenu(entry)) {
              toggleSubmenu(entry)
              return
            }
            closeMenu()
            try {
              if (entry.action) entry.action()
            } catch (error) {
              console.warn('[plugin-manager-plus] menu action failed', error)
            }
          })
          button.addEventListener('mouseenter', () => {
            if (hasSubmenu(entry)) openSubmenu(entry)
            else closeSubmenu()
          })
        }
        flat.push({ entry, button })
        // Disabled rows stay visible but are never keyboard targets (N3), and
        // Tab must walk out of the menu instead of landing on them.
        if (entry.disabled) button.tabIndex = -1
        menu.appendChild(button)
      }
      menuState = { flat, submenu: null, active: -1, root: menu }
      menuNode = track(menu)
      document.body.appendChild(menu)
      positionMenu(menu, x, y)
      document.addEventListener('keydown', onMenuKey, true)
      document.addEventListener('mousedown', onMenuOutside, true)
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('scroll', onMenuDismiss, true)
        window.addEventListener('resize', onMenuDismiss)
      }
      // B3: never pre-activate the first row — the active style is identical to
      // :hover, so an initial selection looked like a stuck highlight. Focus
      // the menu container instead so keyboard nav still works.
      menu.setAttribute('tabindex', '-1')
      try {
        menu.focus({ preventScroll: true })
      } catch {
        /* ignored */
      }
    }

    function positionMenu(menu, x, y) {
      const rect = menu.getBoundingClientRect()
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight
      const margin = 8
      let left = x
      let top = y
      if (left + rect.width > viewportW - margin) left = Math.max(margin, viewportW - rect.width - margin)
      if (top + rect.height > viewportH - margin) {
        // Flip above the pointer first (that is what a context menu should do at
        // the bottom edge); only clamp when the menu cannot fit either way.
        const flipped = y - rect.height - 6
        top = flipped >= margin ? flipped : Math.max(margin, viewportH - rect.height - margin)
      }
      menu.style.left = Math.round(left) + 'px'
      menu.style.top = Math.round(top) + 'px'
    }

    function openSubmenu(entry, activate) {
      closeSubmenu()
      const parentButton = menuState && menuState.flat.find((item) => item.entry === entry)
      if (!parentButton) return
      const submenu = h('div', { class: 'pmod-menu pmod-submenu', role: 'menu', 'data-pmod-submenu': '' })
      const flat = []
      for (const item of submenuItems(entry)) {
        const rendered = menuEntryNode(item)
        if (!rendered.button) {
          submenu.appendChild(rendered.node)
          continue
        }
        const button = rendered.button
        const row = { entry: item, button, check: rendered.check }
        if (!item.disabled) {
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (item.kind === 'checkbox') {
              // Toggling a user tag must keep the submenu open so several tags
              // can be applied in a row (spec §5.5); update the check in place.
              let outcome = null
              try {
                outcome = item.action ? item.action() : null
              } catch (error) {
                console.warn('[plugin-manager-plus] menu action failed', error)
              }
              syncMenuCheck(item, button, rendered.check)
              if (outcome && typeof outcome.then === 'function') {
                outcome.then(
                  () => syncMenuCheck(item, button, rendered.check),
                  () => syncMenuCheck(item, button, rendered.check),
                )
              }
              return
            }
            closeSubmenu()
            try {
              if (item.action) item.action()
            } catch (error) {
              console.warn('[plugin-manager-plus] menu action failed', error)
            }
          })
          button.addEventListener('mouseenter', () => {
            for (const other of flat) other.button.classList.toggle('is-active', other === row)
          })
          // Disabled rows stay visible but are never keyboard targets (N3).
          flat.push(row)
        }
        submenu.appendChild(button)
      }
      const rect = parentButton.button.getBoundingClientRect()
      menuNode.appendChild(submenu)
      const menuRect = menuNode.getBoundingClientRect()
      const size = submenu.getBoundingClientRect()
      const margin = 8
      // Flip the submenu to the other side / upward instead of overflowing the
      // viewport (F11: the last card on screen must keep both menus visible).
      let viewLeft = rect.right - 4
      if (viewLeft + size.width > window.innerWidth - margin) viewLeft = rect.left - size.width + 4
      if (viewLeft < margin) viewLeft = margin
      let viewTop = rect.bottom - 8
      if (viewTop + size.height > window.innerHeight - margin) viewTop = window.innerHeight - size.height - margin
      if (viewTop < margin) viewTop = margin
      submenu.style.left = Math.round(viewLeft - menuRect.left) + 'px'
      submenu.style.top = Math.round(viewTop - menuRect.top) + 'px'
      menuState.submenu = { node: submenu, flat, active: -1, parent: entry }
      // B3: a hover-opened submenu must not paint a row as active; only the
      // keyboard ArrowRight path passes activate=true.
      if (activate && flat.length) setSubmenuActive(0)
      // Lazy submenus (clone targets) paint a loading row first, then rebuild
      // in place once the instance-manager read lands, if still open.
      if (entry.lazy) {
        // submenuItems() already kicked a read when the list is missing or
        // stale; repaint in place once it lands (epoch guards against loops).
        const pending = cloneInflight
        if (pending) {
          const epoch = cloneState.epoch
          void pending.then(() => {
            if (cloneState.epoch === epoch) return
            if (disposed || !menuState || !menuState.submenu || menuState.submenu.parent !== entry) return
            openSubmenu(entry, false)
          })
        }
      }
    }

    function closeSubmenu() {
      if (!menuState || !menuState.submenu) return
      const node = menuState.submenu.node
      if (node && node.parentNode) node.parentNode.removeChild(node)
      menuState.submenu = null
    }

    function toggleSubmenu(entry, activate) {
      if (menuState && menuState.submenu && menuState.submenu.parent === entry) closeSubmenu()
      else openSubmenu(entry, !!activate)
    }

    // Move the active row. Submenus are only opened on explicit intent
    // (ArrowRight / Enter / hover), never as a side effect of arrow navigation:
    // auto-opening used to trap the keyboard inside the submenu, making the rows
    // below it unreachable and turning Escape into a no-op (BUG-V3-1).
    function setMenuActive(index) {
      if (!menuState) return
      const flat = menuState.flat
      if (!flat.length) return
      if (index < 0) {
        menuState.active = -1
        for (const item of flat) item.button.classList.remove('is-active')
        return
      }
      menuState.active = index % flat.length
      flat.forEach((item, position) => item.button.classList.toggle('is-active', position === menuState.active))
      flat[menuState.active].button.focus({ preventScroll: true })
      closeSubmenu()
    }

    function setSubmenuActive(index) {
      if (!menuState || !menuState.submenu) return
      const flat = menuState.submenu.flat
      if (!flat.length) return
      if (index < 0) {
        menuState.submenu.active = -1
        for (const item of flat) item.button.classList.remove('is-active')
        return
      }
      menuState.submenu.active = index % flat.length
      flat.forEach((item, position) => item.button.classList.toggle('is-active', position === menuState.submenu.active))
      flat[menuState.submenu.active].button.focus({ preventScroll: true })
    }

    // Step from "nothing active" (-1) into the list on the first arrow press.
    function stepIndex(active, delta, length) {
      if (!length) return -1
      if (active < 0) return delta > 0 ? 0 : length - 1
      return (active + delta + length) % length
    }

    function onMenuKey(event) {
      if (!menuNode) return
      const inSubmenu = !!menuState && !!menuState.submenu
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        // One Esc always closes the whole context menu (F12); closing only the
        // submenu left the user stuck with a menu they could not dismiss.
        closeMenu()
        return
      }
      if (event.key === 'Tab') {
        // ARIA APG: Tab moves focus out of the menu and dismisses it. Do not
        // preventDefault — the browser should continue the tab order.
        closeMenu()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (inSubmenu) setSubmenuActive(stepIndex(menuState.submenu.active, 1, menuState.submenu.flat.length))
        else setMenuActive(stepIndex(menuState.active, 1, menuState.flat.length))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (inSubmenu) setSubmenuActive(stepIndex(menuState.submenu.active, -1, menuState.submenu.flat.length))
        else setMenuActive(stepIndex(menuState.active, -1, menuState.flat.length))
        return
      }
      if (event.key === 'ArrowRight') {
        if (!menuState) return
        event.preventDefault()
        if (inSubmenu) return
        const current = menuState.active >= 0 ? menuState.flat[menuState.active] : null
        if (current && hasSubmenu(current.entry)) openSubmenu(current.entry, true)
        return
      }
      if (event.key === 'ArrowLeft') {
        if (!inSubmenu) return
        event.preventDefault()
        closeSubmenu()
        if (menuState.active >= 0) setMenuActive(menuState.active)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (inSubmenu) {
          const current = menuState.submenu.active >= 0 ? menuState.submenu.flat[menuState.submenu.active] : null
          if (current && current.button) current.button.click()
        } else {
          const current = menuState.active >= 0 ? menuState.flat[menuState.active] : null
          if (!current) return
          if (current.entry && hasSubmenu(current.entry)) openSubmenu(current.entry, true)
          else current.button.click()
        }
      }
    }

    // rename dialog
    let dialogNode = null
    let dialogState = null

    // v0.7: model picker menu lives inside the dialog mask so it stacks above
    // the dialog; it is torn down with the dialog.
    let modelMenuNode = null
    let modelMenuCleanup = null

    function closeModelMenu() {
      if (modelMenuNode && modelMenuNode.parentNode) modelMenuNode.parentNode.removeChild(modelMenuNode)
      modelMenuNode = null
      if (modelMenuCleanup) modelMenuCleanup()
      modelMenuCleanup = null
      for (const button of document.querySelectorAll('[data-pmod-ai-model]')) button.setAttribute('aria-expanded', 'false')
    }

    function modelMenuRow(model, provider, picked, onPick) {
      const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : []
      const value = provider + '/' + model.id
      const active = picked === value
      const item = h('button', {
        class: 'pmod-menu-item pmod-model-item' + (active ? ' pmod-menu-item-on' : ''),
        type: 'button',
        role: 'menuitemradio',
        'aria-checked': active ? 'true' : 'false',
        'data-pmod-model-value': value,
        title: value + (efforts.length ? ' · ' + efforts.join(' / ') : ''),
      }, [
        h('span', { class: 'pmod-menu-label', text: model.name || model.id }),
        efforts.length ? h('span', { class: 'pmod-model-effort', text: efforts[0] }) : null,
        active ? h('span', { class: 'pmod-menu-mark', 'aria-hidden': 'true', text: '✓' }) : null,
      ])
      item.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onPick(value)
      })
      return item
    }

    async function openModelMenu(anchor, onPick) {
      closeModelMenu()
      if (!anchor || !anchor.isConnected) return
      const menu = h('div', {
        class: 'pmod-menu pmod-modelmenu',
        'data-pmod-modelmenu': '',
        role: 'menu',
        'aria-label': t('aiModelMenuTitle'),
      })
      const parent = dialogNode || document.body
      parent.appendChild(menu)
      positionPopup(menu, anchor.getBoundingClientRect())
      anchor.setAttribute('aria-expanded', 'true')
      const render = () => {
        menu.textContent = ''
        const picked = normaliseAiPick(store.data.aiPick)
        const follow = h('button', {
          class: 'pmod-menu-item' + (picked ? '' : ' pmod-menu-item-on'),
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': picked ? 'false' : 'true',
          'data-pmod-model-follow': '',
        }, [
          h('span', { class: 'pmod-menu-label', text: t('aiModelFollow') }),
          h('span', { class: 'pmod-model-effort', text: store.aiModel || '' }),
          picked ? null : h('span', { class: 'pmod-menu-mark', 'aria-hidden': 'true', text: '✓' }),
        ])
        follow.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          onPick('')
        })
        menu.appendChild(follow)
        menu.appendChild(h('div', { class: 'pmod-menu-sep', role: 'separator', 'aria-hidden': 'true' }))
        const data = store.aiModels
        const providers = data && Array.isArray(data.providers) ? data.providers : []
        if (!data) {
          menu.appendChild(h('div', { class: 'pmod-menu-note', text: t('aiModelLoading') }))
          return
        }
        let count = 0
        for (const provider of providers) {
          const models = provider && Array.isArray(provider.models) ? provider.models : []
          if (!models.length) continue
          if (count) menu.appendChild(h('div', { class: 'pmod-menu-sep', role: 'separator', 'aria-hidden': 'true' }))
          menu.appendChild(h('div', { class: 'pmod-menu-head', role: 'presentation', text: provider.id }))
          for (const model of models) {
            if (!model || typeof model.id !== 'string' || !model.id) continue
            menu.appendChild(modelMenuRow(model, provider.id, picked, onPick))
            count += 1
          }
        }
        if (!count) menu.appendChild(h('div', { class: 'pmod-menu-note', text: t('aiModelNone') }))
        menu.appendChild(h('div', { class: 'pmod-menu-note pmod-menu-tip', text: t('aiModelTools') }))
        const active = menu.querySelector('[role="menuitemradio"][aria-checked="true"]') || menu.querySelector('[role="menuitemradio"]')
        if (active && typeof active.focus === 'function') active.focus({ preventScroll: true })
        positionPopup(menu, anchor.getBoundingClientRect())
      }
      render()
      const outside = (event) => {
        if (menu.contains(event.target) || event.target === anchor) return
        closeModelMenu()
      }
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeModelMenu()
          anchor.focus()
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
        const rows = [...menu.querySelectorAll('[role="menuitemradio"]')]
        if (!rows.length) return
        event.preventDefault()
        event.stopPropagation()
        const current = rows.indexOf(document.activeElement)
        const delta = event.key === 'ArrowDown' || event.key === 'Home' ? 1 : -1
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (current < 0 ? (delta > 0 ? 0 : rows.length - 1) : (current + delta + rows.length) % rows.length)
        rows[next].focus()
      }
      document.addEventListener('mousedown', outside, true)
      document.addEventListener('keydown', onKey, true)
      modelMenuCleanup = () => {
        document.removeEventListener('mousedown', outside, true)
        document.removeEventListener('keydown', onKey, true)
      }
      modelMenuNode = menu
      // A slow first load repaints the menu without losing the anchor.
      if (!store.aiModels) {
        const loaded = await loadAiModels(false)
        if (loaded && modelMenuNode === menu) render()
      }
    }

    async function chooseAiModel(anchor, value) {
      // P1-1 (v0.7.1): with an explicit config.ai endpoint the pick is ignored
      // by the host, so never pretend to switch models there.
      if (store.aiSource === 'config') return
      const next = normaliseAiPick(value)
      closeModelMenu()
      if (next === normaliseAiPick(store.data.aiPick)) return
      const outcome = await mutate((draft) => {
        draft.aiPick = next
      })
      if (!outcome.ok) return
      const button = dialogState && dialogState.modelButton
      if (button && button.isConnected) {
        button.textContent = next || t('aiModelFollow')
        button.title = next || t('aiModelFollow')
      }
      const status = dialogState && dialogState.aiStatus
      if (status && status.isConnected) {
        status.textContent = next ? t('aiModelHint', { model: next }) : store.aiModel ? (store.aiSource === 'dsh' ? t('aiModelHint', { model: store.aiModel }) : t('aiConfigHint', { model: store.aiModel })) : ''
      }
      if (next) toast(t('aiPickSaved', { model: next }))
      if (anchor && anchor.isConnected) anchor.focus()
    }

    // v0.7.2 (BUG-V7-2): AI generation keeps running in the background when the
    // dialog is merely dismissed (mask click / Escape). Only an explicit Cancel,
    // a manual Save, or a newer run for the same plugin abandons it — otherwise
    // a user who closes the dialog loses the finished result silently.
    function closeDialog(rollback, cancelAi) {
      if (!dialogNode) return
      if (cancelAi === undefined) cancelAi = Boolean(rollback)
      if (rollback) rollbackDialog()
      untrack(dialogNode)
      if (dialogState && dialogState.returnFocus && typeof dialogState.returnFocus.focus === 'function') {
        try {
          dialogState.returnFocus.focus({ preventScroll: true })
        } catch {
          /* ignored */
        }
      }
      const closedDialog = dialogNode
      const closedKey = dialogState && dialogState.key
      dialogNode = null
      dialogState = null
      if (cancelAi) cancelAiRuns(closedDialog, closedKey)
      closeModelMenu()
      document.removeEventListener('keydown', onDialogKey, true)
      closePromptDialog()
    }

    // Cancel restores the override captured when the dialog opened (spec §5.4).
    function rollbackDialog() {
      if (!dialogState) return
      const { key, snapshot } = dialogState
      const current = store.data.overrides[key] || null
      if (JSON.stringify(current) === JSON.stringify(snapshot || null)) return
      void mutate((draft) => {
        if (snapshot) draft.overrides[key] = { ...snapshot }
        else delete draft.overrides[key]
      })
    }

    function onDialogKey(event) {
      if (promptDialogState) return
      if (!dialogState) return
      // The model picker owns Escape/arrows while it is open (v0.7).
      if (modelMenuNode) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeDialog(true, false)
        return
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.stopPropagation()
        void commitDialog()
        return
      }
      if (event.key === 'Tab') {
        const focusables = dialogState.focusables()
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    // ---- v0.5 AI prompt (F17) -------------------------------------------
    const DEFAULT_AI_PROMPT_ZH = [
      '# 角色',
      '你是 DeepSeek Harness 的插件命名与简介优化助手：为插件生成更清晰、更易识别的中文显示名称与一句话简介。',
      '',
      '# 原始信息',
      '- 原名称：{name}',
      '- 原简介：{description}',
      '- 已被其他插件使用的名称：{existingNames}',
      '',
      '# 要求',
      '- 名称：2–20 个汉字（或等长英文单词），突出插件用途；不包含版本号、括号、emoji。',
      '- 简介：1–2 句，不超过 60 个汉字，说明它做什么、什么时候用。',
      '- 名称不得与「已被其他插件使用的名称」重复，也不得与原名称完全相同。',
      '',
      '# 输出格式',
      '只输出一个 JSON 对象，不要代码块、不要解释：',
      '{"name":"…","description":"…"}',
      '',
      '# 自审',
      '输出前检查：是否为合法 JSON、是否恰好两个字段、name 与 description 是否非空、name 是否重复。不满足就修正后再输出。',
    ].join('\n')

    const DEFAULT_AI_PROMPT_EN = [
      '# Role',
      'You optimise display names and one-line descriptions for DeepSeek Harness plugins.',
      '',
      '# Source',
      '- Original name: {name}',
      '- Original description: {description}',
      '- Names already used by other plugins: {existingNames}',
      '',
      '# Requirements',
      '- name: 2–20 characters, describes what the plugin does; no version, brackets or emoji.',
      '- description: 1–2 sentences, at most 60 characters.',
      '- name must not duplicate another plugin name and must differ from the original.',
      '',
      '# Output format',
      'Return a single JSON object, no code fence, no prose:',
      '{"name":"…","description":"…"}',
      '',
      '# Self-review',
      'Check that it is valid JSON with exactly two non-empty fields and a unique name; fix it before answering.',
    ].join('\n')

    const defaultPrompt = () => (LANG === 'en' ? DEFAULT_AI_PROMPT_EN : DEFAULT_AI_PROMPT_ZH)
    const effectivePrompt = () => {
      const saved = typeof store.data.aiPrompt === 'string' ? trim(store.data.aiPrompt) : ''
      return saved || defaultPrompt()
    }
    const AI_PROMPT_MAX = 8000

    let promptDialogNode = null
    let promptDialogState = null

    function closePromptDialog() {
      if (!promptDialogNode) return
      const restore = promptDialogState && promptDialogState.returnFocus
      untrack(promptDialogNode)
      promptDialogNode = null
      promptDialogState = null
      document.removeEventListener('keydown', onPromptKey, true)
      if (restore && restore.isConnected && typeof restore.focus === 'function') {
        restore.focus({ preventScroll: true })
      }
    }

    function savePrompt(text) {
      const value = trim(text || '')
      if ([...value].length > AI_PROMPT_MAX) {
        toast(t('aiPromptTooLong'))
        return
      }
      const next = value === defaultPrompt() ? '' : value
      void mutate((draft) => {
        draft.aiPrompt = next
      }).then((outcome) => {
        if (!outcome.ok) return
        toast(t('aiSaved'))
        closePromptDialog()
      })
    }

    function onPromptKey(event) {
      if (!promptDialogState) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closePromptDialog()
        return
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.stopPropagation()
        savePrompt(promptDialogState.textarea.value)
        return
      }
      if (event.key === 'Tab') {
        const focusables = [...promptDialogState.dialog.querySelectorAll('button, textarea')].filter((node) => !node.disabled && node.style.display !== 'none')
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    function openPromptDialog() {
      closePromptDialog()
      const restoreFocus = document.activeElement
      const textarea = h('textarea', {
        class: 'pmod-input pmod-textarea pmod-prompt',
        rows: '14',
        spellcheck: 'false',
        'aria-label': t('aiPromptTitle'),
        'data-pmod-ai-prompt-input': '',
      })
      textarea.value = effectivePrompt()
      const dialog = h('div', {
        class: 'pmod-dialog pmod-prompt-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('aiPromptTitle'),
        'data-pmod-prompt-dialog': '',
      }, [
        h('div', { class: 'pmod-dialog-head' }, [
          h('h2', { class: 'pmod-dialog-title', text: t('aiPromptTitle') }),
        ]),
        h('div', { class: 'pmod-dialog-fields' }, [
          textarea,
          h('p', { class: 'pmod-hint', text: t('aiPromptHint') }),
        ]),
        h('div', { class: 'pmod-dialog-foot' }, [
          h('button', {
            class: 'pmod-btn pmod-btn-ghost',
            type: 'button',
            'data-pmod-prompt-reset': '',
            text: t('aiPromptReset'),
            on: { click: () => { textarea.value = defaultPrompt(); textarea.focus() } },
          }),
          h('span', { class: 'pmod-foot-gap' }),
          h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-prompt-cancel': '', text: t('cancel'), on: { click: () => closePromptDialog() } }),
          h('button', { class: 'pmod-btn pmod-btn-primary', type: 'button', 'data-pmod-prompt-save': '', text: t('save'), on: { click: () => savePrompt(textarea.value) } }),
        ]),
      ])
      const mask = h('div', { class: 'pmod-mask', 'data-pmod-mask': '' }, [dialog])
      mask.addEventListener('mousedown', (event) => {
        if (event.target === mask) closePromptDialog()
      })
      promptDialogNode = track(mask)
      document.body.appendChild(mask)
      promptDialogState = { dialog, textarea, returnFocus: restoreFocus }
      document.addEventListener('keydown', onPromptKey, true)
      textarea.focus()
    }

    function openDialog(key, fromCard) {
      closeMenu()
      closeDialog()
      // Prefer the card that opened the menu: several surfaces may render the
      // same package, and each surface has its own `caps`.
      const card = (fromCard && fromCard.isConnected && cardKey(fromCard) === key ? fromCard : null) ||
        document.querySelector(`[data-plugin-package="${cssEscape(key.slice(4))}"]`) ||
        document.querySelector(`[data-plugin-item="${cssEscape(key.slice(5))}"]`)
      if (!card) return
      // Surface caps gate the editable fields: an adopter that never declared
      // `desc` must not get a description field, and we must never write it.
      const caps = surfaceOf(card).caps
      const canDesc = key.startsWith('pkg:') && caps.has('desc')
      const canRename = caps.has('rename')
      const origName = card.dataset.pmodOrig || ''
      const origDesc = card.dataset.pmodOrigDesc || ''
      const override = overridesFor(key)
      const nameValue = typeof override.name === 'string' && trim(override.name) ? override.name : origName
      const descValue = Object.prototype.hasOwnProperty.call(override, 'description') ? override.description : origDesc

      const nameInput = h('input', {
        class: 'pmod-input',
        type: 'text',
        maxlength: '40',
        value: nameValue,
        placeholder: t('namePlaceholder'),
        'aria-label': t('displayName'),
      })
      const descInput = h('textarea', {
        class: 'pmod-input pmod-textarea',
        rows: '3',
        maxlength: '120',
        placeholder: t('descPlaceholder'),
        'aria-label': t('displayDesc'),
      })
      descInput.value = descValue

      const dialog = h('div', {
        class: 'pmod-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dialogTitle'),
        'data-pmod-dialog': '',
      })
      const aiPromptButton = h('button', {
        class: 'pmod-btn pmod-btn-ghost pmod-ai-prompt',
        type: 'button',
        'data-pmod-ai-prompt': '',
        text: t('aiPromptEdit'),
      })
      const aiStatus = h('span', { class: 'pmod-ai-status', 'data-pmod-ai-status': '', role: 'status', 'aria-live': 'polite' })
      const aiButton = h('button', {
        class: 'pmod-btn pmod-btn-primary pmod-ai-btn',
        type: 'button',
        'data-pmod-ai': '',
        text: t('aiButton'),
      })
      const aiModelButton = h('button', {
        class: 'pmod-btn pmod-btn-ghost pmod-ai-model',
        type: 'button',
        'data-pmod-ai-model': '',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        title: t('aiModelPick'),
        text: aiPickLabel(),
      })
      // v0.5: the AI row sits at the bottom of the dialog — prompt on the left,
      // one-click generate on the right (user request m04299).
      // v0.7: a model picker sits to the right of the generate button.
      const aiRow = key.startsWith('pkg:') && canRename
        ? h('div', { class: 'pmod-ai-row', 'data-pmod-ai-row': '' }, [
          aiPromptButton,
          h('div', { class: 'pmod-ai-right' }, [aiButton, aiModelButton, aiStatus]),
        ])
        : null
      const head = h('div', { class: 'pmod-dialog-head' }, [
        h('h2', { class: 'pmod-dialog-title', text: t('dialogTitle') }),
        h('div', { class: 'pmod-dialog-orig' }, [
          h('span', { class: 'pmod-dialog-orig-label', text: t('origName') + t('colon') }),
          h('span', { class: 'pmod-dialog-orig-value', 'data-pmod-origname': '', text: origName }),
        ]),
        origDesc && canDesc
          ? h('div', { class: 'pmod-dialog-orig' }, [
            h('span', { class: 'pmod-dialog-orig-label', text: t('origDesc') + t('colon') }),
            h('span', { class: 'pmod-dialog-orig-value', 'data-pmod-origdesc': '', text: origDesc }),
          ])
          : null,
      ])
      const fields = h('div', { class: 'pmod-dialog-fields' }, [
        h('label', { class: 'pmod-field' }, [
          h('span', { class: 'pmod-field-label', text: t('displayName') }),
          nameInput,
        ]),
        canDesc
          ? h('label', { class: 'pmod-field' }, [
            h('span', { class: 'pmod-field-label', text: t('displayDesc') }),
            descInput,
          ])
          : null,
        h('p', { class: 'pmod-hint', text: t('hint') }),
      ])
      const footer = h('div', { class: 'pmod-dialog-foot' }, [
        h('button', { class: 'pmod-btn pmod-btn-ghost', type: 'button', 'data-pmod-restore': '', text: t('restore'), on: { click: () => void restoreDialog() } }),
        h('span', { class: 'pmod-foot-gap' }),
        h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-cancel': '', text: t('cancel'), on: { click: () => closeDialog(true, true) } }),
        h('button', { class: 'pmod-btn pmod-btn-primary', type: 'button', 'data-pmod-save': '', text: t('save'), on: { click: () => void commitDialog() } }),
      ])
      dialog.appendChild(head)
      dialog.appendChild(fields)
      if (aiRow) {
        dialog.appendChild(aiRow)
        aiButton.addEventListener('click', () => void runAi(aiButton, aiStatus, key))
        aiPromptButton.addEventListener('click', () => openPromptDialog())
        aiModelButton.addEventListener('click', () => {
          if (modelMenuNode) {
            closeModelMenu()
            return
          }
          void openModelMenu(aiModelButton, (value) => void chooseAiModel(aiModelButton, value))
        })
        void refreshAiStatus(false).then((configured) => {
          if (!aiButton.isConnected) return
          const pick = aiPickParts()
          // P1-1 (v0.7.1): an explicit OpenAI-compatible endpoint always uses
          // its own model; hide the picker instead of offering a no-op.
          const configSource = store.aiSource === 'config'
          if (aiModelButton.isConnected) aiModelButton.style.display = configSource ? 'none' : ''
          if (!configured) {
            aiButton.disabled = true
            aiButton.title = t('aiNotConfigured')
            aiStatus.textContent = t('aiNotConfigured')
          } else if (configSource) {
            if (modelMenuNode) closeModelMenu()
            aiStatus.textContent = store.aiModel ? t('aiConfigHint', { model: store.aiModel }) : ''
          } else if (pick) {
            aiStatus.textContent = t('aiModelHint', { model: pick.model })
          } else if (store.aiModel) {
            aiStatus.textContent = t('aiModelHint', { model: store.aiModel })
          }
        })
      }
      dialog.appendChild(footer)
      const mask = h('div', { class: 'pmod-mask', 'data-pmod-mask': '' }, [dialog])
      mask.addEventListener('mousedown', (event) => {
        if (event.target === mask) closeDialog(true, false)
      })
      dialogNode = track(mask)
      document.body.appendChild(mask)
      dialogState = {
        key,
        card,
        caps,
        origName,
        origDesc,
        nameInput,
        descInput,
        aiStatus,
        modelButton: aiModelButton,
        // overridesFor() returns {} for a missing key: only a non-empty entry
        // counts as a snapshot, otherwise "cancel" would write an empty override.
        snapshot: Object.keys(override).length ? JSON.parse(JSON.stringify(override)) : null,
        returnFocus: document.activeElement,
        focusables: () => [...dialog.querySelectorAll('button, input, textarea')].filter((node) => !node.disabled),
      }
      document.addEventListener('keydown', onDialogKey, true)
      nameInput.focus()
      nameInput.select()
    }

    function restoreDialog() {
      if (!dialogState) return
      const { key, nameInput, descInput } = dialogState
      nameInput.value = ''
      descInput.value = ''
      // Clear the override immediately without closing the dialog (spec §5.4).
      void mutate((draft) => {
        delete draft.overrides[key]
      })
      nameInput.focus()
    }

    async function commitDialog() {
      if (!dialogState) return
      const { key, caps, origName, origDesc, nameInput, descInput } = dialogState
      // v0.7.3: a manual save always wins over an in-flight AI run.
      cancelAiRuns(dialogNode, key)
      bumpAiSaveEpoch(key)
      const name = trim(nameInput.value)
      const canDesc = key.startsWith('pkg:') && caps.has('desc')
      // Host normalises text too: trim before comparing/saving (N7).
      const desc = canDesc ? trim(descInput.value) : ''
      // Both fields blank means "clear the override" (spec §5.4).
      const blank = !name && !desc
      // Blank name+desc means "drop the text override", but never the icon:
      // an icon chosen on another surface must survive (P2-18).
      const outcome = await mutate((draft) => {
        const entry = { ...(draft.overrides[key] || {}) }
        if (!blank) {
          if (name && name !== origName) entry.name = name
          else delete entry.name
          if (canDesc) {
            if (desc !== origDesc) entry.description = desc
            else delete entry.description
          }
        } else {
          delete entry.name
          delete entry.description
        }
        if (entry.name !== undefined || entry.description !== undefined || entry.icon !== undefined) draft.overrides[key] = entry
        else delete draft.overrides[key]
      })
      if (outcome.ok) closeDialog(false, true)
    }

    // F8/F17 (v0.5): AI rename runs in the background and applies the result
    // itself — the host keeps the conversation going until the output passes
    // the format/uniqueness checks, so the client only reports progress.
    // v0.7.3: AI runs are scoped to the dialog that started them. Dismissing a
    // dialog keeps its run alive; Cancel/Save in *that* dialog abandons only its
    // own run (BUG-V7-3/4), and a new run in the same dialog supersedes the old.
    let aiRunSeq = 0
    const aiRuns = new Set()
    // Bumped by a manual save so a late AI result cannot overwrite typed values.
    const aiSaveEpochs = new Map()

    function cancelAiRuns(dialog, key) {
      for (const run of aiRuns) {
        if (!dialog && !key) run.cancelled = true
        else if (dialog && run.dialog === dialog) run.cancelled = true
        else if (key && run.key === key) run.cancelled = true
      }
    }

    function aiSaveEpoch(key) {
      return aiSaveEpochs.get(key) || 0
    }

    function bumpAiSaveEpoch(key) {
      aiSaveEpochs.set(key, aiSaveEpoch(key) + 1)
    }

    const AI_NAME_MAX = 40
    const AI_DESC_MAX = 120

    function existingPluginNames(excludeKey) {
      const names = []
      const seen = new Set()
      for (const surface of listSurfaces()) {
        for (const card of surface.root.querySelectorAll('[data-plugin-package]')) {
          const key = cardKey(card)
          if (!key || !key.startsWith('pkg:') || key === excludeKey) continue
          const title = titleEl(card)
          const text = title ? trim(titleNameText(title) || '') : ''
          if (!text) continue
          const norm = normText(text)
          if (seen.has(norm)) continue
          seen.add(norm)
          names.push(text)
          if (names.length >= 500) return names
        }
      }
      return names
    }

    async function runAi(button, status, key) {
      if (!button || button.disabled || disposed) return
      const card = cardByKey(key)
      if (!card) return
      const aiCaps = surfaceOf(card).caps
      const aiCanDesc = key.startsWith('pkg:') && aiCaps.has('desc')
      const origName = card.dataset.pmodOrig || ''
      const origDesc = card.dataset.pmodOrigDesc || ''
      // A newer run in the same dialog (or for the same plugin, e.g. after the
      // dialog was closed and reopened) supersedes the previous one.
      cancelAiRuns(dialogNode, key)
      const run = { id: ++aiRunSeq, dialog: dialogNode, key, cancelled: false }
      aiRuns.add(run)
      const saveEpoch = aiSaveEpoch(key)
      button.disabled = true
      let keepDisabled = false
      let attempt = 1
      if (status) status.textContent = t('aiGenerating')
      toast(t('aiGenerating'))
      const timer = window.setInterval(() => {
        if (disposed || run.cancelled || !status || !status.isConnected) return
        attempt += 1
        status.textContent = t('aiRunning', { n: String(attempt) })
      }, 3000)
      try {
        const value = await aiRename(origName, origDesc, effectivePrompt(), existingPluginNames(key), store.aiSource === 'config' ? null : aiPickParts())
        if (disposed || run.cancelled) return
        const name = value && typeof value.name === 'string' ? trim(value.name) : ''
        const desc = value && typeof value.description === 'string' ? trim(value.description) : ''
        if (!name) throw new Error(t('aiFailed'))
        const outcome = await mutate((draft) => {
          // A run cancelled while its request was in flight must not write, even
          // if its PUT replays after a 409 from a competing write.
          if (run.cancelled) return null
          // A manual save that happened after this run started wins: skip.
          if (aiSaveEpoch(key) !== saveEpoch) return null
          const entry = { ...(draft.overrides[key] || {}) }
          if (name && name !== origName) entry.name = [...name].slice(0, AI_NAME_MAX).join('')
          else delete entry.name
          if (aiCanDesc) {
            if (desc && desc !== origDesc) entry.description = [...desc].slice(0, AI_DESC_MAX).join('')
            else delete entry.description
          }
          if (entry.name !== undefined || entry.description !== undefined || entry.icon !== undefined) draft.overrides[key] = entry
          else delete draft.overrides[key]
          return name
        })
        if (!outcome.ok) {
          if (status && status.isConnected) status.textContent = t('aiFailed')
          return
        }
        if (outcome.result === null) return
        toast(t('aiSuccessRename', { old: origName || card.dataset.pmodOrig || name, new: String(outcome.result) }))
        // Only close the dialog this run came from (never another plugin's open dialog).
        if (dialogNode === run.dialog) closeDialog()
      } catch (error) {
        if (disposed || run.cancelled) return
        const code = Number(error && error.status) || 0
        if (code === 501) {
          if (status && status.isConnected) status.textContent = t('aiNotConfigured')
          else toast(t('aiNotConfigured'))
          keepDisabled = true
          button.disabled = true
          void refreshAiStatus(true)
          return
        }
        const reason = (error && (error.message || error.code)) || String(error)
        if (status && status.isConnected) status.textContent = t('aiFailedReason', { reason })
        toast(t('aiFailedReason', { reason }))
      } finally {
        window.clearInterval(timer)
        aiRuns.delete(run)
        if (!disposed && !run.cancelled && button.isConnected && !keepDisabled) button.disabled = false
      }
    }

    // ---- icon dialog (F9) -------------------------------------------------
    let iconDialogNode = null
    let iconDialogState = null

    function closeIconDialog() {
      if (!iconDialogNode) return
      const restore = iconDialogState && iconDialogState.restoreFocus
      untrack(iconDialogNode)
      iconDialogNode = null
      iconDialogState = null
      document.removeEventListener('keydown', onIconDialogKey, true)
      if (restore && restore.isConnected && typeof restore.focus === 'function') {
        restore.focus({ preventScroll: true })
      }
    }

    function onIconDialogKey(event) {
      if (!iconDialogState || !iconDialogState.dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeIconDialog()
        return
      }
      if (event.key !== 'Tab') return
      // Skip controls currently hidden by inline display (the delete/save swap):
      // they are not tabbable, and including them breaks the wrap-around so Tab
      // can leave the dialog entirely.
      const focusables = [...iconDialogState.dialog.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(
        (el) => el.style.display !== 'none' && !el.hidden,
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!focusables.includes(document.activeElement)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // v0.3.1: the browser decides the upload mime from `file.type`, which is
    // empty for .ico on Windows and "image/vnd.microsoft.icon" elsewhere. The
    // host normalises aliases and sniffs magic bytes, so send a normalised
    // declaration and fall back to the extension when the platform says nothing.
    const ICON_MIME_BY_EXT = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
    }
    const ICON_MIME_ALIASES = {
      'image/jpg': 'image/jpeg',
      'image/vnd.microsoft.icon': 'image/x-icon',
      'image/icon': 'image/x-icon',
    }
    const ICON_MIME_SET = new Set(Object.values(ICON_MIME_BY_EXT))
    const iconMimeOf = (file) => {
      const declared = String((file && file.type) || '').toLowerCase()
      const mapped = ICON_MIME_ALIASES[declared] || declared
      if (ICON_MIME_SET.has(mapped)) return mapped
      const match = /\.([a-z0-9]+)$/i.exec(String((file && file.name) || ''))
      const ext = match ? match[1].toLowerCase() : ''
      return ICON_MIME_BY_EXT[ext] || declared || 'application/octet-stream'
    }

    const readAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const raw = String(reader.result || '')
        const comma = raw.indexOf(',')
        if (comma < 0) {
          resolve(raw)
          return
        }
        resolve('data:' + iconMimeOf(file) + ';base64,' + raw.slice(comma + 1))
      }
      reader.onerror = () => reject(reader.error || Error('read failed'))
      reader.readAsDataURL(file)
    })

    function openIconDialog(key, fromCard) {
      // Remember where focus was (the menu row / card) so closing can return it.
      const restoreFocus = document.activeElement
      closeMenu()
      closeDialog()
      closeIconDialog()
      const card = (fromCard && fromCard.isConnected && cardKey(fromCard) === key ? fromCard : null) || cardByKey(key)
      if (!card) return
      let selected = overridesFor(key).icon || ''
      let deleteMode = false
      const picks = new Set()
      const dialog = h('div', {
        class: 'pmod-dialog pmod-icon-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('iconDialogTitle'),
        'data-pmod-icon-dialog': '',
      })
      // v0.3.1: "恢复默认" moved to the top-right of the dialog head.
      const defaultButton = h('button', { class: 'pmod-btn pmod-btn-ghost', type: 'button', 'data-pmod-icon-default': '', text: t('iconDefault') })
      dialog.appendChild(h('div', { class: 'pmod-dialog-head pmod-icon-head' }, [
        h('h2', { class: 'pmod-dialog-title', text: t('iconDialogTitle') }),
        h('div', { class: 'pmod-icon-head-actions' }, [defaultButton]),
      ]))
      const grid = h('div', { class: 'pmod-icon-grid', 'data-pmod-icon-grid': '' })
      dialog.appendChild(grid)
      const hint = h('div', { class: 'pmod-icon-hint', 'data-pmod-icon-hint': '', role: 'status', 'aria-live': 'polite' })
      hint.style.display = 'none'
      dialog.appendChild(hint)

      const fileInput = h('input', {
        class: 'pmod-file',
        type: 'file',
        accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.png,.jpg,.jpeg,.webp,.gif,.svg,.ico,.zip',
        multiple: 'true',
        'data-pmod-file': '',
        tabindex: '-1',
      })
      const addButton = h('button', { class: 'pmod-btn pmod-btn-ghost', type: 'button', 'data-pmod-icon-add': '', text: t('iconAdd') })
      const deleteButton = h('button', { class: 'pmod-btn pmod-btn-ghost', type: 'button', 'data-pmod-icon-delete': '', text: t('iconDelete') })
      const deleteConfirm = h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-icon-delete-confirm': '', text: t('iconDeleteConfirm') })
      const deleteCancel = h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-icon-delete-cancel': '', text: t('iconDeleteCancel') })
      deleteConfirm.style.display = 'none'
      deleteCancel.style.display = 'none'
      const cancelButton = h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-icon-cancel': '', text: t('cancel') })
      const saveButton = h('button', { class: 'pmod-btn pmod-btn-primary', type: 'button', 'data-pmod-icon-save': '', text: t('save') })
      const footer = h('div', { class: 'pmod-dialog-foot pmod-icon-foot', 'data-pmod-icon-foot': '' }, [
        addButton,
        fileInput,
        deleteButton,
        deleteConfirm,
        deleteCancel,
        h('span', { class: 'pmod-foot-gap' }),
        cancelButton,
        saveButton,
      ])
      dialog.appendChild(footer)

      const tile = (id, node, active, kind) => {
        // v0.5: built-in icons can be deleted too (user request m04299) — they
        // are hidden from the library rather than removed from code.
        const picking = deleteMode
        const picked = picking && picks.has(id)
        const button = h('button', {
          class:
            'pmod-icon-tile' +
            (active ? ' pmod-icon-tile-on' : '') +
            (picked ? ' pmod-icon-tile-pick' : ''),
          type: 'button',
          'aria-pressed': active || picked ? 'true' : 'false',
          'data-pmod-icon-tile': id,
          'data-pmod-icon-kind': kind,
          title: id,
        }, [node])
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (deleteMode) {
            if (picks.has(id)) picks.delete(id)
            else picks.add(id)
            render()
            return
          }
          selected = id
          render()
        })
        return button
      }

      const render = () => {
        grid.textContent = ''
        // v0.3.1: one flat grid — built-in and uploaded icons are no longer
        // split into labelled sections (user asked for a single place).
        for (const icon of visibleBuiltinIcons()) {
          const holder = h('span', { class: 'pmod-icon-glyph', 'aria-hidden': 'true' })
          holder.innerHTML = icon.svg
          grid.appendChild(tile(icon.id, holder, selected === icon.id && !deleteMode, 'builtin'))
        }
        for (const icon of store.data.icons) {
          grid.appendChild(tile(icon.id, h('img', {
            class: 'pmod-icon-img',
            src: ROOT + '/icons/' + encodeURIComponent(icon.id),
            alt: icon.name || '',
            width: '36',
            height: '36',
          }), selected === icon.id && !deleteMode, 'uploaded'))
        }
        if (!visibleBuiltinIcons().length && !store.data.icons.length && !deleteMode) {
          grid.appendChild(h('div', { class: 'pmod-icon-empty', 'data-pmod-icon-empty': '', text: t('iconEmpty') }))
        }
        defaultButton.setAttribute('aria-pressed', !selected && !deleteMode ? 'true' : 'false')
        deleteButton.style.display = deleteMode ? 'none' : ''
        deleteConfirm.style.display = deleteMode ? '' : 'none'
        deleteCancel.style.display = deleteMode ? '' : 'none'
        saveButton.style.display = deleteMode ? 'none' : ''
        const hintText = deleteMode ? t('iconDeleteHint') + ' · ' + t('batchCount', { n: picks.size }) : ''
        if (hint.textContent !== hintText) hint.textContent = hintText
        hint.style.display = deleteMode ? '' : 'none'
      }

      const enterDeleteMode = () => {
        deleteMode = true
        picks.clear()
        render()
        // The clicked button just got hidden: keep focus inside the dialog and
        // on a visible control, otherwise Tab starts from <body> and escapes.
        deleteConfirm.focus({ preventScroll: true })
      }
      const exitDeleteMode = () => {
        deleteMode = false
        picks.clear()
        render()
        deleteButton.focus({ preventScroll: true })
      }
      const confirmDelete = async () => {
        const ids = [...picks]
        if (!ids.length) {
          toast(t('iconDeleteNone'))
          return
        }
        const builtinIds = ids.filter((id) => BUILTIN_ICON_ID_SET.has(id))
        const uploadedIds = ids.filter((id) => !BUILTIN_ICON_ID_SET.has(id))
        let removed = 0
        let reason = ''
        for (const id of uploadedIds) {
          if (disposed) return
          try {
            await api('/icons/' + encodeURIComponent(id), { method: 'DELETE' })
            removed += 1
          } catch (error) {
            reason = (error && (error.message || error.code)) || String(error)
          }
        }
        if (builtinIds.length && !disposed) {
          // Built-in icons live in code: deleting one means hiding it and
          // dropping every override that points at it.
          const outcome = await mutate((draft) => {
            const hidden = new Set(Array.isArray(draft.hiddenIcons) ? draft.hiddenIcons : [])
            for (const id of builtinIds) hidden.add(id)
            draft.hiddenIcons = [...hidden]
            for (const key of Object.keys(draft.overrides || {})) {
              const entry = draft.overrides[key]
              if (entry && typeof entry.icon === 'string' && builtinIds.includes(entry.icon)) {
                delete entry.icon
                if (entry.name === undefined && entry.description === undefined) delete draft.overrides[key]
              }
            }
          })
          if (outcome.ok) removed += builtinIds.length
          else reason = reason || 'save-failed'
        }
        await loadState()
        const gone = new Set([...builtinIds, ...uploadedIds])
        if (selected && gone.has(selected)) selected = ''
        exitDeleteMode()
        if (removed) toast(t('iconDeleteDone', { n: removed }))
        else toast(t('iconDeleteFailed', { reason: reason || 'failed' }))
      }

      addButton.addEventListener('click', (event) => {
        event.preventDefault()
        fileInput.click()
      })
      deleteButton.addEventListener('click', (event) => {
        event.preventDefault()
        enterDeleteMode()
      })
      deleteCancel.addEventListener('click', (event) => {
        event.preventDefault()
        exitDeleteMode()
      })
      deleteConfirm.addEventListener('click', (event) => {
        event.preventDefault()
        void confirmDelete()
      })
      defaultButton.addEventListener('click', (event) => {
        event.preventDefault()
        selected = ''
        render()
      })
      cancelButton.addEventListener('click', () => closeIconDialog())
      saveButton.addEventListener('click', () => void saveIcon())
      fileInput.addEventListener('change', () => {
        const files = [...(fileInput.files || [])]
        fileInput.value = ''
        void uploadFiles(files)
      })

      const uploadFiles = async (files) => {
        for (const file of files) {
          if (!file || disposed) continue
          if (store.data.icons.length >= 100) {
            toast(t('iconLimit'))
            return
          }
          try {
            const dataUrl = await readAsDataUrl(file)
            const zip = /\.zip$/i.test(file.name) || file.type === 'application/zip'
            const payload = zip
              ? { name: file.name, zip: dataUrl.split(',')[1] || '' }
              : { name: file.name, dataUrl }
            const value = await uploadIcons(payload)
            await loadState()
            const added = value && Array.isArray(value.icons) ? value.icons : []
            if (added.length && added[0] && added[0].id) selected = added[0].id
            render()
          } catch (error) {
            const code = Number(error && error.status) || 0
            if (code === 409) toast(t('iconLimit'))
            else if (code === 400) toast(t('iconBadFile'))
            else toast(t('iconUploadFailed'))
          }
        }
      }

      const saveIcon = async () => {
        const icon = selected || ''
        const outcome = await mutate((draft) => {
          const current = draft.overrides[key] ? { ...draft.overrides[key] } : {}
          if (icon) current.icon = icon
          else delete current.icon
          if (current.name !== undefined || current.description !== undefined || current.icon !== undefined) {
            draft.overrides[key] = current
          } else {
            delete draft.overrides[key]
          }
        })
        if (outcome.ok) closeIconDialog()
      }

      const mask = h('div', { class: 'pmod-mask', 'data-pmod-mask': '' }, [dialog])
      mask.addEventListener('mousedown', (event) => {
        if (event.target === mask) closeIconDialog()
      })
      iconDialogNode = track(mask)
      iconDialogState = { dialog, key, restoreFocus }
      document.body.appendChild(mask)
      document.addEventListener('keydown', onIconDialogKey, true)
      render()
      addButton.focus()
    }

    // ---- confirm dialog (F10) ---------------------------------------------
    let confirmNode = null
    let confirmCleanup = null

    function closeConfirm() {
      if (!confirmNode) return
      untrack(confirmNode)
      confirmNode = null
      if (confirmCleanup) confirmCleanup()
      confirmCleanup = null
    }

    function openConfirm(options) {
      closeConfirm()
      return new Promise((resolve) => {
        const dialog = h('div', {
          class: 'pmod-dialog pmod-confirm',
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-label': options.title,
        })
        dialog.appendChild(h('div', { class: 'pmod-dialog-head' }, [
          h('h2', { class: 'pmod-dialog-title', text: options.title }),
        ]))
        dialog.appendChild(h('p', { class: 'pmod-confirm-body', text: options.body }))
        const cancelButton = h('button', { class: 'pmod-btn', type: 'button', 'data-pmod-confirm-cancel': '', text: t('cancel') })
        const okButton = h('button', { class: options.danger ? 'pmod-btn pmod-btn-danger' : 'pmod-btn', type: 'button', 'data-pmod-confirm-ok': '', text: options.confirm })
        dialog.appendChild(h('div', { class: 'pmod-dialog-foot' }, [
          h('span', { class: 'pmod-foot-gap' }),
          cancelButton,
          okButton,
        ]))
        const mask = h('div', { class: 'pmod-mask', 'data-pmod-mask': '' }, [dialog])
        let settled = false
        const finish = (value) => {
          if (settled) return
          settled = true
          closeConfirm()
          resolve(value)
        }
        mask.addEventListener('mousedown', (event) => {
          if (event.target === mask) finish(false)
        })
        cancelButton.addEventListener('click', () => finish(false))
        okButton.addEventListener('click', () => finish(true))
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finish(false)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            finish(true)
          }
        }
        document.addEventListener('keydown', onKey, true)
        confirmNode = track(mask)
        confirmCleanup = () => document.removeEventListener('keydown', onKey, true)
        document.body.appendChild(mask)
        okButton.focus()
      })
    }

    async function uninstallAt(key) {
      if (!key.startsWith('pkg:')) return
      const name = key.slice(4)
      const confirmed = await openConfirm({
        title: t('uninstallTitle'),
        body: t('uninstallBody', { name }),
        confirm: t('uninstallConfirm'),
        danger: true,
      })
      if (!confirmed) return
      try {
        const result = await uninstallBundle(name)
        // Native removeBundle resolves with a management result; failures come
        // back as application:'failed' + error instead of a rejected promise.
        if (result && (result.error || result.application === 'failed' || result.application === 'cancelled')) {
          const reason = (result.error && (result.error.code || result.error.message)) || result.application || 'failed'
          toast(t('uninstallFailed', { reason: String(reason) }))
          schedule()
          return
        }
        if (store.data.overrides[key]) {
          await mutate((draft) => {
            delete draft.overrides[key]
          }, { silent: true })
        }
        await refreshBundles(true)
        toast(t('uninstallDone', { name }))
      } catch (error) {
        toast(t('uninstallFailed', { reason: String((error && error.message) || error) }))
      }
      schedule()
    }

    // F1: installBundle is a configurable own accessor (RemoteNamespaceService
    // .install), so plain assignment is a no-op; replace the own descriptor.
    const guard = { pm: null, desc: null, ok: false }

    function guardInstall() {
      if (disposed) return
      let pm = null
      try {
        pm = ctxRef && ctxRef.remote ? ctxRef.remote.pluginManager : null
      } catch {
        pm = null
      }
      if (!pm) return
      let current = null
      try {
        current = pm.installBundle
      } catch {
        current = null
      }
      if (typeof current !== 'function') return
      if (current.__pmpWrapped) return
      let desc = null
      try {
        desc = Object.getOwnPropertyDescriptor(pm, 'installBundle')
      } catch {
        desc = null
      }
      if (!desc || typeof desc.get !== 'function') {
        degradeGuard()
        return
      }
      const replacement = {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          const original = desc.get.call(this)
          if (typeof original !== 'function') return original
          const wrapped = function installBundleWithoutEnabling(spec, options) {
            const next = Object.assign({}, options || {})
            next.enabled = false
            return original.call(this, spec, next)
          }
          wrapped.__pmpWrapped = true
          return wrapped
        },
      }
      try {
        Object.defineProperty(pm, 'installBundle', replacement)
        guard.pm = pm
        guard.desc = desc
        guard.ok = true
      } catch (error) {
        console.warn('[plugin-manager-plus] install guard could not be installed:', error)
        degradeGuard()
      }
    }

    function restoreGuard() {
      if (!guard.ok || !guard.pm || !guard.desc) return
      try {
        Object.defineProperty(guard.pm, 'installBundle', guard.desc)
      } catch (error) {
        console.warn('[plugin-manager-plus] install guard could not be restored:', error)
      }
      guard.ok = false
      guard.pm = null
      guard.desc = null
    }

    // Fallback (spec §6.7): the native events carry no bundle name, so diff the
    // bundle list around the install (10s window) and switch new/off->on bundles
    // back off, once per bundle.
    const INSTALL_WINDOW_MS = 10000
    const degraded = {
      active: false,
      until: 0,
      snapshot: null, // Map<name, enabled> taken before the current install
      handled: new Set(), // bundles already switched off for this install
      busy: false,
      unavailable: false,
      snapshotPromise: null,
    }

    function noteGuardUnavailable() {
      if (degraded.unavailable) return
      degraded.unavailable = true
      console.warn('[plugin-manager-plus] install guard unavailable: the bundle list cannot be read')
      toast(t('guardUnavailable'))
    }

    function readBundleStates() {
      const pm = pluginManagerApi()
      if (!pm || typeof pm.listBundles !== 'function') return Promise.resolve(null)
      return Promise.resolve()
        .then(() => pm.listBundles())
        .then((result) => {
          const list = result && Array.isArray(result.value) ? result.value : Array.isArray(result) ? result : null
          if (!list) return null
          const states = new Map()
          for (const row of list) {
            if (!row || typeof row.name !== 'string' || !row.name) continue
            states.set(row.name, row.enabled !== false)
          }
          return states
        })
        .catch((error) => {
          console.warn('[plugin-manager-plus] could not read the bundle list:', error)
          return null
        })
    }

    function refreshGuardSnapshot() {
      if (degraded.snapshotPromise) return degraded.snapshotPromise
      degraded.snapshotPromise = readBundleStates().then((states) => {
        degraded.snapshotPromise = null
        if (disposed) return degraded.snapshot
        if (!states) {
          noteGuardUnavailable()
          return degraded.snapshot
        }
        degraded.snapshot = states
        return states
      })
      return degraded.snapshotPromise
    }

    async function degradeGuardCheck() {
      if (disposed || !degraded.active || degraded.busy) return
      if (!degraded.until || Date.now() > degraded.until) return
      degraded.busy = true
      try {
        if (degraded.snapshotPromise) await degraded.snapshotPromise
        if (disposed) return
        if (!degraded.snapshot) await refreshGuardSnapshot()
        if (disposed || !degraded.snapshot) return
        const current = await readBundleStates()
        if (disposed) return
        if (!current) {
          noteGuardUnavailable()
          return
        }
        const targets = []
        for (const [name, enabled] of current) {
          if (!enabled || degraded.handled.has(name)) continue
          // Only names that appear after the pre-install snapshot: a bundle the
          // user enabled by hand mid-window must be left alone (N5).
          if (!degraded.snapshot.has(name)) targets.push(name)
        }
        if (!targets.length) return
        const pm = pluginManagerApi()
        if (!pm || typeof pm.setBundleEnabled !== 'function') {
          noteGuardUnavailable()
          return
        }
        for (const name of targets) {
          if (disposed) return
          if (degraded.handled.has(name)) continue
          degraded.handled.add(name)
          try {
            await pm.setBundleEnabled(name, false)
            if (disposed) return
            console.warn('[plugin-manager-plus] disabled an auto-enabled bundle:', name)
          } catch (error) {
            console.warn('[plugin-manager-plus] could not disable bundle:', name, error)
          }
        }
      } finally {
        degraded.busy = false
      }
    }

    function degradeGuard() {
      if (degraded.active) return
      degraded.active = true
      console.warn('[plugin-manager-plus] install guard degraded to the event fallback')
      try {
        if (!ctxRef || !ctxRef.remote || typeof ctxRef.remote.$on !== 'function') {
          noteGuardUnavailable()
          return
        }
        const offInstall = ctxRef.remote.$on('plugin-manager/install-state', (payload) => {
          if (disposed) return
          const phase = payload && payload.phase
          const now = Date.now()
          const fresh = !degraded.until || now > degraded.until
          degraded.until = now + INSTALL_WINDOW_MS
          // Real phases are installing/cancelling/applying (N6): snapshot once
          // per install, never mid-window, or the new bundle may be included.
          if (fresh || phase === 'installing') {
            degraded.handled.clear()
            void refreshGuardSnapshot()
          }
          void degradeGuardCheck()
        })
        if (typeof offInstall === 'function') disposers.push(offInstall)
        const offChanged = ctxRef.remote.$on('plugin-manager/changed', () => {
          if (disposed) return
          if (!degraded.until || Date.now() > degraded.until) return
          void degradeGuardCheck()
        })
        if (typeof offChanged === 'function') disposers.push(offChanged)
        void refreshGuardSnapshot()
      } catch (error) {
        console.warn('[plugin-manager-plus] install guard fallback failed:', error)
        noteGuardUnavailable()
      }
    }

    // paint engine (rAF coalesced, idempotent)
    let scheduled = false
    let rafId = 0

    function schedule() {
      if (disposed || scheduled) return
      scheduled = true
      rafId = window.requestAnimationFrame(() => {
        scheduled = false
        rafId = 0
        try {
          applyAll()
        } catch (error) {
          console.warn('[plugin-manager-plus] paint failed:', error)
        }
      })
    }

    function applyAll() {
      if (disposed) return
      guardInstall()
      if (dragCard && (!dragCard.isConnected || !store.orderMode)) finishDrag()
      for (const surface of listSurfaces()) {
        ensureBar(surface)
        syncDragMode(surface)
      }
      pruneSelection()
      for (const surface of listSurfaces()) {
        for (const card of surface.root.querySelectorAll(CARD_SELECTOR)) {
          paintCard(card)
          const key = card.dataset.pmodKey
          if (key && key.startsWith('pkg:') && store.loaded && !store.data.seen[key]) noteSeen(key)
        }
      }
      paintSelection()
      applyFilter()
      selfCheck()
    }

    // F6/F7: remember when a bundle was first seen so "recently seen" ordering
    // and future install-time features have a timestamp to work with.
    const pendingSeen = new Map()
    let seenTimer = 0
    function noteSeen(key) {
      if (!key || disposed || pendingSeen.has(key)) return
      pendingSeen.set(key, new Date().toISOString())
      if (seenTimer) return
      seenTimer = window.setTimeout(() => {
        seenTimer = 0
        if (disposed || !pendingSeen.size) return
        const entries = [...pendingSeen.entries()].slice(0, 40)
        pendingSeen.clear()
        void mutate((draft) => {
          draft.seen = draft.seen || {}
          for (const [seenKey, at] of entries) {
            if (!draft.seen[seenKey]) draft.seen[seenKey] = at
          }
        }, { silent: true })
      }, 2000)
    }

    function syncDragMode(surface) {
      const root = surface.root
      // Drag ordering is a native-page capability: surfaces without the
      // `order` cap never get drag affordances (contract v1).
      const on = store.orderMode && !store.batch && surface.caps.has('order')
      // v0.3.1 (B1): while reordering, the native card :hover is suppressed on
      // the whole panel (see CSS). Native cards never move under the pointer by
      // themselves, so Chromium can keep a stale :hover on a card that was left
      // behind by a drop — it then stays lit until the pointer moves or the page
      // changes. A panel-level flag covers REPLACED cards too, before `applyAll`
      // has re-flagged them (React re-renders drop all `data-pmod-*`).
      if (on) root.setAttribute('data-pmod-ordering', '1')
      else root.removeAttribute('data-pmod-ordering')
      for (const card of root.querySelectorAll(CARD_SELECTOR)) {
        const flagged = card.getAttribute('data-pmod-draggable') === '1'
        if (on && !flagged) {
          card.setAttribute('data-pmod-draggable', '1')
          card.setAttribute('draggable', 'true')
          if (!card.querySelector('[data-pmod-drag]')) {
            const head = card.firstElementChild
            if (head) {
              const handle = document.createElement('span')
              handle.className = 'pmod-drag'
              handle.setAttribute('data-pmod-drag', '')
              handle.setAttribute('aria-hidden', 'true')
              handle.textContent = '\u28ff'
              head.appendChild(handle)
            }
          }
        } else if (!on && flagged) {
          card.removeAttribute('data-pmod-draggable')
          card.removeAttribute('draggable')
          for (const handle of card.querySelectorAll('[data-pmod-drag]')) handle.remove()
        }
      }
    }

    let missingAnchorWarned = false
    function selfCheck() {
      if (missingAnchorWarned) return
      const surfaces = listSurfaces()
      if (!surfaces.length) return
      const cards = [...document.querySelectorAll(CARD_SELECTOR)]
      if (!cards.length) return
      const broken = cards.filter((card) => !titleEl(card))
      if (!broken.length) return
      missingAnchorWarned = true
      if (broken.every((card) => isNativeCard(card))) {
        console.warn('[plugin-manager-plus] native anchors changed')
      } else {
        console.warn('[plugin-manager-plus] surface card without title anchor', cardKey(broken[0]) || '(unknown)')
      }
    }

    function isOwnNode(node) {
      const element = node && node.nodeType === 1 ? node : node && node.parentElement
      if (!element || typeof element.closest !== 'function') return false
      // Nodes we paint ourselves (bar, menu, toast, injected description /
      // original-name spans) must not re-trigger the observer, otherwise the
      // repaint would feed itself.
      return !!element.closest('[data-pmod-bar],[data-pmod-menu],[data-pmod-sortmenu],[data-pmod-mask],[data-pmod-empty],[data-pmod-tagin],[data-pmod-toast],[data-pmod-desc],[data-pmod-orig],[data-pmod-ico]')
    }

    let observer = null
    let tickTimer = 0

    function startWatch() {
      try {
        observer = new MutationObserver((records) => {
          if (disposed) return
          let relevant = false
          for (const record of records) {
            if (isOwnNode(record.target)) continue
            if (record.type === 'childList' && record.addedNodes.length) {
              for (const node of record.addedNodes) {
                if (isOwnNode(node)) continue
                relevant = true
                break
              }
            } else {
              relevant = true
            }
            if (relevant) break
          }
          if (relevant) schedule()
        })
        observer.observe(document.body, { childList: true, subtree: true })
      } catch (error) {
        console.warn('[plugin-manager-plus] observer unavailable:', error)
      }
      // React may repaint text without any childList change we can observe, and
      // the remote namespace can be remounted; a slow tick keeps us honest.
      tickTimer = window.setInterval(() => schedule(), 1500)
      document.addEventListener('contextmenu', onContextMenu, true)
      document.addEventListener('dragstart', onDragStart, true)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('dragend', onDragEnd, true)
      document.addEventListener('click', onOrderCaptureClick, true)
    }

    // context menu entry point
    function onContextMenu(event) {
      if (disposed) return
      const target = event.target
      if (!target || typeof target.closest !== 'function') return
      const card = target.closest(CARD_SELECTOR)
      if (!card) return
      const surface = surfaceOf(card)
      if (!surface) return
      const key = cardKey(card)
      if (!key) return
      event.preventDefault()
      // Refresh the bundle snapshot in the background so "Uninstall" knows
      // whether the row is removable; the menu itself stays synchronous.
      void refreshBundles(false)
      if (store.batch && surface.caps.has('batch')) {
        // F13: right-clicking an unselected card selects it first, then the
        // batch menu acts on the whole selection.
        if (!store.selection.has(key)) {
          store.selection.add(key)
          schedule()
        }
        buildMenu(batchMenuItems(surface), event.clientX, event.clientY)
        return
      }
      buildMenu(menuItemsFor(surface, key, card), event.clientX, event.clientY)
    }

    // teardown
    function cleanupDom() {
      for (const node of document.querySelectorAll('[data-pmod-bar],[data-pmod-empty]')) {
        if (node.parentNode) node.parentNode.removeChild(node)
      }
      for (const node of document.querySelectorAll('[data-pmod-hid]')) {
        node.style.display = ''
        node.removeAttribute('data-pmod-hid')
      }
      for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        const title = titleEl(card)
        if (title && card.dataset.pmodOrig) title.textContent = card.dataset.pmodOrig
        if (title && title.tagName === 'BUTTON' && card.dataset.pmodOrigAria) {
          title.setAttribute('aria-label', card.dataset.pmodOrigAria)
        }
        for (const span of card.querySelectorAll('[data-pmod-orig],[data-pmod-desc],[data-pmod-ico]')) {
          if (span.parentNode) span.parentNode.removeChild(span)
        }
        for (const slot of card.querySelectorAll('[data-pmod-icon]')) {
          slot.removeAttribute('data-pmod-icon')
          for (const child of slot.children) {
            if (child.style && child.style.display === 'none') child.style.display = ''
          }
        }
        card.style.display = ''
        if (card.style.order) card.style.order = ''
        if (card.style.boxShadow) card.style.boxShadow = ''
        card.removeAttribute('data-pmod-selected')
        card.removeAttribute('data-pmod-draggable')
        card.removeAttribute('draggable')
        card.classList.remove('pmod-dragging')
        for (const handle of card.querySelectorAll('[data-pmod-drag]')) handle.remove()
        for (const name of ['pmodOrig', 'pmodOrigAria', 'pmodOrigDesc', 'pmodCaptured', 'pmodKey']) {
          delete card.dataset[name]
        }
      }
      for (const section of document.querySelectorAll(ANY_GROUP_SELECTOR)) section.style.display = ''
      for (const root of document.querySelectorAll('[data-plugin-panel], [data-plugin-surface]')) {
        root.removeAttribute('data-pmod-ordering')
      }
    }

    function teardown() {
      if (disposed) return
      disposed = true
      window.clearInterval(tickTimer)
      tickTimer = 0
      if (rafId) window.cancelAnimationFrame(rafId)
      rafId = 0
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          /* ignored */
        }
        observer = null
      }
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragend', onDragEnd, true)
      document.removeEventListener('click', onOrderCaptureClick, true)
      window.clearTimeout(seenTimer)
      seenTimer = 0
      window.clearTimeout(swallowTimer)
      swallowTimer = 0
      finishDrag()
      closeSortMenu()
      closeMenu()
      cancelAiRuns(null, null)
      closeDialog()
      closeModelMenu()
      closePromptDialog()
      closeIconDialog()
      closeConfirm()
      restoreGuard()
      cleanupDom()
      window.clearTimeout(toastTimer)
      for (const node of [...transients]) untrack(node)
      for (const dispose of disposers.splice(0)) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* ignored */
        }
      }
      for (const tag of document.querySelectorAll('style[data-plugin="plugin-manager-plus"]')) {
        if (tag.parentNode) tag.parentNode.removeChild(tag)
      }
    }

    // CSS (tokens only: no literal colours, radii or shadows)
    const CSS = `
[data-plugin="plugin-manager-plus"] {}

[data-pmod-bar] {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 4px 0 10px;
}
[data-pmod-bar] .pmod-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
[data-pmod-bar] .pmod-pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  line-height: 1;
  font-family: inherit;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
[data-pmod-bar] .pmod-pill:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-pmod-bar] .pmod-pill:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
[data-pmod-bar] .pmod-pill.pmod-pill-on {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
[data-pmod-bar] .pmod-add {
  color: var(--dsw-alias-label-tertiary);
  border-style: dashed;
}
.pmod-status {
  font-size: 12px;
  color: var(--dsw-alias-state-warn-primary);
}
.pmod-tagin {
  display: inline-flex;
  align-items: center;
}
.pmod-tagin-input {
  height: 28px;
  width: 160px;
  padding: 0 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-sm);
  outline: none;
}

.pmod-orig {
  margin-inline-start: 8px; font-size: 12px; line-height: 20px; font-weight: 400;
  max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-desc {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.pmod-orig-desc {
  display: block; margin-inline-start: 0; margin-top: 2px; max-width: none;
  overflow: visible; text-overflow: clip; white-space: normal;
  font-size: 12px; color: var(--dsw-alias-label-tertiary);
}
.pmod-empty {
  padding: 28px 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
}

.pmod-menu {
  position: fixed;
  z-index: 9998;
  min-width: 160px;
  padding: 4px;
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-prominent);
}
.pmod-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.pmod-menu-item:hover,
.pmod-menu-item.is-active {
  background: var(--dsw-alias-interactive-bg-hover);
}
.pmod-menu-item.is-disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.pmod-menu-check {
  width: 14px;
  flex: none;
  color: var(--dsw-alias-state-business-primary);
}
.pmod-menu-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmod-menu-arrow {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-menu-group { padding: 4px 8px 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.pmod-menu-current { flex: none; margin-inline-start: 6px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.pmod-menu-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l1);
}
.pmod-submenu {
  position: absolute;
}

.pmod-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
}
.pmod-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 18px 20px;
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  box-shadow: var(--dsw-elevation-prominent);
}
.pmod-dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.pmod-dialog-orig {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmod-dialog-orig-label {
  color: var(--dsw-alias-label-tertiary);
}
.pmod-dialog-orig-value {
  color: var(--dsw-alias-label-secondary);
}
.pmod-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pmod-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pmod-field-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.pmod-input {
  padding: 7px 9px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  outline: none;
}
.pmod-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}
.pmod-textarea {
  resize: vertical;
  min-height: 62px;
  line-height: 1.5;
}
.pmod-hint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-dialog-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pmod-foot-gap {
  flex: 1 1 auto;
}
.pmod-btn {
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.pmod-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.pmod-btn-primary {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-primary-fill);
  border-color: var(--dsw-alias-button-primary-fill);
}
.pmod-btn-primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.pmod-btn-ghost {
  color: var(--dsw-alias-label-secondary);
  background: transparent;
}
.pmod-btn-ghost:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.pmod-toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  z-index: 10000;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--dsw-alias-toast-label);
  background: var(--dsw-alias-toast-bg);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-prominent);
}

/* ---- v0.2: filter row, sort menu, drag ordering ---- */
[data-pmod-bar] {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.pmod-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pmod-row-pills {
  flex-wrap: wrap;
  min-height: 28px;
}
.pmod-tools {
  justify-content: flex-start;
}
.pmod-search {
  flex: 1 1 160px;
  min-width: 120px;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  outline: none;
}
.pmod-search::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.pmod-search:focus {
  border-color: var(--dsw-alias-state-business-primary);
}
.pmod-tool {
  flex: none;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
  white-space: nowrap;
}
.pmod-tool:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.pmod-tool:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
.pmod-tool-on {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
.pmod-tool-on:hover {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-business-primary);
}
[data-pmod-sortmenu] {
  max-height: min(60vh, 420px);
  overflow-y: auto;
}
span.pmod-drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  margin-inline-start: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 15px;
  line-height: 1;
  cursor: grab;
  pointer-events: none;
  user-select: none;
}
[data-pmod-draggable="1"] {
  cursor: grab;
}
.pmod-dragging {
  opacity: 0.55;
  cursor: grabbing;
}
/* v0.3.1 (B1): no lit background while reordering. The native card is the same
   <li> the user hovers; once it has been moved by a drop, Chromium keeps the
   stale :hover (and keeps it after the drag ends) until the pointer moves or
   the page changes. The panel flag also covers cards React replaced. */
[data-pmod-ordering] [data-plugin-package]:hover,
[data-pmod-ordering] [data-plugin-item]:hover,
li[data-pmod-nohover]:hover {
  background: transparent !important;
}

/* ---- v0.2: card icon override ---- */
.pmod-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  pointer-events: none;
}
img.pmod-ico {
  object-fit: contain;
}
.pmod-ico svg {
  width: 26px;
  height: 26px;
}

/* ---- v0.5: AI row at the bottom of the rename dialog ---- */
.pmod-ai-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
}
.pmod-ai-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.pmod-ai-status {
  min-height: 16px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.pmod-ai-prompt {
  flex: none;
}
.pmod-ai-right {
  flex-wrap: wrap;
  justify-content: flex-end;
  row-gap: 4px;
}
.pmod-ai-model {
  flex: none;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pmod-modelmenu {
  min-width: 230px;
  max-width: min(360px, calc(100vw - 32px));
  max-height: min(60vh, 420px);
  overflow: auto;
  z-index: 10001;
}
.pmod-model-item {
  justify-content: flex-start;
}
.pmod-model-effort {
  margin-inline-start: auto;
  padding-inline-start: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-menu-note {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-menu-tip {
  max-width: 300px;
  white-space: normal;
  line-height: 1.5;
  margin-top: 2px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.pmod-prompt-dialog {
  width: min(720px, calc(100vw - 48px));
}
.pmod-prompt {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.55;
  resize: vertical;
}

/* ---- v0.2: icon library dialog ---- */
.pmod-icon-dialog {
  width: min(640px, calc(100vw - 48px));
}
.pmod-icon-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pmod-icon-head-actions {
  display: inline-flex;
  gap: 8px;
}
.pmod-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
  max-height: min(52vh, 420px);
  overflow-y: auto;
}
.pmod-icon-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 56px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}
.pmod-icon-tile:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.pmod-icon-tile:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
.pmod-icon-tile-on,
.pmod-icon-tile-pick {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary);
}
.pmod-icon-tile-pick {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
.pmod-icon-glyph {
  display: inline-flex;
}
.pmod-icon-glyph svg {
  width: 26px;
  height: 26px;
}
.pmod-icon-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.pmod-icon-empty {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-icon-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.pmod-icon-foot {
  align-items: center;
}
.pmod-file {
  display: none;
}

/* ---- v0.2: uninstall confirmation ---- */
.pmod-confirm {
  width: min(420px, calc(100vw - 48px));
}
.pmod-confirm-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.pmod-btn-danger {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}

/* ---- v0.3: batch mode / menu focus / selected cards ---- */
.pmod-menu:focus {
  outline: none;
}
.pmod-menu-head {
  padding: 6px 8px 2px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
[data-pmod-selected="1"] {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: -2px;
  border-radius: var(--dsw-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}
[data-pmod-selected="1"]:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
.pmod-batch-status {
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}

/* External surfaces (contract v1): the bar is a normal block above the list,
   and the list is whatever container the host declared. */
[data-plugin-surface] [data-pmod-bar] {
  margin-block-end: 10px;
}
[data-plugin-surface] .pmod-empty {
  padding: 20px 4px;
}
`

    // lifecycle
    const disposers = []

    function installStyles() {
      try {
        const tagId = NS + '/client.css'
        if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')) return
        const tag = document.createElement('style')
        tag.dataset.plugin = NS
        tag.dataset.pluginCss = tagId
        tag.textContent = CSS
        document.head.appendChild(tag)
      } catch (error) {
        console.warn('[plugin-manager-plus] styles unavailable:', error)
      }
    }

    function subscribeLocale() {
      try {
        const off = ctxRef.locale.subscribe(() => {
          const next = ctxRef.locale.getSnapshot().active === 'en' ? 'en' : 'zh'
          if (next !== LANG) {
            LANG = next
            // Native titles switch language too: drop the captures so the next
            // paint recaptures them in the active language (R8).
            for (const card of document.querySelectorAll(CARD_SELECTOR)) {
              delete card.dataset.pmodCaptured
            }
            notify()
          }
        })
        if (typeof off === 'function') disposers.push(off)
      } catch {
        /* ignored */
      }
    }

    function subscribeRemote() {
      try {
        if (ctxRef.remote && typeof ctxRef.remote.$on === 'function') {
          const off = ctxRef.remote.$on(SERVICE, () => {
            if (!disposed) void loadState()
          })
          if (typeof off === 'function') disposers.push(off)
          // The native change event is on the api-remotes forwarding whitelist,
          // so it reaches us even though the custom event above does not.
          const offNative = ctxRef.remote.$on('plugin-manager/changed', () => {
            if (!disposed) void loadState()
          })
          if (typeof offNative === 'function') disposers.push(offNative)
        }
      } catch (error) {
        console.warn('[plugin-manager-plus] state event unavailable:', error)
      }
      // The custom change event is NOT forwarded to clients (fixed whitelist in
      // api-remotes); poll the host state every 2.5s, on focus and on visibility.
      try {
        const timer = window.setInterval(() => {
          if (!disposed) void loadState()
        }, REMOTE_POLL_MS)
        disposers.push(() => window.clearInterval(timer))
        const onFocus = () => {
          if (!disposed) void loadState()
        }
        if (typeof window.addEventListener === 'function') {
          window.addEventListener('focus', onFocus)
          disposers.push(() => window.removeEventListener('focus', onFocus))
        }
        if (document && typeof document.addEventListener === 'function') {
          const onVisibility = () => {
            if (!document.hidden) onFocus()
          }
          document.addEventListener('visibilitychange', onVisibility)
          disposers.push(() => document.removeEventListener('visibilitychange', onVisibility))
        }
      } catch (error) {
        console.warn('[plugin-manager-plus] state polling unavailable:', error)
      }
    }

    return {
      inject: ['locale', 'remote', 'remote.pluginManager'],
      apply(ctx) {
        ctxRef = ctx
        try {
          LANG = ctx.locale.getSnapshot().active === 'en' ? 'en' : 'zh'
        } catch {
          LANG = 'zh'
        }
        installStyles()
        subscribeLocale()
        subscribeRemote()
        startWatch()
        guardInstall()
        void loadState()
        schedule()
        ctx.effect(() => () => teardown(), 'plugin-manager-plus: teardown')
      },
    }
  },
})

