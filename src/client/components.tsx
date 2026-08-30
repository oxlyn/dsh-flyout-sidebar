/**
 * Client 侧：UI 组件 —— 文件树、多标签预览侧边面板、角落触发按钮、设置区。
 */
import { Fragment, h, React } from './jsx'
import { extType } from '../shared/ext.js'
import { t } from '../shared/i18n.js'
import type { ReactElement, ReactNode } from 'react'

import { ctx, host, type GitStatusEntry, type ListEntry } from './runtime'
import {
  basename,
  currentSessionId,
  fallbackCopy,
  getLanguageSetting,
  quoteToComposer,
  setLanguage,
  store,
  settingsStore,
  useLang,
  useOpen,
  useSessionId,
  useSettings,
  useSlide,
  type Settings,
} from './store'
import { renderPreview, type PreviewTab } from './preview'
import {
  FileCodeIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  GitBranchIcon,
  PanelCollapseIcon,
  PanelIcon,
  FlyoutIcon,
  RefreshIcon,
  WrapIcon,
} from './icons'

// 文件树（文件树视图）：better-sidebar 风格的资源管理器 —— 圆角行、目录/
// 文件图标、悬停 `@引用` 圆片。
interface FileTreeProps {
  onOpen?: (path: string) => void
  selectedPath?: string | null
  refreshToken: number
}

interface TreeNodeState {
  loading?: boolean
  error?: string
  entries?: ListEntry[]
}

