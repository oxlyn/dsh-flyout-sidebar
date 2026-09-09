/**
 * 可弹出侧边栏 · Flyout Sidebar — Client 入口（浏览器侧）
 *
 * 经 DSH 的 window.__ModuleLoader__ 注册：factory(require) 在运行时拿到
 * React（bundle 内不 import react），然后返回 { inject, apply } 供宿主调用。
 */
import type * as ReactNS from 'react'
import { h, initReact, React } from './jsx'
import { initClient, type ClientContext } from './runtime'
import { insertStyles } from './styles'
import { ArtifactsPanel, CornerButton, SettingsCard } from './components'
import { settingsStore } from './store'

declare global {
  interface Window {
    __ModuleLoader__: {
      load(definition: {
        id: string
        factory: (require: (id: string) => unknown) => unknown
      }): void
    }
  }
}

interface SlotDefinition {
  name: string
  id: string
  order: number
  label: string
}

interface SettingsSlotDefinition {
  name: string
  key: string
  locale?: string
  inject?: () => Record<string, unknown>
}

interface SettingsScope {
  getSnapshot(): { status: string; value: unknown; writable: boolean }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

interface SettingsScopeBinder {
  bind(spec: { namespace: string }): SettingsScope
}

interface Slots {
  register(definition: SlotDefinition | SettingsSlotDefinition, component: unknown): unknown
  inject(slot: string, factory: () => unknown): void
}

const SETTINGS_NAMESPACE = 'dsh-flyout-sidebar'

window.__ModuleLoader__.load({
  id: 'dsh-flyout-sidebar',
  factory: (require) => {
    initReact(require('react'))

    return {
      inject: ['timer'],
      apply(ctx: ClientContext): void {
        initClient(ctx)

        const slots = ctx.get<Slots>('slots')
        if (slots === undefined) return

        // 与原版一致：slots 不可用时整体不生效，也不注入孤儿样式表。
        insertStyles()

        slots.inject('shell.overlay', () =>
          slots.register(
            { name: 'shell.overlay', id: 'artifacts-sidebar-trigger', order: 40, label: 'Artifacts' },
            CornerButton,
          ),
        )

        slots.inject('shell.overlay', () =>
          slots.register(
            { name: 'shell.overlay', id: 'artifacts-sidebar-panel', order: 50, label: 'Artifacts Panel' },
            () => <ArtifactsPanel />,
          ),
        )

        // 插件配置改由 DSH 插件管理维护：拉取宿主侧 Config，供面板使用。
        // 每次面板摊开（ArtifactsPanel 打开时）会重新拉取，热重载后即生效。
        // 首次加载同步一次 defaultOpen：页面打开瞬间应用用户的展开偏好。
        settingsStore.load({ syncDefaultOpen: true })

        // DSH Settings → Plugins → Plugin configuration 卡片：
        // 通过 settingsScope 服务绑定 namespace，在 settings.plugin.item slot
        // 注册卡片。settingsScope 不可用时（老版本宿主）不注册，无卡片。
        ctx.inject(['settingsScope'], (sctx: ClientContext) => {
          const binder = sctx.get<SettingsScopeBinder>('settingsScope')
          if (!binder) return
          const scope = binder.bind({ namespace: SETTINGS_NAMESPACE })
          const scopedSlots = sctx.get<Slots>('slots')
          if (!scopedSlots) return

          // 本地快照存储：镜像 scope 状态 + 乐观回声。useSyncExternalStore
          // 要求 getSnapshot 在无变更时返回引用稳定的值；scope.getSnapshot()
          // 不保证引用稳定，故本地缓存一份，仅在 scope 通知或乐观写入时更新。
          type Snap = { status: string; value: unknown; writable: boolean }
          let localSnap: Snap = scope.getSnapshot()
          const localListeners = new Set<() => void>()
          const publishLocal = (next: Snap): void => {
            if (next === localSnap) return
            localSnap = next
            for (const fn of localListeners) { try { fn() } catch { /* skip */ } }
          }

          // 订阅 scope 外部变更：确认或回滚乐观回声，同时刷新面板配置。
          // 用户在设置卡片切换 defaultOpen 时经此回调实时同步边栏开合。
          sctx.effect(() => scope.subscribe(() => {
            publishLocal(scope.getSnapshot())
            settingsStore.load({ syncDefaultOpen: true })
          }), 'flyout: settings scope')

          // 卡片注入的 hooks：响应式快照读取 + 乐观字段写入。
          const useSettingsSnapshot = <T,>(selector: (s: Snap) => T): T =>
            React.useSyncExternalStore(
              (cb: () => void) => {
                localListeners.add(cb)
                return () => { localListeners.delete(cb) }
              },
              () => selector(localSnap),
            )
          const setField = (field: string, value: unknown) => {
            // 乐观回声：立即在本地镜像里写入新值，UI 瞬时翻转，不等 scope.set。
            const cur = localSnap
            const nextValue = (cur.value && typeof cur.value === 'object')
              ? { ...(cur.value as Record<string, unknown>), [field]: value }
              : { [field]: value }
            publishLocal({ ...cur, value: nextValue })
            // 持久化：scope.set 异步结算；失败时 scope.subscribe 回滚本地镜像。
            void scope.set(field, value)
          }

          scopedSlots.inject('settings.plugin.item', () =>
            scopedSlots.register(
              {
                name: 'settings.plugin.item',
                key: SETTINGS_NAMESPACE,
                locale: SETTINGS_NAMESPACE,
                inject: () => ({ useSettingsSnapshot, setField }),
              },
              (props: { useSettingsSnapshot?: (s: (s: { status: string; value: unknown; writable: boolean }) => unknown) => unknown; setField?: (f: string, v: unknown) => void }) =>
                h(SettingsCard, props),
            ),
          )
        })
      },
    }
  },
})
