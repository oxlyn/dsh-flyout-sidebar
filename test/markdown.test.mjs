/**
 * markdown.js 回归测试：XSS 防线（mdEscape + mdSafeUrl 白名单）与行内渲染
 * 正确性（code span 不被后续规则二次渲染）。纯函数，直接 import 源文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mdToHtml } from '../src/shared/markdown.js'

test('script tags are escaped, never emitted raw', () => {
  const html = mdToHtml('<script>alert(1)</script>')
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
})

test('javascript: URLs are neutralized to #', () => {
  const html = mdToHtml('[click](javascript:alert(1))')
  assert.ok(!html.includes('javascript:'))
  assert.ok(html.includes('href="#"'))
})

test('data:image png is allowed, data:text/html is not', () => {
  assert.ok(mdToHtml('[i](data:image/png;base64,AAAA)').includes('href="data:image/png;base64,AAAA"'))
  assert.ok(!mdToHtml('[i](data:text/html;base64,AAAA)').includes('data:text/html'))
})

test('code span content is not re-rendered by link/bold rules', () => {
  const html = mdToHtml('`[x](https://a)` and `**b**`')
  assert.ok(html.includes('<code>[x](https://a)</code>'))
  assert.ok(html.includes('<code>**b**</code>'))
  assert.ok(!html.includes('<a href'))
  assert.ok(!html.includes('<strong>'))
})

test('multiple code spans restore in order', () => {
  const html = mdToHtml('`a` *b* `c`')
  assert.ok(html.includes('<code>a</code>'))
  assert.ok(html.includes('<em>b</em>'))
  assert.ok(html.includes('<code>c</code>'))
})

test('GFM pipe table renders thead/tbody with alignment and inline cells', () => {
  const html = mdToHtml('| a | b | c |\n| --- | :---: | ---: |\n| 1 | **2** | `x` |')
  assert.ok(html.includes('<table><thead>'))
  assert.ok(html.includes('<th>a</th>'))
  assert.ok(html.includes('<th style="text-align:center">b</th>'))
  assert.ok(html.includes('<th style="text-align:right">c</th>'))
  assert.ok(html.includes('<td>1</td>'))
  assert.ok(html.includes('<td style="text-align:center"><strong>2</strong></td>'))
  assert.ok(html.includes('<td style="text-align:right"><code>x</code></td>'))
})

test('table ends at a blank line and later blocks render normally', () => {
  const html = mdToHtml('| a |\n| --- |\n| 1 |\n\n- item')
  assert.ok(html.includes('<td>1</td></tr></tbody></table>'))
  assert.ok(html.includes('<ul><li>item</li></ul>'))
})

test('escaped pipe renders literally instead of splitting the cell', () => {
  const html = mdToHtml('| a | b |\n| --- | --- |\n| x \\| y | z |')
  assert.ok(html.includes('<td>x | y</td>'))
  assert.ok(html.includes('<td>z</td>'))
})

test('a pipe line without a delimiter row stays a paragraph', () => {
  const html = mdToHtml('a | b\nc | d')
  assert.ok(!html.includes('<table>'))
  assert.ok(html.includes('<p>a | b</p>'))
})

test('short body rows are padded, long rows truncated to header columns', () => {
  const html = mdToHtml('| a | b |\n| --- | --- |\n| 1 |\n| 2 | 3 | 4 |')
  assert.ok(html.includes('<td>1</td><td></td>'))
  assert.ok(html.includes('<td>2</td><td>3</td>'))
  assert.ok(!html.includes('4</td>'))
})
