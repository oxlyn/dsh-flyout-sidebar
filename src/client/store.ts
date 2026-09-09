/**
 * Client 侧：共享状态与工具函数。
 *
 * - store / settingsStore：面板开关与功能设置（配置保存在宿主侧，经
 *   /flyout-sidebar/config 拉取），触发按钮与面板等组件通过 useOpen /
 *   useSettings 订阅。
 * - currentSessionId / quoteToComposer：读取客户端会话库、把 @path 引用
 *   写入会话输入框。
 */
import { getLang, subscribeLang } from '../shared/i18n.js'
import type { SessionListLike } from './runtime'
import { ctx } from './runtime'
import { React } from './jsx'

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
 * 滑动。面板首次挂载后常驻 DOM，开合只同步切换 slidOut（= !open）：
 * 可见性是 open 的纯同步函数，没有卸载定时器 / rAF 翻转时序 —— 旧实现
 * （关闭 240ms 后卸载、重开靠双重 rAF 把面板从屏外拉回）一旦丢失那个异步
 * 翻转，面板就永远停在屏外，而角落图标已按 open 滑出 —— 表现为「点击图标
 * 不展开、图标也消失」。隐藏的面板平移到屏外且 pointer-events: none，
 * 不拦截交互；git 轮询等副作用各自以 open 为门控。
 */
export interface SlideState {
  visible: boolean
  slidOut: boolean
}

/** 功能设置：保存在宿主侧插件配置（DSH 插件管理），面板打开时拉取最新值 */
export interface Settings {
  autoRefresh: boolean
  minPanelWidth: number
  defaultOpen: boolean
  contentFontSize: number
}

// 配置保存在宿主侧（cordis Config schema）；默认值常量与 src/index.ts 对齐。
const DEFAULT_SETTINGS: Settings = {
  autoRefresh: true, // 面板打开时轮询刷新
  minPanelWidth: 20, // 面板最小宽度（占窗口宽度百分比）
  defaultOpen: true, // 页面加载后默认展开
  contentFontSize: 13, // 内容区（代码/diff/markdown）基准字号
}

function loadSettings(): Settings {
  // 初始以默认值渲染，随后 load() 从宿主 /flyout-sidebar/config 拉取真实配置。
  return { ...DEFAULT_SETTINGS }
}

type SettingsListener = (settings: Settings) => void

// defaultOpen 只应用一次的门闩：面板每次摊开都会重拉配置（热重载后即生效），
// 若每次都把 defaultOpen 回写开合状态，defaultOpen=false 会把用户刚点开的面板
// 当场压回，表现为「图标显示了但点击没反应」。首次加载应用一次后不再干预。
let openSyncedWithConfig = false

export const settingsStore = {
  data: loadSettings(),
  listeners: [] as SettingsListener[],
  get(): Settings {
    return this.data
  },
  /**
   * 从宿主拉取插件配置（config 已由 cordis 校验填充默认值）并通知订阅者。
   * 配置保存在宿主侧，页面内不持久化；面板打开即用最新值。
   */
  load(): void {
    fetch('/flyout-sidebar/config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status))))
      .then((out: { config?: Partial<Settings> }) => {
        const next = { ...this.data, ...(out.config || {}) }
        this.data = next
        for (const fn of this.listeners) {
          try {
            fn(next)
          } catch {
            // 单个订阅者异常不阻断其余
          }
        }
        // 首次加载（页面打开瞬间）把 defaultOpen 应用到初始开合：走 setOpen
        // 通知订阅者，旧实现直接赋值 store.open，Open 订阅者（corner 触发
        // 按钮）收不到通知，组件停留在初始 open=true 的滑出态 → 图标不可见；
        // 同时 slide 被置为收起 → 面板在屏外，点按钮也无反应。之后配置再变
        // （设置热重载 / 面板重开）都不回写开合，把开合控制权完全交给用户。
        if (!openSyncedWithConfig) {
          openSyncedWithConfig = true
          if (typeof next.defaultOpen === 'boolean' && next.defaultOpen !== store.open) {
            store.setOpen(next.defaultOpen)
          }
        }
      })
      .catch(() => {
        // 拉取失败保持默认配置；应用内面板下次打开会重试
      })
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

const slideState: SlideState = { visible: true, slidOut: !store.open }
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

store.subscribe((open) => {
  setSlide({ slidOut: !open })
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
 * 界面语言：订阅 i18n 的语言变更（宿主界面语言切换时），强制订阅组件重渲染，
 * 组件内的 t() 调用随之取到新语言文案。
 */
export function useLang(): 'zh' | 'en' {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const unsubscribe = subscribeLang(() => force())
    return () => unsubscribe()
  }, [])
  return getLang()
}