export function FileTree({ onOpen, selectedPath, refreshToken }: FileTreeProps): ReactElement {
  const [root, setRoot] = React.useState<{ path: string; entries: ListEntry[] } | null>(null)
  const [children, setChildren] = React.useState<Record<string, TreeNodeState>>({})
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null)
  const [copiedLabel, setCopiedLabel] = React.useState('')
  // 搜索：query 非空时整棵树被平铺的匹配结果列表取代（host 侧 git ls-files，
  // 忽略 gitignore；git 不可用时回退文件系统遍历）。
  const [query, setQuery] = React.useState('')
  const [search, setSearch] = React.useState<{ loading?: boolean; error?: string; entries?: string[] } | null>(null)
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 跟随活动会话：工作区变化时自动重新定位根目录（无需手动刷新）。
  const sessionId = useSessionId()

  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearch(null)
      return
    }
    let alive = true
    setSearch({ loading: true })
    const timer = setTimeout(() => {
      host
        .searchFiles(q, currentSessionId())
        .then((res) => {
          if (alive) setSearch(res && res.ok ? { entries: res.entries || [] } : { error: (res && res.error) || t('searchFailed') })
        })
        .catch(() => {
          if (alive) setSearch({ error: t('searchFailed') })
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, sessionId, refreshToken])

  // 拉取单个目录（展开 / 刷新重取共用）
  const fetchDir = (path: string): void => {
    setChildren((prev) => ({ ...prev, [path]: { loading: true } }))
    host
      .listDir(path, currentSessionId())
      .then((res) => {
        setChildren((prev) => ({
          ...prev,
          [path]: res && res.ok ? { entries: res.entries || [] } : { error: (res && res.error) || t('readFailed') },
        }))
      })
      .catch(() => {
        setChildren((prev) => ({ ...prev, [path]: { error: t('readFailed') } }))
      })
  }

  // keepState：手动刷新时保留展开状态，只重取已展开目录的数据；会话切换
  // （keepState=false）仍全部重置，避免把上一个工作区的树带过来。
  const loadRoot = (keepState = false): void => {
    if (!keepState) {
      setChildren({})
      setExpanded({})
    } else {
      for (const p of Object.keys(expanded)) if (expanded[p]) fetchDir(p)
    }
    setRoot(null)
    if (rootTimer.current) clearTimeout(rootTimer.current)
    // 刚切换的工作区短时间内可能还无法在 host 侧解析（会话仍在加载/持久化
    // 中）。短暂重试让文件树自我纠正，而不是停在陈旧或空状态上。
    const attempt = (tries: number): void => {
      host
        .listDir('', currentSessionId())
        .then((res) => {
          if (res && res.ok) {
            setRoot({ path: res.path || '', entries: res.entries || [] })
          } else if (tries > 0) {
            rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
          }
        })
        .catch(() => {
          if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
        })
    }
    attempt(3)
  }

  // 工作区切换与显式刷新（头部刷新按钮递增 refreshToken）时重新取根。
  const firstTreeRender = React.useRef(true)
  React.useEffect(() => {
    loadRoot()
  }, [sessionId])
  React.useEffect(() => {
    if (firstTreeRender.current) {
      firstTreeRender.current = false
      return
    }
    loadRoot(true)
  }, [refreshToken])
  React.useEffect(() => () => {
    if (rootTimer.current) clearTimeout(rootTimer.current)
  }, [])

  const toggle = (path: string): void => {
    const nextExpanded = { ...expanded, [path]: !expanded[path] }
    setExpanded(nextExpanded)
    if (nextExpanded[path] && !children[path]) fetchDir(path)
  }

  const copyRef = (path: string): void => {
    const text = '@' + path
    let label = t('copied')
    const done = (): void => {
      setCopiedPath(path)
      setCopiedLabel(label)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => {
        setCopiedPath(null)
        setCopiedLabel('')
      }, 1600)
    }
    // 优先写入输入框；失败回退剪贴板复制。
    if (quoteToComposer(path)) {
      label = t('insertedInput')
      done()
      return
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        fallbackCopy(text)
        done()
      })
    } else {
      fallbackCopy(text)
      done()
    }
  }

  const rowActions = (entry: ListEntry): ReactNode =>
    copiedPath === entry.path ? (
      <span className="artifacts-tree-copied">{copiedLabel || t('copied')}</span>
    ) : (
      <button
        type="button"
        className="artifacts-tree-ref"
        title={t('refTitle')}
        onClick={(e) => {
          e.stopPropagation()
          copyRef(entry.path)
        }}
      >
        {t('refBtn')}
      </button>
    )

  // flashDelay 非空时给节点加交错浮现动画（刷新后从上往下逐条出现）。
  const renderNode = (entry: ListEntry, depth: number, flashDelay?: number): ReactElement => {
    const pad = { paddingLeft: 6 + depth * 20 }
    const isSelected = selectedPath === entry.path
    const rowClass =
      'artifacts-tree-row' + (entry.hidden ? ' artifacts-tree-hidden' : '') + (isSelected ? ' is-selected' : '')
    if (entry.isDir) {
      const isExpanded = !!expanded[entry.path]
      const node = children[entry.path]
      return (
        <div
          key={entry.path}
          className={flashDelay != null ? 'artifacts-tree-node artifacts-flash-in' : 'artifacts-tree-node'}
          style={flashDelay != null ? { animationDelay: flashDelay + 'ms' } : undefined}
        >
          <div
            role="button"
            tabIndex={0}
            className={rowClass + ' artifacts-tree-dir'}
            style={pad}
            onClick={() => toggle(entry.path)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                toggle(entry.path)
              }
            }}
            title={entry.path}
          >
            {isExpanded ? <FolderOpenIcon size={14} /> : <FolderClosedIcon size={14} />}
            <span className="artifacts-tree-name">{entry.name}</span>
            {rowActions(entry)}
          </div>
            {isExpanded ? (
              node && node.loading ? (
                <div
                  className="artifacts-tree-row artifacts-tree-loading"
                  style={{ paddingLeft: 6 + (depth + 1) * 20 + 20 }}
                >
                  {t('loading')}
                </div>
              ) : node && node.error ? (
              <div
                className="artifacts-tree-row artifacts-tree-error"
                style={{ paddingLeft: 6 + (depth + 1) * 20 + 20 }}
              >
                {node.error}
              </div>
            ) : node && node.entries ? (
              node.entries.map((c) => renderNode(c, depth + 1))
            ) : null
          ) : null}
        </div>
      )
    }
    return (
      <div
        role="button"
        tabIndex={0}
        className={rowClass + (flashDelay != null ? ' artifacts-flash-in' : '')}
        style={flashDelay != null ? { ...pad, animationDelay: flashDelay + 'ms' } : pad}
        onClick={() => {
          if (onOpen) onOpen(entry.path)
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            if (onOpen) onOpen(entry.path)
          }
        }}
        title={entry.path}
      >
        <FileCodeIcon size={14} />
        <span className="artifacts-tree-name">{entry.name}</span>
        {rowActions(entry)}
      </div>
    )
  }

  // 搜索结果行：复用文件行的操作按钮（@引用 / 打开预览），目录前缀弱化显示。
  const renderSearchRow = (path: string, idx: number): ReactElement => {
    const entry: ListEntry = { name: basename(path), path, isDir: false, hidden: false }
    const slash = path.lastIndexOf('/')
    const dir = slash >= 0 ? path.slice(0, slash) : ''
    return (
      <div
        key={path}
        role="button"
        tabIndex={0}
        className={'artifacts-tree-row artifacts-flash-in' + (selectedPath === path ? ' is-selected' : '')}
        style={{ animationDelay: Math.min(idx, 12) * 30 + 'ms' }}
        onClick={() => {
          if (onOpen) onOpen(path)
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            if (onOpen) onOpen(path)
          }
        }}
        title={path}
      >
        <FileCodeIcon size={14} />
        <span className="artifacts-tree-name">
          {entry.name}
          {dir ? <span className="artifacts-search-dir">{dir}</span> : null}
        </span>
        {rowActions(entry)}
      </div>
    )
  }

  return (
    <div className="artifacts-tree">
      <div className="artifacts-searchbar">
        <input
          type="text"
          className="artifacts-search-input"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') setQuery('')
          }}
        />
      </div>
      <div className="artifacts-tree-body">
        {query.trim() ? (
          search && search.loading ? (
            <div className="artifacts-hint">{t('searching')}</div>
          ) : search && search.error ? (
            <div className="artifacts-tree-error artifacts-git-error">{search.error}</div>
          ) : search && search.entries && search.entries.length ? (
            search.entries.map((p, i) => renderSearchRow(p, i))
          ) : (
            <div className="artifacts-hint">{t('noResults')}</div>
          )
        ) : !root ? (
          <div className="artifacts-hint">{t('loadingTree')}</div>
        ) : !root.entries || !root.entries.length ? (
          <div className="artifacts-hint">{t('emptyDir')}</div>
        ) : (
          root.entries.map((e, i) => renderNode(e, 0, Math.min(i, 12) * 45))
        )}
      </div>
    </div>
  )
}

