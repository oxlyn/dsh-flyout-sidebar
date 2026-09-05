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

/**
 * GFM 管道表格辅助：按未转义的 | 切分单元格（行内 \| 还原为字面量竖线），
 * 并去掉首尾管道产生的空单元格。
 * @param {string} line @returns {string[]}
 */
function mdSplitCells(line) {
  const parts = String(line).replace(/\\\|/g, '\u0002').split('|')
  for (let i = 0; i < parts.length; i += 1) {
    parts[i] = (parts[i] || '').replace(/\u0002/g, '|').trim()
  }
  return parts
}

/** @param {string[]} cells @returns {string[]} */
function mdTrimEdgeCells(cells) {
  if (cells.length && cells[0] === '') cells.shift()
  if (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/** @param {string[]} cells @returns {boolean} 是否为 GFM 分隔行（:--- / :---: / ---: 形态） */
function mdIsDelimiterRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
}

/**
 * @param {string} cell @returns {string} 'center' | 'right' | ''（left 与默认一致，不输出）
 */
function mdCellAlign(cell) {
  if (/^:-+:$/.test(cell)) return 'center'
  if (/^:-+$/.test(cell)) return 'left'
  if (/^-+:$/.test(cell)) return 'right'
  return ''
}

/** @param {string} a @returns {string} 单元格对齐的内联样式属性 */
function mdAlignAttr(a) {
  return a === 'center' || a === 'right' ? ' style="text-align:' + a + '"' : ''
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
    // GFM 管道表格：表头行（含 |）+ 分隔行（:---/:---:/---:）+ 数据行，
    // 空行或不含 | 的行结束；列数以表头为准，数据行多删少补，
    // 单元格内容走 mdEscape + mdInline，对齐声明转成内联 text-align。
    if (line.indexOf('|') >= 0 && i + 1 < lines.length) {
      const head = mdTrimEdgeCells(mdSplitCells(line))
      const delim = mdTrimEdgeCells(mdSplitCells(/** @type {string} */ (lines[i + 1])))
      if (head.length && mdIsDelimiterRow(delim)) {
        const aligns = delim.map(mdCellAlign)
        const colCount = head.length
        /** @type {string[][]} */
        const rows = []
        i += 2
        while (i < lines.length && (/** @type {string} */ (lines[i])).trim() !== '' && (/** @type {string} */ (lines[i])).indexOf('|') >= 0) {
          const cells = mdTrimEdgeCells(mdSplitCells(/** @type {string} */ (lines[i])))
          /** @type {string[]} */
          const padded = []
          for (let c = 0; c < colCount; c += 1) padded.push(cells[c] || '')
          rows.push(padded)
          i += 1
        }
        let table = '<table><thead><tr>'
        for (let c = 0; c < colCount; c += 1) {
          table += '<th' + mdAlignAttr(aligns[c] || '') + '>' + mdInline(mdEscape(head[c] || '')) + '</th>'
        }
        table += '</tr></thead><tbody>'
        for (const cells of rows) {
          table += '<tr>'
          for (let c = 0; c < colCount; c += 1) {
            table += '<td' + mdAlignAttr(aligns[c] || '') + '>' + mdInline(mdEscape(cells[c] || '')) + '</td>'
          }
          table += '</tr>'
        }
        out.push(table + '</tbody></table>')
        continue
      }
    }
    out.push('<p>' + mdInline(mdEscape(line)) + '</p>')
    i += 1
  }
  return out.join('\n')
}
