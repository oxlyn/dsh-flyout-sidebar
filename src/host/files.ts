/**
 * Host 侧：文件读取与目录列举（文件树 / 代码预览的后端）。
 */
import { extType } from '../shared/ext.js'
import type { DshFs, HostContext } from './types'
import { resolveCwd } from './workspace'

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

/** 文本内容读取（代码预览）。超长内容截断并打标。 */
export async function readFile(ctx: HostContext, path: unknown): Promise<ReadResult> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return { ok: false, error: 'filesystem unavailable' }
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  try {
    const policy = ctx.get('sandboxPolicy')
    const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
    const cwd = typeof root === 'string' && root ? root : undefined
    const target = await fs.resolve(path, cwd ? { cwd } : undefined)
    const info = await fs.stat(target)
    if (!info || info.type !== 'file') return { ok: false, error: 'not a readable file' }
    const text = await fs.readText(target)
    const cap = 200000
    return { ok: true, type: extType(path), content: text.slice(0, cap), truncated: text.length > cap, size: info.size }
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
