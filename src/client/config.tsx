/**
 * Client 侧：插件配置页（插件页 → 本插件的详情页 → 配置表单）。
 *
 * 新版 DSH 客户端不再为插件的 volatile 配置自动生成设置卡片：配置页必须由插件
 * 自己注册。bundle 级配置注册进 `plugins.bundle.config`（key = 包名），宿主插件
 * 管理页会把它直接渲染在本插件的详情页上、位于描述与行列表之间（仅 `page`
 * 视图）。宿主侧不需要任何注册 —— settings 服务直接投影 Loader 条目里带
 * `.volatile()` 的字段，以条目 id（= 行 id）作为 namespace，配置值经
 * `ctx.configForms.get(条目 id)` 读写（插件管理页把它作为 owner props 的 `form`
 * 传下来，注册方通过注入的表单引用拿实时快照）。
 *
 * 表单是「一页一存」：控件只改本地草稿，保存时把所有改动合成一次带 revision
 * fence 的 mutate —— 与官方伴生包的 SettingsFormModel 语义一致，这样一次保存
 * 只产生一次宿主写入，用户也能在保存前看到自己要写什么。
 */
import { Fragment, h, React } from './jsx'
import { t } from '../shared/i18n.js'
import { useLang } from './store'
import type { ReactElement } from 'react'

/** bundle config slot 的注册 key：包名（dsh-flyout-sidebar） */
export const BUNDLE_CONFIG_KEY = 'dsh-flyout-sidebar'

/** 宿主 settings 的 namespace：profile 条目 id，也就是插件行的 row id */
export const SETTINGS_NAMESPACE = 'flyout-sidebar'

/** 宿主 settings 表单的快照（只取本页读取的字段） */
export interface ConfigSnapshot {
  status?: string
  value?: Record<string, unknown> | undefined
  revision?: number | undefined
  writable?: boolean
}

/** 一次字段操作；`unset` 让字段重新继承 schema 默认值 */
export interface ConfigOp {
  op: 'set' | 'unset'
  path: readonly string[]
  value?: unknown
}

export interface ConfigFormLike {
  getSnapshot(): ConfigSnapshot
  subscribe(listener: () => void): () => void
  mutate(ops: readonly ConfigOp[], expectedRevision?: number): Promise<boolean>
}

export interface ConfigPageProps {
  /** 页面要求的视图：`summary` 是行描述缺失时的单行说明，`page` 是带保存的表单 */
  view?: 'summary' | 'page'
  /** 注册时经 inject 注入的宿主表单（实时快照与写入的唯一来源） */
  configForm?: ConfigFormLike
  /** 宿主经 owner props 传下的表单（含同样的写入口，作为 configForm 缺失时的回退） */
  form?: { state?: ConfigSnapshot; mutate?: (ops: readonly ConfigOp[], revision?: number) => Promise<boolean> }
}

interface FieldDef {
  field: string
  labelKey: string
  kind: 'toggle' | 'number'
  /** 数字字段的合法区间（与 src/index.ts 的 Config schema 对齐） */
  min: number
  max: number
}

const FIELDS: FieldDef[] = [
  { field: 'autoRefresh', labelKey: 'settingsAutoRefresh', kind: 'toggle', min: 0, max: 0 },
  { field: 'defaultOpen', labelKey: 'settingsDefaultOpen', kind: 'toggle', min: 0, max: 0 },
  { field: 'minPanelWidth', labelKey: 'settingsMinWidth', kind: 'number', min: 15, max: 60 },
  { field: 'contentFontSize', labelKey: 'settingsFontSize', kind: 'number', min: 11, max: 20 },
]

/** 宿主值 → 草稿文本：开关用 'true'/'false'，数字无值时留空（= 未覆盖） */
function seedText(spec: FieldDef, stored: unknown): string {
  if (spec.kind === 'toggle') return stored === true ? 'true' : 'false'
  return typeof stored === 'number' && Number.isFinite(stored) ? String(stored) : ''
}

function seed(values: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of FIELDS) out[spec.field] = seedText(spec, values?.[spec.field])
  return out
}

/** 草稿文本 → 数字；空文本表示恢复默认，越界或非数字视为无效（阻止保存） */
function parseNumber(spec: FieldDef, text: string): { ok: boolean; value: number | null } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return { ok: false, value: null }
  return { ok: true, value: n }
}

/** 把有改动的字段合成一次写入的操作序列；无效字段不产生操作（保存已被阻止） */
function planOps(draft: Record<string, string>, remote: Record<string, string>): ConfigOp[] {
  const ops: ConfigOp[] = []
  for (const spec of FIELDS) {
    const text = draft[spec.field] ?? ''
    if (text === (remote[spec.field] ?? '')) continue
    if (spec.kind === 'toggle') {
      ops.push({ op: 'set', path: [spec.field], value: text === 'true' })
      continue
    }
    const parsed = parseNumber(spec, text)
    if (!parsed.ok) continue
    ops.push(
      parsed.value === null
        ? { op: 'unset', path: [spec.field] }
        : { op: 'set', path: [spec.field], value: parsed.value },
    )
  }
  return ops
}

interface ToggleRowProps {
  label: string
  value: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}

