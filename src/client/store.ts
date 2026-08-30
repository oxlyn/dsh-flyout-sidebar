/**
 * Client 侧：共享状态与工具函数。
 *
 * - store / settingsStore：面板开关与功能设置（localStorage 持久化），
 *   触发按钮与面板等组件通过 useOpen / useSettings 订阅。
 * - currentSessionId / quoteToComposer：读取客户端会话库、把 @path 引用
 *   写入会话输入框。
 */
import { getLang, getExplicitLang, setLang as setI18nLang, subscribeLang } from '../shared/i18n.js'
import type { SessionListLike } from './runtime'
import { ctx } from './runtime'
import { React } from './jsx'

export const basename = (p: string): string => {
  const parts = String(p).split('/')
  return parts[parts.length - 1] || p
}

/** 当前会话 id（读自客户端会话库；文件树把它传给 host 以定位工作区） */
export function currentSessionId(): string {
  try {
    const sessions = ctx.get('sessions') as { list?: SessionListLike } | undefined
    const list = sessions?.list
    if (list && typeof list.getSnapshot === 'function') {
      const snap = list.getSnapshot()
      const id = snap ? (snap.current != null ? snap.current : snap.active) : undefined
      return typeof id === 'string' ? id : ''
    }
  } catch {
    // 会话库不可用时视为无会话
  }
  return ''
}

/**
 * 把 `@path` 写进当前会话输入框草稿。成功返回 true；输入 API 不可用时返回
 * false（调用方回退到剪贴板复制）。
 */
export function quoteToComposer(path: string): boolean {
  try {
    const sessions = ctx.get('sessions') as { scope?: (id: string) => unknown; list?: SessionListLike } | undefined
    const conversation = ctx.get('conversation') as
      | { input?: { for?: (scope: unknown) => { setDraft?: (draft: string) => void; state?: { getSnapshot?: () => { draft?: string } } } | undefined } }
      | undefined
    if (!sessions || !conversation) return false
    const list = sessions.list
    let sessionId: string | undefined
    if (list && typeof list.getSnapshot === 'function') {
      const snap = list.getSnapshot()
      const id = snap ? (snap.current != null ? snap.current : snap.active) : undefined
      if (typeof id === 'string') sessionId = id
    }
    if (sessionId == null) return false
    const actx = typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
    if (!actx) return false
    const input = conversation.input && typeof conversation.input.for === 'function' ? conversation.input.for(actx) : undefined
    if (!input || typeof input.setDraft !== 'function') return false
    let draft = ''
    try {
      if (input.state && typeof input.state.getSnapshot === 'function') draft = input.state.getSnapshot()?.draft || ''
    } catch {
      // 草稿状态不可读时按空草稿处理
    }
    const text = '@' + path
    input.setDraft(draft && draft.trim() !== '' ? draft + ' ' + text : text)
    return true
  } catch {
    return false
  }
}

export const fallbackCopy = (text: string): void => {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch {
    // 剪贴板不可用时静默失败
  }
}

type OpenListener = (open: boolean) => void

/** 面板开/关共享状态：角落触发按钮与浮动面板之间的单一事实来源 */
export const store = {
  open: false,
  listeners: [] as OpenListener[],
  setOpen(v: boolean): void {
    if (this.open === v) return
    this.open = v
    for (const fn of this.listeners) {
      try {
        fn(v)
      } catch {
        // 单个订阅者异常不阻断其余
      }
    }
  },
  toggle(): void {
    this.setOpen(!this.open)
  },
  subscribe(fn: OpenListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn)
    }
  },
}

export const useOpen = (): boolean => {
  const [open, setOpen] = React.useState(store.open)
  React.useEffect(() => store.subscribe(setOpen), [])
  return open
}

/**
 * 推拉动画共享状态：面板与角落触发按钮共用，保证两个图标像同一个元素一样
 * 滑动。visible 表示面板是否应挂载（关闭动画结束后才卸载）；slidOut 表示当
 * 前是否处于「滑出屏外」一帧（打开时先保持一帧再翻回，产生滑入过渡）。
 */
export interface SlideState {
  visible: boolean
  slidOut: boolean
}

