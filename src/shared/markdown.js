/**
 * 共享：极简 Markdown → HTML 渲染器。
 *
 * 可移植性约束见 ext.ts 顶部说明：本文件经 `?raw` 原样内联进独立弹出页的
 * 经典 <script>，只能使用 JSDoc 标注类型。围栏代码块通过 shared/highlight
 * 的 highlightCode 高亮。
 */
import { highlightCode } from './highlight.js'

/** @param {string} s @returns {string} */
function mdEscape(s) {
  return String(s).replace(/[\u0000\u0001]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * URL 白名单：只放行 http(s)、站内相对路径、页内锚点与 data:image/*，
 * 其余（javascript:、vbscript: 及实体编码变体等）一律替换为 '#'，防止
 * 预览渲染出来的链接/图片在点击时执行脚本。
 * @param {string} u @returns {string}
 */
function mdSafeUrl(u) {
  var s = String(u || '').replace(/[\s\u0000-\u001f]/g, '')
  if (/^https?:\/\//i.test(s)) return s
  if (/^\/(?!\/)/.test(s) || /^\.{1,2}\//.test(s) || s.charAt(0) === '#') return s
  if (/^data:image\/(?:png|gif|jpeg|webp|bmp|avif);/i.test(s)) return s
  return '#'
}

/** @param {string} s @returns {string} */
function mdInline(s) {
  // code span 先摘出为占位符再跑后续规则：反引号内的 `[x](url)`、`**b**`
  // 应原样输出，不被行内链接/强调规则二次渲染（占位符字符已在 mdEscape 剥除）。
  /** @type {string[]} */
  const codes = []
  s = s.replace(/`([^`]+)`/g, (m, c) => {
    codes.push('<code>' + c + '</code>')
    return '\u0000' + (codes.length - 1) + '\u0000'
  })
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => '<img alt="' + alt + '" src="' + mdSafeUrl(u) + '">')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, u) => '<a href="' + mdSafeUrl(u) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[Number(i)] ?? '')
  return s
}

/** @param {string} src @returns {string} HTML */
export function mdToHtml(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  /** @type {string[]} */
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = /** @type {string} */ (lines[i])
    if (/^\s*```/.test(line)) {
      const fence = /^\s*```([\w+-]*)/.exec(line)
      const langHint = fence ? fence[1] || '' : ''
      /** @type {string[]} */
      const buf = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(/** @type {string} */ (lines[i]))) {
        buf.push(/** @type {string} */ (lines[i]))
        i += 1
      }
      i += 1
      out.push('<pre><code>' + highlightCode(buf.join('\n'), langHint) + '</code></pre>')
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const lv = (h[1] || '').length
      out.push('<h' + lv + '>' + mdInline(mdEscape(/** @type {string} */ (h[2]))) + '</h' + lv + '>')
      i += 1
      continue
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push('<hr>')
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      /** @type {string[]} */
      const q = []
      while (i < lines.length && /^\s*>\s?/.test(/** @type {string} */ (lines[i]))) {
        q.push((/** @type {string} */ (lines[i])).replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push('<blockquote>' + mdInline(mdEscape(q.join(' '))) + '</blockquote>')
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      /** @type {string[]} */
      const lis = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(/** @type {string} */ (lines[i]))) {
        lis.push(mdInline(mdEscape((/** @type {string} */ (lines[i])).replace(/^\s*[-*+]\s+/, ''))))
        i += 1
      }
      out.push('<ul>' + lis.map((x) => '<li>' + x + '</li>').join('') + '</ul>')
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      /** @type {string[]} */
      const lis2 = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(/** @type {string} */ (lines[i]))) {
        lis2.push(mdInline(mdEscape((/** @type {string} */ (lines[i])).replace(/^\s*\d+\.\s+/, ''))))
        i += 1
      }
      out.push('<ol>' + lis2.map((x) => '<li>' + x + '</li>').join('') + '</ol>')
      continue
    }
    if (line.trim() === '') {
      i += 1
      continue
    }
    out.push('<p>' + mdInline(mdEscape(line)) + '</p>')
    i += 1
  }
  return out.join('\n')
}
