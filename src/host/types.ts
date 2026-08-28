/**
 * Host 侧类型：对 DSH（Cordis）注入服务的最小结构描述。
 *
 * 只刻画插件实际用到的面；未知字段一律通过 `unknown` / 可选属性表达，
 * 运行时仍按原实现做防御性判断。
 */
import type { ServerResponse } from 'node:http'

/** DSH 文件系统条目（`fs.listDir` 返回） */
export interface FsEntry {
  name: string
  /** fs 后端的 opaque 句柄，可回传给 stat/listDir/readText 等 */
  target: unknown
  type: 'file' | 'directory' | string
  /** fs 后端的版本指纹（本地后端为 dev:ino:size:mtime:ctime 字符串） */
  version?: unknown
  size?: number
}

/** DSH 沙箱文件系统（`ctx.get('fs')`） */
export interface DshFs {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  stat(target: unknown): Promise<{ type: string; size?: number } | null | undefined>
  listDir(target: unknown): Promise<FsEntry[] | null | undefined>
  readText(target: unknown): Promise<string>
  readBytes(target: unknown, start?: number, end?: number): Promise<ArrayBuffer | Uint8Array>
  processPath?(target: unknown): string
}

/** HTTP 路由注册项（`webServer.register`） */
export interface WebRoute {
  kind: 'exact'
  path: string
  handler(req: { url?: string }, res: ServerResponse): void | Promise<void>
}

/** DSH web 服务（`ctx.get('webServer')`）；register 返回值交给 ctx.effect 注销 */
export interface DshWebServer {
  register(route: WebRoute): unknown
}

/** 会话查询（`ctx.get('sessionQuery')`）：持久化会话库 */
export interface DshSessionQuery {
  listSessions(): Promise<Array<{ header?: { id?: unknown; cwd?: string } }> | null | undefined>
}

/** 会话头（cwd / createdAt / id） */
export interface SessionHeader {
  id?: unknown
  cwd?: string
  createdAt?: number
}

/** 活动会话（`ctx.get('sessions')`） */
export interface DshSessions {
  get?(id: string): { header?: SessionHeader } | undefined
  list(): Array<{ header?: SessionHeader } | undefined | null>
}

/** 沙箱策略（`ctx.get('sandboxPolicy')`） */
export interface DshSandboxPolicy {
  workspaceRoot?: string
}

/** 工具执行上下文（tools/* 事件的 exec） */
export interface ToolExec {
  name?: string
  arguments?: Record<string, unknown>
  agent?: { session?: { id?: unknown; header?: SessionHeader } }
}

export interface ToolResult {
  isError?: boolean
}

/** host 插件上下文（cordis 注入的最小面） */
export interface HostContext {
  get<T = unknown>(id: string): T | undefined
  on(event: 'tools/result', handler: (exec: ToolExec, result: ToolResult) => void): void
  on(
    event: 'tools/execute',
    handler: (exec: ToolExec, next: () => Promise<ToolResult | undefined>) => Promise<ToolResult | undefined>,
  ): void
  /** 注册清理回调，插件卸载时执行 */
  effect(dispose: () => unknown, label?: string): void
  /** 由注入的 `timer` 服务提供：周期回调，返回注销函数 */
  interval(fn: () => void, ms: number): () => void
}

/** 动态插件宿主（仅 cordis_define 动态运行时存在，静态 bundle 没有） */
export interface HarnessLike {
  handle(method: string, handler: (args: { path?: string; sessionId?: string } | undefined) => unknown): void
}

/** 所有 /popout-sidebar/* JSON 路由共用的返回包 */
export interface ApiResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

declare global {
  // cordis 动态运行时注入的 RPC 宿主；静态 bundle 中不存在该全局，
  // 使用处必须以 `typeof harness !== 'undefined'` 守卫。
  var harness: HarnessLike | undefined
}
