(function() {
	//#region src/client/jsx.ts
	/** 当前 React 运行时（ESM live binding，initReact 后对所有模块可见） */
	let React;
	function initReact(runtime) {
		React = runtime;
	}
	/**
	* classic JSX 的 Fragment 哨兵：`<></>` 编译为 h(Fragment, …)，h 再转发到
	* React.Fragment。类型标注为 ExoticComponent，让 tsc 接受 <Fragment> 作为
	* JSX 元素类型；运行时值始终是 Symbol 哨兵。
	*/
	const Fragment = Symbol("dsh-flyout-sidebar.Fragment");
	/** JSX 工厂：转发 React.createElement，并处理 Fragment 哨兵 */
	function h(type, props, ...children) {
		const resolved = type === Fragment ? React.Fragment : type;
		return React.createElement(resolved, props ?? null, ...children);
	}
	//#endregion
	//#region src/client/runtime.ts
	let ctx;
	function initClient(context) {
		ctx = context;
	}
	async function getJson(url) {
		return (await fetch(url)).json();
	}
	/** 组装查询串：空值参数不下发（与旧版 URL 形态一致） */
	function qs(...pairs) {
		const q = pairs.filter(([, v]) => v !== "").map(([k, v]) => k + "=" + encodeURIComponent(v));
		return q.length ? "?" + q.join("&") : "";
	}
	/** host RPC 桥：与 host 侧 /flyout-sidebar/* 路由一一对应 */
	const host = {
		gitStatus(sessionId, force) {
			return getJson("/flyout-sidebar/gitstatus" + qs(["sessionId", sessionId], ["force", force ? "1" : ""]));
		},
		gitDiff(path, sessionId) {
			return getJson("/flyout-sidebar/gitdiff" + qs(["path", path], ["sessionId", sessionId]));
		},
		readArtifact(path) {
			return getJson("/flyout-sidebar/content" + qs(["path", path]));
		},
		listDir(path, sessionId) {
			return getJson("/flyout-sidebar/listdir" + qs(["path", path], ["sessionId", sessionId]));
		}
	};
	//#endregion
	//#region src/client/styles.ts
	/**
	* Client 侧：注入的样式表。
	*
	* 一次性插入 <style id="dsh-flyout-sidebar-styles">；CSS 变量遵循 DSH 的
	* --dsw-alias-* 设计令牌，深浅主题自动跟随。
	*/
	const styleCss = `
html #root {
  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-flyout-sidebar-width, 0px));
  transition: margin-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-flyout-dragging] #root {
  transition: none;
}
header:has([data-slot="conversation.session.header.utilities"]) {
  padding-right: max(28px, calc(60px - var(--dsh-flyout-sidebar-width, 0px)));
  transition: padding-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
@media (prefers-reduced-motion: reduce) {
  html #root { transition: none; }
  header:has([data-slot="conversation.session.header.utilities"]) { transition: none; }
  .artifacts-preview-overlay, .artifacts-panel, .artifacts-corner-btn { transition: none; }
}
.artifacts-preview-overlay {
  position: fixed; top: 0; bottom: 0; left: 0;
  right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-flyout-sidebar-width, 0px));
  z-index: 9998;
  display: flex; flex-direction: column; min-width: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-right: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease),
    transform var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
.artifacts-preview-overlay.artifacts-slid-out,
.artifacts-panel.artifacts-slid-out {
  transform: translateX(105%);
  pointer-events: none;
}
body[data-dsh-flyout-dragging] .artifacts-preview-overlay { transition: none; }
.artifacts-preview-overlay-tabs {
  flex: none; display: flex; align-items: stretch; height: 28px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.artifacts-ptabs-scroll {
  flex: 1 1 auto; display: flex; align-items: stretch; min-width: 0;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
}
.artifacts-ptab {
  flex: none; display: flex; align-items: center; gap: 6px;
  max-width: 220px; padding: 0 6px 0 12px; cursor: pointer;
  border-right: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 28px;
  user-select: none;
}
.artifacts-ptab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-ptab.is-active {
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 -2px 0 var(--dsw-alias-state-business-primary);
}
.artifacts-ptab-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-ptab-close {
  flex: none; width: 18px; height: 18px; padding: 0; line-height: 1; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: inherit; cursor: pointer; border-radius: 4px;
}
.artifacts-ptab-close:hover { background: var(--dsw-alias-interactive-bg-hover-accent, rgba(0, 0, 0, 0.08)); }
.artifacts-preview-hide {
  flex: none; width: 32px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-left: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 0;
}
.artifacts-preview-hide:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-preview-overlay .artifacts-preview-body { flex: 1; min-height: 0; }
.artifacts-preview-overlay .artifacts-img { max-height: none; }
.artifacts-panel {
  position: fixed; top: 0; right: var(--dsh-sidebar-width, 0px); bottom: 0; width: 30vw; max-width: calc(100vw - 24px); min-width: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto; z-index: 9999;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease),
    transform var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }
.artifacts-head {
  position: relative; display: flex; align-items: center; gap: 4px; padding: 0 6px; flex: none; height: 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.artifacts-head-left { display: flex; align-items: center; gap: 4px; flex: none; }
.artifacts-spacer { flex: 1; }
.artifacts-toggle {
  display: inline-flex; align-items: center; justify-content: center; padding: 4px; line-height: 0;
  border: none; background: transparent; border-radius: 6px;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.artifacts-toggle:hover { color: var(--dsw-alias-label-primary); }
.artifacts-link { color: var(--dsw-alias-state-business-primary); text-decoration: none; padding: 4px; border-radius: 6px; display: inline-flex; align-items: center; }
.artifacts-link:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-iconbtn {
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 8px;
  cursor: pointer; font-size: 12px;
}
.artifacts-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.artifacts-body { flex: 0 0 auto; min-height: 0; overflow-y: auto; transition: opacity .15s; }
.artifacts-body.artifacts-refreshing { opacity: .45; }
/* 刷新后逐行浮现：延迟由行内 style 按行号注入 */
.artifacts-item.artifacts-flash-in,
.artifacts-tree-node.artifacts-flash-in,
.artifacts-tree-row.artifacts-flash-in { animation: artifacts-flash-in .3s var(--ds-ease-in-out, ease) both; }
@keyframes artifacts-flash-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: none; }
}
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-item {
  display: flex; align-items: stretch; width: 100%; padding: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: default;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 9px 12px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.artifacts-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
.artifacts-item:hover .artifacts-item-actions { opacity: 1; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
.artifacts-corner-btn {
  position: fixed; top: 0; right: calc(var(--dsh-sidebar-width, 0px) + 12px);
  z-index: 10000; width: 36px; height: 28px; padding: 0;
  border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; align-items: center; justify-content: center; display: inline-flex;
  transition: transform var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease),
    right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease), color .15s;
}
/* 面板打开时随面板一起滑出屏右缘（推拉动画的另一半） */
.artifacts-corner-btn.artifacts-slid-out {
  transform: translateX(calc(100% + 24px));
  pointer-events: none;
}
.artifacts-corner-btn:hover { color: var(--dsw-alias-label-primary); }
.artifacts-preview-body { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-pdf { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; display: block; }
.artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; background: #525659; }
.artifacts-pdfview-bar { flex: none; display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 8px; background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-pdfview-btn { min-width: 24px; height: 22px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 5px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1; padding: 0 6px; }
.artifacts-pdfview-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-pdfview-btn:disabled { opacity: .4; cursor: default; }
.artifacts-pdfview-zoom { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 40px; text-align: center; }
.artifacts-pdfview-page { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: center; }
.artifacts-pdfview-spacer { flex: 1; }
.artifacts-pdfview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.artifacts-pdfview-canvas { display: block; margin: 0 auto; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
.artifacts-markdown { padding: 12px 14px; line-height: 1.6; word-wrap: break-word; font-size: 13px; }
.artifacts-markdown h1, .artifacts-markdown h2, .artifacts-markdown h3, .artifacts-markdown h4, .artifacts-markdown h5, .artifacts-markdown h6 { margin: 14px 0 8px; line-height: 1.3; }
.artifacts-markdown h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }
.artifacts-markdown h2 { font-size: 1.25em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.artifacts-markdown code { background: var(--dsw-alias-bg-layer-1); padding: 1px 5px; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); font-size: 0.9em; }
.artifacts-markdown pre { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.artifacts-markdown pre code { background: transparent; padding: 0; }
.artifacts-markdown img { max-width: 100%; }
.artifacts-markdown blockquote { border-left: 3px solid var(--dsw-alias-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--dsw-alias-label-secondary); }
.artifacts-markdown ul, .artifacts-markdown ol { padding-left: 24px; }
.artifacts-markdown a { color: var(--dsw-alias-state-business-primary); }
.artifacts-diff { border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-block { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.artifacts-diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
.artifacts-diff-del .artifacts-diff-label { color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.06); }
.artifacts-diff-add .artifacts-diff-label { color: var(--dsw-alias-state-success-primary); background: rgba(34,197,94,0.08); }
.artifacts-diff-pre { margin: 0; padding: 8px 12px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); }
.artifacts-diff-del .artifacts-diff-pre { background: rgba(236,19,19,0.05); }
.artifacts-diff-add .artifacts-diff-pre { background: rgba(34,197,94,0.06); }
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-viewbtn { display: inline-flex; align-items: center; justify-content: center; height: 26px; width: 26px; padding: 0; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; border-radius: 6px; }
.artifacts-viewbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-viewbtn.is-active { color: var(--dsw-alias-state-business-primary); }
.artifacts-git-badge { font-size: 10px; font-weight: 700; width: 16px; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-git-badge-M { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-git-badge-A { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-git-badge-D { background: rgba(236,19,19,0.1); color: var(--dsw-alias-state-error-primary); }
.artifacts-git-badge-R { background: var(--dsw-alias-state-business-tertiary, rgba(65,118,230,0.1)); color: var(--dsw-alias-state-business-primary); }
.artifacts-git-badge-U { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary); }
.artifacts-git-orig { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-error { padding: 14px 12px; word-break: break-all; }
.artifacts-gitdiff { font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; line-height: 1.6; }
.gd-line { white-space: pre-wrap; word-break: break-all; padding: 0 12px; }
.gd-meta { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-1); padding: 2px 12px; }
.gd-hunk { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-tertiary, rgba(65,118,230,0.08)); padding: 2px 12px; }
.gd-add { color: #1a7f37; background: rgba(34,197,94,0.08); }
.gd-del { color: #cf222e; background: rgba(236,19,19,0.07); }
body[data-ds-dark-theme] .gd-add { color: #69db7c; }
body[data-ds-dark-theme] .gd-del { color: #faa2c1; }
.artifacts-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-tree-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 8px; }
.artifacts-tree-row { box-sizing: border-box; width: 100%; height: 34px; font: var(--dsw-font-s-14); color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; white-space: nowrap; background: transparent; border: none; border-radius: 8px; align-items: center; gap: 6px; padding: 0 8px; display: flex; animation: artifacts-row-in .15s var(--ds-ease-in-out, ease); }
.artifacts-tree-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-dir { font: var(--dsw-font-s-strong-14); }
.artifacts-tree-hidden { opacity: .45; }
.artifacts-tree-name { flex: 1; min-width: 0; text-overflow: ellipsis; overflow: hidden; }
.artifacts-tree-row.is-selected { background: var(--dsw-alias-interactive-bg-active); }
.artifacts-tree-ref { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); height: 20px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-strong-11); cursor: pointer; border-radius: 999px; flex: none; align-items: center; padding: 0 8px; display: none; }
.artifacts-tree-ref:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-row:hover .artifacts-tree-ref, .artifacts-tree-row:focus-within .artifacts-tree-ref { display: inline-flex; }
.artifacts-tree-copied { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary); flex: none; }
.artifacts-tree-loading { cursor: default; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-tree-error { cursor: default; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
@keyframes artifacts-row-in { 0% { opacity: 0 } }
.artifacts-settings { display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.artifacts-setintro { color: var(--dsw-alias-label-tertiary); margin: 0; padding: 0 2px; font-size: 13px; line-height: 20px; }
.artifacts-setgroup { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 16px; padding: 6px 20px; display: flex; flex-direction: column; flex: none; }
.artifacts-setrow { border-bottom: 1px solid var(--dsw-alias-border-l2); justify-content: space-between; align-items: center; gap: 16px; padding: 12px 2px; display: flex; }
.artifacts-setrow:last-child { border-bottom: none; }
.artifacts-settext { flex-direction: column; gap: 4px; min-width: 0; display: flex; }
.artifacts-settitle { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.artifacts-setdesc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.artifacts-switch { cursor: pointer; flex: none; display: inline-flex; position: relative; }
.artifacts-switch input { opacity: 0; width: 1px; height: 1px; margin: 0; position: absolute; }
.artifacts-switch-track { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; align-items: center; width: 36px; height: 20px; padding: 2px; transition: background .15s, border-color .15s; display: inline-flex; }
.artifacts-switch-thumb { background: var(--dsw-alias-label-secondary); border-radius: 50%; width: 14px; height: 14px; transition: transform .15s, background .15s; display: block; }
.artifacts-switch:hover .artifacts-switch-track { border-color: var(--dsw-alias-label-dimmed); }
.artifacts-switch input:checked + .artifacts-switch-track { border-color: var(--dsw-alias-button-primary-fill); background: var(--dsw-alias-button-primary-fill); }
.artifacts-switch input:checked + .artifacts-switch-track .artifacts-switch-thumb { background: var(--dsw-alias-bg-layer-3); transform: translate(16px); }
.artifacts-switch input:focus-visible + .artifacts-switch-track { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.artifacts-setcontrol { flex: none; align-items: center; gap: 6px; display: flex; }
.artifacts-widthinput { width: 76px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; border-radius: 6px; padding: 4px 8px; }
.artifacts-suffix { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }
.artifacts-code { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-code-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }
.artifacts-code-gutter { flex: none; min-width: 2.2em; margin: 0; padding: 12px 6px 12px 8px; text-align: right; color: var(--dsw-alias-label-tertiary); border-right: 1px solid var(--dsw-alias-border-l1); position: sticky; left: 0; user-select: none; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre { flex: 1; margin: 0; padding: 12px; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--shiki-foreground, var(--dsw-alias-label-primary)); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre code { font: inherit; color: inherit; }
.artifacts-code-line { display: block; }
.tok-comment { color: #868e96; }
.tok-string { color: #2f9e44; }
.tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
.tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
.tok-function, .tok-decorator { color: #6741d9; }
.tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
.tok-property { color: #495057; }
body[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
body[data-ds-dark-theme] .tok-string { color: #69db7c; }
body[data-ds-dark-theme] .tok-number, body[data-ds-dark-theme] .tok-bool, body[data-ds-dark-theme] .tok-variable, body[data-ds-dark-theme] .tok-hex, body[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
body[data-ds-dark-theme] .tok-keyword, body[data-ds-dark-theme] .tok-important, body[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
body[data-ds-dark-theme] .tok-function, body[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
body[data-ds-dark-theme] .tok-class, body[data-ds-dark-theme] .tok-builtin, body[data-ds-dark-theme] .tok-tag, body[data-ds-dark-theme] .tok-key { color: #74c0fc; }
body[data-ds-dark-theme] .tok-property { color: #ced4da; }
`;
	/** 注入样式（幂等：已存在则跳过） */
	function insertStyles() {
		if (typeof document === "undefined") return;
		const id = "dsh-flyout-sidebar-styles";
		if (document.getElementById(id)) return;
		const el = document.createElement("style");
		el.id = id;
		el.textContent = styleCss;
		document.head.appendChild(el);
	}
	//#endregion
	//#region src/shared/ext.js
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
	const EXT_IMAGE = {
		png: 1,
		jpg: 1,
		jpeg: 1,
		gif: 1,
		webp: 1,
		svg: 1,
		bmp: 1,
		ico: 1,
		avif: 1
	};
	/** @type {Record<string, number>} */
	const EXT_PDF = { pdf: 1 };
	/** @type {Record<string, number>} */
	const EXT_MARKDOWN = {
		md: 1,
		markdown: 1,
		mdx: 1,
		mdown: 1
	};
	/** @type {Record<string, number>} */
	const EXT_HTML = {
		html: 1,
		htm: 1,
		xhtml: 1
	};
	/**
	* @param {string} path
	* @returns {'image' | 'pdf' | 'markdown' | 'html' | 'text'}
	*/
	function extType(path) {
		const ext = fileExt(path);
		if (EXT_IMAGE[ext]) return "image";
		if (EXT_PDF[ext]) return "pdf";
		if (EXT_MARKDOWN[ext]) return "markdown";
		if (EXT_HTML[ext]) return "html";
		return "text";
	}
	/** @param {string} path @returns {string} 小写扩展名（无扩展名时为 ''） */
	function fileExt(path) {
		const m = /\.([^.]+)$/.exec(String(path || ""));
		return m ? (m[1] || "").toLowerCase() : "";
	}
	//#endregion
	//#region src/client/store.ts
	const basename = (p) => {
		const parts = String(p).split("/");
		return parts[parts.length - 1] || p;
	};
	/** 当前会话 id（读自客户端会话库；文件树把它传给 host 以定位工作区） */
	function currentSessionId() {
		try {
			const list = ctx.get("sessions")?.list;
			if (list && typeof list.getSnapshot === "function") {
				const snap = list.getSnapshot();
				const id = snap ? snap.current != null ? snap.current : snap.active : void 0;
				return typeof id === "string" ? id : "";
			}
		} catch {}
		return "";
	}
	/**
	* 把 `@path` 写进当前会话输入框草稿。成功返回 true；输入 API 不可用时返回
	* false（调用方回退到剪贴板复制）。
	*/
	function quoteToComposer(path) {
		try {
			const sessions = ctx.get("sessions");
			const conversation = ctx.get("conversation");
			if (!sessions || !conversation) return false;
			const list = sessions.list;
			let sessionId;
			if (list && typeof list.getSnapshot === "function") {
				const snap = list.getSnapshot();
				const id = snap ? snap.current != null ? snap.current : snap.active : void 0;
				if (typeof id === "string") sessionId = id;
			}
			if (sessionId == null) return false;
			const actx = typeof sessions.scope === "function" ? sessions.scope(sessionId) : void 0;
			if (!actx) return false;
			const input = conversation.input && typeof conversation.input.for === "function" ? conversation.input.for(actx) : void 0;
			if (!input || typeof input.setDraft !== "function") return false;
			let draft = "";
			try {
				if (input.state && typeof input.state.getSnapshot === "function") draft = input.state.getSnapshot()?.draft || "";
			} catch {}
			const text = "@" + path;
			input.setDraft(draft && draft.trim() !== "" ? draft + " " + text : text);
			return true;
		} catch {
			return false;
		}
	}
	const fallbackCopy = (text) => {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
		} catch {}
	};
	/** 面板开/关共享状态：角落触发按钮与浮动面板之间的单一事实来源 */
	const store = {
		open: false,
		listeners: [],
		setOpen(v) {
			if (this.open === v) return;
			this.open = v;
			for (const fn of this.listeners) try {
				fn(v);
			} catch {}
		},
		toggle() {
			this.setOpen(!this.open);
		},
		subscribe(fn) {
			this.listeners.push(fn);
			return () => {
				this.listeners = this.listeners.filter((f) => f !== fn);
			};
		}
	};
	const useOpen = () => {
		const [open, setOpen] = React.useState(store.open);
		React.useEffect(() => store.subscribe(setOpen), []);
		return open;
	};
	const SETTINGS_KEY = "dsh-flyout-sidebar:settings";
	const DEFAULT_SETTINGS = {
		autoRefresh: true,
		minPanelWidth: 20,
		showFileTree: true,
		defaultOpen: true
	};
	function loadSettings() {
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") return {
					...DEFAULT_SETTINGS,
					...parsed
				};
			}
		} catch {}
		return { ...DEFAULT_SETTINGS };
	}
	const settingsStore = {
		data: loadSettings(),
		listeners: [],
		get() {
			return this.data;
		},
		set(key, value) {
			const next = {
				...this.data,
				[key]: value
			};
			this.data = next;
			try {
				localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
			} catch {}
			for (const fn of this.listeners) try {
				fn(next);
			} catch {}
		},
		subscribe(fn) {
			this.listeners.push(fn);
			return () => {
				this.listeners = this.listeners.filter((f) => f !== fn);
			};
		}
	};
	store.open = !!settingsStore.get().defaultOpen;
	const slideState = {
		visible: store.open,
		slidOut: !store.open
	};
	const slideListeners = [];
	const setSlide = (patch) => {
		let changed = false;
		for (const key of ["visible", "slidOut"]) {
			const v = patch[key];
			if (v !== void 0 && v !== slideState[key]) {
				slideState[key] = v;
				changed = true;
			}
		}
		if (!changed) return;
		const next = { ...slideState };
		for (const fn of slideListeners) try {
			fn(next);
		} catch {}
	};
	let slideTimer = null;
	store.subscribe((open) => {
		if (open) {
			if (slideTimer) {
				clearTimeout(slideTimer);
				slideTimer = null;
			}
			setSlide({ visible: true });
			requestAnimationFrame(() => requestAnimationFrame(() => setSlide({ slidOut: false })));
		} else {
			setSlide({ slidOut: true });
			slideTimer = setTimeout(() => {
				slideTimer = null;
				setSlide({ visible: false });
			}, 240);
		}
	});
	const useSlide = () => {
		const [s, setS] = React.useState({ ...slideState });
		React.useEffect(() => {
			slideListeners.push(setS);
			return () => {
				const i = slideListeners.indexOf(setS);
				if (i >= 0) slideListeners.splice(i, 1);
			};
		}, []);
		return s;
	};
	const useSettings = () => {
		const [s, setS] = React.useState(settingsStore.get());
		React.useEffect(() => settingsStore.subscribe(setS), []);
		return s;
	};
	/** 订阅客户端会话库：工作区切换时自动返回新的会话 id（触发组件重新取数） */
	function useSessionId() {
		const [sessionId, setSessionId] = React.useState(currentSessionId());
		React.useEffect(() => {
			let list;
			try {
				list = ctx.get("sessions")?.list;
			} catch {
				list = void 0;
			}
			if (!list || typeof list.subscribe !== "function") return;
			return list.subscribe(() => setSessionId(currentSessionId()));
		}, []);
		return sessionId;
	}
	//#endregion
	//#region src/shared/highlight.js
	/**
	* 共享：零依赖语法高亮器（无模板字面量以外的构建期依赖，正则引擎全部内联）。
	*
	* 可移植性约束见 ext.ts 顶部说明：本文件经 `?raw` 原样内联进独立弹出页的
	* 经典 <script>，因此只能使用 JSDoc 标注类型。输出 span.tok-* 令牌，颜色
	* 由两端各自的 CSS（styles.ts / page 模板）负责。
	*/
	/** @param {string} s @returns {string} */
	function escHtml(s) {
		return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}
	/**
	* @param {[string, string][]} specs [令牌类名, 正则源] 列表，顺序即优先级
	* @param {string} [flags]
	* @returns {(code: string) => string}
	*/
	function makeHl(specs, flags) {
		let src = "";
		for (let i = 0; i < specs.length; i += 1) {
			const spec = specs[i];
			if (!spec) continue;
			src += (i ? "|" : "") + "(" + spec[1] + ")";
		}
		const re = new RegExp(src, flags || "g");
		return (code) => {
			re.lastIndex = 0;
			let out = "";
			let last = 0;
			let m;
			while ((m = re.exec(code)) !== null) {
				if (m.index > last) out += escHtml(code.slice(last, m.index));
				for (let g = 1; g < m.length; g += 1) {
					const tok = m[g];
					if (tok !== void 0) {
						const spec = specs[g - 1];
						if (spec) out += "<span class=\"tok-" + spec[0] + "\">" + escHtml(tok) + "</span>";
						break;
					}
				}
				last = re.lastIndex;
				if (m[0].length === 0) {
					re.lastIndex += 1;
					last = re.lastIndex;
				}
			}
			if (last < code.length) out += escHtml(code.slice(last));
			return out;
		};
	}
	const S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\"";
	const S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27";
	const S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60";
	const NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b";
	const C_LINE = "//[^\\n]*";
	const C_BLK = "/\\*[\\s\\S]*?\\*/";
	const HASH = "#[^\\n]*";
	const HTML_COMMENT = "<!--[\\s\\S]*?-->";
	const CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b";
	const HEX = "#[0-9a-fA-F]{3,8}\\b";
	const AT = "@[\\w-]+";
	const PROP = "[\\w-]+(?=\\s*:)";
	const TAG = "</?[\\w-]+|/?>";
	const ATTR = "[\\w-]+(?==)";
	const VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)";
	const VAR_PHP = "\\$\\w+";
	const DECORATOR = "@[\\w.]+";
	const IMPORTANT = "!important\\b";
	const FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()";
	const FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()";
	const CLASS = "\\b[A-Z][\\w$]*\\b";
	const YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)";
	/** @param {string} kw 空白分隔的关键字列表 @returns {string} */
	function kwWord(kw) {
		return "\\b(?:" + kw.replace(/\s+/g, "|") + ")\\b";
	}
	const JS_KW = "break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false";
	const PY_KW = "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self";
	const SH_KW = "if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source";
	const SQL_KW = "select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc";
	const C_KW = "auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while";
	const GO_KW = "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var";
	const RUST_KW = "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while";
	const JAVA_KW = "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while";
	const RB_KW = "begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield";
	const PHP_KW = "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield";
	/** @param {string} kw @returns {(code: string) => string} */
	function cFamily(kw) {
		return makeHl([
			["comment", C_LINE + "|" + C_BLK],
			["string", S_BT + "|" + S_DQ + "|" + S_SQ],
			["number", NUM],
			["keyword", kwWord(kw)],
			["function", FUNC],
			["class", CLASS]
		]);
	}
	/** @type {Record<string, (code: string) => string>} */
	const HL_ENGINES = {
		js: makeHl([
			["comment", C_LINE + "|" + C_BLK],
			["string", S_BT + "|" + S_DQ + "|" + S_SQ],
			["number", NUM],
			["keyword", kwWord(JS_KW)],
			["builtin", "\\b(?:console|Math|JSON|Promise|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Infinity|NaN|window|document|process|require|module|exports|setTimeout|clearTimeout|fetch|globalThis)\\b"],
			["function", FUNC],
			["class", CLASS]
		]),
		py: makeHl([
			["comment", HASH],
			["string", "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)|(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)"],
			["number", NUM],
			["keyword", kwWord(PY_KW)],
			["builtin", "\\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple|type|isinstance|super|open|input|repr|format|sorted|reversed|sum|min|max|abs|round|any|all|next|iter|dir|vars|getattr|setattr|hasattr|id|hash|bytes|bytearray|complex|frozenset|object|classmethod|staticmethod|property|Exception|ValueError|TypeError|KeyError|IndexError|ImportError|RuntimeError|StopIteration)\\b"],
			["decorator", DECORATOR],
			["function", FUNC_PY]
		]),
		css: makeHl([
			["comment", C_BLK],
			["string", S_DQ + "|" + S_SQ],
			["atrule", AT],
			["property", PROP],
			["number", CSS_NUM],
			["hex", HEX],
			["important", IMPORTANT]
		]),
		html: makeHl([
			["comment", HTML_COMMENT],
			["string", S_DQ + "|" + S_SQ],
			["tag", TAG],
			["attr", ATTR]
		]),
		sh: makeHl([
			["comment", HASH],
			["string", S_DQ + "|" + S_SQ + "|" + S_BT],
			["variable", VAR],
			["number", NUM],
			["keyword", kwWord(SH_KW)]
		]),
		yaml: makeHl([
			["comment", HASH],
			["string", S_DQ + "|" + S_SQ],
			["number", NUM],
			["bool", "\\b(?:true|false|null|yes|no|on|off)\\b"],
			["key", YAML_KEY]
		], "gm"),
		sql: makeHl([
			["comment", "--[^\\n]*|" + C_BLK],
			["string", S_SQ + "|" + S_DQ],
			["number", NUM],
			["keyword", kwWord(SQL_KW)],
			["function", FUNC_PY]
		], "gi"),
		json: makeHl([
			["string", S_DQ],
			["number", NUM],
			["bool", "\\b(?:true|false|null)\\b"]
		]),
		c: cFamily(C_KW),
		cpp: cFamily(C_KW),
		go: cFamily(GO_KW),
		rust: cFamily(RUST_KW),
		java: cFamily(JAVA_KW),
		rb: makeHl([
			["comment", HASH],
			["string", S_DQ + "|" + S_SQ],
			["number", NUM],
			["keyword", kwWord(RB_KW)],
			["function", FUNC_PY],
			["class", CLASS]
		]),
		php: makeHl([
			["comment", C_LINE + "|" + C_BLK + "|" + HASH],
			["string", S_DQ + "|" + S_SQ],
			["variable", VAR_PHP],
			["number", NUM],
			["keyword", kwWord(PHP_KW)],
			["function", FUNC_PY]
		])
	};
	/** @type {Record<string, string>} */
	const HL_LANG_MAP = {
		js: "js",
		mjs: "js",
		cjs: "js",
		jsx: "js",
		javascript: "js",
		ts: "js",
		tsx: "js",
		mts: "js",
		cts: "js",
		typescript: "js",
		json: "json",
		jsonc: "json",
		json5: "js",
		py: "py",
		python: "py",
		pyw: "py",
		rb: "rb",
		ruby: "rb",
		go: "go",
		golang: "go",
		rs: "rust",
		rust: "rust",
		java: "java",
		c: "c",
		h: "c",
		cc: "cpp",
		cpp: "cpp",
		cxx: "cpp",
		hpp: "cpp",
		cs: "c",
		csharp: "c",
		kotlin: "c",
		kt: "c",
		swift: "c",
		php: "php",
		yaml: "yaml",
		yml: "yaml",
		toml: "sh",
		ini: "sh",
		conf: "sh",
		properties: "sh",
		env: "sh",
		md: "md",
		markdown: "md",
		mdx: "md",
		html: "html",
		htm: "html",
		xhtml: "html",
		vue: "html",
		xml: "html",
		svg: "html",
		css: "css",
		scss: "css",
		less: "css",
		sql: "sql",
		lua: "c",
		sh: "sh",
		bash: "sh",
		shell: "sh",
		zsh: "sh",
		fish: "sh"
	};
	/** @param {string} hint 扩展名或语言名 @returns {string} 引擎键名 */
	function hlLangOf(hint) {
		let h = String(hint || "").toLowerCase();
		if (h.charAt(0) === ".") h = h.slice(1);
		return HL_LANG_MAP[h] || "plain";
	}
	/** @param {string} src @param {string} hint @returns {string} HTML */
	function highlightCode(src, hint) {
		const fn = HL_ENGINES[hlLangOf(hint)];
		return fn ? fn(String(src)) : escHtml(src);
	}
	//#endregion
	//#region src/shared/markdown.js
	/**
	* 共享：极简 Markdown → HTML 渲染器。
	*
	* 可移植性约束见 ext.ts 顶部说明：本文件经 `?raw` 原样内联进独立弹出页的
	* 经典 <script>，只能使用 JSDoc 标注类型。围栏代码块通过 shared/highlight
	* 的 highlightCode 高亮。
	*/
	/** @param {string} s @returns {string} */
	function mdEscape(s) {
		return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}
	/** @param {string} s @returns {string} */
	function mdInline(s) {
		s = s.replace(/`([^`]+)`/g, (m, c) => "<code>" + c + "</code>");
		s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, "<img alt=\"$1\" src=\"$2\">");
		s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>");
		s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
		s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
		return s;
	}
	/** @param {string} src @returns {string} HTML */
	function mdToHtml(src) {
		const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
		/** @type {string[]} */
		const out = [];
		let i = 0;
		while (i < lines.length) {
			const line = lines[i];
			if (/^\s*```/.test(line)) {
				const fence = /^\s*```([\w+-]*)/.exec(line);
				const langHint = fence ? fence[1] || "" : "";
				/** @type {string[]} */
				const buf = [];
				i += 1;
				while (i < lines.length && !/^\s*```/.test(lines[i])) {
					buf.push(lines[i]);
					i += 1;
				}
				i += 1;
				out.push("<pre><code>" + highlightCode(buf.join("\n"), langHint) + "</code></pre>");
				continue;
			}
			const h = /^(#{1,6})\s+(.*)$/.exec(line);
			if (h) {
				const lv = (h[1] || "").length;
				out.push("<h" + lv + ">" + mdInline(mdEscape(h[2])) + "</h" + lv + ">");
				i += 1;
				continue;
			}
			if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
				out.push("<hr>");
				i += 1;
				continue;
			}
			if (/^\s*>\s?/.test(line)) {
				/** @type {string[]} */
				const q = [];
				while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
					q.push(lines[i].replace(/^\s*>\s?/, ""));
					i += 1;
				}
				out.push("<blockquote>" + mdInline(mdEscape(q.join(" "))) + "</blockquote>");
				continue;
			}
			if (/^\s*[-*+]\s+/.test(line)) {
				/** @type {string[]} */
				const lis = [];
				while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
					lis.push(mdInline(mdEscape(lines[i].replace(/^\s*[-*+]\s+/, ""))));
					i += 1;
				}
				out.push("<ul>" + lis.map((x) => "<li>" + x + "</li>").join("") + "</ul>");
				continue;
			}
			if (/^\s*\d+\.\s+/.test(line)) {
				/** @type {string[]} */
				const lis2 = [];
				while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
					lis2.push(mdInline(mdEscape(lines[i].replace(/^\s*\d+\.\s+/, ""))));
					i += 1;
				}
				out.push("<ol>" + lis2.map((x) => "<li>" + x + "</li>").join("") + "</ol>");
				continue;
			}
			if (line.trim() === "") {
				i += 1;
				continue;
			}
			out.push("<p>" + mdInline(mdEscape(line)) + "</p>");
			i += 1;
		}
		return out.join("\n");
	}
	//#endregion
	//#region src/client/preview.tsx
	/**
	* Client 侧：预览渲染 —— 代码视图（行号 + 语法高亮）、git diff 视图、
	* 自定义 pdf.js 渲染器、Markdown / 图片 / HTML 沙箱、多类型分发。
	*/
	function renderDiff(diff) {
		return /* @__PURE__ */ h("div", { className: "artifacts-diff" }, diff && diff.before != null && diff.before !== "" ? /* @__PURE__ */ h("div", { className: "artifacts-diff-block artifacts-diff-del" }, /* @__PURE__ */ h("div", { className: "artifacts-diff-label" }, "- 删除"), /* @__PURE__ */ h("pre", { className: "artifacts-diff-pre" }, diff.before)) : null, /* @__PURE__ */ h("div", { className: "artifacts-diff-block artifacts-diff-add" }, /* @__PURE__ */ h("div", { className: "artifacts-diff-label" }, "+ 新增"), /* @__PURE__ */ h("pre", { className: "artifacts-diff-pre" }, diff && diff.after != null ? diff.after : "")));
	}
	/** 代码预览：行号栏 + 语法高亮代码（共享高亮器，语言取自扩展名） */
	function CodeView({ code, path }) {
		const src = String(code || "");
		return /* @__PURE__ */ h("div", { className: "artifacts-code" }, /* @__PURE__ */ h("div", { className: "artifacts-code-scroll" }, /* @__PURE__ */ h("pre", {
			className: "artifacts-code-gutter",
			"aria-hidden": "true"
		}, src.replace(/\n$/, "").split("\n").map((_, i) => String(i + 1)).join("\n")), /* @__PURE__ */ h("pre", { className: "artifacts-code-pre" }, /* @__PURE__ */ h("code", { dangerouslySetInnerHTML: { __html: highlightCode(src, fileExt(path || "")) } }))));
	}
	let pdfjsPromise = null;
	function loadPdfjs() {
		if (typeof window === "undefined") return Promise.reject(/* @__PURE__ */ new Error("no window"));
		if (window.pdfjsLib) {
			try {
				window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/flyout-sidebar/pdfjs/pdf.worker.min.js";
			} catch {}
			return Promise.resolve(window.pdfjsLib);
		}
		if (pdfjsPromise) return pdfjsPromise;
		pdfjsPromise = new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.src = "/flyout-sidebar/pdfjs/pdf.min.js";
			s.async = true;
			s.onload = () => {
				try {
					if (!window.pdfjsLib) throw new Error("pdf.js 加载失败");
					window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/flyout-sidebar/pdfjs/pdf.worker.min.js";
					resolve(window.pdfjsLib);
				} catch (e) {
					reject(e);
				}
			};
			s.onerror = () => {
				pdfjsPromise = null;
				reject(/* @__PURE__ */ new Error("pdf.js 加载失败"));
			};
			document.head.appendChild(s);
		});
		return pdfjsPromise;
	}
	function PdfView({ path }) {
		const [phase, setPhase] = React.useState("loading");
		const [error, setError] = React.useState(null);
		const [pageCount, setPageCount] = React.useState(0);
		const [pageNo, setPageNo] = React.useState(1);
		const [zoom, setZoom] = React.useState(1);
		const [fitScale, setFitScale] = React.useState(null);
		const scrollRef = React.useRef(null);
		const canvasRef = React.useRef(null);
		const docRef = React.useRef(null);
		const taskRef = React.useRef(null);
		React.useEffect(() => {
			let alive = true;
			setPhase("loading");
			setError(null);
			setPageCount(0);
			setPageNo(1);
			setZoom(1);
			setFitScale(null);
			loadPdfjs().then((lib) => {
				const url = "/flyout-sidebar/media?path=" + encodeURIComponent(path);
				return lib.getDocument({ url }).promise;
			}).then((doc) => {
				if (!alive) {
					try {
						doc.destroy();
					} catch {}
					return;
				}
				docRef.current = doc;
				setPageCount(doc.numPages || 0);
				setPhase("ready");
			}).catch((e) => {
				if (alive) {
					setError(e instanceof Error && e.message ? e.message : String(e));
					setPhase("error");
				}
			});
			return () => {
				alive = false;
				if (taskRef.current) try {
					taskRef.current.cancel();
				} catch {}
				if (docRef.current) {
					try {
						docRef.current.destroy();
					} catch {}
					docRef.current = null;
				}
			};
		}, [path]);
		React.useEffect(() => {
			if (phase !== "ready" || fitScale != null) return;
			const scroll = scrollRef.current;
			const doc = docRef.current;
			if (!scroll || !doc) return;
			let w = scroll.clientWidth;
			if (typeof window.getComputedStyle === "function") try {
				const cs = window.getComputedStyle(scroll);
				w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
			} catch {}
			if (!w) return;
			doc.getPage(1).then((pageObj) => {
				const vp = pageObj.getViewport({ scale: 1 });
				if (vp && vp.width > 0) setFitScale(w / vp.width);
			}).catch(() => {});
		}, [phase, fitScale]);
		React.useEffect(() => {
			if (phase !== "ready" || fitScale == null) return;
			const canvas = canvasRef.current;
			const doc = docRef.current;
			if (!canvas || !doc) return;
			let alive = true;
			doc.getPage(pageNo).then((pageObj) => {
				if (!alive) return;
				const scale = fitScale * zoom;
				const viewport = pageObj.getViewport({ scale });
				const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
				canvas.width = Math.floor(viewport.width * dpr);
				canvas.height = Math.floor(viewport.height * dpr);
				canvas.style.width = Math.floor(viewport.width) + "px";
				canvas.style.height = Math.floor(viewport.height) + "px";
				const ctx2d = canvas.getContext("2d");
				if (!ctx2d) return;
				if (taskRef.current) try {
					taskRef.current.cancel();
				} catch {}
				taskRef.current = pageObj.render({
					canvasContext: ctx2d,
					viewport,
					transform: dpr !== 1 ? [
						dpr,
						0,
						0,
						dpr,
						0,
						0
					] : null
				});
			}).catch(() => {});
			return () => {
				alive = false;
			};
		}, [
			phase,
			pageNo,
			zoom,
			fitScale
		]);
		const clampPage = (n) => Math.max(1, Math.min(pageCount || 1, n));
		const goPage = (n) => setPageNo(clampPage(n));
		const zoomBy = (f) => setZoom((z) => Math.max(.25, Math.min(4, Math.round(z * f * 100) / 100)));
		if (phase === "loading") return /* @__PURE__ */ h("div", { className: "artifacts-pdfview" }, /* @__PURE__ */ h("div", { className: "artifacts-hint" }, "加载 PDF…"));
		if (phase === "error") return /* @__PURE__ */ h("embed", {
			className: "artifacts-pdf",
			src: "/flyout-sidebar/media?path=" + encodeURIComponent(path),
			type: "application/pdf",
			title: path
		});
		const disabled = pageCount <= 0;
		return /* @__PURE__ */ h("div", { className: "artifacts-pdfview" }, /* @__PURE__ */ h("div", { className: "artifacts-pdfview-bar" }, /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-pdfview-btn",
			title: "缩小",
			disabled,
			onClick: () => zoomBy(.8)
		}, "−"), /* @__PURE__ */ h("span", { className: "artifacts-pdfview-zoom" }, Math.round(zoom * 100) + "%"), /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-pdfview-btn",
			title: "放大",
			disabled,
			onClick: () => zoomBy(1.25)
		}, "＋"), /* @__PURE__ */ h("span", { className: "artifacts-pdfview-spacer" }), /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-pdfview-btn",
			title: "上一页",
			disabled: disabled || pageNo <= 1,
			onClick: () => goPage(pageNo - 1)
		}, "‹"), /* @__PURE__ */ h("span", { className: "artifacts-pdfview-page" }, pageNo + " / " + pageCount), /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-pdfview-btn",
			title: "下一页",
			disabled: disabled || pageNo >= pageCount,
			onClick: () => goPage(pageNo + 1)
		}, "›")), /* @__PURE__ */ h("div", {
			className: "artifacts-pdfview-scroll",
			ref: scrollRef
		}, /* @__PURE__ */ h("canvas", {
			ref: canvasRef,
			className: "artifacts-pdfview-canvas"
		})));
	}
	/** 统一 git diff 渲染：meta/hunk/+/- 行着色，等宽可滚动 */
	function GitDiffView({ diff }) {
		const text = String(diff || "");
		if (!text) return /* @__PURE__ */ h("div", { className: "artifacts-hint" }, "没有未提交的变更（相对于 HEAD）");
		return /* @__PURE__ */ h("div", { className: "artifacts-gitdiff" }, text.replace(/\n$/, "").split("\n").map((line, i) => {
			let cls = "gd-line";
			if (line.startsWith("@@")) cls += " gd-hunk";
			else if (line.startsWith("+") && !line.startsWith("+++")) cls += " gd-add";
			else if (line.startsWith("-") && !line.startsWith("---")) cls += " gd-del";
			else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("old mode") || line.startsWith("new mode") || line.startsWith("rename ") || line.startsWith("similarity ") || line.startsWith("copy ") || line.startsWith("Binary files") || line.startsWith("\\")) cls += " gd-meta";
			return /* @__PURE__ */ h("div", {
				key: i,
				className: cls
			}, line);
		}));
	}
	function renderPreview(p) {
		if (p.loading) return /* @__PURE__ */ h("div", { className: "artifacts-hint" }, "加载中…");
		if (p.ok === false) return /* @__PURE__ */ h("div", { className: "artifacts-error" }, p.error || "读取失败");
		if (p.git) return /* @__PURE__ */ h("div", { className: "artifacts-preview-body" }, /* @__PURE__ */ h(GitDiffView, { diff: p.diff }));
		const type = p.type || extType(p.path);
		let view;
		if (type === "image") view = /* @__PURE__ */ h("img", {
			className: "artifacts-img",
			src: "/flyout-sidebar/media?path=" + encodeURIComponent(p.path || ""),
			alt: p.path || ""
		});
		else if (type === "html") view = /* @__PURE__ */ h("iframe", {
			className: "artifacts-iframe",
			sandbox: "allow-scripts",
			srcDoc: p.content || "",
			title: p.path || ""
		});
		else if (type === "pdf") view = /* @__PURE__ */ h(PdfView, { path: p.path || "" });
		else if (type === "markdown") view = /* @__PURE__ */ h("div", {
			className: "artifacts-markdown",
			dangerouslySetInnerHTML: { __html: mdToHtml(p.content || "") }
		});
		else view = /* @__PURE__ */ h(Fragment, null, /* @__PURE__ */ h(CodeView, {
			code: p.content,
			path: p.path
		}), p.truncated ? /* @__PURE__ */ h("div", { className: "artifacts-diff-label" }, "(truncated preview)") : null);
		return /* @__PURE__ */ h("div", { className: "artifacts-preview-body" }, p.diff && typeof p.diff === "object" ? renderDiff(p.diff) : null, view);
	}
	//#endregion
	//#region src/client/icons.tsx
	/**
	* Client 侧：内联 SVG 图标（复刻 DSH primitives 图标风格，currentColor 跟随
	* 主题）。classic JSX 经 h 工厂编译。
	*/
	/** 面板图标：圆角矩形 + 右侧分隔线（主侧边栏开关的镜像） */
	const PanelIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("rect", {
		x: 1.5,
		y: 1.5,
		width: 13,
		height: 13,
		rx: 2.8,
		stroke: "currentColor",
		strokeWidth: 1.5
	}), /* @__PURE__ */ h("line", {
		x1: 10.2,
		y1: 2.6,
		x2: 10.2,
		y2: 13.4,
		stroke: "currentColor",
		strokeWidth: 1.5
	}));
	const FolderClosedIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		transform: "translate(1.5 2.429)",
		d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z",
		fill: "currentColor"
	}));
	const FolderOpenIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z",
		fill: "currentColor"
	}), /* @__PURE__ */ h("path", {
		opacity: .2,
		d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z",
		fill: "currentColor"
	}));
	const FileCodeIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		fillRule: "evenodd",
		clipRule: "evenodd",
		d: "M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z",
		fill: "currentColor"
	}));
	const RefreshIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		d: "M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z",
		fill: "currentColor"
	}));
	/** 弹出（↗）箭头：新标签页打开链接 */
	const FlyoutIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		d: "M3.5 12.5 L12.5 3.5 M6.2 3.5 H12.5 V9.8",
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		fill: "none"
	}));
	/** ⇥ 面板收起：箭头推入竖线（朝侧边栏）；预览隐藏时镜像（⇤）表示拉回 */
	const PanelCollapseIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("line", {
		x1: 12.5,
		y1: 3,
		x2: 12.5,
		y2: 13,
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round"
	}), /* @__PURE__ */ h("path", {
		d: "M3 8 H10 M7.8 5.6 L10.2 8 L7.8 10.4",
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		fill: "none"
	}));
	/** Git 变更（git 变更）：经典 git-branch 图形，用于文件树 ⇄ 变更列表切换 */
	const GitBranchIcon = ({ size }) => /* @__PURE__ */ h("svg", {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true"
	}, /* @__PURE__ */ h("path", {
		d: "M4.5 4.6v6.8",
		stroke: "currentColor",
		strokeWidth: 1.4,
		strokeLinecap: "round",
		fill: "none"
	}), /* @__PURE__ */ h("circle", {
		cx: 4.5,
		cy: 3,
		r: 1.7,
		stroke: "currentColor",
		strokeWidth: 1.4,
		fill: "none"
	}), /* @__PURE__ */ h("circle", {
		cx: 4.5,
		cy: 13,
		r: 1.7,
		stroke: "currentColor",
		strokeWidth: 1.4,
		fill: "none"
	}), /* @__PURE__ */ h("circle", {
		cx: 11.5,
		cy: 3,
		r: 1.7,
		stroke: "currentColor",
		strokeWidth: 1.4,
		fill: "none"
	}), /* @__PURE__ */ h("path", {
		d: "M11.5 4.7v1.1c0 1.9-1.6 3.1-3.6 3.1-1.9 0-3.4 1.2-3.4 1.2",
		stroke: "currentColor",
		strokeWidth: 1.4,
		strokeLinecap: "round",
		fill: "none"
	}));
	//#endregion
	//#region src/client/components.tsx
	/**
	* Client 侧：UI 组件 —— 文件树、多标签预览侧边面板、角落触发按钮、设置区。
	*/
	function FileTree({ onOpen, selectedPath, refreshToken }) {
		const [root, setRoot] = React.useState(null);
		const [children, setChildren] = React.useState({});
		const [expanded, setExpanded] = React.useState({});
		const [copiedPath, setCopiedPath] = React.useState(null);
		const [copiedLabel, setCopiedLabel] = React.useState("");
		const copyTimer = React.useRef(null);
		const rootTimer = React.useRef(null);
		const sessionId = useSessionId();
		const loadRoot = () => {
			setChildren({});
			setExpanded({});
			setRoot(null);
			if (rootTimer.current) clearTimeout(rootTimer.current);
			const attempt = (tries) => {
				host.listDir("", currentSessionId()).then((res) => {
					if (res && res.ok) setRoot({
						path: res.path || "",
						entries: res.entries || []
					});
					else if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400);
				}).catch(() => {
					if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400);
				});
			};
			attempt(3);
		};
		React.useEffect(() => {
			loadRoot();
		}, [sessionId, refreshToken]);
		React.useEffect(() => () => {
			if (rootTimer.current) clearTimeout(rootTimer.current);
		}, []);
		const toggle = (path) => {
			const nextExpanded = {
				...expanded,
				[path]: !expanded[path]
			};
			setExpanded(nextExpanded);
			if (nextExpanded[path] && !children[path]) {
				setChildren({
					...children,
					[path]: { loading: true }
				});
				host.listDir(path, currentSessionId()).then((res) => {
					setChildren((prev) => ({
						...prev,
						[path]: res && res.ok ? { entries: res.entries || [] } : { error: res && res.error || "读取失败" }
					}));
				}).catch(() => {
					setChildren((prev) => ({
						...prev,
						[path]: { error: "读取失败" }
					}));
				});
			}
		};
		const copyRef = (path) => {
			const text = "@" + path;
			let label = "已复制";
			const done = () => {
				setCopiedPath(path);
				setCopiedLabel(label);
				if (copyTimer.current) clearTimeout(copyTimer.current);
				copyTimer.current = setTimeout(() => {
					setCopiedPath(null);
					setCopiedLabel("");
				}, 1600);
			};
			if (quoteToComposer(path)) {
				label = "已插入输入框";
				done();
				return;
			}
			if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {
				fallbackCopy(text);
				done();
			});
			else {
				fallbackCopy(text);
				done();
			}
		};
		const rowActions = (entry) => copiedPath === entry.path ? /* @__PURE__ */ h("span", { className: "artifacts-tree-copied" }, copiedLabel || "已复制") : /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-tree-ref",
			title: "引用到输入框（失败则复制 @path）",
			onClick: (e) => {
				e.stopPropagation();
				copyRef(entry.path);
			}
		}, "@引用");
		const renderNode = (entry, depth, flashDelay) => {
			const pad = { paddingLeft: 6 + depth * 20 };
			const isSelected = selectedPath === entry.path;
			const rowClass = "artifacts-tree-row" + (entry.hidden ? " artifacts-tree-hidden" : "") + (isSelected ? " is-selected" : "");
			if (entry.isDir) {
				const isExpanded = !!expanded[entry.path];
				const node = children[entry.path];
				return /* @__PURE__ */ h("div", {
					key: entry.path,
					className: flashDelay != null ? "artifacts-tree-node artifacts-flash-in" : "artifacts-tree-node",
					style: flashDelay != null ? { animationDelay: flashDelay + "ms" } : void 0
				}, /* @__PURE__ */ h("div", {
					role: "button",
					tabIndex: 0,
					className: rowClass + " artifacts-tree-dir",
					style: pad,
					onClick: () => toggle(entry.path),
					onKeyDown: (ev) => {
						if (ev.key === "Enter" || ev.key === " ") {
							ev.preventDefault();
							toggle(entry.path);
						}
					},
					title: entry.path
				}, isExpanded ? /* @__PURE__ */ h(FolderOpenIcon, { size: 14 }) : /* @__PURE__ */ h(FolderClosedIcon, { size: 14 }), /* @__PURE__ */ h("span", { className: "artifacts-tree-name" }, entry.name), rowActions(entry)), isExpanded ? node && node.loading ? /* @__PURE__ */ h("div", {
					className: "artifacts-tree-row artifacts-tree-loading",
					style: { paddingLeft: 6 + (depth + 1) * 20 + 20 }
				}, "加载中…") : node && node.error ? /* @__PURE__ */ h("div", {
					className: "artifacts-tree-row artifacts-tree-error",
					style: { paddingLeft: 6 + (depth + 1) * 20 + 20 }
				}, node.error) : node && node.entries ? node.entries.map((c) => renderNode(c, depth + 1)) : null : null);
			}
			return /* @__PURE__ */ h("div", {
				role: "button",
				tabIndex: 0,
				className: rowClass + (flashDelay != null ? " artifacts-flash-in" : ""),
				style: flashDelay != null ? {
					...pad,
					animationDelay: flashDelay + "ms"
				} : pad,
				onClick: () => {
					if (onOpen) onOpen(entry.path);
				},
				onKeyDown: (ev) => {
					if (ev.key === "Enter" || ev.key === " ") {
						ev.preventDefault();
						if (onOpen) onOpen(entry.path);
					}
				},
				title: entry.path
			}, /* @__PURE__ */ h(FileCodeIcon, { size: 14 }), /* @__PURE__ */ h("span", { className: "artifacts-tree-name" }, entry.name), rowActions(entry));
		};
		return /* @__PURE__ */ h("div", { className: "artifacts-tree" }, /* @__PURE__ */ h("div", { className: "artifacts-tree-body" }, !root ? /* @__PURE__ */ h("div", { className: "artifacts-hint" }, "加载文件树…") : !root.entries || !root.entries.length ? /* @__PURE__ */ h("div", { className: "artifacts-hint" }, "（空目录）") : root.entries.map((e, i) => renderNode(e, 0, Math.min(i, 12) * 45))));
	}
	function ArtifactsPanel() {
		const open = useOpen();
		const settings = useSettings();
		const [tabs, setTabs] = React.useState([]);
		const [activeKey, setActiveKey] = React.useState(null);
		const [previewHidden, setPreviewHidden] = React.useState(false);
		const sessionId = useSessionId();
		const firstSession = React.useRef(true);
		React.useEffect(() => {
			if (firstSession.current) {
				firstSession.current = false;
				return;
			}
			setTabs([]);
			setActiveKey(null);
			setPreviewHidden(false);
		}, [sessionId]);
		const [notice, setNotice] = React.useState("");
		const [gitFiles, setGitFiles] = React.useState(null);
		const [gitError, setGitError] = React.useState(null);
		const [panelWidth, setPanelWidth] = React.useState(null);
		const [resizing, setResizing] = React.useState(false);
		const [activeView, setActiveView] = React.useState(() => settings.showFileTree ? "tree" : "git");
		const [treeRefresh, setTreeRefresh] = React.useState(0);
		const [gitRefresh, setGitRefresh] = React.useState(0);
		const [gitRefreshing, setGitRefreshing] = React.useState(false);
		const [gitFlash, setGitFlash] = React.useState(0);
		const noticeTimer = React.useRef(null);
		const gitForceRef = React.useRef(false);
		React.useEffect(() => {
			if (!open || activeView !== "git") return;
			let alive = true;
			const load = () => {
				const force = gitForceRef.current;
				gitForceRef.current = false;
				host.gitStatus(currentSessionId(), force).then((res) => {
					if (!alive) return;
					if (force) {
						setGitRefreshing(false);
						setGitFlash((n) => n + 1);
					}
					if (res && res.ok) {
						setGitFiles(Array.isArray(res.entries) ? res.entries : []);
						setGitError(null);
					} else {
						setGitFiles([]);
						setGitError(res && res.error || "git status 失败");
					}
				}).catch((e) => {
					if (force) setGitRefreshing(false);
					if (alive) setGitError(e instanceof Error && e.message ? String(e.message) : String(e));
				});
			};
			load();
			let dispose;
			if (settings.autoRefresh) dispose = ctx.interval(load, 2e3);
			return () => {
				alive = false;
				if (dispose) dispose();
			};
		}, [
			open,
			activeView,
			settings.autoRefresh,
			gitRefresh,
			sessionId
		]);
		React.useEffect(() => {
			const KEY = "dsh-flyout-sidebar:session";
			const write = () => {
				try {
					const sid = currentSessionId();
					if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || "");
				} catch {}
			};
			write();
			let list;
			try {
				list = ctx.get("sessions")?.list;
			} catch {
				list = void 0;
			}
			if (!list || typeof list.subscribe !== "function") return;
			return list.subscribe(write);
		}, []);
		React.useEffect(() => {
			const KEY = "dsh-flyout-sidebar:theme";
			const isDark = () => {
				if (document.documentElement.hasAttribute("data-ds-dark-theme")) return true;
				if (document.body && document.body.hasAttribute("data-ds-dark-theme")) return true;
				return false;
			};
			const write = () => {
				try {
					const v = isDark() ? "dark" : "light";
					if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v);
				} catch {}
			};
			write();
			if (typeof MutationObserver !== "function") return;
			const obs = new MutationObserver(write);
			const opts = {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme"]
			};
			obs.observe(document.documentElement, opts);
			if (document.body) obs.observe(document.body, opts);
			return () => obs.disconnect();
		}, []);
		const minWidthPx = Math.max(80, Math.round(window.innerWidth * (settings.minPanelWidth || 0) / 100));
		const widthPx = panelWidth != null ? Math.max(panelWidth, minWidthPx) : minWidthPx;
		React.useEffect(() => {
			const root = document.documentElement;
			root.style.setProperty("--dsh-flyout-sidebar-width", open ? widthPx + "px" : "0px");
			return () => {
				root.style.setProperty("--dsh-flyout-sidebar-width", "0px");
			};
		}, [open, widthPx]);
		React.useEffect(() => {
			if (resizing) document.body.setAttribute("data-dsh-flyout-dragging", "");
			else document.body.removeAttribute("data-dsh-flyout-dragging");
			return () => {
				document.body.removeAttribute("data-dsh-flyout-dragging");
			};
		}, [resizing]);
		const { visible, slidOut } = useSlide();
		if (!visible) return null;
		const flyoutHref = "/flyout-sidebar" + (sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : "");
		const startResize = (e) => {
			e.preventDefault();
			setResizing(true);
			const rightOffset = (() => {
				const v = document.documentElement.style.getPropertyValue("--dsh-sidebar-width");
				const n = parseFloat(v);
				return Number.isFinite(n) ? n : 0;
			})();
			const onMove = (ev) => {
				const w = window.innerWidth - ev.clientX - rightOffset;
				setPanelWidth(Math.max(minWidthPx, Math.min(w, window.innerWidth - rightOffset - 24)));
			};
			const onUp = () => {
				setResizing(false);
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		};
		const flash = (msg) => {
			setNotice(msg);
			if (noticeTimer.current) clearTimeout(noticeTimer.current);
			noticeTimer.current = setTimeout(() => setNotice(""), 1600);
		};
		const copyText = (text, msg) => {
			const done = () => flash(msg);
			if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {
				fallbackCopy(text);
				done();
			});
			else {
				fallbackCopy(text);
				done();
			}
		};
		const quotePath = (path) => {
			if (quoteToComposer(path)) {
				flash("已插入输入框");
				return;
			}
			copyText("@" + path, "已复制 @引用（未能写入输入框）");
		};
		const patchTab = (key, patch) => setTabs((prev) => prev.map((t) => t.key === key ? {
			...t,
			...patch
		} : t));
		const openTab = (key, path, git, initial) => {
			setPreviewHidden(false);
			setTabs((prev) => {
				const i = prev.findIndex((t) => t.key === key);
				if (i >= 0) {
					const next = prev.slice();
					const cur = next[i];
					if (cur) next[i] = {
						...cur,
						...initial
					};
					return next;
				}
				return prev.concat([{
					key,
					path,
					git,
					...initial
				}]);
			});
			setActiveKey(key);
		};
		const closeTab = (key) => {
			const idx = tabs.findIndex((t) => t.key === key);
			const next = tabs.filter((t) => t.key !== key);
			setTabs(next);
			if (activeKey === key) setActiveKey(next.length ? next[Math.min(idx, next.length - 1)]?.key ?? null : null);
		};
		const activeTab = tabs.find((t) => t.key === activeKey) || null;
		const openFile = (path) => {
			const key = "p:" + path;
			const type = extType(path);
			const initial = {
				loading: false,
				type,
				diff: null
			};
			if (type !== "image" && type !== "pdf") initial.loading = true;
			openTab(key, path, false, initial);
			if (type === "image" || type === "pdf") return;
			host.readArtifact(path).then((res) => {
				patchTab(key, {
					loading: false,
					...res
				});
			}).catch((e) => {
				patchTab(key, {
					loading: false,
					ok: false,
					error: String(e instanceof Error && e.message ? e.message : e)
				});
			});
		};
		const openGitDiff = (path) => {
			const key = "g:" + path;
			openTab(key, path, true, { loading: true });
			host.gitDiff(path, currentSessionId()).then((res) => {
				patchTab(key, {
					loading: false,
					...res
				});
			}).catch((e) => {
				patchTab(key, {
					loading: false,
					ok: false,
					error: String(e instanceof Error && e.message ? e.message : e)
				});
			});
		};
		const gitLabel = (e) => {
			if (e.x === "?" || e.y === "?") return "U";
			return (e.y !== " " ? e.y : e.x) || "M";
		};
		const gitTitle = (e) => {
			const label = gitLabel(e);
			const map = {
				U: "未跟踪",
				A: "新增",
				M: "修改",
				D: "删除",
				R: "重命名",
				C: "复制"
			};
			const staged = e.x !== " " && e.x !== "?";
			return (map[label] || label) + (staged ? "（已暂存）" : "（未暂存）");
		};
		const gitListRows = [];
		if (gitError) gitListRows.push(/* @__PURE__ */ h("div", {
			key: "err",
			className: "artifacts-tree-error artifacts-git-error"
		}, gitError));
		else if (gitFiles == null) gitListRows.push(/* @__PURE__ */ h("div", {
			key: "load",
			className: "artifacts-empty"
		}, "加载变更列表…"));
		else if (!gitFiles.length) gitListRows.push(/* @__PURE__ */ h("div", {
			key: "empty",
			className: "artifacts-empty"
		}, "没有未提交的变更"));
		(gitFiles || []).forEach((e, idx) => {
			const label = gitLabel(e);
			const isActive = !!(activeTab && activeTab.git && activeTab.path === e.path);
			const flashKey = gitFlash > 0 ? gitFlash + ":" : "";
			gitListRows.push(/* @__PURE__ */ h("div", {
				key: flashKey + e.path,
				className: "artifacts-item" + (isActive ? " is-active" : "") + (flashKey ? " artifacts-flash-in" : ""),
				style: flashKey ? { animationDelay: Math.min(idx, 12) * 45 + "ms" } : void 0
			}, /* @__PURE__ */ h("button", {
				type: "button",
				className: "artifacts-item-main",
				title: gitTitle(e),
				onClick: () => openGitDiff(e.path)
			}, /* @__PURE__ */ h("div", { className: "artifacts-item-row" }, /* @__PURE__ */ h("span", { className: "artifacts-git-badge artifacts-git-badge-" + label }, label), /* @__PURE__ */ h("span", { className: "artifacts-item-base" }, basename(e.path)), e.origPath ? /* @__PURE__ */ h("span", { className: "artifacts-git-orig" }, "← ", basename(e.origPath)) : null), /* @__PURE__ */ h("div", { className: "artifacts-item-full" }, e.path)), /* @__PURE__ */ h("div", { className: "artifacts-item-actions" }, /* @__PURE__ */ h("button", {
				type: "button",
				className: "artifacts-minibtn",
				title: "复制路径",
				onClick: () => copyText(e.path, "已复制路径")
			}, "⧉"), /* @__PURE__ */ h("button", {
				type: "button",
				className: "artifacts-minibtn",
				title: "@引用到输入框",
				onClick: () => quotePath(e.path)
			}, "@"))));
		});
		const previewOverlay = tabs.length && !previewHidden ? /* @__PURE__ */ h("div", {
			className: "artifacts-preview-overlay" + (slidOut ? " artifacts-slid-out" : ""),
			role: "region",
			"aria-label": "文件预览"
		}, /* @__PURE__ */ h("div", { className: "artifacts-preview-overlay-tabs" }, /* @__PURE__ */ h("div", { className: "artifacts-ptabs-scroll" }, tabs.map((t) => /* @__PURE__ */ h("div", {
			key: t.key,
			className: "artifacts-ptab" + (t.key === activeKey ? " is-active" : ""),
			title: (t.git ? "[diff] " : "") + (t.path || ""),
			onClick: () => setActiveKey(t.key)
		}, /* @__PURE__ */ h("span", { className: "artifacts-ptab-name" }, basename(t.path || "")), /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-ptab-close",
			title: "关闭标签页",
			onClick: (e) => {
				e.stopPropagation();
				closeTab(t.key);
			}
		}, "×")))), /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-preview-hide",
			title: "隐藏预览（标签页保留）",
			onClick: () => setPreviewHidden(true)
		}, /* @__PURE__ */ h(PanelCollapseIcon, { size: 16 }))), activeTab ? renderPreview(activeTab) : null) : null;
		return /* @__PURE__ */ h(Fragment, null, previewOverlay, /* @__PURE__ */ h("div", {
			className: "artifacts-panel" + (slidOut ? " artifacts-slid-out" : "") + (resizing ? " artifacts-resizing" : ""),
			style: { width: widthPx },
			role: "dialog",
			"aria-label": "Artifacts"
		}, /* @__PURE__ */ h("div", {
			className: "artifacts-resize",
			title: "拖动调整宽度",
			onMouseDown: startResize
		}), /* @__PURE__ */ h("div", { className: "artifacts-head" }, /* @__PURE__ */ h("div", { className: "artifacts-head-left" }, /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-toggle",
			title: "收起侧边栏",
			onClick: () => store.setOpen(false)
		}, /* @__PURE__ */ h(PanelIcon, { size: 16 })), /* @__PURE__ */ h("a", {
			className: "artifacts-link",
			href: flyoutHref,
			target: "_blank",
			rel: "noreferrer noopener",
			title: "弹出式侧边栏 — 在新标签页打开（可拖到另一块显示器）"
		}, /* @__PURE__ */ h(FlyoutIcon, { size: 16 }))), /* @__PURE__ */ h("span", { className: "artifacts-spacer" }), notice ? /* @__PURE__ */ h("span", { className: "artifacts-notice" }, notice) : null, /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-toggle",
			title: activeView === "tree" ? "刷新文件树" : "刷新变更列表",
			onClick: () => {
				if (activeView === "tree") setTreeRefresh((n) => n + 1);
				else {
					gitForceRef.current = true;
					setGitRefreshing(true);
					setGitRefresh((n) => n + 1);
				}
			}
		}, /* @__PURE__ */ h(RefreshIcon, { size: 16 })), settings.showFileTree ? /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-iconbtn artifacts-viewbtn" + (activeView === "git" ? " is-active" : ""),
			title: activeView === "tree" ? "查看 Git 变更（未提交）" : "返回文件列表",
			"aria-pressed": activeView === "git",
			onClick: () => setActiveView(activeView === "tree" ? "git" : "tree")
		}, activeView === "tree" ? /* @__PURE__ */ h(GitBranchIcon, { size: 16 }) : /* @__PURE__ */ h(FolderClosedIcon, { size: 16 })) : null), /* @__PURE__ */ h("div", { className: "artifacts-main" }, /* @__PURE__ */ h("div", {
			className: "artifacts-body" + (activeView === "git" && gitRefreshing ? " artifacts-refreshing" : ""),
			style: { flex: "1 1 auto" }
		}, activeView === "tree" && settings.showFileTree ? /* @__PURE__ */ h(FileTree, {
			onOpen: openFile,
			selectedPath: activeTab && !activeTab.git ? activeTab.path : null,
			refreshToken: treeRefresh
		}) : gitListRows))));
	}
	function CornerButton() {
		const open = useOpen();
		return /* @__PURE__ */ h("button", {
			type: "button",
			className: "artifacts-corner-btn" + (open ? " artifacts-slid-out" : ""),
			title: "弹出式侧边栏",
			"aria-expanded": open,
			onClick: () => store.toggle()
		}, /* @__PURE__ */ h(PanelIcon, { size: 18 }));
	}
	function SettingsToggle({ label, desc, value, onToggle }) {
		return /* @__PURE__ */ h("div", { className: "artifacts-setrow" }, /* @__PURE__ */ h("div", { className: "artifacts-settext" }, /* @__PURE__ */ h("div", { className: "artifacts-settitle" }, label), /* @__PURE__ */ h("div", { className: "artifacts-setdesc" }, desc)), /* @__PURE__ */ h("label", { className: "artifacts-switch" }, /* @__PURE__ */ h("input", {
			type: "checkbox",
			checked: value,
			"aria-label": label,
			onChange: (e) => onToggle(e.currentTarget.checked)
		}), /* @__PURE__ */ h("span", {
			className: "artifacts-switch-track",
			"aria-hidden": "true"
		}, /* @__PURE__ */ h("span", { className: "artifacts-switch-thumb" }))));
	}
	function SettingsSection() {
		const settings = useSettings();
		const set = (key, value) => settingsStore.set(key, value);
		return /* @__PURE__ */ h("div", { className: "artifacts-settings" }, /* @__PURE__ */ h("p", { className: "artifacts-setintro" }, "管理「Flyout Sidebar」的显示与行为。"), /* @__PURE__ */ h("div", { className: "artifacts-setgroup" }, /* @__PURE__ */ h(SettingsToggle, {
			label: "默认展开",
			desc: "页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。",
			value: settings.defaultOpen,
			onToggle: (v) => set("defaultOpen", v)
		}), /* @__PURE__ */ h(SettingsToggle, {
			label: "自动刷新",
			desc: "开启后侧边栏展开时将即时同步并更新产物列表",
			value: settings.autoRefresh,
			onToggle: (v) => set("autoRefresh", v)
		}), /* @__PURE__ */ h(SettingsToggle, {
			label: "文件树",
			desc: "在侧边栏显示「文件树」标签页，浏览工作区目录。",
			value: settings.showFileTree,
			onToggle: (v) => set("showFileTree", v)
		}), /* @__PURE__ */ h("div", { className: "artifacts-setrow" }, /* @__PURE__ */ h("div", { className: "artifacts-settext" }, /* @__PURE__ */ h("div", { className: "artifacts-settitle" }, "最短面板宽度"), /* @__PURE__ */ h("div", { className: "artifacts-setdesc" }, "面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。")), /* @__PURE__ */ h("div", { className: "artifacts-setcontrol" }, /* @__PURE__ */ h("input", {
			type: "number",
			className: "artifacts-widthinput",
			min: 20,
			max: 60,
			value: settings.minPanelWidth,
			onChange: (e) => {
				const n = parseInt(e.currentTarget.value, 10);
				if (Number.isNaN(n)) return;
				set("minPanelWidth", Math.max(20, Math.min(60, n)));
			}
		}), /* @__PURE__ */ h("span", { className: "artifacts-suffix" }, "%")))));
	}
	//#endregion
	//#region src/client/index.tsx
	window.__ModuleLoader__.load({
		id: "dsh-flyout-sidebar",
		factory: (require) => {
			initReact(require("react"));
			return {
				inject: ["timer"],
				apply(ctx) {
					initClient(ctx);
					const slots = ctx.get("slots");
					if (slots === void 0) return;
					insertStyles();
					slots.inject("shell.overlay", () => slots.register({
						name: "shell.overlay",
						id: "artifacts-sidebar-trigger",
						order: 40,
						label: "Artifacts"
					}, CornerButton));
					slots.inject("shell.overlay", () => slots.register({
						name: "shell.overlay",
						id: "artifacts-sidebar-panel",
						order: 50,
						label: "Artifacts Panel"
					}, () => /* @__PURE__ */ h(ArtifactsPanel, null)));
					slots.inject("settings.section", () => slots.register({
						name: "settings.section",
						id: "artifacts-sidebar",
						order: 90,
						label: "Flyout Sidebar"
					}, SettingsSection));
				}
			};
		}
	});
	//#endregion
})();
