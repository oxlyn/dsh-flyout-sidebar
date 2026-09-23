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
import { ArtifactsPanel, CornerButton } from './components'
import { FlyoutConfigPage, BUNDLE_CONFIG_KEY, SETTINGS_NAMESPACE, type ConfigFormLike } from './config'
import { settingsStore } from './store'
import { t } from '../shared/i18n.js'

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
  /** list slot：条目 id；keyed slot：改用 key */
  id?: string
  /** keyed slot 的分发键（row config 为 `<包名>#<行 id>`） */
  key?: string
  order?: number
  label?: string | (() => string)
  /** 注册方业务面工厂：返回值并入组件 props（渲染器逐次缓存） */
  inject?: () => Record<string, unknown>
}

interface Slots {
  /** 注册一个 slot 条目，返回幂等的注销函数 */
  register(definition: SlotDefinition, component: unknown): () => void
  /** 等该 slot 被宿主声明后再注册，返回幂等的注销函数 */
  inject(slot: string, factory: () => unknown): () => void
}

/** 宿主 settings 的客户端服务：按 profile 条目 id 取该条目的配置表单 */
interface ConfigFormsService {
  get(id: string): ConfigFormLike
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void
}

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

        // 插件配置页（插件页 → 本插件的详情页 → 配置表单）：新版客户端不再为
        // volatile 配置自动生成卡片，bundle 级配置由插件自行注册
        // `plugins.bundle.config`（key = 包名；宿主插件管理页把它渲染在详情页
        // 描述与行列表之间，打开插件页即见表单，仅 page 视图）。
        // 注册表在宿主 settings 服务就绪、且该 namespace（= profile 条目 id）被
        // 宿主投影出来之后才生效：插件没加载的部署上不会留下痕迹。
        ctx.inject(['configForms'], (sub) => {
          const configForms = sub.get<ConfigFormsService>('configForms')
          if (!configForms) return
          ctx.effect(
            () =>
              configForms.whileServed([SETTINGS_NAMESPACE], () =>
                slots.inject('plugins.bundle.config', () =>
                  slots.register(
                    {
                      name: 'plugins.bundle.config',
                      key: BUNDLE_CONFIG_KEY,
                      order: 40,
                      label: () => t('settingsTitle'),
                      inject: () => ({ configForm: configForms.get(SETTINGS_NAMESPACE) }),
                    },
                    FlyoutConfigPage,
                  ),
                ),
              ),
            'dsh-flyout-sidebar: config page',
          )
        })

        // 首次加载同步一次 defaultOpen：页面打开瞬间应用用户的展开偏好。
        settingsStore.load({ syncDefaultOpen: true })
      },
    }
  },
})
