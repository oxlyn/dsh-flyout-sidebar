/**
 * Client 侧 smoke 测试：把 dist/client.js（IIFE）在一个带 DOM 桩的函数作用
 * 域里执行，模拟 DSH 的 __ModuleLoader__ / factory(require) 协议，然后用
 * react-dom/server 真实渲染注册的组件，验证 JSX 组件树的完整性。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientCode = readFileSync(join(root, 'dist', 'client.js'), 'utf8')

// ── 浏览器环境桩（够 apply + renderToString 用即可） ─────────────────────
function makeEnv() {
  const localStorage = new Map()
  const created = []
  const documentStub = {
    createElement(tag) {
      const el = { tag, id: '', textContent: '', style: {}, setAttribute: () => {}, appendChild: () => {} }
      created.push(el)
      return el
    },
    getElementById: () => null,
    documentElement: {
      style: { setProperty: () => {}, getPropertyValue: () => '' },
      hasAttribute: () => false,
      setAttribute: () => {},
      removeAttribute: () => {},
    },
    body: {
      hasAttribute: () => false,
      setAttribute: () => {},
      removeAttribute: () => {},
    },
    head: { appendChild: () => {} },
    addEventListener: () => {},
  }
  const windowStub = {
    innerWidth: 1400,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return { windowStub, documentStub, localStorage, created }
}

function loadClientBundle() {
  const { windowStub, documentStub, localStorage, created } = makeEnv()
  let captured
  windowStub.__ModuleLoader__ = {
    load(definition) {
      captured = definition
    },
  }
  const runner = new Function('window', 'document', 'localStorage', 'navigator', 'fetch', clientCode)
  runner(windowStub, documentStub, localStorage, {}, () => Promise.resolve({ json: () => Promise.resolve({}) }))
  assert.ok(captured, '__ModuleLoader__.load 应被调用')
  assert.equal(captured.id, 'dsh-flyout-sidebar')
  const plugin = captured.factory((id) => {
    if (id === 'react') return React
    throw new Error('unexpected require: ' + id)
  })
  assert.deepEqual(plugin.inject, ['timer'])
  return { plugin, windowStub, documentStub, localStorage, created }
}

function makeClientCtx() {
  const registered = []
  const intervals = []
  const services = {
    slots: {
      register(definition, component) {
        registered.push({ definition, component })
        return definition
      },
      inject(slot, factory) {
        factory()
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({ current: 'sess-1' }),
        subscribe: () => () => {},
      },
      scope: () => ({}),
    },
    conversation: { input: { for: () => ({ setDraft: () => {} }) } },
  }
  return {
    registered,
    intervals,
    get(id) {
      return services[id]
    },
    interval(fn) {
      intervals.push(fn)
      return () => {}
    },
  }
}

test('client bundle: self-contained IIFE, registers via __ModuleLoader__', () => {
  assert.ok(!/^\s*(import|export)\s/m.test(clientCode), 'bundle 不应包含 ESM 语句')
  assert.ok(clientCode.includes('__ModuleLoader__'))
  const { plugin } = loadClientBundle()
  assert.equal(typeof plugin.apply, 'function')
})

test('client bundle: apply inserts styles and registers three slots', () => {
  const { plugin, created } = loadClientBundle()
  const ctx = makeClientCtx()
  plugin.apply(ctx)
  assert.ok(created.some((el) => el.tag === 'style' && el.id === 'dsh-flyout-sidebar-styles'), '样式应被注入')
  assert.equal(ctx.registered.length, 3)
  const [trigger, panel, settings] = ctx.registered.map((r) => r.definition)
  assert.deepEqual(trigger, { name: 'shell.overlay', id: 'artifacts-sidebar-trigger', order: 40, label: 'Artifacts' })
  assert.deepEqual(panel, { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' })
  assert.deepEqual(settings, { name: 'settings.section', id: 'artifacts-sidebar', order: 90, label: 'Flyout Sidebar' })
})

test('client bundle: ArtifactsPanel renders file tree panel', () => {
  const { plugin } = loadClientBundle()
  const ctx = makeClientCtx()
  plugin.apply(ctx)
  const panelEntry = ctx.registered.find((r) => r.definition.id === 'artifacts-sidebar-panel')
  const html = renderToString(React.createElement(panelEntry.component))
  assert.ok(html.includes('artifacts-panel'), '应有侧边栏面板')
  assert.ok(html.includes('artifacts-tree'), '默认应为文件树视图')
  assert.ok(html.includes('Loading file tree…'), '初始应显示加载提示（测试环境无 navigator，自动判定英文）')
  assert.ok(!html.includes('artifacts-search-input'), '搜索框默认隐藏')
  assert.ok(html.includes('artifacts-search-toggle'), '头部应有搜索开关按钮')
  assert.ok(html.includes('flyout-sidebar?sessionId=sess-1'), '弹出链接应携带会话 id')
  assert.ok(html.includes('artifacts-resize'), '应有拖拽手柄')
})

test('client bundle: SettingsSection renders all toggles', () => {
  const { plugin } = loadClientBundle()
  const ctx = makeClientCtx()
  plugin.apply(ctx)
  const settingsEntry = ctx.registered.find((r) => r.definition.id === 'artifacts-sidebar')
  const html = renderToString(React.createElement(settingsEntry.component))
  for (const label of ['Open by default', 'Auto refresh', 'File tree', 'Minimum panel width', 'Interface language']) {
    assert.ok(html.includes(label), '设置项缺失：' + label)
  }
  assert.ok(html.includes('artifacts-switch'), '应有开关组件')
  assert.ok(html.includes('artifacts-langselect'), '应有语言下拉框')
})

test('client bundle: CornerButton hidden while panel is open (default-open settings applied)', () => {
  const { plugin } = loadClientBundle()
  const ctx = makeClientCtx()
  plugin.apply(ctx)
  const triggerEntry = ctx.registered.find((r) => r.definition.id === 'artifacts-sidebar-trigger')
  // 默认「默认展开」= true → 面板打开；触发按钮常驻挂载，靠 CSS 类滑出屏外隐藏
  const html = renderToString(React.createElement(triggerEntry.component))
  assert.ok(html.includes('artifacts-corner-btn'), '应渲染触发按钮')
  assert.ok(html.includes('artifacts-slid-out'), '面板打开时按钮应带滑出类（CSS 隐藏）')
})
