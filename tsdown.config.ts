/**
 * tsdown 构建：把 src/{shared,host,client,vendor} 打包成 DSH 实际消费的两个
 * 单文件 bundle（dist/index.js host 侧 / dist/client.js 浏览器侧）。
 *
 *   tsdown   （或 npm run build）
 *
 * - `?raw` 导入由 rawInline() 插件在构建期内联为字符串常量，用于：
 *   1) 独立弹出页的内联脚本（shared 源码随 HTML 下发）
 *   2) 内嵌的 vendored pdf.js（离线可用，不经 CDN）
 * - JSX 采用 classic runtime，工厂为 client/jsx.ts 的 `h`（React 由 DSH 的
 *   __ModuleLoader__ factory(require) 在运行时提供，bundle 内不 import react）。
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { defineConfig } from 'tsdown'
import type { TsdownPlugin } from 'tsdown'

function rawInline(): TsdownPlugin {
  return {
    name: 'raw-inline',
    resolveId: {
      order: 'pre',
      handler(source, importer) {
        if (!source.endsWith('?raw')) return null
        const target = source.slice(0, -'?raw'.length)
        if (!target.startsWith('.') && !isAbsolute(target)) return null
        const base = importer ? dirname(importer) : process.cwd()
        return resolve(base, target) + '?raw'
      },
    },
    load: {
      order: 'pre',
      handler(id) {
        if (!id.endsWith('?raw')) return null
        const code = readFileSync(resolve(id.slice(0, -'?raw'.length)), 'utf8')
        return { code: `export default ${JSON.stringify(code)}`, moduleSideEffects: false }
      },
    },
  }
}

// JSX 与 TSX 走 oxc 的 classic 转换；`h` / `Fragment` 由各组件显式从
// client/jsx.ts 导入（classic runtime 不做自动导入）。
const jsxClassic = {
  jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
} as const

export default defineConfig([
  {
    name: 'host',
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    platform: 'node',
    format: 'es',
    outExtensions: () => ({ js: '.js' }),
    dts: false,
    sourcemap: false,
    plugins: [rawInline()],
  },
  {
    name: 'client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'dist',
    platform: 'browser',
    format: 'iife',
    outExtensions: () => ({ js: '.js' }),
    outputOptions: { entryFileNames: '[name].js' },
    dts: false,
    sourcemap: false,
    plugins: [rawInline()],
    inputOptions: { transform: jsxClassic },
  },
])
