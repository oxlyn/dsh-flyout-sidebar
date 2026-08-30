/**
 * Client 侧：预览渲染 —— 代码视图（行号 + 语法高亮）、git diff 视图、
 * 自定义 pdf.js 渲染器、Markdown / 图片 / HTML 沙箱、多类型分发。
 */
import { Fragment, h, React } from './jsx'
import { fileExt, extType } from '../shared/ext.js'
import { t } from '../shared/i18n.js'
import { highlightCode } from '../shared/highlight.js'
import { mdToHtml } from '../shared/markdown.js'
import type { ReactElement, ReactNode } from 'react'

/** 预览标签页状态（'p:' 前缀 = 内容预览，'g:' 前缀 = git diff） */
export interface PreviewTab {
  key: string
  path: string
  git?: boolean
  loading?: boolean
  ok?: boolean
  error?: string
  type?: string
  content?: string
  truncated?: boolean
  diff?: { before: string; after: string } | string | null
}

export function renderDiff(diff: { before: string; after: string } | null | undefined): ReactElement {
  return (
    <div className="artifacts-diff">
      {diff && diff.before != null && diff.before !== '' ? (
        <div className="artifacts-diff-block artifacts-diff-del">
          <div className="artifacts-diff-label">{t('diffDeleted')}</div>
          <pre className="artifacts-diff-pre">{diff.before}</pre>
        </div>
      ) : null}
      <div className="artifacts-diff-block artifacts-diff-add">
        <div className="artifacts-diff-label">{t('diffAdded')}</div>
        <pre className="artifacts-diff-pre">{diff && diff.after != null ? diff.after : ''}</pre>
      </div>
    </div>
  )
}

/** 代码预览：行号栏 + 语法高亮代码（共享高亮器，语言取自扩展名） */
export function CodeView({ code, path }: { code?: string; path?: string }): ReactElement {
  const src = String(code || '')
  const srcLines = src.replace(/\n$/, '').split('\n')
  const gutter = srcLines.map((_, i) => String(i + 1)).join('\n')
  return (
    <div className="artifacts-code">
      <div className="artifacts-code-scroll">
        <pre className="artifacts-code-gutter" aria-hidden="true">
          {gutter}
        </pre>
        <pre className="artifacts-code-pre">
          <code dangerouslySetInnerHTML={{ __html: highlightCode(src, fileExt(path || '')) }} />
        </pre>
      </div>
    </div>
  )
}

// ── PDF 预览（侧边栏）：自定义 pdf.js 渲染器 ─────────────────────────────
// 无原生查看器工具栏；默认适配宽度，带缩放/翻页控制。pdf.js 由 host 伺服
// （离线可用）。
interface PdfViewport {
  width: number
  height: number
}

interface PdfRenderTask {
  cancel(): void
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] | null }): PdfRenderTask
}

interface PdfDocument {
  numPages: number
  getPage(pageNo: number): Promise<PdfPage>
  destroy(): unknown
}

interface PdfJsLib {
  getDocument(options: { url: string }): { promise: Promise<PdfDocument> }
  GlobalWorkerOptions: { workerSrc: string }
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib
  }
}

let pdfjsPromise: Promise<PdfJsLib> | null = null

function loadPdfjs(): Promise<PdfJsLib> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.pdfjsLib) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/flyout-sidebar/pdfjs/pdf.worker.min.js'
    } catch {
      // workerSrc 赋值失败不影响库本身
    }
    return Promise.resolve(window.pdfjsLib)
  }
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = new Promise<PdfJsLib>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/flyout-sidebar/pdfjs/pdf.min.js'
    s.async = true
    s.onload = () => {
      try {
        if (!window.pdfjsLib) throw new Error(t('pdfLoadFailed'))
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/flyout-sidebar/pdfjs/pdf.worker.min.js'
        resolve(window.pdfjsLib)
      } catch (e) {
        reject(e)
      }
    }
    s.onerror = () => {
      pdfjsPromise = null
      reject(new Error(t('pdfLoadFailed')))
    }
    document.head.appendChild(s)
  })
  return pdfjsPromise
}

