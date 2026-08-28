/**
 * Host 侧：产物（artifacts）跟踪。
 *
 * 记录 agent 写入/编辑的文件，并给 shell 类工具做前后工作区快照 diff，兜住
 * 不经过 write/edit 的文件副作用（如 `python3 make_chart.py` 产出 PNG）。
 */
import { extType } from '../shared/ext.js'
import type { DshFs, HostContext, ToolExec, ToolResult } from './types'
import { execCwd, headerCwd, noteSessionCwd } from './workspace'

export interface ArtifactDiff {
  before: string
  after: string
}

export interface ArtifactEntry {
  id: string
  path: string
  kind: string
  type: string
  sessionId?: string
  at: number
  seq: number
  diff?: ArtifactDiff
}

let artifacts: ArtifactEntry[] = []
let seq = 0

/** 按新→旧排序的产物列表（JSON 路由 / harness RPC 共用） */
export function snapshotArtifacts(): ArtifactEntry[] {
  return artifacts.slice().sort((a, b) => b.seq - a.seq)
}

/** diff 片段截断：单次替换超大区域时列表载荷仍保持有界 */
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '\n…' : s
}

function recordFile(path: string, kind: string, sessionId: string | undefined, diff?: ArtifactDiff): void {
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
    const entry: ArtifactEntry = { id: 'a' + seq, path, kind, type: extType(path), sessionId, at, seq }
    if (diff) entry.diff = diff
    artifacts.push(entry)
    if (artifacts.length > 1000) artifacts = artifacts.slice(-1000)
  }
}

/** 移除单条产物记录（仅元数据，从不触碰磁盘文件） */
export function removeFile(path: unknown): { ok: boolean; error?: string } {
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  const idx = artifacts.findIndex((a) => a.path === path)
  if (idx < 0) return { ok: false, error: 'not found' }
  artifacts.splice(idx, 1)
  return { ok: true }
}

/** 快照期间永不进入的目录：VCS / 缓存 / 依赖树，巨大且不含 agent 关心的产物 */
const SKIP_DIRS = new Set([
  'node_modules', 'venv', '.venv', 'env', '__pycache__', '.pytest_cache',
  '.mypy_cache', '.ruff_cache', '.tox', '.cache', '.next', '.nuxt',
  'dist', 'build', 'out', 'target', '.git', '.svn', '.hg', '.idea',
  '.vscode', '.dsh', '.workbuddy',
])
const SNAPSHOT_MAX_FILES = 5000
const SNAPSHOT_MAX_DEPTH = 16

/**
 * 递归走查工作区，产出 `path -> 指纹` 映射。指纹用 fs 后端的版本令牌（本地
 * 后端为 dev:ino:size:mtime:ctime），任何内容/元数据变化都会改变它。fs 或根
 * 目录不可用时返回 null。
 */
async function snapshotWorkspace(ctx: HostContext, cwd: string | undefined): Promise<Map<string, string> | null> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs || typeof fs.listDir !== 'function' || typeof fs.resolve !== 'function') return null
  if (typeof cwd !== 'string' || !cwd) return null
  const childPath = (target: unknown, parent: string, name: string): string =>
    typeof fs.processPath === 'function' ? fs.processPath(target) : parent.replace(/\/+$/, '') + '/' + name
  const map = new Map<string, string>()
  let count = 0
  const walk = async (dirPath: string, depth: number): Promise<void> => {
    if (count >= SNAPSHOT_MAX_FILES || depth > SNAPSHOT_MAX_DEPTH) return
    let entries
    try {
      const target = await fs.resolve(dirPath)
      entries = await fs.listDir(target)
    } catch {
      return // 不可读目录 —— 跳过，永不致命
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

/** 两次快照间新增/变化的文件（产物列表不关心删除） */
function diffSnapshots(before: Map<string, string>, after: Map<string, string>): Array<{ path: string; kind: string }> {
  const changes: Array<{ path: string; kind: string }> = []
  for (const [path, fp] of after) {
    const prev = before.get(path)
    if (prev === undefined) changes.push({ path, kind: 'create' })
    else if (prev !== fp) changes.push({ path, kind: 'edit' })
  }
  return changes
}

function recordSnapshotDiff(
  before: Map<string, string>,
  after: Map<string, string>,
  exec: ToolExec | undefined,
): void {
  let sessionId: string | undefined
  const id = exec?.agent?.session?.id
  if (id != null) sessionId = String(id)
  for (const ch of diffSnapshots(before, after)) {
    try {
      recordFile(ch.path, ch.kind, sessionId)
    } catch {
      // 单条记录失败不影响其余
    }
  }
}

/**
 * shell 类执行器：其文件副作用不会以 write/edit 结果出现。在工具体前后对
 * 工作区做快照 diff，把新建/覆盖的文件记入产物列表。tools/execute 是分发
 * 外层的 around 钩子，next() 即工具体 —— "前"取自体前，"后"取自体后。
 */
export function attachArtifactTracking(ctx: HostContext): void {
  ctx.on('tools/result', (exec, result) => {
    try {
      if (!exec || !result || result.isError === true) return
      // 任意成功的工具结果都刷新会话工作目录，文件树才能根植真实工作区
      const cwd = headerCwd(exec.agent?.session?.header)
      if (cwd) noteSessionCwd(cwd)
      const name = exec.name
      if (name !== 'write' && name !== 'edit') return
      const args = exec.arguments
      const path = typeof args?.file_path === 'string' ? args.file_path : ''
      if (!path) return
      let sessionId: string | undefined
      const id = exec.agent?.session?.id
      if (id != null) sessionId = String(id)
      let diff: ArtifactDiff | undefined
      if (name === 'edit') {
        const oldString = typeof args?.old_string === 'string' ? args.old_string : ''
        const newString = typeof args?.new_string === 'string' ? args.new_string : ''
        if (oldString !== '' && oldString !== newString) {
          diff = { before: clip(oldString, 8000), after: clip(newString, 8000) }
        }
      }
      recordFile(path, name === 'write' ? 'create' : 'edit', sessionId, diff)
    } catch (e) {
      console.error('[artifacts] track failed', e)
    }
  })

  ctx.on('tools/execute', async (exec, next) => {
    if (!exec || !WATCH_TOOLS[exec.name || '']) return next()
    const cwd = execCwd(ctx, exec)
    const before = await snapshotWorkspace(ctx, cwd)
    let outcome: ToolResult | undefined
    try {
      outcome = await next()
      return outcome
    } finally {
      if (before && outcome && outcome.isError !== true) {
        try {
          const after = await snapshotWorkspace(ctx, cwd)
          if (after) recordSnapshotDiff(before, after, exec)
        } catch (e) {
          console.error('[artifacts] snapshot diff failed', e)
        }
      }
    }
  })
}

/** 有文件副作用的 shell 执行器 */
const WATCH_TOOLS: Record<string, number> = { bash: 1, pwsh: 1 }
