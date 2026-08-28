/**
 * Host 侧：工作区（workspace / cwd）解析。
 *
 * 会话 → 工作目录 的权威解析逻辑：优先活动会话自身的 cwd，其次持久化会话库，
 * 未指名会话时回退到「最近的会话 / 最后见到的 cwd / 沙箱根」。
 */
import type { DshFs, DshSessions, HostContext, SessionHeader, ToolExec } from './types'

/** 最近一次见到的会话工作目录（任意成功的工具结果都会刷新它） */
let lastCwd: string | undefined

export function noteSessionCwd(cwd: string): void {
  lastCwd = cwd
}

/** 会话头里可用的 cwd */
export function headerCwd(header: SessionHeader | undefined | null): string | undefined {
  const c = header?.cwd
  return typeof c === 'string' && c ? c : undefined
}

/** 解析一次工具执行对应的工作区：会话 cwd 优先，然后 lastCwd，再沙箱根 */
export function execCwd(ctx: HostContext, exec: ToolExec | undefined | null): string | undefined {
  const c = headerCwd(exec?.agent?.session?.header)
  if (c) return c
  if (lastCwd) return lastCwd
  try {
    const policy = ctx.get('sandboxPolicy')
    const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
    return typeof root === 'string' && root ? root : undefined
  } catch {
    return undefined
  }
}

/** 活动会话库中指定会话的 cwd（不查持久化库） */
function sessionCwd(ctx: HostContext, sessionId: string | undefined): string | undefined {
  try {
    if (typeof sessionId === 'string' && sessionId) {
      const store = ctx.get('sessions') as { get?: (id: string) => { header?: SessionHeader } | undefined } | undefined
      const s = store && typeof store.get === 'function' ? store.get(sessionId) : undefined
      return headerCwd(s?.header)
    }
  } catch {
    // 会话库不可用时按未解析处理
  }
  return undefined
}

/** 未指名会话时：取最近创建且目录仍存在的活动会话 cwd */
async function defaultSessionCwd(ctx: HostContext): Promise<string | undefined> {
  try {
    const sessions = ctx.get('sessions') as DshSessions | undefined
    if (!sessions || typeof sessions.list !== 'function') return undefined
    const fs = ctx.get<DshFs>('fs')
    const cands: Array<{ cwd: string; at: number }> = []
    for (const s of sessions.list()) {
      const cwd = headerCwd(s?.header)
      const at = s?.header?.createdAt
      if (cwd) cands.push({ cwd, at: typeof at === 'number' ? at : 0 })
    }
    cands.sort((a, b) => b.at - a.at)
    for (const { cwd } of cands) {
      if (!fs || typeof fs.stat !== 'function' || typeof fs.resolve !== 'function') return cwd
      try {
        const info = await fs.stat(await fs.resolve(cwd))
        if (info && info.type === 'directory') return cwd
      } catch {
        // 目录已不存在（工作区被改名/删除）：跳过陈旧候选
      }
    }
  } catch {
    // 同上，按未解析处理
  }
  return undefined
}

/**
 * 解析 list/status/diff 请求的工作区根。指名了 sessionId 就必须解析到它自己
 * 的工作区：刚切换的工作区可能尚未进入服务端活动会话库，因此还要查持久化
 * 会话库（sessionQuery），且绝不拿别的「最近工作区」顶替；只有未指名会话
 * （独立标签页首载，localStorage 尚未同步）才走 best-effort 默认值。
 */
export async function resolveCwd(ctx: HostContext, sessionId?: string): Promise<string | undefined> {
  const live = sessionCwd(ctx, sessionId)
  if (live) return live
  if (typeof sessionId === 'string' && sessionId) {
    try {
      const query = ctx.get('sessionQuery')
      if (query && typeof (query as { listSessions?: unknown }).listSessions === 'function') {
        const records = await (query as { listSessions: () => Promise<Array<{ header?: { id?: unknown; cwd?: string } }> | null | undefined> }).listSessions()
        if (records) {
          for (const rec of records) {
            const h = rec?.header
            if (h && h.id === sessionId && typeof h.cwd === 'string' && h.cwd) return h.cwd
          }
        }
      }
    } catch {
      // 持久化库不可用时按未解析处理
    }
    return undefined // 指名了但解析不到 —— 绝不顶替别的工作区
  }
  const def = await defaultSessionCwd(ctx)
  if (def) return def
  if (lastCwd) return lastCwd
  try {
    const policy = ctx.get('sandboxPolicy')
    const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
    return typeof root === 'string' && root ? root : undefined
  } catch {
    return undefined
  }
}

/**
 * 带缓存的工作区解析：指名但尚未活动的会话每次状态轮询都可能扫描持久化库，
 * 按会话 memoize。cwd 不再存在（工作区已切换或被改名）时丢弃缓存，绝不钉死
 * 陈旧根目录。
 */
const cwdCache = new Map<string, string>()

export async function resolveCwdCached(ctx: HostContext, sessionId?: string): Promise<string | undefined> {
  const key = sessionId || ''
  if (cwdCache.has(key)) {
    const c = cwdCache.get(key)
    if (c) {
      try {
        const fs = ctx.get<DshFs>('fs')
        const info =
          fs && typeof fs.stat === 'function' && typeof fs.resolve === 'function'
            ? await fs.stat(await fs.resolve(c))
            : null
        if (info && info.type === 'directory') return c
      } catch {
        // 校验失败则丢弃缓存重新解析
      }
      cwdCache.delete(key)
    }
  }
  const c = await resolveCwd(ctx, sessionId)
  if (c) cwdCache.set(key, c)
  return c
}
