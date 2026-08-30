/**
 * Host 侧：在系统默认应用（通常是编辑器/IDE）里打开工作区文件。
 *
 * 与 media/content 路由一致地经 DSH 的 fs.resolve（锚定工作区根）定位文件，
 * 平台命令：macOS `open`、Windows `cmd /c start`、Linux `xdg-open`。
 */
import { spawn } from 'node:child_process'
import type { DshFs, HostContext } from './types'

export interface OpenResult {
  ok: boolean
  error?: string
}

export async function openInEditor(ctx: HostContext, path: unknown): Promise<OpenResult> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return { ok: false, error: 'filesystem unavailable' }
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  try {
    const policy = ctx.get('sandboxPolicy')
    const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
    const cwd = typeof root === 'string' && root ? root : undefined
    const target = await fs.resolve(path, cwd ? { cwd } : undefined)
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', '', String(target)] : [String(target)]
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    // 等命令真正起跑（或失败）再应答；超时按已受理处理，不阻塞请求
    const started = await Promise.race([
      new Promise<string>((resolve) => {
        child.once('spawn', () => resolve('ok'))
        child.once('error', () => resolve('error'))
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 1500)),
    ])
    if (started === 'error') return { ok: false, error: 'failed to spawn ' + cmd }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'open failed' }
  }
}
