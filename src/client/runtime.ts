/**
 * Client 侧：客户端上下文（ctx）与 host RPC 桥。
 *
 * ctx 由入口 apply 注入（initClient），host 桥是纯 fetch 的静态映射 ——
 * 与 host 侧 /flyout-sidebar/* 路由一一对应。
 */

/** 客户端插件上下文（cordis client 注入的最小面） */
export interface ClientContext {
  get<T = unknown>(id: string): T | undefined
  /** 由注入的 `timer` 服务提供：周期回调，返回注销函数 */
  interval(fn: () => void, ms: number): () => void
}

export interface SessionListLike {
  getSnapshot?: () => { current?: unknown; active?: unknown } | undefined
  subscribe?: (fn: () => void) => () => void
}

export let ctx: ClientContext

export function initClient(context: ClientContext): void {
  ctx = context
}

export interface GitStatusEntry {
  path: string
  origPath: string | null
  x: string
  y: string
  /** 相对 HEAD 的行增删数（未跟踪文件为合成新文件的行数）；统计不可用时缺省 */
  adds?: number
  dels?: number
}

export interface GitStatusResponse {
  ok: boolean
  error?: string
  root?: string
  entries?: GitStatusEntry[]
  cachedAt?: number
}

export interface GitDiffResponse {
  ok: boolean
  error?: string
  root?: string
  diff?: string
}

export interface ReadResponse {
  ok: boolean
  error?: string
  type?: string
  content?: string
  truncated?: boolean
  size?: number
}

export interface SearchResponse {
  ok: boolean
  error?: string
  query?: string
  entries?: string[]
}

export interface ListEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
}

export interface ListDirResponse {
  ok: boolean
  error?: string
  path?: string
  entries?: ListEntry[]
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  return res.json()
}

/** 组装查询串：空值参数不下发（与旧版 URL 形态一致） */
function qs(...pairs: Array<[string, string]>): string {
  const q = pairs.filter(([, v]) => v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v))
  return q.length ? '?' + q.join('&') : ''
}

/** host RPC 桥：与 host 侧 /flyout-sidebar/* 路由一一对应 */
export const host = {
  gitStatus(sessionId: string, force?: boolean): Promise<GitStatusResponse> {
    return getJson('/flyout-sidebar/gitstatus' + qs(['sessionId', sessionId], ['force', force ? '1' : ''])) as Promise<GitStatusResponse>
  },
  gitDiff(path: string, sessionId: string): Promise<GitDiffResponse> {
    return getJson('/flyout-sidebar/gitdiff' + qs(['path', path], ['sessionId', sessionId])) as Promise<GitDiffResponse>
  },
  readArtifact(path: string): Promise<ReadResponse> {
    return getJson('/flyout-sidebar/content' + qs(['path', path])) as Promise<ReadResponse>
  },
  listDir(path: string, sessionId: string): Promise<ListDirResponse> {
    return getJson('/flyout-sidebar/listdir' + qs(['path', path], ['sessionId', sessionId])) as Promise<ListDirResponse>
  },
  searchFiles(query: string, sessionId: string): Promise<SearchResponse> {
    return getJson('/flyout-sidebar/search' + qs(['q', query], ['sessionId', sessionId])) as Promise<SearchResponse>
  },
}
