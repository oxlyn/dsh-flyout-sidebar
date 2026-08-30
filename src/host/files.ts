/**
 * Host 侧：文件读取与目录列举（文件树 / 代码预览的后端）+ 文件名搜索。
 */
import { extType } from '../shared/ext.js'
import type { DshFs, HostContext } from './types'
import { resolveCwd, resolveCwdCached } from './workspace'
import { runGit } from './git'

/**
 * 解析读取/打开类操作的工作区根：指名会话时优先解析其工作区（独立弹出页与
 * 主面板都可能处于非沙箱根的工作区），解析不到或未指名时回退沙箱根。
 */
export async function resolveWorkspaceCwd(ctx: HostContext, sessionId?: string): Promise<string | undefined> {
  if (typeof sessionId === 'string' && sessionId) {
    const c = await resolveCwdCached(ctx, sessionId)
    if (c) return c
  }
  try {
    const policy = ctx.get('sandboxPolicy')
    const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
    return typeof root === 'string' && root ? root : undefined
  } catch {
    return undefined
  }
}

/**
 * 纵深防御：校验 resolve 结果是否位于工作区根之内。不同 fs 后端的句柄形态
 * 不一致（沙箱映射/虚拟路径可能不带 cwd 字面前缀），而 fs.resolve 本身以
 * cwd 锚定 —— 因此形态落在工作区外时只记日志放行（fail-open），避免误伤
 * 合法路径把文件树卡死；真正的越界拦截依赖 DSH fs 层的锚定语义。
 */
export function isWithinWorkspace(fs: DshFs | undefined, target: unknown, cwd: string | undefined): boolean {
  if (!cwd) return true
  const norm = (p: unknown): string =>
    String(typeof fs?.processPath === 'function' ? fs.processPath(p) : p).replace(/\\/g, '/').replace(/\/+$/, '')
  const root = norm(cwd)
  if (!root) return true
  const forms = new Set([String(target), norm(target)])
  for (const t of forms) {
    if (t === root || t.startsWith(root + '/')) return true
  }
  console.warn('[flyout-sidebar] resolved path outside workspace root, allowing (fs backend anchoring trusted):', forms, 'root:', root)
  return true
}

export interface ReadResult {
  ok: boolean
  error?: string
  type?: string
  content?: string
  truncated?: boolean
  size?: number
}

export interface ListResult {
  ok: boolean
  error?: string
  path?: string
  entries?: Array<{ name: string; path: string; isDir: boolean; hidden: boolean }>
}

/** 文本内容读取（代码预览）。超长内容截断并打标。cwdHint 允许调用方直传
 * 已解析的工作区根（gitDiff 合成未跟踪 diff 时复用，避免二次解析落到别的工作区）。 */
export async function readFile(ctx: HostContext, path: unknown, sessionId?: string, cwdHint?: string): Promise<ReadResult> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return { ok: false, error: 'filesystem unavailable' }
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  try {
    const cwd = cwdHint ?? (await resolveWorkspaceCwd(ctx, sessionId))
    const target = await fs.resolve(path, cwd ? { cwd } : undefined)
    if (!isWithinWorkspace(fs, target, cwd)) return { ok: false, error: 'path outside workspace' }
    const info = await fs.stat(target)
    if (!info || info.type !== 'file') return { ok: false, error: 'not a readable file' }
    const cap = 200000
    // 截断上限的字节上界（UTF-8 每字符最多 4 字节）。大文件只从后端读需要的
    // 字节再解码 —— readText 会把整个文件读进内存，GB 级日志会打爆进程。
    const capBytes = cap * 4
    let text: string
    if (typeof info.size === 'number' && info.size > capBytes) {
      const bytes = await fs.readBytes(target, undefined, capBytes)
      text = new TextDecoder().decode(new Uint8Array(bytes))
      // 字节截断可能切在 UTF-8 多字节序列中间，解码尾部出现替换符：剥掉，
      // 避免预览末尾挂一个乱码字符（真实 U+FFFD 内容丢失可忽略）。
      while (text.length && text.charCodeAt(text.length - 1) === 0xfffd) text = text.slice(0, -1)
    } else {
      text = await fs.readText(target)
    }
    return { ok: true, type: extType(path), content: text.slice(0, cap), truncated: (typeof info.size === 'number' && info.size > capBytes) || text.length > cap, size: info.size }
  } catch (e) {
    return { ok: false, error: e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'read failed' }
  }
}

