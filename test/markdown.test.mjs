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
