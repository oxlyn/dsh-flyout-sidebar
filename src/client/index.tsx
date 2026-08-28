/**
 * 可弹出侧边栏 · Popout Sidebar — Client 入口（浏览器侧）
 *
 * 经 DSH 的 window.__ModuleLoader__ 注册：factory(require) 在运行时拿到
 * React（bundle 内不 import react），然后返回 { inject, apply } 供宿主调用。
 */
import type * as ReactNS from 'react'
import { h, initReact } from './jsx'
import { initClient, type ClientContext } from './runtime'
import { insertStyles } from './styles'
import { ArtifactsPanel, CornerButton, SettingsSection } from './components'

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

interface Slots {
  register(definition: SlotDefinition, component: unknown): unknown
  inject(slot: string, factory: () => unknown): void
}

window.__ModuleLoader__.load({
  id: 'dsh-popout-sidebar',
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

        slots.inject('settings.section', () =>
          slots.register(
            { name: 'settings.section', id: 'artifacts-sidebar', order: 90, label: 'Popout Sidebar' },
            SettingsSection,
          ),
        )
      },
    }
  },
})
