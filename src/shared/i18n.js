/**
 * 共享：中英双语 UI 文案。
 *
 * 与 ext/highlight/markdown 一样遵守「可移植源码」约束：只能使用 JSDoc 标注
 * 类型（不得出现 TS 语法注记）、不得引入本目录之外的依赖。本模块被同时用于：
 * 1. tsdown 打包进 client 侧（浏览器 React bundle）；
 * 2. tsdown 构建期经 `?raw` 读入原始文本，内联进独立弹出页 /flyout-sidebar
 *    的经典 <script>（见 src/host/page.ts）。
 *
 * 语言选择：localStorage `dsh-flyout-sidebar:lang`（'zh' | 'en'，主面板的
 * 设置项写入、弹出页读取），未设置时按浏览器语言自动判定。`t(key)` 取当前
 * 语言文案，缺失时回退另一语言、再回退 key 本身。
 */

/** @type {Record<string, string>} */
const ZH = {
  // 通用状态
  loading: '加载中…',
  loadingTree: '加载文件树…',
  loadingChanges: '加载变更列表…',
  loadingPdf: '加载 PDF…',
  searching: '搜索中…',
  emptyDir: '（空目录）',
  noChanges: '没有未提交的变更',
  noChangesHead: '没有未提交的变更（相对于 HEAD）',
  noResults: '没有匹配的文件',
  readFailed: '读取失败',
  gitStatusFailed: 'git status 失败',
  imageLoadFailed: '图片加载失败',
  pdfLoadFailed: 'pdf.js 加载失败',
  searchFailed: '搜索失败',
  treeLoadFailed: '加载失败',
  truncated: '（已截断的预览）',
  // 复制 / 引用
  copied: '已复制',
  copiedPath: '已复制路径',
  copiedRef: '已复制 @引用（未能写入输入框）',
  insertedInput: '已插入输入框',
  refBtn: '@引用',
  refTitle: '引用到输入框（失败则复制 @path）',
  refFlyoutTitle: '复制 @path 引用',
  copyPath: '复制路径',
  refInput: '@引用到输入框',
  // 面板头部 / 控件
  collapsePanel: '收起侧边栏',
  panelAria: '文件面板',
  flyoutTitle: '弹出式侧边栏',
  flyoutOpen: '弹出式侧边栏 — 在新标签页打开（可拖到另一块显示器）',
  resizeHandle: '拖动调整宽度',
  resizePanel: '拖动调整面板宽度',
  refreshTree: '刷新文件树',
  refreshChanges: '刷新变更列表',
  refresh: '刷新',
  viewGit: '查看 Git 变更（未提交）',
  backToFiles: '返回文件列表',
  hidePreview: '隐藏预览（标签页保留）',
  closeTab: '关闭标签页',
  previewRegion: '文件预览',
  diffTabPrefix: '[diff] ',
  searchPlaceholder: '搜索文件…',
  hintClickGit: '点击右侧变更文件查看 diff',
  hintClickTree: '点击右侧文件查看内容',
  movePanelLeft: '将文件面板移到左侧',
  movePanelRight: '将文件面板移到右侧',
  // git 状态
  statusU: '未跟踪',
  statusA: '新增',
  statusM: '修改',
  statusD: '删除',
  statusR: '重命名',
  statusC: '复制',
  statusT: '类型变更',
  staged: '（已暂存）',
  unstaged: '（未暂存）',
  // diff / 预览控件
  diffDeleted: '- 删除',
  diffAdded: '+ 新增',
  zoomOut: '缩小',
  zoomIn: '放大',
  prevPage: '上一页',
  nextPage: '下一页',
  // 设置面板
  settingsIntro: '管理「Flyout Sidebar」的显示与行为。',
  setDefaultOpen: '默认展开',
  setDefaultOpenDesc: '页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。',
  setAutoRefresh: '自动刷新',
  setAutoRefreshDesc: '开启后侧边栏展开时将即时同步并更新产物列表',
  setFileTree: '文件树',
  setFileTreeDesc: '在侧边栏显示「文件树」标签页，浏览工作区目录。',
  setMinWidth: '最短面板宽度',
  setMinWidthDesc: '面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。',
  setCodeWrap: '代码换行',
  setCodeWrapDesc: '代码预览长行软换行；关闭则横向滚动。',
  wordWrap: '自动换行',
  setLang: '界面语言',
  setLangDesc: '侧边栏与独立弹出页的显示语言；独立弹出页需刷新后生效。',
  langAuto: '跟随浏览器',
  langZh: '中文',
  langEn: 'English',
}

