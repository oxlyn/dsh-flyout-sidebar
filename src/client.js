/**
 * 可弹出侧边栏 · Popout Sidebar — Client body
 *
 * Assembled by `scripts/build.js` into `src/client.js` (the static browser
 * bundle served at `/plugins/dsh-popout-sidebar/client.js` and registered
 * through `window.__ModuleLoader__`).
 *
 * The placeholder tokens in this skeleton are replaced at build time by:
 *   ext        → src/shared/ext.js
 *   highlight  → src/shared/highlight.js
 *   markdown   → src/shared/markdown.js
 *   core       → src/client/core.js       (state/store/settings helpers)
 *   styles     → src/client/styles.js     (the injected CSS)
 *   icons      → src/client/icons.js      (inline SVG icons)
 *   preview    → src/client/preview.js    (renderDiff/renderPreview/CodeView)
 *   components → src/client/components.js (FileTree/ArtifactsPanel/…)
 */
window.__ModuleLoader__.load({
  id: 'dsh-popout-sidebar',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // Closure symbols — the same names the dynamic runner injects.
    const React = require('react')

    const styles = {
      insert(css) {
        if (typeof document === 'undefined') return
        const id = 'dsh-popout-sidebar-styles'
        if (document.getElementById(id)) return
        const el = document.createElement('style')
        el.id = id
        el.textContent = css
        document.head.appendChild(el)
      },
    }

    const host = {
      call(method, args) {
        if (method === 'git.status') {
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          return fetch('/popout-sidebar/gitstatus?sessionId=' + encodeURIComponent(sessionId)).then((r) => r.json())
        }
        if (method === 'git.diff') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          return fetch('/popout-sidebar/gitdiff?path=' + encodeURIComponent(path) + '&sessionId=' + encodeURIComponent(sessionId)).then((r) => r.json())
        }
        if (method === 'artifacts.read') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetch('/popout-sidebar/content?path=' + encodeURIComponent(path)).then((r) => r.json())
        }
        if (method === 'artifacts.listDir') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          return fetch('/popout-sidebar/listdir?path=' + encodeURIComponent(path) + '&sessionId=' + encodeURIComponent(sessionId)).then((r) => r.json())
        }
        return Promise.reject(new Error('dsh-popout-sidebar: unknown host method ' + method))
      },
    }

    // Canonical plugin body — extract this `return { ... }` for cordis_define.
    const plugin = (() => {
      return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // Shared extension → preview-type helpers (portable JS: var/function, no
    // template literals, so this file can be inlined verbatim into the host Node
    // scope, the client bundle, and the standalone page's String.raw inline script).
    var EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 };
    var EXT_PDF = { pdf: 1 };
    var EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 };
    var EXT_HTML = { html: 1, htm: 1, xhtml: 1 };

    function extType(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      var ext = m ? m[1].toLowerCase() : '';
      if (EXT_IMAGE[ext]) return 'image';
      if (EXT_PDF[ext]) return 'pdf';
      if (EXT_MARKDOWN[ext]) return 'markdown';
      if (EXT_HTML[ext]) return 'html';
      return 'text';
    }

    function fileExt(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      return m ? m[1].toLowerCase() : '';
    }

    // Shared self-contained syntax highlighter (portable JS, no template literals,
    // no interpolation, no backticks — safe to inline verbatim into the standalone
    // page's String.raw template). Emits span class tok-* tokens; color them in CSS.
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function makeHl(specs, flags) {
      var src = '';
      for (var i = 0; i < specs.length; i += 1) src += (i ? '|' : '') + '(' + specs[i][1] + ')';
      var re = new RegExp(src, flags || 'g');
      return function (code) {
        re.lastIndex = 0;
        var out = '', last = 0, m;
        while ((m = re.exec(code)) !== null) {
          if (m.index > last) out += escHtml(code.slice(last, m.index));
          for (var g = 1; g < m.length; g += 1) {
            if (m[g] !== undefined) {
              out += '<span class="tok-' + specs[g - 1][0] + '">' + escHtml(m[g]) + '</span>';
              break;
            }
          }
          last = re.lastIndex;
          if (m[0].length === 0) { re.lastIndex += 1; last = re.lastIndex; }
        }
        if (last < code.length) out += escHtml(code.slice(last));
        return out;
      };
    }

    var S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\"";
    var S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27";
    var S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60";
    var NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b";
    var C_LINE = "//[^\\n]*";
    var C_BLK = "/\\*[\\s\\S]*?\\*/";
    var HASH = "#[^\\n]*";
    var SQL_LINE = "--[^\\n]*";
    var HTML_COMMENT = "<!--[\\s\\S]*?-->";
    var PY_TRI = "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)";
    var PY_STR = "(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)";
    var CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b";
    var HEX = "#[0-9a-fA-F]{3,8}\\b";
    var AT = "@[\\w-]+";
    var PROP = "[\\w-]+(?=\\s*:)";
    var TAG = "</?[\\w-]+|/?>";
    var ATTR = "[\\w-]+(?==)";
    var VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)";
    var VAR_PHP = "\\$\\w+";
    var DECORATOR = "@[\\w.]+";
    var IMPORTANT = "!important\\b";
    var FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()";
    var FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()";
    var CLASS = "\\b[A-Z][\\w$]*\\b";
    var YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)";

    function kwWord(kw) { return '\\b(?:' + kw.replace(/\s+/g, '|') + ')\\b'; }

    var JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false';
    var PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self';
    var SH_KW = 'if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source';
    var SQL_KW = 'select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc';
    var C_KW = 'auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while';
    var GO_KW = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var';
    var RUST_KW = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while';
    var JAVA_KW = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while';
    var RB_KW = 'begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield';
    var PHP_KW = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield';

    function cFamily(kw) {
      return makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(kw)],
        ['function', FUNC],
        ['class', CLASS],
      ]);
    }

    var HL_ENGINES = {
      js: makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(JS_KW)],
        ['builtin', '\\b(?:console|Math|JSON|Promise|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Infinity|NaN|window|document|process|require|module|exports|setTimeout|clearTimeout|fetch|globalThis)\\b'],
        ['function', FUNC],
        ['class', CLASS],
      ]),
      py: makeHl([
        ['comment', HASH],
        ['string', PY_TRI + '|' + PY_STR],
        ['number', NUM],
        ['keyword', kwWord(PY_KW)],
        ['builtin', '\\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple|type|isinstance|super|open|input|repr|format|sorted|reversed|sum|min|max|abs|round|any|all|next|iter|dir|vars|getattr|setattr|hasattr|id|hash|bytes|bytearray|complex|frozenset|object|classmethod|staticmethod|property|Exception|ValueError|TypeError|KeyError|IndexError|ImportError|RuntimeError|StopIteration)\\b'],
        ['decorator', DECORATOR],
        ['function', FUNC_PY],
      ]),
      css: makeHl([
        ['comment', C_BLK],
        ['string', S_DQ + '|' + S_SQ],
        ['atrule', AT],
        ['property', PROP],
        ['number', CSS_NUM],
        ['hex', HEX],
        ['important', IMPORTANT],
      ]),
      html: makeHl([
        ['comment', HTML_COMMENT],
        ['string', S_DQ + '|' + S_SQ],
        ['tag', TAG],
        ['attr', ATTR],
      ]),
      sh: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ + '|' + S_BT],
        ['variable', VAR],
        ['number', NUM],
        ['keyword', kwWord(SH_KW)],
      ]),
      yaml: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null|yes|no|on|off)\\b'],
        ['key', YAML_KEY],
      ], 'gm'),
      sql: makeHl([
        ['comment', SQL_LINE + '|' + C_BLK],
        ['string', S_SQ + '|' + S_DQ],
        ['number', NUM],
        ['keyword', kwWord(SQL_KW)],
        ['function', FUNC_PY],
      ], 'gi'),
      json: makeHl([
        ['string', S_DQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null)\\b'],
      ]),
      c: cFamily(C_KW),
      cpp: cFamily(C_KW),
      go: cFamily(GO_KW),
      rust: cFamily(RUST_KW),
      java: cFamily(JAVA_KW),
      rb: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(RB_KW)],
        ['function', FUNC_PY],
        ['class', CLASS],
      ]),
      php: makeHl([
        ['comment', C_LINE + '|' + C_BLK + '|' + HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['variable', VAR_PHP],
        ['number', NUM],
        ['keyword', kwWord(PHP_KW)],
        ['function', FUNC_PY],
      ]),
    };

    var HL_LANG_MAP = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', javascript: 'js',
      ts: 'js', tsx: 'js', mts: 'js', cts: 'js', typescript: 'js',
      json: 'json', jsonc: 'json', json5: 'js',
      py: 'py', python: 'py', pyw: 'py',
      rb: 'rb', ruby: 'rb',
      go: 'go', golang: 'go',
      rs: 'rust', rust: 'rust',
      java: 'java',
      c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'c', csharp: 'c',
      kotlin: 'c', kt: 'c', swift: 'c',
      php: 'php',
      yaml: 'yaml', yml: 'yaml', toml: 'sh', ini: 'sh', conf: 'sh', properties: 'sh', env: 'sh',
      md: 'md', markdown: 'md', mdx: 'md',
      html: 'html', htm: 'html', xhtml: 'html', vue: 'html', xml: 'html', svg: 'html',
      css: 'css', scss: 'css', less: 'css',
      sql: 'sql',
      lua: 'c',
      sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
    };

    var HL_LANG_NAMES = {
      js: 'JavaScript', py: 'Python', css: 'CSS', html: 'HTML/XML', sh: 'Shell',
      yaml: 'YAML', sql: 'SQL', c: 'C/C++', cpp: 'C++', go: 'Go', rust: 'Rust',
      java: 'Java', rb: 'Ruby', php: 'PHP', json: 'JSON', plain: 'Text',
    };

    function hlLangOf(hint) {
      var h = String(hint || '').toLowerCase();
      if (h.charAt(0) === '.') h = h.slice(1);
      return HL_LANG_MAP[h] || 'plain';
    }

    function hlLangLabel(hint) { return HL_LANG_NAMES[hlLangOf(hint)] || 'Text'; }

    function highlightCode(src, hint) {
      var fn = HL_ENGINES[hlLangOf(hint)];
      return fn ? fn(String(src)) : escHtml(src);
    }

    // Shared minimal Markdown → HTML renderer (portable JS, no template literals).
    // Backticks are written as \x60 so the file can be inlined verbatim into the
    // standalone page's String.raw template. Fenced code blocks are highlighted via
    // highlightCode from shared/highlight.js.
    function mdEscape(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function mdInline(s) {
      s = s.replace(/\x60([^\x60]+)\x60/g, function (m, c) { return '<code>' + c + '</code>'; });
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      return s;
    }

    function mdToHtml(src) {
      var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
      var out = [];
      var i = 0;
      while (i < lines.length) {
        var line = lines[i];
        if (/^\s*\x60\x60\x60/.test(line)) {
          var fence = /^\s*\x60\x60\x60([\w+-]*)/.exec(line);
          var langHint = fence ? fence[1] : '';
          var buf = [];
          i += 1;
          while (i < lines.length && !/^\s*\x60\x60\x60/.test(lines[i])) { buf.push(lines[i]); i += 1; }
          i += 1;
          var codeText = buf.join('\n');
          out.push('<pre><code>' + highlightCode(codeText, langHint) + '</code></pre>');
          continue;
        }
        var h = /^(#{1,6})\s+(.*)$/.exec(line);
        if (h) {
          var lv = h[1].length;
          out.push('<h' + lv + '>' + mdInline(mdEscape(h[2])) + '</h' + lv + '>');
          i += 1;
          continue;
        }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
        if (/^\s*>\s?/.test(line)) {
          var q = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
          out.push('<blockquote>' + mdInline(mdEscape(q.join(' '))) + '</blockquote>');
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          var lis = [];
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { lis.push(mdInline(mdEscape(lines[i].replace(/^\s*[-*+]\s+/, '')))); i += 1; }
          out.push('<ul>' + lis.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>');
          continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          var lis2 = [];
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { lis2.push(mdInline(mdEscape(lines[i].replace(/^\s*\d+\.\s+/, '')))); i += 1; }
          out.push('<ol>' + lis2.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
          continue;
        }
        if (line.trim() === '') { i += 1; continue; }
        out.push('<p>' + mdInline(mdEscape(line)) + '</p>');
        i += 1;
      }
      return out.join('\n');
    }


    const basename = (p) => {
      const parts = String(p).split('/')
      return parts[parts.length - 1] || p
    }

    // The current session id, read from the client sessions store. The file
    // tree passes it to the host so it can root at the session's workspace.
    const currentSessionId = () => {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        if (list && typeof list.getSnapshot === 'function') {
          const snap = list.getSnapshot()
          const id = snap && (snap.current != null ? snap.current : snap.active)
          return typeof id === 'string' ? id : ''
        }
      } catch (e) {}
      return ''
    }

    // Write `@path` into the current session's composer draft. Returns true on
    // success, false when the input API is unavailable (caller then falls back
    // to clipboard copy).
    const quoteToComposer = (path) => {
      try {
        const sessions = ctx.get('sessions')
        const conversation = ctx.get('conversation')
        if (!sessions || !conversation) return false
        const list = sessions.list
        let sessionId
        if (list && typeof list.getSnapshot === 'function') {
          const snap = list.getSnapshot()
          sessionId = snap && (snap.current != null ? snap.current : snap.active)
        }
        if (sessionId == null) return false
        const actx = typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
        if (!actx) return false
        const input = conversation.input && typeof conversation.input.for === 'function' ? conversation.input.for(actx) : undefined
        if (!input || typeof input.setDraft !== 'function') return false
        let draft = ''
        try {
          if (input.state && typeof input.state.getSnapshot === 'function') draft = input.state.getSnapshot().draft || ''
        } catch (e) {}
        const text = '@' + path
        input.setDraft(draft && draft.trim() !== '' ? draft + ' ' + text : text)
        return true
      } catch (e) {
        return false
      }
    }

    const fallbackCopy = (text) => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {}
    }

    // Shared open/close state between the header trigger and the floating panel.
    const store = {
      open: false,
      listeners: [],
      setOpen(v) {
        if (this.open === v) return
        this.open = v
        this.listeners.forEach((fn) => { try { fn(v) } catch (e) {} })
      },
      toggle() { this.setOpen(!this.open) },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useOpen = () => {
      const [open, setOpen] = React.useState(store.open)
      React.useEffect(() => store.subscribe(setOpen), [])
      return open
    }

    // Feature settings, persisted in localStorage so they survive reloads.
    const SETTINGS_KEY = 'dsh-popout-sidebar:settings'
    const DEFAULT_SETTINGS = {
      autoRefresh: true,       // poll the artifact list while the panel is open
      minPanelWidth: 20,       // minimum panel width as % of window width
      showFileTree: true,      // show the 文件树 (file tree) tab in the panel
      defaultOpen: true,       // expand the sidebar by default on load
    }

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') return Object.assign({}, DEFAULT_SETTINGS, parsed)
        }
      } catch (e) {}
      return Object.assign({}, DEFAULT_SETTINGS)
    }

    const settingsStore = {
      data: loadSettings(),
      listeners: [],
      get() { return this.data },
      set(key, value) {
        const next = Object.assign({}, this.data, { [key]: value })
        this.data = next
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch (e) {}
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    // Apply the "默认展开" preference once at startup, before any component
    // mounts so the initial open/closed state matches the persisted setting.
    store.open = !!settingsStore.get().defaultOpen

    const useSettings = () => {
      const [s, setS] = React.useState(settingsStore.get())
      React.useEffect(() => settingsStore.subscribe(setS), [])
      return s
    }



    styles.insert(`
/* Layout push: reserve space for the popout panel so the conversation column
   yields instead of being covered (same technique as better-sidebar's right
   panel). --dsh-popout-sidebar-width is set live by the panel component;
   --dsh-sidebar-width is better-sidebar's right panel. */
html #root {
  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-popout-sidebar-width, 0px));
  transition: margin-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-popout-dragging] #root {
  transition: none;
}
/* Reserve right-side clearance in the conversation header so the corner
   trigger never overlaps its right-aligned utilities (e.g. "Session log").
   The clearance only applies while the popout panel is closed. */
header:has([data-slot="conversation.session.header.utilities"]) {
  padding-right: max(28px, calc(60px - var(--dsh-popout-sidebar-width, 0px)));
  transition: padding-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
@media (prefers-reduced-motion: reduce) {
  html #root { transition: none; }
  header:has([data-slot="conversation.session.header.utilities"]) { transition: none; }
}
/* Full-area preview overlay: covers everything to the LEFT of the sidebar
   panel (the app's main column) while a file is being previewed. Sits just
   below the panel's z-index so the panel stays on top. */
.artifacts-preview-overlay {
  position: fixed; top: 0; bottom: 0; left: 0;
  right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-popout-sidebar-width, 0px));
  z-index: 9998;
  display: flex; flex-direction: column; min-width: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-right: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-popout-dragging] .artifacts-preview-overlay { transition: none; }
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
/* ⇥ collapse button pinned at the right end of the tab strip: hides the
   preview content while keeping the tabs; flipped (⇤) while hidden. */
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
}
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
.artifacts-body { flex: 0 0 auto; min-height: 0; overflow-y: auto; }
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-item {
  display: block; width: 100%; text-align: left; padding: 9px 12px;
  border: none; border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: pointer; font: inherit;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
.artifacts-badge-create { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-badge-edit { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-item-base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-item-full {
  color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.artifacts-preview { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.artifacts-pre {
  flex: 1; margin: 0; overflow: auto; padding: 12px;
  font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 1.55; white-space: pre;
  color: var(--dsw-alias-label-secondary);
}
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
.artifacts-corner-btn {
  position: fixed; top: 10px; right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-popout-sidebar-width, 0px) + 12px);
  z-index: 10000; width: 36px; height: 36px; padding: 0;
  border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; align-items: center; justify-content: center; display: inline-flex;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease), color .15s;
}
.artifacts-corner-btn:hover { color: var(--dsw-alias-label-primary); }
.artifacts-item { display: flex; align-items: stretch; padding: 0; cursor: default; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* Selected artifact: a left accent bar (list-item language) keeps it visually
   distinct from the file tree's rounded full-fill selection, so a lone selected
   artifact never reads as a file-tree row. */
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 9px 12px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.artifacts-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
.artifacts-item:hover .artifacts-item-actions { opacity: 1; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
.artifacts-preview-body { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
/* iframe/embed are REPLACED elements: inset-0 without an explicit
   width/height keeps their intrinsic (small) size, so use width/height 100%
   instead. position:relative above is for the pdf.js renderer's absolute
   canvas container (a non-replaced div, which DOES stretch with inset-0). */
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-pdf { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; display: block; }
/* pdf.js renderer (sidebar): fills the preview area, no native toolbar. */
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
.artifacts-panel { transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease); }
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }

/* Resize handle on the panel's left edge */
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }


/* Header icon toggle between the file tree and the changed-files list */
.artifacts-viewbtn { display: inline-flex; align-items: center; justify-content: center; height: 26px; width: 26px; padding: 0; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; border-radius: 6px; }
.artifacts-viewbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-viewbtn.is-active { color: var(--dsw-alias-state-business-primary); }

/* Git changed-files list (git 变更) */
.artifacts-git-badge { font-size: 10px; font-weight: 700; width: 16px; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-git-badge-M { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-git-badge-A { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-git-badge-D { background: rgba(236,19,19,0.1); color: var(--dsw-alias-state-error-primary); }
.artifacts-git-badge-R { background: var(--dsw-alias-state-business-tertiary, rgba(65,118,230,0.1)); color: var(--dsw-alias-state-business-primary); }
.artifacts-git-badge-U { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary); }
.artifacts-git-orig { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-error { padding: 14px 12px; word-break: break-all; }

/* Unified git diff view (left-side overlay) */
.artifacts-gitdiff { font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; line-height: 1.6; }
.gd-line { white-space: pre-wrap; word-break: break-all; padding: 0 12px; }
.gd-meta { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-1); padding: 2px 12px; }
.gd-hunk { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-tertiary, rgba(65,118,230,0.08)); padding: 2px 12px; }
.gd-add { color: #1a7f37; background: rgba(34,197,94,0.08); }
.gd-del { color: #cf222e; background: rgba(236,19,19,0.07); }
body[data-ds-dark-theme] .gd-add { color: #69db7c; }
body[data-ds-dark-theme] .gd-del { color: #faa2c1; }

/* File tree (文件树) — styled like better-sidebar's explorer */
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

/* Settings section */
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

/* Delete mode */
.artifacts-delete-hint { padding: 6px 12px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); border-bottom: 1px solid var(--dsw-alias-border-l2); flex: none; }
.artifacts-iconbtn.artifacts-delete-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); }
.artifacts-item.is-delete-marked { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: -2px; background: rgba(236,19,19,0.06); }
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; }
.artifacts-delete-x { color: var(--dsw-alias-state-error-primary); font-size: 16px; font-weight: 700; line-height: 1; }
.artifacts-delete-x:hover { background: rgba(236,19,19,0.12); color: var(--dsw-alias-state-error-primary); }

/* Code preview (syntax-highlighted via DSH's Shiki — token colors come from
   the app's global --shiki-token-* palette, matching the rest of DSH) */
.artifacts-code { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-code-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }
.artifacts-code-gutter { flex: none; min-width: 2.2em; margin: 0; padding: 12px 6px 12px 8px; text-align: right; color: var(--dsw-alias-label-tertiary); border-right: 1px solid var(--dsw-alias-border-l1); position: sticky; left: 0; user-select: none; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre { flex: 1; margin: 0; padding: 12px; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--shiki-foreground, var(--dsw-alias-label-primary)); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre code { font: inherit; color: inherit; }
.artifacts-code-line { display: block; }

/* Token colors for the shared self-contained highlighter (markdown fenced
   code blocks). Palette matches the standalone page + DSH's --shiki-* hues. */
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

`)

    const PanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      // Box (rounded rect outline), mirroring the main sidebar toggle icon.
      React.createElement('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 2.8, stroke: 'currentColor', strokeWidth: 1.5 }),
      // Divider line at the right third (mirror of the sidebar's left divider).
      React.createElement('line', { x1: 10.2, y1: 2.6, x2: 10.2, y2: 13.4, stroke: 'currentColor', strokeWidth: 1.5 }),
    )

    const FolderClosedIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      transform: 'translate(1.5 2.429)',
      d: 'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z',
      fill: 'currentColor',
    }))

    const FolderOpenIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z', fill: 'currentColor' }),
      React.createElement('path', { opacity: '0.2', d: 'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z', fill: 'currentColor' }),
    )

    const FileCodeIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      fillRule: 'evenodd', clipRule: 'evenodd',
      d: 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z',
      fill: 'currentColor',
    }))

    const RefreshIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', { d: 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z', fill: 'currentColor' }))

    // Chevron (down) for the divider's collapse button. Rendered as a rounded
    // stroke; the collapsed state rotates it 180° (pointing up) via CSS.
    const ChevronIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      d: 'M1.6 3.6 L5 7 L8.4 3.6',
      stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
    }))

    // Pop-out (↗) arrow for the "open in a new tab" link — an SVG so it sizes
    // the same as the other header icons (16px) instead of a text glyph.
    const PopoutIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', {
        d: 'M3.5 12.5 L12.5 3.5 M6.2 3.5 H12.5 V9.8',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
      }),
    )

    // ⇥ Panel-collapse: arrow pushing into a vertical bar (toward the sidebar).
    // Used to hide the preview overlay while keeping its tabs; flipped
    // horizontally (⇤) when the preview is hidden, meaning "pull back out".
    const PanelCollapseIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('line', { x1: 12.5, y1: 3, x2: 12.5, y2: 13, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      React.createElement('path', {
        d: 'M3 8 H10 M7.8 5.6 L10.2 8 L7.8 10.4',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
      }),
    )

    // Git changes (git 变更): the classic git-branch glyph, for the header    // toggle between the file tree and the changed (uncommitted) files list.
    const GitBranchIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M4.5 4.6v6.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' }),
      React.createElement('circle', { cx: 4.5, cy: 3, r: 1.7, stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
      React.createElement('circle', { cx: 4.5, cy: 13, r: 1.7, stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
      React.createElement('circle', { cx: 11.5, cy: 3, r: 1.7, stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
      React.createElement('path', { d: 'M11.5 4.7v1.1c0 1.9-1.6 3.1-3.6 3.1-1.9 0-3.4 1.2-3.4 1.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' }),
    )

    // File tree (文件树): lazy-loaded recursive directory browser styled like
    // better-sidebar's explorer — rounded rows, folder/file icons, a hover
    // `@引用` pill, and a header with the root name + refresh.


    const renderDiff = (diff) => {
      const children = []
      if (diff && diff.before != null && diff.before !== '') {
        children.push(React.createElement('div', { key: 'del', className: 'artifacts-diff-block artifacts-diff-del' },
          React.createElement('div', { className: 'artifacts-diff-label' }, '- 删除'),
          React.createElement('pre', { className: 'artifacts-diff-pre' }, diff.before),
        ))
      }
      children.push(React.createElement('div', { key: 'add', className: 'artifacts-diff-block artifacts-diff-add' },
        React.createElement('div', { className: 'artifacts-diff-label' }, '+ 新增'),
        React.createElement('pre', { className: 'artifacts-diff-pre' }, diff && diff.after != null ? diff.after : ''),
      ))
      return React.createElement('div', { className: 'artifacts-diff' }, children)
    }

    // Code preview: line-number gutter + syntax-highlighted code (the shared
    // self-contained highlighter, language chosen from the file extension),
    // filling the whole tab area with no banner chrome.
    const CodeView = (props) => {
      const code = String(props.code || '')
      const srcLines = code.replace(/\n$/, '').split('\n')
      const gutter = srcLines.map((_, i) => String(i + 1)).join('\n')
      return React.createElement('div', { className: 'artifacts-code' },
        React.createElement('div', { className: 'artifacts-code-scroll' },
          React.createElement('pre', { className: 'artifacts-code-gutter', 'aria-hidden': true }, gutter),
          React.createElement('pre', { className: 'artifacts-code-pre' },
            React.createElement('code', {
              dangerouslySetInnerHTML: { __html: highlightCode(code, fileExt(props.path || '')) },
            }),
          ),
        ),
      )
    }

    // ── PDF preview (sidebar): custom pdf.js renderer ─────────────────────
    // No native viewer toolbar; fit-to-width by default with zoom / page
    // controls. Loads the vendored pdf.js served by the host (offline-safe).
    let _pdfjsPromise = null
    const loadPdfjs = () => {
      if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
      if (window.pdfjsLib) {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/popout-sidebar/pdfjs/pdf.worker.min.js' } catch (e) {}
        return Promise.resolve(window.pdfjsLib)
      }
      if (_pdfjsPromise) return _pdfjsPromise
      _pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/popout-sidebar/pdfjs/pdf.min.js'
        s.async = true
        s.onload = () => {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/popout-sidebar/pdfjs/pdf.worker.min.js'
            resolve(window.pdfjsLib)
          } catch (e) { reject(e) }
        }
        s.onerror = () => { _pdfjsPromise = null; reject(new Error('pdf.js 加载失败')) }
        document.head.appendChild(s)
      })
      return _pdfjsPromise
    }

    const PdfView = (props) => {
      const path = props.path || ''
      const [phase, setPhase] = React.useState('loading') // loading | ready | error
      const [error, setError] = React.useState(null)
      const [pageCount, setPageCount] = React.useState(0)
      const [pageNo, setPageNo] = React.useState(1)
      const [zoom, setZoom] = React.useState(1) // multiplier over fit-width
      const [fitScale, setFitScale] = React.useState(null)
      const scrollRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const docRef = React.useRef(null)
      const taskRef = React.useRef(null)

      // Load the document once per path.
      React.useEffect(() => {
        let alive = true
        setPhase('loading'); setError(null); setPageCount(0); setPageNo(1); setZoom(1); setFitScale(null)
        loadPdfjs().then((lib) => {
          const url = '/popout-sidebar/media?path=' + encodeURIComponent(path)
          return lib.getDocument({ url }).promise
        }).then((doc) => {
          if (!alive) { try { doc.destroy() } catch (e) {} return }
          docRef.current = doc
          setPageCount(doc.numPages || 0)
          setPhase('ready')
        }).catch((e) => {
          if (alive) { setError(String((e && e.message) ? e.message : e)); setPhase('error') }
        })
        return () => {
          alive = false
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          if (docRef.current) { try { docRef.current.destroy() } catch (e) {} docRef.current = null }
        }
      }, [path])

      // Measure the scroll area once to derive the fit-to-width scale (so the
      // page exactly fills the visible width — no horizontal scrollbar).
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale != null) return
        const scroll = scrollRef.current
        const doc = docRef.current
        if (!scroll || !doc) return
        let w = scroll.clientWidth
        if (typeof window.getComputedStyle === 'function') {
          try {
            const cs = window.getComputedStyle(scroll)
            w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
          } catch (e) {}
        }
        if (!w) return
        doc.getPage(1).then((pageObj) => {
          const vp = pageObj.getViewport({ scale: 1 })
          if (vp && vp.width > 0) setFitScale(w / vp.width)
        }).catch(() => {})
      }, [phase, fitScale])

      // Render the current page into the canvas.
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale == null) return
        const canvas = canvasRef.current
        const doc = docRef.current
        if (!canvas || !doc) return
        let alive = true
        doc.getPage(pageNo).then((pageObj) => {
          if (!alive) return
          const scale = fitScale * zoom
          const viewport = pageObj.getViewport({ scale })
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = Math.floor(viewport.width) + 'px'
          canvas.style.height = Math.floor(viewport.height) + 'px'
          const ctx = canvas.getContext('2d')
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          taskRef.current = pageObj.render({
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
          })
        }).catch(() => {})
        return () => { alive = false }
      }, [phase, pageNo, zoom, fitScale])

      const clampPage = (n) => Math.max(1, Math.min(pageCount || 1, n))
      const goPage = (n) => setPageNo(clampPage(n))
      const zoomBy = (f) => setZoom((z) => Math.max(0.25, Math.min(4, Math.round(z * f * 100) / 100)))

      if (phase === 'loading') {
        return React.createElement('div', { className: 'artifacts-pdfview' },
          React.createElement('div', { className: 'artifacts-hint' }, '加载 PDF…'))
      }
      if (phase === 'error') {
        // Fall back to the browser's native viewer if pdf.js cannot load.
        return React.createElement('embed', {
          className: 'artifacts-pdf',
          src: '/popout-sidebar/media?path=' + encodeURIComponent(path),
          type: 'application/pdf', title: path,
        })
      }

      const disabled = pageCount <= 0
      return React.createElement('div', { className: 'artifacts-pdfview' },
        React.createElement('div', { className: 'artifacts-pdfview-bar' },
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '缩小', disabled, onClick: () => zoomBy(0.8) }, '−'),
          React.createElement('span', { className: 'artifacts-pdfview-zoom' }, Math.round(zoom * 100) + '%'),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '放大', disabled, onClick: () => zoomBy(1.25) }, '＋'),
          React.createElement('span', { className: 'artifacts-pdfview-spacer' }),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '上一页', disabled: disabled || pageNo <= 1, onClick: () => goPage(pageNo - 1) }, '‹'),
          React.createElement('span', { className: 'artifacts-pdfview-page' }, pageNo + ' / ' + pageCount),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '下一页', disabled: disabled || pageNo >= pageCount, onClick: () => goPage(pageNo + 1) }, '›'),
        ),
        React.createElement('div', { className: 'artifacts-pdfview-scroll', ref: scrollRef },
          React.createElement('canvas', { ref: canvasRef, className: 'artifacts-pdfview-canvas' }),
        ),
      )
    }

    // Unified git diff renderer: colors meta lines, hunk headers, and +/- lines
    // (green/red backgrounds), one row per line, monospaced and scrollable.
    const GitDiffView = (props) => {
      const text = String(props.diff || '')
      if (!text) return React.createElement('div', { className: 'artifacts-hint' }, '没有未提交的变更（相对于 HEAD）')
      const lines = text.replace(/\n$/, '').split('\n')
      const rows = lines.map((line, i) => {
        let cls = 'gd-line'
        if (line.startsWith('@@')) cls += ' gd-hunk'
        else if (line.startsWith('+') && !line.startsWith('+++')) cls += ' gd-add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' gd-del'
        else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') ||
          line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') ||
          line.startsWith('new mode') || line.startsWith('rename ') || line.startsWith('similarity ') ||
          line.startsWith('copy ') || line.startsWith('Binary files') || line.startsWith('\\')) cls += ' gd-meta'
        return React.createElement('div', { key: i, className: cls }, line)
      })
      return React.createElement('div', { className: 'artifacts-gitdiff' }, rows)
    }

    const renderPreview = (p) => {
      if (p.loading) return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
      if (p.ok === false) return React.createElement('div', { className: 'artifacts-error' }, p.error || '读取失败')
      if (p.git) return React.createElement('div', { className: 'artifacts-preview-body' }, GitDiffView(p))
      const type = p.type || 'text'
      const body = []
      if (type === 'image') {
        body.push(React.createElement('img', {
          key: 'img', className: 'artifacts-img',
          src: '/popout-sidebar/media?path=' + encodeURIComponent(p.path || ''),
          alt: p.path || '',
        }))
      } else if (type === 'html') {
        body.push(React.createElement('iframe', {
          key: 'iframe', className: 'artifacts-iframe',
          sandbox: 'allow-scripts', srcDoc: p.content || '', title: p.path || '',
        }))
      } else if (type === 'pdf') {
        body.push(React.createElement(PdfView, { key: 'pdf', path: p.path || '' }))
      } else if (type === 'markdown') {
        body.push(React.createElement('div', {
          key: 'md', className: 'artifacts-markdown',
          dangerouslySetInnerHTML: { __html: mdToHtml(p.content) },
        }))
      } else {
        body.push(React.createElement(CodeView, { key: 'code', code: p.content, path: p.path }))
        if (p.truncated) body.push(React.createElement('div', { key: 'trunc', className: 'artifacts-diff-label' }, '(truncated preview)'))
      }
      if (p.diff) body.unshift(renderDiff(p.diff))
      return React.createElement('div', { className: 'artifacts-preview-body' }, body)
    }

    // Inline SVG icons replicating the DSH primitives icons better-sidebar uses
    // (IconFolderClose16 / IconFolderOpen16 / IconCodeOutline16 /
    // IconRefreshOutline16), drawn with `currentColor` so they follow the theme.


    const FileTree = (props) => {
      const [root, setRoot] = React.useState(null)
      const [children, setChildren] = React.useState({})
      const [expanded, setExpanded] = React.useState({})
      const [copiedPath, setCopiedPath] = React.useState(null)
      const [copiedLabel, setCopiedLabel] = React.useState('')
      const copyTimer = React.useRef(null)
      const rootTimer = React.useRef(null)

      // Track the active session so the tree re-roots automatically when the
      // workspace changes (no manual refresh needed).
      const [sessionId, setSessionId] = React.useState(currentSessionId())
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(() => setSessionId(currentSessionId()))
      }, [])

      const loadRoot = () => {
        setChildren({})
        setExpanded({})
        setRoot(null)
        clearTimeout(rootTimer.current)
        // A freshly switched-to workspace may not be resolvable on the host for
        // a beat (its session is still loading/persisting). Retry briefly so the
        // tree self-corrects instead of sitting on a stale or empty root.
        const attempt = (tries) => {
          host.call('artifacts.listDir', { sessionId: currentSessionId() }).then((res) => {
            if (res && res.ok) {
              setRoot({ path: res.path, entries: res.entries })
            } else if (tries > 0) {
              rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
            }
          }).catch(() => {
            if (tries > 0) rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
          })
        }
        attempt(3)
      }

      // Re-root on workspace switch and on an explicit refresh (the header's
      // refresh button bumps `props.refreshToken`).
      React.useEffect(() => { loadRoot() }, [sessionId, props.refreshToken])
      React.useEffect(() => () => clearTimeout(rootTimer.current), [])

      const toggle = (path) => {
        const nextExpanded = Object.assign({}, expanded, { [path]: !expanded[path] })
        setExpanded(nextExpanded)
        if (nextExpanded[path] && !children[path]) {
          setChildren(Object.assign({}, children, { [path]: { loading: true } }))
          host.call('artifacts.listDir', { path, sessionId: currentSessionId() }).then((res) => {
            setChildren((prev) => Object.assign({}, prev, { [path]: res && res.ok ? { entries: res.entries } : { error: (res && res.error) || '读取失败' } }))
          }).catch(() => {
            setChildren((prev) => Object.assign({}, prev, { [path]: { error: '读取失败' } }))
          })
        }
      }

      const copyRef = (path) => {
        const text = '@' + path
        let label = '已复制'
        const done = () => {
          setCopiedPath(path)
          setCopiedLabel(label)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
        }
        // Prefer writing into the composer; fall back to clipboard copy.
        if (quoteToComposer(path)) {
          label = '已插入输入框'
          done()
          return
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }

      const rowActions = (entry) => (copiedPath === entry.path
        ? React.createElement('span', { className: 'artifacts-tree-copied' }, copiedLabel || '已复制')
        : React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-ref',
          title: '引用到输入框（失败则复制 @path）',
          onClick: (e) => { e.stopPropagation(); copyRef(entry.path) },
        }, '@引用'))

      const renderNode = (entry, depth) => {
        const pad = { paddingLeft: 6 + depth * 20 }
        const isSelected = props.selectedPath === entry.path
        const rowClass = 'artifacts-tree-row' +
          (entry.hidden ? ' artifacts-tree-hidden' : '') +
          (isSelected ? ' is-selected' : '')
        if (entry.isDir) {
          const isExpanded = !!expanded[entry.path]
          const node = children[entry.path]
          return React.createElement('div', { key: entry.path },
            React.createElement('div', {
              role: 'button',
              tabIndex: 0,
              className: rowClass + ' artifacts-tree-dir',
              style: pad,
              onClick: () => toggle(entry.path),
              onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(entry.path) } },
              title: entry.path,
            },
              isExpanded ? FolderOpenIcon(14) : FolderClosedIcon(14),
              React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
              rowActions(entry),
            ),
            isExpanded
              ? (node && node.loading
                ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-loading', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, '加载中…')
                : node && node.error
                  ? React.createElement('div', { className: 'artifacts-tree-row artifacts-tree-error', style: { paddingLeft: 6 + (depth + 1) * 20 + 20 } }, node.error)
                  : node && node.entries
                    ? node.entries.map((c) => renderNode(c, depth + 1))
                    : null)
              : null,
          )
        }
        return React.createElement('div', {
          role: 'button',
          tabIndex: 0,
          className: rowClass,
          style: pad,
          onClick: () => { if (props.onOpen) props.onOpen(entry.path) },
          onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (props.onOpen) props.onOpen(entry.path) } },
          title: entry.path,
        },
          FileCodeIcon(14),
          React.createElement('span', { className: 'artifacts-tree-name' }, entry.name),
          rowActions(entry),
        )
      }

      return React.createElement('div', { className: 'artifacts-tree' },
        React.createElement('div', { className: 'artifacts-tree-body' },
          !root
            ? React.createElement('div', { className: 'artifacts-hint' }, '加载文件树…')
            : (!root.entries || !root.entries.length)
              ? React.createElement('div', { className: 'artifacts-hint' }, '（空目录）')
              : root.entries.map((e) => renderNode(e, 0)),
        ),
      )
    }

    const ArtifactsPanel = () => {
      const open = useOpen()
      const settings = useSettings()
      const [tabs, setTabs] = React.useState([]) // open preview tabs { key, path, git, loading, ok, error, … }
      const [activeKey, setActiveKey] = React.useState(null)
      // ⇥ hides the whole preview overlay but keeps the tabs in memory;
      // opening any file from the tree/git list brings them all back.
      const [previewHidden, setPreviewHidden] = React.useState(false)

      // Track the active session: preview tabs belong to a project's files,
      // so they are all closed when the workspace switches (otherwise stale
      // tabs would show the old project's content next to the new one).
      const [sessionId, setSessionId] = React.useState(currentSessionId())
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(() => setSessionId(currentSessionId()))
      }, [])
      const firstSession = React.useRef(true)
      React.useEffect(() => {
        if (firstSession.current) { firstSession.current = false; return }
        setTabs([])
        setActiveKey(null)
        setPreviewHidden(false)
      }, [sessionId])
      const [notice, setNotice] = React.useState('')
      const [gitFiles, setGitFiles] = React.useState(null) // null = loading
      const [gitError, setGitError] = React.useState(null)
      const [panelWidth, setPanelWidth] = React.useState(null) // null = use min
      const [resizing, setResizing] = React.useState(false)
      const [activeView, setActiveView] = React.useState(() => (settings.showFileTree ? 'tree' : 'git')) // 'tree' | 'git'
      const [treeRefresh, setTreeRefresh] = React.useState(0) // bumped by the header refresh button
      const [gitRefresh, setGitRefresh] = React.useState(0)
      const noticeTimer = React.useRef(null)

      // Git changed-but-uncommitted files, polled while the git view is visible.
      React.useEffect(() => {
        if (!open || activeView !== 'git') return
        let alive = true
        const load = () => {
          host.call('git.status', { sessionId: currentSessionId() }).then((res) => {
            if (!alive) return
            if (res && res.ok) {
              setGitFiles(Array.isArray(res.entries) ? res.entries : [])
              setGitError(null)
            } else {
              setGitFiles([])
              setGitError((res && res.error) || 'git status 失败')
            }
          }).catch((e) => {
            if (alive) setGitError(e && e.message ? String(e.message) : String(e))
          })
        }
        load()
        let dispose
        if (settings.autoRefresh) dispose = ctx.interval(load, 2000)
        return () => { alive = false; if (dispose) dispose() }
      }, [open, activeView, settings.autoRefresh, gitRefresh])

      // Publish the current session id to localStorage so the standalone
      // popout tab (which has no client session store) can root its file tree
      // at the active workspace and follow workspace switches in real time.
      React.useEffect(() => {
        const KEY = 'dsh-popout-sidebar:session'
        const write = () => {
          try {
            const sid = currentSessionId()
            if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || '')
          } catch (e) {}
        }
        write()
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return
        return list.subscribe(write)
      }, [])

      // Publish DSH's light/dark theme so the standalone popout tab matches
      // the app's appearance and follows live theme switches. DSH sets the
      // dark attribute on <body> (see the body[data-ds-dark-theme] rules in
      // styles), so check/observe both documentElement and body.
      React.useEffect(() => {
        const KEY = 'dsh-popout-sidebar:theme'
        const isDark = () => {
          if (document.documentElement.hasAttribute('data-ds-dark-theme')) return true
          if (document.body && document.body.hasAttribute('data-ds-dark-theme')) return true
          return false
        }
        const write = () => {
          try {
            const v = isDark() ? 'dark' : 'light'
            if (localStorage.getItem(KEY) !== v) localStorage.setItem(KEY, v)
          } catch (e) {}
        }
        write()
        if (typeof MutationObserver !== 'function') return
        const obs = new MutationObserver(write)
        const opts = { attributes: true, attributeFilter: ['data-ds-dark-theme'] }
        obs.observe(document.documentElement, opts)
        if (document.body) obs.observe(document.body, opts)
        return () => obs.disconnect()
      }, [])

      // Panel width (px): at least `minPanelWidth`% of the window, wider via
      // dragging the left edge. `panelWidth` holds the drag result (px); null →
      // use the configured minimum.
      const minWidthPx = Math.max(80, Math.round(window.innerWidth * (settings.minPanelWidth || 0) / 100))
      const widthPx = panelWidth != null ? Math.max(panelWidth, minWidthPx) : minWidthPx

      // Reserve layout space for the panel while open: shrink the app frame by
      // the panel's live width so the conversation column yields instead of
      // being covered (see the `html #root` rule in styles).
      React.useEffect(() => {
        const root = document.documentElement
        root.style.setProperty('--dsh-popout-sidebar-width', open ? widthPx + 'px' : '0px')
        return () => { root.style.setProperty('--dsh-popout-sidebar-width', '0px') }
      }, [open, widthPx])

      // Disable the layout transition while dragging so the frame tracks the
      // pointer instead of lagging (mirrors body[data-dsh-popout-dragging]).
      React.useEffect(() => {
        if (resizing) document.body.setAttribute('data-dsh-popout-dragging', '')
        else document.body.removeAttribute('data-dsh-popout-dragging')
        return () => { document.body.removeAttribute('data-dsh-popout-dragging') }
      }, [resizing])

      if (!open) return null

      const sid = currentSessionId()
      const popoutHref = '/popout-sidebar' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')

      const startResize = (e) => {
        e.preventDefault()
        setResizing(true)
        const rightOffset = (() => {
          const v = document.documentElement.style.getPropertyValue('--dsh-sidebar-width')
          const n = parseFloat(v)
          return Number.isFinite(n) ? n : 0
        })()
        const onMove = (ev) => {
          const w = window.innerWidth - ev.clientX - rightOffset
          setPanelWidth(Math.max(minWidthPx, Math.min(w, window.innerWidth - rightOffset - 24)))
        }
        const onUp = () => {
          setResizing(false)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      const flash = (msg) => {
        setNotice(msg)
        clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 1600)
      }
      const copyText = (text, msg) => {
        const done = () => flash(msg)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
        } else { fallbackCopy(text); done() }
      }
      const quotePath = (path) => {
        if (quoteToComposer(path)) { flash('已插入输入框'); return }
        copyText('@' + path, '已复制 @引用（未能写入输入框）')
      }

      // Multi-tab preview state helpers: each opened file (or git diff) gets a
      // tab keyed by its path (`g:` prefix distinguishes diff tabs).
      const patchTab = (key, patch) => setTabs((prev) => prev.map((t) => (t.key === key ? Object.assign({}, t, patch) : t)))

      const openTab = (key, path, git, initial) => {
        setPreviewHidden(false)
        setTabs((prev) => {
          const i = prev.findIndex((t) => t.key === key)
          if (i >= 0) {
            // Reopening an open file just reloads it and focuses its tab.
            const next = prev.slice()
            next[i] = Object.assign({}, next[i], initial)
            return next
          }
          return prev.concat([Object.assign({ key: key, path: path, git: git }, initial)])
        })
        setActiveKey(key)
      }

      const closeTab = (key) => {
        const idx = tabs.findIndex((t) => t.key === key)
        const next = tabs.filter((t) => t.key !== key)
        setTabs(next)
        if (activeKey === key) setActiveKey(next.length ? next[Math.min(idx, next.length - 1)].key : null)
      }

      const activeTab = tabs.find((t) => t.key === activeKey) || null

      const openFile = (path, diff) => {
        const key = 'p:' + path
        const type = extType(path)
        // Images and PDFs are served as binary media — no text read needed.
        const initial = { loading: false, type: type, diff: diff || null }
        if (type !== 'image' && type !== 'pdf') initial.loading = true
        openTab(key, path, false, initial)
        if (type === 'image' || type === 'pdf') return
        host.call('artifacts.read', { path }).then((res) => {
          patchTab(key, Object.assign({ loading: false }, res))
        }).catch((e) => {
          patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) })
        })
      }

      // Open one changed file's uncommitted diff in the left-side overlay.
      const openGitDiff = (path) => {
        const key = 'g:' + path
        openTab(key, path, true, { loading: true })
        host.call('git.diff', { path, sessionId: currentSessionId() }).then((res) => {
          patchTab(key, Object.assign({ loading: false }, res))
        }).catch((e) => {
          patchTab(key, { loading: false, ok: false, error: String(e && e.message ? e.message : e) })
        })
      }

      // Status letter → display label for a changed file row.
      const gitLabel = (e) => {
        if (e.x === '?' || e.y === '?') return 'U'
        const c = e.y !== ' ' ? e.y : e.x
        return c || 'M'
      }
      const gitTitle = (e) => {
        const label = gitLabel(e)
        const map = { U: '未跟踪', A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制' }
        const staged = e.x !== ' ' && e.x !== '?'
        return (map[label] || label) + (staged ? '（已暂存）' : '（未暂存）')
      }

      const gitListChildren = []
      if (gitError) {
        gitListChildren.push(React.createElement('div', { key: 'err', className: 'artifacts-tree-error artifacts-git-error' }, gitError))
      } else if (gitFiles == null) {
        gitListChildren.push(React.createElement('div', { key: 'load', className: 'artifacts-empty' }, '加载变更列表…'))
      } else if (!gitFiles.length) {
        gitListChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, '没有未提交的变更'))
      }
      ;(gitFiles || []).forEach((e) => {
        const label = gitLabel(e)
        const isActive = !!(activeTab && activeTab.git && activeTab.path === e.path)
        gitListChildren.push(React.createElement('div', {
          key: e.path,
          className: 'artifacts-item' + (isActive ? ' is-active' : ''),
        },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-item-main',
            title: gitTitle(e),
            onClick: () => openGitDiff(e.path),
          },
            React.createElement('div', { className: 'artifacts-item-row' },
              React.createElement('span', { className: 'artifacts-git-badge artifacts-git-badge-' + label }, label),
              React.createElement('span', { className: 'artifacts-item-base' }, basename(e.path)),
              e.origPath ? React.createElement('span', { className: 'artifacts-git-orig' }, '← ' + basename(e.origPath)) : null,
            ),
            React.createElement('div', { className: 'artifacts-item-full' }, e.path),
          ),
          React.createElement('div', { className: 'artifacts-item-actions' },
            React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '复制路径', onClick: () => copyText(e.path, '已复制路径') }, '⧉'),
            React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '@引用到输入框', onClick: () => quotePath(e.path) }, '@'),
          ),
        ))
      })

      // Multi-tab preview overlay: each opened file becomes a tab; the active
      // tab's content covers the whole area LEFT of the sidebar panel. The ⇥
      // button hides the whole overlay — tabs survive and are restored via the
      // left-edge pill or by opening any file.
      const previewOverlay = (tabs.length && !previewHidden) ? React.createElement('div', {
        className: 'artifacts-preview-overlay',
        key: 'preview-overlay',
        role: 'region', 'aria-label': '文件预览',
      },
        React.createElement('div', { className: 'artifacts-preview-overlay-tabs' },
          React.createElement('div', { className: 'artifacts-ptabs-scroll' },
            tabs.map((t) => React.createElement('div', {
              key: t.key,
              className: 'artifacts-ptab' + (t.key === activeKey ? ' is-active' : ''),
              title: (t.git ? '[diff] ' : '') + (t.path || ''),
              onClick: () => setActiveKey(t.key),
            },
              React.createElement('span', { className: 'artifacts-ptab-name' }, basename(t.path || '')),
              React.createElement('button', {
                type: 'button',
                className: 'artifacts-ptab-close',
                title: '关闭标签页',
                onClick: (e) => { e.stopPropagation(); closeTab(t.key) },
              }, '×'),
            )),
          ),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-preview-hide',
            title: '隐藏预览（标签页保留）',
            onClick: () => setPreviewHidden(true),
          }, PanelCollapseIcon(16)),
        ),
        activeTab ? renderPreview(activeTab) : null,
      ) : null

      return React.createElement(React.Fragment, null,
        previewOverlay,
        React.createElement('div', {
        className: 'artifacts-panel' + (resizing ? ' artifacts-resizing' : ''),
        style: { width: widthPx },
        role: 'dialog', 'aria-label': 'Artifacts',
      },
        React.createElement('div', {
          className: 'artifacts-resize',
          title: '拖动调整宽度',
          onMouseDown: startResize,
        }),
        React.createElement('div', { className: 'artifacts-head' },
          React.createElement('div', { className: 'artifacts-head-left' },
            React.createElement('button', {
              type: 'button',
              className: 'artifacts-toggle',
              title: '收起侧边栏',
              onClick: () => store.setOpen(false),
            }, PanelIcon(16)),
            React.createElement('a', {
              className: 'artifacts-link',
              href: popoutHref,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: '弹出式侧边栏 — 在新标签页打开（可拖到另一块显示器）',
            }, PopoutIcon(16)),
          ),
          React.createElement('span', { className: 'artifacts-spacer' }),
          notice ? React.createElement('span', { className: 'artifacts-notice' }, notice) : null,
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-toggle',
            title: activeView === 'tree' ? '刷新文件树' : '刷新变更列表',
            onClick: () => { if (activeView === 'tree') setTreeRefresh((n) => n + 1); else setGitRefresh((n) => n + 1) },
          }, RefreshIcon(16)),
          settings.showFileTree ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-iconbtn artifacts-viewbtn' + (activeView === 'git' ? ' is-active' : ''),
            title: activeView === 'tree' ? '查看 Git 变更（未提交）' : '返回文件列表',
            'aria-pressed': activeView === 'git',
            onClick: () => setActiveView(activeView === 'tree' ? 'git' : 'tree'),
          }, activeView === 'tree' ? GitBranchIcon(16) : FolderClosedIcon(16)) : null,
        ),
        React.createElement('div', {
          className: 'artifacts-main',
        },
          React.createElement('div', {
            className: 'artifacts-body',
            style: { flex: '1 1 auto' },
          },
            (activeView === 'tree' && settings.showFileTree)
              ? React.createElement(FileTree, { onOpen: openFile, selectedPath: activeTab && !activeTab.git ? activeTab.path : null, refreshToken: treeRefresh })
              : gitListChildren,
          ),
        ),
        ),
      )
    }

    // Persistent trigger pinned to the top-right corner. Registered into the
    // root-scoped `shell.overlay` list so it stays visible with no conversation;
    // the fixed CSS position keeps it at the corner, offset left by the right
    // sidebar(s) so it never gets covered. Icon-only by design.
    const CornerButton = () => {
      const open = useOpen()
      if (open) return null
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-corner-btn',
        title: '弹出式侧边栏',
        'aria-expanded': open,
        onClick: () => store.toggle(),
      }, PanelIcon(18))
    }

    const SettingsToggle = (props) =>
      React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, props.label),
          React.createElement('div', { className: 'artifacts-setdesc' }, props.desc),
        ),
        React.createElement('label', { className: 'artifacts-switch' },
          React.createElement('input', {
            type: 'checkbox',
            checked: props.value,
            'aria-label': props.label,
            onChange: (e) => props.onToggle(e.currentTarget.checked),
          }),
          React.createElement('span', { className: 'artifacts-switch-track', 'aria-hidden': 'true' },
            React.createElement('span', { className: 'artifacts-switch-thumb' }),
          ),
        ),
      )

    const SettingsSection = () => {
      const settings = useSettings()
      const set = (key, value) => settingsStore.set(key, value)

      return React.createElement('div', { className: 'artifacts-settings' },
        React.createElement('p', { className: 'artifacts-setintro' }, '管理「Popout Sidebar」的显示与行为。'),
        React.createElement('div', { className: 'artifacts-setgroup' },
          React.createElement(SettingsToggle, {
            label: '默认展开',
            desc: '页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。',
            value: settings.defaultOpen,
            onToggle: (v) => set('defaultOpen', v),
          }),
          React.createElement(SettingsToggle, {
            label: '自动刷新',
            desc: '开启后侧边栏展开时将即时同步并更新产物列表',
            value: settings.autoRefresh,
            onToggle: (v) => set('autoRefresh', v),
          }),
          React.createElement(SettingsToggle, {
            label: '文件树',
            desc: '在侧边栏显示「文件树」标签页，浏览工作区目录。',
            value: settings.showFileTree,
            onToggle: (v) => set('showFileTree', v),
          }),
          React.createElement('div', { className: 'artifacts-setrow' },
            React.createElement('div', { className: 'artifacts-settext' },
              React.createElement('div', { className: 'artifacts-settitle' }, '最短面板宽度'),
              React.createElement('div', { className: 'artifacts-setdesc' }, '面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。'),
            ),
            React.createElement('div', { className: 'artifacts-setcontrol' },
              React.createElement('input', {
                type: 'number',
                className: 'artifacts-widthinput',
                min: 20,
                max: 60,
                value: settings.minPanelWidth,
                onChange: (e) => {
                  const n = parseInt(e.currentTarget.value, 10)
                  if (Number.isNaN(n)) return
                  set('minPanelWidth', Math.max(20, Math.min(60, n)))
                },
              }),
              React.createElement('span', { className: 'artifacts-suffix' }, '%'),
            ),
          ),
        ),
      )
    }



    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-trigger', order: 40, label: 'Artifacts' },
      CornerButton,
    ))

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' },
      () => React.createElement(ArtifactsPanel),
    ))

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'artifacts-sidebar', order: 90, label: 'Popout Sidebar' },
      SettingsSection,
    ))
  },
  }})()
  exports.inject = plugin.inject
  exports.apply = plugin.apply
    return module.exports
  },
})