export function PdfView({ path }: { path: string }): ReactElement | null {
  const [phase, setPhase] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [pageCount, setPageCount] = React.useState(0)
  const [pageNo, setPageNo] = React.useState(1)
  const [zoom, setZoom] = React.useState(1) // 相对 fit-width 的倍率
  const [fitScale, setFitScale] = React.useState<number | null>(null)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const docRef = React.useRef<PdfDocument | null>(null)
  const taskRef = React.useRef<PdfRenderTask | null>(null)

  // 每个 path 只加载一次文档。
  React.useEffect(() => {
    let alive = true
    setPhase('loading')
    setError(null)
    setPageCount(0)
    setPageNo(1)
    setZoom(1)
    setFitScale(null)
    loadPdfjs()
      .then((lib) => {
        const url = '/flyout-sidebar/media?path=' + encodeURIComponent(path)
        return lib.getDocument({ url }).promise
      })
      .then((doc) => {
        if (!alive) {
          try {
            void doc.destroy()
          } catch {
            // 已卸载，销毁失败可忽略
          }
          return
        }
        docRef.current = doc
        setPageCount(doc.numPages || 0)
        setPhase('ready')
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error && e.message ? e.message : String(e))
          setPhase('error')
        }
      })
    return () => {
      alive = false
      if (taskRef.current) {
        try {
          taskRef.current.cancel()
        } catch {
          // 取消失败可忽略
        }
      }
      if (docRef.current) {
        try {
          void docRef.current.destroy()
        } catch {
          // 已卸载，销毁失败可忽略
        }
        docRef.current = null
      }
    }
  }, [path])

  // 度量滚动区域一次，推导 fit-width 缩放（页面正好填满可见宽度，无横向
  // 滚动条）。
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
      } catch {
        // 样式读取失败按原始宽度处理
      }
    }
    if (!w) return
    doc
      .getPage(1)
      .then((pageObj) => {
        const vp = pageObj.getViewport({ scale: 1 })
        if (vp && vp.width > 0) setFitScale(w / vp.width)
      })
      .catch(() => {})
  }, [phase, fitScale])

  // 把当前页渲染进 canvas。
  React.useEffect(() => {
    if (phase !== 'ready' || fitScale == null) return
    const canvas = canvasRef.current
    const doc = docRef.current
    if (!canvas || !doc) return
    let alive = true
    doc
      .getPage(pageNo)
      .then((pageObj) => {
        if (!alive) return
        const scale = fitScale * zoom
        const viewport = pageObj.getViewport({ scale })
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = Math.floor(viewport.width) + 'px'
        canvas.style.height = Math.floor(viewport.height) + 'px'
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) return
        if (taskRef.current) {
          try {
            taskRef.current.cancel()
          } catch {
            // 取消失败可忽略
          }
        }
        taskRef.current = pageObj.render({
          canvasContext: ctx2d,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [phase, pageNo, zoom, fitScale])

  const clampPage = (n: number) => Math.max(1, Math.min(pageCount || 1, n))
  const goPage = (n: number) => setPageNo(clampPage(n))
  const zoomBy = (f: number) => setZoom((z) => Math.max(0.25, Math.min(4, Math.round(z * f * 100) / 100)))

  if (phase === 'loading') {
    return (
      <div className="artifacts-pdfview">
        <div className="artifacts-hint">{t('loadingPdf')}</div>
      </div>
    )
  }
  if (phase === 'error') {
    // pdf.js 无法加载时回退浏览器原生查看器。
    return (
      <embed
        className="artifacts-pdf"
        src={'/flyout-sidebar/media?path=' + encodeURIComponent(path)}
        type="application/pdf"
        title={path}
      />
    )
  }

  const disabled = pageCount <= 0
  return (
    <div className="artifacts-pdfview">
      <div className="artifacts-pdfview-bar">
        <button type="button" className="artifacts-pdfview-btn" title={t('zoomOut')} disabled={disabled} onClick={() => zoomBy(0.8)}>
          −
        </button>
        <span className="artifacts-pdfview-zoom">{Math.round(zoom * 100) + '%'}</span>
        <button type="button" className="artifacts-pdfview-btn" title={t('zoomIn')} disabled={disabled} onClick={() => zoomBy(1.25)}>
          ＋
        </button>
        <span className="artifacts-pdfview-spacer" />
        <button
          type="button"
          className="artifacts-pdfview-btn"
          title={t('prevPage')}
          disabled={disabled || pageNo <= 1}
          onClick={() => goPage(pageNo - 1)}
        >
          ‹
        </button>
        <span className="artifacts-pdfview-page">{pageNo + ' / ' + pageCount}</span>
        <button
          type="button"
          className="artifacts-pdfview-btn"
          title={t('nextPage')}
          disabled={disabled || pageNo >= pageCount}
          onClick={() => goPage(pageNo + 1)}
        >
          ›
        </button>
      </div>
      <div className="artifacts-pdfview-scroll" ref={scrollRef}>
        <canvas ref={canvasRef} className="artifacts-pdfview-canvas" />
      </div>
    </div>
  )
}

/** 统一 git diff 渲染：meta/hunk/+/- 行着色，等宽可滚动 */
export function GitDiffView({ diff }: { diff?: string }): ReactElement {
  const text = String(diff || '')
  if (!text) return <div className="artifacts-hint">{t('noChangesHead')}</div>
  const lines = text.replace(/\n$/, '').split('\n')
  const rows = lines.map((line, i) => {
    let cls = 'gd-line'
    if (line.startsWith('@@')) cls += ' gd-hunk'
    else if (line.startsWith('+') && !line.startsWith('+++')) cls += ' gd-add'
    else if (line.startsWith('-') && !line.startsWith('---')) cls += ' gd-del'
    else if (
      line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') ||
      line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') ||
      line.startsWith('new mode') || line.startsWith('rename ') || line.startsWith('similarity ') ||
      line.startsWith('copy ') || line.startsWith('Binary files') || line.startsWith('\\')
    ) {
      cls += ' gd-meta'
    }
    return (
      <div key={i} className={cls}>
        {line}
      </div>
    )
  })
  return <div className="artifacts-gitdiff">{rows}</div>
}

export function renderPreview(p: PreviewTab): ReactElement {
  if (p.loading) return <div className="artifacts-hint">{t('loading')}</div>
  if (p.ok === false) return <div className="artifacts-error">{p.error || t('readFailed')}</div>
  if (p.git) {
    return (
      <div className="artifacts-preview-body">
        <GitDiffView diff={p.diff as string | undefined} />
      </div>
    )
  }
  const type = p.type || extType(p.path)
  let view: ReactNode
  if (type === 'image') {
    view = (
      <img
        className="artifacts-img"
        src={'/flyout-sidebar/media?path=' + encodeURIComponent(p.path || '')}
        alt={p.path || ''}
      />
    )
  } else if (type === 'html') {
    view = (
      <iframe className="artifacts-iframe" sandbox="allow-scripts" srcDoc={p.content || ''} title={p.path || ''} />
    )
  } else if (type === 'pdf') {
    view = <PdfView path={p.path || ''} />
  } else if (type === 'markdown') {
    view = <div className="artifacts-markdown" dangerouslySetInnerHTML={{ __html: mdToHtml(p.content || '') }} />
  } else {
    view = (
      <Fragment>
        <CodeView code={p.content} path={p.path} />
        {p.truncated ? <div className="artifacts-diff-label">{t('truncated')}</div> : null}
      </Fragment>
    )
  }
  // 编辑型 diff 片段（write/edit 记录）前置显示；git diff 走上面的 GitDiffView。
  const diffBlock = p.diff && typeof p.diff === 'object' ? renderDiff(p.diff) : null
  return (
    <div className="artifacts-preview-body">
      {diffBlock}
      {view}
    </div>
  )
}