/** @type {Record<string, string>} */
const EN = {
  loading: 'Loading…',
  loadingTree: 'Loading file tree…',
  loadingChanges: 'Loading change list…',
  loadingPdf: 'Loading PDF…',
  searching: 'Searching…',
  emptyDir: '(empty directory)',
  noChanges: 'No uncommitted changes',
  noChangesHead: 'No uncommitted changes (relative to HEAD)',
  noResults: 'No matching files',
  readFailed: 'Failed to read',
  gitStatusFailed: 'git status failed',
  imageLoadFailed: 'Failed to load image',
  pdfLoadFailed: 'Failed to load pdf.js',
  searchFailed: 'Search failed',
  treeLoadFailed: 'Failed to load',
  truncated: '(truncated preview)',
  copied: 'Copied',
  copiedPath: 'Path copied',
  copiedRef: 'Copied @reference (could not write to input box)',
  insertedInput: 'Inserted into input box',
  refBtn: '@ref',
  refTitle: 'Quote into input box (falls back to copying @path)',
  refFlyoutTitle: 'Copy @path reference',
  copyPath: 'Copy path',
  refInput: '@reference into input box',
  collapsePanel: 'Collapse sidebar',
  panelAria: 'File panel',
  flyoutTitle: 'Flyout sidebar',
  flyoutOpen: 'Flyout sidebar — open in a new tab (drag to another display)',
  resizeHandle: 'Drag to resize',
  resizePanel: 'Drag to resize panel',
  refreshTree: 'Refresh file tree',
  refreshChanges: 'Refresh change list',
  refresh: 'Refresh',
  viewGit: 'View Git changes (uncommitted)',
  backToFiles: 'Back to file list',
  hidePreview: 'Hide preview (tabs are kept)',
  closeTab: 'Close tab',
  previewRegion: 'File preview',
  diffTabPrefix: '[diff] ',
  searchPlaceholder: 'Search files…',
  hintClickGit: 'Click a changed file to view its diff',
  hintClickTree: 'Click a file to view its content',
  movePanelLeft: 'Move file panel to the left',
  movePanelRight: 'Move file panel to the right',
  statusU: 'Untracked',
  statusA: 'Added',
  statusM: 'Modified',
  statusD: 'Deleted',
  statusR: 'Renamed',
  statusC: 'Copied',
  statusT: 'Type change',
  staged: '(staged)',
  unstaged: '(unstaged)',
  diffDeleted: '- Deleted',
  diffAdded: '+ Added',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  prevPage: 'Previous page',
  nextPage: 'Next page',
  settingsIntro: 'Manage the display and behavior of "Flyout Sidebar".',
  setDefaultOpen: 'Open by default',
  setDefaultOpenDesc: 'Expand the sidebar on page load; when off it stays collapsed until the corner icon is clicked.',
  setAutoRefresh: 'Auto refresh',
  setAutoRefreshDesc: 'Keep the artifact list in sync while the sidebar is open',
  setFileTree: 'File tree',
  setFileTreeDesc: 'Show the "File tree" tab in the sidebar to browse the workspace directory.',
  setMinWidth: 'Minimum panel width',
  setMinWidthDesc: 'Minimum width of the panel (percentage of window width, 20–60); drag the panel edge to go wider.',
  setCodeWrap: 'Code wrap',
  setCodeWrapDesc: 'Soft-wrap long lines in code previews; when off they scroll horizontally.',
  wordWrap: 'Word wrap',
  setLang: 'Interface language',
  setLangDesc: 'Display language for the sidebar and the standalone flyout page (flyout requires a reload).',
  langAuto: 'Auto (browser)',
  langZh: '中文',
  langEn: 'English',
}

/** @type {Record<string, Record<string, string>>} */
const DICTS = { zh: ZH, en: EN }

const LANG_KEY = 'dsh-flyout-sidebar:lang'

/** @type {'zh' | 'en' | null} 已显式选择的语言（null = 跟随浏览器自动判定） */
let explicitLang = null
/** @type {Array<(lang: string) => void>} */
let listeners = []

function readStoredLang() {
  try {
    var v = localStorage.getItem(LANG_KEY)
    return v === 'zh' || v === 'en' ? v : null
  } catch (e) {
    return null
  }
}

/** 浏览器语言自动判定：非 zh 开头一律英文 */
function autoLang() {
  try {
    var langs = navigator.languages || (navigator.language ? [navigator.language] : [])
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || '').toLowerCase()
      if (l.indexOf('zh') === 0) return 'zh'
      if (l.indexOf('en') === 0) return 'en'
    }
  } catch (e) {
    // navigator 不可用时按英文处理
  }
  return 'en'
}

function currentLang() {
  if (explicitLang === null) explicitLang = readStoredLang()
  return explicitLang || autoLang()
}

/**
 * @param {string} key 文案键
 * @returns {string} 当前语言文案；两级回退（另一语言 → key）
 */
export function t(key) {
  var lang = currentLang()
  var dict = DICTS[lang] || EN
  if (dict[key] != null) return dict[key]
  var other = DICTS[lang === 'zh' ? 'en' : 'zh']
  if (!other) return key
  return other[key] != null ? other[key] : key
}

/** @returns {'zh' | 'en'} 当前生效语言（含自动判定的结果） */
export function getLang() {
  return currentLang()
}

/** @returns {'zh' | 'en' | null} 用户显式选择的语言（null = 跟随浏览器） */
export function getExplicitLang() {
  if (explicitLang === null) explicitLang = readStoredLang()
  return explicitLang
}

/**
 * 显式设置语言并持久化（null = 恢复跟随浏览器）。
 * @param {'zh' | 'en' | null} lang
 */
export function setLang(lang) {
  explicitLang = lang
  try {
    if (lang === null) localStorage.removeItem(LANG_KEY)
    else localStorage.setItem(LANG_KEY, lang)
  } catch (e) {
    // localStorage 不可用时仅保存在内存
  }
  var next = listeners.slice()
  for (var i = 0; i < next.length; i++) {
    var fn = next[i]
    if (!fn) continue
    try {
      fn(currentLang())
    } catch (e) {
      // 单个订阅者异常不阻断其余
    }
  }
}

/** @param {(lang: string) => void} fn @returns {() => void} 取消订阅 */
export function subscribeLang(fn) {
  listeners.push(fn)
  return function () {
    listeners = listeners.filter(function (f) {
      return f !== fn
    })
  }
}
