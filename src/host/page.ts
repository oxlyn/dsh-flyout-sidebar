/**
 * Host 侧：独立弹出页 /flyout-sidebar 的 HTML。
 *
 * 页面内联脚本由三部分拼成：shared 源码（构建期经 `?raw` 读入、剥离
 * import/export 后在此插值）+ 本文件中的页面逻辑。HTML 骨架用 String.raw
 * 保持正则/转义序列原样；shared 文本是运行时插值，不受模板转义影响。
 */
import extSource from '../shared/ext.js?raw'
import highlightSource from '../shared/highlight.js?raw'
import markdownSource from '../shared/markdown.js?raw'

/** 剥离 ESM 语法，把 shared 模块源码变成经典 <script> 可用的片段 */
function toInlineScript(source: string): string {
  return source
    .replace(/^import\s[^\n]*$/gm, '')
    .replace(/^export\s+/gm, '')
}

// 三个模块在同一脚本作用域内互调（markdown → highlight），函数声明提升，
// 拼接顺序无关紧要；这里按 依赖深浅 排列便于阅读。
const sharedScript = [extSource, highlightSource, markdownSource].map(toInlineScript).join('\n')

// shared 文本是运行时插值，反引号/`${…}` 不会破坏模板；唯一会破坏页面结构
// 的是内联脚本里出现 "</script>"，构建期直接拦截。
if (/<\/script/i.test(sharedScript)) {
  throw new Error('shared inline script must not contain a literal </script> sequence')
}

