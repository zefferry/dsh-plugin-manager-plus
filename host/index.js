/**
 * Plugin Manager Plus — host half.
 *
 * Persists the global (cross-instance) plugin-manager state in
 * `DSH_HOME/plugin-manager-plus/state.json` and exposes it over HTTP with a
 * `rev`-based optimistic lock:
 *
 *   GET  /plugins/plugin-manager-plus/state   -> { ok, value: { state, rev } }
 *   PUT  /plugins/plugin-manager-plus/state   <- { state, rev }
 *   GET  /plugins/plugin-manager-plus/health  -> tiny diagnostic payload
 *   GET  /plugins/plugin-manager-plus/icons   -> { ok, value: { icons } }
 *   POST /plugins/plugin-manager-plus/icons   <- { name, dataUrl } | { name, zip }
 *   GET  /plugins/plugin-manager-plus/icons/<id>     -> image bytes
 *   DELETE /plugins/plugin-manager-plus/icons/<id>   -> { ok, value: { id, icons } }
 *   POST /plugins/plugin-manager-plus/ai/rename      <- { name, description, prompt?, existingNames?, pick? }
 *   GET  /plugins/plugin-manager-plus/ai/status      -> { ok, value: { configured, model } }
 *   GET  /plugins/plugin-manager-plus/ai/models      -> { ok, value: { providers, default } }
 *
 * Every successful write bumps `rev` and emits `plugin-manager-plus/changed`
 * so other windows reload the state.
 *
 * This is a normal Cordis bundle: nothing in DSH itself is modified.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

export const name = 'dsh-plugin-manager-plus'
export const inject = ['webServer', 'connection']

const ROUTE = '/plugins/plugin-manager-plus'
// v3 adds the user-editable AI prompt and the list of hidden builtin icons.
// v4 adds `aiPick`: the `provider/model` the AI button should use ('' = follow
// the DSH default model).
const STATE_VERSION = 4
const BODY_LIMIT = 256 * 1024
// Icon uploads carry a base64 zip of up to 8 MB, so that one route raises the
// body limit; every other route keeps the small default.
const ICON_BODY_LIMIT = 12 * 1024 * 1024
const TAG_LABEL_MAX = 12
const TAG_LIMIT = 200
const OVERRIDE_NAME_MAX = 40
const OVERRIDE_DESC_MAX = 120
const KEY_MAX = 512
const ASSIGNMENT_LIMIT = 4000
const OVERRIDE_LIMIT = 4000
const TMP_STALE_MS = 5 * 60 * 1000
const LOCK_STALE_MS = 5000
const LOCK_ATTEMPTS = 6
const LOCK_WAIT_MS = 10
const CHANGE_EVENT = 'plugin-manager-plus/changed'
// v2 additions: manual order, "recently seen" timestamps, uploaded icon library.
const ORDERS_LIMIT = 500
const SEEN_LIMIT = 500
const ICON_LIMIT = 100
const ICON_NAME_MAX = 80
const ICON_MAX_BYTES = 512 * 1024
const ICON_ZIP_MAX_BYTES = 8 * 1024 * 1024
const ICON_ZIP_MAX_IMAGES = 40
const ICON_ID_PATTERN = /^i_[A-Za-z0-9_]{1,48}$/
const ICON_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon'])
// A partition key is the current view: everything, a system tag or a user tag.
const PARTITION_PATTERN = /^(?:all|sys:[A-Za-z0-9_-]{1,64}|tag:t_[A-Za-z0-9_]{1,48})$/
// AI proxy defaults (see POST /ai/rename).
const AI_TIMEOUT_MS = 30000
const AI_ATTEMPTS = 3
const AI_TEMPERATURE = 0.4
// Output budget for one round. Reasoning models spend part of `maxTokens` on
// hidden reasoning before the visible reply, so a tiny budget (the old 300)
// ends a "max-tokens" stream with zero text and looks like an empty answer.
const AI_MAX_TOKENS = 4096
// Hard ceiling used both for `config.ai.maxTokens` and for the single automatic
// escalation retry after a truncated round.
const AI_MAX_TOKENS_CEIL = 8192
const AI_NAME_MAX = 40
const AI_DESC_MAX = 120
// Editable prompt (state.aiPrompt / body.prompt) and plugin names fed to the
// model so it can avoid duplicates.
const AI_PROMPT_MAX = 8000
const EXISTING_NAMES_LIMIT = 500
const EXISTING_NAME_MAX = 200
// v4 `aiPick`: "provider/model" of the model the AI button should call.
const AI_PICK_MAX = 120
// P2-2 (v0.7.1): model ids may contain `/`; only the first segment is the provider.
const AI_PICK_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+$/
// Model dropdown: cap the payload, probe only the first models for reasoning
// metadata, and refresh the cached list once a minute.
const AI_MODELS_PER_PROVIDER = 40
const AI_MODELS_EFFORT_PROBE = 40
const AI_MODELS_CONCURRENCY = 4
const AI_MODELS_CACHE_MS = 60 * 1000
// API-key provider that the host can also call directly, bypassing the DSH
// agent harness (which would attach tools and the desktop's own selection).
const DIRECT_AI_PROVIDER = 'deepseek-official'
const DIRECT_AI_KEY = 'DEEPSEEK_API_KEY'
const DIRECT_AI_BASE = 'https://api.deepseek.com/v1'
// Placeholder template; state.aiPrompt or config.ai.prompt overrides it.
const DEFAULT_AI_PROMPT = [
  '# 角色',
  '你是 DSH 插件管理器的文案助手，负责为插件生成更清晰易读的中文显示名称与一句话简介。',
  '',
  '# 原名称/简介',
  '- 原名称：{name}',
  '- 原简介：{description}',
  '- 其他插件已用名称：{existingNames}',
  '',
  '# 要求',
  '## 名称重命名要求',
  '1. 只保留插件功能要点，去掉版本号、作者前缀、`dsh-`/`@scope/` 等机器痕迹；',
  '2. 2–14 个汉字（英文可 2–24 字符），必须是名词短语，不要冒号、书名号；',
  '3. 不能与其他插件已用名称相同或近似。',
  '',
  '## 简介重写要求',
  '1. 一句话，30–70 个汉字，说明「做什么 + 主要价值」；',
  '2. 不要感叹号、不要营销词（最好/最强/第一）、不要句末句号；',
  '3. 保留必要的产品专有名词，不要杜撰不存在的功能。',
  '',
  '# 输出格式',
  '只输出一个 JSON 对象，不要解释、不要代码块：',
  '{"name":"<名称>","description":"<简介>"}',
  '',
  '# 自审',
  '输出前逐条自查：name 为 2–14 个汉字且非空、未与其他插件重名；description 为 30–70 个汉字且非空；两者都不与原值完全相同；JSON 可被解析。任一条不满足就重写后再输出。',
].join('\n')

// Reserved label names: the system tags are derived from the native cards, so a
// user tag may never claim one of these names (case/width insensitive).
const SYSTEM_TAG_KEYS = new Set([
  'builtin',
  'experimental',
  'installed',
  '内置',
  '实验性',
  '已安装',
  // v0.8: derived enable-state tags; reserved for the same reason.
  'enabled',
  'disabled',
  '启用中',
  '未启用',
])
const TAG_ID_PATTERN = /^t_[A-Za-z0-9_]{1,48}$/
// Icon ids rendered by the client itself. They have no bytes on disk (the SVG
// lives in client.js), so they are only valid as `overrides[key].icon` values —
// they never appear in `state.icons` and GET/DELETE /icons/<id> still 404.
// Must stay in sync with BUILTIN_ICONS in plugin-manager-plus/client.js.
const BUILTIN_ICON_IDS = new Set([
  'cube',
  'sparkles',
  'bolt',
  'bubble',
  'gear',
  'shield',
  'heart',
  'star',
  'terminal',
  'database',
  'globe',
  'code',
  'palette',
  'rocket',
  'book',
  'clock',
  'cloud',
  'grid',
])
// `state.hiddenIcons` holds builtin ids the user removed from the icicle; the
// cap equals the builtin set size so a stale list can never grow unbounded.
const HIDDEN_ICONS_LIMIT = BUILTIN_ICON_IDS.size

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.trim() ? path.resolve(fromEnv) : path.join(os.homedir(), '.dsh')
}

function paths() {
  const dir = path.join(dshHome(), 'plugin-manager-plus')
  return {
    dir,
    file: path.join(dir, 'state.json'),
    // Uploaded icon bytes live next to the state file; the record keeps the
    // mime type so the extension is never needed (and never trusted).
    iconsDir: path.join(dir, 'icons'),
  }
}

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function httpError(message, statusCode = 400, extra = {}) {
  return Object.assign(new Error(message), { statusCode }, extra)
}

function errorText(error) {
  return error && error.message ? error.message : String(error)
}

function chars(text) {
  return Array.from(text)
}

function clampChars(text, max) {
  const list = chars(text)
  return list.length > max ? list.slice(0, max).join('') : text
}

// Collapse control characters/whitespace and trim: the same normalisation the
// client applies before saving a label, display name or description.
function normText(value) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tagKey(label) {
  return label.normalize('NFKC').toLowerCase()
}

function isPackageKey(key) {
  if (typeof key !== 'string' || !key || key.length > KEY_MAX) return false
  if (key.startsWith('pkg:')) return key.length > 4
  if (key.startsWith('item:')) return key.length > 5
  return false
}

function generateTagId(taken) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `t_${Date.now()}_${crypto.randomBytes(3).toString('hex').slice(0, 4)}`
    if (!taken || !taken.has(id)) return id
  }
  return `t_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

// ---------------------------------------------------------------------------
// storage: atomic write, corrupt recovery, read/write with rev
// ---------------------------------------------------------------------------

function emptyState() {
  return {
    version: STATE_VERSION,
    updatedAt: null,
    tags: [],
    assignments: {},
    overrides: {},
    orders: {},
    seen: {},
    icons: [],
    // v3: empty prompt means "use DEFAULT_AI_PROMPT"; hiddenIcons lists the
    // builtin ids the user deleted (they live in client.js, not on disk).
    aiPrompt: '',
    hiddenIcons: [],
    // v4: '' means "follow the DSH default model"; otherwise "provider/model".
    aiPick: '',
  }
}

function stripRev(doc) {
  return {
    version: doc.version,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    tags: doc.tags,
    assignments: doc.assignments,
    overrides: doc.overrides,
    orders: doc.orders,
    seen: doc.seen,
    icons: doc.icons,
    aiPrompt: doc.aiPrompt,
    hiddenIcons: doc.hiddenIcons,
    aiPick: doc.aiPick,
  }
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`
  let fd = -1
  try {
    fd = fs.openSync(tmp, 'w')
    fs.writeFileSync(fd, text, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    if (fd >= 0) {
      try {
        fs.closeSync(fd)
      } catch {
        /* ignored */
      }
    }
  }
  try {
    fs.renameSync(tmp, file)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignored */
    }
    throw error
  }
  // Best effort: persist the rename itself on POSIX filesystems.
  try {
    const dirFd = fs.openSync(path.dirname(file), 'r')
    try {
      fs.fsyncSync(dirFd)
    } finally {
      fs.closeSync(dirFd)
    }
  } catch {
    /* not supported on Windows, ignored */
  }
}

