/**
 * 可弹出侧边栏 · Flyout Sidebar — Host 入口（Node 侧）
 *
 * DSH 的 Cordis 加载器从这里导入 { name, inject, apply }。旧版经
 * `new Function(code.host)` 求值的动态插件路径仍被 harness.handle 分支
 * 兼容（静态 bundle 下 harness 全局不存在，typeof 守卫直接跳过）。
 */
import { attachArtifactTracking, removeFile, snapshotArtifacts } from './host/artifacts'
import { listDir, readFile, searchFiles } from './host/files'
import { attachGitTracking, gitDiff, gitStatus } from './host/git'
import { openInEditor } from './host/editor'
import { registerRoutes } from './host/routes'
import type { DshWebServer, HostContext } from './host/types'
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-flyout-sidebar'

/**
 * 插件配置（DSH 插件管理渲染的配置表单，值经 cordis 校验后注入 apply）。
 * client 侧的默认值常量与其保持一致，配置在主机侧生效后经 /flyout-sidebar/config
 * 分发给应用内面板与独立弹出页。
 */
export interface Config {
  /** 面板打开时轮询刷新产物与 git 变更 */
  autoRefresh: boolean
  /** 面板最小宽度（占窗口宽度的百分比，20–60） */
  minPanelWidth: number
  /** 页面加载后默认展开面板 */
  defaultOpen: boolean
  /** 内容区（代码/diff/markdown）基准字号（px） */
  contentFontSize: number
}

export const Config: Schema<Config> = Schema.object({
  autoRefresh: Schema.boolean().default(true).description('打开面板时自动刷新产物与 git 变更'),
  minPanelWidth: Schema.number().min(20).max(60).default(20).description('最短面板宽度（占窗口宽度百分比）'),
  defaultOpen: Schema.boolean().default(true).description('页面加载后默认展开面板'),
  contentFontSize: Schema.number().min(11).max(20).default(13).description('内容区字体大小（px），界面文字不受影响'),
})

// 硬依赖：等 webServer 就绪再注册路由（loader 各挂载点并发启动，不注入的话
// apply 可能先于 webServer 执行而静默漏掉全部路由）。sessionQuery 用于文件
// 树把「切换到的会话」的工作区从持久化语料里解析出来（尚不活跃时）；timer
// 提供 ctx.interval（git 状态兜底轮询）。
export const inject = ['webServer', 'sessionQuery', 'timer']

export function apply(ctx: HostContext, config: Config): void {
  // 产物跟踪（write/edit + shell 快照 diff）与 git 状态的事件驱动刷新
  attachArtifactTracking(ctx)
  attachGitTracking(ctx)

  // Package-private RPC（动态插件传输通道）。静态 bundle 没有 harness 全局，
  // 由 typeof 守卫；静态 client 走下面的 /flyout-sidebar/* HTTP 路由。
  if (typeof harness !== 'undefined' && harness) {
    harness.handle('artifacts.list', () => ({ artifacts: snapshotArtifacts() }))
    harness.handle('artifacts.remove', (args) => removeFile(args?.path))
    harness.handle('artifacts.read', (args) => readFile(ctx, args?.path, args?.sessionId))
    harness.handle('artifacts.listDir', (args) => listDir(ctx, args?.path, args?.sessionId))
    harness.handle('artifacts.search', (args) => searchFiles(ctx, args?.query, args?.sessionId))
    harness.handle('artifacts.open', (args) => openInEditor(ctx, args?.path, args?.sessionId))
    harness.handle('git.status', (args) => gitStatus(ctx, args?.sessionId))
    harness.handle('git.diff', (args) => gitDiff(ctx, args?.path, args?.sessionId))
  }

  const webServer = ctx.get<DshWebServer>('webServer')
  if (webServer) {
    registerRoutes(ctx, webServer, config)
  }
}
