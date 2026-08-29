/**
 * 共享：扩展名 → 预览类型 判定。
 *
 * 本目录的三个模块被同时用于三处，因此必须保持「可移植源码」约束：
 * 1. tsdown 打包进 host 侧（Node）；
 * 2. tsdown 打包进 client 侧（浏览器 React bundle）；
 * 3. tsdown 构建期经 `?raw` 读入原始文本，剥离 import/export 后内联进独立
 *    弹出页 /flyout-sidebar 的经典 <script>（见 src/host/page.ts）。
 *
 * 因此这些文件只能使用 JSDoc 标注类型（不得出现 TS 语法注记），且不得引入
 * 本目录之外的依赖。highlight/markdown 同理。
 */

/** @type {Record<string, number>} */
const EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 }
/** @type {Record<string, number>} */
const EXT_PDF = { pdf: 1 }
/** @type {Record<string, number>} */
const EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 }
/** @type {Record<string, number>} */
const EXT_HTML = { html: 1, htm: 1, xhtml: 1 }

/**
 * @param {string} path
 * @returns {'image' | 'pdf' | 'markdown' | 'html' | 'text'}
 */
export function extType(path) {
  const ext = fileExt(path)
  if (EXT_IMAGE[ext]) return 'image'
  if (EXT_PDF[ext]) return 'pdf'
  if (EXT_MARKDOWN[ext]) return 'markdown'
  if (EXT_HTML[ext]) return 'html'
  return 'text'
}

/** @param {string} path @returns {string} 小写扩展名（无扩展名时为 ''） */
export function fileExt(path) {
  const m = /\.([^.]+)$/.exec(String(path || ''))
  return m ? (m[1] || '').toLowerCase() : ''
}