/** 文件树（文件树视图）单层目录列举：目录优先，再按名称不区分大小写排序 */
export async function listDir(ctx: HostContext, path: unknown, sessionId?: string): Promise<ListResult> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return { ok: false, error: 'filesystem unavailable' }
  try {
    const cwd = await resolveCwd(ctx, sessionId)
    let p: string
    if (typeof path === 'string' && path) {
      p = path
    } else if (cwd) {
      p = cwd
    } else {
      return { ok: false, error: 'workspace unavailable' }
    }
    const target = await fs.resolve(p, cwd ? { cwd } : undefined)
    if (!isWithinWorkspace(fs, target, cwd)) return { ok: false, error: 'path outside workspace' }
    const entries = await fs.listDir(target)
    const rows = (entries || [])
      .map((e) => ({
        name: e.name,
        path: typeof fs.processPath === 'function' ? fs.processPath(e.target) : p.replace(/\/+$/, '') + '/' + e.name,
        isDir: e.type === 'directory',
        hidden: e.name.startsWith('.'),
      }))
      .sort((a, b) =>
        a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.isDir ? -1 : 1,
      )
    return { ok: true, path: p, entries: rows }
  } catch (e) {
    return { ok: false, error: e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'list failed' }
  }
}

export interface SearchResult {
  ok: boolean
  error?: string
  query?: string
  entries?: string[]
}

/** 单次搜索返回的路径数上限，防止超大仓库刷爆响应 */
const SEARCH_MAX = 200
const SEARCH_WALK_MAX_FILES = 20000
const SEARCH_WALK_MAX_DEPTH = 12

/** git 不可用时的回退：有界文件系统遍历（跳过依赖/缓存目录与点前缀目录） */
async function walkFileNames(ctx: HostContext, root: string): Promise<string[]> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return []
  const SKIP = new Set([
    'node_modules', 'venv', '.venv', 'env', '__pycache__', 'dist', 'build', 'out',
    'target', '.git', '.svn', '.hg', '.next', '.cache', '.tox', '.idea', '.vscode',
  ])
  const out: string[] = []
  let count = 0
  const walk = async (dirPath: string, depth: number): Promise<void> => {
    if (count >= SEARCH_WALK_MAX_FILES || depth > SEARCH_WALK_MAX_DEPTH) return
    let entries
    try {
      entries = await fs.listDir(await fs.resolve(dirPath))
    } catch {
      return
    }
    if (!entries) return
    for (const e of entries) {
      if (count >= SEARCH_WALK_MAX_FILES) return
      const child = dirPath.replace(/\/+$/, '') + '/' + e.name
      if (e.type === 'directory') {
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue
        await walk(child, depth + 1)
      } else {
        count += 1
        out.push(child)
      }
    }
  }
  await walk(root, 0)
  return out
}

/**
 * 文件名搜索（文件树搜索框的后端）：子串不区分大小写匹配。优先
 * `git ls-files --cached --others --exclude-standard`（快、尊重 gitignore、
 * 含未跟踪文件）；git 不可用时回退有界 fs 遍历。路径按字典序返回。
 */
export async function searchFiles(ctx: HostContext, query: unknown, sessionId?: string): Promise<SearchResult> {
  const q = typeof query === 'string' ? query.trim() : ''
  if (!q) return { ok: true, query: '', entries: [] }
  try {
    const cwd = await resolveCwd(ctx, sessionId)
    if (!cwd) return { ok: false, error: 'workspace unavailable' }
    // -z：NUL 分隔输出，git 不会对含引号/非 ASCII 字符的路径做 C 风格转义
    const git = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd)
    const all = git.ok && git.out != null ? git.out.split('\0') : await walkFileNames(ctx, cwd)
    // 统一返回相对工作区根的路径（walk 回退产出绝对路径）
    const prefix = cwd.replace(/\/+$/, '') + '/'
    const lower = q.toLowerCase()
    const entries = all
      .map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p))
      .filter((p) => p && p.toLowerCase().includes(lower))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .slice(0, SEARCH_MAX)
    return { ok: true, query: q, entries }
  } catch (e) {
    return { ok: false, error: e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'search failed' }
  }
}
