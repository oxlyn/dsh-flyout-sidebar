/**
 * 可弹出侧边栏 · Popout Sidebar — Host 入口（Node 侧）
 *
 * DSH 的 Cordis 加载器从这里导入 { name, inject, apply }。旧版经
 * `new Function(code.host)` 求值的动态插件路径仍被 harness.handle 分支
 * 兼容（静态 bundle 下 harness 全局不存在，typeof 守卫直接跳过）。
 */
import { attachArtifactTracking, removeFile, snapshotArtifacts } from './host/artifacts'
import { listDir, readFile } from './host/files'
import { attachGitTracking, gitDiff, gitStatus } from './host/git'
import { registerRoutes } from './host/routes'
import type { DshWebServer, HostContext } from './host/types'

export const name = 'dsh-popout-sidebar'

// 硬依赖：等 webServer 就绪再注册路由（loader 各挂载点并发启动，不注入的话
// apply 可能先于 webServer 执行而静默漏掉全部路由）。sessionQuery 用于文件
// 树把「切换到的会话」的工作区从持久化语料里解析出来（尚不活跃时）；timer
// 提供 ctx.interval（git 状态兜底轮询）。
export const inject = ['webServer', 'sessionQuery', 'timer']

export function apply(ctx: HostContext): void {
  // 产物跟踪（write/edit + shell 快照 diff）与 git 状态的事件驱动刷新
  attachArtifactTracking(ctx)
  attachGitTracking(ctx)

  // Package-private RPC（动态插件传输通道）。静态 bundle 没有 harness 全局，
  // 由 typeof 守卫；静态 client 走下面的 /popout-sidebar/* HTTP 路由。
  if (typeof harness !== 'undefined' && harness) {
    harness.handle('artifacts.list', () => ({ artifacts: snapshotArtifacts() }))
    harness.handle('artifacts.remove', (args) => removeFile(args?.path))
    harness.handle('artifacts.read', (args) => readFile(ctx, args?.path))
    harness.handle('artifacts.listDir', (args) => listDir(ctx, args?.path, args?.sessionId))
    harness.handle('git.status', (args) => gitStatus(ctx, args?.sessionId))
    harness.handle('git.diff', (args) => gitDiff(ctx, args?.path, args?.sessionId))
  }

  const webServer = ctx.get<DshWebServer>('webServer')
  if (webServer) {
    registerRoutes(ctx, webServer)
  }
}
