/**
 * Host 侧：在系统默认应用（通常是编辑器/IDE）里打开工作区文件。
 *
 * 与 media/content 路由一致地经 DSH 的 fs.resolve（锚定工作区根）定位文件，
 * 平台命令：macOS `open`、Windows `rundll32 url.dll,FileProtocolHandler`、
 * Linux `xdg-open`（绕开 cmd.exe 的参数转义层，文件名含 `&`/`^`/`%` 也安全）。
 */
import { spawn } from 'node:child_process'
import type { DshFs, HostContext } from './types'
import { resolveWorkspaceCwd, isWithinWorkspace } from './files'

export interface OpenResult {
  ok: boolean
  error?: string
}

export async function openInEditor(ctx: HostContext, path: unknown, sessionId?: string): Promise<OpenResult> {
  const fs = ctx.get<DshFs>('fs')
  if (!fs) return { ok: false, error: 'filesystem unavailable' }
  if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
  try {
    const cwd = await resolveWorkspaceCwd(ctx, sessionId)
    const target = await fs.resolve(path, cwd ? { cwd } : undefined)
    if (!isWithinWorkspace(fs, target, cwd)) return { ok: false, error: 'path outside workspace' }
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', String(target)] : [String(target)]
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    // 等命令真正起跑（或失败）再应答；超时按已受理处理，不阻塞请求
    let timer: ReturnType<typeof setTimeout> | null = null
    const started = await Promise.race([
      new Promise<string>((resolve) => {
        child.once('spawn', () => resolve('ok'))
        child.once('error', () => resolve('error'))
      }),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('ok'), 1500)
      }),
    ])
    if (timer) clearTimeout(timer)
    if (started === 'error') return { ok: false, error: 'failed to spawn ' + cmd }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'open failed' }
  }
}