export function ArtifactsPanel(): ReactElement | null {
  const open = useOpen()
  const settings = useSettings()
  // 订阅界面语言：切换语言时本组件（含整棵子树）重渲染，t() 取到新文案。
  useLang()
  const [tabs, setTabs] = React.useState<PreviewTab[]>([])
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  // ⇥ 隐藏整个预览覆盖层但保留标签页；从文件树/git 列表打开任何文件都会全部
  // 恢复。
  const [previewHidden, setPreviewHidden] = React.useState(false)

  // 跟随活动会话：预览标签页属于某个项目的文件，工作区切换时全部关闭
  //（否则陈旧标签会把旧项目内容显示在新工作区旁边）。
  const sessionId = useSessionId()
  const firstSession = React.useRef(true)
  React.useEffect(() => {
    if (firstSession.current) {
      firstSession.current = false
      return
    }
    setTabs([])
    setActiveKey(null)
    setPreviewHidden(false)
    try {
      sessionStorage.removeItem(TABS_KEY)
    } catch {
      // sessionStorage 不可用时跳过
    }
  }, [sessionId])
  const [notice, setNotice] = React.useState('')
  const TABS_KEY = 'dsh-flyout-sidebar:tabs'
  // 窗口宽度（resize 时更新）：面板宽度以「可用宽度的比例」保存，窗口缩放
  // 后宽度按比例跟随，而不是停在拖拽时的固定像素。
  const [winW, setWinW] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1400))
  const [gitFiles, setGitFiles] = React.useState<GitStatusEntry[] | null>(null) // null = 加载中
  const [gitError, setGitError] = React.useState<string | null>(null)
  const [panelFrac, setPanelFrac] = React.useState<number | null>(null) // 占可用宽度的比例；null = 用最小宽度
  const [resizing, setResizing] = React.useState(false)
  const [activeView, setActiveView] = React.useState<'tree' | 'git'>(() => (settings.showFileTree ? 'tree' : 'git'))
  const [treeRefresh, setTreeRefresh] = React.useState(0) // 头部刷新按钮递增
  const [gitRefresh, setGitRefresh] = React.useState(0)
  // 刷新按钮点击后置真：git 列表短暂变暗，强制响应返回后恢复，给出「刷新
  // 过了」的可见反馈。gitFlash 递增使行重新挂载，重放逐行浮现动画。
  const [gitRefreshing, setGitRefreshing] = React.useState(false)
  const [gitFlash, setGitFlash] = React.useState(0)
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // git 视图可见时轮询「已变更未提交」文件。gitForceRef 标记下一次加载
  // （由刷新按钮触发）需绕过 host 缓存强制取真实状态。
  const gitForceRef = React.useRef(false)
  React.useEffect(() => {
    if (!open || activeView !== 'git') return
    let alive = true
    const load = (): void => {
      const force = gitForceRef.current
      gitForceRef.current = false
      host
        .gitStatus(currentSessionId(), force)
        .then((res) => {
          if (!alive) return
          if (force) {
            setGitRefreshing(false)
            setGitFlash((n) => n + 1)
          }
          if (res && res.ok) {
            setGitFiles(Array.isArray(res.entries) ? res.entries : [])
            setGitError(null)
          } else {
            setGitFiles([])
            setGitError((res && res.error) || t('gitStatusFailed'))
          }
        })
        .catch((e: unknown) => {
          if (force) setGitRefreshing(false)
          if (alive) setGitError(e instanceof Error && e.message ? String(e.message) : String(e))
        })
    }
    load()
    let dispose: (() => void) | undefined
    if (settings.autoRefresh) dispose = ctx.interval(load, 2000)
    return () => {
      alive = false
      if (dispose) dispose()
    }
  }, [open, activeView, settings.autoRefresh, gitRefresh, sessionId])

  // 预览标签持久化（sessionStorage，按会话归属）：浏览器刷新后恢复打开的
  // 标签（只存元数据，内容恢复时重新拉取）。会话切换时由下方的清空逻辑移除。
  React.useEffect(() => {
    try {
      if (!tabs.length) sessionStorage.removeItem(TABS_KEY)
      else
        sessionStorage.setItem(
          TABS_KEY,
          JSON.stringify({ sid: sessionId, tabs: tabs.map((tb) => ({ key: tb.key, path: tb.path, git: tb.git })), activeKey }),
        )
    } catch {
      // sessionStorage 不可用时跳过
    }
  }, [tabs, activeKey, sessionId])

  // 把当前会话 id 发布到 localStorage：独立弹出标签页没有客户端会话库，
  // 靠它把文件树根植到活动工作区并实时跟随切换。
  React.useEffect(() => {
    const KEY = 'dsh-flyout-sidebar:session'
    const write = (): void => {
      try {
        const sid = currentSessionId()
        if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || '')
      } catch {
        // localStorage 不可用时跳过
      }
    }
    write()
    let list
    try {
      list = (ctx.get('sessions') as { list?: { subscribe?: (fn: () => void) => () => void } } | undefined)?.list
    } catch {
      list = undefined
    }
    if (!list || typeof list.subscribe !== 'function') return
    return list.subscribe(write)
  }, [])

  // 把 DSH 的浅/深主题发布到 localStorage，独立弹出页随之匹配并跟随实时
  // 切换。DSH 在 <body> 上设置 dark 属性（见 styles 中 body[data-ds-dark-theme]
  // 规则），因此同时观察 documentElement 和 body。
  React.useEffect(() => {
    const KEY = 'dsh-flyout-sidebar:theme'
    const isDark = (): boolean => {
      if (document.documentElement.hasAttribute('data-ds-dark-theme')) return true
      if (document.body && document.body.hasAttribute('data-ds-dark-theme')) return true
      return false
    }
    const write = (): void => {
      try {
        const v = isDark() ? 'dark' : 'light'
        if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v)
      } catch {
        // localStorage 不可用时跳过
      }
    }
    write()
    if (typeof MutationObserver !== 'function') return
    const obs = new MutationObserver(write)
    const opts: MutationObserverInit = { attributes: true, attributeFilter: ['data-ds-dark-theme'] }
    obs.observe(document.documentElement, opts)
    if (document.body) obs.observe(document.body, opts)
    return () => obs.disconnect()
  }, [])

  React.useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 面板宽度（px）：至少 minPanelWidth% 窗口宽，拖左边缘可更宽。panelFrac
  // 保存拖拽结果（占可用宽度的比例）；null → 用配置的最小值。
  const rightOffset = (() => {
    const n = parseFloat(document.documentElement.style.getPropertyValue('--dsh-sidebar-width'))
    return Number.isFinite(n) ? n : 0
  })()
  const avail = Math.max(120, winW - rightOffset)
  const minWidthPx = Math.max(80, Math.round((winW * (settings.minPanelWidth || 0)) / 100))
  const widthPx = panelFrac != null ? Math.max(minWidthPx, Math.round(panelFrac * avail)) : minWidthPx

  // 打开时为面板预留布局空间：把 app 框架收缩面板实时宽度，会话列让位
  //（见 styles 中 html #root 规则）。
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--dsh-flyout-sidebar-width', open ? widthPx + 'px' : '0px')
    return () => {
      root.style.setProperty('--dsh-flyout-sidebar-width', '0px')
    }
  }, [open, widthPx])

  // 拖拽时禁用布局过渡，框架才能跟住指针（对应 body[data-dsh-flyout-dragging]）。
  React.useEffect(() => {
    if (resizing) document.body.setAttribute('data-dsh-flyout-dragging', '')
    else document.body.removeAttribute('data-dsh-flyout-dragging')
    return () => {
      document.body.removeAttribute('data-dsh-flyout-dragging')
    }
  }, [resizing])

  // 推拉动画：面板和角落触发按钮共用 slide 状态（见 store），关闭时滑出屏
  // 右侧、动画结束后才卸载，打开时先挂在屏外一帧再滑入，与 #root 让位过渡
  // 同时进行。
  const { visible, slidOut } = useSlide()

  if (!visible) return null

  const flyoutHref = '/flyout-sidebar' + (sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : '')

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    setResizing(true)
    const availAtStart = avail
    const onMove = (ev: MouseEvent): void => {
      const w = window.innerWidth - ev.clientX - rightOffset
      const frac = Math.max(minWidthPx / availAtStart, Math.min(w / availAtStart, (availAtStart - 24) / availAtStart))
      setPanelFrac(frac)
    }
    const onUp = (): void => {
      setResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const flash = (msg: string): void => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 1600)
  }
  const copyText = (text: string, msg: string): void => {
    const done = (): void => flash(msg)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        fallbackCopy(text)
        done()
      })
    } else {
      fallbackCopy(text)
      done()
    }
  }
  const quotePath = (path: string): void => {
    if (quoteToComposer(path)) {
      flash(t('insertedInput'))
      return
    }
    copyText('@' + path, t('copiedRef'))
  }

  // Esc：优先关闭活动预览标签（标签随层隐藏），无预览时收起整个面板。
  // 输入控件聚焦时（搜索框 / 会话输入框）不抢 Esc。
  React.useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      const target = ev.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (tabs.length && !previewHidden) {
        if (activeKey) closeTab(activeKey)
        else setPreviewHidden(true)
      } else {
        store.setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, tabs, previewHidden, activeKey])

  // 多标签预览状态：每个打开的文件（或 git diff）一个标签，按路径作键
  //（'g:' 前缀区分 diff 标签）。
  const patchTab = (key: string, patch: Partial<PreviewTab>): void =>
    setTabs((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  const openTab = (key: string, path: string, git: boolean, initial: Partial<PreviewTab>): void => {
    setPreviewHidden(false)
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.key === key)
      if (i >= 0) {
        // 重复打开 = 重新加载并聚焦该标签。
        const next = prev.slice()
        const cur = next[i]
        if (cur) next[i] = { ...cur, ...initial }
        return next
      }
      return prev.concat([{ key, path, git, ...initial }])
    })
    setActiveKey(key)
  }

  const closeTab = (key: string): void => {
    const idx = tabs.findIndex((t) => t.key === key)
    const next = tabs.filter((t) => t.key !== key)
    setTabs(next)
    if (activeKey === key) setActiveKey(next.length ? (next[Math.min(idx, next.length - 1)]?.key ?? null) : null)
  }

  const activeTab = tabs.find((t) => t.key === activeKey) || null

  const openFile = (path: string): void => {
    const key = 'p:' + path
    const type = extType(path)
    // 图片和 PDF 以二进制媒体伺服 —— 无需读文本。
    const initial: Partial<PreviewTab> = { loading: false, type, diff: null }
    if (type !== 'image' && type !== 'pdf') initial.loading = true
    openTab(key, path, false, initial)
    if (type === 'image' || type === 'pdf') return
    host
      .readArtifact(path)
      .then((res) => {
        patchTab(key, { loading: false, ...res })
      })
      .catch((e: unknown) => {
        patchTab(key, { loading: false, ok: false, error: String(e instanceof Error && e.message ? e.message : e) })
      })
  }

  // 打开一个变更文件相对 HEAD 的未提交 diff。
  const openGitDiff = (path: string): void => {
    const key = 'g:' + path
    openTab(key, path, true, { loading: true })
    host
      .gitDiff(path, currentSessionId())
      .then((res) => {
        patchTab(key, { loading: false, ...res })
      })
      .catch((e: unknown) => {
        patchTab(key, { loading: false, ok: false, error: String(e instanceof Error && e.message ? e.message : e) })
      })
  }

  // 恢复持久化的标签：同一会话内浏览器刷新后，把打开的标签重新拉起
  //（openFile / openGitDiff 自带重新取数）。每个会话只恢复一次。
  const restoredSid = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (restoredSid.current === sessionId) return
    restoredSid.current = sessionId
    if (sessionId == null) return
    try {
      const raw = sessionStorage.getItem(TABS_KEY)
      if (!raw) return
      const saved: unknown = JSON.parse(raw)
      const sid = (saved as { sid?: unknown }).sid
      const list = (saved as { tabs?: unknown }).tabs
      if (sid !== sessionId || !Array.isArray(list)) return
      for (const st of list as Array<{ key?: unknown; path?: unknown; git?: unknown }>) {
        if (typeof st?.key !== 'string' || typeof st?.path !== 'string') continue
        if (st.git) openGitDiff(st.path)
        else openFile(st.path)
      }
      const savedActive = (saved as { activeKey?: unknown }).activeKey
      if (typeof savedActive === 'string') setActiveKey(savedActive)
    } catch {
      // 解析失败按无持久化处理
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // 状态字母 → 变更行显示标签。
  const gitLabel = (e: GitStatusEntry): string => {
    if (e.x === '?' || e.y === '?') return 'U'
    return (e.y !== ' ' ? e.y : e.x) || 'M'
  }
  const gitTitle = (e: GitStatusEntry): string => {
    const label = gitLabel(e)
    const map: Record<string, string> = {
      U: t('statusU'), A: t('statusA'), M: t('statusM'),
      D: t('statusD'), R: t('statusR'), C: t('statusC'), T: t('statusT'),
    }
    const staged = e.x !== ' ' && e.x !== '?'
    return (map[label] || label) + (staged ? t('staged') : t('unstaged'))
  }

  const gitListRows: ReactNode[] = []
  if (gitError) {
    gitListRows.push(
      <div key="err" className="artifacts-tree-error artifacts-git-error">
        {gitError}
      </div>,
    )
  } else if (gitFiles == null) {
    gitListRows.push(<div key="load" className="artifacts-empty">{t('loadingChanges')}</div>)
  } else if (!gitFiles.length) {
    gitListRows.push(<div key="empty" className="artifacts-empty">{t('noChanges')}</div>)
  }
  ;(gitFiles || []).forEach((e, idx) => {
    const label = gitLabel(e)
    const isActive = !!(activeTab && activeTab.git && activeTab.path === e.path)
    // 刚刷新过：key 带上 gitFlash 令行重新挂载、重放动画；延迟按行号递增，
    // 形成「从上往下逐行浮现」，封顶避免长列表拖太久。
    const flashKey = gitFlash > 0 ? gitFlash + ':' : ''
    gitListRows.push(
      <div
        key={flashKey + e.path}
        className={'artifacts-item' + (isActive ? ' is-active' : '') + (flashKey ? ' artifacts-flash-in' : '')}
        style={flashKey ? { animationDelay: Math.min(idx, 12) * 45 + 'ms' } : undefined}
      >
        <button type="button" className="artifacts-item-main" title={gitTitle(e)} onClick={() => openGitDiff(e.path)}>
          <div className="artifacts-item-row">
            <span className={'artifacts-git-badge artifacts-git-badge-' + label}>{label}</span>
            <span className="artifacts-item-base">{basename(e.path)}</span>
            {typeof e.adds === 'number' && (e.adds > 0 || (e.dels ?? 0) > 0) ? (
              <span className="artifacts-git-stats">
                <span className="artifacts-git-adds">+{e.adds}</span>
                <span className="artifacts-git-dels">−{e.dels ?? 0}</span>
              </span>
            ) : null}
            {e.origPath ? <span className="artifacts-git-orig">← {basename(e.origPath)}</span> : null}
          </div>
          <div className="artifacts-item-full">{e.path}</div>
        </button>
        <div className="artifacts-item-actions">
          <button type="button" className="artifacts-minibtn" title={t('copyPath')} onClick={() => copyText(e.path, t('copiedPath'))}>
            ⧉
          </button>
          <button type="button" className="artifacts-minibtn" title={t('refInput')} onClick={() => quotePath(e.path)}>
            @
          </button>
        </div>
      </div>,
    )
  })

  // 多标签预览覆盖层：每个打开的文件一个标签；活动标签内容盖住侧边栏面板
  // 左侧的整个区域。⇥ 按钮隐藏整个覆盖层 —— 标签保留，经左缘胶囊或打开任
  // 何文件恢复。
  const previewOverlay =
    tabs.length && !previewHidden ? (
      <div
        className={'artifacts-preview-overlay' + (slidOut ? ' artifacts-slid-out' : '')}
        role="region"
        aria-label={t('previewRegion')}
      >
        <div className="artifacts-preview-overlay-tabs">
          <div className="artifacts-ptabs-scroll">
            {tabs.map((tab) => (
              <div
                key={tab.key}
                className={'artifacts-ptab' + (tab.key === activeKey ? ' is-active' : '')}
                title={(tab.git ? t('diffTabPrefix') : '') + (tab.path || '')}
                onClick={() => setActiveKey(tab.key)}
              >
                <span className="artifacts-ptab-name">{basename(tab.path || '')}</span>
                <button
                  type="button"
                  className="artifacts-ptab-close"
                  title={t('closeTab')}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.key)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={'artifacts-preview-hide' + (settings.codeWrap ? ' is-active' : '')}
            title={t('wordWrap')}
            aria-pressed={settings.codeWrap}
            onClick={() => settingsStore.set('codeWrap', !settings.codeWrap)}
          >
            <WrapIcon size={16} />
          </button>
          <button type="button" className="artifacts-preview-hide" title={t('hidePreview')} onClick={() => setPreviewHidden(true)}>
            <PanelCollapseIcon size={16} />
          </button>
        </div>
        {activeTab ? renderPreview(activeTab, settings.codeWrap) : null}
      </div>
    ) : null

  return (
    <Fragment>
      {previewOverlay}
      <div
        className={
          'artifacts-panel' + (slidOut ? ' artifacts-slid-out' : '') + (resizing ? ' artifacts-resizing' : '')
        }
        style={{ width: widthPx }}
        role="dialog"
        aria-label="Artifacts"
      >
        <div className="artifacts-resize" title={t('resizeHandle')} onMouseDown={startResize} />
        <div className="artifacts-head">
          <div className="artifacts-head-left">
            <button type="button" className="artifacts-toggle" title={t('collapsePanel')} onClick={() => store.setOpen(false)}>
              <PanelIcon size={16} />
            </button>
            <a
              className="artifacts-link"
              href={flyoutHref}
              target="_blank"
              rel="noreferrer noopener"
              title={t('flyoutOpen')}
            >
              <FlyoutIcon size={16} />
            </a>
          </div>
          <span className="artifacts-spacer" />
          {notice ? <span className="artifacts-notice">{notice}</span> : null}
          <button
            type="button"
            className="artifacts-toggle"
            title={activeView === 'tree' ? t('refreshTree') : t('refreshChanges')}
            onClick={() => {
              if (activeView === 'tree') setTreeRefresh((n) => n + 1)
              else {
                gitForceRef.current = true
                setGitRefreshing(true)
                setGitRefresh((n) => n + 1)
              }
            }}
          >
            <RefreshIcon size={16} />
          </button>
          {settings.showFileTree ? (
            <button
              type="button"
              className={'artifacts-iconbtn artifacts-viewbtn' + (activeView === 'git' ? ' is-active' : '')}
              title={activeView === 'tree' ? t('viewGit') : t('backToFiles')}
              aria-pressed={activeView === 'git'}
              onClick={() => setActiveView(activeView === 'tree' ? 'git' : 'tree')}
            >
              {activeView === 'tree' ? <GitBranchIcon size={16} /> : <FolderClosedIcon size={16} />}
            </button>
          ) : null}
        </div>
        <div className="artifacts-main">
          <div
            className={'artifacts-body' + (activeView === 'git' && gitRefreshing ? ' artifacts-refreshing' : '')}
            style={{ flex: '1 1 auto' }}
          >
            {activeView === 'tree' && settings.showFileTree ? (
              <FileTree
                onOpen={openFile}
                selectedPath={activeTab && !activeTab.git ? activeTab.path : null}
                refreshToken={treeRefresh}
              />
            ) : (
              gitListRows
            )}
          </div>
        </div>
      </div>
    </Fragment>
  )
}

// 常驻触发按钮，钉在右上角。注册进根作用域的 shell.overlay 列表，因此无会
// 话时也可见；固定 CSS 定位在角落，被右侧边栏宽度向左让位。刻意只显示图标。
export function CornerButton(): ReactElement {
  const open = useOpen()
  useLang()
  // 常驻挂载：面板打开时滑出屏右缘（随面板滑入的推力），关闭时滑回角落。
  // 直接跟随 open，而不是面板的 slidOut —— 后者在关闭动画结束时会停在
  // true，按钮就会被留在屏外。
  return (
    <button
      type="button"
      className={'artifacts-corner-btn' + (open ? ' artifacts-slid-out' : '')}
      title={t('flyoutTitle')}
      aria-expanded={open}
      onClick={() => store.toggle()}
    >
      <PanelIcon size={18} />
    </button>
  )
}

interface SettingsToggleProps {
  label: string
  desc: string
  value: boolean
  onToggle: (v: boolean) => void
}

function SettingsToggle({ label, desc, value, onToggle }: SettingsToggleProps): ReactElement {
  return (
    <div className="artifacts-setrow">
      <div className="artifacts-settext">
        <div className="artifacts-settitle">{label}</div>
        <div className="artifacts-setdesc">{desc}</div>
      </div>
      <label className="artifacts-switch">
        <input
          type="checkbox"
          checked={value}
          aria-label={label}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
        <span className="artifacts-switch-track" aria-hidden="true">
          <span className="artifacts-switch-thumb" />
        </span>
      </label>
    </div>
  )
}

export function SettingsSection(): ReactElement {
  const settings = useSettings()
  // 订阅语言变更：切换时本组件重渲染，下拉框与文案随之更新。
  useLang()
  const set = (key: keyof Settings, value: boolean | number): void => settingsStore.set(key, value)

  return (
    <div className="artifacts-settings">
      <p className="artifacts-setintro">{t('settingsIntro')}</p>
      <div className="artifacts-setgroup">
        <SettingsToggle
          label={t('setDefaultOpen')}
          desc={t('setDefaultOpenDesc')}
          value={settings.defaultOpen}
          onToggle={(v) => set('defaultOpen', v)}
        />
        <SettingsToggle
          label={t('setAutoRefresh')}
          desc={t('setAutoRefreshDesc')}
          value={settings.autoRefresh}
          onToggle={(v) => set('autoRefresh', v)}
        />
        <SettingsToggle
          label={t('setFileTree')}
          desc={t('setFileTreeDesc')}
          value={settings.showFileTree}
          onToggle={(v) => set('showFileTree', v)}
        />
        <SettingsToggle
          label={t('setCodeWrap')}
          desc={t('setCodeWrapDesc')}
          value={settings.codeWrap}
          onToggle={(v) => set('codeWrap', v)}
        />
        <div className="artifacts-setrow">
          <div className="artifacts-settext">
            <div className="artifacts-settitle">{t('setMinWidth')}</div>
            <div className="artifacts-setdesc">{t('setMinWidthDesc')}</div>
          </div>
          <div className="artifacts-setcontrol">
            <input
              type="number"
              className="artifacts-widthinput"
              min={20}
              max={60}
              value={settings.minPanelWidth}
              onChange={(e) => {
                const n = parseInt(e.currentTarget.value, 10)
                if (Number.isNaN(n)) return
                set('minPanelWidth', Math.max(20, Math.min(60, n)))
              }}
            />
            <span className="artifacts-suffix">%</span>
          </div>
        </div>
        <div className="artifacts-setrow">
          <div className="artifacts-settext">
            <div className="artifacts-settitle">{t('setLang')}</div>
            <div className="artifacts-setdesc">{t('setLangDesc')}</div>
          </div>
          <div className="artifacts-setcontrol">
            <select
              className="artifacts-langselect"
              value={getLanguageSetting() || ''}
              onChange={(e) => {
                const v = e.currentTarget.value
                setLanguage(v === 'zh' || v === 'en' ? (v as 'zh' | 'en') : null)
              }}
            >
              <option value="">{t('langAuto')}</option>
              <option value="zh">{t('langZh')}</option>
              <option value="en">{t('langEn')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
