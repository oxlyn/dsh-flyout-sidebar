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
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** @param {string} s @returns {string} */
function mdInline(s) {
  s = s.replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
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
