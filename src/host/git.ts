/**
 * Host 侧：Git 变更（变更列表 / diff）。
 *
 * 未提交变更来自 `git status --porcelain=v1 -z`；单文件 diff 来自
 * `git diff HEAD -- <path>`（覆盖已暂存 + 未暂存）。未跟踪文件没有 git diff，
 * 用文件内容合成一份 new-file diff，让客户端按新增文件渲染。
 */
import { execFile } from 'node:child_process'
import type { HostContext, ToolExec } from './types'
import { readFile } from './files'
import { execCwd, resolveCwdCached } from './workspace'

export interface GitStatusEntry {
  path: string
  origPath: string | null
  x: string
  y: string
}

export interface GitStatusResult {
  ok: boolean
  error?: string
  root?: string
  entries?: GitStatusEntry[]
  cachedAt?: number
}

export interface GitDiffResult {
  ok: boolean
  error?: string
  root?: string
  diff?: string
}

interface StatusCache {
  ok: boolean
  error: string | null
  entries: GitStatusEntry[]
  at: number
}

/** 执行 git 子命令；files.ts 的文件搜索复用（git ls-files） */
export function runGit(args: string[], cwd: string | undefined): Promise<{ ok: boolean; out?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
        const out = String(stdout || '')
        if (err && !out) {
          resolve({ ok: false, error: (stderr && String(stderr).trim()) || (err && err.message) || 'git failed' })
          return
        }
        resolve({ ok: true, out })
      })
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error && e.message ? e.message : 'git failed' })
    }
  })
}

/** 首次同步等待真实结果，之后即时响应 + 后台刷新（stale-while-revalidate） */
const statusCache = new Map<string, StatusCache>()
const statusInFlight = new Set<string>()
const statusTimers = new Map<string, ReturnType<typeof setTimeout>>()
const STATUS_MIN_INTERVAL = 1500

async function gitStatusRemote(cwd: string): Promise<{ ok: boolean; error?: string; entries?: GitStatusEntry[] }> {
  // 默认（非递归）untracked 模式：在大工作区上枚举未跟踪目录里的每个文件
  // 曾是延迟的大头。
  const res = await runGit(['status', '--porcelain=v1', '-z'], cwd)
  if (!res.ok) return { ok: false, error: res.error }
  const entries: GitStatusEntry[] = []
  const fields = String(res.out).split('\0').filter(Boolean)
  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i] || ''
    if (f.length < 4) continue
    const x = f.charAt(0)
    const y = f.charAt(1)
    const path = f.slice(3)
    // -z 模式下 rename 条目后跟一个独立的 NUL 分隔记录，即原路径。
    let origPath: string | null = null
    if (x === 'R' || y === 'R') {
      const next = fields[i + 1]
      if (next != null && next.length >= 1 && !/^[MADRCU?][MDA?]/.test(next)) {
        origPath = next
        i += 1
      }
    }
    entries.push({ path, origPath, x, y })
  }
  return { ok: true, entries }
}

async function refreshStatus(cwd: string, force: boolean): Promise<void> {
  if (!cwd || statusInFlight.has(cwd)) return
  const cached = statusCache.get(cwd)
  if (!force && cached && Date.now() - cached.at < STATUS_MIN_INTERVAL) return
  statusInFlight.add(cwd)
  try {
    const res = await gitStatusRemote(cwd)
    statusCache.set(cwd, { ok: res.ok, error: res.error || null, entries: res.entries || [], at: Date.now() })
  } catch (e) {
    statusCache.set(cwd, { ok: false, error: e instanceof Error && e.message ? e.message : 'git failed', entries: [], at: Date.now() })
  } finally {
    statusInFlight.delete(cwd)
  }
}

/** 去抖的后台刷新：密集的工具活动合并为尾沿后的一次 `git status` */
function scheduleStatusRefresh(cwd: string | undefined): void {
  if (!cwd || statusTimers.has(cwd)) return
  const t = setTimeout(() => {
    statusTimers.delete(cwd)
    void refreshStatus(cwd, false)
  }, 700)
  statusTimers.set(cwd, t)
}

/** 事件挂载：工具完成 → 去抖刷新该工作区；15s 兜底轮询覆盖 IDE 等带外修改 */
export function attachGitTracking(ctx: HostContext): void {
  ctx.on('tools/result', (exec: ToolExec) => {
    try {
      scheduleStatusRefresh(execCwd(ctx, exec))
    } catch {
      // 刷新失败不影响主流程
    }
  })

  ctx.interval(() => {
    for (const cwd of Array.from(statusCache.keys())) void refreshStatus(cwd, false)
  }, 15000)
}

export async function gitStatus(ctx: HostContext, sessionId?: string, opts?: { force?: boolean }): Promise<GitStatusResult> {
  const cwd = await resolveCwdCached(ctx, sessionId)
  if (!cwd) return { ok: false, error: 'workspace unavailable' }
  // 用户点「刷新」时绕过 stale-while-revalidate，同步取一次真实状态。
  if (opts?.force) {
    await refreshStatus(cwd, true)
    const fresh = statusCache.get(cwd)
    if (!fresh) return { ok: false, error: 'git status 失败', root: cwd }
    return { ok: fresh.ok, error: fresh.error || undefined, entries: fresh.entries, root: cwd, cachedAt: fresh.at }
  }
  const cached = statusCache.get(cwd)
  if (cached) {
    // stale-while-revalidate：即时应答，后台刷新。
    scheduleStatusRefresh(cwd)
    return { ok: cached.ok, error: cached.error || undefined, entries: cached.entries, root: cwd, cachedAt: cached.at }
  }
  await refreshStatus(cwd, true)
  const fresh = statusCache.get(cwd)
  if (!fresh) return { ok: false, error: 'git status 失败', root: cwd }
  return { ok: fresh.ok, error: fresh.error || undefined, entries: fresh.entries, root: cwd, cachedAt: fresh.at }
}

export async function gitDiff(ctx: HostContext, path: unknown, sessionId?: string): Promise<GitDiffResult> {
  const cwd = await resolveCwdCached(ctx, sessionId)
  if (!cwd) return { ok: false, error: 'workspace unavailable' }
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  // 尚无提交的仓库里 `git diff HEAD` 会失败；此时回退到已暂存 diff。
  const hasHead = await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd)
  const base = hasHead.ok ? ['diff', 'HEAD', '-M', '--'] : ['diff', '--cached', '-M', '--']
  const r = await runGit(base.concat([path]), cwd)
  if (!r.ok) return { ok: false, error: r.error }
  if (r.out) return { ok: true, root: cwd, diff: r.out }
  // diff 为空但文件在变更列表里 → 未跟踪。用当前内容合成 new-file diff。
  const read = await readFile(ctx, path)
  if (read.ok && typeof read.content === 'string') {
    const lines = read.content.split('\n')
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    const body = lines.map((l) => '+' + l).join('\n')
    return {
      ok: true,
      root: cwd,
      diff:
        'diff --git a/' + path + ' b/' + path + '\nnew file mode 100644\n--- /dev/null\n+++ b/' + path +
        '\n@@ -0,0 +1,' + lines.length + ' @@\n' + body,
    }
  }
  return { ok: true, root: cwd, diff: '' }
}
