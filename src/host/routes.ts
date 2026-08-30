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
import { readFile, listDir, searchFiles } from './files'
import { gitDiff, gitStatus } from './git'
import { openInEditor } from './editor'
import { removeFile, snapshotArtifacts } from './artifacts'
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
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
      const out = await readFile(ctx, queryParams(req.url).get('path') ?? undefined)
      sendJson(res, out)
    },
  }, 'artifacts: content route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/media',
    handler: async (req, res) => {
      const path = queryParams(req.url).get('path') || ''
      const fs = ctx.get<DshFs>('fs')
      if (!fs || !path) {
        sendText(res, 400, 'bad request')
        return
      }
      try {
        const policy = ctx.get('sandboxPolicy')
        const root = (policy as { workspaceRoot?: string } | undefined)?.workspaceRoot
        const cwd = typeof root === 'string' && root ? root : undefined
        const target = await fs.resolve(path, cwd ? { cwd } : undefined)
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') {
          sendText(res, 404, 'not found')
          return
        }
        const bytes = await fs.readBytes(target, undefined, 25 * 1024 * 1024)
        const ext = (/\.([^.]+)$/.exec(path)?.[1] || '').toLowerCase()
        const mime = MIME[ext] || 'application/octet-stream'
        const body = Buffer.from(bytes as Uint8Array)
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=5', 'Content-Length': body.byteLength })
        res.end(body)
      } catch (e) {
        sendText(res, 500, e instanceof Error && e.message ? e.message : 'read failed')
      }
    },
  }, 'artifacts: media route')

  register({
    kind: 'exact',
    path: '/flyout-sidebar/remove',
    handler(req, res) {
      sendJson(res, removeFile(queryParams(req.url).get('path') ?? undefined))
    },
  }, 'artifacts: remove route')

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
      const out = await openInEditor(ctx, queryParams(req.url).get('path') ?? undefined)
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