/** 功能设置，localStorage 持久化，刷新后仍生效 */
export interface Settings {
  autoRefresh: boolean
  minPanelWidth: number
  showFileTree: boolean
  defaultOpen: boolean
}

const SETTINGS_KEY = 'dsh-flyout-sidebar:settings'
const DEFAULT_SETTINGS: Settings = {
  autoRefresh: true, // 面板打开时轮询刷新
  minPanelWidth: 20, // 面板最小宽度（占窗口宽度百分比）
  showFileTree: true, // 面板内显示文件树标签页
  defaultOpen: true, // 页面加载后默认展开
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) }
    }
  } catch {
    // 解析失败按默认设置处理
  }
  return { ...DEFAULT_SETTINGS }
}

type SettingsListener = (settings: Settings) => void

export const settingsStore = {
  data: loadSettings(),
  listeners: [] as SettingsListener[],
  get(): Settings {
    return this.data
  },
  set(key: keyof Settings, value: boolean | number): void {
    const next: Settings = { ...this.data, [key]: value }
    this.data = next
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      // localStorage 不可用时仅保存在内存
    }
    for (const fn of this.listeners) {
      try {
        fn(next)
      } catch {
        // 单个订阅者异常不阻断其余
      }
    }
  },
  subscribe(fn: SettingsListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn)
    }
  },
}

// 在任何组件挂载前应用「默认展开」偏好，使初始开合状态与持久化设置一致。
store.open = !!settingsStore.get().defaultOpen

const slideState: SlideState = { visible: store.open, slidOut: !store.open }
const slideListeners: Array<(s: SlideState) => void> = []
const setSlide = (patch: Partial<SlideState>): void => {
  let changed = false
  for (const key of ['visible', 'slidOut'] as const) {
    const v = patch[key]
    if (v !== undefined && v !== slideState[key]) {
      slideState[key] = v
      changed = true
    }
  }
  if (!changed) return
  const next: SlideState = { ...slideState }
  for (const fn of slideListeners) {
    try {
      fn(next)
    } catch {
      // 单个订阅者异常不阻断其余
    }
  }
}

let slideTimer: ReturnType<typeof setTimeout> | null = null
store.subscribe((open) => {
  if (open) {
    if (slideTimer) {
      clearTimeout(slideTimer)
      slideTimer = null
    }
    setSlide({ visible: true })
    requestAnimationFrame(() => requestAnimationFrame(() => setSlide({ slidOut: false })))
  } else {
    setSlide({ slidOut: true })
    slideTimer = setTimeout(() => {
      slideTimer = null
      setSlide({ visible: false })
    }, 240)
  }
})

export const useSlide = (): SlideState => {
  const [s, setS] = React.useState<SlideState>({ ...slideState })
  React.useEffect(() => {
    slideListeners.push(setS)
    return () => {
      const i = slideListeners.indexOf(setS)
      if (i >= 0) slideListeners.splice(i, 1)
    }
  }, [])
  return s
}

export const useSettings = (): Settings => {
  const [s, setS] = React.useState(settingsStore.get())
  React.useEffect(() => settingsStore.subscribe(setS), [])
  return s
}

/** 订阅客户端会话库：工作区切换时自动返回新的会话 id（触发组件重新取数） */
export function useSessionId(): string {
  const [sessionId, setSessionId] = React.useState(currentSessionId())
  React.useEffect(() => {
    let list: SessionListLike | undefined
    try {
      list = (ctx.get('sessions') as { list?: SessionListLike } | undefined)?.list
    } catch {
      list = undefined
    }
    if (!list || typeof list.subscribe !== 'function') return
    return list.subscribe(() => setSessionId(currentSessionId()))
  }, [])
  return sessionId
}

/**
 * 界面语言：订阅 i18n 的语言变更，语言切换时强制订阅组件重渲染（组件内的
 * t() 调用随之取到新语言文案）。返回值用于设置区判断下拉框选项。
 */
export function useLang(): 'zh' | 'en' {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const unsubscribe = subscribeLang(() => force())
    return () => unsubscribe()
  }, [])
  return getLang()
}

/** 当前设置语言：'zh' / 'en'（显式）或 null（跟随浏览器自动判定） */
export const getLanguageSetting = getExplicitLang

/** 设置界面语言并持久化；null = 恢复跟随浏览器 */
export const setLanguage = setI18nLang
