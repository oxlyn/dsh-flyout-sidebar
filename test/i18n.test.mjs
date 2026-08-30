// i18n 共享模块单测：字典完整性、回退链、语言持久化与订阅。
// 直接 import 可移植源码（JSDoc 模块，无构建步骤）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { t, getLang, getExplicitLang, setLang, subscribeLang } from '../src/shared/i18n.js'

test('i18n: defaults to English when no stored lang and navigator is unavailable', () => {
  assert.equal(getExplicitLang(), null)
  // node 环境：无 localStorage / navigator → 自动判定回退 en
  assert.equal(getLang(), 'en')
  assert.equal(t('noChanges'), 'No uncommitted changes')
})

test('i18n: every zh key has an en counterpart (and vice versa)', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/shared/i18n.js', import.meta.url), 'utf8')
  const grab = (name) => {
    const m = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\}').exec(src)
    assert.ok(m, name + ' block found')
    return new Set([...m[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((x) => x[1]))
  }
  const zh = grab('ZH')
  const en = grab('EN')
  for (const k of zh) assert.ok(en.has(k), 'en missing key ' + k)
  for (const k of en) assert.ok(zh.has(k), 'zh missing key ' + k)
})

test('i18n: setLang switches dictionaries and notifies subscribers', () => {
  const seen = []
  const unsub = subscribeLang((lang) => seen.push(lang))
  setLang('zh')
  assert.equal(getLang(), 'zh')
  assert.equal(t('noChanges'), '没有未提交的变更')
  assert.equal(t('statusT'), '类型变更')
  setLang('en')
  assert.equal(getLang(), 'en')
  assert.equal(t('refTitle'), 'Quote into input box (falls back to copying @path)')
  unsub()
  setLang('zh')
  assert.equal(seen.join(','), 'zh,en') // unsub 后不再收到通知
  setLang(null) // 恢复自动判定
})

test('i18n: unknown key falls back to the key itself', () => {
  assert.equal(t('__missing__'), '__missing__')
})
