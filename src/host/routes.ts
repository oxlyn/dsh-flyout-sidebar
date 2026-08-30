/**
 * Host 侧：/flyout-sidebar/* HTTP 路由注册。
 */
import { Buffer } from 'node:buffer'
import type { ServerResponse } from 'node:http'
// Vendored pdf.js（Mozilla，Apache-2.0）——构建期内嵌为字符串常量，供侧边栏
// 自定义 PDF 渲染器使用；独立弹出页用浏览器原生查看器，不经此路由。
import pdfjsLibSource from '../vendor/pdfjs/pdf.min.js?raw'
import pdfjsWorkerSource from '../vendor/pdfjs/pdf.worker.min.js?raw'
import type { DshFs, DshWebServer, HostContext } from './types'
import { readFile, listDir, searchFiles, resolveWorkspaceCwd, isWithinWorkspace } from './files'
import { gitDiff, gitStatus } from './git'
import { openInEditor } from './editor'
import { snapshotArtifacts } from './artifacts'
import { buildFlyoutPage } from './page'

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  pdf: 'application/pdf',
}

function sendJson(res: ServerResponse, out: unknown, connectionClose = false): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }
  if (connectionClose) headers.Connection = 'close'
  res.writeHead(200, headers)
  res.end(JSON.stringify(out))
}

/** 从 req.url 解析查询参数（仅用到简单键值，无需完整 URL 解析） */
function queryParams(url: string | undefined): URLSearchParams {
  return new URLSearchParams((url || '').split('?')[1] || '')
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(body)
}

export function registerRoutes(ctx: HostContext, webServer: DshWebServer): void {
  const page = buildFlyoutPage()

  const register = (route: Parameters<DshWebServer['register']>[0], label: string): void => {
    ctx.effect(() => webServer.register(route), label)
  }

  register({
    kind: 'exact',
    path: '/flyout-sidebar',
    handler(req, res) {
      // 内联脚本 + 内联样式 + self 资源；给独立弹出页兜一层 CSP 底线
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "media-src 'self'",
        "object-src 'self'",
        "frame-src 'self'",
        "connect-src 'self'",
      ].join('; ')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': csp,
      })
      res.end(page)
    },
  }, 'artifacts: page route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/data',
    handler(req, res) {
      sendJson(res, { artifacts: snapshotArtifacts() }, true)
    },
  }, 'artifacts: data route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/content',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await readFile(ctx, q.get('path') ?? undefined, q.get('sessionId') || undefined)
      sendJson(res, out)
    },
  }, 'artifacts: content route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/media',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const path = q.get('path') || ''
      const fs = ctx.get<DshFs>('fs')
      if (!fs || !path) {
        sendText(res, 400, 'bad request')
        return
      }
      try {
        const cwd = await resolveWorkspaceCwd(ctx, q.get('sessionId') || undefined)
        const target = await fs.resolve(path, cwd ? { cwd } : undefined)
        if (!isWithinWorkspace(fs, target, cwd)) {
          sendText(res, 403, 'path outside workspace')
          return
        }
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') {
          sendText(res, 404, 'not found')
          return
        }
        const bytes = await fs.readBytes(target, undefined, 25 * 1024 * 1024)
        const ext = (/\.([^.]+)$/.exec(path)?.[1] || '').toLowerCase()
        const mime = MIME[ext] || 'application/octet-stream'
        const body = Buffer.from(bytes as Uint8Array)
        // CSP sandbox：直接导航到 media URL（尤其 SVG）时禁脚本、断同源，
        // 阻断工作区内恶意 SVG/XHTML 造成的存储型 XSS；<img> 内嵌展示不受影响。
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'private, max-age=5',
          'Content-Length': body.byteLength,
          'Content-Security-Policy': 'sandbox',
          'X-Content-Type-Options': 'nosniff',
        })
        res.end(body)
      } catch (e) {
        // 详细错误只进日志：异常 message 常含服务端绝对路径，不回显给客户端
        console.error('[flyout-sidebar] media read failed', e)
        sendText(res, 500, 'read failed')
      }
    },
  }, 'artifacts: media route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/listdir',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await listDir(ctx, q.get('path') || undefined, q.get('sessionId') || undefined)
      sendJson(res, out, true)
    },
  }, 'artifacts: listdir route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/open',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await openInEditor(ctx, q.get('path') ?? undefined, q.get('sessionId') || undefined)
      sendJson(res, out, true)
    },
  }, 'artifacts: open route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/search',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await searchFiles(ctx, q.get('q') ?? undefined, q.get('sessionId') || undefined)
      sendJson(res, out, true)
    },
  }, 'artifacts: search route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/gitstatus',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await gitStatus(ctx, q.get('sessionId') || undefined, { force: q.get('force') === '1' })
      sendJson(res, out, true)
    },
  }, 'git: status route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/gitdiff',
    handler: async (req, res) => {
      const q = queryParams(req.url)
      const out = await gitDiff(ctx, q.get('path'), q.get('sessionId') || undefined)
      sendJson(res, out, true)
    },
  }, 'git: diff route')

  // pdf.js 资源：从内嵌副本伺服，插件完全离线可用。缓存一年 —— 字节随插件
  // 版本走。
  register({
    kind: 'exact',
    path: '/flyout-sidebar/pdfjs/pdf.min.js',
    handler(req, res) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
      res.end(pdfjsLibSource)
    },
  }, 'artifacts: pdf.js lib route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/pdfjs/pdf.worker.min.js',
    handler(req, res) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
      res.end(pdfjsWorkerSource)
    },
  }, 'artifacts: pdf.js worker route')
}