function ToggleRow(props: ToggleRowProps): ReactElement {
  return (
    <Fragment>
      <span className="fs-settings-label">{props.label}</span>
      <button
        type="button"
        className="fs-settings-toggle"
        data-on={props.value ? 'true' : 'false'}
        disabled={props.disabled}
        aria-pressed={props.value}
        aria-label={props.label}
        onClick={() => { if (!props.disabled) props.onToggle(!props.value) }}
      />
    </Fragment>
  )
}

interface NumberRowProps {
  label: string
  text: string
  min: number
  max: number
  invalid: boolean
  disabled: boolean
  onEdit: (text: string) => void
}

function NumberRow(props: NumberRowProps): ReactElement {
  return (
    <Fragment>
      <span className="fs-settings-label">{props.label}</span>
      <input
        type="number"
        className="fs-settings-input"
        value={props.text}
        min={props.min}
        max={props.max}
        disabled={props.disabled}
        aria-label={props.label}
        aria-invalid={props.invalid}
        data-invalid={props.invalid ? 'true' : 'false'}
        onChange={(e) => props.onEdit(e.currentTarget.value)}
      />
    </Fragment>
  )
}

/**
 * 订阅宿主表单的实时快照：写入被接受后宿主镜像会折叠出新快照，本控件据此
 * 重新播种草稿（插件管理页是否跟着重渲染与本页无关）。
 */
function useConfigSnapshot(form: ConfigFormLike | undefined, fallback: ConfigSnapshot | undefined): ConfigSnapshot | undefined {
  const [snap, setSnap] = React.useState<ConfigSnapshot | undefined>(() => (form ? form.getSnapshot() : fallback))
  React.useEffect(() => {
    if (!form) return
    setSnap(form.getSnapshot())
    return form.subscribe(() => setSnap(form.getSnapshot()))
  }, [form])
  return form ? snap : fallback
}

export function FlyoutConfigPage(props: ConfigPageProps): ReactElement | null {
  useLang()
  const form = props.configForm
  const snap = useConfigSnapshot(form, props.form?.state)
  const values = snap?.value
  const remote = React.useMemo(() => seed(values), [snap])
  const [staged, setStaged] = React.useState<{ revision: number | undefined; text: Record<string, string> }>(
    () => ({ revision: snap?.revision, text: {} }),
  )
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  // 宿主快照换了一版（保存被接受 / 别处改动）即丢弃旧草稿：草稿始终相对同一
  // 个 revision，保存时的 fence 与屏幕上看到的值必然一致。
  const edits = staged.revision === snap?.revision ? staged.text : {}

  // bundle.config 契约仅渲染 page；summary 分支为行级配置（row.config）场景保留
  if (props.view === 'summary') return <>{t('settingsDesc')}</>
  if (snap === undefined || snap.status === 'unavailable') {
    return <p className="fs-settings-note">{t('settingsUnavailable')}</p>
  }

  const draft: Record<string, string> = { ...remote, ...edits }
  const textOf = (field: string): string => draft[field] ?? ''
  const dirty = FIELDS.some((spec) => textOf(spec.field) !== (remote[spec.field] ?? ''))
  const invalid = FIELDS.some((spec) => spec.kind === 'number' && !parseNumber(spec, textOf(spec.field)).ok)
  const disabled = snap.status !== 'ready' || snap.writable === false || saving
  const mutate = form?.mutate ?? props.form?.mutate

  const stage = (field: string, text: string): void => {
    setFailed(false)
    setStaged({ revision: snap.revision, text: { ...edits, [field]: text } })
  }

  const save = (): void => {
    if (!mutate || !dirty || invalid || saving) return
    setSaving(true)
    setFailed(false)
    mutate(planOps(draft, remote), snap.revision)
      .then((ok) => {
        setSaving(false)
        if (ok) return
        // 宿主拒绝（并发写入 / 校验失败）：保留草稿供用户修正
        setFailed(true)
      })
      .catch(() => {
        setSaving(false)
        setFailed(true)
      })
  }

  return (
    <div className="fs-settings-form">
      {snap.writable === false ? <p className="fs-settings-note">{t('settingsReadonly')}</p> : null}
      {FIELDS.map((spec) => (
        <div className="fs-settings-row" key={spec.field}>
          {spec.kind === 'toggle'
            ? (
              <ToggleRow
                label={t(spec.labelKey)}
                value={textOf(spec.field) === 'true'}
                disabled={disabled}
                onToggle={(next) => stage(spec.field, next ? 'true' : 'false')}
              />
            )
            : (
              <NumberRow
                label={t(spec.labelKey)}
                text={textOf(spec.field)}
                min={spec.min}
                max={spec.max}
                invalid={!parseNumber(spec, textOf(spec.field)).ok}
                disabled={disabled}
                onEdit={(text) => stage(spec.field, text)}
              />
            )}
        </div>
      ))}
      <div className="fs-settings-actions">
        <button
          type="button"
          className="fs-settings-save"
          disabled={disabled || !dirty || invalid}
          onClick={save}
        >
          {saving ? t('settingsSaving') : t('settingsSave')}
        </button>
        {invalid ? <span className="fs-settings-status">{t('settingsInvalidNumber')}</span> : null}
        {!invalid && failed ? <span className="fs-settings-status">{t('settingsSaveFailed')}</span> : null}
      </div>
    </div>
  )
}