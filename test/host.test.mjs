/**
 * Host 侧 smoke 测试：用 mock 的 cordis 上下文真实执行 dist/index.js，
 * 验证路由注册、文件树/内容/媒体路由、git status/diff（真实 git 仓库）、
 * 产物跟踪事件、独立弹出页 HTML 的完整性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, statSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

function makeFakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
      return this
    },
    end(body) {
      if (body) this.body = typeof body === 'string' ? body : body.toString('utf8')
      return this
    },
  }
  return res
}

function makeFsMock(root) {
  const processPath = (p) => p
  return {
    resolve: async (path, opts) => (opts && opts.cwd && !path.startsWith('/') ? join(opts.cwd, path) : path),
    stat: async (target) => {
      try {
        const st = statSync(target)
        return { type: st.isDirectory() ? 'directory' : 'file', size: st.size }
      } catch {
        return null
      }
    },
    listDir: async (target) => {
      try {
        return readdirSync(target, { withFileTypes: true }).map((d) => ({
          name: d.name,
          target: join(target, d.name),
          type: d.isDirectory() ? 'directory' : 'file',
          version: 'v:' + d.name,
        }))
      } catch {
        return null
      }
    },
    readText: async (target) => readFileSync(target, 'utf8'),
    readBytes: async (target) => readFileSync(target),
    processPath,
  }
}

function makeCtx(workspace) {
  const routes = new Map()
  const handlers = { 'tools/result': [], 'tools/execute': [] }
  const intervals = []
  const disposers = []
  const ctx = {
    routes,
    handlers,
    intervals,
    disposers,
    services: {
      webServer: {
        register(route) {
          routes.set(route.path, route.handler)
          return () => routes.delete(route.path)
        },
      },
      sessionQuery: { listSessions: async () => [{ header: { id: 's1', cwd: workspace } }] },
      timer: {},
      fs: makeFsMock(workspace),
      sandboxPolicy: { workspaceRoot: workspace },
      sessions: {
        get: (id) => (id === 's1' ? { header: { cwd: workspace, id: 's1', createdAt: 1 } } : undefined),
        list: () => [{ header: { cwd: workspace, id: 's1', createdAt: 1 } }],
      },
    },
    get(id) {
      return this.services[id]
    },
    on(event, handler) {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(handler)
    },
    effect(dispose) {
      disposers.push(dispose)
      if (typeof dispose === 'function') dispose()
    },
    interval(fn) {
      intervals.push(fn)
      return () => {}
    },
  }
  return ctx
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString()
}

test('host plugin: apply registers routes, events and intervals', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-'))
  const plugin = await import('../dist/index.js')
  assert.equal(plugin.name, 'dsh-popout-sidebar')
  assert.deepEqual(plugin.inject, ['webServer', 'sessionQuery', 'timer'])

  const ctx = makeCtx(workspace)
  plugin.apply(ctx)

  const expectedRoutes = [
    '/popout-sidebar',
    '/popout-sidebar/data',
    '/popout-sidebar/content',
    '/popout-sidebar/media',
    '/popout-sidebar/remove',
    '/popout-sidebar/listdir',
    '/popout-sidebar/gitstatus',
    '/popout-sidebar/gitdiff',
    '/popout-sidebar/pdfjs/pdf.min.js',
    '/popout-sidebar/pdfjs/pdf.worker.min.js',
  ]
  for (const r of expectedRoutes) assert.ok(ctx.routes.has(r), 'missing route ' + r)
  assert.equal(ctx.handlers['tools/result'].length, 2) // artifacts + git 刷新
  assert.equal(ctx.handlers['tools/execute'].length, 1)
  assert.equal(ctx.intervals.length, 1) // 15s 兜底轮询
  assert.equal(ctx.disposers.length, expectedRoutes.length)
})

test('host plugin: popout page HTML is complete and scripts compile', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-'))
  const plugin = await import('../dist/index.js')
  const ctx = makeCtx(workspace)
  plugin.apply(ctx)
  const res = makeFakeRes()
  await ctx.routes.get('/popout-sidebar')({ url: '/popout-sidebar' }, res)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /text\/html/)
  const html = res.body
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(!/@@[A-Za-z]+@@/.test(html), 'leftover build markers')
  for (const marker of ['highlightCode', 'mdToHtml', 'extType', 'fileExt', 'gitBranchIcon', 'dsh-popout-sidebar:theme']) {
    assert.ok(html.includes(marker), 'page missing ' + marker)
  }
  // 两个内联 <script> 都必须是可解析的经典脚本（含独立页应用逻辑）。
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(scripts.length, 2)
  for (const s of scripts) new Function(s) // 语法错误会抛出
})

test('host plugin: content / listdir / media routes', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-'))
  writeFileSync(join(workspace, 'hello.txt'), 'hello world')
  writeFileSync(join(workspace, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  mkdirSync(join(workspace, 'sub'))
  writeFileSync(join(workspace, 'sub', 'nested.md'), '# hi')
  const plugin = await import('../dist/index.js')
  const ctx = makeCtx(workspace)
  plugin.apply(ctx)

  const res = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/content')({ url: '/popout-sidebar/content?path=hello.txt' }, res)
  const body = JSON.parse(res.body)
  assert.equal(body.ok, true)
  assert.equal(body.content, 'hello world')
  assert.equal(body.type, 'text')

  const res2 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/listdir')({ url: '/popout-sidebar/listdir' }, res2)
  const list = JSON.parse(res2.body)
  assert.equal(list.ok, true)
  assert.equal(list.path, workspace)
  // 目录优先排序
  assert.deepEqual(list.entries.map((e) => e.name), ['sub', 'hello.txt', 'pixel.png'])
  assert.equal(list.entries[0].isDir, true)

  const res3 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/media')({ url: '/popout-sidebar/media?path=pixel.png' }, res3)
  assert.equal(res3.headers['Content-Type'], 'image/png')
  assert.equal(res3.body, Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('utf8'))

  const res4 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/content')({ url: '/popout-sidebar/content?path=missing.txt' }, res4)
  assert.equal(JSON.parse(res4.body).ok, false)
})

test('host plugin: git status and diff against a real repo', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-git-'))
  git(workspace, 'init')
  git(workspace, 'checkout', '-b', 'main')
  writeFileSync(join(workspace, 'tracked.txt'), 'base\n')
  git(workspace, 'add', '.')
  git(workspace, 'commit', '-m', 'init')
  writeFileSync(join(workspace, 'tracked.txt'), 'modified\n')
  writeFileSync(join(workspace, 'untracked.txt'), 'new\n')

  const plugin = await import('../dist/index.js')
  const ctx = makeCtx(workspace)
  plugin.apply(ctx)

  const res = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/gitstatus')({ url: '/popout-sidebar/gitstatus?sessionId=s1' }, res)
  const status = JSON.parse(res.body)
  assert.equal(status.ok, true, status.error)
  assert.equal(status.root, workspace)
  const paths = status.entries.map((e) => e.path)
  assert.ok(paths.includes('tracked.txt'))
  assert.ok(paths.includes('untracked.txt'))
  const tracked = status.entries.find((e) => e.path === 'tracked.txt')
  assert.equal(tracked.y, 'M')

  const res2 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/gitdiff')({ url: '/popout-sidebar/gitdiff?path=tracked.txt&sessionId=s1' }, res2)
  const diff = JSON.parse(res2.body)
  assert.equal(diff.ok, true)
  assert.ok(diff.diff.includes('-base'), 'diff 应包含删除行')
  assert.ok(diff.diff.includes('+modified'), 'diff 应包含新增行')

  // 未跟踪文件 → 合成 new-file diff
  const res3 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/gitdiff')({ url: '/popout-sidebar/gitdiff?path=untracked.txt&sessionId=s1' }, res3)
  const synth = JSON.parse(res3.body)
  assert.equal(synth.ok, true)
  assert.ok(synth.diff.includes('new file mode 100644'))
  assert.ok(synth.diff.includes('+new'))
})

test('host plugin: artifact tracking via tools/result and tools/execute', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-art-'))
  const plugin = await import('../dist/index.js')
  const ctx = makeCtx(workspace)
  plugin.apply(ctx)

  // write 工具结果 → 记录产物
  for (const handler of ctx.handlers['tools/result']) {
    handler(
      { name: 'write', arguments: { file_path: join(workspace, 'out.txt') }, agent: { session: { id: 's1', header: { cwd: workspace } } } },
      { isError: false },
    )
  }
  const res = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/data')({ url: '/popout-sidebar/data' }, res)
  const data = JSON.parse(res.body)
  assert.equal(data.artifacts.length, 1)
  assert.equal(data.artifacts[0].path, join(workspace, 'out.txt'))
  assert.equal(data.artifacts[0].kind, 'create')

  // bash 工具 → 前后快照 diff，兜住 shell 副作用（文件在工具体内创建）
  const exec = { name: 'bash', arguments: {}, agent: { session: { id: 's1', header: { cwd: workspace } } } }
  let captured
  for (const handler of ctx.handlers['tools/execute']) {
    captured = await handler(exec, async () => {
      writeFileSync(join(workspace, 'side-effect.txt'), 'from bash\n')
      return { isError: false }
    })
  }
  assert.deepEqual(captured, { isError: false })
  const res2 = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/data')({ url: '/popout-sidebar/data' }, res2)
  const data2 = JSON.parse(res2.body)
  assert.ok(data2.artifacts.some((a) => a.path === join(workspace, 'side-effect.txt')), 'shell 副作用应被快照 diff 捕获')
  // cwd 被记录，git 轮询定时器已注册
  assert.equal(ctx.intervals.length, 1)
})

test('host plugin: edit tool records diff snippet', async () => {
  const workspace = mkdtempSync(join(os.tmpdir(), 'dsh-popout-edit-'))
  const plugin = await import('../dist/index.js')
  const ctx = makeCtx(workspace)
  plugin.apply(ctx)
  for (const handler of ctx.handlers['tools/result']) {
    handler(
      {
        name: 'edit',
        arguments: { file_path: join(workspace, 'a.txt'), old_string: 'old', new_string: 'new' },
        agent: { session: { id: 's1', header: { cwd: workspace } } },
      },
      { isError: false },
    )
  }
  const res = makeFakeRes()
  await ctx.routes.get('/popout-sidebar/data')({ url: '/popout-sidebar/data' }, res)
  const data = JSON.parse(res.body)
  assert.equal(data.artifacts[0].kind, 'edit')
  assert.deepEqual(data.artifacts[0].diff, { before: 'old', after: 'new' })
})
