    const FileTree = (props) => {
      const [root, setRoot] = React.useState(null)
      const [children, setChildren] = React.useState({})
      const [expanded, setExpanded] = React.useState({})
      const [copiedPath, setCopiedPath] = React.useState(null)
      const [copiedLabel, setCopiedLabel] = React.useState('')
      const copyTimer = React.useRef(null)
      const rootTimer = React.useRef(null)

      // Track the active session so the tree re-roots automatically when the
      // workspace changes (no manual refresh needed).
      const [sessionId, setSessionId] = React.useState(currentSessionId())
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(() => setSessionId(currentSessionId()))
      }, [])

      const loadRoot = () => {
        setChildren({})
        setExpanded({})
        setRoot(null)
        clearTimeout(rootTimer.current)
        // A freshly switched-to workspace may not be resolvable on the host for
        // a beat (its session is still loading/persisting). Retry briefly so the
        // tree self-corrects instead of sitting on a stale or empty root.
        const attempt = (tries) => {
          host.call('artifacts.listDir', { sessionId: currentSessionId() }).then((res) => {
            if (res && res.ok) {
              setRoot({ path: res.path, entries: res.entries })
            } else if (tries > 0) {
              rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
            }
          }).catch(() => {
            if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
          })
        }
        attempt(3)
      }

      // Re-root on workspace switch and on an explicit refresh (the header's
      // refresh button bumps `props.refreshToken`).
      React.useEffect(() => { loadRoot() }, [sessionId, props.refreshToken])
      React.useEffect(() => () => clearTimeout(rootTimer.current), [])

      const toggle = (path) => {
        const nextExpanded = Object.assign({}, expanded, { [path]: !expanded[path] })
        setExpanded(nextExpanded)
        if (nextExpanded[path] && !children[path]) {
          setChildren(Object.assign({}, children, { [path]: { loading: true } }))
          host.call('artifacts.listDir', { path, sessionId: currentSessionId() }).then((res) => {
            setChildren((prev) => Object.assign({}, prev, { [path]: res && res.ok ? { entries: res.entries } : { error: (res && res.error) || '读取失败' } }))
          }).catch(() => {
            setChildren((prev) => Object.assign({}, prev, { [path]: { error: '读取失败' } }))
          })
        }
      }

      const copyRef = (path) => {
        const text = '@' + path
        let label = '已复制'
        const done = () => {
          setCopiedPath(path)
          setCopiedLabel(label)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
        }
        // Prefer writing into the composer; fall back to clipboard copy.
        if (quoteToComposer(path)) {
          label = '已插入输入框'
          done()
          return
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }

      const rowActions = (entry) => (copiedPath === entry.path
        ? React.createElement('span', { className: 'artifacts-tree-copied' }, copiedLabel || '已复制')
        : React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-ref',
          title: '引用到输入框（失败则复制 @path）',
          onClick: (e) => { e.stopPropagation(); copyRef(entry.path) },
        }, '@引用'))

      const renderNode = (entry, depth) => {
        const pad = { paddingLeft: 6 + depth * 20 }
        const isSelected = props.selectedPath === entry.path
        const rowClass = 'artifacts-tree-row' +
          (entry.hidden ? ' artifacts-tree-hidden' : '') +
          (isSelected ? ' is-selected' : '')
        if (entry.isDir) {
          const isExpanded = !!expanded[entry.path]
          const node = children[entry.path]
          return React.createElement('div', { key: entry.path },
            React.createElement('div', {
              role: 'button',
              tabIndex: 0,
              className: rowClass + ' artifacts-tree-dir',
              style: pad,
              onClick: () => toggle(entry.path),
              onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(entry.path) } },
              title: entry.path,
            },
              isExpanded ? FolderOpenIcon(14) : FolderClosedIcon(14),
              React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
              rowActions(entry),
            ),
            isExpanded
              ? (node && node.loading
                ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-loading', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, '加载中…')
                : node && node.error
                  ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-error', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, node.error)
                  : node && node.entries
                    ? node.entries.map((c) => renderNode(c, depth + 1))
                    : null)
              : null,
          )
        }
        return React.createElement('div', {
          role: 'button',
          tabIndex: 0,
          className: rowClass,
          style: pad,
          onClick: () => { if (props.onOpen) props.onOpen(entry.path) },
          onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (props.onOpen) props.onOpen(entry.path) } },
          title: entry.path,
        },
          FileCodeIcon(14),
          React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
          rowActions(entry),
        )
      }

      return React.createElement('div', { className: 'artifacts-tree' },
        React.createElement('div', { className: 'artifacts-tree-body' },
          !root
            ? React.createElement('div', { className: 'artifacts-hint' }, '加载文件树…')
            : (!root.entries || !root.entries.length)
              ? React.createElement('div', { className: 'artifacts-hint' }, '（空目录）')
              : root.entries.map((e) => renderNode(e, 0)),
        ),
      )
    }

    const ArtifactsPanel = () => {
      const open = useOpen()
      const settings = useSettings()
      const [tabs, setTabs] = React.useState([]) // open preview tabs { key, path, git, loading, ok, error, … }
      const [activeKey, setActiveKey] = React.useState(null)
      const [notice, setNotice] = React.useState('')
      const [gitFiles, setGitFiles] = React.useState(null) // null = loading
      const [gitError, setGitError] = React.useState(null)
      const [panelWidth, setPanelWidth] = React.useState(null) // null = use min
      const [resizing, setResizing] = React.useState(false)
      const [activeView, setActiveView] = React.useState(() => (settings.showFileTree ? 'tree' : 'git')) // 'tree' | 'git'
      const [treeRefresh, setTreeRefresh] = React.useState(0) // bumped by the header refresh button
      const [gitRefresh, setGitRefresh] = React.useState(0)
      const noticeTimer = React.useRef(null)

      // Git changed-but-uncommitted files, polled while the git view is visible.
      React.useEffect(() => {
        if (!open || activeView !== 'git') return
        let alive = true
        const load = () => {
          host.call('git.status', { sessionId: currentSessionId() }).then((res) => {
            if (!alive) return
            if (res && res.ok) {
              setGitFiles(Array.isArray(res.entries) ? res.entries : [])
              setGitError(null)
            } else {
              setGitFiles([])
              setGitError((res && res.error) || 'git status 失败')
            }
          }).catch((e) => {
            if (alive) setGitError(e && e.message ? String(e.message) : String(e))
          })
        }
        load()
        let dispose
        if (settings.autoRefresh) dispose = ctx.interval(load, 2000)
        return () => { alive = false; if (dispose) dispose() }
      }, [open, activeView, settings.autoRefresh, gitRefresh])

      // Publish the current session id to localStorage so the standalone
      // popout tab (which has no client session store) can root its file tree
      // at the active workspace and follow workspace switches in real time.
      React.useEffect(() => {
        const KEY = 'dsh-popout-sidebar:session'
        const write = () => {
          try {
            const sid = currentSessionId()
            if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || '')
          } catch (e) {}
        }
        write()
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(write)
      }, [])

      // Publish DSH's light/dark theme so the standalone popout tab matches
      // the app's appearance and follows live theme switches. DSH sets the
      // dark attribute on <body> (see the body[data-ds-dark-theme] rules in
      // styles), so check/observe both documentElement and body.
      React.useEffect(() => {
        const KEY = 'dsh-popout-sidebar:theme'
        const isDark = () => {
          if (document.documentElement.hasAttribute('data-ds-dark-theme')) return true
          if (document.body && document.body.hasAttribute('data-ds-dark-theme')) return true
          return false
        }
        const write = () => {
          try {
            const v = isDark() ? 'dark' : 'light'
            if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v)
          } catch (e) {}
        }
        write()
        if (typeof MutationObserver !== 'function') return
        const obs = new MutationObserver(write)
        const opts = { attributes: true, attributeFilter: ['data-ds-dark-theme'] }
        obs.observe(document.documentElement, opts)
        if (document.body) obs.observe(document.body, opts)
        return () => obs.disconnect()
      }, [])

      // Panel width (px): at least `minPanelWidth`% of the window, wider via
      // dragging the left edge. `panelWidth` holds the drag result (px); null →
      // use the configured minimum.
      const minWidthPx = Math.max(80, Math.round(window.innerWidth * (settings.minPanelWidth || 0) / 100))
      const widthPx = panelWidth != null ? Math.max(panelWidth, minWidthPx) : minWidthPx

      // Reserve layout space for the panel while open: shrink the app frame by
      // the panel's live width so the conversation column yields instead of
      // being covered (see the `html #root` rule in styles).
      React.useEffect(() => {
        const root = document.documentElement
        root.style.setProperty('--dsh-popout-sidebar-width', open ? widthPx + 'px' : '0px')
        return () => { root.style.setProperty('--dsh-popout-sidebar-width', '0px') }
      }, [open, widthPx])

      // Disable the layout transition while dragging so the frame tracks the
      // pointer instead of lagging (mirrors body[data-dsh-popout-dragging]).
      React.useEffect(() => {
        if (resizing) document.body.setAttribute('data-dsh-popout-dragging', '')
        else document.body.removeAttribute('data-dsh-popout-dragging')
        return () => { document.body.removeAttribute('data-dsh-popout-dragging') }
      }, [resizing])

      if (!open) return null

      const sid = currentSessionId()
      const popoutHref = '/popout-sidebar' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')

      const startResize = (e) => {
        e.preventDefault()
        setResizing(true)
        const rightOffset = (() => {
          const v = document.documentElement.style.getPropertyValue('--dsh-sidebar-width')
          const n = parseFloat(v)
          return Number.isFinite(n) ? n : 0
        })()
        const onMove = (ev) => {
          const w = window.innerWidth - ev.clientX - rightOffset
          setPanelWidth(Math.max(minWidthPx, Math.min(w, window.innerWidth - rightOffset - 24)))
        }
        const onUp = () => {
          setResizing(false)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      const flash = (msg) => {
        setNotice(msg)
        clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 1600)
      }
      const copyText = (text, msg) => {
        const done = () => flash(msg)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }
      const quotePath = (path) => {
        if (quoteToComposer(path)) { flash('已插入输入框'); return }
        copyText('@' + path, '已复制 @引用（未能写入输入框）')
      }

      // Multi-tab preview state helpers: each opened file (or git diff) gets a
      // tab keyed by its path (`g:` prefix distinguishes diff tabs).
      const patchTab = (key, patch) => setTabs((prev) => prev.map((t) => (t.key === key ? Object.assign({}, t, patch) : t)))

      const openTab = (key, path, git, initial) => {
        setTabs((prev) => {
          const i = prev.findIndex((t) => t.key === key)
          if (i >= 0) {
            // Reopening an open file just reloads it and focuses its tab.
            const next = prev.slice()
            next[i] = Object.assign({}, next[i], initial)
            return next
          }
          return prev.concat([Object.assign({ key: key, path: path, git: git }, initial)])
        })
        setActiveKey(key)
      }

      const closeTab = (key) => {
        const idx = tabs.findIndex((t) => t.key === key)
        const next = tabs.filter((t) => t.key !== key)
        setTabs(next)
        if (activeKey === key) setActiveKey(next.length ? next[Math.min(idx, next.length - 1)].key : null)
      }

      const activeTab = tabs.find((t) => t.key === activeKey) || null

      const openFile = (path, diff) => {
        const key = 'p:' + path
        const type = extType(path)
        // Images and PDFs are served as binary media — no text read needed.
        const initial = { loading: false, type: type, diff: diff || null }
        if (type !== 'image' && type !== 'pdf') initial.loading = true
        openTab(key, path, false, initial)
        if (type === 'image' || type === 'pdf') return
        host.call('artifacts.read', { path }).then((res) => {
          patchTab(key, Object.assign({ loading: false }, res))
        }).catch((e) => {
          patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) })
        })
      }

      // Open one changed file's uncommitted diff in the left-side overlay.
      const openGitDiff = (path) => {
        const key = 'g:' + path
        openTab(key, path, true, { loading: true })
        host.call('git.diff', { path, sessionId: currentSessionId() }).then((res) => {
          patchTab(key, Object.assign({ loading: false }, res))
        }).catch((e) => {
          patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) })
        })
      }

      // Status letter → display label for a changed file row.
      const gitLabel = (e) => {
        if (e.x === '?' || e.y === '?') return 'U'
        const c = e.y !== ' ' ? e.y : e.x
        return c || 'M'
      }
      const gitTitle = (e) => {
        const label = gitLabel(e)
        const map = { U: '未跟踪', A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制' }
        const staged = e.x !== ' ' && e.x !== '?'
        return (map[label] || label) + (staged ? '（已暂存）' : '（未暂存）')
      }

      const gitListChildren = []
      if (gitError) {
        gitListChildren.push(React.createElement('div', { key: 'err', className: 'artifacts-tree-error artifacts-git-error' }, gitError))
      } else if (gitFiles == null) {
        gitListChildren.push(React.createElement('div', { key: 'load', className: 'artifacts-empty' }, '加载变更列表…'))
      } else if (!gitFiles.length) {
        gitListChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, '没有未提交的变更'))
      }
      ;(gitFiles || []).forEach((e) => {
        const label = gitLabel(e)
        const isActive = !!(activeTab && activeTab.git && activeTab.path === e.path)
        gitListChildren.push(React.createElement('div', {
          key: e.path,
          className: 'artifacts-item' + (isActive ? ' is-active' : ''),
        },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-item-main',
            title: gitTitle(e),
            onClick: () => openGitDiff(e.path),
          },
            React.createElement('div', { className: 'artifacts-item-row' },
              React.createElement('span', { className: 'artifacts-git-badge artifacts-git-badge-' + label }, label),
              React.createElement('span', { className: 'artifacts-item-base' }, basename(e.path)),
              e.origPath ? React.createElement('span', { className: 'artifacts-git-orig' }, '← ' + basename(e.origPath)) : null,
            ),
            React.createElement('div', { className: 'artifacts-item-full' }, e.path),
          ),
          React.createElement('div', { className: 'artifacts-item-actions' },
            React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '复制路径', onClick: () => copyText(e.path, '已复制路径') }, '⧉'),
            React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '@引用到输入框', onClick: () => quotePath(e.path) }, '@'),
          ),
        ))
      })

      // Multi-tab preview overlay: each opened file becomes a tab; the active
      // tab's content covers the whole area LEFT of the sidebar panel.
      const previewOverlay = tabs.length ? React.createElement('div', {
        className: 'artifacts-preview-overlay',
        key: 'preview-overlay',
        role: 'region', 'aria-label': '文件预览',
      },
        React.createElement('div', { className: 'artifacts-preview-overlay-tabs' },
          tabs.map((t) => React.createElement('div', {
            key: t.key,
            className: 'artifacts-ptab' + (t.key === activeKey ? ' is-active' : ''),
            title: (t.git ? '[diff] ' : '') + (t.path || ''),
            onClick: () => setActiveKey(t.key),
          },
            React.createElement('span', { className: 'artifacts-ptab-name' }, basename(t.path || '')),
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-ptab-close',
              title: '关闭标签页',
              onClick: (e) => { e.stopPropagation(); closeTab(t.key) },
            }, '×'),
          )),
        ),
        activeTab ? renderPreview(activeTab) : null,
      ) : null

      return React.createElement(React.Fragment, null,
        previewOverlay,
        React.createElement('div', {
        className: 'artifacts-panel' + (resizing ? ' artifacts-resizing' : ''),
        style: { width: widthPx },
        role: 'dialog', 'aria-label': 'Artifacts',
      },
        React.createElement('div', {
          className: 'artifacts-resize',
          title: '拖动调整宽度',
          onMouseDown: startResize,
        }),
        React.createElement('div', { className: 'artifacts-head' },
          React.createElement('div', { className: 'artifacts-head-left' },
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-toggle',
              title: '收起侧边栏',
              onClick: () => store.setOpen(false),
            }, PanelIcon(16)),
            React.createElement('a', {
              className: 'artifacts-link',
              href: popoutHref,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: '弹出式侧边栏 — 在新标签页打开（可拖到另一块显示器）',
            }, PopoutIcon(16)),
          ),
          React.createElement('span', { className: 'artifacts-spacer' }),
          notice ? React.createElement('span', { className: 'artifacts-notice' }, notice) : null,
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-toggle',
            title: activeView === 'tree' ? '刷新文件树' : '刷新变更列表',
            onClick: () => { if (activeView === 'tree') setTreeRefresh((n) => n + 1); else setGitRefresh((n) => n + 1) },
          }, RefreshIcon(16)),
          settings.showFileTree ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-iconbtn artifacts-viewbtn' + (activeView === 'git' ? ' is-active' : ''),
            title: activeView === 'tree' ? '查看 Git 变更（未提交）' : '返回文件列表',
            'aria-pressed': activeView === 'git',
            onClick: () => setActiveView(activeView === 'tree' ? 'git' : 'tree'),
          }, activeView === 'tree' ? GitBranchIcon(16) : FolderClosedIcon(16)) : null,
        ),
        React.createElement('div', {
          className: 'artifacts-main',
        },
          React.createElement('div', {
            className: 'artifacts-body',
            style: { flex: '1 1 auto' },
          },
            (activeView === 'tree' && settings.showFileTree)
              ? React.createElement(FileTree, { onOpen: openFile, selectedPath: activeTab && !activeTab.git ? activeTab.path : null, refreshToken: treeRefresh })
              : gitListChildren,
          ),
        ),
        ),
      )
    }

    // Persistent trigger pinned to the top-right corner. Registered into the
    // root-scoped `shell.overlay` list so it stays visible with no conversation;
    // the fixed CSS position keeps it at the corner, offset left by the right
    // sidebar(s) so it never gets covered. Icon-only by design.
    const CornerButton = () => {
      const open = useOpen()
      if (open) return null
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-corner-btn',
        title: '弹出式侧边栏',
        'aria-expanded': open,
        onClick: () => store.toggle(),
      }, PanelIcon(18))
    }

    const SettingsToggle = (props) =>
      React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, props.label),
          React.createElement('div', { className: 'artifacts-setdesc' }, props.desc),
        ),
        React.createElement('label', { className: 'artifacts-switch' },
          React.createElement('input', {
            type: 'checkbox',
            checked: props.value,
            'aria-label': props.label,
            onChange: (e) => props.onToggle(e.currentTarget.checked),
          }),
          React.createElement('span', { className: 'artifacts-switch-track', 'aria-hidden': 'true' },
            React.createElement('span', { className: 'artifacts-switch-thumb' }),
          ),
        ),
      )

    const SettingsSection = () => {
      const settings = useSettings()
      const set = (key, value) => settingsStore.set(key, value)

      return React.createElement('div', { className: 'artifacts-settings' },
        React.createElement('p', { className: 'artifacts-setintro' }, '管理「Popout Sidebar」的显示与行为。'),
        React.createElement('div', { className: 'artifacts-setgroup' },
          React.createElement(SettingsToggle, {
            label: '默认展开',
            desc: '页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。',
            value: settings.defaultOpen,
            onToggle: (v) => set('defaultOpen', v),
          }),
          React.createElement(SettingsToggle, {
            label: '自动刷新',
            desc: '开启后侧边栏展开时将即时同步并更新产物列表',
            value: settings.autoRefresh,
            onToggle: (v) => set('autoRefresh', v),
          }),
          React.createElement(SettingsToggle, {
            label: '文件树',
            desc: '在侧边栏显示「文件树」标签页，浏览工作区目录。',
            value: settings.showFileTree,
            onToggle: (v) => set('showFileTree', v),
          }),
          React.createElement('div', { className: 'artifacts-setrow' },
            React.createElement('div', { className: 'artifacts-settext' },
              React.createElement('div', { className: 'artifacts-settitle' }, '最短面板宽度'),
              React.createElement('div', { className: 'artifacts-setdesc' }, '面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。'),
            ),
            React.createElement('div', { className: 'artifacts-setcontrol' },
              React.createElement('input', {
                type: 'number',
                className: 'artifacts-widthinput',
                min: 20,
                max: 60,
                value: settings.minPanelWidth,
                onChange: (e) => {
                  const n = parseInt(e.currentTarget.value, 10)
                  if (Number.isNaN(n)) return
                  set('minPanelWidth', Math.max(20, Math.min(60, n)))
                },
              }),
              React.createElement('span', { className: 'artifacts-suffix' }, '%'),
            ),
          ),
        ),
      )
    }