// A crashed writer can leave `state.json.tmp-*` (or `icons/.tmp-*`) behind.
// Only older files are removed: a concurrent writer's in-flight temp file must
// survive.
function removeStaleTmp(dir, prefix, now) {
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue
    const target = path.join(dir, entry)
    try {
      if (now - fs.statSync(target).mtimeMs < TMP_STALE_MS) continue
      fs.unlinkSync(target)
    } catch {
      /* ignored */
    }
  }
}

function cleanupStaleTmp() {
  const { dir, file, iconsDir } = paths()
  const now = Date.now()
  removeStaleTmp(dir, `${path.basename(file)}.tmp-`, now)
  removeStaleTmp(iconsDir, '.tmp-', now)
}

let lastCorruptSignature = ''

// Corruption recovery must reach the user, not just the host log: the next
// state read carries `recovered:true` and `backupPath` next to `value` (see the
// GET /state handler), and that read consumes the notice. It is process-local,
// so a restarted host reports its own recovery once.
let pendingRecovery = null

function takeRecoveryNotice() {
  const notice = pendingRecovery
  pendingRecovery = null
  return notice
}

function recoverCorrupt(reason) {
  const { file } = paths()
  let signature = reason
  try {
    const stat = fs.statSync(file)
    signature = `${file}:${reason}:${stat.size}:${Math.trunc(stat.mtimeMs)}`
  } catch {
    /* ignored */
  }
  if (signature === lastCorruptSignature) return { rev: 0, state: emptyState() }
  lastCorruptSignature = signature
  console.warn(`[plugin-manager-plus] state 文件损坏（${reason}），已备份并按空状态启动`)
  const backupPath = `${file}.bak-${Date.now()}`
  let backedUp = false
  try {
    fs.renameSync(file, backupPath)
    backedUp = true
  } catch {
    try {
      fs.copyFileSync(file, backupPath)
      fs.unlinkSync(file)
      backedUp = true
    } catch (error) {
      console.warn(`[plugin-manager-plus] 备份损坏的 state 失败：${errorText(error)}`)
    }
  }
  pendingRecovery = { backupPath: backedUp ? backupPath : null, reason }
  return { rev: 0, state: emptyState() }
}

// Structural corruption (wrong types / unknown version) means the file cannot
// be trusted: back it up and start empty. Semantic junk (orphan tag ids,
// duplicate labels left by an older build) is cleaned instead of failing.
// Older files are migrated in memory and written back in the current layout on
// the next save, so upgrading never drops the user's tags:
//   v1 -> no orders/seen/icons
//   v2 -> no aiPrompt/hiddenIcons
//   v3 -> no aiPick
function structuralProblem(doc) {
  if (!isPlainObject(doc)) return 'not a JSON object'
  const legacy = doc.version === 1
  if (!legacy && doc.version !== 2 && doc.version !== 3 && doc.version !== STATE_VERSION) {
    return `unsupported version ${JSON.stringify(doc.version)}`
  }
  if (!Array.isArray(doc.tags)) return 'tags is not an array'
  for (const item of doc.tags) {
    if (!isPlainObject(item)) return 'a tag is not an object'
    if (typeof item.id !== 'string' || !item.id) return 'a tag id is invalid'
    if (typeof item.label !== 'string') return 'a tag label is invalid'
    if (!Number.isFinite(item.createdAt)) return 'a tag createdAt is invalid'
  }
  if (!isPlainObject(doc.assignments)) return 'assignments is not an object'
  for (const [key, list] of Object.entries(doc.assignments)) {
    if (!Array.isArray(list)) return `assignments[${key}] is not an array`
    if (list.some((id) => typeof id !== 'string')) return `assignments[${key}] has a non-string tag id`
  }
  if (!isPlainObject(doc.overrides)) return 'overrides is not an object'
  for (const [key, entry] of Object.entries(doc.overrides)) {
    if (!isPlainObject(entry)) return `overrides[${key}] is not an object`
    for (const field of ['name', 'description', 'icon']) {
      const value = entry[field]
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return `overrides[${key}].${field} is not a string`
      }
    }
  }
  if (!legacy) {
    if (!isPlainObject(doc.orders)) return 'orders is not an object'
    for (const [key, list] of Object.entries(doc.orders)) {
      if (!Array.isArray(list)) return `orders[${key}] is not an array`
      if (list.some((value) => typeof value !== 'string')) return `orders[${key}] has a non-string key`
    }
    if (!isPlainObject(doc.seen)) return 'seen is not an object'
    if (!Array.isArray(doc.icons)) return 'icons is not an array'
    for (const item of doc.icons) {
      if (!isPlainObject(item)) return 'an icon record is not an object'
      if (typeof item.id !== 'string' || !item.id) return 'an icon id is invalid'
      if (typeof item.mime !== 'string' || !item.mime) return 'an icon mime is invalid'
      if (!Number.isFinite(item.size) || item.size < 0) return 'an icon size is invalid'
    }
  }
  return ''
}

// Loaded-state cleaning is lenient on purpose: junk from an older build (or an
// icon deleted outside DSH) must never make the store unreadable.
function cleanOrders(rawOrders) {
  const orders = {}
  if (!isPlainObject(rawOrders)) return orders
  for (const [key, list] of Object.entries(rawOrders)) {
    if (!PARTITION_PATTERN.test(key) || !Array.isArray(list)) continue
    const kept = []
    for (const value of list) {
      if (typeof value !== 'string' || !isPackageKey(value) || kept.includes(value)) continue
      kept.push(value)
      if (kept.length >= ORDERS_LIMIT) break
    }
    if (kept.length) orders[key] = kept
  }
  return orders
}

function cleanSeen(rawSeen) {
  const seen = {}
  if (!isPlainObject(rawSeen)) return seen
  for (const [key, value] of Object.entries(rawSeen)) {
    if (Object.keys(seen).length >= SEEN_LIMIT) break
    if (!isPackageKey(key) || typeof value !== 'string' || !value) continue
    seen[key] = value
  }
  return seen
}

function cleanIcons(rawIcons) {
  const icons = []
  const ids = new Set()
  if (!Array.isArray(rawIcons)) return icons
  for (const item of rawIcons) {
    if (icons.length >= ICON_LIMIT) break
    if (!isPlainObject(item)) continue
    if (typeof item.id !== 'string' || !ICON_ID_PATTERN.test(item.id) || ids.has(item.id)) continue
    if (typeof item.mime !== 'string' || !ICON_MIMES.has(item.mime)) continue
    if (!Number.isFinite(item.size) || item.size <= 0 || item.size > ICON_MAX_BYTES) continue
    ids.add(item.id)
    icons.push({
      id: item.id,
      name: (typeof item.name === 'string' && clampChars(normText(item.name), ICON_NAME_MAX)) || item.id,
      mime: item.mime,
      size: Math.trunc(item.size),
      createdAt: Number.isFinite(item.createdAt) ? Math.trunc(item.createdAt) : Date.now(),
    })
  }
  return icons
}

function cleanAiPrompt(rawPrompt) {
  if (typeof rawPrompt !== 'string') return ''
  return clampChars(rawPrompt, AI_PROMPT_MAX)
}

// Unknown ids are dropped silently: a builtin icon set change must never make
// an existing state file unreadable.
function cleanHiddenIcons(rawHidden) {
  const hidden = []
  if (!Array.isArray(rawHidden)) return hidden
  for (const id of rawHidden) {
    if (hidden.length >= HIDDEN_ICONS_LIMIT) break
    if (typeof id !== 'string' || !BUILTIN_ICON_IDS.has(id) || hidden.includes(id)) continue
    hidden.push(id)
  }
  return hidden
}

function cleanAiPick(rawPick) {
  if (typeof rawPick !== 'string') return ''
  const text = rawPick.trim()
  if (!text || text.length > AI_PICK_MAX || !AI_PICK_PATTERN.test(text)) return ''
  return text
}

function cleanLoadedState(doc) {
  const tags = []
  const tagIds = new Set()
  const labels = new Set()
  for (const item of doc.tags) {
    if (tags.length >= TAG_LIMIT) break
    const label = clampChars(normText(item.label), TAG_LABEL_MAX)
    if (!label) continue
    const key = tagKey(label)
    if (labels.has(key) || SYSTEM_TAG_KEYS.has(key)) continue
    labels.add(key)
    const id = TAG_ID_PATTERN.test(item.id) && !tagIds.has(item.id) ? item.id : generateTagId(tagIds)
    tagIds.add(id)
    tags.push({ id, label, createdAt: Math.trunc(item.createdAt) })
  }
  const assignments = {}
  for (const [key, list] of Object.entries(doc.assignments)) {
    if (!isPackageKey(key)) continue
    const kept = []
    for (const id of list) {
      if (tagIds.has(id) && !kept.includes(id)) kept.push(id)
    }
    if (kept.length) assignments[key] = kept
  }
  const icons = cleanIcons(doc.icons)
  const iconIds = new Set(icons.map((icon) => icon.id))
  const overrides = {}
  for (const [key, entry] of Object.entries(doc.overrides)) {
    if (!isPackageKey(key)) continue
    const next = {}
    if (typeof entry.name === 'string') {
      const name = clampChars(normText(entry.name), OVERRIDE_NAME_MAX)
      if (name) next.name = name
    }
    if (typeof entry.description === 'string') {
      next.description = clampChars(normText(entry.description), OVERRIDE_DESC_MAX)
    }
    // Uploaded icons live in state.icons; builtin ids are client-owned but just
    // as valid as a reference, so keep both.
    if (typeof entry.icon === 'string' && (iconIds.has(entry.icon) || BUILTIN_ICON_IDS.has(entry.icon))) {
      next.icon = entry.icon
    }
    if ('name' in next || 'description' in next || 'icon' in next) overrides[key] = next
  }
  return {
    version: STATE_VERSION,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    tags,
    assignments,
    overrides,
    orders: cleanOrders(doc.orders),
    seen: cleanSeen(doc.seen),
    icons,
    aiPrompt: cleanAiPrompt(doc.aiPrompt),
    hiddenIcons: cleanHiddenIcons(doc.hiddenIcons),
    aiPick: cleanAiPick(doc.aiPick),
  }
}

