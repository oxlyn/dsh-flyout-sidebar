    let artifacts = []
    let seq = 0
    let lastCwd // the most recently seen session working directory (workspace)

    const MIME = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
      pdf: 'application/pdf',
    }
    // Vendored pdf.js (Mozilla, Apache-2.0) — embedded by scripts/build.js and
    // served to the browser for the sidebar's custom PDF renderer. The standalone
    // popout tab keeps the browser's native viewer instead.
    const PDFJS_LIB = @@PDFJS_LIB@@
    const PDFJS_WORKER = @@PDFJS_WORKER@@
    // Shell executors whose filesystem side effects are NOT visible as a
    // `write`/`edit` result. Snapshot-diff the workspace around these tools so
    // files they create or overwrite (e.g. `python3 make_chart.py` emitting a
    // PNG) still land in the artifact list.
    const WATCH_TOOLS = { bash: 1, pwsh: 1 }
    // Directories never walked during a snapshot: VCS / cache / dependency
    // trees that are huge and never contain the artifacts the agent cares about.
    const SKIP_DIRS = new Set([
      'node_modules', 'venv', '.venv', 'env', '__pycache__', '.pytest_cache',
      '.mypy_cache', '.ruff_cache', '.tox', '.cache', '.next', '.nuxt',
      'dist', 'build', 'out', 'target', '.git', '.svn', '.hg', '.idea',
      '.vscode', '.dsh', '.workbuddy',
    ])
    const SNAPSHOT_MAX_FILES = 5000
    const SNAPSHOT_MAX_DEPTH = 16

    // Clip a diff snippet so the list payload stays bounded even when the
    // agent replaces a huge region in one edit.
    const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s)

    const snapshot = () => artifacts.slice().sort((a, b) => b.seq - a.seq)

    const recordFile = (path, kind, sessionId, diff) => {
      seq += 1
      const at = Date.now()
      const existing = artifacts.find((a) => a.path === path)
      if (existing) {
        existing.kind = kind
        existing.sessionId = sessionId
        existing.at = at
        existing.seq = seq
        existing.type = extType(path)
        if (diff) existing.diff = diff
      } else {
        const entry = { id: 'a' + seq, path: path, kind: kind, type: extType(path), sessionId: sessionId, at: at, seq: seq }
        if (diff) entry.diff = diff
        artifacts.push(entry)
        if (artifacts.length > 1000) artifacts = artifacts.slice(-1000)
      }
    }

    // Resolve the workspace root for a specific tool execution: the agent's
    // session cwd wins, then the last-seen cwd, then the sandbox root.
    const execCwd = (exec) => {
      try {
        const agent = exec && exec.agent
        const c = agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' ? agent.session.header.cwd : ''
        if (c) return c
      } catch (e) {}
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // Recursively walk the workspace into a `path -> fingerprint` map. The
    // fingerprint is the fs backend's opaque version token (dev:ino:size:
    // mtime:ctime on the local backend), so any content/metadata change changes
    // the value. Returns null when the filesystem or root is unavailable.
    const snapshotWorkspace = async (cwd) => {
      const fs = ctx.get('fs')
      if (!fs || typeof fs.listDir !== 'function' || typeof fs.resolve !== 'function') return null
      if (typeof cwd !== 'string' || !cwd) return null
      const childPath = (target, parent, name) => (typeof fs.processPath === 'function' ? fs.processPath(target) : parent.replace(/\/+$/, '') + '/' + name)
      const map = new Map()
      let count = 0
      const walk = async (dirPath, depth) => {
        if (count >= SNAPSHOT_MAX_FILES || depth > SNAPSHOT_MAX_DEPTH) return
        let entries
        try {
          const target = await fs.resolve(dirPath)
          entries = await fs.listDir(target)
        } catch (e) {
          return // unreadable directory — skip it, never fatal
        }
        if (!entries) return
        for (const e of entries) {
          if (count >= SNAPSHOT_MAX_FILES) return
          if (e.type === 'directory') {
            if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
            await walk(childPath(e.target, dirPath, e.name), depth + 1)
          } else if (e.type === 'file') {
            count += 1
            map.set(childPath(e.target, dirPath, e.name), e.version !== undefined ? String(e.version) : 'size:' + (e.size ?? ''))
          }
        }
      }
      await walk(cwd, 0)
      return map
    }

    // New or changed files between two snapshots (deletions are irrelevant to
    // an artifact list).
    const diffSnapshot = (before, after) => {
      const changes = []
      for (const [path, fp] of after) {
        const prev = before.get(path)
        if (prev === undefined) changes.push({ path, kind: 'create' })
        else if (prev !== fp) changes.push({ path, kind: 'edit' })
      }
      return changes
    }

    const recordSnapshotDiff = (before, after, exec) => {
      let sessionId
      try {
        const agent = exec && exec.agent
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
      } catch (e) {}
      const changes = diffSnapshot(before, after)
      for (const ch of changes) {
        try { recordFile(ch.path, ch.kind, sessionId, undefined) } catch (e) {}
      }
    }

    ctx.on('tools/result', (exec, result) => {
      try {
        if (!exec || !result || result.isError === true) return
        // Capture the session working directory on ANY successful tool result,
        // so the file tree roots at the real workspace (not the process cwd).
        const agent = exec.agent
        if (agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' && agent.session.header.cwd) {
          lastCwd = agent.session.header.cwd
        }
        const name = exec.name
        if (name !== 'write' && name !== 'edit') return
        const args = exec.arguments
        const path = args && typeof args.file_path === 'string' ? args.file_path : ''
        if (!path) return
        let sessionId
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
        let diff
        if (name === 'edit') {
          const oldString = args && typeof args.old_string === 'string' ? args.old_string : ''
          const newString = args && typeof args.new_string === 'string' ? args.new_string : ''
          if (oldString !== '' && oldString !== newString) {
            diff = { before: clip(oldString, 8000), after: clip(newString, 8000) }
          }
        }
        recordFile(path, name === 'write' ? 'create' : 'edit', sessionId, diff)
      } catch (e) {
        console.error('[artifacts] track failed', e)
      }
    })

    // Fill the gap the `tools/result` whitelist leaves open: `bash`/`pwsh` write
    // files as a side effect of the shell command, never through a `write`/`edit`
    // result. Snapshot the workspace before and after the body and record the
    // new/changed files. `tools/execute` is the around-dispatch wrapper, so
    // `next()` runs the body — the "before" is taken pre-body, "after" post-body.
    ctx.on('tools/execute', async (exec, next) => {
      if (!exec || !WATCH_TOOLS[exec.name]) return next()
      const cwd = execCwd(exec)
      const before = await snapshotWorkspace(cwd)
      let outcome
      try {
        outcome = await next()
        return outcome
      } finally {
        if (before && outcome && outcome.isError !== true) {
          try {
            const after = await snapshotWorkspace(cwd)
            if (after) recordSnapshotDiff(before, after, exec)
          } catch (e) {
            console.error('[artifacts] snapshot diff failed', e)
          }
        }
      }
    })

    const readFile = async (path) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      try {
        const policy = ctx.get('sandboxPolicy')
        const cwd = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
        const target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') return { ok: false, error: 'not a readable file' }
        const text = await fs.readText(target)
        const cap = 200000
        return { ok: true, type: extType(path), content: text.slice(0, cap), truncated: text.length > cap, size: info.size }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'read failed' }
      }
    }

    // Remove a single tracked artifact entry (metadata only — never touches the
    // file on disk).
    const removeFile = (path) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      const idx = artifacts.findIndex((a) => a.path === path)
      if (idx < 0) return { ok: false, error: 'not found' }
      artifacts.splice(idx, 1)
      return { ok: true }
    }

    // Resolve the authoritative working directory for a session (the real
    // workspace). The client passes its current session id; we look it up in the
    // live session store so the tree roots correctly even before any tool runs.
    const sessionCwd = (sessionId) => {
      try {
        const sessions = ctx.get('sessions')
        if (sessions && typeof sessions.get === 'function' && typeof sessionId === 'string' && sessionId) {
          const s = sessions.get(sessionId)
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          if (c) return c
        }
      } catch (e) {}
      return undefined
    }

    // When the client does not supply a session id (the standalone tab is a
    // separate page with no client store), pick the most recently created live
    // session's working directory.
    const defaultSessionCwd = async () => {
      try {
        const sessions = ctx.get('sessions')
        if (!sessions || typeof sessions.list !== 'function') return undefined
        const live = sessions.list()
        const cands = []
        for (let i = 0; i < live.length; i += 1) {
          const s = live[i]
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          const at = s && s.header && typeof s.header.createdAt === 'number' ? s.header.createdAt : 0
          if (c) cands.push({ cwd: c, at: at })
        }
        cands.sort((a, b) => b.at - a.at)
        const fs = ctx.get('fs')
        for (let i = 0; i < cands.length; i += 1) {
          const c = cands[i].cwd
          if (!fs || typeof fs.stat !== 'function' || typeof fs.resolve !== 'function') return c
          try {
            const target = await fs.resolve(c)
            const info = await fs.stat(target)
            if (info && info.type === 'directory') return c
          } catch (e) {
            // Directory missing (e.g. the workspace was renamed or deleted);
            // skip this stale candidate and fall through to the next one.
          }
        }
      } catch (e) {}
      return undefined
    }

    // Resolve the workspace root for a list request. A named session must
    // resolve to ITS OWN workspace: a freshly switched-to workspace may not be
    // live in the server's session store yet, so we also consult the persisted
    // corpus (sessionQuery) — and never substitute an unrelated "most recent"
    // workspace when the caller named a session. Only an unnamed request (the
    // standalone tab's first load, before its localStorage syncs) falls back to
    // a best-effort default.
    const resolveCwd = async (sessionId) => {
      const live = sessionCwd(sessionId)
      if (live) return live
      if (typeof sessionId === 'string' && sessionId) {
        try {
          const query = ctx.get('sessionQuery')
          if (query && typeof query.listSessions === 'function') {
            const records = await query.listSessions()
            if (records) {
              for (const rec of records) {
                const h = rec && rec.header
                if (h && h.id === sessionId && typeof h.cwd === 'string' && h.cwd) return h.cwd
              }
            }
          }
        } catch (e) {}
        return undefined // named but unresolvable — never substitute another workspace
      }
      const def = await defaultSessionCwd()
      if (def) return def
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // List one directory level for the file-tree (文件树) view: directories
    // first, then files, case-insensitive name order.
    const listDir = async (path, sessionId) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      try {
        const cwd = await resolveCwd(sessionId)
        let p = path
        if (typeof p !== 'string' || !p) {
          if (!cwd) return { ok: false, error: 'workspace unavailable' }
          p = cwd
        }
        const target = await fs.resolve(p, cwd ? { cwd: cwd } : undefined)
        const entries = await fs.listDir(target)
        const rows = entries
          .map((e) => ({
            name: e.name,
            path: typeof fs.processPath === 'function' ? fs.processPath(e.target) : p.replace(/\/+$/, '') + '/' + e.name,
            isDir: e.type === 'directory',
            hidden: e.name.startsWith('.'),
          }))
          .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : (a.isDir ? -1 : 1)))
        return { ok: true, path: p, entries: rows }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'list failed' }
      }
    }

    // ── Git changes (git 变更列表 / diff) ──────────────────────────────────
    // Changed-but-uncommitted files come from `git status --porcelain -z`; the
    // per-file diff from `git diff HEAD -- <path>` (covers staged + unstaged).
    // Untracked files have no git diff, so one is synthesized from the file
    // content so the client renders them like a new-file diff.
    // child_process is loaded lazily: the cordis loader evaluates this body
    // without a CommonJS `require`, so fall back to a dynamic import().
    let _cpPromise = null
    const getCp = () => {
      if (!_cpPromise) {
        _cpPromise = (async () => {
          try {
            if (typeof require === 'function') return require('child_process')
          } catch (e) {}
          try {
            const m = await import('node:child_process')
            return (m && m.default) || m
          } catch (e) {}
          return null
        })()
      }
      return _cpPromise
    }

    const runGit = async (args, cwd) => {
      const cp = await getCp()
      if (!cp || typeof cp.execFile !== 'function') return { ok: false, error: '无法执行 git（child_process 不可用）' }
      return new Promise((resolve) => {
        try {
          cp.execFile('git', args, { cwd: cwd, maxBuffer: 20 * 1024 * 1024, timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
            const out = String(stdout || '')
            if (err && !out) {
              resolve({ ok: false, error: (stderr && String(stderr).trim()) || (err && err.message) || 'git failed' })
              return
            }
            resolve({ ok: true, out: out })
          })
        } catch (e) {
          resolve({ ok: false, error: e && e.message ? String(e.message) : 'git failed' })
        }
      })
    }

    // Cached workspace roots: resolving a named-but-not-yet-live session can
    // scan the persisted corpus on every status poll, so memoize per session.
    // Entries are dropped when the cwd stops existing (workspace switched or
    // was renamed) so a stale root is never pinned.
    const cwdCache = new Map()
    const resolveCwdCached = async (sessionId) => {
      const key = sessionId || ''
      if (cwdCache.has(key)) {
        const c = cwdCache.get(key)
        try {
          const fs = ctx.get('fs')
          const info = fs && typeof fs.stat === 'function' && typeof fs.resolve === 'function'
            ? await fs.stat(await fs.resolve(c))
            : null
          if (info && info.type === 'directory') return c
        } catch (e) {}
        cwdCache.delete(key)
      }
      const c = await resolveCwd(sessionId)
      if (c) cwdCache.set(key, c)
      return c
    }

    // Status snapshot cache, per workspace (cwd). Once a workspace has been
    // fetched its snapshot serves requests instantly, with the real
    // `git status` re-run in the background (event-driven, debounced on tool
    // executions, plus a slow safety-poll). The FIRST request for a workspace
    // awaits the real status, so a click always shows THAT workspace's own
    // changes — never another workspace's stale/empty snapshot.
    const statusCache = new Map() // cwd -> { ok, error, entries, at }
    const statusInFlight = new Set()
    const statusTimers = new Map() // cwd -> pending debounce timer
    const STATUS_MIN_INTERVAL = 1500

    const gitStatusRemote = async (cwd) => {
      // Default (non-recursive) untracked mode: listing every file under
      // untracked directories dominated latency on large workspaces.
      const res = await runGit(['status', '--porcelain=v1', '-z'], cwd)
      if (!res.ok) return { ok: false, error: res.error, root: cwd }
      const entries = []
      const fields = String(res.out).split('\0').filter(Boolean)
      for (let i = 0; i < fields.length; i += 1) {
        const f = fields[i]
        if (f.length < 4) continue
        const x = f.charAt(0)
        const y = f.charAt(1)
        const path = f.slice(3)
        // With -z, a rename entry is followed by the original path as its own
        // NUL-separated record.
        let origPath = null
        if (x === 'R' || y === 'R') {
          const next = fields[i + 1]
          if (next != null && next.length >= 1 && !/^[MADRCU?][MDA?]/.test(next)) {
            origPath = next
            i += 1
          }
        }
        entries.push({ path: path, origPath: origPath, x: x, y: y })
      }
      return { ok: true, root: cwd, entries: entries }
    }

    const refreshStatus = async (cwd, force) => {
      if (!cwd || statusInFlight.has(cwd)) return
      const cached = statusCache.get(cwd)
      if (!force && cached && Date.now() - cached.at < STATUS_MIN_INTERVAL) return
      statusInFlight.add(cwd)
      try {
        const res = await gitStatusRemote(cwd)
        statusCache.set(cwd, { ok: res.ok, error: res.error || null, entries: res.entries || [], at: Date.now() })
      } catch (e) {
        statusCache.set(cwd, { ok: false, error: e && e.message ? String(e.message) : 'git failed', entries: [], at: Date.now() })
      } finally {
        statusInFlight.delete(cwd)
      }
    }

    // Schedule a debounced background refresh: bursty tool activity collapses
    // into one `git status` after the trailing edge (VSCode's watcher pattern,
    // minus the FS watcher).
    const scheduleStatusRefresh = (cwd) => {
      if (!cwd || statusTimers.has(cwd)) return
      statusTimers.set(cwd, setTimeout(() => {
        statusTimers.delete(cwd)
        refreshStatus(cwd, false)
      }, 700))
    }

    // A completed tool run may have touched that session's worktree — refresh
    // ITS workspace only.
    ctx.on('tools/result', (exec) => {
      try { scheduleStatusRefresh(execCwd(exec)) } catch (e) {}
    })

    // Safety poll for out-of-band edits (user editing in an IDE etc.) across
    // every workspace that has been viewed.
    ctx.interval(() => {
      for (const cwd of Array.from(statusCache.keys())) refreshStatus(cwd, false)
    }, 15000)

    const gitStatus = async (sessionId) => {
      const cwd = await resolveCwdCached(sessionId)
      if (!cwd) return { ok: false, error: 'workspace unavailable' }
      const cached = statusCache.get(cwd)
      if (cached) {
        // Stale-while-revalidate: answer instantly, refresh in the background.
        scheduleStatusRefresh(cwd)
        return { ok: cached.ok, error: cached.error, entries: cached.entries, root: cwd, cachedAt: cached.at }
      }
      await refreshStatus(cwd, true)
      const fresh = statusCache.get(cwd)
      return { ok: fresh.ok, error: fresh.error, entries: fresh.entries, root: cwd, cachedAt: fresh.at }
    }

    const gitDiff = async (path, sessionId) => {
      const cwd = await resolveCwdCached(sessionId)
      if (!cwd) return { ok: false, error: 'workspace unavailable' }
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      // `git diff HEAD` fails in a repo with no commits yet; fall back to the
      // staged diff there.
      const hasHead = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd)
      const base = hasHead.ok ? ['diff', 'HEAD', '-M', '--'] : ['diff', '--cached', '-M', '--']
      const r = await runGit(base.concat([path]), cwd)
      if (!r.ok) return { ok: false, error: r.error }
      if (r.out) return { ok: true, root: cwd, diff: r.out }
      // Empty diff but the file is listed as changed → untracked. Synthesize a
      // new-file diff from its current content.
      const read = await readFile(path)
      if (read.ok && typeof read.content === 'string') {
        const lines = read.content.split('\n')
        if (lines.length && lines[lines.length - 1] === '') lines.pop()
        const body = lines.map((l) => '+' + l).join('\n')
        return {
          ok: true, root: cwd,
          diff: 'diff --git a/' + path + ' b/' + path + '\nnew file mode 100644\n--- /dev/null\n+++ b/' + path +
            '\n@@ -0,0 +1,' + lines.length + ' @@\n' + body,
        }
      }
      return { ok: true, root: cwd, diff: '' }
    }

    // Package-private RPC (dynamic-plugin transport). Guarded so the same body
    // also runs as a static bundle (no `harness` global there); the static
    // client talks to the /popout-sidebar/* HTTP routes below instead.
    if (typeof harness !== 'undefined') {
      harness.handle('artifacts.list', () => ({ artifacts: snapshot() }))
      harness.handle('artifacts.remove', (args) => removeFile(args && args.path))
      harness.handle('artifacts.read', (args) => readFile(args && args.path))
      harness.handle('artifacts.listDir', (args) => listDir(args && args.path, args && args.sessionId))
      harness.handle('git.status', (args) => gitStatus(args && args.sessionId))
      harness.handle('git.diff', (args) => gitDiff(args && args.path, args && args.sessionId))
    }

