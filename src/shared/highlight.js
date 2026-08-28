/**
 * 共享：零依赖语法高亮器（无模板字面量以外的构建期依赖，正则引擎全部内联）。
 *
 * 可移植性约束见 ext.ts 顶部说明：本文件经 `?raw` 原样内联进独立弹出页的
 * 经典 <script>，因此只能使用 JSDoc 标注类型。输出 span.tok-* 令牌，颜色
 * 由两端各自的 CSS（styles.ts / page 模板）负责。
 */

/** @param {string} s @returns {string} */
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * @param {[string, string][]} specs [令牌类名, 正则源] 列表，顺序即优先级
 * @param {string} [flags]
 * @returns {(code: string) => string}
 */
export function makeHl(specs, flags) {
  let src = ''
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]
    if (!spec) continue
    src += (i ? '|' : '') + '(' + spec[1] + ')'
  }
  const re = new RegExp(src, flags || 'g')
  return (code) => {
    re.lastIndex = 0
    let out = ''
    let last = 0
    let m
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out += escHtml(code.slice(last, m.index))
      for (let g = 1; g < m.length; g += 1) {
        const tok = m[g]
        if (tok !== undefined) {
          const spec = specs[g - 1]
          if (spec) out += '<span class="tok-' + spec[0] + '">' + escHtml(tok) + '</span>'
          break
        }
      }
      last = re.lastIndex
      if (m[0].length === 0) {
        re.lastIndex += 1
        last = re.lastIndex
      }
    }
    if (last < code.length) out += escHtml(code.slice(last))
    return out
  }
}

const S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\""
const S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27"
const S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60"
const NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b"
const C_LINE = "//[^\\n]*"
const C_BLK = "/\\*[\\s\\S]*?\\*/"
const HASH = "#[^\\n]*"
const SQL_LINE = "--[^\\n]*"
const HTML_COMMENT = "<!--[\\s\\S]*?-->"
const PY_TRI = "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)"
const PY_STR = "(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)"
const CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b"
const HEX = "#[0-9a-fA-F]{3,8}\\b"
const AT = "@[\\w-]+"
const PROP = "[\\w-]+(?=\\s*:)"
const TAG = "</?[\\w-]+|/?>"
const ATTR = "[\\w-]+(?==)"
const VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)"
const VAR_PHP = "\\$\\w+"
const DECORATOR = "@[\\w.]+"
const IMPORTANT = "!important\\b"
const FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"
const FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()"
const CLASS = "\\b[A-Z][\\w$]*\\b"
const YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)"

/** @param {string} kw 空白分隔的关键字列表 @returns {string} */
function kwWord(kw) {
  return '\\b(?:' + kw.replace(/\s+/g, '|') + ')\\b'
}

const JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false'
const PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self'
const SH_KW = 'if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source'
const SQL_KW = 'select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc'
const C_KW = 'auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while'
const GO_KW = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'
const RUST_KW = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while'
const JAVA_KW = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while'
const RB_KW = 'begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield'
const PHP_KW = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield'

/** @param {string} kw @returns {(code: string) => string} */
function cFamily(kw) {
  return makeHl([
    ['comment', C_LINE + '|' + C_BLK],
    ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
    ['number', NUM],
    ['keyword', kwWord(kw)],
    ['function', FUNC],
    ['class', CLASS],
  ])
}

/** @type {Record<string, (code: string) => string>} */
const HL_ENGINES = {
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
}

/** @type {Record<string, string>} */
const HL_LANG_MAP = {
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
}

/** @type {Record<string, string>} */
const HL_LANG_NAMES = {
  js: 'JavaScript', py: 'Python', css: 'CSS', html: 'HTML/XML', sh: 'Shell',
  yaml: 'YAML', sql: 'SQL', c: 'C/C++', cpp: 'C++', go: 'Go', rust: 'Rust',
  java: 'Java', rb: 'Ruby', php: 'PHP', json: 'JSON', plain: 'Text',
}

/** @param {string} hint 扩展名或语言名 @returns {string} 引擎键名 */
export function hlLangOf(hint) {
  let h = String(hint || '').toLowerCase()
  if (h.charAt(0) === '.') h = h.slice(1)
  return HL_LANG_MAP[h] || 'plain'
}

/** @param {string} hint @returns {string} 语言显示名 */
export function hlLangLabel(hint) {
  return HL_LANG_NAMES[hlLangOf(hint)] || 'Text'
}

/** @param {string} src @param {string} hint @returns {string} HTML */
export function highlightCode(src, hint) {
  const fn = HL_ENGINES[hlLangOf(hint)]
  return fn ? fn(String(src)) : escHtml(src)
}