// Reads the file on every access: the same DSH_HOME may be shared by several
// instances, so an in-memory cache would break cross-instance consistency.
function loadState() {
  cleanupStaleTmp()
  const { file } = paths()
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[plugin-manager-plus] 读取 state 失败：${errorText(error)}`)
    return { rev: 0, state: emptyState() }
  }
  let doc = null
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    return recoverCorrupt(`无法解析 JSON：${errorText(error)}`)
  }
  const problem = structuralProblem(doc)
  if (problem) return recoverCorrupt(problem)
  const rev = Number.isInteger(doc.rev) && doc.rev >= 0 ? doc.rev : 0
  return { rev, state: cleanLoadedState(doc) }
}

function writeSnapshot(state, rev) {
  // `updatedAt` is host-owned: this ISO 8601 timestamp is the authoritative
  // value. validateStatePayload drops whatever a client sends for the field
  // (a number from `Date.now()` is accepted and ignored), and a store that has
  // never been written reads back `null`.
  const doc = {
    version: STATE_VERSION,
    rev,
    updatedAt: new Date().toISOString(),
    tags: state.tags,
    assignments: state.assignments,
    overrides: state.overrides,
    orders: state.orders,
    seen: state.seen,
    icons: state.icons,
    aiPrompt: typeof state.aiPrompt === 'string' ? state.aiPrompt : '',
    hiddenIcons: Array.isArray(state.hiddenIcons) ? state.hiddenIcons : [],
    aiPick: typeof state.aiPick === 'string' ? state.aiPick : '',
  }
  writeFileAtomic(paths().file, `${JSON.stringify(doc, null, 2)}\n`)
  return { rev, state: stripRev(doc) }
}

// Best-effort cross-process lock: two DSH instances can share one DSH_HOME.
// Synchronous (Atomics.wait) because the critical section is a couple of small
// file operations; contention is rare. If the lock cannot be taken we still
// proceed: the rev CAS in the caller keeps the store consistent anyway.
function withStateLock(fn) {
  const lockFile = `${paths().file}.lock`
  let fd = -1
  try {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true })
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try {
        fd = fs.openSync(lockFile, 'wx')
        break
      } catch (error) {
        if (error.code !== 'EEXIST') break
        try {
          if (Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(lockFile)
            continue
          }
        } catch {
          /* ignored */
        }
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_WAIT_MS)
        } catch {
          /* ignored */
        }
      }
    }
  } catch {
    /* ignored */
  }
  try {
    return fn()
  } finally {
    if (fd >= 0) {
      try {
        fs.closeSync(fd)
      } catch {
        /* ignored */
      }
      try {
        fs.unlinkSync(lockFile)
      } catch {
        /* ignored */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// validation (server side must not trust the client)
// ---------------------------------------------------------------------------

function assertPackageKey(key, section) {
  if (typeof key !== 'string' || !key || key.length > KEY_MAX) {
    throw httpError(`${section}: key must be a non-empty string`)
  }
  if (!key.startsWith('pkg:') && !key.startsWith('item:')) {
    throw httpError(`${section}: key must start with "pkg:" or "item:"`)
  }
  if (key === 'pkg:' || key === 'item:') throw httpError(`${section}: key is empty`)
}

function validateTags(rawTags) {
  if (rawTags === undefined || rawTags === null) return []
  if (!Array.isArray(rawTags)) throw httpError('state.tags must be an array')
  if (rawTags.length > TAG_LIMIT) throw httpError(`too many tags (limit ${TAG_LIMIT})`)
  const tags = []
  const seenLabels = new Set()
  const seenIds = new Set()
  for (const item of rawTags) {
    if (!isPlainObject(item)) throw httpError('each tag must be an object')
    if (item.label === undefined || item.label === null) throw httpError('tag label is required')
    if (typeof item.label !== 'string') throw httpError('tag label must be a string')
    const label = normText(item.label)
    if (!label) throw httpError('tag label must not be empty')
    if (chars(label).length > TAG_LABEL_MAX) {
      throw httpError(`tag label must be at most ${TAG_LABEL_MAX} characters`)
    }
    const key = tagKey(label)
    if (SYSTEM_TAG_KEYS.has(key)) throw httpError(`"${label}" is a reserved system tag name`)
    if (seenLabels.has(key)) throw httpError(`duplicate tag label: ${label}`)
    seenLabels.add(key)
    let id = item.id
    if (typeof id !== 'string' || !TAG_ID_PATTERN.test(id) || seenIds.has(id)) id = generateTagId(seenIds)
    seenIds.add(id)
    const createdAt = Number.isFinite(item.createdAt) ? Math.trunc(item.createdAt) : Date.now()
    tags.push({ id, label, createdAt })
  }
  return tags
}

function validateAssignments(rawAssignments, tagIds) {
  if (rawAssignments === undefined || rawAssignments === null) return {}
  if (!isPlainObject(rawAssignments)) throw httpError('state.assignments must be an object')
  const keys = Object.keys(rawAssignments)
  if (keys.length > ASSIGNMENT_LIMIT) throw httpError(`too many assignments (limit ${ASSIGNMENT_LIMIT})`)
  const assignments = {}
  for (const key of keys) {
    assertPackageKey(key, 'assignments')
    const list = rawAssignments[key]
    if (!Array.isArray(list)) throw httpError(`assignments["${key}"] must be an array`)
    const kept = []
    for (const id of list) {
      if (typeof id !== 'string') throw httpError(`assignments["${key}"] must contain strings only`)
      // Unknown tag id (e.g. removed by another instance): drop, never fail.
      if (!tagIds.has(id) || kept.includes(id)) continue
      kept.push(id)
    }
    if (kept.length) assignments[key] = kept
  }
  return assignments
}

function validateOverrides(rawOverrides, iconIds) {
  if (rawOverrides === undefined || rawOverrides === null) return {}
  if (!isPlainObject(rawOverrides)) throw httpError('state.overrides must be an object')
  const keys = Object.keys(rawOverrides)
  if (keys.length > OVERRIDE_LIMIT) throw httpError(`too many overrides (limit ${OVERRIDE_LIMIT})`)
  const overrides = {}
  for (const key of keys) {
    assertPackageKey(key, 'overrides')
    const entry = rawOverrides[key]
    if (!isPlainObject(entry)) throw httpError(`overrides["${key}"] must be an object`)
    const next = {}
    const name = entry.name
    if (typeof name === 'string') {
      const text = normText(name)
      // "" removes the key entirely: the card falls back to the native name.
      if (text) {
        if (chars(text).length > OVERRIDE_NAME_MAX) {
          throw httpError(`display name must be at most ${OVERRIDE_NAME_MAX} characters`)
        }
        next.name = text
      }
    } else if (name !== undefined && name !== null) {
      throw httpError(`overrides["${key}"].name must be a string`)
    }
    const description = entry.description
    if (typeof description === 'string') {
      const text = normText(description)
      if (chars(text).length > OVERRIDE_DESC_MAX) {
        throw httpError(`description must be at most ${OVERRIDE_DESC_MAX} characters`)
      }
      // "" is meaningful: explicitly cleared description, keep the key.
      next.description = text
    } else if (description !== undefined && description !== null) {
      throw httpError(`overrides["${key}"].description must be a string`)
    }
    const icon = entry.icon
    if (typeof icon === 'string' && icon !== '') {
      // Unknown ids (deleted by another instance) are dropped instead of
      // failing the whole save. Builtin ids have no record on disk but are
      // rendered by the client, so they are valid references too.
      if (iconIds.has(icon) || BUILTIN_ICON_IDS.has(icon)) next.icon = icon
    } else if (icon !== undefined && icon !== null && icon !== '') {
      throw httpError(`overrides["${key}"].icon must be a string`)
    }
    if ('name' in next || 'description' in next || 'icon' in next) overrides[key] = next
  }
  return overrides
}

function validateOrders(rawOrders) {
  if (rawOrders === undefined || rawOrders === null) return {}
  if (!isPlainObject(rawOrders)) throw httpError('state.orders must be an object')
  const keys = Object.keys(rawOrders)
  if (keys.length > ORDERS_LIMIT) throw httpError(`too many order partitions (limit ${ORDERS_LIMIT})`)
  const orders = {}
  for (const key of keys) {
    if (!PARTITION_PATTERN.test(key)) throw httpError(`orders: invalid partition key "${key}"`)
    const list = rawOrders[key]
    if (!Array.isArray(list)) throw httpError(`orders["${key}"] must be an array`)
    if (list.length > ORDERS_LIMIT) throw httpError(`orders["${key}"] must have at most ${ORDERS_LIMIT} keys`)
    const kept = []
    for (const value of list) {
      if (typeof value !== 'string' || !isPackageKey(value)) {
        throw httpError(`orders["${key}"] must contain plugin keys only`)
      }
      if (kept.includes(value)) continue
      kept.push(value)
    }
    if (kept.length) orders[key] = kept
  }
  return orders
}

function validateSeen(rawSeen) {
  if (rawSeen === undefined || rawSeen === null) return {}
  if (!isPlainObject(rawSeen)) throw httpError('state.seen must be an object')
  const keys = Object.keys(rawSeen)
  if (keys.length > SEEN_LIMIT) throw httpError(`too many seen entries (limit ${SEEN_LIMIT})`)
  const seen = {}
  for (const key of keys) {
    if (!isPackageKey(key)) throw httpError(`seen: invalid plugin key "${key}"`)
    const value = rawSeen[key]
    // Contract: ISO strings only. Do not "be lenient" and accept Date.now()
    // numbers — the client must send new Date().toISOString() (a numeric value
    // here is a client bug that we surface as a 400 rather than silently
    // reinterpreting).
    if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
      throw httpError(`seen["${key}"] must be an ISO timestamp string (got ${value === null ? 'null' : typeof value})`)
    }
    seen[key] = value
  }
  return seen
}

function validateAiPrompt(rawPrompt) {
  if (rawPrompt === undefined || rawPrompt === null) return ''
  if (typeof rawPrompt !== 'string') throw httpError('aiPrompt must be a string')
  const trimmed = rawPrompt.trim()
  if (chars(trimmed).length > AI_PROMPT_MAX) throw httpError('aiPrompt too long')
  return trimmed
}

function validateHiddenIcons(rawHidden) {
  if (rawHidden === undefined || rawHidden === null) return []
  if (!Array.isArray(rawHidden)) throw httpError('hiddenIcons must be an array')
  const hidden = []
  for (const id of rawHidden) {
    if (hidden.length >= HIDDEN_ICONS_LIMIT) break
    if (typeof id !== 'string' || !BUILTIN_ICON_IDS.has(id) || hidden.includes(id)) continue
    hidden.push(id)
  }
  return hidden
}

function validateAiPick(rawPick) {
  if (rawPick === undefined || rawPick === null) return ''
  if (typeof rawPick !== 'string') throw httpError('aiPick must be a string')
  const trimmed = rawPick.trim()
  if (!trimmed) return ''
  if (trimmed.length > AI_PICK_MAX || !AI_PICK_PATTERN.test(trimmed)) {
    throw httpError('aiPick must look like "provider/model"')
  }
  return trimmed
}

function validateStatePayload(raw, iconIds) {
  if (!isPlainObject(raw)) throw httpError('state must be an object')
  // The contract says PUT only accepts the current state version — an omitted
  // or stale version is rejected rather than silently upgraded.
  if (raw.version !== STATE_VERSION) {
    throw httpError(`unsupported state version: ${JSON.stringify(raw.version)}`)
  }
  const tags = validateTags(raw.tags)
  const tagIds = new Set(tags.map((tag) => tag.id))
  // Client-supplied `updatedAt`, `rev` and `icons` are never copied: the host
  // stamps updatedAt at write time (see writeSnapshot), assigns rev itself, and
  // owns the icon records (the PUT handler fills them from disk).
  return {
    version: STATE_VERSION,
    updatedAt: null,
    tags,
    assignments: validateAssignments(raw.assignments, tagIds),
    overrides: validateOverrides(raw.overrides, iconIds),
    orders: validateOrders(raw.orders),
    seen: validateSeen(raw.seen),
    icons: [],
    aiPrompt: validateAiPrompt(raw.aiPrompt),
    hiddenIcons: validateHiddenIcons(raw.hiddenIcons),
    aiPick: validateAiPick(raw.aiPick),
  }
}

// ---------------------------------------------------------------------------
// icons: data URLs, zip archives, binary files
// ---------------------------------------------------------------------------

const ICON_EXTENSIONS = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
])
// Browser/OS emitted aliases: accepted on input, normalised to the stored mime.
// `image/jpg` is not a registered mime type; `image/vnd.microsoft.icon` is the
// IANA name for ICO while `image/x-icon` is what we store and serve.
const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/vnd.microsoft.icon', 'image/x-icon'],
])
const DECLARED_ICON_MIMES = new Set([...ICON_MIMES, ...MIME_ALIASES.keys()])

function generateIconId(taken) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `i_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
    if (!taken.has(id)) return id
  }
  return `i_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

function iconFilePath(id) {
  return path.join(paths().iconsDir, id)
}

// `/plugins/plugin-manager-plus/icons/<id>` -> `<id>`; '' for the collection
// path or a nested path.
function iconIdFromPath(pathname) {
  const prefix = `${ROUTE}/icons/`
  if (typeof pathname !== 'string' || !pathname.startsWith(prefix)) return ''
  const rest = pathname.slice(prefix.length)
  if (!rest || rest.includes('/')) return ''
  return rest
}

// The bytes decide the type, never the file name or the declared mime.
function mimeFromBytes(buffer) {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  // ICO: ICONDIR starts with reserved=0, type=1 (icon) -> 00 00 01 00.
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x00000100) return 'image/x-icon'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 4096)).trim()
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return ''
}

function decodeDataUrl(value) {
  const match = /^data:([A-Za-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(value).trim())
  if (!match) throw httpError('dataUrl must be a base64 data URL', 400, { code: 'bad-data-url' })
  const rawDeclared = match[1].toLowerCase()
  if (!DECLARED_ICON_MIMES.has(rawDeclared)) {
    throw httpError(`unsupported image type: ${rawDeclared}`, 400, { code: 'bad-mime' })
  }
  // Normalise aliases (image/jpg -> image/jpeg, image/vnd.microsoft.icon ->
  // image/x-icon) before the byte cross-check, so only canonical mimes are
  // stored and served.
  const declared = MIME_ALIASES.get(rawDeclared) || rawDeclared
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (!bytes.length) throw httpError('image data is empty', 400, { code: 'bad-image' })
  if (bytes.length > ICON_MAX_BYTES) {
    throw httpError(`image exceeds ${ICON_MAX_BYTES} bytes`, 400, { code: 'icon-too-large' })
  }
  const detected = mimeFromBytes(bytes)
  if (!detected) throw httpError('unrecognised image data', 400, { code: 'bad-image' })
  if (detected !== declared) {
    throw httpError(`image content does not match declared type (${declared} vs ${detected})`, 400, { code: 'bad-mime' })
  }
  return { mime: detected, bytes }
}

function findEndOfCentralDirectory(buffer) {
  const lowest = Math.max(0, buffer.length - (0xffff + 22))
  for (let at = buffer.length - 22; at >= lowest; at -= 1) {
    if (buffer.readUInt32LE(at) === 0x06054b50) return at
  }
  return -1
}

// One entry of the zip's central directory -> one image, or null when the entry
// is not a usable image (directory, __MACOSX, dot file, unsupported extension,
// oversized, unknown bytes): a zip upload keeps every good image.
function zipEntryImage(buffer, name, method, compSize, uncompSize, localOffset) {
  if (!name || name.endsWith('/')) return null
  const segments = name.split('/')
  if (name.startsWith('__MACOSX/') || segments.some((part) => !part || part.startsWith('.'))) return null
  const slash = name.lastIndexOf('/')
  const base = name.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  if (!ICON_EXTENSIONS.has(base.slice(dot + 1).toLowerCase())) return null
  // Check the advertised size before inflating: a zip bomb must not be
  // decompressed just to discover that it is too large.
  if (uncompSize <= 0 || uncompSize > ICON_MAX_BYTES) return null
  if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) return null
  const localNameLen = buffer.readUInt16LE(localOffset + 26)
  const localExtraLen = buffer.readUInt16LE(localOffset + 28)
  const start = localOffset + 30 + localNameLen + localExtraLen
  const end = start + compSize
  if (end > buffer.length) return null
  const raw = buffer.subarray(start, end)
  let data = null
  try {
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: ICON_MAX_BYTES })
  } catch {
    return null
  }
  if (!data || !data.length || data.length > ICON_MAX_BYTES) return null
  const mime = mimeFromBytes(data)
  if (!mime) return null
  return { name: base.slice(0, dot), mime, bytes: data }
}

function zipImages(buffer) {
  if (buffer.length < 22) throw httpError('zip data is truncated', 400, { code: 'bad-zip' })
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw httpError('not a valid zip archive', 400, { code: 'bad-zip' })
  const total = buffer.readUInt16LE(eocd + 10)
  const offset = buffer.readUInt32LE(eocd + 16)
  if (total === 0) throw httpError('zip contains no images', 400, { code: 'no-images' })
  const images = []
  let at = offset
  for (let index = 0; index < total; index += 1) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) {
      throw httpError('zip central directory is corrupt', 400, { code: 'bad-zip' })
    }
    const method = buffer.readUInt16LE(at + 10)
    const compSize = buffer.readUInt32LE(at + 20)
    const uncompSize = buffer.readUInt32LE(at + 24)
    const nameLen = buffer.readUInt16LE(at + 28)
    const extraLen = buffer.readUInt16LE(at + 30)
    const commentLen = buffer.readUInt16LE(at + 32)
    const localOffset = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen
    const image = zipEntryImage(buffer, name, method, compSize, uncompSize, localOffset)
    if (image) images.push(image)
    if (images.length > ICON_ZIP_MAX_IMAGES) break
  }
  if (!images.length) throw httpError('zip contains no images', 400, { code: 'no-images' })
  if (images.length > ICON_ZIP_MAX_IMAGES) {
    throw httpError(`zip contains more than ${ICON_ZIP_MAX_IMAGES} images`, 400, { code: 'too-many-images' })
  }
  return images
}

// Store one image: the bytes go to `<iconsDir>/<id>` (atomic write, no
// extension) before the record reaches the state file.
function addIcon(icons, name, mime, bytes, now) {
  const taken = new Set(icons.map((icon) => icon.id))
  const id = generateIconId(taken)
  writeFileAtomic(iconFilePath(id), bytes)
  const record = {
    id,
    name: clampChars(normText(name), ICON_NAME_MAX) || id,
    mime,
    size: bytes.length,
    createdAt: now,
  }
  icons.push(record)
  return record
}

function removeIconFile(id) {
  try {
    fs.unlinkSync(iconFilePath(id))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

// ---------------------------------------------------------------------------
// AI proxy (OpenAI-compatible /chat/completions)
// ---------------------------------------------------------------------------

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function resolveAiConfig(config) {
  const raw = isPlainObject(config) ? config : {}
  const ai = isPlainObject(raw.ai) ? raw.ai : {}
  const env = process.env
  const pick = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)
  const baseURL = pick(ai.baseURL, pick(env.PMP_AI_BASE_URL, ''))
  const apiKey = pick(ai.apiKey, pick(env.PMP_AI_API_KEY, ''))
  const model = pick(ai.model, pick(env.PMP_AI_MODEL, ''))
  return {
    baseURL,
    apiKey,
    model,
    prompt: typeof ai.prompt === 'string' && ai.prompt.trim() ? ai.prompt : DEFAULT_AI_PROMPT,
    maxAttempts: clampInt(ai.maxAttempts, 1, 3, AI_ATTEMPTS),
    maxTokens: clampInt(ai.maxTokens, 64, AI_MAX_TOKENS_CEIL, AI_MAX_TOKENS),
    timeoutMs: clampInt(ai.timeoutMs, 100, 120000, AI_TIMEOUT_MS),
    configured: Boolean(baseURL && model),
    // Optional override for the direct (non-DSH) OpenAI-compatible endpoint;
    // used by tests and by deployments that front api.deepseek.com.
    directBaseURL: pick(raw.aiDirectBaseURL, ''),
    // Filled in by apply(): appends one JSON line per failed generation so a
    // silent "AI 生成失败" can be diagnosed without the user copying a toast.
    logFailure: null,
  }
}

function chatEndpoint(baseURL) {
  const trimmed = String(baseURL).replace(/\/+$/, '')
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
}

function fillPrompt(template, name, description, existingNames = []) {
  const names = existingNames.length ? existingNames.join('、') : '（无）'
  return String(template)
    .split('{name}').join(name)
    .split('{description}').join(description)
    .split('{existingNames}').join(names)
}

// Comparison key for duplicate detection: NFKC + trim + lowercase, so full-width
// and case variants collide like the client's own name comparison does.
function nameKey(text) {
  return String(text).normalize('NFKC').trim().toLowerCase()
}

// Other plugins' display names supplied by the client (this plugin excluded).
// Over-long lists are rejected, not truncated: the client controls the payload.
function validateExistingNames(rawNames) {
  if (rawNames === undefined || rawNames === null) return []
  if (!Array.isArray(rawNames)) throw httpError('existingNames must be an array', 400, { code: 'bad-request' })
  if (rawNames.length > EXISTING_NAMES_LIMIT) {
    throw httpError(`existingNames must contain at most ${EXISTING_NAMES_LIMIT} entries`, 400, { code: 'bad-request' })
  }
  const names = []
  for (const entry of rawNames) {
    if (typeof entry !== 'string') {
      throw httpError('existingNames entries must be strings', 400, { code: 'bad-request' })
    }
    const name = normText(entry)
    if (!name) continue
    if (chars(name).length > EXISTING_NAME_MAX) {
      throw httpError(`existingNames entries must be at most ${EXISTING_NAME_MAX} characters`, 400, { code: 'bad-request' })
    }
    names.push(name)
  }
  return names
}

// Pulls the first JSON object out of a model reply; code fences and prose are
// tolerated because small local models routinely add them.
function extractJsonObject(content) {
  const text = String(content).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function checkAiResult(parsed, original, existingNames = []) {
  const problems = []
  const name = isPlainObject(parsed) && typeof parsed.name === 'string' ? normText(parsed.name) : ''
  const description = isPlainObject(parsed) && typeof parsed.description === 'string' ? normText(parsed.description) : ''
  if (!name) problems.push('name 不能为空')
  else if (chars(name).length > AI_NAME_MAX) problems.push(`name 最多 ${AI_NAME_MAX} 个字符`)
  if (!description) problems.push('description 不能为空')
  else if (chars(description).length > AI_DESC_MAX) problems.push(`description 最多 ${AI_DESC_MAX} 个字符`)
  if (name && existingNames.length) {
    const key = nameKey(name)
    const clash = existingNames.find((entry) => nameKey(entry) === key)
    if (clash !== undefined) problems.push(`名称「${name}」与已有插件「${clash}」重复，请换一个不同的名称`)
  }
  if (!problems.length && name === original.name && description === original.description) {
    problems.push('name 与 description 不能同时与原值相同')
  }
  return { name, description, problems }
}

async function callAiChat(ai, messages) {
  if (typeof globalThis.fetch !== 'function') {
    throw httpError('the current node runtime has no fetch', 502, { code: 'ai-failed' })
  }
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ai.timeoutMs)
  try {
    const headers = { 'content-type': 'application/json' }
    if (ai.apiKey) headers.authorization = `Bearer ${ai.apiKey}`
    const response = await globalThis.fetch(chatEndpoint(ai.baseURL), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: ai.model,
        messages,
        temperature: AI_TEMPERATURE,
        max_tokens: ai.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!response || !response.ok) {
      const status = response && response.status ? ` ${response.status}` : ''
      throw httpError(`AI upstream returned${status}`, 502, { code: 'ai-failed' })
    }
    const data = await response.json()
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : undefined
    if (typeof content !== 'string' || !content.trim()) {
      throw httpError('AI response has no choices[0].message.content', 502, { code: 'ai-failed' })
    }
    return content
  } catch (error) {
    if (timedOut || (error && error.name === 'AbortError')) {
      throw httpError('AI request timed out', 504, { code: 'ai-timeout' })
    }
    if (error && error.statusCode) throw error
    throw httpError(`AI request failed: ${errorText(error)}`, 502, { code: 'ai-failed' })
  } finally {
    clearTimeout(timer)
  }
}

// --- DSH-managed model (the user's default model) ---------------------------
// The host can borrow the model the desktop app already owns instead of asking
// the user for an OpenAI-compatible endpoint. `llm` is the low-level streaming
// service; `agentDefaultModel` is the same selection the chat UI shows.

function llmService(ctx) {
  try {
    const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null
    return llm && typeof llm.prepareCall === 'function' ? llm : null
  } catch {
    return null
  }
}

// --- Model catalogue (for the picker next to the AI button) -----------------
// `llm` can list providers/models, but reasoning metadata is only available
// through `resolveModel`, which may hit the network. Probe a bounded prefix and
// cache the whole answer briefly so opening the dropdown stays cheap.

function modelsService(ctx) {
  try {
    const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null
    if (!llm || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') return null
    return llm
  } catch {
    return null
  }
}

function providerIdOf(row) {
  if (typeof row === 'string') return row.trim()
  if (!isPlainObject(row)) return ''
  const value = row.id ?? row.provider
  return typeof value === 'string' ? value.trim() : ''
}

function reasoningEfforts(meta) {
  if (!isPlainObject(meta)) return []
  // Real DSH models expose `meta.reasoning = { efforts: [{ id, name }] }`;
  // the order is the adapter's own order (lowest first).
  const reasoning = meta.reasoning
  if (isPlainObject(reasoning) && Array.isArray(reasoning.efforts)) {
    const efforts = []
    for (const entry of reasoning.efforts) {
      const id = typeof entry === 'string' ? entry : isPlainObject(entry) ? entry.id : ''
      const value = typeof id === 'string' ? id.trim() : ''
      if (value && !efforts.includes(value)) efforts.push(value)
    }
    return efforts
  }
  // Older/simpler shapes may advertise a plain string list.
  if (!Array.isArray(meta.reasoningEfforts)) return []
  const efforts = []
  for (const entry of meta.reasoningEfforts) {
    const value = typeof entry === 'string' ? entry.trim() : ''
    if (value && !efforts.includes(value)) efforts.push(value)
  }
  return efforts
}

// The real `dsh-llm` service exposes `resolveModelInfo(provider, model, signal)`;
// `resolveModel` only exists on individual adapters (and in older/stub shapes),
// so prefer the service method and keep the adapter name as a fallback.
async function modelMeta(llm, provider, model) {
  if (!llm) return null
  try {
    if (typeof llm.resolveModelInfo === 'function') {
      const meta = await llm.resolveModelInfo(provider, model)
      return isPlainObject(meta) ? meta : null
    }
    if (typeof llm.resolveModel === 'function') {
      const meta = await llm.resolveModel(provider, model)
      return isPlainObject(meta) ? meta : null
    }
    return null
  } catch {
    return null
  }
}

// Runs `worker` over `items` with at most `limit` promises in flight.
async function mapLimit(items, limit, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

function selectionSnapshot(ctx) {
  try {
    const def = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : null
    if (!def || typeof def.currentSelection !== 'function') return null
    const selection = def.currentSelection()
    if (!isPlainObject(selection)) return null
    const provider = typeof selection.provider === 'string' ? selection.provider.trim() : ''
    const model = typeof selection.model === 'string' ? selection.model.trim() : ''
    if (!provider || !model) return null
    return { provider, model, reasoningEffort: selection.reasoningEffort }
  } catch {
    return null
  }
}

const aiModelsCache = new WeakMap()

async function listAiModels(ctx) {
  const cached = aiModelsCache.get(ctx)
  if (cached && Date.now() - cached.at < AI_MODELS_CACHE_MS) return cached.value
  const llm = modelsService(ctx)
  const providers = []
  if (llm) {
    let rows = []
    try {
      rows = llm.listProviders() || []
    } catch {
      rows = []
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = providerIdOf(row)
      if (!id || providers.some((entry) => entry.id === id)) continue
      let models = []
      try {
        models = await llm.listModels(id)
      } catch {
        models = []
      }
      const list = []
      for (const item of Array.isArray(models) ? models : []) {
        const modelId = typeof item === 'string' ? item.trim() : isPlainObject(item) && typeof item.id === 'string' ? item.id.trim() : ''
        if (!modelId || list.some((entry) => entry.id === modelId)) continue
        const name = isPlainObject(item) && typeof item.name === 'string' && item.name.trim() ? item.name.trim() : modelId
        list.push({ id: modelId, name })
        if (list.length >= AI_MODELS_PER_PROVIDER) break
      }
      providers.push({ id, models: list })
    }
    // Probing every model would stall the dropdown on big providers: only the
    // first 20 (across providers) get reasoning metadata, four at a time.
    const probes = []
    for (const provider of providers) {
      for (const model of provider.models) {
        if (probes.length >= AI_MODELS_EFFORT_PROBE) break
        probes.push({ provider, model })
      }
      if (probes.length >= AI_MODELS_EFFORT_PROBE) break
    }
    await mapLimit(probes, AI_MODELS_CONCURRENCY, async ({ provider, model }) => {
      const efforts = reasoningEfforts(await modelMeta(llm, provider.id, model.id))
      if (efforts.length) model.reasoningEfforts = efforts
    })
  }
  const selection = selectionSnapshot(ctx)
  let fallback = selection
  if (!fallback) {
    const first = providers.find((provider) => provider.models.length)
    if (first) fallback = { provider: first.id, model: first.models[0].id }
  }
  const value = {
    providers,
    default: fallback ? { provider: fallback.provider, model: fallback.model } : null,
  }
  aiModelsCache.set(ctx, { at: Date.now(), value })
  return value
}

// --- Explicit model choice --------------------------------------------------
// `state.aiPick` persists "provider/model"; a per-request `pick` wins over it.
// The provider must be registered, the model is not required to be listed (the
// catalogue may be stale or truncated).

function parseAiPick(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > AI_PICK_MAX || !AI_PICK_PATTERN.test(text)) return null
  const slash = text.indexOf('/')
  return { provider: text.slice(0, slash), model: text.slice(slash + 1) }
}

function validatePick(rawPick, ctx) {
  if (rawPick === undefined || rawPick === null) return null
  if (!isPlainObject(rawPick)) throw httpError('pick must be an object')
  const provider = typeof rawPick.provider === 'string' ? rawPick.provider.trim() : ''
  const model = typeof rawPick.model === 'string' ? rawPick.model.trim() : ''
  if (!provider || !model) throw httpError('pick.provider and pick.model must be non-empty strings')
  const known = new Set()
  const llm = modelsService(ctx)
  if (llm) {
    try {
      for (const row of llm.listProviders() || []) {
        const id = providerIdOf(row)
        if (id) known.add(id)
      }
    } catch {
      // A listing failure must not invalidate every pick; the call itself will
      // surface a real provider problem.
    }
  }
  if (known.size && !known.has(provider)) throw httpError(`pick.provider is not registered: ${provider}`)
  return { provider, model }
}

async function firstModelOf(llm, provider) {
  try {
    const models = await llm.listModels(provider)
    const first = Array.isArray(models)
      ? models.find((row) => (typeof row === 'string' ? row.trim() : isPlainObject(row) && typeof row.id === 'string' && row.id.trim()))
      : null
    if (typeof first === 'string') return first.trim()
    return first ? first.id.trim() : ''
  } catch {
    return ''
  }
}

async function resolveDshTarget(ctx, statePick, explicitPick) {
  const llm = llmService(ctx)
  if (!llm) return null
  let providers = []
  try {
    providers = llm.listProviders() || []
  } catch {
    providers = []
  }
  const known = new Set(providers.map(providerIdOf).filter(Boolean))
  const selection = selectionSnapshot(ctx)
  const wanted = explicitPick || parseAiPick(statePick)
  let provider = ''
  let model = ''
  let reasoningEffort
  let picked = false
  if (wanted && known.has(wanted.provider)) {
    provider = wanted.provider
    model = wanted.model
    picked = true
  } else {
    if (wanted) {
      console.warn(`[plugin-manager-plus] AI pick "${wanted.provider}" is not registered; using the default model`)
    }
    provider = selection ? selection.provider : ''
    model = selection ? selection.model : ''
    reasoningEffort = selection ? selection.reasoningEffort : undefined
  }
  if (!provider || (known.size && !known.has(provider))) {
    const fallback = known.size ? [...known][0] : ''
    // Never swap providers silently: an unavailable provider is usually an
    // environment problem, and the fallback route may need different credentials.
    if (provider && fallback && fallback !== provider) {
      console.warn(`[plugin-manager-plus] AI provider "${provider}" is not registered; falling back to "${fallback}"`)
    }
    provider = fallback
  }
  if (!provider) return null
  if (picked) {
    // An explicitly chosen model runs a one-shot job, not a conversation: use
    // the lowest advertised reasoning level so "just rename it" stays cheap.
    if (!model) model = await firstModelOf(llm, provider)
    if (!model) return null
    const efforts = reasoningEfforts(await modelMeta(llm, provider, model))
    reasoningEffort = efforts.length ? efforts[0] : undefined
  } else if (!model) {
    model = await firstModelOf(llm, provider)
    if (!model) return null
  }
  return {
    llm,
    provider,
    model,
    reasoningEffort,
    providers: [...known],
    selection: selection ? { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort } : null,
  }
}

function dshLabel(target) {
  return `${target.provider}/${target.model}`
}

// --- Direct provider call (bypasses the DSH agent harness) ------------------
// deepseek-official is the API-key provider: its key can be resolved from the
// host credential store, so the rename request can be a plain OpenAI-style
// completion with no tools and no desktop-side model selection.

function directAiBase(ai) {
  const configured = typeof ai.directBaseURL === 'string' ? ai.directBaseURL.trim() : ''
  return configured || DIRECT_AI_BASE
}

async function readDirectApiKey(ctx) {
  try {
    const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : null
    if (!credentials || typeof credentials.resolve !== 'function') return ''
    const resolved = await credentials.resolve(DIRECT_AI_KEY)
    const value = typeof resolved === 'string'
      ? resolved
      : isPlainObject(resolved)
        ? resolved.value ?? resolved.secret ?? resolved.apiKey
        : ''
    return typeof value === 'string' ? value.trim() : ''
  } catch (error) {
    // No credential store, no key, or an unexpected shape: the caller falls
    // back to the DSH-managed model instead of failing the request.
    console.warn(`[plugin-manager-plus] could not resolve ${DIRECT_AI_KEY}: ${errorText(error)}`)
    return ''
  }
}

function upstreamError(status) {
  const error = httpError(`direct AI upstream returned ${status || 'an error'}`, 502, { code: 'ai-failed' })
  error.upstreamStatus = status || 0
  return error
}

async function callDirectChat(ai, key, target, system, rounds) {
  if (typeof globalThis.fetch !== 'function') throw httpError('this runtime has no fetch', 502, { code: 'ai-failed' })
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ai.timeoutMs)
  try {
    const messages = [{ role: 'system', content: system }]
    for (const round of rounds) messages.push({ role: round.role, content: round.text })
    const response = await globalThis.fetch(chatEndpoint(directAiBase(ai)), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: target.model,
        messages,
        temperature: AI_TEMPERATURE,
        max_tokens: ai.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!response || !response.ok) throw upstreamError(response ? response.status : 0)
    let payload
    try {
      payload = await response.json()
    } catch {
      throw upstreamError(response.status)
    }
    const content = isPlainObject(payload) && Array.isArray(payload.choices) ? payload.choices[0]?.message?.content : null
    if (typeof content !== 'string' || !content.trim()) throw upstreamError(response.status)
    return content
  } catch (error) {
    if (error && error.upstreamStatus) throw error
    if (timedOut || (error && error.name === 'AbortError')) {
      const timeout = httpError('direct AI request timed out', 504, { code: 'ai-timeout' })
      timeout.upstreamStatus = 'timeout'
      throw timeout
    }
    if (error && error.statusCode) throw error
    const wrapped = httpError(`direct AI request failed: ${errorText(error)}`, 502, { code: 'ai-failed' })
    wrapped.upstreamStatus = 'network'
    throw wrapped
  } finally {
    clearTimeout(timer)
  }
}

// One streaming attempt at one output budget. Kept separate from
// `callDshChat` so a truncated round can be retried with a bigger budget.
async function streamDshReply(target, system, rounds, signal, maxTokens) {
  const prepare = async (withEffort) => {
    const callConfig = { provider: target.provider, model: target.model, maxTokens }
    if (withEffort && target.reasoningEffort !== undefined) callConfig.reasoningEffort = target.reasoningEffort
    return target.llm.prepareCall(callConfig, signal)
  }
  let prepared
  try {
    prepared = await prepare(true)
  } catch (error) {
    // A model that does not advertise the selected reasoning level must not
    // make the whole feature fail: retry the same call without the control.
    // Only match the explicit "unsupported reasoning effort" class — a generic
    // /reasoning/i match could swallow unrelated provider errors.
    const text = errorText(error)
    const code = error && typeof error.code === 'string' ? error.code : ''
    const unsupported = code === 'UNSUPPORTED_REASONING_EFFORT' || /reasoning effort/i.test(text)
    if (!unsupported) throw error
    prepared = await prepare(false)
  }
  if (!prepared || typeof prepared.stream !== 'function') {
    throw httpError('AI model is unavailable', 502, { code: 'ai-failed' })
  }
  const options = {
    ...prepared.config,
    system,
    messages: rounds.map((round) => ({
      role: round.role,
      content: [{ type: 'text', text: round.text }],
    })),
    signal,
  }
  let text = ''
  let finishKind = ''
  let failure = null
  for await (const chunk of prepared.stream(options)) {
    if (!chunk) continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    else if (chunk.type === 'finish') {
      // The adapter boundary reports provider/auth/quota problems as a terminal
      // finish chunk instead of throwing, so the reason must be surfaced.
      const reason = chunk.reason
      if (reason && typeof reason.kind === 'string') finishKind = reason.kind
      if (reason && reason.kind === 'error') failure = reason.failure || { message: 'AI request failed' }
      break
    }
  }
  if (failure) {
    const message = typeof failure.message === 'string' && failure.message ? failure.message : 'AI request failed'
    const code = typeof failure.code === 'string' && failure.code ? ` [${failure.code}]` : ''
    throw httpError(`${message}${code}`, 502, { code: 'ai-failed' })
  }
  // An aborted stream is a timeout even when some text arrived first: a partial
  // reply must never be treated as a complete answer.
  if (finishKind === 'aborted') throw httpError('AI request timed out', 504, { code: 'ai-timeout' })
  if (finishKind === 'max-tokens') {
    const truncated = httpError(
      `AI 输出被截断：模型在 ${maxTokens} 个输出 token 内没有完成回复（推理占满了预算）。` +
        '请在插件配置里调大 ai.maxTokens（上限 8192）。',
      502,
      { code: 'ai-failed' },
    )
    truncated.aiTruncated = true
    throw truncated
  }
  if (!text.trim()) throw httpError(`AI response was empty${finishKind ? ` (finish: ${finishKind})` : ''}`, 502, { code: 'ai-failed' })
  return text
}

// Convert our neutral round list into a DSH model request and collect text.
// A truncated round is retried once with the ceiling budget: with
// `reasoningEffort: max` the hidden reasoning length varies per reply, so a
// single 4096 sample is not proof that every round fits.
async function callDshChat(target, system, rounds, timeoutMs, maxTokens) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const budgets = [maxTokens]
  if (maxTokens < AI_MAX_TOKENS_CEIL) budgets.push(AI_MAX_TOKENS_CEIL)
  try {
    let lastError = null
    for (const budget of budgets) {
      try {
        return await streamDshReply(target, system, rounds, controller.signal, budget)
      } catch (error) {
        lastError = error
        if (!(error && error.aiTruncated)) throw error
      }
    }
    throw lastError
  } catch (error) {
    if (timedOut || (error && error.name === 'AbortError')) {
      throw httpError('AI request timed out', 504, { code: 'ai-timeout' })
    }
    if (error && error.statusCode) throw error
    throw httpError(`AI request failed: ${errorText(error)}`, 502, { code: 'ai-failed' })
  } finally {
    clearTimeout(timer)
  }
}

// Generate, validate, retry: the model sees the validation errors (and the
// duplicate-name clash) and gets up to `maxAttempts` chances. Every round is
// appended to the same conversation, so the model can correct itself.
// `chat(system, rounds)` delivers a reply for the current conversation.
async function aiRename(ai, original, { prompt, existingNames, modelLabel }, chat) {
  const system = fillPrompt(prompt, original.name, original.description, existingNames)
  const rounds = [{ role: 'user', text: '请生成新的名称和简介，只返回 JSON 对象。' }]
  let problems = []
  for (let attempt = 1; attempt <= ai.maxAttempts; attempt += 1) {
    const content = await chat(system, rounds)
    const result = checkAiResult(extractJsonObject(content), original, existingNames)
    if (!result.problems.length) {
      return { name: result.name, description: result.description, attempts: attempt, model: modelLabel || ai.model }
    }
    problems = result.problems
    rounds.push({ role: 'assistant', text: content })
    rounds.push({
      role: 'user',
      text: `上面的输出不满足要求：${problems.join('；')}。请严格按输出格式重新只返回一个 JSON 对象 {"name":"…","description":"…"}。`,
    })
  }
  const invalid = httpError(`AI 生成结果不合法（${problems.join('；')}）`, 502, { code: 'ai-failed' })
  invalid.aiDebug = {
    attempts: ai.maxAttempts,
    replies: rounds.filter((round) => round.role === 'assistant').map((round) => String(round.text).slice(0, 1200)),
  }
  throw invalid
}

// One JSON line per failed generation, appended next to state.json. It exists so
// a generic "AI 生成失败" toast can be diagnosed from the host machine later;
// the file is capped and rotated once.
function appendAiLog(dir, payload) {
  try {
    const file = path.join(dir, 'ai-error.log')
    let line = ''
    try {
      line = JSON.stringify({ ts: new Date().toISOString(), ...payload })
    } catch {
      line = JSON.stringify({ ts: new Date().toISOString(), note: 'unserializable payload' })
    }
    try {
      const stat = fs.statSync(file)
      if (stat.size > 256 * 1024) fs.renameSync(file, `${file}.1`)
    } catch {
      /* no log yet */
    }
    // 0o600: the line may quote a model reply and the original name/description,
    // so keep it user-private on POSIX (Windows ACLs are inherited from the dir).
    const fd = fs.openSync(file, 'a', 0o600)
    try {
      fs.writeSync(fd, `${line}\n`)
    } finally {
      fs.closeSync(fd)
    }
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      /* best effort */
    }
  } catch (error) {
    console.warn(`[plugin-manager-plus] 无法写入 AI 日志：${errorText(error)}`)
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(httpError('request body too large', 413))
        if (typeof req.destroy === 'function') req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')))
      } catch {
        reject(httpError('request body is not valid JSON', 400))
      }
    })
    req.on('error', (error) => reject(error))
  })
}

function registerRoutes(ctx, emitChange, ai) {
  const webServer = (typeof ctx.get === 'function' ? ctx.get('webServer') : null) || ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') {
    console.warn('[plugin-manager-plus] webServer 不可用，HTTP 接口未注册')
    return () => {}
  }
  // Fail closed: these routes mutate the shared plugin state, so an
  // unauthenticated caller must never be able to reach them.
  const fence = (req) => {
    try {
      const connection = typeof ctx.get === 'function' ? ctx.get('connection') : ctx.connection
      if (connection && typeof connection.requestRejection === 'function') {
        return connection.requestRejection(req) === undefined
      }
    } catch {
      /* ignored */
    }
    return false
  }
  // DSH's webServer table is keyed by (kind, path) only — duplicate paths throw
  // — so one route owns every method of a path and dispatches internally.
  // It also means the handler never sees a method it did not opt into: anything
  // else is a 405 here. `kind: 'prefix'` is used for the dynamic icon path
  // (`/icons/<id>`): exact paths are matched first, so the collection route and
  // the per-icon route can share the `/icons` prefix without colliding.
  const route = (pathName, handlers, options = {}) => {
    const kind = options.kind === 'prefix' ? 'prefix' : 'exact'
    const bodyLimit = Number.isInteger(options.bodyLimit) ? options.bodyLimit : BODY_LIMIT
    return {
      kind,
      path: `${ROUTE}${pathName}`,
      handler: async (req, res) => {
        const method = typeof req.method === 'string' ? req.method.toUpperCase() : ''
        const handler = handlers[method]
        if (typeof handler !== 'function') {
          return sendJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
        }
        if (!fence(req)) return sendJson(res, 403, { ok: false, error: { message: 'forbidden' } })
        try {
          const url = new URL(req.url, 'http://localhost')
          const query = url.searchParams
          let body
          if (method === 'GET' || method === 'HEAD') {
            body = Object.fromEntries(query)
          } else {
            const contentType = String((req.headers && req.headers['content-type']) || '')
            if (!/^application\/json\b/i.test(contentType)) {
              throw httpError('content-type must be application/json', 415)
            }
            body = await readBody(req, bodyLimit)
          }
          const result = await handler({ body, query, url, req, res, ctx, ai })
          // A binary handler (GET /icons/<id>) writes the response itself.
          if (res.headersSent || res.writableEnded) return undefined
          // A handler returns the `value` payload; to put fields next to `value`
          // in the envelope (the one-shot recovery notice) or to override the
          // success status (201 for uploads) it returns `{ value, meta?, status? }`.
          const enveloped = isPlainObject(result) && ('meta' in result || 'status' in result)
          const value = enveloped ? result.value : result
          const envelope = { ok: true, value }
          if (enveloped && isPlainObject(result.meta)) Object.assign(envelope, result.meta)
          const status = enveloped && Number.isInteger(result.status) ? result.status : 200
          return sendJson(res, status, envelope)
        } catch (error) {
          if (res.headersSent || res.writableEnded) {
            try {
              res.destroy()
            } catch {
              /* ignored */
            }
            return undefined
          }
          const status = Number.isInteger(error && error.statusCode) ? error.statusCode : 400
          const payload = { ok: false, error: { message: errorText(error) } }
          if (error && error.code) payload.error.code = error.code
          if (error && error.value !== undefined) payload.value = error.value
          return sendJson(res, status, payload)
        }
      },
    }
  }
  const routes = [
    route('/state', {
      GET: () => {
        const snapshot = loadState()
        // loadState() may itself recover a corrupt file, so read the notice
        // after it runs: the first read reports the recovery exactly once.
        const notice = takeRecoveryNotice()
        const value = { state: snapshot.state, rev: snapshot.rev }
        return notice ? { value, meta: { recovered: true, backupPath: notice.backupPath } } : value
      },
      PUT: ({ body }) => {
        if (!isPlainObject(body)) throw httpError('request body must be an object')
        if (!Number.isInteger(body.rev) || body.rev < 0) {
          throw httpError('rev must be a non-negative integer')
        }
        const saved = withStateLock(() => {
          const snapshot = loadState()
          if (body.rev !== snapshot.rev) {
            throw httpError('state rev mismatch', 409, {
              code: 'conflict',
              value: { state: snapshot.state, rev: snapshot.rev },
            })
          }
          const nextState = validateStatePayload(body.state, new Set(snapshot.state.icons.map((icon) => icon.id)))
          // Host authority: whatever the client sent for `state.icons` is
          // ignored, the records on disk win.
          nextState.icons = snapshot.state.icons
          return writeSnapshot(nextState, snapshot.rev + 1)
        })
        emitChange(saved.rev)
        return saved
      },
    }),
    route('/health', {
      GET: () => {
        const snapshot = loadState()
        const { state } = snapshot
        const value = {
          ok: true,
          rev: snapshot.rev,
          tagCount: state.tags.length,
          assignmentCount: Object.keys(state.assignments).length,
          overrideCount: Object.keys(state.overrides).length,
          iconCount: state.icons.length,
          aiConfigured: Boolean(ai.configured),
          path: paths().file,
        }
        // Peek only: /health never consumes the notice, the next state read
        // still has to report the recovery to the user.
        if (!pendingRecovery) return value
        return { value, meta: { recovered: true, backupPath: pendingRecovery.backupPath } }
      },
    }),
    route('/icons', {
      // Convenience listing; the client normally reads state.icons.
      GET: () => {
        const snapshot = loadState()
        return { icons: snapshot.state.icons }
      },
      POST: ({ body }) => {
        if (!isPlainObject(body)) throw httpError('request body must be an object')
        let images
        if (typeof body.zip === 'string') {
          if (!body.zip.trim()) throw httpError('zip contains no images', 400, { code: 'no-images' })
          const maxText = Math.ceil((ICON_ZIP_MAX_BYTES * 4) / 3) + 8
          if (body.zip.length > maxText) throw httpError('zip exceeds 8MB', 400, { code: 'zip-too-large' })
          const buffer = Buffer.from(body.zip.replace(/\s+/g, ''), 'base64')
          if (!buffer.length) throw httpError('zip contains no images', 400, { code: 'no-images' })
          if (buffer.length > ICON_ZIP_MAX_BYTES) {
            throw httpError('zip exceeds 8MB', 400, { code: 'zip-too-large' })
          }
          images = zipImages(buffer)
        } else if (typeof body.dataUrl === 'string') {
          const decoded = decodeDataUrl(body.dataUrl)
          images = [{
            name: typeof body.name === 'string' && normText(body.name) ? normText(body.name) : 'icon',
            mime: decoded.mime,
            bytes: decoded.bytes,
          }]
        } else {
          throw httpError('body must contain dataUrl or zip', 400, { code: 'bad-request' })
        }
        const saved = withStateLock(() => {
          const snapshot = loadState()
          const icons = snapshot.state.icons.slice()
          if (icons.length >= ICON_LIMIT) {
            throw httpError(`icon library is full (limit ${ICON_LIMIT})`, 409, { code: 'icon-limit' })
          }
          if (icons.length + images.length > ICON_LIMIT) {
            throw httpError(`icon library would exceed ${ICON_LIMIT} icons`, 409, { code: 'icon-limit' })
          }
          const now = Date.now()
          const added = images.map((image) => addIcon(icons, image.name, image.mime, image.bytes, now))
          try {
            const written = writeSnapshot({ ...snapshot.state, icons }, snapshot.rev + 1)
            return { added, rev: written.rev }
          } catch (error) {
            // The state write failed: do not leave orphan bytes behind.
            for (const record of added) {
              try {
                removeIconFile(record.id)
              } catch {
                /* ignored */
              }
            }
            throw error
          }
        })
        emitChange(saved.rev)
        return { value: { icons: saved.added }, status: 201 }
      },
    }, { bodyLimit: ICON_BODY_LIMIT }),
    // Dynamic per-icon path: `kind: 'prefix'` matches `/icons/<id>`. DSH matches
    // exact routes first, so the collection route above keeps `/icons` while this
    // one only ever sees `/icons/<id>` — and both tables are keyed by
    // (kind, path), so registering the same path in both is legal.
    route('/icons', {
      GET: ({ url, res }) => {
        const id = iconIdFromPath(url.pathname)
        if (!id) throw httpError('icon not found', 404, { code: 'not-found' })
        const snapshot = loadState()
        const record = snapshot.state.icons.find((icon) => icon.id === id)
        if (!record) throw httpError('icon not found', 404, { code: 'not-found' })
        let bytes
        try {
          bytes = fs.readFileSync(iconFilePath(id))
        } catch {
          throw httpError('icon not found', 404, { code: 'not-found' })
        }
        res.statusCode = 200
        res.setHeader('content-type', record.mime)
        res.setHeader('content-length', String(bytes.length))
        res.setHeader('cache-control', 'public, max-age=31536000, immutable')
        res.end(bytes)
        return undefined
      },
      DELETE: ({ url }) => {
        const id = iconIdFromPath(url.pathname)
        if (!id) throw httpError('icon not found', 404, { code: 'not-found' })
        const saved = withStateLock(() => {
          const snapshot = loadState()
          const index = snapshot.state.icons.findIndex((icon) => icon.id === id)
          if (index < 0) throw httpError('icon not found', 404, { code: 'not-found' })
          const icons = snapshot.state.icons.slice()
          icons.splice(index, 1)
          // Drop every override that pointed at the icon; an entry left empty is
          // removed so the card falls back to its native icon.
          const overrides = {}
          for (const [key, entry] of Object.entries(snapshot.state.overrides)) {
            const next = { ...entry }
            if (next.icon === id) delete next.icon
            if (Object.keys(next).length) overrides[key] = next
          }
          removeIconFile(id)
          const written = writeSnapshot({ ...snapshot.state, icons, overrides }, snapshot.rev + 1)
          return { icons: written.state.icons, rev: written.rev }
        })
        emitChange(saved.rev)
        return { id, icons: saved.icons }
      },
    }, { kind: 'prefix' }),
    route('/ai/rename', {
      POST: async ({ body, ctx: routeCtx }) => {
        if (!isPlainObject(body)) throw httpError('request body must be an object')
        const original = {
          name: typeof body.name === 'string' ? normText(body.name) : '',
          description: typeof body.description === 'string' ? normText(body.description) : '',
        }
        if (!original.name && !original.description) {
          throw httpError('name or description is required', 400, { code: 'bad-request' })
        }
        // `prompt` overrides config.ai.prompt (which already falls back to the
        // built-in template); an empty value means "use the configured one".
        const prompt = body.prompt === undefined || body.prompt === null ? '' : body.prompt
        if (typeof prompt !== 'string') throw httpError('prompt must be a string', 400, { code: 'bad-request' })
        if (chars(prompt.trim()).length > AI_PROMPT_MAX) throw httpError('prompt too long', 400, { code: 'bad-request' })
        const existingNames = validateExistingNames(body.existingNames)
        const template = prompt.trim() || ai.prompt
        // `pick` is per-request; state.aiPick is the persisted default. A
        // configured endpoint is authoritative (P1-1, v0.7.1): ignore any pick,
        // and never 400 the request because of a stale one.
        const explicitPick = ai.configured ? null : validatePick(body.pick, routeCtx)
        let target = null
        const mode = ai.configured ? 'config' : 'dsh'
        try {
          if (ai.configured) {
            const result = await aiRename(ai, original, { prompt: template, existingNames }, (system, rounds) => {
              const messages = [{ role: 'system', content: system }]
              for (const round of rounds) messages.push({ role: round.role, content: round.text })
              return callAiChat(ai, messages)
            })
            return { ...result, mode: 'config' }
          }
          // state.aiPick is read per request (never cached) so two windows that
          // change it see each other's choice immediately.
          const statePick = loadState().state.aiPick
          target = await resolveDshTarget(routeCtx, statePick, explicitPick)
          if (!target) throw httpError('AI is not configured', 501, { code: 'not-configured' })
          if (target.provider === DIRECT_AI_PROVIDER) {
            const key = await readDirectApiKey(routeCtx)
            if (key) {
              try {
                const result = await aiRename(ai, original, { prompt: template, existingNames, modelLabel: dshLabel(target) }, (system, rounds) => (
                  callDirectChat(ai, key, target, system, rounds)
                ))
                return { ...result, mode: 'direct' }
              } catch (error) {
                // The direct call is an optimisation only: auth, network,
                // timeout and output-shape failures all fall back to the
                // DSH-managed model the desktop already pays for.
                const reason = (error && (error.upstreamStatus || error.statusCode)) || 'error'
                console.warn(`[plugin-manager-plus] direct AI call failed (${reason}); falling back to the DSH model`)
              }
            }
          }
          const result = await aiRename(ai, original, { prompt: template, existingNames, modelLabel: dshLabel(target) }, (system, rounds) => (
            callDshChat(target, system, rounds, ai.timeoutMs, ai.maxTokens)
          ))
          return { ...result, mode: 'dsh' }
        } catch (error) {
          if (typeof ai.logFailure === 'function') {
            ai.logFailure({
              source: ai.configured ? 'config' : 'dsh',
              mode,
              provider: ai.configured ? '' : target ? target.provider : '',
              model: ai.configured ? ai.model : target ? dshLabel(target) : '',
              reasoningEffort: target && target.reasoningEffort !== undefined ? target.reasoningEffort : null,
              maxTokens: ai.maxTokens,
              maxAttempts: ai.maxAttempts,
              providers: target ? target.providers : null,
              selection: target ? target.selection : null,
              status: error && error.statusCode ? error.statusCode : 500,
              code: error && error.code ? error.code : '',
              message: errorText(error),
              debug: error && error.aiDebug ? error.aiDebug : null,
              original,
            })
          }
          throw error
        }
      },
    }),
    // Model catalogue for the picker next to the AI button. A missing `llm`
    // service is not an error: the client shows a disabled picker instead.
    route('/ai/models', {
      GET: async ({ ctx: routeCtx }) => listAiModels(routeCtx),
    }),
    route('/ai/status', {
      GET: async ({ ctx: routeCtx }) => {
        if (ai.configured) return { configured: true, source: 'config', model: ai.model }
        const target = await resolveDshTarget(routeCtx)
        if (target) {
          return {
            configured: true,
            source: 'dsh',
            provider: target.provider,
            model: dshLabel(target),
            providers: target.providers,
            selection: target.selection,
          }
        }
        return { configured: false, source: 'none', model: '' }
      },
    }),
  ]
  const disposers = routes.map((route) => {
    const dispose = webServer.register(route)
    return typeof dispose === 'function' ? dispose : () => {}
  })
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignored */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// plugin apply
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const cleanups = []
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    while (cleanups.length) {
      try {
        cleanups.pop()()
      } catch {
        /* ignored */
      }
    }
  }
  const effect = (factory, label) => {
    const guarded = () => {
      let inner = null
      try {
        inner = factory()
      } catch (error) {
        console.warn(`[plugin-manager-plus] ${label} 初始化失败：${errorText(error)}`)
      }
      return () => {
        if (typeof inner !== 'function') return
        try {
          inner()
        } catch (error) {
          console.warn(`[plugin-manager-plus] ${label} 清理失败：${errorText(error)}`)
        }
      }
    }
    if (typeof ctx.effect === 'function') {
      try {
        const registered = ctx.effect(guarded, `plugin-manager-plus: ${label}`)
        if (typeof registered === 'function') cleanups.push(registered)
        return
      } catch (error) {
        console.warn(`[plugin-manager-plus] ctx.effect 不可用：${errorText(error)}`)
      }
    }
    const local = guarded()
    cleanups.push(local)
  }
  try {
    fs.mkdirSync(paths().dir, { recursive: true })
  } catch (error) {
    console.warn(`[plugin-manager-plus] 无法创建状态目录：${errorText(error)}`)
  }
  const emitChange = (rev) => {
    try {
      ctx.emit(CHANGE_EVENT, { rev })
    } catch (error) {
      console.warn(`[plugin-manager-plus] changed 事件发送失败：${errorText(error)}`)
    }
  }
  const ai = resolveAiConfig(config)
  ai.logFailure = (payload) => appendAiLog(paths().dir, payload)
  effect(() => registerRoutes(ctx, emitChange, ai), 'HTTP routes')
  // No startup console.log: the host log is quiet by default (review P2-9).
  // PLUGIN_MANAGER_PLUS_DEBUG=1 prints one line when a state path is needed.
  if (process.env.PLUGIN_MANAGER_PLUS_DEBUG) {
    console.log(`[plugin-manager-plus] host ready (${paths().file})`)
  }
  return dispose
}
