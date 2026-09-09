/**
 * 可弹出侧边栏 · Flyout Sidebar — Client 入口（浏览器侧）
 *
 * 经 DSH 的 window.__ModuleLoader__ 注册：factory(require) 在运行时拿到
 * React（bundle 内不 import react），然后返回 { inject, apply } 供宿主调用。
 */
import type * as ReactNS from 'react'
import { h, initReact } from './jsx'
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
        settingsStore.load()

        // DSH Settings → Plugins → Plugin configuration 卡片：
        // 通过 settingsScope 服务绑定 namespace，在 settings.plugin.item slot
        // 注册卡片。settingsScope 不可用时（老版本宿主）不注册，无卡片。
        ctx.inject(['settingsScope'], (sctx: ClientContext) => {
          const binder = sctx.get<SettingsScopeBinder>('settingsScope')
          if (!binder) return
          const scope = binder.bind({ namespace: SETTINGS_NAMESPACE })
          const scopedSlots = sctx.get<Slots>('slots')
          if (!scopedSlots) return

          // 订阅 settings scope 变更：用户在卡片里改值后，面板下次打开
          // /flyout-sidebar/config 即反映最新值。
          sctx.effect(() => scope.subscribe(() => settingsStore.load()), 'flyout: settings scope')

          // 卡片注入的 hooks：快照读取 + 字段写入（classic JSX 不能用泛型箭头，
          // 包装为普通函数后传入）。
          const useSettingsSnapshot = (selector: (s: { status: string; value: unknown; writable: boolean }) => unknown) => {
            const snap = scope.getSnapshot()
            return selector(snap)
          }
          const setField = (field: string, value: unknown) => {
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
