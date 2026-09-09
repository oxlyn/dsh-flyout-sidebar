/**
 * 共享：git 变更列表 / diff 的纯展示逻辑。
 *
 * client 侧 React 组件与独立弹出页（page.ts 内联脚本）共用，避免双端各自
 * 实现后细节漂移。与 ext/highlight/markdown 一样遵守「可移植源码」约束：
 * 只能使用 JSDoc 标注类型、依赖仅限本目录（i18n 的 t 在内联场景由同作用域
 * 函数声明提升提供）。
 */
import { t } from './i18n.js'

/** @param {string} p @returns {string} */
export function basename(p) {
  var parts = String(p).split('/')
  return parts[parts.length - 1] || p
}

/**
 * 变更文件的状态徽章字母：未跟踪为 U，否则取工作树状态（y），再退到暂存
 * 状态（x），空缺按 M。
 * @param {{ x: string, y: string }} e @returns {string}
 */
export function gitLabel(e) {
  if (e.x === '?' || e.y === '?') return 'U'
  return (e.y !== ' ' ? e.y : e.x) || 'M'
}

/**
 * 变更文件行 hover 提示：状态名 + 暂存/未暂存。
 * @param {{ x: string, y: string }} e @returns {string}
 */
export function gitTitle(e) {
  var label = gitLabel(e)
  /** @type {Record<string, string>} */
  var map = {
    U: t('statusU'), A: t('statusA'), M: t('statusM'),
    D: t('statusD'), R: t('statusR'), C: t('statusC'), T: t('statusT'),
  }
  var staged = e.x !== ' ' && e.x !== '?'
  return (map[label] || label) + (staged ? t('staged') : t('unstaged'))
}

/**
 * unified diff 单行的样式类：hunk / 增 / 删 / 元信息（diff --git、index、
 * rename 等），其余为普通行。
 * @param {string} line @returns {string}
 */
export function gitDiffLineClass(line) {
  var cls = 'gd-line'
  if (line.indexOf('@@') === 0) cls += ' gd-hunk'
  else if (line.charAt(0) === '+' && line.indexOf('+++') !== 0) cls += ' gd-add'
  else if (line.charAt(0) === '-' && line.indexOf('---') !== 0) cls += ' gd-del'
  else if (
    line.indexOf('diff ') === 0 || line.indexOf('index ') === 0 || line.indexOf('--- ') === 0 ||
    line.indexOf('+++ ') === 0 || line.indexOf('new file') === 0 || line.indexOf('deleted file') === 0 ||
    line.indexOf('old mode') === 0 || line.indexOf('new mode') === 0 || line.indexOf('rename ') === 0 ||
    line.indexOf('similarity ') === 0 || line.indexOf('copy ') === 0 || line.indexOf('Binary files') === 0 ||
    line.charAt(0) === '\\'
  ) {
    cls += ' gd-meta'
  }
  return cls
}