export function buildFlyoutPage(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>弹出式侧边栏</title>
<script>
  (function () {
    // Follow DSH's light/dark setting: the main tab publishes the theme to
    // localStorage (THEME_KEY); the ?scheme= query is the fallback.
    var THEME_KEY = 'dsh-flyout-sidebar:theme';
    var v = null;
    try { v = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (v !== 'dark' && v !== 'light') {
      var m = /[?&]scheme=([^&]+)/.exec(location.search);
      if (m) v = m[1];
    }
    if (v === 'dark') document.documentElement.setAttribute('data-ds-dark-theme', '');
  })();
</script>
<style>
  :root {
    color-scheme: light;
    --p-bg: rgb(255, 255, 255);
    --p-bg-layer-1: rgb(255, 255, 255);
    --p-border-l1: rgba(0, 0, 0, 0.04);
    --p-border-l2: rgba(0, 0, 0, 0.1);
    --p-text: rgb(15, 17, 21);
    --p-text-secondary: rgb(97, 102, 107);
    --p-text-tertiary: rgb(129, 133, 140);
    --p-text-caption: rgb(173, 178, 184);
    --p-hover: rgba(38, 49, 72, 0.06);
    --p-accent: rgb(65, 118, 230);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(230, 250, 237);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(254, 245, 231);
    --p-error: rgb(236, 19, 19);
    --p-code-bg: rgb(250, 250, 250);
    --p-code-fg: rgb(97, 102, 107);
    --p-shadow: 0 4px 12px 0 rgba(0,0,0,0.02), 0 2px 8px 0 rgba(0,0,0,0.04);
  }
  :root[data-ds-dark-theme] {
    color-scheme: dark;
    --p-bg: rgb(21, 21, 23);
    --p-bg-layer-1: rgb(35, 35, 36);
    --p-border-l1: rgba(255, 255, 255, 0.06);
    --p-border-l2: rgba(255, 255, 255, 0.12);
    --p-text: rgb(249, 250, 251);
    --p-text-secondary: rgb(207, 211, 214);
    --p-text-tertiary: rgb(173, 178, 184);
    --p-text-caption: rgb(129, 133, 140);
    --p-hover: rgba(255, 255, 255, 0.08);
    --p-accent: rgb(103, 158, 254);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(35, 60, 44);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(39, 36, 31);
    --p-error: rgb(242, 90, 90);
    --p-code-bg: rgb(27, 27, 28);
    --p-code-fg: rgb(207, 211, 214);
    --p-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--p-bg); color: var(--p-text);
    display: flex; flex-direction: column;
  }
  main { flex: 1; display: flex; min-height: 0; }
  /* Content (preview) on the LEFT, file panel on the RIGHT — mirrors the
     in-app layout where the preview covers the area left of the sidebar.
     Panel width is adjustable via an invisible handle straddling the panel's
     left border (same pattern as the in-app panel, no visible gap). */
  .sidebar { width: var(--flyout-panel-w, 240px); flex: none; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--p-border-l2); position: relative; }
  .divider { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 5; touch-action: none; }
  .divider::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
  .divider:hover::after, .divider.dragging::after { background: var(--p-accent); }
  body.panel-dragging iframe, body.panel-dragging embed { pointer-events: none; }
  body.panel-dragging { user-select: none; }
  .list { flex: 1; min-height: 0; overflow-y: auto; transition: opacity .15s; }
  .list.is-refreshing { opacity: .45; }
  /* 刷新后逐行浮现：延迟由 JS 按行号注入 */
  .item.flash-in, .tree-row.flash-in { animation: flash-in .3s ease both; }
  @keyframes flash-in { from { opacity: 0; transform: translateY(-8px); } }
  .list .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .item { display: flex; align-items: stretch; border-bottom: 1px solid var(--p-border-l1); }
  /* Selected artifact: left accent bar distinguishes it from the file tree. */
  .item.active { background: var(--p-hover); box-shadow: inset 3px 0 0 var(--p-accent); }
  .item-main { flex: 1; min-width: 0; text-align: left; padding: 10px 14px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .item-main:hover { background: var(--p-hover); }
  .item .row { display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
  .badge.create { background: var(--p-success-bg); color: var(--p-success-fg); }
  .badge.edit { background: var(--p-warn-bg); color: var(--p-warn-fg); }
  .item .base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .full { color: var(--p-text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .item .time { color: var(--p-text-caption); font-size: 11px; flex: none; }
  .actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
  .item:hover .actions { opacity: 1; }
  .mini-btn { border: none; background: transparent; color: var(--p-text-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
  .mini-btn:hover { background: var(--p-hover); color: var(--p-text); }
  .preview { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  /* Tab strip above the preview area (multi-tab, mirrors the in-app overlay) */
  .ptabs { flex: none; display: flex; align-items: stretch; height: 28px; background: var(--p-bg-layer-1); border-bottom: 1px solid var(--p-border-l2); }
  .ptabs-scroll { flex: 1 1 auto; display: flex; align-items: stretch; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
  .ptab { flex: none; display: flex; align-items: center; gap: 6px; max-width: 220px; padding: 0 6px 0 12px; cursor: pointer; border-right: 1px solid var(--p-border-l1); color: var(--p-text-secondary); font-size: 12px; line-height: 28px; user-select: none; }
  .ptab:hover { background: var(--p-hover); color: var(--p-text); }
  .ptab.is-active { background: var(--p-bg); color: var(--p-text); box-shadow: inset 0 -2px 0 var(--p-accent); }
  .ptab-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ptab-close { flex: none; width: 18px; height: 18px; padding: 0; line-height: 1; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: inherit; cursor: pointer; border-radius: 4px; }
  .ptab-close:hover { background: rgba(128, 128, 128, 0.18); }
  .preview .area { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .preview pre { margin: 0; padding: 16px; background: var(--p-code-bg); font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; color: var(--p-code-fg); }
  .preview .hint { padding: 32px; color: var(--p-text-tertiary); text-align: center; }
  .preview .err { padding: 24px; color: var(--p-error); font-family: ui-monospace, monospace; }
  .preview-img { display: block; max-width: 100%; max-height: 80vh; object-fit: contain; margin: 16px; }
  /* iframe/embed are REPLACED elements: inset-0 keeps their intrinsic
     (small) size, so give them an explicit width/height 100% to fill the area. */
  .preview-iframe { width: 100%; height: 100%; min-height: 400px; border: 0; background: #fff; }
  .preview-pdf { width: 100%; height: 100%; min-height: 480px; border: 0; background: #fff; display: block; }
  .markdown { padding: 16px 20px; line-height: 1.6; word-wrap: break-word; }
  .markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6 { margin: 16px 0 8px; line-height: 1.3; }
  .markdown h1 { font-size: 1.5em; border-bottom: 1px solid var(--p-border-l2); padding-bottom: 6px; }
  .markdown h2 { font-size: 1.3em; border-bottom: 1px solid var(--p-border-l1); padding-bottom: 4px; }
  .markdown code { background: var(--p-code-bg); color: var(--p-code-fg); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .markdown pre { background: var(--p-code-bg); padding: 12px 14px; border-radius: 6px; overflow: auto; }
  .markdown pre code { background: transparent; padding: 0; }
  .markdown img { max-width: 100%; }
  .markdown blockquote { border-left: 3px solid var(--p-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--p-text-secondary); }
  .markdown ul, .markdown ol { padding-left: 24px; }
  .markdown a { color: var(--p-accent); }
  .markdown hr { border: none; border-top: 1px solid var(--p-border-l2); margin: 16px 0; }
  .diff { border-top: 1px solid var(--p-border-l2); }
  .diff-block { border-bottom: 1px solid var(--p-border-l1); }
  .diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
  .diff-block.del .diff-label { color: var(--p-error); background: rgba(236,19,19,0.06); }
  .diff-block.add .diff-label { color: var(--p-success-fg); background: rgba(34,197,94,0.08); }
  .diff-pre { margin: 0; padding: 8px 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
  .diff-block.del .diff-pre { background: rgba(236,19,19,0.05); }
  .diff-block.add .diff-pre { background: rgba(34,197,94,0.06); }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--p-bg-layer-1); border: 1px solid var(--p-border-l2); color: var(--p-text); padding: 6px 14px; border-radius: 8px; font-size: 12px; opacity: 0; transition: opacity .18s; pointer-events: none; box-shadow: var(--p-shadow); z-index: 10; }
  .gtoggle { flex: none; display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 6px; border-bottom: 1px solid var(--p-border-l2); background: var(--p-bg-layer-1); }
  .gtoggle-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--p-text-tertiary); }
  /* Panel on the left side: preview and panel swap via flex-direction */
  main.side-left { flex-direction: row-reverse; }
  main.side-left .sidebar { border-left: none; border-right: 1px solid var(--p-border-l2); }
  main.side-left .divider { left: auto; right: -4px; }
  .gtoggle-side-icon { display: inline-flex; transition: transform .15s; }
  .gtoggle-side-icon.is-flipped { transform: scaleX(-1); }
  .gtoggle-btn { width: 26px; height: 24px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: var(--p-text-secondary); cursor: pointer; border-radius: 6px; padding: 0; }
  .gtoggle-btn:hover { background: var(--p-hover); color: var(--p-text); }
  .gtoggle-btn.is-active { color: var(--p-accent); }
  .git-badge { font-size: 10px; font-weight: 700; width: 16px; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .git-badge-M { background: var(--p-warn-bg); color: var(--p-warn-fg); }
  .git-badge-A { background: var(--p-success-bg); color: var(--p-success-fg); }
  .git-badge-D { background: rgba(236,19,19,0.1); color: var(--p-error); }
  .git-badge-R { background: rgba(65,118,230,0.1); color: var(--p-accent); }
  .git-badge-U { background: var(--p-hover); color: var(--p-text-tertiary); }
  .git-orig { color: var(--p-text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .git-err { padding: 14px 12px; color: var(--p-error); word-break: break-all; }
  .gd { font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .gd-line { white-space: pre-wrap; word-break: break-all; padding: 0 12px; }
  .gd-meta { color: var(--p-text-tertiary); background: var(--p-code-bg); padding: 2px 12px; }
  .gd-hunk { color: var(--p-accent); background: rgba(65,118,230,0.08); padding: 2px 12px; }
  .gd-add { color: #1a7f37; background: rgba(34,197,94,0.08); }
  .gd-del { color: #cf222e; background: rgba(236,19,19,0.07); }
  :root[data-ds-dark-theme] .gd-add { color: #69db7c; }
  :root[data-ds-dark-theme] .gd-del { color: #faa2c1; }
  .list.is-hidden { display: none; }
  .tree { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .tree.is-active { display: flex; }
  .tree-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 8px; }
  .tree .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .tree-row { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 100%; height: 34px; padding: 0 8px; cursor: pointer; white-space: nowrap; color: var(--p-text); font-size: 14px; border-radius: 8px; }
  .tree-row:hover { background: var(--p-hover); }
  .tree-row.is-selected { background: var(--p-hover); }
  .tree-dir { font-weight: 600; }
  .tree-hidden { opacity: .45; }
  .tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tree-ref { height: 20px; border: 1px solid var(--p-border-l1); background: var(--p-bg-layer-2); color: var(--p-text-tertiary); font-size: 11px; font-weight: 600; cursor: pointer; border-radius: 999px; flex: none; align-items: center; padding: 0 8px; display: none; }
  .tree-ref:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-row:hover .tree-ref, .tree-row:focus-within .tree-ref { display: inline-flex; }
  .tree-copied { font-size: 11px; color: var(--p-text-tertiary); flex: none; }
  .tree-loading { color: var(--p-text-tertiary); cursor: default; font-size: 12px; }
  .tree-error { color: var(--p-error); cursor: default; font-size: 12px; }
  /* Code preview (syntax-highlighted): gutter + code, no banner chrome */
  .codeview { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .codeview-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--p-code-bg); }
  .codeview-gutter { flex: none; min-width: 2.2em; margin: 0; padding: 12px 6px 12px 8px; text-align: right; color: var(--p-text-caption); background: var(--p-code-bg); border-right: 1px solid var(--p-border-l1); position: sticky; left: 0; user-select: none; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre { flex: 1; margin: 0; padding: 12px; background: var(--p-code-bg); font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre code { font: inherit; }
  .tok-comment { color: #868e96; }
  .tok-string { color: #2f9e44; }
  .tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
  .tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
  .tok-function, .tok-decorator { color: #6741d9; }
  .tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
  .tok-property { color: #495057; }
  :root[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
  :root[data-ds-dark-theme] .tok-string { color: #69db7c; }
  :root[data-ds-dark-theme] .tok-number, :root[data-ds-dark-theme] .tok-bool, :root[data-ds-dark-theme] .tok-variable, :root[data-ds-dark-theme] .tok-hex, :root[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
  :root[data-ds-dark-theme] .tok-keyword, :root[data-ds-dark-theme] .tok-important, :root[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
  :root[data-ds-dark-theme] .tok-function, :root[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
  :root[data-ds-dark-theme] .tok-class, :root[data-ds-dark-theme] .tok-builtin, :root[data-ds-dark-theme] .tok-tag, :root[data-ds-dark-theme] .tok-key { color: #74c0fc; }
  :root[data-ds-dark-theme] .tok-property { color: #ced4da; }
</style>
</head>
<body>
  <main>
    <div class="preview">
      <div class="ptabs" id="ptabs"></div>
      <div class="area" id="previewArea"></div>
    </div>
    <div class="sidebar">
      <div class="divider" id="divider" title="拖动调整面板宽度"></div>
      <div class="gtoggle">
        <button class="gtoggle-btn" id="sideBtn" type="button" title="将文件面板移到左侧"></button>
        <span class="gtoggle-status" id="status">connecting…</span>
        <button class="gtoggle-btn" id="refreshBtn" type="button" title="刷新"></button>
        <button class="gtoggle-btn" id="viewBtn" type="button" title="查看 Git 变更（未提交）"></button>
      </div>
      <div class="list is-hidden" id="list"></div>
      <div class="tree is-active" id="tree">
        <div class="tree-body" id="treeBody"></div>
      </div>
    </div>
  </main>
  <div class="toast" id="toast"></div>
  <script>
${sharedScript}
    var DATA_URL = '/flyout-sidebar/data';
    var CONTENT_URL = '/flyout-sidebar/content';
    var MEDIA_URL = '/flyout-sidebar/media';
    var LISTDIR_URL = '/flyout-sidebar/listdir';
    var GITSTATUS_URL = '/flyout-sidebar/gitstatus';
    var GITDIFF_URL = '/flyout-sidebar/gitdiff';
    var _sm = /[?&]sessionId=([^&]+)/.exec(location.search);
    var _urlSessionId = _sm ? decodeURIComponent(_sm[1]) : '';
    var SESSION_KEY = 'dsh-flyout-sidebar:session';
    function currentSessionId() {
      try {
        var v = localStorage.getItem(SESSION_KEY);
        if (v) return v;
      } catch (e) {}
      return _urlSessionId;
    }
    function listdirUrl(path) {
      var q = [];
      var sid = currentSessionId();
      if (sid) q.push('sessionId=' + encodeURIComponent(sid));
      if (path) q.push('path=' + encodeURIComponent(path));
      return LISTDIR_URL + (q.length ? '?' + q.join('&') : '');
    }
    var gitFiles = null;
    var gitError = null;
    var gitSig = null; // 上次渲染的变更签名；轮询数据未变时跳过重渲染，避免冲掉刷新动画
    var treeRoot = null;
    var treeChildren = {};
    var treeExpanded = {};
    var currentView = 'tree';

    var FOLDER_CLOSE_D = 'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z';
    var FOLDER_OPEN_D1 = 'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z';
    var FOLDER_OPEN_D2 = 'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z';
    var CODE_D = 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z';
    var REFRESH_D = 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z';

    function svgIcon(paths, size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 14);
      svg.setAttribute('height', size || 14);
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      (paths || []).forEach(function (spec) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', spec.d);
        if (spec.transform) p.setAttribute('transform', spec.transform);
        if (spec.opacity) p.setAttribute('opacity', spec.opacity);
        if (spec.fillRule) p.setAttribute('fill-rule', spec.fillRule);
        if (spec.clipRule) p.setAttribute('clip-rule', spec.clipRule);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
      });
      return svg;
    }
    function folderClosedIcon() { return svgIcon([{ d: FOLDER_CLOSE_D, transform: 'translate(1.5 2.429)' }]); }
    function folderOpenIcon() { return svgIcon([{ d: FOLDER_OPEN_D1 }, { d: FOLDER_OPEN_D2, opacity: '0.2' }]); }
    function fileCodeIcon() { return svgIcon([{ d: CODE_D, fillRule: 'evenodd', clipRule: 'evenodd' }]); }
    function refreshIcon() { return svgIcon([{ d: REFRESH_D }]); }
    // Git-branch glyph drawn with strokes (matches the sidebar's toggle icon).
    function gitBranchIcon() {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 16); svg.setAttribute('height', 16);
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
      var spec = [
        'M4.5 4.6v6.8',
        'M11.5 4.7v1.1c0 1.9-1.6 3.1-3.6 3.1-1.9 0-3.4 1.2-3.4 1.2',
      ];
      spec.forEach(function (d) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.4');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('fill', 'none');
        svg.appendChild(p);
      });
      [ [4.5, 3], [4.5, 13], [11.5, 3] ].forEach(function (c) {
        var o = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        o.setAttribute('cx', String(c[0])); o.setAttribute('cy', String(c[1]));
        o.setAttribute('r', '1.7');
        o.setAttribute('stroke', 'currentColor');
        o.setAttribute('stroke-width', '1.4');
        o.setAttribute('fill', 'none');
        svg.appendChild(o);
      });
      return svg;
    }

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    }
    function basename(p) {
      var parts = String(p).split('/');
      return parts[parts.length - 1] || p;
    }
    function toast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1600);
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    function copyText(text, msg) {
      var done = function () { toast(msg); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }

    function errNode(msg) {
      return el('div', 'err', msg || 'read failed');
    }
    function gitLabel(e) {
      if (e.x === '?' || e.y === '?') return 'U';
      return (e.y !== ' ' ? e.y : e.x) || 'M';
    }
    function gitTitle(e) {
      var label = gitLabel(e);
      var map = { U: '未跟踪', A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制' };
      var staged = e.x !== ' ' && e.x !== '?';
      return (map[label] || label) + (staged ? '（已暂存）' : '（未暂存）');
    }
    function renderGit() {
      var list = document.getElementById('list');
      list.textContent = '';
      if (currentView !== 'git') return;
      if (gitError) {
        list.appendChild(el('div', 'git-err', gitError));
        return;
      }
      if (gitFiles == null) {
        list.appendChild(el('div', 'empty', '加载变更列表…'));
        return;
      }
      if (!gitFiles.length) {
        list.appendChild(el('div', 'empty', '没有未提交的变更'));
        return;
      }
      gitFiles.forEach(function (e) {
        var item = el('div', 'item');
        var at = activeTab();
        if (at && at.git && at.path === e.path) item.className += ' active';
        var main = el('button', 'item-main');
        main.title = gitTitle(e);
        var row = el('div', 'row');
        row.appendChild(el('span', 'git-badge git-badge-' + gitLabel(e), gitLabel(e)));
        row.appendChild(el('span', 'base', basename(e.path)));
        if (e.origPath) row.appendChild(el('span', 'git-orig', '← ' + basename(e.origPath)));
        main.appendChild(row);
        main.appendChild(el('div', 'full', e.path));
        main.addEventListener('click', function () { openGitDiff(e.path); });
        item.appendChild(main);
        var actions = el('div', 'actions');
        var cp = el('button', 'mini-btn', '⧉');
        cp.title = '复制路径';
        cp.addEventListener('click', function (ev) { ev.stopPropagation(); copyText(e.path, '已复制路径'); });
        var qt = el('button', 'mini-btn', '@');
        qt.title = '复制 @path 引用';
        qt.addEventListener('click', function (ev) { ev.stopPropagation(); copyText('@' + e.path, '已复制 @引用'); });
        actions.appendChild(cp);
        actions.appendChild(qt);
        item.appendChild(actions);
        list.appendChild(item);
      });
    }
    // Unified git diff renderer: meta/hunk/+/- rows with colors.
    function gitDiffNode(text) {
      var wrap = el('div', 'gd');
      if (!text) {
        wrap.appendChild(el('div', 'hint', '没有未提交的变更（相对于 HEAD）'));
        return wrap;
      }
      var lines = String(text).replace(/\n$/, '').split('\n');
      lines.forEach(function (line) {
        var cls = 'gd-line';
        if (line.indexOf('@@') === 0) cls += ' gd-hunk';
        else if (line.charAt(0) === '+' && line.indexOf('+++') !== 0) cls += ' gd-add';
        else if (line.charAt(0) === '-' && line.indexOf('---') !== 0) cls += ' gd-del';
        else if (line.indexOf('diff ') === 0 || line.indexOf('index ') === 0 || line.indexOf('--- ') === 0 ||
          line.indexOf('+++ ') === 0 || line.indexOf('new file') === 0 || line.indexOf('deleted file') === 0 ||
          line.indexOf('old mode') === 0 || line.indexOf('new mode') === 0 || line.indexOf('rename ') === 0 ||
          line.indexOf('similarity ') === 0 || line.indexOf('copy ') === 0 || line.indexOf('Binary files') === 0 ||
          line.charAt(0) === '\\') cls += ' gd-meta';
        wrap.appendChild(el('div', cls, line));
      });
      return wrap;
    }
    // ── Multi-tab preview (mirrors the in-app overlay) ────────────────────
    // tabs: [{ key, path, git, type, loading, ok, error, content, truncated, diff }]
    // 'p:' keys are content previews, 'g:' keys are git diffs.
    var tabs = [];
    var activeKey = null;
    function findTab(key) {
      for (var i = 0; i < tabs.length; i += 1) if (tabs[i].key === key) return tabs[i];
      return null;
    }
    function activeTab() { return findTab(activeKey); }
    function renderTabs() {
      var wrap = document.getElementById('ptabs');
      wrap.textContent = '';
      var scroll = el('div', 'ptabs-scroll');
      tabs.forEach(function (t) {
        var tab = el('div', 'ptab' + (t.key === activeKey ? ' is-active' : ''));
        tab.title = (t.git ? '[diff] ' : '') + t.path;
        tab.appendChild(el('span', 'ptab-name', basename(t.path)));
        var x = el('button', 'ptab-close', '×');
        x.type = 'button';
        x.title = '关闭标签页';
        x.addEventListener('click', function (ev) { ev.stopPropagation(); closeTab(t.key); });
        tab.appendChild(x);
        tab.addEventListener('click', function () { setActiveTab(t.key); });
        scroll.appendChild(tab);
      });
      wrap.appendChild(scroll);
    }
    function refreshTreeSelection() { if (treeRoot && currentView === 'tree') renderTree(); }
    function setActiveTab(key) {
      activeKey = key;
      renderTabs();
      renderActive();
      refreshTreeSelection();
    }
    function closeTab(key) {
      var idx = -1;
      for (var i = 0; i < tabs.length; i += 1) if (tabs[i].key === key) { idx = i; break; }
      if (idx < 0) return;
      tabs.splice(idx, 1);
      if (activeKey === key) activeKey = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].key : null;
      renderTabs();
      renderActive();
      refreshTreeSelection();
    }
    function patchTab(key, patch) {
      var t = findTab(key);
      if (!t) return;
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) t[k] = patch[k];
      renderTabs();
      renderActive();
    }
    function codeViewNode(content, path) {
      var view = el('div', 'codeview');
      var scroll = el('div', 'codeview-scroll');
      var gutter = el('pre', 'codeview-gutter');
      gutter.setAttribute('aria-hidden', 'true');
      var lines = String(content).replace(/\n$/, '').split('\n');
      var gt = '';
      for (var gi = 0; gi < lines.length; gi += 1) gt += (gi + 1) + (gi < lines.length - 1 ? '\n' : '');
      gutter.textContent = gt;
      var pre = el('pre', 'codeview-pre');
      var code = el('code');
      code.innerHTML = highlightCode(content, fileExt(path));
      pre.appendChild(code);
      scroll.appendChild(gutter);
      scroll.appendChild(pre);
      view.appendChild(scroll);
      return view;
    }
    function renderActive() {
      var area = document.getElementById('previewArea');
      area.textContent = '';
      var t = activeTab();
      if (!t) {
        area.appendChild(el('div', 'hint', currentView === 'git' ? '点击右侧变更文件查看 diff' : '点击右侧文件查看内容'));
        return;
      }
      if (t.loading) { area.appendChild(el('div', 'hint', '加载中…')); return; }
      if (t.ok === false) { area.appendChild(errNode(t.error || '读取失败')); return; }
      if (t.git) { area.appendChild(gitDiffNode(t.diff || '')); return; }
      var type = t.type || 'text';
      if (type === 'image') {
        var img = el('img', 'preview-img');
        img.src = MEDIA_URL + '?path=' + encodeURIComponent(t.path);
        img.alt = t.path;
        img.addEventListener('error', function () { area.textContent = ''; area.appendChild(errNode('图片加载失败')); });
        area.appendChild(img);
        return;
      }
      if (type === 'pdf') {
        // Standalone tab: use the browser's NATIVE PDF viewer (with its own
        // toolbar). #zoom=page-width fits the page to the box width.
        var pdf = el('embed', 'preview-pdf');
        pdf.src = MEDIA_URL + '?path=' + encodeURIComponent(t.path) + '#zoom=page-width';
        pdf.type = 'application/pdf';
        area.appendChild(pdf);
        return;
      }
      if (type === 'html') {
        var frame = el('iframe', 'preview-iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('srcdoc', t.content || '');
        area.appendChild(frame);
        return;
      }
      if (type === 'markdown') {
        var md = el('div', 'markdown');
        md.innerHTML = mdToHtml(t.content || '');
        area.appendChild(md);
        return;
      }
      if (t.truncated) area.appendChild(el('div', 'diff-label', '(truncated preview)'));
      area.appendChild(codeViewNode(t.content || '', t.path));
    }
    function openFileTab(path) {
      var key = 'p:' + path;
      var type = extType(path);
      var t = findTab(key);
      if (!t) { t = { key: key, path: path, git: false, type: type }; tabs.push(t); }
      t.type = type;
      var needFetch = type !== 'image' && type !== 'pdf';
      t.loading = needFetch;
      activeKey = key;
      renderTabs();
      renderActive();
      refreshTreeSelection();
      if (!needFetch) return;
      fetch(CONTENT_URL + '?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || data.ok !== true) { patchTab(key, { loading: false, ok: false, error: (data && data.error) || '读取失败' }); return; }
        patchTab(key, { loading: false, ok: true, content: data.content, truncated: data.truncated });
      }).catch(function (e) {
        patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) });
      });
    }
    function openGitDiff(path) {
      var key = 'g:' + path;
      var t = findTab(key);
      if (!t) { t = { key: key, path: path, git: true }; tabs.push(t); }
      t.loading = true;
      activeKey = key;
      renderTabs();
      renderActive();
      fetch(GITDIFF_URL + '?path=' + encodeURIComponent(path) + '&sessionId=' + encodeURIComponent(currentSessionId() || ''), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || data.ok !== true) { patchTab(key, { loading: false, ok: false, error: (data && data.error) || '读取失败' }); return; }
          patchTab(key, { loading: false, ok: true, diff: data.diff });
        })
        .catch(function (e) {
          patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) });
        });
    }

    // ── View toggle: file tree ⇄ git changed files ───────────────────────
    function setView(view) {
      currentView = view;
      var btn = document.getElementById('viewBtn');
      btn.classList.toggle('is-active', view === 'git');
      btn.title = view === 'tree' ? '查看 Git 变更（未提交）' : '返回文件列表';
      btn.textContent = '';
      btn.appendChild(view === 'tree' ? gitBranchIcon() : folderClosedIcon());
      var rb = document.getElementById('refreshBtn');
      if (rb) rb.title = view === 'tree' ? '刷新文件树' : '刷新变更列表';
      document.getElementById('list').classList.toggle('is-hidden', view !== 'git');
      document.getElementById('tree').classList.toggle('is-active', view === 'tree');
      if (view === 'tree' && !treeRoot) loadTreeRoot();
      if (view === 'git') { loadGit(); }
    }

    function loadTreeRoot(retries) {
      treeRoot = null;
      treeChildren = {};
      treeExpanded = {};
      var bodyEl = document.getElementById('treeBody');
      bodyEl.textContent = '';
      bodyEl.appendChild(el('div', 'tree-loading', '加载文件树…'));
      // A freshly switched-to workspace may not be resolvable on the host yet
      // (its session is still loading/persisting); retry briefly so the tree
      // self-corrects instead of sitting on an error/empty state.
      var left = typeof retries === 'number' ? retries : 3;
      fetch(listdirUrl(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) {
          treeRoot = { path: res.path, entries: res.entries };
        } else if (left > 0) {
          setTimeout(function () { loadTreeRoot(left - 1); }, 400);
          return;
        } else {
          treeRoot = { path: null, entries: [] };
        }
        renderTree();
        staggerList(document.getElementById('treeBody'), '.tree-row');
      }).catch(function () {
        if (left > 0) { setTimeout(function () { loadTreeRoot(left - 1); }, 400); return; }
        treeRoot = { path: null, entries: [] };
        renderTree();
        document.getElementById('treeBody').appendChild(el('div', 'tree-error', '加载失败'));
      });
    }

    function renderTree() {
      var bodyEl = document.getElementById('treeBody');
      bodyEl.textContent = '';
      if (!treeRoot) return;
      if (!treeRoot.entries || !treeRoot.entries.length) {
        bodyEl.appendChild(el('div', 'empty', '（空目录）'));
        return;
      }
      treeRoot.entries.forEach(function (entry) {
        bodyEl.appendChild(renderTreeNode(entry, 0));
      });
    }

    function copyRef(path) {
      copyText('@' + path, '已复制 @引用');
    }

    function renderTreeNode(entry, depth) {
      var wrap = el('div');
      var at = activeTab();
      var isSelected = !!(at && !at.git && at.path === entry.path);
      var row = el('div', 'tree-row' + (entry.isDir ? ' tree-dir' : '') + (entry.hidden ? ' tree-hidden' : '') + (isSelected ? ' is-selected' : ''));
      row.style.paddingLeft = (8 + depth * 20) + 'px';
      row.title = entry.path;

      row.appendChild(entry.isDir ? (treeExpanded[entry.path] ? folderOpenIcon() : folderClosedIcon()) : fileCodeIcon());
      row.appendChild(el('span', 'tree-name', entry.name));

      var refBtn = el('button', 'tree-ref', '@引用');
      refBtn.type = 'button';
      refBtn.title = '复制 @path 引用';
      refBtn.addEventListener('click', function (ev) { ev.stopPropagation(); copyRef(entry.path); });
      row.appendChild(refBtn);

      if (entry.isDir) {
        row.addEventListener('click', function () { toggleTree(entry.path); });
      } else {
        row.addEventListener('click', function () { openFileTab(entry.path); });
      }
      wrap.appendChild(row);

      if (entry.isDir && treeExpanded[entry.path]) {
        var node = treeChildren[entry.path];
        var childPad = 8 + (depth + 1) * 20 + 20;
        if (node && node.loading) {
          var lr = el('div', 'tree-row tree-loading', '加载中…');
          lr.style.paddingLeft = childPad + 'px';
          wrap.appendChild(lr);
        } else if (node && node.error) {
          var er = el('div', 'tree-row tree-error', node.error);
          er.style.paddingLeft = childPad + 'px';
          wrap.appendChild(er);
        } else if (node && node.entries) {
          node.entries.forEach(function (c) { wrap.appendChild(renderTreeNode(c, depth + 1)); });
        }
      }
      return wrap;
    }

    function toggleTree(path) {
      if (treeExpanded[path]) {
        treeExpanded[path] = false;
        renderTree();
        return;
      }
      treeExpanded[path] = true;
      if (!treeChildren[path]) {
        treeChildren[path] = { loading: true };
        renderTree();
        fetch(listdirUrl(path), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (res) {
          treeChildren[path] = res && res.ok ? { entries: res.entries } : { error: (res && res.error) || '读取失败' };
          renderTree();
        }).catch(function () {
          treeChildren[path] = { error: '读取失败' };
          renderTree();
        });
      } else {
        renderTree();
      }
    }

    document.getElementById('viewBtn').addEventListener('click', function () {
      setView(currentView === 'tree' ? 'git' : 'tree');
    });
    var refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.appendChild(refreshIcon());
      refreshBtn.addEventListener('click', function () {
        if (currentView === 'tree') loadTreeRoot();
        else loadGit(true);
      });
    }
    // Poll git status for the changed-files view (and the live/offline badge).
    // force=1 绕过 host 的 stale-while-revalidate 缓存，由刷新按钮使用。
    // 刷新后给列表行加交错浮现动画（从上往下）；selector 区分 git 列表与文件树。
    function staggerList(list, selector) {
      var items = list.querySelectorAll(selector || '.item');
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.classList.remove('flash-in');
        void it.offsetWidth; // 重置动画，使连续刷新也能重放
        it.classList.add('flash-in');
        it.style.animationDelay = (Math.min(i, 12) * 45) + 'ms';
      }
    }
    function loadGit(force) {
      var list = document.getElementById('list');
      // 强制刷新时列表短暂变暗，响应返回后恢复，给出「刷新过了」的可见反馈。
      if (force && list) list.classList.add('is-refreshing');
      fetch(GITSTATUS_URL + '?sessionId=' + encodeURIComponent(currentSessionId() || '') + (force ? '&force=1' : ''), { cache: 'no-store' })
        .then(function (r) { return r.json(); }).then(function (data) {
          if (list) list.classList.remove('is-refreshing');
          var st = document.getElementById('status');
          var ok = data && data.ok === true;
          if (ok) {
            st.textContent = 'live';
            st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-success-fg').trim() || '#34c55e';
          } else {
            st.textContent = 'git error';
            st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-error').trim() || '#ef4444';
          }
          // 数据签名未变时跳过重渲染：2s 轮询不会重建行元素、冲掉浮现动画。
          var nextFiles = ok ? (Array.isArray(data.entries) ? data.entries : []) : [];
          var nextError = ok ? null : ((data && data.error) || 'git status 失败');
          var sig = JSON.stringify([nextError, nextFiles]);
          if (!force && sig === gitSig) return;
          gitSig = sig;
          gitFiles = nextFiles;
          gitError = nextError;
          renderGit();
          if (force && list) staggerList(list);
        }).catch(function () {
          if (list) list.classList.remove('is-refreshing');
          var st = document.getElementById('status');
          st.textContent = 'offline';
          st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-error').trim() || '#ef4444';
        });
    }
    setView('tree');
    renderTabs();
    renderActive();
    // ── Panel side: file panel on the left (default) or the right ─────────
    var PANEL_SIDE_KEY = 'dsh-flyout-sidebar:panelLeft';
    var panelLeft = true;
    try { var _savedSide = localStorage.getItem(PANEL_SIDE_KEY); if (_savedSide === '0') panelLeft = false; } catch (e) {}
    function panelSideIcon() {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 16); svg.setAttribute('height', 16);
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '1.5'); rect.setAttribute('y', '1.5');
      rect.setAttribute('width', '13'); rect.setAttribute('height', '13');
      rect.setAttribute('rx', '2.8');
      rect.setAttribute('stroke', 'currentColor');
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('fill', 'none');
      svg.appendChild(rect);
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '10.2'); line.setAttribute('y1', '2.6');
      line.setAttribute('x2', '10.2'); line.setAttribute('y2', '13.4');
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
      return svg;
    }
    function applyPanelSide() {
      var main = document.querySelector('main');
      if (main) main.classList.toggle('side-left', panelLeft);
      var b = document.getElementById('sideBtn');
      if (b) {
        b.title = panelLeft ? '将文件面板移到右侧' : '将文件面板移到左侧';
        var icon = b.querySelector('.gtoggle-side-icon');
        if (icon) icon.classList.toggle('is-flipped', panelLeft);
      }
    }
    var sideBtn = document.getElementById('sideBtn');
    if (sideBtn) {
      var sideIconWrap = el('span', 'gtoggle-side-icon');
      sideIconWrap.appendChild(panelSideIcon());
      sideBtn.appendChild(sideIconWrap);
      sideBtn.addEventListener('click', function () {
        panelLeft = !panelLeft;
        applyPanelSide();
        try { localStorage.setItem(PANEL_SIDE_KEY, panelLeft ? '1' : '0'); } catch (e) {}
      });
    }
    applyPanelSide();
    // ── Panel width: draggable divider; default = minimum ─────────────────
    var PANEL_W_KEY = 'dsh-flyout-sidebar:panelw';
    var PANEL_MIN = 240;
    var PANEL_MAX_RATIO = 0.6;
    var panelW = PANEL_MIN;
    try {
      var _pw = parseInt(localStorage.getItem(PANEL_W_KEY), 10);
      if (Number.isFinite(_pw) && _pw >= PANEL_MIN) panelW = _pw;
    } catch (e) {}
    function applyPanelW() {
      var sb = document.querySelector('.sidebar');
      if (sb) sb.style.width = panelW + 'px';
    }
    applyPanelW();
    document.getElementById('divider').addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      var divider = document.getElementById('divider');
      divider.classList.add('dragging');
      document.body.classList.add('panel-dragging');
      var maxW = Math.max(PANEL_MIN, Math.round(window.innerWidth * PANEL_MAX_RATIO));
      var onMove = function (e) {
        var w = panelLeft ? e.clientX : window.innerWidth - e.clientX;
        panelW = Math.max(PANEL_MIN, Math.min(w, maxW));
        applyPanelW();
      };
      var onUp = function () {
        divider.classList.remove('dragging');
        document.body.classList.remove('panel-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        try { localStorage.setItem(PANEL_W_KEY, String(panelW)); } catch (e) {}
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    setInterval(function () { if (currentView === 'git') loadGit(); }, 2000);
    // Follow the app's light/dark theme live: the main tab writes the theme to
    // localStorage (THEME_KEY) whenever DSH's theme changes.
    var THEME_KEY = 'dsh-flyout-sidebar:theme';
    function applyTheme() {
      var v = null;
      try { v = localStorage.getItem(THEME_KEY); } catch (e) {}
      if (v !== 'dark' && v !== 'light') {
        var m = /[?&]scheme=([^&]+)/.exec(location.search);
        if (m) v = m[1];
      }
      if (v === 'dark') document.documentElement.setAttribute('data-ds-dark-theme', '');
      else document.documentElement.removeAttribute('data-ds-dark-theme');
    }
    // Follow the active session in real time: the main tab publishes the
    // current session id to localStorage (SESSION_KEY) only when it actually
    // changes, so the storage event alone is enough — no polling.
    var _lastTreeSession = currentSessionId();
    function watchSession() {
      var sid = currentSessionId();
      if (sid !== _lastTreeSession) {
        _lastTreeSession = sid;
        // Preview tabs hold the previous project's files — close them all so
        // the new workspace starts clean.
        tabs = [];
        activeKey = null;
        renderTabs();
        renderActive();
        loadTreeRoot();
        if (currentView === 'git') loadGit();
      }
    }
    window.addEventListener('storage', function (e) {
      if (e.key === SESSION_KEY) watchSession();
      if (e.key === THEME_KEY) applyTheme();
    });
    // Background tabs throttle setInterval, so a tab left in the background can
    // show stale data for up to a minute. Refresh immediately whenever the
    // user returns to (or focuses on) this tab.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && currentView === 'git') loadGit();
    });
    window.addEventListener('focus', function () { if (currentView === 'git') loadGit(); });
  </script>
</body>
</html>`
}
